"""Authentication flows: sign-up, sign-in, refresh rotation with reuse detection, `Me` payloads."""

from __future__ import annotations

import hashlib
import re
import uuid
from dataclasses import dataclass
from datetime import date, timedelta

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import conflict, unauthorized
from app.core.permissions import permissions_for, role_label
from app.core.security import (
    create_access_token,
    hash_password,
    hash_token,
    needs_rehash,
    new_refresh_token,
    parse_refresh_token,
    tokens_equal,
    validate_password_strength,
    verify_password,
)
from app.db.base import utcnow
from app.db.models.platform import Membership, Organization, User, UserSession
from app.services.audit import audit

log = structlog.get_logger(__name__)

AVATAR_COLORS = ("#3F6B4E", "#8A5A2B", "#4C6A86", "#7A4E6B", "#A06A1F", "#2F6D6A", "#6B5B3E", "#5A6B2F")
DEFAULT_ORG_SETTINGS = {"retentionYears": 5, "reviewAllHighRisk": True, "autoAssess": True}


@dataclass
class IssuedTokens:
    access_token: str
    refresh_token: str
    session: UserSession


def normalize_email(email: str) -> str:
    return email.strip().lower()


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:60] or "org"


async def unique_slug(db: AsyncSession, name: str) -> str:
    base = slugify(name)
    slug, n = base, 1
    while (await db.execute(select(Organization.id).where(Organization.slug == slug))).first():
        n += 1
        slug = f"{base}-{n}"
    return slug


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    return (await db.execute(select(User).where(User.email == normalize_email(email)))).scalar_one_or_none()


async def user_orgs(db: AsyncSession, user_id: uuid.UUID) -> list[tuple[Organization, Membership]]:
    rows = (
        await db.execute(
            select(Organization, Membership)
            .join(Membership, Membership.org_id == Organization.id)
            .where(Membership.user_id == user_id, Membership.status == "active")
            .order_by(Membership.created_at)
        )
    ).all()
    return [(o, m) for o, m in rows]


async def create_user(db: AsyncSession, *, email: str, password: str, full_name: str) -> User:
    email = normalize_email(email)
    if await get_user_by_email(db, email):
        raise conflict("email_taken", "An account with this email already exists.")
    validate_password_strength(password)
    user = User(
        email=email,
        full_name=full_name.strip(),
        password_hash=hash_password(password),
        avatar_color=AVATAR_COLORS[int(hashlib.sha256(email.encode()).hexdigest(), 16) % len(AVATAR_COLORS)],
        preferences={},
    )
    db.add(user)
    await db.flush()
    return user


async def create_org(
    db: AsyncSession,
    *,
    name: str,
    owner: User,
    country: str | None = None,
    eori: str | None = None,
    address: str | None = None,
    operator_size: str = "large",
) -> Organization:
    org = Organization(
        name=name.strip(),
        slug=await unique_slug(db, name),
        country=country,
        eori=eori,
        address=address,
        operator_size=operator_size,
        settings=dict(DEFAULT_ORG_SETTINGS),
    )
    db.add(org)
    await db.flush()
    db.add(Membership(org_id=org.id, user_id=owner.id, role="owner", status="active"))
    await db.flush()
    return org


async def issue_session(
    db: AsyncSession, user: User, *, org_id: uuid.UUID | None, ip: str | None, user_agent: str | None
) -> IssuedTokens:
    s = get_settings()
    sess = UserSession(
        user_id=user.id,
        refresh_token_hash="pending",  # noqa: S106 - placeholder, replaced once the id exists
        active_org_id=org_id,
        ip=ip,
        user_agent=(user_agent or "")[:400] or None,
        expires_at=utcnow() + timedelta(days=s.refresh_token_ttl_days),
    )
    db.add(sess)
    await db.flush()
    refresh = new_refresh_token(sess.id)
    sess.refresh_token_hash = hash_token(refresh)
    return IssuedTokens(create_access_token(user.id, org_id, sess.id), refresh, sess)


async def pick_active_org(db: AsyncSession, user: User) -> uuid.UUID | None:
    orgs = await user_orgs(db, user.id)
    if not orgs:
        return None
    last = (user.preferences or {}).get("lastOrgId")
    for org, _m in orgs:
        if str(org.id) == last:
            return org.id
    return orgs[0][0].id


