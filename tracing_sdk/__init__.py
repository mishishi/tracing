"""tracing-sdk — Zero-code auto-instrumentation for AI agent frameworks."""

__version__ = "0.1.0"

import os
_endpoint = os.environ.get("TRACING_ENDPOINT", "")

if _endpoint:
    import logging
    _log = logging.getLogger("tracing.sdk")
    _log.warning("=" * 50)
    _log.warning("TRACING ENABLED -> %s", _endpoint)
    _log.warning("=" * 50)
    try:
        from .adapters import patch_all
        patch_all()
    except Exception as _e:
        _log.error("Tracing patch failed: %s", _e, exc_info=True)
