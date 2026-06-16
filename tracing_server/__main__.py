"""Entry point: python -m tracing_server or uv run trace-server

Logging is configured via:
  1. $TRACING_LOG_CONFIG → path to a Python logging config file (JSON/dictConfig)
  2. ~/.tracing/logging.json → fallback config file
  3. Built-in defaults (shown below)
"""

import json
import logging
import logging.config
import os
from pathlib import Path

# ── Default log config ──
DEFAULT_LOG_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "format": "%(asctime)s %(levelname)-5s %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S",
        },
        "access": {
            "()": "uvicorn.logging.AccessFormatter",
            "format": "%(asctime)s %(levelname)-5s %(client_addr)s - \"%(request_line)s\" %(status_code)s",
            "datefmt": "%Y-%m-%d %H:%M:%S",
        },
    },
    "handlers": {
        "default": {
            "class": "logging.StreamHandler",
            "formatter": "default",
            "stream": "ext://sys.stdout",
        },
        "access": {
            "class": "logging.StreamHandler",
            "formatter": "access",
            "stream": "ext://sys.stdout",
        },
    },
    "loggers": {
        "uvicorn": {"handlers": ["default"], "level": "INFO"},
        "uvicorn.error": {"level": "INFO"},
        "uvicorn.access": {"handlers": ["access"], "level": "INFO", "propagate": False},
        "tracing": {"handlers": ["default"], "level": "DEBUG", "propagate": False},
    },
}


def _load_log_config() -> dict:
    """Load logging config from file or return defaults."""
    # 1. Explicit env var
    config_path = os.environ.get("TRACING_LOG_CONFIG", "")
    if config_path and os.path.isfile(config_path):
        with open(config_path, encoding="utf-8") as f:
            return json.load(f)

    # 2. Default path
    default_path = Path.home() / ".tracing" / "logging.json"
    if default_path.is_file():
        with open(default_path, encoding="utf-8") as f:
            return json.load(f)

    # 3. Built-in
    return DEFAULT_LOG_CONFIG


logging.config.dictConfig(_load_log_config())

import uvicorn

def main():
    uvicorn.run(
        "tracing_server.app:app",
        host="0.0.0.0",
        port=9200,
        log_config=None,  # use our config, not uvicorn's default
        timeout_graceful_shutdown=1,
        timeout_keep_alive=2,
    )

if __name__ == "__main__":
    main()
