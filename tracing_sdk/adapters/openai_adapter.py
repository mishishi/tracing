"""OpenAI adapter — monkey-patches openai.OpenAI().chat.completions.create."""

import logging
from ..span import Span, SpanKind, SpanStatus
from ..collector import send

logger = logging.getLogger("tracing.openai")
_patched = False


def _patch_openai():
    global _patched
    if _patched:
        return
    try:
        from openai import OpenAI
    except ImportError:
        return

    original_create = OpenAI.chat.completions.create

    def traced_create(self, *args, **kwargs):
        span = Span(
            kind=SpanKind.LLM_CALL,
            name="openai.chat",
            metadata={
                "model": kwargs.get("model", "unknown"),
                "messages_count": len(kwargs.get("messages", [])),
                "prompt_preview": str(kwargs.get("messages", []))[:500],
                "prompt": str(kwargs.get("messages", []))[:32000],
            },
        )
        span.start()

        try:
            result = original_create(self, *args, **kwargs)
            usage = getattr(result, "usage", None)
            if usage:
                span.metadata["input_tokens"] = usage.prompt_tokens or 0
                span.metadata["output_tokens"] = usage.completion_tokens or 0
                span.metadata["total_tokens"] = usage.total_tokens or 0
            content = getattr(result.choices[0].message, "content", "") if result.choices else ""
            span.metadata["response_preview"] = str(content)[:500]
            span.metadata["response"] = str(content)[:32000]
            span.finish(SpanStatus.OK)
            send(span)
            return result
        except Exception as e:
            span.finish(SpanStatus.ERROR, str(e))
            send(span)
            raise

    OpenAI.chat.completions.create = traced_create
    _patched = True
    logger.info("OpenAI auto-instrumented")
