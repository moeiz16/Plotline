"""Rate limiting: in-memory sliding-window log per key.

Buckets: `auth` (sign-in, sign-up, invitation accept; strict), `portal` (public supplier links: per IP and
per token) and `api` (everything else). Health, metrics and SSE streams are exempt.
"""

from __future__ import annotations

import asyncio
import hashlib
import math
import re
import time
from collections import defaultdict, deque
from dataclasses import dataclass

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.clientip import resolve_client_ip
from app.core.config import get_settings
from app.core.errors import problem
from app.core.metrics import RATE_LIMITED

_AUTH_SENSITIVE = re.compile(r"/auth/(login|signup|refresh)$|/invitations/[^/]+/accept$")
_PORTAL = re.compile(r"/portal/([^/]+)")
_EXEMPT_SUFFIXES = ("/health", "/health/ready", "/metrics", "/events")


@dataclass
class Decision:
    allowed: bool
    limit: int
    remaining: int
    reset_s: int


class InMemoryLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def hit(self, key: str, limit: int, window_s: int = 60) -> Decision:
        now = time.monotonic()
        async with self._lock:
            q = self._hits[key]
            while q and now - q[0] >= window_s:
                q.popleft()
            if len(q) >= limit:
                reset = math.ceil(window_s - (now - q[0])) if q else window_s
                return Decision(False, limit, 0, max(reset, 1))
            q.append(now)
            if len(self._hits) > 50_000:  # bound memory under key churn
                for k in [k for k, v in self._hits.items() if not v][:10_000]:
                    self._hits.pop(k, None)
            return Decision(True, limit, limit - len(q), window_s)

    def reset(self) -> None:
        self._hits.clear()


limiter = InMemoryLimiter()


def _client_key(scope: Scope) -> str:
    fwd = None
    for k, v in scope.get("headers", []):
        if k.lower() == b"x-forwarded-for":
            fwd = v.decode("latin-1")
    client = scope.get("client")
    peer = client[0] if client else None
    return resolve_client_ip(peer, fwd) or "unknown"


class RateLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path: str = scope.get("path", "")
        if path.endswith(_EXEMPT_SUFFIXES) or scope.get("method") == "OPTIONS":
            await self.app(scope, receive, send)
            return
        s = get_settings()
        ip = _client_key(scope)
        checks: list[tuple[str, str, int]] = []
        portal = _PORTAL.search(path)
        if _AUTH_SENSITIVE.search(path):
            checks.append(("auth", f"auth:{ip}", s.auth_rate_limit_per_minute))
        elif portal:
            token_key = hashlib.sha256(portal.group(1).encode()).hexdigest()[:16]
            checks.append(("portal", f"portal-ip:{ip}", s.portal_rate_limit_per_minute))
            checks.append(("portal", f"portal-token:{token_key}", s.portal_rate_limit_per_minute))
        else:
            checks.append(("api", f"api:{ip}", s.rate_limit_per_minute))

        decision: Decision | None = None
        for bucket, key, limit in checks:
            decision = await limiter.hit(key, limit)
            if not decision.allowed:
                RATE_LIMITED.labels(bucket).inc()
                resp = problem(
                    429,
                    "Too many requests",
                    code="rate_limited",
                    detail=f"Too many requests. Please wait {decision.reset_s} seconds and try again.",
                    headers={"Retry-After": str(decision.reset_s)},
                )
                await resp(scope, receive, send)
                return
        assert decision is not None
        rl_headers = [
            (b"x-ratelimit-limit", str(decision.limit).encode()),
            (b"x-ratelimit-remaining", str(decision.remaining).encode()),
        ]

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                message["headers"] = list(message.get("headers", [])) + rl_headers
            await send(message)

        await self.app(scope, receive, send_with_headers)
