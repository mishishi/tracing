"""API key authentication dependency for write endpoints.

If TRACING_API_KEY is empty, all requests are allowed.
Otherwise the key is checked via X-API-Key header or api_key query param.
"""

import os

from fastapi import HTTPException, Request

API_KEY = os.environ.get("TRACING_API_KEY", "").strip()


async def require_api_key(request: Request):
    """FastAPI dependency: require API key for write endpoints."""
    if not API_KEY:
        return
    key = request.headers.get("X-API-Key", "")
    if key == API_KEY:
        return
    key = request.query_params.get("api_key", "")
    if key == API_KEY:
        return
    raise HTTPException(status_code=401, detail="Missing or invalid API key")


def get_api_key() -> str:
    """Return the configured API key (empty string = auth disabled)."""
    return API_KEY
