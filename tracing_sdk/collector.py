"""Span collector — buffers spans and sends to tracing-server via HTTP.

Features:
- Background daemon thread with configurable flush interval
- Exponential backoff retry (max 3 attempts)
- Max buffer size to prevent memory leaks
- Graceful shutdown via context manager or shutdown()
- Health check before enabling
"""

import json
import os
import threading
import time
import urllib.request
import urllib.error
import atexit
import logging
from typing import Optional

logger = logging.getLogger("tracing.collector")
from .span import Span, SpanStatus

# ── Constants ──
_MAX_RETRIES = 3
_RETRY_BASE_DELAY = 1.0  # seconds
_MAX_BACKOFF = 30.0
_MAX_BUFFER_SIZE = 10_000

# ── State ──
_ENDPOINT = os.environ.get("TRACING_ENDPOINT", "http://localhost:9200")
_API_KEY = os.environ.get("TRACING_API_KEY", "")
_BUFFER: list[dict] = []
_LOCK = threading.Lock()
_FLUSH_INTERVAL = float(os.environ.get("TRACING_FLUSH_INTERVAL", "2.0"))
_SESSION_ID: Optional[str] = None
_PROJECT: str = os.environ.get("TRACING_PROJECT", "default")
_SAMPLE_RATE: float = float(os.environ.get("TRACING_SAMPLE_RATE", "1.0"))
_DROPPED: int = 0
_ENABLED: bool = False
_HEALTH_CHECKED = False
_daemon_started = False
_shutdown_event = threading.Event()
_daemon_thread: Optional[threading.Thread] = None


def _check_health(endpoint: str, timeout: float = 2.0) -> bool:
    """Quick health check before enabling tracing."""
    try:
        req = urllib.request.Request(f"{endpoint}/health", method="GET")
        urllib.request.urlopen(req, timeout=timeout)
        return True
    except Exception:
        return False


def _flush():
    """Send buffered spans to server with retry + backoff."""
    global _BUFFER

    with _LOCK:
        if not _BUFFER:
            return
        batch = _BUFFER[:]
        _BUFFER = []

    data = json.dumps(batch).encode("utf-8")
    url = f"{_ENDPOINT}/spans"
    if _API_KEY:
        url += f"?api_key={_API_KEY}"

    last_error = None
    for attempt in range(_MAX_RETRIES):
        try:
            req = urllib.request.Request(
                url,
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            if _API_KEY:
                req.add_header("X-API-Key", _API_KEY)
            urllib.request.urlopen(req, timeout=10)
            logger.debug("Flushed %d spans", len(batch))
            return  # Success
        except Exception as e:
            last_error = e
            if attempt < _MAX_RETRIES - 1:
                delay = min(_RETRY_BASE_DELAY * (2 ** attempt), _MAX_BACKOFF)
                logger.debug("Flush attempt %d failed, retrying in %.1fs: %s", attempt + 1, delay, e)
                time.sleep(delay)

    # All retries exhausted — re-queue with cap
    logger.warning("Flush failed after %d retries (%d spans): %s", _MAX_RETRIES, len(batch), last_error)
    with _LOCK:
        if len(_BUFFER) + len(batch) <= _MAX_BUFFER_SIZE:
            _BUFFER = batch + _BUFFER
        else:
            global _DROPPED
            _DROPPED += len(batch)
            logger.warning("Buffer full, dropped %d spans", len(batch))


def _flush_loop():
    """Background daemon that flushes periodically. Exits on shutdown_event."""
    while not _shutdown_event.wait(_FLUSH_INTERVAL):
        _flush()
    # Final flush on shutdown
    _flush()


def _lazy_enable():
    """Enable tracing after health check passes."""
    global _ENABLED, _HEALTH_CHECKED
    if _HEALTH_CHECKED:
        return _ENABLED
    _HEALTH_CHECKED = True
    if _check_health(_ENDPOINT):
        _ENABLED = True
        logger.info("Tracing enabled -> %s", _ENDPOINT)
    else:
        logger.warning("Tracing server unreachable at %s, tracing disabled", _ENDPOINT)
    return _ENABLED


def _ensure_daemon():
    global _daemon_started, _daemon_thread
    if _daemon_started or not _lazy_enable():
        return
    _daemon_started = True
    _shutdown_event.clear()
    _daemon_thread = threading.Thread(target=_flush_loop, daemon=True, name="tracing-flush")
    _daemon_thread.start()


# ── Public API ──

def configure(endpoint: Optional[str] = None, project: Optional[str] = None, sample_rate: Optional[float] = None):
    """Programmatic configuration (alternative to env vars)."""
    global _ENDPOINT, _PROJECT, _ENABLED, _HEALTH_CHECKED
    if endpoint:
        _ENDPOINT = endpoint
    if project:
        _PROJECT = project
    if sample_rate is not None:
        global _SAMPLE_RATE
        _SAMPLE_RATE = max(0.0, min(1.0, sample_rate))
    _ENABLED = False
    _HEALTH_CHECKED = False
    _lazy_enable()


def set_session(session_id: str, project: str = ""):
    """Set the current session/context for all subsequent spans."""
    global _SESSION_ID, _PROJECT
    _SESSION_ID = session_id
    if project:
        _PROJECT = project
    _lazy_enable()
    _ensure_daemon()


def send(span: Span):
    """Enqueue a span for async delivery. Applies sampling rate."""
    global _DROPPED

    if not _lazy_enable():
        return

    if _SAMPLE_RATE < 1.0:
        import random
        if random.random() > _SAMPLE_RATE:
            _DROPPED += 1
            if _DROPPED % 100 == 1:
                logger.debug("Sampling: dropped %d spans (rate=%.2f)", _DROPPED, _SAMPLE_RATE)
            return

    # Auto-generate IDs
    if not span.trace_id:
        import uuid
        span.trace_id = uuid.uuid4().hex[:12]
    if not span.session_id:
        span.session_id = span.trace_id
    if _SESSION_ID:
        span.session_id = _SESSION_ID
        span.trace_id = _SESSION_ID
    if not span.project:
        span.project = _PROJECT

    with _LOCK:
        if len(_BUFFER) >= _MAX_BUFFER_SIZE:
            _DROPPED += 1
            return
        _BUFFER.append(span.to_dict())

    _ensure_daemon()


def flush_sync():
    """Flush all pending spans synchronously. Call on shutdown."""
    _flush()


def shutdown():
    """Gracefully shut down the collector. Flushes pending spans and stops daemon."""
    _shutdown_event.set()
    _flush()
    if _daemon_thread and _daemon_thread.is_alive():
        _daemon_thread.join(timeout=5.0)


def get_stats() -> dict:
    """Get collector statistics."""
    global _DROPPED
    with _LOCK:
        buf_size = len(_BUFFER)
    return {
        "buffer_size": buf_size,
        "dropped_spans": _DROPPED,
        "sample_rate": _SAMPLE_RATE,
        "enabled": _ENABLED,
    }


# Auto-flush on process exit
atexit.register(flush_sync)
