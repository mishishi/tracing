"""tracing-sdk — Zero-code auto-instrumentation for AI agent frameworks.

Usage:
    import tracing_sdk            # auto-detect localhost:9200
    tracing_sdk.init(project="my-project")  # explicit init
    tracing_sdk.configure(endpoint="http://prod:9200", project="my-project")
"""

__version__ = "0.2.0"

import logging
_log = logging.getLogger("tracing.sdk")

_ENABLED = False


def _try_enable():
    """Try to auto-enable tracing with default endpoint."""
    global _ENABLED
    if _ENABLED:
        return

    import os
    from .collector import _lazy_enable, configure

    endpoint = os.environ.get("TRACING_ENDPOINT", "")
    project = os.environ.get("TRACING_PROJECT", "")

    if endpoint or project:
        configure(endpoint=endpoint or None, project=project or None)

    if _lazy_enable():
        _ENABLED = True
        _log.info("Tracing SDK enabled")
        try:
            from .adapters import patch_all
            patch_all()
        except Exception as e:
            _log.error("Tracing patch failed: %s", e, exc_info=True)
    else:
        _log.info("Tracing server not found, SDK disabled (set TRACING_ENDPOINT to enable)")


def init(endpoint: str = None, project: str = None, sample_rate: float = None):
    """Explicitly initialize tracing.

    Args:
        endpoint: Tracing server URL. Default: http://localhost:9200
        project: Project name for grouping spans.
    """
    from .collector import configure, _lazy_enable
    if endpoint or project:
        configure(endpoint=endpoint, project=project)
    _try_enable()


def configure(endpoint: str = None, project: str = None, sample_rate: float = None):
    """Same as init()."""
    init(endpoint=endpoint, project=project, sample_rate=sample_rate)


# Auto-init on import if endpoint configured
import os
if os.environ.get("TRACING_ENDPOINT"):
    _try_enable()

