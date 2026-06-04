"""Test tracing_sdk without CrewAI — uses raw Span API with 2 projects."""

import tracing_sdk
import time

# ── Project A: simulate LLM calls ──
tracing_sdk.init(project="project-alpha")

from tracing_sdk.span import Span, SpanKind, SpanStatus
from tracing_sdk.collector import send, flush_sync, set_session

set_session("session-alpha-1")

span = Span(name="alpha-query-1", kind=SpanKind.LLM_CALL)
span.metadata = {"model": "gpt-4o", "input_tokens": 500, "output_tokens": 120}
span.tags = {"user_id": "user-1", "env": "test"}
span.start()
time.sleep(0.1)
span.finish()
send(span)

span2 = Span(name="alpha-tool-search", kind=SpanKind.TOOL_CALL, parent_id=span.id)
span2.metadata = {"tool_name": "web_search", "tool_input": "AI trends"}
span2.tags = {"user_id": "user-1"}
span2.start()
time.sleep(0.05)
span2.finish()
send(span2)

# ── Project B: simulate agent execution ──
tracing_sdk.init(project="project-beta")
set_session("session-beta-1")

span3 = Span(name="beta-agent-run", kind=SpanKind.AGENT)
span3.metadata = {"agent": "code-reviewer", "agent_role": "reviewer"}
span3.tags = {"user_id": "user-2", "priority": "high"}
span3.start()
time.sleep(0.15)
span3.finish()
send(span3)

span4 = Span(name="beta-llm-analyze", kind=SpanKind.LLM_CALL, parent_id=span3.id)
span4.metadata = {"model": "claude-4-sonnet", "input_tokens": 800, "output_tokens": 300}
span4.tags = {"user_id": "user-2"}
span4.start()
time.sleep(0.05)
span4.finish(status=SpanStatus.ERROR, error="timeout after 30s")
send(span4)

# Flush
flush_sync()
print("=== Spans sent ===")
print("Project Alpha: 2 spans (1 LLM + 1 tool)")
print("Project Beta:  2 spans (1 agent + 1 LLM error)")
print()
print("打开 http://localhost:9201")
print("- 追踪 Tab: 查看 spans 和 waterfall")
print("- 成本 Tab: 查看按模型的 token 费用")
print("- 错误 Tab: project-beta 应有 50% 错误率")
print("- 对比 Tab: 选择 project-alpha vs project-beta")
