"""Comprehensive pytest-based API tests for tracing_server — covers ALL endpoints."""

import os
import sys
import json
import datetime
import tempfile

db_path = os.path.join(tempfile.gettempdir(), "test_tracing_api_pytest.db")

import pytest

# ── Fixtures ─────────────────────────────────────────────

@pytest.fixture(scope="module")
def setup():
    """Module-scoped fixture: creates a fresh DB, returns the test client."""
    # Clean any leftover DB files
    for p in [db_path, db_path + "-wal", db_path + "-shm"]:
        try: os.remove(p)
        except: pass

    os.environ["TRACING_DB_PATH"] = db_path
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

    from tracing_server.store import init_db
    init_db()

    from fastapi.testclient import TestClient
    from tracing_server.app import app

    client = TestClient(app)

    yield client

    # Teardown: close client + remove DB
    try:
        from tracing_server.routers import shutdown_sse
        import asyncio
        asyncio.run(shutdown_sse())
    except Exception:
        pass
    try:
        client.close()
    except Exception:
        pass
    for p in [db_path, db_path + "-wal", db_path + "-shm"]:
        try: os.remove(p)
        except: pass


@pytest.fixture
def spans(setup):
    """Seed test data and return the client."""
    client = setup
    today = datetime.date.today().isoformat()
    data = [
        {"id":"sp1","trace_id":"tr1","parent_id":"","session_id":"s1","project":"test-api",
         "name":"llm-gpt4","kind":"llm_call","status":"ok",
         "start_time":f"{today}T00:00:00Z","end_time":f"{today}T00:00:01Z",
         "duration_ms":1000,"metadata":{"model":"gpt-4","input_tokens":100,"output_tokens":50},"error":"","tags":{}},
        {"id":"sp2","trace_id":"tr1","parent_id":"sp1","session_id":"s1","project":"test-api",
         "name":"tool-search","kind":"tool_call","status":"error",
         "start_time":f"{today}T00:00:02Z","end_time":f"{today}T00:00:03Z",
         "duration_ms":1000,"metadata":{"tool_name":"search"},"error":"timeout","tags":{}},
        {"id":"sp3","trace_id":"tr2","parent_id":"","session_id":"s2","project":"test-api-2",
         "name":"agent-run","kind":"agent","status":"ok",
         "start_time":f"{today}T00:00:00Z","end_time":f"{today}T00:00:05Z",
         "duration_ms":5000,"metadata":{"agent_role":"researcher"},"error":"","tags":{}},
        {"id":"sp4","trace_id":"tr3","parent_id":"","session_id":"s3","project":"test-api",
         "name":"gpt4-v2","kind":"llm_call","status":"ok",
         "start_time":f"{today}T00:00:00Z","end_time":f"{today}T00:00:01Z",
         "duration_ms":800,"metadata":{"model":"gpt-4","input_tokens":200,"output_tokens":150},"error":"","tags":{}},
        {"id":"sp5","trace_id":"tr3","parent_id":"sp4","session_id":"s3","project":"test-api",
         "name":"tool-code","kind":"tool_call","status":"error",
         "start_time":f"{today}T00:00:02Z","end_time":f"{today}T00:00:04Z",
         "duration_ms":2000,"metadata":{"tool_name":"code_exec"},"error":"syntax_error","tags":{}},
        {"id":"sp6","trace_id":"tr3","parent_id":"","session_id":"s3","project":"test-api",
         "name":"agent-analyze","kind":"agent","status":"ok",
         "start_time":f"{today}T00:00:05Z","end_time":f"{today}T00:00:10Z",
         "duration_ms":5000,"metadata":{"agent_role":"analyst"},"error":"","tags":{}},
        {"id":"sp7","trace_id":"tr4","parent_id":"","session_id":"s4","project":"test-api",
         "name":"llm-error","kind":"llm_call","status":"error",
         "start_time":f"{today}T00:00:00Z","end_time":f"{today}T00:00:01Z",
         "duration_ms":900,"metadata":{"model":"gpt-4","error_type":"rate_limit"},"error":"rate_limit_exceeded","tags":{}},
        {"id":"sp8","trace_id":"tr5","parent_id":"","session_id":"s5","project":"test-api",
         "name":"wasteful-llm","kind":"llm_call","status":"ok",
         "start_time":f"{today}T00:00:00Z","end_time":f"{today}T00:00:02Z",
         "duration_ms":2000,"metadata":{"model":"gpt-4","input_tokens":9000,"output_tokens":10},"error":"","tags":{}},
        {"id":"sp9","trace_id":"tr6","parent_id":"","session_id":"s6","project":"test-api",
         "name":"fast-llm","kind":"llm_call","status":"ok",
         "start_time":f"{today}T00:00:00Z","end_time":f"{today}T00:00:00Z",
         "duration_ms":50,"metadata":{"model":"gpt-4o-mini","input_tokens":50,"output_tokens":25},"error":"","tags":{}},
        {"id":"sp10","trace_id":"tr5","parent_id":"","session_id":"s5","project":"test-api",
         "name":"wasteful-llm-2","kind":"llm_call","status":"ok",
         "start_time":f"{today}T00:00:03Z","end_time":f"{today}T00:00:05Z",
         "duration_ms":2000,"metadata":{"model":"gpt-4","input_tokens":10000,"output_tokens":5},"error":"","tags":{}},
    ]
    r = client.post("/spans", json=data)
    assert r.status_code == 200
    assert r.json()["count"] == len(data)
    return client


