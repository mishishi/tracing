"""Tracing server - FastAPI REST API for span ingestion and query."""

import os

# ── API Key Auth ──────────────────────────────
API_KEY = os.environ.get("TRACING_API_KEY", "").strip()

async def _require_api_key(request: Request):
    """FastAPI dependency: require API key for write endpoints. If no key
    is configured (empty string), all requests are allowed."""
    if not API_KEY:
        return
    key = request.headers.get("X-API-Key", "")
    if key == API_KEY:
        return
    key = request.query_params.get("api_key", "")
    if key == API_KEY:
        return
    raise HTTPException(status_code=401, detail="Missing or invalid API key")

import json
import asyncio
import time
from typing import AsyncGenerator
from collections import defaultdict

from fastapi import FastAPI, Query, Body, HTTPException, Request, Depends
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from .store import _insert_spans, get_trace, list_traces, cleanup_old_traces, get_percentiles, get_project_list, get_costs, delete_spans, get_error_stats, get_latency_heatmap, create_share, get_share, get_percentiles_trend, search_spans
from .store import get_stats as _get_stats
from .store import cleanup_expired_shares

app = FastAPI(title="Tracing Server", version="0.2.0")

logger = __import__('logging').getLogger('tracing.server')
# ── Rate Limiter (token bucket) ──────────────
RATE_LIMIT_RPS = float(os.environ.get("TRACING_RATE_LIMIT", "100"))
_rate_bucket: dict[str, list[float]] = defaultdict(list)

def _check_rate(key: str = "default") -> bool:
    """Simple sliding-window rate limiter. Returns True if allowed."""
    now = time.time()
    window = now - 1.0
    bucket = _rate_bucket[key]
    # Remove old entries
    _rate_bucket[key] = [t for t in bucket if t > window]
    if len(_rate_bucket[key]) >= RATE_LIMIT_RPS:
        return False
    _rate_bucket[key].append(now)
    return True

# ── Auto-cleanup background task ─────────────
RETENTION_DAYS = int(os.environ.get("TRACING_RETENTION_DAYS", "30"))

async def _auto_cleanup_loop():
    """Periodically clean up old traces and expired shares."""
    while True:
        await asyncio.sleep(3600)  # Every hour
        try:
            deleted = cleanup_old_traces(retention_days=RETENTION_DAYS)
            if deleted:
                logger.info(f"Auto-cleanup: removed {deleted} old traces (retention={RETENTION_DAYS}d)")
            cleanup_expired_shares()
        except Exception as e:
            logger.warning(f"Auto-cleanup failed: {e}")



app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def start_cleanup():
    asyncio.create_task(_auto_cleanup_loop())

# ── SSE ─────────────────────────────────────────

sse_queues: list[asyncio.Queue] = []


async def sse_generator() -> AsyncGenerator[str, None]:
    queue: asyncio.Queue = asyncio.Queue(maxsize=50)
    sse_queues.append(queue)
    try:
        yield "event: connected\ndata: {}\n\n"
        while True:
            try:
                data = await asyncio.wait_for(queue.get(), timeout=10)
                yield f"event: new_trace\ndata: {data}\n\n"
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"
    except asyncio.CancelledError:
        pass
    finally:
        sse_queues.remove(queue)


@app.get("/events")
async def sse_events():
    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def broadcast_sse(trace_id: str, session_id: str, project: str):
    data = json.dumps({
        "trace_id": trace_id,
        "session_id": session_id,
        "project": project,
    })
    for q in sse_queues:
        try:
            q.put_nowait(data)
        except asyncio.QueueFull:
            pass



@app.on_event("shutdown")
async def shutdown():
    """Cancel all SSE connections on shutdown for instant exit."""
    for q in sse_queues:
        try:
            q.put_nowait(None)
        except Exception:
            pass
    sse_queues.clear()

# ── REST ────────────────────────────────────────

@app.post("/spans")
async def ingest_spans(spans: list[dict], _auth=Depends(_require_api_key)):
    if not _check_rate("ingest"):
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "rate limit exceeded"}, status_code=429)
    _insert_spans(spans)
    trace_ids: set[str] = set()
    for s in spans:
        tid = s.get("trace_id", "")
        if tid and tid not in trace_ids:
            trace_ids.add(tid)
            await broadcast_sse(
                trace_id=tid,
                session_id=s.get("session_id", ""),
                project=s.get("project", "default"),
            )
    return {"ok": True, "count": len(spans)}


