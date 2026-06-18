"""Comprehensive pytest-based API tests for tracing_server — covers ALL endpoints."""

import os
import sys
import json
import datetime

# Point to a temp DB before any app imports
import tempfile
db_path = os.path.join(tempfile.gettempdir(), "test_tracing_api_pytest.db")
os.environ["TRACING_DB_PATH"] = db_path
for p in [db_path, db_path + "-wal", db_path + "-shm"]:
    try: os.remove(p)
    except: pass

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tracing_server.store import init_db
init_db()

import pytest
from fastapi.testclient import TestClient
from tracing_server.app import app

client = TestClient(app)

# ── Test data ────────────────────────────────────────────
today = datetime.date.today().isoformat()

SPANS = [
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
    # Duplicate llm_call in same trace — used to test wasteful-traces dedup
    {"id":"sp10","trace_id":"tr5","parent_id":"","session_id":"s5","project":"test-api",
     "name":"wasteful-llm-2","kind":"llm_call","status":"ok",
     "start_time":f"{today}T00:00:03Z","end_time":f"{today}T00:00:05Z",
     "duration_ms":2000,"metadata":{"model":"gpt-4","input_tokens":10000,"output_tokens":5},"error":"","tags":{}},
]

SPANS_SIMPLE = [
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
]


class TestHealthAndIngest:
    """1. Health check  2. Span ingestion"""

    def test_health(self):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_ingest_spans(self):
        r = client.post("/spans", json=SPANS)
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert data["count"] == len(SPANS)

    def test_ingest_empty_returns_400(self):
        r = client.post("/spans", json=[])
        assert r.status_code == 400
        assert "error" in r.json()


class TestQueryEndpoints:
    """3. Query endpoints: /traces, /stats, /projects, /search, /sessions"""

    def test_list_traces(self):
        r = client.get("/traces")
        assert r.status_code == 200
        data = r.json()
        assert "traces" in data
        assert len(data["traces"]) >= 6  # tr1 tr2 tr3 tr4 tr5 tr6

    def test_list_traces_filter_project(self):
        r = client.get("/traces?project=test-api")
        assert r.status_code == 200
        for t in r.json()["traces"]:
            assert t["project"] == "test-api"

    def test_list_traces_limit(self):
        r = client.get("/traces?limit=2")
        assert len(r.json()["traces"]) == 2

    def test_list_traces_offset(self):
        all_traces = client.get("/traces?limit=50").json()["traces"]
        r = client.get(f"/traces?limit=2&offset={len(all_traces)-1}")
        assert len(r.json()["traces"]) == 1

    def test_list_traces_filter_status(self):
        r = client.get("/traces?status=error")
        assert r.status_code == 200
        for t in r.json()["traces"]:
            assert t["status"] == "error"

    def test_list_traces_filter_kind(self):
        r = client.get("/traces?kind=agent")
        assert r.status_code == 200
        for t in r.json()["traces"]:
            assert t["kind"] == "agent"

    def test_list_traces_filter_status_and_kind(self):
        r = client.get("/traces?status=ok&kind=llm_call")
        assert r.status_code == 200
        for t in r.json()["traces"]:
            assert t["status"] == "ok"
            assert t["kind"] == "llm_call"

    def test_trace_detail_found(self):
        r = client.get("/traces/tr1")
        assert r.status_code == 200
        data = r.json()
        assert data["trace_id"] == "tr1"
        assert data["span_count"] >= 2

    def test_trace_detail_not_found(self):
        r = client.get("/traces/nonexistent")
        assert r.status_code == 404

    def test_stats(self):
        r = client.get("/stats")
        assert r.status_code == 200
        data = r.json()
        assert data["total_spans"] >= 10
        assert "total_tokens" in data
        assert "by_kind" in data
        assert "by_status" in data

    def test_stats_filter_project(self):
        r = client.get("/stats?project=test-api-2")
        assert r.json()["total_spans"] >= 1

    def test_projects(self):
        r = client.get("/projects")
        assert r.status_code == 200
        projects = r.json()["projects"]
        assert "test-api" in projects
        assert "test-api-2" in projects

    def test_search_found(self):
        r = client.get("/search?q=gpt")
        assert r.status_code == 200
        assert len(r.json()["results"]) >= 1

    def test_search_not_found(self):
        r = client.get("/search?q=nonexistent999")
        assert r.json()["total"] == 0

    def test_search_empty_query(self):
        r = client.get("/search?q=")
        assert r.json()["total"] == 0

    def test_search_with_project(self):
        r = client.get("/search?q=tool&project=test-api")
        assert r.status_code == 200
        assert len(r.json()["results"]) >= 1

    def test_sessions(self):
        r = client.get("/sessions")
        assert r.status_code == 200
        sessions = r.json()["sessions"]
        assert len(sessions) >= 6  # s1-s6

    def test_sessions_filter_project(self):
        r = client.get("/sessions?project=test-api-2")
        sessions = r.json()["sessions"]
        for s in sessions:
            assert s.get("project") == "test-api-2" or s["session_id"] == "s2"

    def test_session_detail_found(self):
        r = client.get("/sessions/s3")
        assert r.status_code == 200
        data = r.json()
        assert data["session_id"] == "s3"
        assert data["trace_count"] >= 1

    def test_session_detail_not_found(self):
        r = client.get("/sessions/nonexistent_session")
        assert r.status_code == 404


