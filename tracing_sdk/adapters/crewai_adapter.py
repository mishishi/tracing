"""CrewAI adapter — hooks into crewai_event_bus for v1.14.x event shapes.
Creates Flow > Agent > LLM/Tool span hierarchy."""

import logging
from ..span import Span, SpanKind, SpanStatus
from ..collector import send
import re
import uuid

logger = logging.getLogger("tracing.crewai")

def _log(msg: str, *args, level: str = "debug"):
    """Structured logging via standard logging module."""
    if level == "error":
        logger.error(msg, *args)
    elif level == "warning":
        logger.warning(msg, *args)
    else:
        logger.debug(msg, *args)

# ── Span tracking ──
_llm_stack: list[Span] = []
_flow_span: Span | None = None
_agent_span: Span | None = None

# Agent/Task context strings for display
_current_agent: str = ""
_current_task: str = ""

_patched = False


# ── Event type resolution (version-agnostic) ──

def _resolve_crewai_events():
    """Try to import CrewAI event classes across versions.
    
    Returns dict mapping event names to type classes, or empty dict if unavailable.
    """
    event_paths = [
        # v1.14.x+ event layout
        {
            "CrewKickoffStartedEvent": "crewai.events.types.crew_events",
            "CrewKickoffCompletedEvent": "crewai.events.types.crew_events",
            "CrewKickoffFailedEvent": "crewai.events.types.crew_events",
            "AgentExecutionStartedEvent": "crewai.events.types.agent_events",
            "AgentExecutionCompletedEvent": "crewai.events.types.agent_events",
            "AgentExecutionErrorEvent": "crewai.events.types.agent_events",
            "TaskStartedEvent": "crewai.events.types.task_events",
            "TaskCompletedEvent": "crewai.events.types.task_events",
            "LLMCallStartedEvent": "crewai.events.types.llm_events",
            "LLMCallCompletedEvent": "crewai.events.types.llm_events",
            "LLMCallFailedEvent": "crewai.events.types.llm_events",
            "ToolUsageStartedEvent": "crewai.events.types.tool_usage_events",
            "ToolUsageFinishedEvent": "crewai.events.types.tool_usage_events",
            "ToolUsageErrorEvent": "crewai.events.types.tool_usage_events",
        },
    ]
    
    for mapping in event_paths:
        try:
            resolved = {}
            for name, module_path in mapping.items():
                mod = __import__(module_path, fromlist=[name])
                resolved[name] = getattr(mod, name)
            return resolved
        except (ImportError, AttributeError):
            continue
    
    return {}

