"""Tracing server — FastAPI REST API for span ingestion and query."""

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from .store import insert_spans, get_trace, list_traces, get_stats

app = FastAPI(title="Tracing Server", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/spans")
async def ingest_spans(spans: list[dict]):
    """Ingest a batch of spans from the SDK collector."""
    insert_spans(spans)
    return {"ok": True, "count": len(spans)}


@app.get("/traces/{trace_id}")
async def trace_detail(trace_id: str):
    """Get full trace with all spans."""
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
    """List recent traces."""
    return list_traces(project=project, limit=limit, offset=offset)


@app.get("/stats")
async def stats(project: str = Query(default="")):
    """Aggregated stats across all traces."""
    return get_stats(project=project)



@app.get("/")
async def dashboard():
    """Built-in tracing dashboard."""
    from fastapi.responses import HTMLResponse
    from .store import get_stats, list_traces
    stats = get_stats()
    traces = list_traces(limit=50)

    rows = ""
    for t in traces["traces"]:
        sid = t.get("session_id", t["trace_id"][:12])
        rows += f'<div class="trace"><div><div class="id">{sid}</div><div class="meta">{t["span_count"]} spans</div></div></div>'

    if not rows:
        rows = '<div class="empty">暂无追踪数据</div>'

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
<div class="card"><div class="l">Spans</div><div class="v">{stats["total_spans"]}</div></div>
<div class="card"><div class="l">Tokens</div><div class="v tk">{stats["total_tokens"]:,}</div></div>
<div class="card"><div class="l">LLM</div><div class="v ll">{next((k["c"] for k in stats["by_kind"] if k["kind"]=="llm_call"),0)}</div></div>
<div class="card"><div class="l">Tool</div><div class="v tl">{next((k["c"] for k in stats["by_kind"] if k["kind"]=="tool_call"),0)}</div></div>
</div>
<div class="traces"><h2>Recent Traces</h2>{rows}</div>
<script>setTimeout(()=>location.reload(),5000)</script>
</body></html>"""
    return HTMLResponse(html)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "tracing-server v0.1.0"}
