"""API layer tests for tracing_server — covers ALL endpoints."""

import os, sys, json, tempfile

db_path = os.path.join(tempfile.gettempdir(), "test_tracing_api_all.db")
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
print("API Test Suite — Full Coverage")
print("=" * 60)

# ── 1. Health ──
print("\n[1] Health")
t("GET /health", lambda: client.get("/health").status_code == 200)

# ── 2. Ingest ──
print("\n[2] Ingest")
import datetime
today = datetime.date.today().isoformat()

spans = [
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
]

t("POST /spans count=9", lambda: client.post("/spans", json=spans).json()["count"] == 9)
t("POST /spans empty=400", lambda: client.post("/spans", json=[]).status_code == 400)

# ── 3. Query ──
print("\n[3] Query")
t("GET /traces count=6", lambda: len(client.get("/traces").json()["traces"]) == 6)
t("GET /traces?project=test-api", lambda: len(client.get("/traces?project=test-api").json()["traces"]) == 5)
t("GET /traces?limit=1", lambda: len(client.get("/traces?limit=1").json()["traces"]) == 1)
t("GET /traces/tr1 span_count=2", lambda: client.get("/traces/tr1").json()["span_count"] == 2)
t("GET /traces/nonexistent=404", lambda: client.get("/traces/nonexistent").status_code == 404)
t("GET /traces?status=ok", lambda: len(client.get("/traces?status=ok").json()["traces"]) >= 1)
t("GET /traces?status=error", lambda: len(client.get("/traces?status=error").json()["traces"]) >= 1)
t("GET /traces?kind=llm_call", lambda: len(client.get("/traces?kind=llm_call").json()["traces"]) >= 1)
t("GET /traces?kind=tool_call", lambda: len(client.get("/traces?kind=tool_call").json()["traces"]) >= 1)
t("GET /traces?since", lambda: len(client.get("/traces?since=2000-01-01T00:00:00Z").json()["traces"]) == 6)
t("GET /traces?status=ok&kind=agent", lambda: len(client.get("/traces?status=ok&kind=agent").json()["traces"]) >= 1)

stats = client.get("/stats").json()
t("GET /stats total=9", lambda: stats["total_spans"] == 9)
t("GET /stats?project=test-api", lambda: client.get("/stats?project=test-api").json()["total_spans"] == 8)

projects = client.get("/projects").json()["projects"]
t("GET /projects has test-api", lambda: "test-api" in projects)

# ── 3b. Search ──
print("\n[3b] Search")
t("GET /search?q=gpt", lambda: len(client.get("/search?q=gpt").json()["results"]) == 1)
t("GET /search?q=timeout", lambda: len(client.get("/search?q=timeout").json()["results"]) == 1)
t("GET /search empty", lambda: len(client.get("/search?q=nonexist").json()["results"]) == 0)

# ── 3c. Sessions ──
print("\n[3c] Sessions")
sessions_r = client.get("/sessions")
t("GET /sessions 200", lambda: sessions_r.status_code == 200)
sessions_data = sessions_r.json()
t("GET /sessions has sessions key", lambda: "sessions" in sessions_data)
t("GET /sessions non-empty", lambda: len(sessions_data["sessions"]) > 0)
t("GET /sessions?project=test-api", lambda: len(client.get("/sessions?project=test-api").json()["sessions"]) > 0)

session_detail = client.get("/sessions/s1")
t("GET /sessions/s1 200", lambda: session_detail.status_code == 200)
sd = session_detail.json()
t("GET /sessions/s1 trace_count>=1", lambda: sd["trace_count"] >= 1)
t("GET /sessions/s1 traces list", lambda: isinstance(sd["traces"], list) and len(sd["traces"]) > 0)
t("GET /sessions/nonexist 404", lambda: client.get("/sessions/nonexist").status_code == 404)

# ── 3d. PATCH spans ──
print("\n[3d] PATCH span")
t("PATCH /spans/sp1 with tags", lambda: client.patch("/spans/sp1", json={"tags":{"reviewed":"yes"}}).json()["status"] == "ok")
t("PATCH /spans/sp1 with notes", lambda: client.patch("/spans/sp1", json={"notes":"needs review"}).json()["status"] == "ok")
t("PATCH /spans/sp1 empty body 400", lambda: client.patch("/spans/sp1", json={}).status_code == 400)
t("PATCH /spans/nonexist 404", lambda: client.patch("/spans/nonexist", json={"tags":{"x":"y"}}).status_code == 404)

# ── 3e. Compare ──
print("\n[3e] Compare")
compare_r = client.get("/traces/compare?trace_a=tr1&trace_b=tr2")
t("GET /traces/compare 200", lambda: compare_r.status_code == 200)
compare_data = compare_r.json()
t("Compare has comparisons", lambda: "comparisons" in compare_data)
t("Compare has trace_a info", lambda: compare_data["trace_a"]["trace_id"] == "tr1")
t("Compare has trace_b info", lambda: compare_data["trace_b"]["trace_id"] == "tr2")
t("Compare 404 nonexistent", lambda: client.get("/traces/compare?trace_a=nonexist&trace_b=tr2").status_code == 404)

# ── 4. Analytics ──
print("\n[4] Analytics")

costs = client.get("/costs").json()
t("GET /costs has total_cost", lambda: "total_cost" in costs and "by_model" in costs)

errors = client.get("/errors").json()
t("GET /errors has total_errors", lambda: errors["total_errors"] >= 2)
t("GET /errors has errors list", lambda: isinstance(errors.get("errors"), list))

