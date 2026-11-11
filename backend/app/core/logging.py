"""Structured logging with request-id correlation and secret / personal-data redaction."""

from __future__ import annotations

import logging
import re
import sys
from contextvars import ContextVar
from typing import Any

import structlog

request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)

_SENSITIVE_KEYS = re.compile(
    r"(pass(word)?|secret|token|authorization|cookie|api[_-]?key|producer_?name|phone|address)",
    re.IGNORECASE,
)
_EMAIL = re.compile(r"([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})")
_BEARER = re.compile(r"(Bearer\s+)[A-Za-z0-9._\-]+", re.IGNORECASE)
_PORTAL = re.compile(r"(/portal/)[A-Za-z0-9_\-]{16,}")


def scrub_str(value: str) -> str:
    value = _BEARER.sub(r"\1[redacted]", value)
    value = _PORTAL.sub(r"\1[redacted]", value)
    return _EMAIL.sub(r"\1***\2", value)


def _scrub(value: Any, depth: int = 0) -> Any:
    if depth > 4:
        return value
    if isinstance(value, str):
        return scrub_str(value)
    if isinstance(value, dict):
        return {
            k: ("[redacted]" if isinstance(k, str) and _SENSITIVE_KEYS.search(k) else _scrub(v, depth + 1))
            for k, v in value.items()
        }
    if isinstance(value, list | tuple):
        return [_scrub(v, depth + 1) for v in value]
    return value


def redact_processor(_logger: Any, _method: str, event_dict: dict) -> dict:
    """Keep secrets and personal data (GDPR data minimisation) out of log sinks."""
    for key in list(event_dict):
        if key in ("level", "timestamp", "logger", "request_id"):
            continue
        if key == "event":
            if isinstance(event_dict[key], str):
                event_dict[key] = scrub_str(event_dict[key])
            continue
        if _SENSITIVE_KEYS.search(key):
            event_dict[key] = "[redacted]"
        else:
            event_dict[key] = _scrub(event_dict[key])
    return event_dict


def _add_request_id(_logger: Any, _method: str, event_dict: dict) -> dict:
    rid = request_id_ctx.get()
    if rid:
        event_dict.setdefault("request_id", rid)
    return event_dict


def configure_logging(level: str = "INFO", json_logs: bool = False) -> None:
    shared: list[Any] = [
        structlog.contextvars.merge_contextvars,
        _add_request_id,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        redact_processor,
    ]
    renderer = (
        structlog.processors.JSONRenderer() if json_logs else structlog.dev.ConsoleRenderer(colors=False)
    )
    structlog.configure(
        processors=[*shared, structlog.processors.format_exc_info, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(level.upper())),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )
    logging.basicConfig(level=level.upper(), stream=sys.stdout, format="%(levelname)s %(name)s: %(message)s")
    for noisy in ("httpx", "httpcore", "LiteLLM", "litellm", "aiosqlite", "asyncio", "temporalio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
