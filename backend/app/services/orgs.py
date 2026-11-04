"""Organisation, member and invitation management."""

from __future__ import annotations

import uuid
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import RequestContext
from app.core.errors import AppError, conflict, forbidden, not_found, validation_error
from app.core.permissions import role_label
from app.core.security import hash_token, new_link_token
from app.db.base import utcnow
from app.db.models.domain import Supplier
from app.db.models.platform import Invitation, Membership, Organization, User
from app.services.audit import audit


def member_out(m: Membership, u: User) -> dict:
    return {
        "id": str(m.id),
        "userId": str(u.id),
        "fullName": u.full_name,
        "email": u.email,
        "role": m.role,
        "roleLabel": role_label(m.role),
        "status": m.status,
        "supplierId": str(m.supplier_id) if m.supplier_id else None,
        "joinedAt": m.created_at.isoformat() if m.created_at else None,
    }


def invitation_out(inv: Invitation) -> dict:
    return {
        "id": str(inv.id),
        "email": inv.email,
        "role": inv.role,
        "roleLabel": role_label(inv.role),
        "expiresAt": inv.expires_at.isoformat(),
        "acceptedAt": inv.accepted_at.isoformat() if inv.accepted_at else None,
        "createdAt": inv.created_at.isoformat() if inv.created_at else None,
    }


async def list_members(db: AsyncSession, org_id: uuid.UUID) -> list[dict]:
    rows = (
        await db.execute(
            select(Membership, User)
            .join(User, User.id == Membership.user_id)
            .where(Membership.org_id == org_id, Membership.status == "active")
            .order_by(Membership.created_at)
        )
    ).all()
    return [member_out(m, u) for m, u in rows]


async def _get_member(db: AsyncSession, org_id: uuid.UUID, member_id: uuid.UUID) -> tuple[Membership, User]:
    row = (
        await db.execute(
            select(Membership, User)
            .join(User, User.id == Membership.user_id)
            .where(Membership.id == member_id, Membership.org_id == org_id, Membership.status == "active")
        )
    ).first()
    if not row:
        raise not_found("Member")
    return row[0], row[1]


async def _owner_count(db: AsyncSession, org_id: uuid.UUID) -> int:
    return (
        await db.execute(
            select(func.count()).where(
                Membership.org_id == org_id, Membership.role == "owner", Membership.status == "active"
            )
        )
    ).scalar_one()


async def change_role(db: AsyncSession, ctx: RequestContext, member_id: uuid.UUID, role: str) -> dict:
    m, u = await _get_member(db, ctx.org_id, member_id)
    if (m.role == "owner" or role == "owner") and ctx.role != "owner":
        raise forbidden("Only an owner can grant or change the owner role.")
    if m.role == "owner" and role != "owner" and await _owner_count(db, ctx.org_id) <= 1:
        raise conflict("last_owner", "An organisation needs at least one owner.")
    if role == "supplier" and not m.supplier_id:
        raise validation_error(
            "Supplier accounts are created by inviting someone for a specific supplier.",
            [{"field": "role", "message": "Invite supplier users from the supplier's page."}],
        )
    old = m.role
    m.role = role
    if role != "supplier":
        m.supplier_id = None
    await audit(
        db,
        ctx,
        action="member.role_changed",
        resource_type="member",
        resource_id=m.id,
        metadata={"email": u.email, "from": old, "role": role, "roleLabel": role_label(role)},
    )
    return member_out(m, u)


async def remove_member(db: AsyncSession, ctx: RequestContext, member_id: uuid.UUID) -> None:
    m, u = await _get_member(db, ctx.org_id, member_id)
    if m.role == "owner" and ctx.role != "owner":
        raise forbidden("Only an owner can remove an owner.")
    if m.role == "owner" and await _owner_count(db, ctx.org_id) <= 1:
        raise conflict("last_owner", "An organisation needs at least one owner.")
    m.status = "removed"
    await audit(
        db,
        ctx,
        action="member.removed",
        resource_type="member",
        resource_id=m.id,
        metadata={"email": u.email},
    )


