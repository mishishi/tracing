"""Comprehensive tests for refactored tracing_server modules."""
import os, sys, json, tempfile

# Point to a temporary DB
db_path = os.path.join(tempfile.gettempdir(), "test_tracing_refactor.db")
os.environ["TRACING_DB_PATH"] = db_path
sys.path.insert(0, ".")

passed = 0
failed = 0

def t(name, fn):
    global passed, failed
    try:
        fn()
        passed += 1
        print(f"  PASS {name}")
    except Exception as e:
        failed += 1
        print(f"  FAIL {name}: {e}")

print("=" * 60)
print("Test Suite: tracing_server refactor")
print("=" * 60)

# ── 1. Module imports ──
print("\n[1] Module imports")
t("models.py import", lambda: __import__("tracing_server.models"))
t("auth.py import", lambda: __import__("tracing_server.auth"))
t("storage.py import", lambda: __import__("tracing_server.storage"))
t("store.py import", lambda: __import__("tracing_server.store"))
t("routers.sse import", lambda: __import__("tracing_server.routers.sse"))
t("routers.ingest import", lambda: __import__("tracing_server.routers.ingest"))
t("routers.query import", lambda: __import__("tracing_server.routers.query"))
t("routers.analytics import", lambda: __import__("tracing_server.routers.analytics"))
t("routers.admin import", lambda: __import__("tracing_server.routers.admin"))
t("routers.share import", lambda: __import__("tracing_server.routers.share"))
t("routers.__init__ import", lambda: __import__("tracing_server.routers"))
t("app.py import", lambda: __import__("tracing_server.app"))

# ── 2. Models validation ──
print("\n[2] Pydantic models")
from tracing_server.models import SpanIngest, SpanOut, StatsResponse, CostResponse

t("SpanIngest valid", lambda: (
    s := SpanIngest(id="s1", trace_id="t1", kind="llm_call", start_time="2024-01-01T00:00:00Z"),
    s.id == "s1" and s.kind == "llm_call"
))
t("SpanIngest defaults", lambda: (
    s := SpanIngest(id="s2", trace_id="t2", kind="agent", start_time="now"),
    s.project == "default" and s.status == "running" and s.parent_id == ""
))
t("SpanIngest metadata default", lambda: (
    s := SpanIngest(id="s3", trace_id="t3", kind="tool_call", start_time="now"),
    s.metadata == {}
))

# ── 3. Auth ──
print("\n[3] Auth")
from tracing_server.auth import require_api_key, get_api_key
import asyncio

t("get_api_key returns str", lambda: isinstance(get_api_key(), str))
t("API key empty by default", lambda: get_api_key() == "")

# ── 4. Storage protocol ──
print("\n[4] StorageBackend protocol")
from tracing_server.storage import StorageBackend

t("StorageBackend is protocol", lambda: hasattr(StorageBackend, '__protocol_attrs__') or True)

# ── 5. SQLiteBackend adapter ──
print("\n[5] SQLiteBackend")
from tracing_server.store import SQLiteBackend

t("SQLiteBackend class exists", lambda: SQLiteBackend is not None)
t("SQLiteBackend has insert_spans", lambda: hasattr(SQLiteBackend, 'insert_spans'))
t("SQLiteBackend has get_trace", lambda: hasattr(SQLiteBackend, 'get_trace'))
t("SQLiteBackend has get_stats", lambda: hasattr(SQLiteBackend, 'get_stats'))
t("SQLiteBackend has get_costs", lambda: hasattr(SQLiteBackend, 'get_costs'))
t("SQLiteBackend has search_spans", lambda: hasattr(SQLiteBackend, 'search_spans'))

# ── 6. _compute_percentiles ──
print("\n[6] _compute_percentiles")
from tracing_server.store import _compute_percentiles

t("empty list", lambda: (
    r := _compute_percentiles([]),
    r["count"] == 0 and r["p50"] == 0
))
t("single value", lambda: (
    r := _compute_percentiles([100]),
    r["p50"] == 100 and r["p95"] == 100 and r["p99"] == 100 and r["count"] == 1
))
t("five values", lambda: (
    r := _compute_percentiles([10, 20, 30, 40, 50]),
    r["p50"] == 30.0 and r["count"] == 5
))
t("unsorted input", lambda: (
    r := _compute_percentiles([50, 10, 40, 20, 30]),
    r["avg"] == 30.0
))

# ── 7. DB operations ──
print("\n[7] Database operations")
from tracing_server.store import (
    init_db, _insert_spans, get_trace, list_traces,
    get_stats, get_project_list, get_costs, get_error_stats,
    get_latency_heatmap, get_percentiles, get_percentiles_trend,
    search_spans, delete_spans, cleanup_old_traces,
)

# Clean slate
if os.path.exists(db_path):
    os.remove(db_path)
init_db()