class TestSpanAnnotation:
    """PATCH /spans/{span_id}"""

    def test_annotate_span_tags(self):
        r = client.patch("/spans/sp1", json={"tags": {"reviewed": True, "priority": "high"}})
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_annotate_span_notes(self):
        r = client.patch("/spans/sp1", json={"notes": "This is a test note"})
        assert r.status_code == 200

    def test_annotate_span_missing_fields(self):
        r = client.patch("/spans/sp1", json={})
        assert r.status_code == 400

    def test_annotate_span_not_found(self):
        r = client.patch("/spans/nonexistent", json={"tags": {"x": "y"}})
        assert r.status_code == 404


class TestTraceCompare:
    """GET /traces/compare"""

    def test_compare_found(self):
        r = client.get("/traces/compare?trace_a=tr1&trace_b=tr2")
        assert r.status_code == 200
        data = r.json()
        assert data["trace_a"]["trace_id"] == "tr1"
        assert data["trace_b"]["trace_id"] == "tr2"
        assert "comparisons" in data

    def test_compare_not_found(self):
        r = client.get("/traces/compare?trace_a=nonexistent&trace_b=tr2")
        assert r.status_code == 404


class TestAnalyticsEndpoints:
    """4. Analytics endpoints: costs, errors, latency, percentiles, etc."""

    def test_costs(self):
        r = client.get("/costs")
        assert r.status_code == 200
        data = r.json()
        assert "total_cost" in data
        assert "by_model" in data

    def test_costs_filter_project(self):
        r = client.get("/costs?project=test-api")
        assert r.status_code == 200

    def test_errors(self):
        r = client.get("/errors")
        assert r.status_code == 200
        data = r.json()
        assert data["total_errors"] >= 2
        assert len(data["errors"]) > 0

    def test_errors_filter_project(self):
        r = client.get("/errors?project=test-api")
        assert r.json()["total_errors"] >= 1

    def test_latency_heatmap(self):
        r = client.get("/latency-heatmap?days=7")
        assert r.status_code == 200
        assert "buckets" in r.json()

    def test_latency_heatmap_filter_project(self):
        r = client.get("/latency-heatmap?days=7&project=test-api")
        assert r.status_code == 200

    def test_percentiles_trend(self):
        r = client.get("/percentiles-trend?days=30")
        assert r.status_code == 200
        data = r.json()
        for k in ("agent", "llm_call", "tool_call"):
            assert k in data

    def test_percentiles(self):
        r = client.get("/percentiles")
        assert r.status_code == 200
        assert "llm_call" in r.json()

    def test_percentiles_filter_project(self):
        r = client.get("/percentiles?project=test-api")
        assert r.status_code == 200

    def test_token_heatmap(self):
        r = client.get("/token-heatmap?days=7")
        assert r.status_code == 200
        data = r.json()
        assert "daily_total" in data or "days" in data or isinstance(data, dict)

    def test_token_heatmap_by_year(self):
        r = client.get("/token-heatmap?year=2024")
        assert r.status_code == 200

    def test_call_trend(self):
        r = client.get("/call-trend?days=30")
        assert r.status_code == 200
        data = r.json()
        assert "daily" in data

    def test_tool_rank(self):
        r = client.get("/tool-rank?days=30")
        assert r.status_code == 200
        data = r.json()
        assert "tools" in data
        assert len(data["tools"]) > 0

    def test_agent_role_dist(self):
        r = client.get("/agent-role-dist?days=30")
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_duration_histogram(self):
        r = client.get("/duration-histogram?days=30")
        assert r.status_code == 200
        data = r.json()
        assert "buckets" in data
        assert len(data["buckets"]) > 0

    def test_error_trend(self):
        r = client.get("/error-trend?days=30")
        assert r.status_code == 200
        data = r.json()
        assert "daily" in data

    def test_errors_by_type(self):
        r = client.get("/errors/by-type?days=30")
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_wasteful_traces_dedup(self):
        """Verify wasteful-traces deduplicates same trace_id (sp8 & sp10 share tr5)."""
        r = client.get("/wasteful-traces?days=30&limit=50")
        assert r.status_code == 200
        data = r.json()
        assert "traces" in data
        # tr5 appears twice in spans, but should only appear once in results
        trace_ids = [t["trace_id"] for t in data["traces"]]
        assert trace_ids.count("tr5") == 1, f"tr5 appears {trace_ids.count('tr5')} times: {trace_ids}"

    def test_agent_flow(self):
        r = client.get("/agent-flow?days=30")
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_model_sankey(self):
        r = client.get("/model-sankey?days=30")
        assert r.status_code == 200
        assert isinstance(r.json(), dict)