# ── 1. Health ────────────────────────────────────────────

class TestHealth:
    def test_health(self, setup):
        r = setup.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


# ── 2. Ingest ────────────────────────────────────────────

class TestIngest:
    def test_ingest_empty_returns_400(self, setup):
        r = setup.post("/spans", json=[])
        assert r.status_code == 400
        assert "error" in r.json()


# ── 3. Query ─────────────────────────────────────────────

class TestQueryEndpoints:
    def test_list_traces(self, spans):
        r = spans.get("/traces")
        assert r.status_code == 200
        assert len(r.json()["traces"]) >= 6

    def test_list_traces_filter_project(self, spans):
        r = spans.get("/traces?project=test-api")
        for t in r.json()["traces"]:
            assert t["project"] == "test-api"

    def test_list_traces_limit(self, spans):
        r = spans.get("/traces?limit=2")
        assert len(r.json()["traces"]) == 2

    def test_list_traces_offset(self, spans):
        all_t = spans.get("/traces?limit=50").json()["traces"]
        n = len(all_t)
        r = spans.get(f"/traces?limit=2&offset={max(0, n-1)}")
        assert len(r.json()["traces"]) == 1

    def test_list_traces_filter_status(self, spans):
        r = spans.get("/traces?status=error")
        for t in r.json()["traces"]:
            assert t["status"] == "error"

    def test_list_traces_filter_kind(self, spans):
        r = spans.get("/traces?kind=agent")
        for t in r.json()["traces"]:
            assert t["kind"] == "agent"

    def test_list_traces_filter_status_and_kind(self, spans):
        r = spans.get("/traces?status=ok&kind=llm_call")
        for t in r.json()["traces"]:
            assert t["status"] == "ok"
            assert t["kind"] == "llm_call"

    def test_trace_detail_found(self, spans):
        r = spans.get("/traces/tr1")
        assert r.status_code == 200
        assert r.json()["trace_id"] == "tr1"

    def test_trace_detail_not_found(self, spans):
        r = spans.get("/traces/nonexistent")
        assert r.status_code == 404

    def test_stats(self, spans):
        r = spans.get("/stats")
        data = r.json()
        assert data["total_spans"] >= 10
        assert "total_tokens" in data

    def test_stats_filter_project(self, spans):
        r = spans.get("/stats?project=test-api-2")
        assert r.json()["total_spans"] >= 1

    def test_projects(self, spans):
        r = spans.get("/projects")
        projects = r.json()["projects"]
        assert "test-api" in projects
        assert "test-api-2" in projects

    def test_search_found(self, spans):
        r = spans.get("/search?q=gpt")
        assert len(r.json()["results"]) >= 1

    def test_search_not_found(self, spans):
        r = spans.get("/search?q=nonexistent999")
        assert r.json()["total"] == 0

    def test_search_empty_query(self, spans):
        r = spans.get("/search?q=")
        assert r.json()["total"] == 0

    def test_sessions(self, spans):
        r = spans.get("/sessions")
        sessions = r.json()["sessions"]
        assert len(sessions) >= 6

    def test_session_detail_found(self, spans):
        r = spans.get("/sessions/s3")
        data = r.json()
        assert data["session_id"] == "s3"
        assert data["trace_count"] >= 1

    def test_session_detail_not_found(self, spans):
        r = spans.get("/sessions/nonexistent_session")
        assert r.status_code == 404


# ── 4. Span Annotation ──────────────────────────────────

class TestSpanAnnotation:
    def test_annotate_tags(self, spans):
        r = spans.patch("/spans/sp1", json={"tags": {"reviewed": True}})
        assert r.status_code == 200

    def test_annotate_notes(self, spans):
        r = spans.patch("/spans/sp1", json={"notes": "test note"})
        assert r.status_code == 200

    def test_annotate_missing_fields(self, spans):
        r = spans.patch("/spans/sp1", json={})
        assert r.status_code == 400

    def test_annotate_not_found(self, spans):
        r = spans.patch("/spans/nonexistent", json={"tags": {"x": "y"}})
        assert r.status_code == 404


# ── 5. Trace Compare ────────────────────────────────────

class TestTraceCompare:
    def test_compare_found(self, spans):
        r = spans.get("/traces/compare?trace_a=tr1&trace_b=tr2")
        data = r.json()
        assert data["trace_a"]["trace_id"] == "tr1"
        assert data["trace_b"]["trace_id"] == "tr2"

    def test_compare_not_found(self, spans):
        r = spans.get("/traces/compare?trace_a=nonexistent&trace_b=tr2")
        assert r.status_code == 404


