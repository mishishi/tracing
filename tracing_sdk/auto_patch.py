"""
Auto-patch entry point.

This module is triggered by the .pth file installed alongside the package.
It checks TRACING_ENDPOINT and, if set, auto-instruments all frameworks.
"""

import os
import logging

logger = logging.getLogger("tracing.sdk")

_endpoint = os.environ.get("TRACING_ENDPOINT", "")
if _endpoint:
    logger.info(f"Tracing enabled → {_endpoint}")
    from .adapters import patch_all
    patch_all()
else:
    logger.debug("Tracing not enabled (TRACING_ENDPOINT not set)")
