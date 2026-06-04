"""Span ingest endpoint with rate limiting."""

import os
import time
from collections import defaultdict

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from ..auth import require_api_key
from ..store import _insert_spans
from .sse import broadcast_sse

router = APIRouter(tags=["ingest"])

RATE_LIMIT_RPS = float(os.environ.get("TRACING_RATE_LIMIT", "100"))
_rate_bucket: dict[str, list[float]] = defaultdict(list)


def _check_rate(key: str = "default") -> bool:
    """Simple sliding-window rate limiter. Returns True if allowed."""
    now = time.time()
    window = now - 1.0
    bucket = _rate_bucket[key]
    _rate_bucket[key] = [t for t in bucket if t > window]
    if len(_rate_bucket[key]) >= RATE_LIMIT_RPS:
        return False
    _rate_bucket[key].append(now)
    return True


@router.post("/spans")
async def ingest_spans(spans: list[dict], _auth=Depends(require_api_key)):
    if not _check_rate("ingest"):
        return JSONResponse(
            status_code=429,
            content={"error": "rate limit exceeded", "retry_after": 1},
        )
    if not spans:
        return JSONResponse(status_code=400, content={"error": "empty payload"})

    _insert_spans(spans)

    # SSE broadcast for each unique trace
    seen = set()
    for s in spans:
        tid = s.get("trace_id", "")
        if tid and tid not in seen:
            seen.add(tid)
            await broadcast_sse(
                trace_id=tid,
                session_id=s.get("session_id", ""),
                project=s.get("project", "default"),
            )

    return {"status": "ok", "count": len(spans)}