@app.get("/traces/{trace_id}")
async def trace_detail(trace_id: str):
    result = get_trace(trace_id)
    if "error" in result:
        from fastapi.responses import JSONResponse
        return JSONResponse(result, status_code=404)
    return result


@app.get("/traces")
async def trace_list(
    project: str = Query(default=""),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
):
    return list_traces(project=project, limit=limit, offset=offset)


@app.get("/stats")
async def stats(project: str = Query(default="")):
    return _get_stats(project=project)


@app.get("/search")
async def search(
    q: str = Query(default="", min_length=2),
    project: str = Query(default=""),
    limit: int = Query(default=50, le=100),
):
    if len(q) < 2:
        return {"results": [], "query": q}
    return {"results": search_spans(query=q, project=project, limit=limit), "query": q}

@app.get("/health")
async def health():
    return {"status": "ok", "service": "tracing-server v0.2.0"}






@app.get("/costs")
async def costs(
    project: str = Query(default=""),
    days: int = Query(default=30, le=365),
):
    return get_costs(project=project, days=days)



@app.get("/errors")
async def errors(
    project: str = Query(default=""),
    days: int = Query(default=30, le=365),
):
    return get_error_stats(project=project, days=days)

@app.get("/latency-heatmap")
async def latency_heatmap(
    project: str = Query(default=""),
    days: int = Query(default=7, le=90),
):
    return get_latency_heatmap(project=project, days=days)

@app.get("/percentiles-trend")
async def percentiles_trend(
    project: str = Query(default=""),
    days: int = Query(default=30, le=90),
):
    return get_percentiles_trend(project=project, days=days)

@app.get("/percentiles")
async def percentiles(project: str = Query(default="")):
    return get_percentiles(project=project)


class ShareRequest(BaseModel):
    trace_id: str = ""
    project: str = ""
    view_state: dict | None = None

@app.post("/share")
async def create_share_link(body: ShareRequest):
    share_id = create_share(
        trace_id=body.trace_id,
        project=body.project,
        view_state=body.view_state,
    )
    if not share_id:
        raise HTTPException(status_code=500, detail="Failed to create share")
    return {"share_id": share_id, "url": f"/s/{share_id}"}

@app.get("/s/{share_id}")
async def get_share_link(share_id: str):
    data = get_share(share_id)
    if not data:
        raise HTTPException(status_code=404, detail="Share not found or expired")
    return data

@app.get("/projects")
async def projects():
    return {"projects": get_project_list()}




@app.delete("/admin/spans")
async def admin_delete_spans(_auth=Depends(_require_api_key),

    project: str = Query(default=""),
    before_days: int = Query(default=0, le=365),
):
    return delete_spans(project=project, before_days=before_days)

@app.post("/admin/cleanup")
async def admin_cleanup(retention_days: int = Query(default=30, le=365), _auth=Depends(_require_api_key)):
    deleted = cleanup_old_traces(retention_days=retention_days)
    return {"ok": True, "deleted_traces": deleted, "retention_days": retention_days}

# ── Prometheus Metrics ─────────────────────────

