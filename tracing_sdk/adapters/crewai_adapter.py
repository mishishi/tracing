"""CrewAI adapter — hooks into crewai_event_bus for v1.14.x event shapes."""

import logging
from pathlib import Path
from ..span import Span, SpanKind, SpanStatus
from ..collector import send
import re

logger = logging.getLogger("tracing.crewai")

_debug = Path.home() / ".tracing" / "adapter.log"
_debug.parent.mkdir(parents=True, exist_ok=True)

def _log(msg: str):
    try:
        with open(_debug, "a", encoding="utf-8") as f:
            from datetime import datetime
            f.write(datetime.now().isoformat() + " " + msg + "\n")
    except Exception:
        pass

_llm_stack: list[Span] = []

# Agent/Task context tracking
_current_agent: str = ""
_current_task: str = ""


def _patch_crewai():
    _log("adapter: starting patch")
    try:
        from crewai.events.event_bus import crewai_event_bus
        from crewai.events.types.llm_events import (
            LLMCallStartedEvent,
            LLMCallCompletedEvent,
            LLMCallFailedEvent,
        )
        from crewai.events.types.tool_usage_events import (
            ToolUsageEvent,
            ToolUsageErrorEvent,
        )
    except ImportError as e:
        _log("adapter: import failed: " + str(e))
        return

    _log("adapter: imports ok")

    # Catch-all to discover what events fire
    try:
        from crewai.events.base_event import BaseEvent
    except ImportError:
        try:
            from crewai.events.types.agent_events import BaseEvent
        except ImportError:
            BaseEvent = None

    if BaseEvent:
        _all_types = set()
        @crewai_event_bus.on(BaseEvent)
        def _catch_all(source, event):
            t = type(event).__name__
            if t not in _all_types:
                _all_types.add(t)
                _log("EVENT_DISCOVERED: " + t)

    @crewai_event_bus.on(LLMCallStartedEvent)
    def _on_llm_started(source, event):
        _log("LLM_STARTED")
        try:
            span = Span(kind=SpanKind.LLM_CALL, name="思考中...")
            span.metadata["agent"] = _current_agent
            span.metadata["task"] = _current_task
            # Capture model from event
            model = getattr(event, "model", None)
            if model:
                span.metadata["model"] = str(model)
            span.start()
            # Capture prompt preview from messages
            msgs = getattr(event, "messages", None)
            if isinstance(msgs, list) and msgs:
                span.metadata["prompt_preview"] = str(msgs[-1])
            elif isinstance(msgs, str):
                span.metadata["prompt_preview"] = msgs
            _llm_stack.append(span)
        except Exception as e:
            _log("LLM_STARTED err: " + str(e))

    @crewai_event_bus.on(LLMCallCompletedEvent)
    def _on_llm_completed(source, event):
        _log("LLM_COMPLETED stack=" + str(len(_llm_stack)))
        try:
            if _llm_stack:
                span = _llm_stack.pop()
            else:
                span = Span(kind=SpanKind.LLM_CALL, name="llm_call")
                span.start()
            # Capture model from event if not already set
            if "model" not in span.metadata:
                model = getattr(event, "model", None)
                if model:
                    span.metadata["model"] = str(model)
            usage = getattr(event, "usage", None) or {}
            span.metadata["input_tokens"] = usage.get("prompt_tokens", 0)
            span.metadata["output_tokens"] = usage.get("completion_tokens", 0)
            span.metadata["total_tokens"] = usage.get("total_tokens", 0)
            resp = getattr(event, "response", None)
            if resp is not None:
                span.metadata["response_preview"] = str(resp)
                tool_m = re.search(r"(?:write_file|read_file)\s*\(\s*[""“]([^"")”]+)", str(resp))
                if tool_m:
                    action = "写文件" if "write_file" in tool_m.group(0) else "读文件"
                    span.name = action + " " + tool_m.group(1).split("/")[-1]
                elif _current_task:
                    span.name = _current_task[:50]
                elif _current_agent:
                    span.name = _current_agent
            if not span.name or span.name == "思考中...":
                fallback = _current_task or _current_agent or ""
                if fallback:
                    span.name = fallback[:50]
                elif "response_preview" in span.metadata:
                    span.name = span.metadata["response_preview"][:40]
                else:
                    span.name = "llm_call"
            span.finish(SpanStatus.OK)
            send(span)
            _log("LLM_COMPLETED sent tokens=" + str(span.metadata["total_tokens"]))
        except Exception as e:
            import traceback
            _log("LLM_COMPLETED err: " + str(e) + "\n" + traceback.format_exc())

    @crewai_event_bus.on(LLMCallFailedEvent)
    def _on_llm_failed(source, event):
        _log("LLM_FAILED")
        try:
            if _llm_stack:
                span = _llm_stack.pop()
                span.finish(SpanStatus.ERROR, str(getattr(event, "error", "")))
                send(span)
        except Exception as e:
            _log("LLM_FAILED err: " + str(e))

    @crewai_event_bus.on(ToolUsageEvent)
    def _on_tool_usage(source, event):
        tool_name = getattr(event, "tool_name", "") or "unknown_tool"
        _log("TOOL: " + tool_name)
        try:
            span = Span(kind=SpanKind.TOOL_CALL, name=tool_name)
            span.metadata["agent"] = _current_agent
            span.metadata["task"] = _current_task
            span.metadata["agent_role"] = getattr(event, "agent_role", "") or ""
            # Capture tool input/output
            args = getattr(event, "tool_args", "")
            if args:
                span.metadata["tool_input"] = str(args)
            span.start()
            span.finish(SpanStatus.OK)
            send(span)
        except Exception as e:
            _log("TOOL err: " + str(e))

    @crewai_event_bus.on(ToolUsageErrorEvent)
    def _on_tool_error(source, event):
        _log("TOOL_ERROR")
        try:
            span = Span(kind=SpanKind.TOOL_CALL, name="tool_error")
            span.start()
            span.finish(SpanStatus.ERROR, str(getattr(event, "error", "")))
            send(span)
        except Exception as e:
            _log("TOOL_ERROR err: " + str(e))

    # Agent execution tracking
    try:
        from crewai.events.types.agent_events import (
            AgentExecutionStartedEvent,
        )
        from crewai.events.types.task_events import (
            TaskStartedEvent,
        )

        @crewai_event_bus.on(AgentExecutionStartedEvent)
        def _on_agent_start(source, event):
            global _current_agent, _current_task
            agent = getattr(event, "agent", None)
            if agent:
                _current_agent = getattr(agent, "role", "") or str(agent)[:80]
            task = getattr(event, "task", None)
            if task:
                _current_task = getattr(task, "description", "") or str(task)[:80]
            _log("AGENT: " + _current_agent + " | TASK: " + _current_task[:60])

        @crewai_event_bus.on(TaskStartedEvent)
        def _on_task_start(source, event):
            global _current_task
            task = getattr(event, "task", None)
            if task:
                _current_task = getattr(task, "description", "") or str(task)[:80]
            _log("TASK: " + _current_task[:60])
    except ImportError:
        pass

    _log("adapter: all listeners registered")
