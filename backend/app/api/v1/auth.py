"""Authentication endpoints: httpOnly cookie sessions with double-submit CSRF (bearer also accepted)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import (
    ACCESS_COOKIE,
    CSRF_COOKIE,
    REFRESH_COOKIE,
    RequestContext,
    check_csrf,
    client_ip,
    get_db,
    get_user_ctx,
)
from app.core.errors import not_found, unauthorized
from app.core.security import create_access_token, new_csrf_token
from app.db.models.platform import UserSession
from app.schemas.platform import LoginIn, SignupIn, SwitchOrgIn
from app.services import auth as auth_svc
from app.services.audit import audit

router = APIRouter(prefix="/auth", tags=["auth"])


def set_auth_cookies(
    response: Response, tokens: auth_svc.IssuedTokens | None = None, *, access_token: str | None = None
) -> str:
    s = get_settings()
    common: dict[str, Any] = {"secure": s.cookie_secure, "samesite": "lax", "domain": s.cookie_domain}
    access = tokens.access_token if tokens else access_token
    if access:
        response.set_cookie(
            ACCESS_COOKIE, access, max_age=s.access_token_ttl_minutes * 60, httponly=True, path="/", **common
        )
    if tokens:
        response.set_cookie(
            REFRESH_COOKIE,
            tokens.refresh_token,
            max_age=s.refresh_token_ttl_days * 86400,
            httponly=True,
            path=f"{s.api_prefix}/auth",
            **common,
        )
    csrf = new_csrf_token()
    response.set_cookie(
        CSRF_COOKIE, csrf, max_age=s.refresh_token_ttl_days * 86400, httponly=False, path="/", **common
    )
    return csrf


def clear_auth_cookies(response: Response) -> None:
    s = get_settings()
    response.delete_cookie(ACCESS_COOKIE, path="/", domain=s.cookie_domain)
    response.delete_cookie(REFRESH_COOKIE, path=f"{s.api_prefix}/auth", domain=s.cookie_domain)
    response.delete_cookie(CSRF_COOKIE, path="/", domain=s.cookie_domain)


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(
    body: SignupIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)
) -> dict:
    user = await auth_svc.create_user(db, email=body.email, password=body.password, full_name=body.full_name)
    org_id = None
    if body.org_name:
        org = await auth_svc.create_org(db, name=body.org_name, owner=user)
        org_id = org.id
        await audit(
            db,
            None,
            org_id=org.id,
            actor_id=user.id,
            action="org.created",
            resource_type="org",
            resource_id=org.id,
            metadata={"name": org.name},
            ip=client_ip(request),
        )
        await audit(
            db,
            None,
            org_id=org.id,
            actor_id=user.id,
            action="auth.signup",
            resource_type="user",
            resource_id=user.id,
            ip=client_ip(request),
        )
    tokens = await auth_svc.issue_session(
        db, user, org_id=org_id, ip=client_ip(request), user_agent=request.headers.get("user-agent")
    )
    await db.commit()
    set_auth_cookies(response, tokens)
    return {"user": auth_svc.user_out(user), "activeOrgId": str(org_id) if org_id else None}


@router.post("/login")
async def login(
    body: LoginIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)
) -> dict:
    ip, ua = client_ip(request), request.headers.get("user-agent")
    user = await auth_svc.authenticate(db, email=body.email, password=body.password, ip=ip, user_agent=ua)
    org_id = await auth_svc.pick_active_org(db, user)
    tokens = await auth_svc.issue_session(db, user, org_id=org_id, ip=ip, user_agent=ua)
    if org_id:
        await audit(
            db,
            None,
            org_id=org_id,
            actor_id=user.id,
            action="auth.login",
            resource_type="user",
            resource_id=user.id,
            ip=ip,
            user_agent=ua,
        )
    await db.commit()
    set_auth_cookies(response, tokens)
    orgs = await auth_svc.user_orgs(db, user.id)
    return {
        "user": auth_svc.user_out(user),
        "orgs": [auth_svc.org_summary(o, m) for o, m in orgs],
        "activeOrgId": str(org_id) if org_id else None,
    }


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    refresh = request.cookies.get(REFRESH_COOKIE)
    if refresh or request.cookies.get(ACCESS_COOKIE):
        check_csrf(request)
    if refresh:
        try:
            sid = auth_svc.parse_refresh_token(refresh)
            await auth_svc.revoke_session(db, sid)
            await db.commit()
        except Exception:  # noqa: S110 - logout always succeeds for the client
            pass
    clear_auth_cookies(response)
    return response


@router.post("/refresh")
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> dict:
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise unauthorized("Please sign in again.", code="unauthorized")
    check_csrf(request)
    tokens, _user = await auth_svc.rotate_refresh(
        db, token, ip=client_ip(request), user_agent=request.headers.get("user-agent")
    )
    await db.commit()
    set_auth_cookies(response, tokens)
    return {"ok": True}


@router.get("/me")
async def me(ctx: RequestContext = Depends(get_user_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    return await auth_svc.me_payload(db, ctx.user, ctx.org.id if ctx.org else None)


@router.post("/switch-org")
async def switch_org(
    body: SwitchOrgIn,
    response: Response,
    ctx: RequestContext = Depends(get_user_ctx),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rows = await auth_svc.user_orgs(db, ctx.user.id)
    match = next(((o, m) for o, m in rows if o.id == body.org_id), None)
    if not match:
        raise not_found("Organisation")
    org, _member = match
    ctx.user.preferences = {**(ctx.user.preferences or {}), "lastOrgId": str(org.id)}
    if ctx.session_id:
        sess = await db.get(UserSession, ctx.session_id)
        if sess:
            sess.active_org_id = org.id
    await audit(db, ctx, org_id=org.id, action="auth.switch_org", resource_type="org", resource_id=org.id)
    await db.commit()
    set_auth_cookies(response, access_token=create_access_token(ctx.user.id, org.id, ctx.session_id))
    return await auth_svc.me_payload(db, ctx.user, org.id)