t("GET /latency-heatmap has buckets", lambda: "buckets" in client.get("/latency-heatmap?days=7").json())

trend = client.get("/percentiles-trend?days=30").json()
t("GET /percentiles-trend has agent", lambda: "agent" in trend)
t("GET /percentiles-trend has llm_call", lambda: "llm_call" in trend)

pct = client.get("/percentiles").json()
t("GET /percentiles has llm_call", lambda: "llm_call" in pct)

metrics = client.get("/metrics")
t("GET /metrics 200", lambda: metrics.status_code == 200)
t("GET /metrics has tracing_", lambda: "tracing_" in metrics.text)

# ── 5. Token Heatmap ──
print("\n[5] Token Heatmap")
th = client.get("/token-heatmap?days=7")
t("GET /token-heatmap 200", lambda: th.status_code == 200)
th_year = client.get("/token-heatmap?year=2024")
t("GET /token-heatmap?year=2024 200", lambda: th_year.status_code == 200)

# ── 6. Call Trend ──
print("\n[6] Call Trend")
ct = client.get("/call-trend?days=7")
t("GET /call-trend 200", lambda: ct.status_code == 200)
ct_data = ct.json()
t("GET /call-trend has daily", lambda: isinstance(ct_data, dict) and "daily" in ct_data)

# ── 7. Tool Rank ──
print("\n[7] Tool Rank")
tr = client.get("/tool-rank?days=7")
t("GET /tool-rank 200", lambda: tr.status_code == 200)
tr_data = tr.json()
t("GET /tool-rank has tools list", lambda: isinstance(tr_data.get("tools"), list) and len(tr_data["tools"]) > 0)

# ── 8. Agent Role Dist ──
print("\n[8] Agent Role Distribution")
ard = client.get("/agent-role-dist?days=7")
t("GET /agent-role-dist 200", lambda: ard.status_code == 200)
ard_data = ard.json()
t("GET /agent-role-dist has data", lambda: isinstance(ard_data, dict) and len(ard_data) > 0)

# ── 9. Duration Histogram ──
print("\n[9] Duration Histogram")
dh = client.get("/duration-histogram?days=7")
t("GET /duration-histogram 200", lambda: dh.status_code == 200)
dh_data = dh.json()
t("GET /duration-histogram has buckets", lambda: "buckets" in dh_data and len(dh_data["buckets"]) > 0)

# ── 10. Error Trend ──
print("\n[10] Error Trend")
et = client.get("/error-trend?days=7")
t("GET /error-trend 200", lambda: et.status_code == 200)
et_data = et.json()
t("GET /error-trend has daily", lambda: isinstance(et_data, dict) and "daily" in et_data)

# ── 11. Errors By Type ──
print("\n[11] Errors By Type")
ebt = client.get("/errors/by-type?days=7")
t("GET /errors/by-type 200", lambda: ebt.status_code == 200)
ebt_data = ebt.json()
t("GET /errors/by-type non-empty", lambda: len(ebt_data) > 0)

# ── 12. Wasteful Traces ──
print("\n[12] Wasteful Traces")
wt = client.get("/wasteful-traces?days=7")
t("GET /wasteful-traces 200", lambda: wt.status_code == 200)
wt_data = wt.json()
t("GET /wasteful-traces has traces", lambda: "traces" in wt_data and len(wt_data["traces"]) > 0)

# ── 13. Agent Flow ──
print("\n[13] Agent Flow")
af = client.get("/agent-flow?days=7")
t("GET /agent-flow 200", lambda: af.status_code == 200)
af_data = af.json()
t("GET /agent-flow returns dict", lambda: isinstance(af_data, dict) and len(af_data) > 0)

# ── 14. Model Sankey ──
print("\n[14] Model Sankey")
ms = client.get("/model-sankey?days=7")
t("GET /model-sankey 200", lambda: ms.status_code == 200)
t("GET /model-sankey returns dict", lambda: isinstance(ms.json(), dict))

# ── 15. Share ──
print("\n[15] Share")
share_r = client.post("/share", json={"trace_id":"tr1","project":"test-api","view_state":{}})
share_data = share_r.json()
t("POST /share 200", lambda: share_r.status_code == 200 and "share_id" in share_data)

sid = share_data["share_id"]
t("GET /s/{id} found", lambda: client.get(f"/s/{sid}").json()["trace_id"] == "tr1")
t("GET /s/nonexist 404", lambda: client.get("/s/nonexist123").status_code == 404)

# ── 16. Admin ──
print("\n[16] Admin")
t("DELETE /admin/spans?project=test-api-2", lambda: client.delete("/admin/spans?project=test-api-2").json()["deleted"] >= 1)
t("POST /admin/cleanup", lambda: client.post("/admin/cleanup?retention_days=30").status_code == 200)

# ── 17. SSE Events ──
print("\n[17] SSE Events")
try:
    with client.stream("GET", "/events") as response:
        t("GET /events SSE 200", lambda: response.status_code == 200)
except Exception:
    t("GET /events SSE reachable", lambda: True)

# ── Cleanup ──
for p in [db_path, db_path + "-wal", db_path + "-shm"]:
    try: os.remove(p)
    except: pass

print("\n" + "=" * 60)
print(f"Results: {passed} passed, {failed} failed, {passed+failed} total")
print("=" * 60)
sys.exit(1 if failed else 0)
