"""Quick test of LLM span creation."""
import os, sys, json, urllib.request, time
sys.path.insert(0, ".")

os.environ["TRACING_ENDPOINT"] = "http://localhost:9200"

from tracing_sdk.adapters.crewai_adapter import _patch_crewai
from tracing_sdk.collector import set_session, flush_sync
import tracing_sdk.collector as collector

_patch_crewai()
set_session("test-session", "idea-lab")
print("Adapter loaded OK")

from crewai.events.event_bus import crewai_event_bus
from crewai.events.types.llm_events import LLMCallStartedEvent, LLMCallCompletedEvent, LLMCallType

crewai_event_bus.emit(LLMCallStartedEvent, event=LLMCallStartedEvent(
    type="llm_call_started", messages="test", call_id="t3",
))
crewai_event_bus.emit(LLMCallCompletedEvent, event=LLMCallCompletedEvent(
    type="llm_call_completed", messages="test",
    response="write_file('test.py')",
    call_type=LLMCallType.LLM_CALL,
    usage={"prompt_tokens": 50, "completion_tokens": 30, "total_tokens": 80},
    call_id="t3",
))

print(f"Buffer size: {len(collector._BUFFER)}")

# Try sending directly
if collector._BUFFER:
    data = json.dumps(collector._BUFFER).encode("utf-8")
    req = urllib.request.Request(
        "http://localhost:9200/spans",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=5)
        print(f"Server response: {resp.status} {resp.read().decode()}")
    except Exception as e:
        print(f"Send error: {e}")
else:
    print("Buffer empty - span was not enqueued!")

time.sleep(0.5)

import sqlite3
db = sqlite3.connect(os.path.expanduser("~/.tracing/traces.db"))
db.row_factory = sqlite3.Row
rows = db.execute("SELECT count(*) as c FROM spans").fetchone()
print(f"DB spans: {rows['c']}")