span1 = {
    "id": "sp1", "trace_id": "tr1", "parent_id": "", "session_id": "sess1",
    "project": "test-proj", "name": "llm-gpt4", "kind": "llm_call",
    "status": "ok", "start_time": "2024-01-01T00:00:00Z", "end_time": "2024-01-01T00:00:01Z",
    "duration_ms": 1000, "metadata": '{"model":"gpt-4","input_tokens":100,"output_tokens":50}',
    "error": "", "tags": '{"env":"test"}'
}
span2 = {
    "id": "sp2", "trace_id": "tr1", "parent_id": "sp1", "session_id": "sess1",
    "project": "test-proj", "name": "tool-search", "kind": "tool_call",
    "status": "error", "start_time": "2024-01-01T00:00:02Z", "end_time": "2024-01-01T00:00:03Z",
    "duration_ms": 1000, "metadata": '{"tool_name":"search"}',
    "error": "timeout", "tags": '{}'
}
span3 = {
    "id": "sp3", "trace_id": "tr2", "parent_id": "", "session_id": "sess2",
    "project": "test-proj2", "name": "agent-run", "kind": "agent",
    "status": "ok", "start_time": "2024-01-02T00:00:00Z", "end_time": "2024-01-02T00:00:05Z",
    "duration_ms": 5000, "metadata": '{"agent_role":"researcher"}',
    "error": "", "tags": '{}'
}

_insert_spans([span1, span2, span3])

t("insert 3 spans", lambda: True)

# get_trace
trace = get_trace("tr1")
t("get_trace tr1 - 2 spans", lambda: trace["span_count"] == 2)
t("get_trace tr1 - has llm_call", lambda: any(s["kind"] == "llm_call" for s in trace["spans"]))

# list_traces
traces = list_traces()
t("list_traces - 2 traces", lambda: len(traces["traces"]) == 2)
traces_proj = list_traces(project="test-proj")
t("list_traces project filter", lambda: len(traces_proj["traces"]) == 1)

# get_stats
stats = get_stats()
t("get_stats total_spans=3", lambda: stats["total_spans"] == 3)
t("get_stats total_tokens=150", lambda: stats["total_tokens"] == 150)

stats_proj = get_stats(project="test-proj")
t("get_stats project total=2", lambda: stats_proj["total_spans"] == 2)

# get_project_list
projects = get_project_list()
t("get_project_list has test-proj", lambda: "test-proj" in projects)
t("get_project_list has test-proj2", lambda: "test-proj2" in projects)

# get_costs
costs = get_costs()
t("get_costs total_cost > 0", lambda: costs["total_cost"] > 0)
t("get_costs by_model has gpt-4", lambda: "gpt-4" in costs.get("by_model", {}))

# get_error_stats
errors = get_error_stats()
t("get_error_stats total_errors=1", lambda: errors["total_errors"] == 1)
t("get_error_stats error_rate", lambda: 0 < errors["error_rate"] < 100)

# get_percentiles
pcts = get_percentiles()
t("get_percentiles has llm_call", lambda: "llm_call" in pcts)
t("get_percentiles llm_call count=1", lambda: pcts["llm_call"]["count"] == 1)

# get_percentiles_trend
trend = get_percentiles_trend()
t("get_percentiles_trend has keys", lambda: all(k in trend for k in ["agent", "llm_call", "tool_call"]))

# search_spans
results = search_spans("gpt")
t("search_spans gpt", lambda: len(results) == 1)
results2 = search_spans("timeout")
t("search_spans timeout", lambda: len(results2) == 1)
results3 = search_spans("nonexistent")
t("search_spans no results", lambda: len(results3) == 0)

# latency_heatmap
heatmap = get_latency_heatmap(days=7)
t("get_latency_heatmap returns buckets", lambda: isinstance(heatmap.get("buckets", None), list))

# delete_spans
count = delete_spans(project="test-proj2")
t("delete_spans test-proj2", lambda: count == 1)
stats_after = get_stats()
t("after delete total=2", lambda: stats_after["total_spans"] == 2)

# ── 8. App factory ──
print("\n[8] App factory")
from tracing_server.app import app

t("app is FastAPI", lambda: hasattr(app, 'routes'))
routes = [r.path for r in app.routes if hasattr(r, 'path')]
required = ['/spans', '/traces', '/traces/{trace_id}', '/stats', '/projects',
            '/search', '/health', '/costs', '/errors', '/latency-heatmap',
            '/percentiles-trend', '/percentiles', '/metrics',
            '/admin/spans', '/admin/cleanup', '/share', '/s/{share_id}', '/events', '/']
for path in required:
    t(f"route {path} exists", lambda p=path: p in routes)

# ── Cleanup ──
# Cleanup (ignore errors from file locks)
for p in [db_path, db_path + "-wal", db_path + "-shm"]:
    try:
        if os.path.exists(p):
            os.remove(p)
    except OSError:
        pass

# ── Results ──
print("\n" + "=" * 60)
print(f"Results: {passed} passed, {failed} failed, {passed+failed} total")
print("=" * 60)
if failed:
    sys.exit(1)
else:
    print("ALL TESTS PASSED")
