"""Tracing server - FastAPI REST API for span ingestion and query."""

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import Set
import json
from .store import _insert_spans, get_trace, list_traces
from .store import get_stats as _get_stats

app = FastAPI(title="Tracing Server", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket clients
ws_clients: Set[WebSocket] = set()


async def broadcast_new_trace(trace_id: str, session_id: str, project: str, span_count: int):
    msg = json.dumps({
        "type": "new_trace",
        "trace_id": trace_id,
        "session_id": session_id,
        "project": project,
        "span_count": span_count,
    })
    dead: set[WebSocket] = set()
    for ws in ws_clients:
        try:
            await ws.send_text(msg)
        except Exception:
            dead.add(ws)
    ws_clients -= dead


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    ws_clients.add(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        ws_clients.discard(ws)


@app.post("/spans")
async def ingest_spans(spans: list[dict]):
    _insert_spans(spans)
    trace_ids: set[str] = set()
    for s in spans:
        tid = s.get("trace_id", "")
        if tid and tid not in trace_ids:
            trace_ids.add(tid)
            await broadcast_new_trace(
                trace_id=tid,
                session_id=s.get("session_id", ""),
                project=s.get("project", "default"),
                span_count=1,
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
        rows = '<div class="empty">{}</div>'.format('暂无追踪数据')

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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "tracing-server v0.2.0"}
