"""API layer tests for tracing_server using FastAPI TestClient."""

import os, sys, json, tempfile

db_path = os.path.join(tempfile.gettempdir(), "test_tracing_api.db")
os.environ["TRACING_DB_PATH"] = db_path
for p in [db_path, db_path + "-wal", db_path + "-shm"]:
    try: os.remove(p) 
    except: pass

sys.path.insert(0, ".")
from tracing_server.store import init_db
init_db()

from fastapi.testclient import TestClient
from tracing_server.app import app

client = TestClient(app)
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
print("API Test Suite")
print("=" * 60)

# ── 1. Health ──
print("\n[1] Health")
t("GET /health", lambda: client.get("/health").status_code == 200)

# ── 2. Ingest ──
print("\n[2] Ingest")
spans = [
    {"id":"sp1","trace_id":"tr1","parent_id":"","session_id":"s1","project":"test-api",
     "name":"llm-gpt4","kind":"llm_call","status":"ok",
     "start_time":"2024-01-01T00:00:00Z","end_time":"2024-01-01T00:00:01Z",
     "duration_ms":1000,"metadata":{"model":"gpt-4","input_tokens":100,"output_tokens":50},"error":"","tags":{}},
    {"id":"sp2","trace_id":"tr1","parent_id":"sp1","session_id":"s1","project":"test-api",
     "name":"tool-search","kind":"tool_call","status":"error",
     "start_time":"2024-01-01T00:00:02Z","end_time":"2024-01-01T00:00:03Z",
     "duration_ms":1000,"metadata":{"tool_name":"search"},"error":"timeout","tags":{}},
    {"id":"sp3","trace_id":"tr2","parent_id":"","session_id":"s2","project":"test-api-2",
     "name":"agent-run","kind":"agent","status":"ok",
     "start_time":"2024-01-02T00:00:00Z","end_time":"2024-01-02T00:00:05Z",
     "duration_ms":5000,"metadata":{"agent_role":"researcher"},"error":"","tags":{}},
]

t("POST /spans count=3", lambda: client.post("/spans", json=spans).json()["count"] == 3)
t("POST /spans empty=400", lambda: client.post("/spans", json=[]).status_code == 400)

# ── 3. Query ──
print("\n[3] Query")
t("GET /traces count=2", lambda: len(client.get("/traces").json()["traces"]) == 2)
t("GET /traces?project=test-api", lambda: len(client.get("/traces?project=test-api").json()["traces"]) == 1)
t("GET /traces?limit=1", lambda: len(client.get("/traces?limit=1").json()["traces"]) == 1)
t("GET /traces/tr1 span_count=2", lambda: client.get("/traces/tr1").json()["span_count"] == 2)
t("GET /traces/nonexistent=404", lambda: client.get("/traces/nonexistent").status_code == 404)

stats = client.get("/stats").json()
t("GET /stats total=3", lambda: stats["total_spans"] == 3 and stats["total_tokens"] == 150)
t("GET /stats?project=test-api", lambda: client.get("/stats?project=test-api").json()["total_spans"] == 2)

projects = client.get("/projects").json()["projects"]
t("GET /projects has test-api", lambda: "test-api" in projects and "test-api-2" in projects)

t("GET /search?q=gpt", lambda: len(client.get("/search?q=gpt").json()["results"]) == 1)
t("GET /search?q=timeout", lambda: len(client.get("/search?q=timeout").json()["results"]) == 1)
t("GET /search empty", lambda: len(client.get("/search?q=nonexist").json()["results"]) == 0)

# ── 3b. Compare ──
print("\n[3b] Compare")
compare_r = client.get("/traces/compare?trace_a=tr1&trace_b=tr2")
t("GET /traces/compare tr1 vs tr2", lambda: compare_r.status_code == 200)
compare_data = compare_r.json()
t("Compare has comparisons", lambda: isinstance(compare_data.get("comparisons"), list))
t("Compare has trace_a info", lambda: compare_data["trace_a"]["trace_id"] == "tr1")
t("Compare has trace_b info", lambda: compare_data["trace_b"]["trace_id"] == "tr2")
t("Compare 404 nonexistent", lambda: client.get("/traces/compare?trace_a=nonexist&trace_b=tr2").status_code == 404)

# ── 4. Analytics ──
print("\n[4] Analytics")
costs = client.get("/costs").json()
t("GET /costs has by_model", lambda: costs["total_cost"] >= 0 and "by_model" in costs)

errors = client.get("/errors").json()
t("GET /errors total_errors=1", lambda: errors["total_errors"] == 1)

t("GET /latency-heatmap", lambda: "buckets" in client.get("/latency-heatmap?days=7").json())

trend = client.get("/percentiles-trend?days=30").json()
t("GET /percentiles-trend keys", lambda: all(k in trend for k in ["agent","llm_call","tool_call"]))

pct = client.get("/percentiles").json()
t("GET /percentiles has llm_call", lambda: "llm_call" in pct)

metrics = client.get("/metrics")
t("GET /metrics", lambda: metrics.status_code == 200 and "tracing_" in metrics.text)

# ── 5. Share ──
print("\n[5] Share")
share_r = client.post("/share", json={"trace_id":"tr1","project":"test-api","view_state":{}})
share_data = share_r.json()
t("POST /share", lambda: share_r.status_code == 200 and "share_id" in share_data)

sid = share_data["share_id"]
t("GET /s/{id}", lambda: client.get(f"/s/{sid}").json()["trace_id"] == "tr1")
t("GET /s/nonexist=404", lambda: client.get("/s/nonexist123").status_code == 404)

# ── 6. Admin ──
print("\n[6] Admin")
t("DELETE /admin/spans?project=test-api-2", lambda: client.delete("/admin/spans?project=test-api-2").json()["deleted"] == 1)
t("POST /admin/cleanup", lambda: client.post("/admin/cleanup?retention_days=30").status_code == 200)

# ── 7. Dashboard ──
print("\n[7] Dashboard")
t("GET / HTML", lambda: client.get("/").status_code == 200 and "<html" in client.get("/").text)

# ── Cleanup ──
for p in [db_path, db_path + "-wal", db_path + "-shm"]:
    try: os.remove(p) 
    except: pass

print("\n" + "=" * 60)
print(f"Results: {passed} passed, {failed} failed, {passed+failed} total")
print("=" * 60)
sys.exit(1 if failed else 0)