async def authenticate(
    db: AsyncSession, *, email: str, password: str, ip: str | None, user_agent: str | None
) -> User:
    user = await get_user_by_email(db, email)
    ok = verify_password(password, user.password_hash if user else None)
    if not user or not ok or not user.is_active:
        if user:
            for org, _m in await user_orgs(db, user.id):
                await audit(
                    db,
                    None,
                    org_id=org.id,
                    action="auth.login_failed",
                    resource_type="user",
                    resource_id=user.id,
                    actor_id=user.id,
                    actor_type="user",
                    ip=ip,
                    user_agent=user_agent,
                )
            await db.commit()  # keep the failed-attempt record even though the request errors
        raise unauthorized("Incorrect email or password.", code="invalid_credentials")
    if user.password_hash and needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    user.last_login_at = utcnow()
    return user


async def rotate_refresh(
    db: AsyncSession, refresh_token: str, *, ip: str | None, user_agent: str | None
) -> tuple[IssuedTokens, User]:
    """Rotate a refresh token. Presenting a superseded token revokes the session (theft signal)."""
    session_id = parse_refresh_token(refresh_token)
    sess = await db.get(UserSession, session_id)
    now = utcnow()
    if not sess or sess.revoked_at or sess.expires_at < now:
        raise unauthorized("Your session has ended. Please sign in again.", code="session_revoked")
    if not tokens_equal(sess.refresh_token_hash, hash_token(refresh_token)):
        sess.revoked_at, sess.revoked_reason = now, "refresh_reuse"
        if sess.active_org_id:
            await audit(
                db,
                None,
                org_id=sess.active_org_id,
                action="auth.refresh_reuse_detected",
                resource_type="session",
                resource_id=sess.id,
                actor_id=sess.user_id,
                ip=ip,
                user_agent=user_agent,
            )
        await db.commit()
        log.warning("refresh_token_reuse_detected", session_id=str(sess.id))
        raise unauthorized(
            "You were signed out for your security. Please sign in again.", code="session_revoked"
        )
    user = await db.get(User, sess.user_id)
    if not user or not user.is_active:
        raise unauthorized("This account is no longer active.", code="unauthorized")
    org_id = sess.active_org_id
    if org_id:
        member = (
            await db.execute(
                select(Membership).where(
                    Membership.org_id == org_id, Membership.user_id == user.id, Membership.status == "active"
                )
            )
        ).scalar_one_or_none()
        if not member:
            org_id = sess.active_org_id = await pick_active_org(db, user)
    new_refresh = new_refresh_token(sess.id)
    sess.refresh_token_hash = hash_token(new_refresh)
    sess.rotation_count = (sess.rotation_count or 0) + 1
    sess.last_used_at = now
    return IssuedTokens(create_access_token(user.id, org_id, sess.id), new_refresh, sess), user


async def revoke_session(db: AsyncSession, session_id: uuid.UUID, reason: str = "logout") -> None:
    await db.execute(
        update(UserSession)
        .where(UserSession.id == session_id, UserSession.revoked_at.is_(None))
        .values(revoked_at=utcnow(), revoked_reason=reason)
    )


# ── Serialisers ──────────────────────────────────────────────────────────────
def user_out(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "fullName": user.full_name,
        "avatarColor": user.avatar_color,
        "createdAt": user.created_at.isoformat() if user.created_at else None,
    }


def deadline_for(org: Organization) -> dict:
    s = get_settings()
    when = s.deadline_sme if org.operator_size == "sme" else s.deadline_large
    return {"date": when.isoformat(), "daysLeft": max((when - date.today()).days, 0)}


def org_out(org: Organization) -> dict:
    settings = {**DEFAULT_ORG_SETTINGS, **(org.settings or {})}
    return {
        "id": str(org.id),
        "name": org.name,
        "slug": org.slug,
        "eori": org.eori,
        "address": org.address,
        "country": org.country,
        "operatorSize": org.operator_size,
        "settings": settings,
        "deadline": deadline_for(org),
        "createdAt": org.created_at.isoformat() if org.created_at else None,
    }


def org_summary(org: Organization, membership: Membership) -> dict:
    return {"id": str(org.id), "name": org.name, "slug": org.slug, "role": membership.role}


async def me_payload(db: AsyncSession, user: User, org_id: uuid.UUID | None) -> dict:
    orgs = await user_orgs(db, user.id)
    active = next(((o, m) for o, m in orgs if o.id == org_id), None)
    membership = None
    if active:
        m = active[1]
        membership = {
            "role": m.role,
            "roleLabel": role_label(m.role),
            "permissions": permissions_for(m.role),
            "supplierId": str(m.supplier_id) if m.supplier_id else None,
        }
    return {
        "user": user_out(user),
        "activeOrg": org_out(active[0]) if active else None,
        "membership": membership,
        "orgs": [org_summary(o, m) for o, m in orgs],
    }
