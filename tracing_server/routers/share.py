"""Share endpoints for trace sharing via URL."""

from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

from ..store import create_share, get_share

router = APIRouter(tags=["share"])


@router.post("/share")
async def create_share_link(body: dict = Body(...)):
    trace_id = body.get("trace_id", "")
    if not trace_id:
        return JSONResponse(
            status_code=400,
            content={"error": "trace_id is required"},
        )
    project = body.get("project", "default")
    view_state = body.get("view_state", {})
    expires_in_hours = body.get("expires_in_hours", 24)

    share_id = create_share(
        trace_id=trace_id,
        project=project,
        view_state=view_state,
    )
    if not share_id:
        return JSONResponse(
            status_code=404,
            content={"error": "trace not found"},
        )
    return {
        "share_id": share_id,
        "trace_id": trace_id,
        "project": project,
        "url": f"/s/{share_id}",
    }


@router.get("/s/{share_id}")
async def get_share_link(share_id: str):
    share = get_share(share_id)
    if not share:
        return JSONResponse(
            status_code=404,
            content={"error": "share not found or expired"},
        )
    return share
