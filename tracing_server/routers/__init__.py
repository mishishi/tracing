"""Tracing server routers package."""

from .sse import router as sse_router, broadcast_sse, shutdown_sse
from .ingest import router as ingest_router
from .query import router as query_router
from .analytics import router as analytics_router
from .admin import router as admin_router
from .share import router as share_router


def register_routers(app):
    """Register all routers on the FastAPI app."""
    app.include_router(ingest_router)
    app.include_router(sse_router)
    app.include_router(query_router)
    app.include_router(analytics_router)
    app.include_router(admin_router)
    app.include_router(share_router)
