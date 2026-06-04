"""Storage backend protocol — enables pluggable storage backends.

The default implementation is SQLite (store.py).
To add a new backend (e.g. PostgreSQL, ClickHouse), implement this protocol.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class StorageBackend(Protocol):
    """Protocol for span storage backends.

    All methods are synchronous by design — async callers should use
    run_in_executor or similar wrappers.
    """

    def insert_spans(self, spans: list[dict]) -> None:
        """Insert or replace spans. Each span dict must have:
        id, trace_id, parent_id, session_id, project, name, kind, status,
        start_time, end_time, duration_ms, metadata, error, tags.
        """
        ...

    def get_trace(self, trace_id: str) -> dict:
        """Return {trace_id, spans: [...], span_count: int} or {error, spans:[]}."""
        ...

    def list_traces(
        self, project: str = "", limit: int = 50, offset: int = 0
    ) -> dict:
        """Return {traces: [{trace_id, session_id, project, start_time,
        end_time, span_count, total_duration_ms}]}."""
        ...

    def get_stats(self, project: str = "") -> dict:
        """Return aggregate stats: total_spans, by_kind, tokens, by_project."""
        ...

    def get_project_list(self) -> list[str]:
        """Return list of distinct project names."""
        ...

    def get_costs(self, project: str = "") -> dict:
        """Return {total_cost, by_model, by_project}."""
        ...

    def get_error_stats(self, project: str = "", limit: int = 20) -> dict:
        """Return {total_errors, error_rate, by_kind, recent}."""
        ...

    def get_latency_heatmap(self, project: str = "", days: int = 7) -> dict:
        """Return {buckets: [{hour, count, avg_ms, p50, p95, p99}]}."""
        ...

    def get_percentiles(self, project: str = "") -> dict:
        """Return {llm_call, tool_call, agent: {p50, p95, p99, avg, count}}."""
        ...

    def get_percentiles_trend(
        self, project: str = "", days: int = 30
    ) -> dict:
        """Return {llm_call, tool_call, agent: [{day, p50, p95, p99, avg, count}]}."""
        ...

    def search_spans(
        self, query: str, project: str = "", limit: int = 50
    ) -> list[dict]:
        """Full-text search across span name, error, metadata, tags."""
        ...

    def delete_spans(self, project: str) -> int:
        """Delete all spans for a project. Returns count deleted."""
        ...

    def cleanup_old_traces(self, retention_days: int = 30) -> int:
        """Delete traces older than retention_days. Returns count deleted."""
        ...

    # ── Share (optional) ──

    def create_share(
        self, trace_id: str, project: str, view_state: dict, expires_hours: int
    ) -> dict | None:
        """Create a share link. Returns share dict or None."""
        ...

    def get_share(self, share_id: str) -> dict | None:
        """Look up a share by ID. Returns share dict or None."""
        ...

    def cleanup_expired_shares(self) -> int:
        """Remove expired shares. Returns count deleted."""
        ...