class TestPrometheusMetrics:
    """GET /metrics — Prometheus endpoint"""

    def test_metrics(self):
        r = client.get("/metrics")
        assert r.status_code == 200
        text = r.text
        assert "tracing_spans_total" in text
        assert "tracing_errors_total" in text
        assert "tracing_duration_ms_avg" in text
        assert "tracing_traces_total" in text
        assert "tracing_last_scrape_timestamp" in text


class TestShareEndpoints:
    """Share: POST /share, GET /s/{id}"""

    def test_create_share(self):
        r = client.post("/share", json={"trace_id": "tr1", "project": "test-api", "view_state": {}})
        assert r.status_code == 200
        data = r.json()
        assert "share_id" in data
        assert data["trace_id"] == "tr1"
        pytest._share_id = data["share_id"]  # store for next tests

    def test_create_share_missing_trace_id(self):
        r = client.post("/share", json={"project": "test-api"})
        assert r.status_code == 400

    def test_create_share_trace_not_found(self):
        r = client.post("/share", json={"trace_id": "nonexistent_trace", "project": "test-api"})
        assert r.status_code == 404

    def test_get_share_found(self):
        sid = getattr(pytest, "_share_id", None)
        if not sid:
            pytest.skip("no share_id from previous test")
        r = client.get(f"/s/{sid}")
        assert r.status_code == 200
        assert r.json()["trace_id"] == "tr1"

    def test_get_share_not_found(self):
        r = client.get("/s/nonexistent_share_id")
        assert r.status_code == 404


class TestAdminEndpoints:
    """Admin: DELETE /admin/spans, POST /admin/cleanup"""

    def test_admin_delete_spans_no_project(self):
        r = client.delete("/admin/spans")
        assert r.status_code == 400

    def test_admin_delete_spans(self):
        r = client.delete("/admin/spans?project=test-api-2")
        assert r.status_code == 200
        data = r.json()
        assert data["deleted"] >= 1

    def test_admin_cleanup(self):
        r = client.post("/admin/cleanup?retention_days=30")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"


class TestDashboardHTML:
    """GET / — built-in HTML dashboard"""

    def test_dashboard_html(self):
        r = client.get("/")
        assert r.status_code == 200
        text = r.text
        assert "<html" in text
        assert "Tracing" in text or "Dashboard" in text


class TestSSEEndpoints:
    """GET /events — SSE streaming"""

    def test_sse_events(self):
        # Quick check that endpoint is reachable
        with client.stream("GET", "/events") as response:
            assert response.status_code == 200
            # Read the first event (connected)
            lines = []
            for i, line in enumerate(response.iter_lines()):
                if i > 10:
                    break
                lines.append(line)
            all_text = " ".join(lines)
        assert "connected" in all_text


# ── Final cleanup ──
def test_cleanup_database():
    """Remove the temporary test database."""
    for p in [db_path, db_path + "-wal", db_path + "-shm"]:
        try: os.remove(p)
        except: pass
    assert True
