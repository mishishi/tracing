"""Tracer — context manager for manual span instrumentation."""

from __future__ import annotations

import contextlib
from typing import Generator

from .span import Span, SpanKind, SpanStatus
from .collector import send, _PROJECT


@contextlib.contextmanager
def trace(
    name: str,
    kind: SpanKind | str = SpanKind.FLOW,
    metadata: dict | None = None,
    tags: dict | None = None,
    project: str = "",
) -> Generator[Span, None, None]:
    """Manually instrument a code block with auto-start/finish.

    Usage:
        with tracing_sdk.trace("query-database", kind="llm_call") as span:
            span.metadata["model"] = "gpt-4"
            result = await db.query(...)
            span.metadata["result_count"] = len(result)

    The span is automatically started on enter and finished on exit.
    If an exception is raised, the span is marked as ERROR.
    """
    if isinstance(kind, str):
        try:
            kind = SpanKind(kind)
        except ValueError:
            kind = SpanKind.FLOW

    span = Span(name=name, kind=kind)

    if metadata:
        span.metadata.update(metadata)
    if tags:
        span.tags.update(tags)
    if project:
        span.project = project
    elif _PROJECT and _PROJECT != "default":
        span.project = _PROJECT

    span.start()

    try:
        yield span
        span.finish(SpanStatus.OK)
    except Exception:
        span.finish(SpanStatus.ERROR)
        raise
    finally:
        send(span)