def _patch_crewai():
    global _patched
    if _patched:
        return
    _patched = True
    _log("adapter: starting patch")

    # ── Imports ──
    # Resolve event types (supports multiple CrewAI versions)
    events = _resolve_crewai_events()
    if not events:
        _log("adapter: no CrewAI events resolved — skipping", level="warning")
        return

    try:
        from crewai.events.event_bus import crewai_event_bus
    except ImportError as e:
        _log("adapter: event_bus import failed: " + str(e))
        return

    # Unpack resolved event types for handler decorators
    CrewKickoffStartedEvent = events["CrewKickoffStartedEvent"]
    CrewKickoffCompletedEvent = events["CrewKickoffCompletedEvent"]
    CrewKickoffFailedEvent = events["CrewKickoffFailedEvent"]
    AgentExecutionStartedEvent = events["AgentExecutionStartedEvent"]
    AgentExecutionCompletedEvent = events["AgentExecutionCompletedEvent"]
    AgentExecutionErrorEvent = events["AgentExecutionErrorEvent"]
    TaskStartedEvent = events["TaskStartedEvent"]
    TaskCompletedEvent = events["TaskCompletedEvent"]
    LLMCallStartedEvent = events["LLMCallStartedEvent"]
    LLMCallCompletedEvent = events["LLMCallCompletedEvent"]
    LLMCallFailedEvent = events["LLMCallFailedEvent"]
    ToolUsageStartedEvent = events["ToolUsageStartedEvent"]
    ToolUsageFinishedEvent = events["ToolUsageFinishedEvent"]
    ToolUsageErrorEvent = events["ToolUsageErrorEvent"]

    _log("adapter: imports ok")

    # ── Crew (Flow) level ──

    @crewai_event_bus.on(CrewKickoffStartedEvent)
    def _on_crew_start(source, event):
        global _flow_span
        _log("CREW_STARTED")
        try:
            crew_name = getattr(event, "crew_name", "") or ""
            _flow_span = Span(kind=SpanKind.FLOW, name=crew_name or "Crew")
            _flow_span.trace_id = uuid.uuid4().hex[:12]
            _flow_span.start()
            _log("CREW_STARTED flow_id=" + _flow_span.id + " trace=" + _flow_span.trace_id)
        except Exception as e:
            _log("CREW_STARTED err: " + str(e))

    @crewai_event_bus.on(CrewKickoffCompletedEvent)
    def _on_crew_completed(source, event):
        global _flow_span, _agent_span
        _log("CREW_COMPLETED")
        try:
            # Finish last agent if still running
            if _agent_span and _agent_span.status == SpanStatus.RUNNING:
                _agent_span.finish(SpanStatus.OK)
                send(_agent_span)
                _agent_span = None
            if _flow_span:
                _flow_span.finish(SpanStatus.OK)
                send(_flow_span)
                _flow_span = None
        except Exception as e:
            _log("CREW_COMPLETED err: " + str(e))

    @crewai_event_bus.on(CrewKickoffFailedEvent)
    def _on_crew_failed(source, event):
        global _flow_span, _agent_span
        _log("CREW_FAILED")
        try:
            if _agent_span and _agent_span.status == SpanStatus.RUNNING:
                _agent_span.finish(SpanStatus.ERROR)
                send(_agent_span)
                _agent_span = None
            if _flow_span:
                _flow_span.finish(SpanStatus.ERROR, str(getattr(event, "error", "")))
                send(_flow_span)
                _flow_span = None
        except Exception as e:
            _log("CREW_FAILED err: " + str(e))

    # ── Agent level ──

    @crewai_event_bus.on(AgentExecutionStartedEvent)
    def _on_agent_start(source, event):
        global _current_agent, _current_task, _agent_span
        try:
            agent = getattr(event, "agent", None)
            if agent:
                _current_agent = getattr(agent, "role", "") or str(agent)[:80]
            task = getattr(event, "task", None)
            if task:
                _current_task = getattr(task, "description", "") or str(task)[:80]

            # Finish previous agent span if any
            if _agent_span and _agent_span.status == SpanStatus.RUNNING:
                _agent_span.finish(SpanStatus.OK)
                send(_agent_span)

            # Create new agent span, parented under flow
            _agent_span = Span(kind=SpanKind.AGENT, name=_current_agent or "Agent")
            _agent_span.metadata["agent_role"] = _current_agent
            _agent_span.metadata["task"] = _current_task[:100] if _current_task else ""
            if _flow_span:
                _agent_span.parent_id = _flow_span.id
                _agent_span.trace_id = _flow_span.trace_id
            _agent_span.start()
            _log("AGENT_START: " + _current_agent[:40] + " id=" + _agent_span.id)
        except Exception as e:
            _log("AGENT_START err: " + str(e))

    @crewai_event_bus.on(AgentExecutionCompletedEvent)
    def _on_agent_completed(source, event):
        global _agent_span
        _log("AGENT_COMPLETED")
        try:
            if _agent_span and _agent_span.status == SpanStatus.RUNNING:
                _agent_span.finish(SpanStatus.OK)
                send(_agent_span)
                _agent_span = None
        except Exception as e:
            _log("AGENT_COMPLETED err: " + str(e))

    @crewai_event_bus.on(AgentExecutionErrorEvent)
    def _on_agent_error(source, event):
        global _agent_span
        _log("AGENT_ERROR")
        try:
            if _agent_span:
                _agent_span.finish(SpanStatus.ERROR, str(getattr(event, "error", "")))
                send(_agent_span)
                _agent_span = None
        except Exception as e:
            _log("AGENT_ERROR err: " + str(e))

    # ── Task level (update context strings) ──

    @crewai_event_bus.on(TaskStartedEvent)
    def _on_task_start(source, event):
        global _current_task
        try:
            task = getattr(event, "task", None)
            if task:
                _current_task = getattr(task, "description", "") or str(task)[:80]
            _log("TASK_START: " + _current_task[:60])
        except Exception as e:
            _log("TASK_START err: " + str(e))

    # ── LLM calls (children of current agent) ──

    @crewai_event_bus.on(LLMCallStartedEvent)
    def _on_llm_started(source, event):
        _log("LLM_STARTED")
        try:
            span = Span(kind=SpanKind.LLM_CALL, name="LLM")
            span.metadata["agent"] = _current_agent
            span.metadata["task"] = _current_task[:80] if _current_task else ""
            # Parent under current agent
            if _agent_span:
                span.parent_id = _agent_span.id
                span.trace_id = _agent_span.trace_id
            elif _flow_span:
                span.trace_id = _flow_span.trace_id
            model = getattr(event, "model", None)
            if model:
                span.metadata["model"] = str(model)
            span.start()
            msgs = getattr(event, "messages", None)
            if isinstance(msgs, list) and msgs:
                span.metadata["prompt_preview"] = str(msgs[-1])[:500]
            elif isinstance(msgs, str):
                span.metadata["prompt_preview"] = msgs[:500]
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
                if _agent_span:
                    span.parent_id = _agent_span.id
                    span.trace_id = _agent_span.trace_id
                span.start()
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
                resp_str = str(resp)
                span.metadata["response_preview"] = resp_str[:500]
                tool_m = re.search(r'(?:write_file|read_file)\s*\(\s*["\u201c]([^")\u201d]+)', resp_str)
                if tool_m:
                    action = "写文件" if "write_file" in tool_m.group(0) else "读文件"
                    span.name = action + " " + tool_m.group(1).split("/")[-1]
                elif _current_task:
                    span.name = _current_task[:50]
                elif _current_agent:
                    span.name = _current_agent[:50]
            if not span.name or span.name == "LLM":
                fallback = _current_task or _current_agent or ""
                if fallback:
                    span.name = fallback[:50]
                elif "response_preview" in span.metadata:
                    span.name = span.metadata["response_preview"][:40]
                else:
                    span.name = "llm_call"
            span.finish(SpanStatus.OK)
            send(span)
            _log("LLM_COMPLETED sent tokens=" + str(span.metadata.get("total_tokens", 0)))
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

    # ── Tool calls (children of current agent) ──

    @crewai_event_bus.on(ToolUsageFinishedEvent)
    def _on_tool_usage(source, event):
        tool_name = getattr(event, "tool_name", "") or "unknown_tool"
        _log("TOOL: " + tool_name)
        try:
            span = Span(kind=SpanKind.TOOL_CALL, name=tool_name)
            span.metadata["agent"] = _current_agent
            span.metadata["task"] = _current_task[:80] if _current_task else ""
            span.metadata["agent_role"] = getattr(event, "agent_role", "") or ""
            if _agent_span:
                span.parent_id = _agent_span.id
                span.trace_id = _agent_span.trace_id
            elif _flow_span:
                span.trace_id = _flow_span.trace_id
            args = getattr(event, "tool_args", "")
            if args:
                span.metadata["tool_input"] = str(args)[:500]
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
            if _agent_span:
                span.parent_id = _agent_span.id
                span.trace_id = _agent_span.trace_id
            span.start()
            span.finish(SpanStatus.ERROR, str(getattr(event, "error", "")))
            send(span)
        except Exception as e:
            _log("TOOL_ERROR err: " + str(e))

    _log("adapter: all listeners registered (Flow > Agent > LLM/Tool)")
