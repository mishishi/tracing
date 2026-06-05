"""Query endpoints: /traces, /stats, /search, /projects, /health."""

from fastapi import APIRouter, Query, Body

from fastapi.responses import JSONResponse
from ..store import (
    list_traces, get_trace, get_project_list, search_spans,
    update_span, get_sessions, get_session_traces,
)
from fastapi.responses import JSONResponse
from ..store import get_stats as _get_stats

router = APIRouter(tags=["query"])


@router.get("/traces")
async def trace_list(
    project: str = Query(default=""),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    return list_traces(project=project, limit=limit, offset=offset)


@router.get("/traces/{trace_id}")
async def trace_detail(trace_id: str):
    result = get_trace(trace_id)
    if "error" in result:
                return JSONResponse(status_code=404, content=result)
    return result


@router.get("/stats")
async def stats(project: str = Query(default="")):
    return _get_stats(project=project)


@router.get("/projects")
async def projects():
    return {"projects": get_project_list()}


@router.get("/search")
async def search(
    q: str = Query(default=""),
    project: str = Query(default=""),
    limit: int = Query(default=50, ge=1, le=200),
):
    if not q.strip():
        return {"results": [], "total": 0}
    results = search_spans(q.strip(), project=project, limit=limit)
    return {"results": results, "total": len(results)}



@router.patch("/spans/{span_id}")
async def annotate_span(span_id: str, body: dict = Body(...)):
    """Update span annotations: tags, notes."""
    tags = body.get("tags")
    notes = body.get("notes")
    if tags is None and notes is None:
        return JSONResponse(status_code=400, content={"error": "tags or notes required"})
    ok = update_span(span_id, tags=tags, notes=notes)
    if not ok:
        return JSONResponse(status_code=404, content={"error": "span not found"})
    return {"status": "ok"}


@router.get("/sessions")
async def session_list(
    project: str = Query(default=""),
    limit: int = Query(default=50, ge=1, le=200),
):
    return {"sessions": get_sessions(project=project, limit=limit)}


@router.get("/sessions/{session_id}")
async def session_detail(session_id: str):
    trace_ids = get_session_traces(session_id)
    if not trace_ids:
        return JSONResponse(status_code=404, content={"error": "session not found"})
    traces = []
    for tid in trace_ids:
        t = get_trace(tid)
        if "error" not in t:
            traces.append(t)
    return {
        "session_id": session_id,
        "trace_count": len(traces),
        "traces": traces,
    }


@router.get("/health")
async def health():
    return {"status": "ok"}
