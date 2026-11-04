"""Shared FastAPI dependencies: database session, authenticated request context, RBAC.

@router.get("/things")
async def list_things(ctx: Ctx = Depends(require_perm("plots:read")), db: AsyncSession = Depends(get_db)):
"""

from __future__ import annotations

import uuid
from collections.abc import Callable, Coroutine
from dataclasses import dataclass, field
from typing import Any

from fastapi import Depends, Request
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clientip import resolve_client_ip
from app.core.errors import AppError, forbidden, unauthorized
from app.core.logging import request_id_ctx
from app.core.permissions import permissions_for
from app.core.security import AccessClaims, decode_access_token, tokens_equal
from app.db.models.platform import Membership, Organization, User, UserSession
from app.db.session import get_db

__all__ = [
    "ACCESS_COOKIE",
    "CSRF_COOKIE",
    "CSRF_HEADER",
    "REFRESH_COOKIE",
    "RequestContext",
    "check_csrf",
    "client_ip",
    "get_ctx",
    "get_db",
    "get_optional_ctx",
    "get_user_ctx",
    "require_perm",
]

ACCESS_COOKIE = "pl_at"
REFRESH_COOKIE = "pl_rt"
CSRF_COOKIE = "pl_csrf"
CSRF_HEADER = "X-CSRF-Token"
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


@dataclass
class RequestContext:
    user: User
    org: Organization | None
    membership: Membership | None
    role: str | None
    request_id: str | None
    ip: str | None
    user_agent: str | None
    session_id: uuid.UUID | None = None
    permissions: set[str] = field(default_factory=set)

    actor_type: str = "user"

    @property
    def org_id(self) -> uuid.UUID:
        if not self.org:
            raise AppError(
                403, "no_active_org", "No active organisation", "Join or create an organisation first."
            )
        return self.org.id

    @property
    def supplier_scope(self) -> uuid.UUID | None:
        """For the supplier role: the only supplier whose data this user may see."""
        if self.role == "supplier":
            return self.membership.supplier_id if self.membership else None
        return None

    @property
    def is_supplier(self) -> bool:
        return self.role == "supplier"

    def has(self, perm: str) -> bool:
        return perm in self.permissions


def client_ip(request: Request) -> str | None:
    peer = request.client.host if request.client else None
    return resolve_client_ip(peer, request.headers.get("x-forwarded-for"))


def _extract_credentials(request: Request) -> tuple[str | None, str]:
    """Returns (token, source) where source is 'bearer' | 'cookie' | 'none'."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip(), "bearer"
    cookie = request.cookies.get(ACCESS_COOKIE)
    if cookie:
        return cookie, "cookie"
    return None, "none"


def check_csrf(request: Request) -> None:
    """Double-submit check for cookie-authenticated unsafe requests."""
    if request.method in _SAFE_METHODS:
        return
    cookie = request.cookies.get(CSRF_COOKIE)
    header = request.headers.get(CSRF_HEADER)
    if not cookie or not header or not tokens_equal(cookie, header):
        raise AppError(
            403,
            "csrf_failed",
            "Security check failed",
            "Please refresh the page and try again.",
        )


async def _load_identity(
    db: AsyncSession, claims: AccessClaims
) -> tuple[User | None, bool, Membership | None, Organization | None]:
    """User, session liveness, active membership and org for an access token in one statement."""
    cols: list[Any] = [User]
    if claims.session_id:
        cols += [UserSession.revoked_at, UserSession.id]
    if claims.org_id:
        cols += [Membership, Organization]
    stmt = select(*cols).select_from(User).where(User.id == claims.user_id)
    if claims.session_id:
        stmt = stmt.outerjoin(UserSession, UserSession.id == claims.session_id)
    if claims.org_id:
        stmt = stmt.outerjoin(
            Membership,
            and_(
                Membership.org_id == claims.org_id,
                Membership.user_id == User.id,
                Membership.status == "active",
            ),
        ).outerjoin(Organization, Organization.id == Membership.org_id)
    row = (await db.execute(stmt)).first()
    if row is None:
        return None, False, None, None
    user = row[0]
    idx = 1
    session_ok = True
    if claims.session_id:
        revoked_at, sess_id = row[idx], row[idx + 1]
        session_ok = sess_id is not None and revoked_at is None
        idx += 2
    membership = org = None
    if claims.org_id:
        membership, org = row[idx], row[idx + 1]
        if membership is None:
            org = None
    return user, session_ok, membership, org


async def _resolve(request: Request, db: AsyncSession, *, optional: bool) -> RequestContext | None:
    token, source = _extract_credentials(request)
    if not token:
        if optional:
            return None
        raise unauthorized()
    try:
        claims = decode_access_token(token)
    except AppError:
        if optional:
            return None
        raise
    if source == "cookie":
        check_csrf(request)
    user, session_ok, membership, org = await _load_identity(db, claims)
    if not user or not user.is_active:
        raise unauthorized("This account is no longer active.", code="unauthorized")
    if not session_ok:
        raise unauthorized("You were signed out. Please sign in again.", code="session_revoked")
    role = membership.role if membership else None
    return RequestContext(
        user=user,
        org=org,
        membership=membership,
        role=role,
        request_id=request_id_ctx.get(),
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent"),
        session_id=claims.session_id,
        permissions=set(permissions_for(role)),
    )


async def get_optional_ctx(request: Request, db: AsyncSession = Depends(get_db)) -> RequestContext | None:
    return await _resolve(request, db, optional=True)


async def get_user_ctx(request: Request, db: AsyncSession = Depends(get_db)) -> RequestContext:
    """Authenticated user; an active organisation is NOT required."""
    ctx = await _resolve(request, db, optional=False)
    assert ctx is not None
    return ctx


async def get_ctx(ctx: RequestContext = Depends(get_user_ctx)) -> RequestContext:
    """Authenticated user with an active organisation membership."""
    if not ctx.org:
        raise AppError(
            403, "no_active_org", "No active organisation", "Join or create an organisation first."
        )
    return ctx


def require_perm(perm: str) -> Callable[..., Coroutine[Any, Any, RequestContext]]:
    async def _dep(ctx: RequestContext = Depends(get_ctx)) -> RequestContext:
        if not ctx.has(perm):
            raise forbidden()
        return ctx

    _dep.__name__ = f"require_{perm.replace(':', '_')}"
    return _dep
