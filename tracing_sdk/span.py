"""Span model — universal trace unit, framework-agnostic."""

from dataclasses import dataclass, field, asdict
from enum import Enum
from datetime import datetime, timezone
import uuid

class SpanKind(str, Enum):
    FLOW = "flow"           # top-level trace (a session / run)
    AGENT = "agent"         # an agent's execution
    LLM_CALL = "llm_call"   # a single LLM API call
    TOOL_CALL = "tool_call" # a tool / function call
    PHASE = "phase"         # a pipeline phase (research, design, dev)

class SpanStatus(str, Enum):
    OK = "ok"
    ERROR = "error"
    RUNNING = "running"

@dataclass
class Span:
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:16])
    trace_id: str = ""       # groups all spans in one session
    parent_id: str = ""      # parent span id, empty for root
    name: str = ""           # e.g. "research_crew.market_analyst"
    kind: SpanKind = SpanKind.FLOW
    status: SpanStatus = SpanStatus.RUNNING
    start_time: str = ""     # ISO 8601
    end_time: str = ""       # ISO 8601, empty while running
    duration_ms: float = 0
    metadata: dict = field(default_factory=dict)
    error: str = ""
    tags: dict = field(default_factory=dict)  # user-defined key-value tags
    session_id: str = ""     # business-level session id
    project: str = ""        # to distinguish multiple apps

    def start(self):
        self.start_time = datetime.now(timezone.utc).isoformat()
        self.status = SpanStatus.RUNNING

    def finish(self, status: SpanStatus = SpanStatus.OK, error: str = ""):
        self.end_time = datetime.now(timezone.utc).isoformat()
        self.status = status
        self.error = error
        if self.start_time:
            start = datetime.fromisoformat(self.start_time)
            end = datetime.fromisoformat(self.end_time)
            self.duration_ms = (end - start).total_seconds() * 1000

    def to_dict(self) -> dict:
        d = asdict(self)
        d["kind"] = self.kind.value
        d["status"] = self.status.value
        return d
