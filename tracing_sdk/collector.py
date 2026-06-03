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

_ENDPOINT = os.environ.get("TRACING_ENDPOINT", "")
_BUFFER: list[dict] = []
_LOCK = threading.Lock()
_FLUSH_INTERVAL = float(os.environ.get("TRACING_FLUSH_INTERVAL", "2.0"))
_SESSION_ID: Optional[str] = None
_PROJECT: str = os.environ.get("TRACING_PROJECT", "default")
_ENABLED: bool = bool(_ENDPOINT)
_daemon_started = False
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="tracing-flush")


def _flush():
    """Send buffered spans to server."""
    global _BUFFER
    with _LOCK:
        if not _BUFFER:
            return
        batch = _BUFFER[:]
        _BUFFER = []

    def _send():
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

    _executor.submit(_send)


def _flush_loop():
    """Background daemon that flushes periodically."""
    while True:
        time.sleep(_FLUSH_INTERVAL)
        _flush()


def _ensure_daemon():
    global _daemon_started
    if _daemon_started or not _ENABLED:
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
    _ensure_daemon()


def send(span: Span):
    """Enqueue a span for async delivery."""
    if not _ENABLED:
        return

    if _SESSION_ID and not span.session_id:
        span.session_id = _SESSION_ID
    if _SESSION_ID and not span.trace_id:
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