# ── 6. Analytics ────────────────────────────────────────

class TestAnalyticsEndpoints:
    def test_costs(self, spans):
        r = spans.get("/costs")
        assert "total_cost" in r.json()

    def test_errors(self, spans):
        r = spans.get("/errors")
        data = r.json()
        assert data["total_errors"] >= 2

    def test_latency_heatmap(self, spans):
        r = spans.get("/latency-heatmap?days=7")
        assert "buckets" in r.json()

    def test_percentiles_trend(self, spans):
        r = spans.get("/percentiles-trend?days=30")
        for k in ("agent", "llm_call", "tool_call"):
            assert k in r.json()

    def test_percentiles(self, spans):
        r = spans.get("/percentiles")
        assert "llm_call" in r.json()

    def test_token_heatmap(self, spans):
        r = spans.get("/token-heatmap?days=7")
        assert r.status_code == 200

    def test_call_trend(self, spans):
        r = spans.get("/call-trend?days=30")
        assert "daily" in r.json()

    def test_tool_rank(self, spans):
        r = spans.get("/tool-rank?days=30")
        assert len(r.json()["tools"]) > 0

    def test_agent_role_dist(self, spans):
        r = spans.get("/agent-role-dist?days=30")
        assert len(r.json()) > 0

    def test_duration_histogram(self, spans):
        r = spans.get("/duration-histogram?days=30")
        assert len(r.json()["buckets"]) > 0

    def test_error_trend(self, spans):
        r = spans.get("/error-trend?days=30")
        assert "daily" in r.json()

    def test_errors_by_type(self, spans):
        r = spans.get("/errors/by-type?days=30")
        assert len(r.json()) > 0

    def test_wasteful_traces_dedup(self, spans):
        """Verify wasteful-traces deduplicates same trace_id."""
        r = spans.get("/wasteful-traces?days=30&limit=50")
        trace_ids = [t["trace_id"] for t in r.json()["traces"]]
        assert trace_ids.count("tr5") == 1, f"tr5 appears {trace_ids.count('tr5')}x"

    def test_agent_flow(self, spans):
        r = spans.get("/agent-flow?days=30")
        assert isinstance(r.json(), dict)

    def test_model_sankey(self, spans):
        r = spans.get("/model-sankey?days=30")
        assert isinstance(r.json(), dict)


# ── 7. Prometheus Metrics ───────────────────────────────

class TestPrometheusMetrics:
    def test_metrics(self, spans):
        r = spans.get("/metrics")
        text = r.text
        assert "tracing_spans_total" in text
        assert "tracing_errors_total" in text
        assert "tracing_traces_total" in text


# ── 8. Share Endpoints ──────────────────────────────────

class TestShareEndpoints:
    _share_id = None

    def test_create_share(self, spans):
        r = spans.post("/share", json={"trace_id": "tr1", "project": "test-api", "view_state": {}})
        data = r.json()
        assert "share_id" in data
        TestShareEndpoints._share_id = data["share_id"]

    def test_create_share_missing_trace_id(self, spans):
        r = spans.post("/share", json={"project": "test-api"})
        assert r.status_code == 400

    def test_create_share_not_found(self, spans):
        r = spans.post("/share", json={"trace_id": "nonexistent"})
        assert r.status_code == 404

    def test_get_share_found(self, spans):
        sid = TestShareEndpoints._share_id
        if not sid:
            pytest.skip("no share_id")
        r = spans.get(f"/s/{sid}")
        assert r.json()["trace_id"] == "tr1"

    def test_get_share_not_found(self, spans):
        r = spans.get("/s/nonexistent_share_id")
        assert r.status_code == 404


# ── 9. Admin Endpoints ──────────────────────────────────

class TestAdminEndpoints:
    def test_delete_no_project(self, spans):
        r = spans.delete("/admin/spans")
        assert r.status_code == 400

    def test_delete_spans(self, spans):
        r = spans.delete("/admin/spans?project=test-api-2")
        assert r.json()["deleted"] >= 1

    def test_cleanup(self, spans):
        r = spans.post("/admin/cleanup?retention_days=30")
        assert r.json()["status"] == "ok"


# ── 10. Dashboard ───────────────────────────────────────

class TestDashboardHTML:
    def test_dashboard(self, spans):
        r = spans.get("/")
        assert "<html" in r.text
        assert "Tracing" in r.text or "Dashboard" in r.text


# ── 11. SSE (lightweight check only) ────────────────────

class TestSSE:
    def test_sse_reachable(self, spans):
        """Lightweight SSE reachability check."""
        r = spans.get("/events")
        assert r.status_code == 200
        # Just verify the endpoint returns the right content type
        assert "text/event-stream" in r.headers.get("content-type", "")
