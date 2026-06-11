"""Tracing server - FastAPI REST API for span ingestion and query."""

import os
import asyncio

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from .routers import register_routers, shutdown_sse
from .store import init_db, cleanup_old_traces, cleanup_expired_shares, list_traces
from .store import get_stats as _get_stats

logger = __import__("logging").getLogger("tracing.server")

RETENTION_DAYS = int(os.environ.get("TRACING_RETENTION_DAYS", "30"))

app = FastAPI(title="Tracing Server", version="0.3.0")

# ── CORS ──────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register routers ──────────────────────────


import time
from collections import defaultdict

# ── Rate limiter ──────────────────────────────

_ingest_window: dict[str, list[float]] = defaultdict(list)
_MAX_INGEST_PER_SECOND = 100

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path == "/spans" and request.method == "POST":
        client = request.client.host if request.client else "unknown"
        now = time.time()
        _ingest_window[client] = [t for t in _ingest_window[client] if t > now - 1]
        if len(_ingest_window[client]) >= _MAX_INGEST_PER_SECOND:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=429, content={"error": "rate limit exceeded", "retry_after": 1})
        _ingest_window[client].append(now)
    return await call_next(request)



register_routers(app)


# ── Lifecycle ─────────────────────────────────

@app.on_event("startup")
async def startup():
    init_db()
    asyncio.create_task(_auto_cleanup_loop())


@app.on_event("shutdown")
async def shutdown():
    await shutdown_sse()


# ── Auto-cleanup background task ─────────────

async def _auto_cleanup_loop():
    """Periodically clean up old traces and expired shares."""
    while True:
        await asyncio.sleep(3600)  # Every hour
        try:
            deleted = cleanup_old_traces(retention_days=RETENTION_DAYS)
            if deleted:
                logger.info(
                    "Auto-cleanup: removed %d old traces (retention=%dd)",
                    deleted, RETENTION_DAYS,
                )
            cleanup_expired_shares()
        except Exception as e:
            logger.warning("Auto-cleanup failed: %s", e)


# ── Built-in dashboard ────────────────────────

@app.get("/")
async def dashboard():
    """Simple HTML dashboard for direct browser access."""
    stats_data = _get_stats()
    traces_data = list_traces(limit=50)

    rows = ""
    for t in traces_data["traces"]:
        sid = t.get("session_id", t["trace_id"][:12])
        rows += (
            '<div class="trace"><div><div class="id">%s</div>'
            '<div class="meta">%s spans</div></div></div>'
        ) % (sid, t["span_count"])

    if not rows:
        rows = '<div class="empty">暂无追踪数据</div>'

    html = """<!DOCTYPE html>
<html lang="zh"><head><meta charset="UTF-8"><title>Tracing</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,sans-serif;background:#f8fafc;color:#1e293b;padding:24px}
h1{font-size:20px;margin-bottom:4px}
.sub{color:#94a3b8;font-size:13px;margin-bottom:20px}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center}
.card .l{font-size:10px;text-transform:uppercase;color:#94a3b8}
.card .v{font-size:28px;font-weight:700;margin-top:4px}
.card .v.tk{color:#4f46e5}
.card .v.ll{color:#d97706}
.card .v.tl{color:#059669}
.traces{background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}
.traces h2{font-size:13px;color:#94a3b8;text-transform:uppercase;padding:12px 16px;border-bottom:1px solid #e2e8f0}
.trace{padding:10px 16px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between}
.trace:hover{background:#f8fafc}
.trace .id{font-size:13px;font-weight:600}
.trace .meta{font-size:11px;color:#94a3b8}
.empty{text-align:center;padding:40px;color:#94a3b8;font-size:13px}
</style></head><body>
<h1>Tracing Dashboard</h1>
<p class="sub">Agent observability</p>
<div class="cards">
<div class="card"><div class="l">Spans</div><div class="v">%s</div></div>
<div class="card"><div class="l">Tokens</div><div class="v tk">%s</div></div>
<div class="card"><div class="l">LLM</div><div class="v ll">%s</div></div>
<div class="card"><div class="l">Tool</div><div class="v tl">%s</div></div>
</div>
<div class="traces"><h2>Recent Traces</h2>%s</div>
<script>setTimeout(()=>location.reload(),5000)</script>
</body></html>""" % (
        stats_data["total_spans"],
        f'{stats_data["total_tokens"]:,}',
        next((k["c"] for k in stats_data["by_kind"] if k["kind"] == "llm_call"), 0),
        next((k["c"] for k in stats_data["by_kind"] if k["kind"] == "tool_call"), 0),
        rows,
    )
    return HTMLResponse(html)
