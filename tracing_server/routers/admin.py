"""Admin endpoints for span management."""

from fastapi import APIRouter, Query, Depends
from fastapi.responses import JSONResponse

from ..auth import require_api_key
from ..store import delete_spans, cleanup_old_traces, cleanup_expired_shares

router = APIRouter(tags=["admin"])


@router.delete("/admin/spans")
async def admin_delete_spans(
    project: str = Query(default=""),
    _auth=Depends(require_api_key),
):
    if not project:
        return JSONResponse(
            status_code=400,
            content={"error": "?project= is required"},
        )
    count = delete_spans(project=project)
    return {"status": "ok", "deleted": count}


@router.post("/admin/cleanup")
async def admin_cleanup(
    retention_days: int = Query(default=30, ge=1, le=365),
    _auth=Depends(require_api_key),
):
    deleted_traces = cleanup_old_traces(retention_days=retention_days)
    deleted_shares = cleanup_expired_shares()
    return {
        "status": "ok",
        "deleted_traces": deleted_traces,
        "deleted_shares": deleted_shares,
    }
