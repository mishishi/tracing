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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "tracing-server v0.1.0"}
