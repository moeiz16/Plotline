"""Pure-ASGI middleware (streaming/SSE safe): request id, access log, metrics, security headers and the
HTTP cache policy (`no-store` for API JSON unless a route sets its own Cache-Control)."""

from __future__ import annotations

import re
import time
import uuid

import structlog
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import get_settings
from app.core.logging import request_id_ctx
from app.core.metrics import HTTP_LATENCY, HTTP_REQUESTS

log = structlog.get_logger("plotline.access")

_RID_RE = re.compile(r"^[A-Za-z0-9._-]{8,64}$")
_UUID_RE = re.compile(r"/[0-9a-fA-F-]{32,36}(?=/|$)")
_TOKEN_RE = re.compile(r"/(portal|invitations)/[A-Za-z0-9_\-]{16,}")


def route_label(path: str) -> str:
    """Low-cardinality route label for metrics (ids and tokens collapsed)."""
    path = _TOKEN_RE.sub(r"/\1/{token}", path)
    return _UUID_RE.sub("/{id}", path)


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = ""
        for k, v in scope.get("headers", []):
            if k.lower() == b"x-request-id":
                incoming = v.decode("latin-1")
                break
        rid = incoming if _RID_RE.match(incoming) else uuid.uuid4().hex
        token = request_id_ctx.set(rid)
        started = time.perf_counter()
        status_holder = {"status": 500}

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", rid.encode()))
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            elapsed = time.perf_counter() - started
            path = scope.get("path", "")
            method = scope.get("method", "GET")
            label = route_label(path)
            HTTP_REQUESTS.labels(method, label, str(status_holder["status"])).inc()
            HTTP_LATENCY.labels(method, label).observe(elapsed)
            if not path.endswith(("/health", "/metrics")):
                log.info(
                    "request",
                    method=method,
                    path=label,
                    status=status_holder["status"],
                    ms=round(elapsed * 1000, 1),
                )
            request_id_ctx.reset(token)


_API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
_DOCS_CSP = (
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; "
    "frame-ancestors 'none'"
)
# The evidence pack is a printable HTML document: inline styles only, no scripts.
_DOC_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'self'"


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.hsts = get_settings().is_prod

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path: str = scope.get("path", "")
        if path.startswith(("/docs", "/redoc", "/openapi")):
            csp = _DOCS_CSP
        elif path.endswith((".html", ".pdf")):
            csp = _DOC_CSP
        else:
            csp = _API_CSP
        frame = b"SAMEORIGIN" if path.endswith((".html", ".pdf")) else b"DENY"

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                hdrs = [
                    (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", frame),
                    (b"referrer-policy", b"no-referrer"),
                    (b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=()"),
                    (b"cross-origin-opener-policy", b"same-origin"),
                    (b"cross-origin-resource-policy", b"same-origin"),
                    (b"content-security-policy", csp.encode()),
                ]
                if self.hsts:
                    hdrs.append((b"strict-transport-security", b"max-age=63072000; includeSubDomains"))
                existing = {k.lower() for k, _ in message.get("headers", [])}
                message["headers"] = list(message.get("headers", [])) + [
                    h for h in hdrs if h[0] not in existing
                ]
            await send(message)

        await self.app(scope, receive, send_wrapper)


class CachePolicyMiddleware:
    """API responses are `no-store` unless the route chose a policy (imagery PNGs, SSE)."""

    def __init__(self, app: ASGIApp, *, api_prefix: str = "/api/v1") -> None:
        self.app = app
        self.api_prefix = api_prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope.get("path", "").startswith(self.api_prefix):
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                if not any(k.lower() == b"cache-control" for k, _ in headers):
                    headers.append((b"cache-control", b"no-store"))
                    message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_wrapper)
