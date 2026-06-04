"""Span collector — buffers spans and sends to tracing-server via HTTP."""

import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
import urllib.request
import urllib.error
import atexit
from typing import Optional
import logging

logger = logging.getLogger("tracing.collector")
from .span import Span, SpanStatus


def _check_health(endpoint: str, timeout: float = 2.0) -> bool:
    """Quick health check before enabling tracing."""
    try:
        req = urllib.request.Request(f"{endpoint}/health", method="GET")
        urllib.request.urlopen(req, timeout=timeout)
        return True
    except Exception:
        return False

_HEALTH_CHECKED = False

_ENDPOINT = os.environ.get("TRACING_ENDPOINT", "http://localhost:9200")
_BUFFER: list[dict] = []
_LOCK = threading.Lock()
_FLUSH_INTERVAL = float(os.environ.get("TRACING_FLUSH_INTERVAL", "2.0"))
_SESSION_ID: Optional[str] = None
_PROJECT: str = os.environ.get("TRACING_PROJECT", "default")
_SAMPLE_RATE: float = float(os.environ.get("TRACING_SAMPLE_RATE", "1.0"))
_DROPPED: int = 0
_ENABLED: bool = False  # lazy init after health check
_daemon_started = False
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="tracing-flush")


def _flush():
    """Send buffered spans to server synchronously."""
    global _BUFFER
    with _LOCK:
        if not _BUFFER:
            return
        batch = _BUFFER[:]
        _BUFFER = []

    try:
        data = json.dumps(batch).encode("utf-8")
        req = urllib.request.Request(
            f"{_ENDPOINT}/spans",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        logger.warning(f"Flush failed ({len(batch)} spans): {e}")
        # Re-queue data so it's not lost
        with _LOCK:
            _BUFFER = batch + _BUFFER



def _flush_loop():
    """Background daemon that flushes periodically."""
    while True:
        time.sleep(_FLUSH_INTERVAL)
        _flush()



def _lazy_enable():
    """Enable tracing after health check passes."""
    global _ENABLED, _HEALTH_CHECKED
    if _HEALTH_CHECKED:
        return _ENABLED
    _HEALTH_CHECKED = True
    if _check_health(_ENDPOINT):
        _ENABLED = True
        logger.info(f"Tracing enabled -> {_ENDPOINT}")
    else:
        logger.warning(f"Tracing server unreachable at {_ENDPOINT}, tracing disabled")
    return _ENABLED


def configure(endpoint: str = None, project: str = None, sample_rate: float = None):
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


def _ensure_daemon():
    global _daemon_started
    if _daemon_started or not _lazy_enable():
        return
    _daemon_started = True
    t = threading.Thread(target=_flush_loop, daemon=True)
    t.start()




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
    if not _lazy_enable():
        return

    if _SAMPLE_RATE < 1.0:
        import random
        if random.random() > _SAMPLE_RATE:
            global _DROPPED
            _DROPPED += 1
            if _DROPPED % 100 == 1:
                logger.debug(f"Sampling: dropped {_DROPPED} spans (rate={_SAMPLE_RATE})")
            return

    # Auto-generate IDs if not set
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
        _BUFFER.append(span.to_dict())

    _ensure_daemon()


def flush_sync():
    """Flush all pending spans synchronously. Call on shutdown."""
    _flush()
    
atexit.register(flush_sync)


def get_stats() -> dict:
    """Get collector statistics (dropped spans, buffer size)."""
    global _DROPPED
    with _LOCK:
        buf_size = len(_BUFFER)
    return {"buffer_size": buf_size, "dropped_spans": _DROPPED, "sample_rate": _SAMPLE_RATE, "enabled": _ENABLED}
