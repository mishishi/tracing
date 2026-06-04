"""Query endpoints: /traces, /stats, /search, /projects, /health."""

from fastapi import APIRouter, Query

from ..store import (
    list_traces, get_trace, get_project_list, search_spans,
)
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
        from fastapi.responses import JSONResponse
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


@router.get("/health")
async def health():
    return {"status": "ok"}
