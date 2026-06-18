"""SSE endpoints for real-time trace streaming."""

import json
import asyncio
from typing import AsyncGenerator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter(tags=["sse"])

sse_queues: list[asyncio.Queue] = []

_SHUTDOWN_SENTINEL = object()


async def sse_generator() -> AsyncGenerator[str, None]:
    queue: asyncio.Queue = asyncio.Queue(maxsize=50)
    sse_queues.append(queue)
    try:
        yield "event: connected\ndata: {}\n\n"
        while True:
            try:
                data = await asyncio.wait_for(queue.get(), timeout=10)
                if data is _SHUTDOWN_SENTINEL:
                    break
                yield f"event: new_trace\ndata: {json.dumps(data)}\n\n"
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"
    except (asyncio.CancelledError, GeneratorExit, RuntimeError, Exception):
        pass
    finally:
        if queue in sse_queues:
            sse_queues.remove(queue)


@router.get("/events")
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
    data = {"trace_id": trace_id, "session_id": session_id, "project": project}
    for q in sse_queues:
        try:
            q.put_nowait(data)
        except asyncio.QueueFull:
            pass


async def shutdown_sse():
    queues = list(sse_queues)
    for q in queues:
        try:
            q.put_nowait(_SHUTDOWN_SENTINEL)
        except Exception:
            pass
    sse_queues.clear()
    # Small delay to let generators unwind before event loop shutdown
    await asyncio.sleep(0.01)