async def list_invitations(db: AsyncSession, org_id: uuid.UUID) -> list[dict]:
    rows = (
        await db.execute(
            select(Invitation)
            .where(
                Invitation.org_id == org_id, Invitation.revoked_at.is_(None), Invitation.accepted_at.is_(None)
            )
            .order_by(Invitation.created_at.desc())
        )
    ).scalars()
    return [invitation_out(i) for i in rows]


async def create_invitation(
    db: AsyncSession, ctx: RequestContext, *, email: str, role: str, supplier_id: uuid.UUID | None
) -> tuple[Invitation, str]:
    email = email.strip().lower()
    if role == "owner" and ctx.role != "owner":
        raise forbidden("Only an owner can invite another owner.")
    if role == "supplier":
        if not supplier_id:
            raise validation_error(
                "Choose the supplier this person works for.",
                [{"field": "supplierId", "message": "Required for supplier accounts."}],
            )
        sup = await db.get(Supplier, supplier_id)
        if not sup or sup.org_id != ctx.org_id:
            raise not_found("Supplier")
    elif supplier_id:
        supplier_id = None
    existing = (
        await db.execute(
            select(Membership.id)
            .join(User, User.id == Membership.user_id)
            .where(Membership.org_id == ctx.org_id, Membership.status == "active", User.email == email)
        )
    ).first()
    if existing:
        raise conflict("already_member", "This person is already a member of your organisation.")
    token = new_link_token()
    inv = Invitation(
        org_id=ctx.org_id,
        email=email,
        role=role,
        supplier_id=supplier_id,
        token_hash=hash_token(token),
        invited_by=ctx.user.id,
        expires_at=utcnow() + timedelta(days=get_settings().invitation_ttl_days),
    )
    db.add(inv)
    await db.flush()
    await audit(
        db,
        ctx,
        action="invitation.created",
        resource_type="invitation",
        resource_id=inv.id,
        metadata={"email": email, "role": role, "roleLabel": role_label(role)},
    )
    return inv, token


async def revoke_invitation(db: AsyncSession, ctx: RequestContext, invitation_id: uuid.UUID) -> None:
    inv = await db.get(Invitation, invitation_id)
    if not inv or inv.org_id != ctx.org_id or inv.revoked_at or inv.accepted_at:
        raise not_found("Invitation")
    inv.revoked_at = utcnow()
    await audit(
        db,
        ctx,
        action="invitation.revoked",
        resource_type="invitation",
        resource_id=inv.id,
        metadata={"email": inv.email},
    )


async def find_invitation(db: AsyncSession, token: str) -> tuple[Invitation, Organization]:
    inv = (
        await db.execute(select(Invitation).where(Invitation.token_hash == hash_token(token)))
    ).scalar_one_or_none()
    if not inv or inv.revoked_at:
        raise not_found("Invitation")
    if inv.accepted_at:
        raise AppError(
            410, "invitation_used", "Invitation already used", "This invitation has already been accepted."
        )
    if inv.expires_at < utcnow():
        raise AppError(
            410, "link_expired", "Invitation expired", "This invitation has expired. Ask for a new one."
        )
    org = await db.get(Organization, inv.org_id)
    assert org is not None
    return inv, org


async def add_membership(db: AsyncSession, inv: Invitation, user: User) -> Membership:
    m = (
        await db.execute(
            select(Membership).where(Membership.org_id == inv.org_id, Membership.user_id == user.id)
        )
    ).scalar_one_or_none()
    if m and m.status == "active":
        raise conflict("already_member", "You are already a member of this organisation.")
    if m:
        m.status, m.role, m.supplier_id = "active", inv.role, inv.supplier_id
    else:
        m = Membership(org_id=inv.org_id, user_id=user.id, role=inv.role, supplier_id=inv.supplier_id)
        db.add(m)
    inv.accepted_at = utcnow()
    await db.flush()
    return m
