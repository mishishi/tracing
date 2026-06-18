"""Analytics endpoints: /costs, /errors, /latency-heatmap, /percentiles, /metrics."""

from collections import defaultdict

from fastapi import APIRouter, Query
from fastapi.responses import PlainTextResponse

from ..store import (
    get_error_types,
    get_wasteful_traces,
    get_agent_flow,
    get_model_sankey,
    get_costs, get_error_stats, get_latency_heatmap,
    get_percentiles, get_percentiles_trend, get_token_heatmap, get_call_trend,
    get_tool_rank, get_agent_role_dist, get_duration_histogram, get_error_trend,
)
from .sse import sse_queues

router = APIRouter(tags=["analytics"])


@router.get("/costs")
async def costs(project: str = Query(default="")):
    return get_costs(project=project)


@router.get("/errors")
async def errors(
    project: str = Query(default=""),
    limit: int = Query(default=20, ge=1, le=100),
):
    return get_error_stats(project=project, days=limit)  # days param reused for limit


@router.get("/latency-heatmap")
async def latency_heatmap(
    project: str = Query(default=""),
    days: int = Query(default=7, ge=1, le=90),
):
    return get_latency_heatmap(project=project, days=days)


@router.get("/percentiles-trend")
async def percentiles_trend(
    project: str = Query(default=""),
    days: int = Query(default=30, ge=1, le=365),
):
    return get_percentiles_trend(project=project, days=days)


@router.get("/percentiles")
async def percentiles(
    project: str = Query(default=""),
):
    return get_percentiles(project=project)


@router.get("/token-heatmap")
async def token_heatmap(
    project: str = Query(default=""),
    days: int = Query(default=0, ge=0, le=366),
    year: int = Query(default=0, ge=2024, le=2100),
):
    """Token consumption heatmap: daily token counts.
    If year is set, returns Jan 1 to Dec 31 (or today if current year).
    If days is set, returns last N days."""
    return get_token_heatmap(project=project, days=days, year=year)


@router.get("/call-trend")
async def call_trend(
    project: str = Query(default=""),
    days: int = Query(default=30, ge=1, le=365),
):
    """Daily call count trend by kind."""
    return get_call_trend(project=project, days=days)



@router.get("/tool-rank")
async def tool_rank(
    project: str = Query(default=""),
    days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=20, ge=1, le=100),
):
    """Tool call ranking by frequency."""
    return get_tool_rank(project=project, days=days, limit=limit)


@router.get("/agent-role-dist")
async def agent_role_dist(
    project: str = Query(default=""),
    days: int = Query(default=30, ge=1, le=365),
):
    """Agent role distribution."""
    return get_agent_role_dist(project=project, days=days)


@router.get("/duration-histogram")
async def duration_histogram(
    project: str = Query(default=""),
    days: int = Query(default=30, ge=1, le=365),
):
    """Duration distribution histogram by kind."""
    return get_duration_histogram(project=project, days=days)


@router.get("/error-trend")
async def error_trend(
    project: str = Query(default=""),
    days: int = Query(default=30, ge=1, le=365),
):
    """Daily error rate trend."""
    return get_error_trend(project=project, days=days)




@router.get("/errors/by-type")
async def error_by_type(
    project: str = Query(default=""),
    days: int = Query(default=30, ge=1, le=365),
):
    """Error classification by type."""
    return get_error_types(project=project, days=days)


@router.get("/traces/wasteful")
async def wasteful_traces(
    project: str = Query(default=""),
    days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=20, ge=1, le=100),
):
    """Token-wasteful traces."""
    return get_wasteful_traces(project=project, days=days, limit=limit)


@router.get("/agent-flow")
async def agent_flow(
    project: str = Query(default=""),
    days: int = Query(default=30, ge=1, le=365),
):
    """Agent call chain flow."""
    return get_agent_flow(project=project, days=days)


@router.get("/model-sankey")
async def model_sankey(
    project: str = Query(default=""),
    days: int = Query(default=30, ge=1, le=365),
):
    """Model distribution Sankey data."""
    return get_model_sankey(project=project, days=days)
@router.get("/metrics")
async def prometheus_metrics():
    """Prometheus-compatible metrics endpoint."""
    from ..store import _conn as _db_conn
    import sqlite3

    db = _db_conn()
    db.row_factory = sqlite3.Row

    lines: list[str] = []

    # Span counts by project and kind
    rows = db.execute(
        "SELECT project, kind, COUNT(*) as cnt FROM spans GROUP BY project, kind"
    ).fetchall()
    for r in rows:
        lines.append(
            f'tracing_spans_ingested_total{{project="{r["project"]}",kind="{r["kind"]}"}} {r["cnt"]}'
        )

    # Error counts
    rows = db.execute(
        "SELECT project, kind, COUNT(*) as cnt FROM spans WHERE status='error' GROUP BY project, kind"
    ).fetchall()
    for r in rows:
        lines.append(
            f'tracing_spans_errors_total{{project="{r["project"]}",kind="{r["kind"]}"}} {r["cnt"]}'
        )

    # Duration percentiles by kind (using shared _compute_percentiles)
    from ..store import _compute_percentiles
    kind_durations = defaultdict(list)
    rows = db.execute(
        "SELECT kind, duration_ms FROM spans WHERE duration_ms > 0"
    ).fetchall()
    for r in rows:
        kind_durations[r["kind"]].append(r["duration_ms"])

    for kind, durations in kind_durations.items():
        if not durations:
            continue
        stats = _compute_percentiles(durations)
        for quantile in ["p50", "p95", "p99"]:
            lines.append(
                f'tracing_span_duration_ms{{kind="{kind}",quantile="{quantile}"}} {stats[quantile]:.1f}'
            )

    lines.append(f"tracing_active_sse_connections {len(sse_queues)}")

    help_text = (
        "# HELP tracing_spans_ingested_total Total spans ingested\n"
        "# TYPE tracing_spans_ingested_total counter\n"
        "# HELP tracing_spans_errors_total Total spans with errors\n"
        "# TYPE tracing_spans_errors_total counter\n"
        "# HELP tracing_span_duration_ms Span duration in milliseconds\n"
        "# TYPE tracing_span_duration_ms gauge\n"
        "# HELP tracing_active_sse_connections Active SSE connections\n"
        "# TYPE tracing_active_sse_connections gauge\n"
    )

    return PlainTextResponse(
        help_text + "\n".join(lines) + "\n",
        media_type="text/plain; version=0.0.4",
    )
