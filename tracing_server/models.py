"""Pydantic models for span validation and API types."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class SpanIngest(BaseModel):
    """A single span submitted to the ingest endpoint."""
    id: str
    trace_id: str
    parent_id: str = ""
    session_id: str = ""
    project: str = "default"
    name: str = ""
    kind: str
    status: str = "running"
    start_time: str
    end_time: str = ""
    duration_ms: float = 0
    metadata: dict = Field(default_factory=dict)
    error: str = ""
    tags: dict = Field(default_factory=dict)


class SpanOut(BaseModel):
    """A span returned from query endpoints."""
    id: str
    trace_id: str
    parent_id: str = ""
    session_id: str = ""
    project: str = "default"
    name: str = ""
    kind: str
    status: str = "running"
    start_time: str
    end_time: str = ""
    duration_ms: float = 0
    metadata: dict = Field(default_factory=dict)
    error: str = ""
    tags: dict = Field(default_factory=dict)


class TraceItem(BaseModel):
    """A trace summary in list view."""
    trace_id: str
    session_id: str = ""
    project: str = "default"
    start_time: str = ""
    end_time: str = ""
    span_count: int = 0
    total_duration_ms: float = 0


class TraceList(BaseModel):
    """Response for GET /traces."""
    traces: list[TraceItem]


class TraceDetail(BaseModel):
    """Response for GET /traces/{trace_id}."""
    trace_id: str
    spans: list[SpanOut] = Field(default_factory=list)
    span_count: int = 0


class KindStat(BaseModel):
    """Stats per span kind."""
    kind: str
    c: int = 0
    total_ms: float = 0


class StatsResponse(BaseModel):
    """Response for GET /stats."""
    total_spans: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_tokens: int = 0
    by_kind: list[KindStat] = Field(default_factory=list)
    by_project: list[dict] = Field(default_factory=list)


class CostEntry(BaseModel):
    """Per-model cost breakdown."""
    input_tokens: float = 0
    output_tokens: float = 0
    cost: float = 0
    calls: int = 0


class CostResponse(BaseModel):
    """Response for GET /costs."""
    total_cost: float = 0
    by_model: dict[str, CostEntry] = Field(default_factory=dict)
    by_project: dict[str, dict] = Field(default_factory=dict)


class ShareRequest(BaseModel):
    """Request body for POST /share."""
    trace_id: str
    project: str = "default"
    view_state: dict = Field(default_factory=dict)
    expires_in_hours: int = 24


class ShareResponse(BaseModel):
    """Response for POST /share."""
    share_id: str
    trace_id: str
    project: str
    expires_at: str
    url: str


class ErrorStatsResponse(BaseModel):
    """Response for GET /errors."""
    total_errors: int = 0
    error_rate: float = 0
    by_kind: list[dict] = Field(default_factory=list)
    recent: list[dict] = Field(default_factory=list)


class LatencyBucket(BaseModel):
    """A single cell in latency heatmap."""
    hour: str
    count: int = 0
    avg_ms: float = 0
    p50: float = 0
    p95: float = 0
    p99: float = 0


class LatencyHeatmapResponse(BaseModel):
    """Response for GET /latency-heatmap."""
    buckets: list[LatencyBucket] = Field(default_factory=list)


class PercentileDataPoint(BaseModel):
    """A single day in percentile trend."""
    day: str
    p50: float = 0
    p95: float = 0
    p99: float = 0
    avg: float = 0
    count: int = 0


class PercentilesTrendResponse(BaseModel):
    """Response for GET /percentiles-trend."""
    agent: list[PercentileDataPoint] = Field(default_factory=list)
    llm_call: list[PercentileDataPoint] = Field(default_factory=list)
    tool_call: list[PercentileDataPoint] = Field(default_factory=list)


class SearchResult(BaseModel):
    """A single search result."""
    id: str
    trace_id: str
    name: str
    kind: str
    status: str
    project: str
    error: str = ""
    start_time: str = ""
    tags: dict = Field(default_factory=dict)


class SearchResponse(BaseModel):
    """Response for GET /search."""
    results: list[SearchResult] = Field(default_factory=list)
    total: int = 0
