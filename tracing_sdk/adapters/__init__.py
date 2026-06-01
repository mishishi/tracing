"""Adapter registry — each adapter patches its target framework if available."""

import logging

logger = logging.getLogger("tracing.sdk")


def patch_all():
    """Auto-detect and patch all available frameworks. Silently skip unavailable ones."""
    try:
        from . import crewai_adapter
        crewai_adapter._patch_crewai()
    except (ImportError, Exception) as e:
        logger.debug(f"CrewAI adapter skipped: {e}")

    try:
        from . import openai_adapter
        openai_adapter._patch_openai()
    except (ImportError, Exception) as e:
        logger.debug(f"OpenAI adapter skipped: {e}")

    logger.info("Tracing auto-instrumentation complete")