@app.get("/metrics")
async def prometheus_metrics():
    """Prometheus-compatible metrics endpoint."""
    import sqlite3
    from collections import defaultdict
    from .store import _conn

    lines = []

    with _conn() as db:
        db.row_factory = sqlite3.Row

        rows = db.execute(
            "SELECT project, kind, COUNT(*) as cnt FROM spans GROUP BY project, kind"
        ).fetchall()
        for r in rows:
            lines.append(
                f'tracing_spans_ingested_total{{project="{r["project"]}",kind="{r["kind"]}"}} {r["cnt"]}'
            )

        rows = db.execute(
            "SELECT project, kind, COUNT(*) as cnt FROM spans WHERE status='error' GROUP BY project, kind"
        ).fetchall()
        for r in rows:
            lines.append(
                f'tracing_spans_errors_total{{project="{r["project"]}",kind="{r["kind"]}"}} {r["cnt"]}'
            )

        kind_durations = defaultdict(list)
        rows = db.execute(
            "SELECT kind, duration_ms FROM spans WHERE duration_ms > 0"
        ).fetchall()
        for r in rows:
            kind_durations[r["kind"]].append(r["duration_ms"])

        for kind, durations in kind_durations.items():
            if not durations:
                continue
            durations.sort()
            n = len(durations)
            p50 = durations[int(n * 0.50)] if n > 0 else 0
            p95 = durations[min(int(n * 0.95), n - 1)] if n > 0 else 0
            p99 = durations[min(int(n * 0.99), n - 1)] if n > 0 else 0
            lines.append(f'tracing_span_duration_ms{{kind="{kind}",quantile="p50"}} {p50:.1f}')
            lines.append(f'tracing_span_duration_ms{{kind="{kind}",quantile="p95"}} {p95:.1f}')
            lines.append(f'tracing_span_duration_ms{{kind="{kind}",quantile="p99"}} {p99:.1f}')

    lines.append(f"tracing_active_sse_connections {len(sse_queues)}")

    help_text = (
        "# HELP tracing_spans_ingested_total Total spans ingested\n"
        "# TYPE tracing_spans_ingested_total counter\n"
        "# HELP tracing_spans_errors_total Total spans with errors\n"
        "# TYPE tracing_spans_errors_total counter\n"
        "# HELP tracing_span_duration_ms Span duration in milliseconds\n"
        "# TYPE tracing_span_duration_ms gauge\n"
        "# HELP tracing_active_sse_connections Active SSE connections\n"
        "# TYPE tracing_active_sse_connections gauge\n"
    )

    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(help_text + "\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")

# ── Built-in dashboard ──────────────────────────

@app.get("/")
async def dashboard():
    from fastapi.responses import HTMLResponse
    stats_data = _get_stats()
    traces_data = list_traces(limit=50)

    rows = ""
    for t in traces_data["traces"]:
        sid = t.get("session_id", t["trace_id"][:12])
        rows += f'<div class="trace"><div><div class="id">{sid}</div><div class="meta">{t["span_count"]} spans</div></div></div>'

    if not rows:
        rows = '<div class="empty">\u6682\u65e0\u8ffd\u8e2a\u6570\u636e</div>'

    html = f"""<!DOCTYPE html>
<html lang="zh"><head><meta charset="UTF-8"><title>Tracing</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:system-ui,sans-serif;background:#f8fafc;color:#1e293b;padding:24px}}
h1{{font-size:20px;margin-bottom:4px}}
.sub{{color:#94a3b8;font-size:13px;margin-bottom:20px}}
.cards{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}}
.card{{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center}}
.card .l{{font-size:10px;text-transform:uppercase;color:#94a3b8}}
.card .v{{font-size:28px;font-weight:700;margin-top:4px}}
.card .v.tk{{color:#4f46e5}}
.card .v.ll{{color:#d97706}}
.card .v.tl{{color:#059669}}
.traces{{background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}}
.traces h2{{font-size:13px;color:#94a3b8;text-transform:uppercase;padding:12px 16px;border-bottom:1px solid #e2e8f0}}
.trace{{padding:10px 16px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between}}
.trace:hover{{background:#f8fafc}}
.trace .id{{font-size:13px;font-weight:600}}
.trace .meta{{font-size:11px;color:#94a3b8}}
.empty{{text-align:center;padding:40px;color:#94a3b8;font-size:13px}}
</style></head><body>
<h1>Tracing Dashboard</h1>
<p class="sub">Agent observability</p>
<div class="cards">
<div class="card"><div class="l">Spans</div><div class="v">{stats_data["total_spans"]}</div></div>
<div class="card"><div class="l">Tokens</div><div class="v tk">{stats_data["total_tokens"]:,}</div></div>
<div class="card"><div class="l">LLM</div><div class="v ll">{next((k["c"] for k in stats_data["by_kind"] if k["kind"]=="llm_call"),0)}</div></div>
<div class="card"><div class="l">Tool</div><div class="v tl">{next((k["c"] for k in stats_data["by_kind"] if k["kind"]=="tool_call"),0)}</div></div>
</div>
<div class="traces"><h2>Recent Traces</h2>{rows}</div>
<script>setTimeout(()=>location.reload(),5000)</script>
</body></html>"""
    return HTMLResponse(html)
