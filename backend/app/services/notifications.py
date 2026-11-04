"""In-app notifications, fanned out to the members whose role holds a given permission."""

from __future__ import annotations

import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import PERMISSIONS
from app.db.base import utcnow
from app.db.models.platform import Membership, Notification


def notification_out(n: Notification) -> dict:
    return {
        "id": str(n.id),
        "type": n.type,
        "title": n.title,
        "body": n.body,
        "link": n.link,
        "readAt": n.read_at.isoformat() if n.read_at else None,
        "createdAt": n.created_at.isoformat(),
    }


async def notify(
    db: AsyncSession,
    org_id: uuid.UUID,
    *,
    type: str,
    title: str,
    body: str = "",
    link: str | None = None,
    permission: str | None = None,
    user_ids: list[uuid.UUID] | None = None,
) -> int:
    """Notify explicit users, or every active member whose role holds `permission`."""
    targets: set[uuid.UUID] = set(user_ids or [])
    if permission:
        roles = PERMISSIONS.get(permission, set()) - {"supplier"}
        rows = await db.execute(
            select(Membership.user_id).where(
                Membership.org_id == org_id, Membership.status == "active", Membership.role.in_(roles)
            )
        )
        targets.update(r[0] for r in rows)
    for uid in targets:
        db.add(Notification(org_id=org_id, user_id=uid, type=type, title=title[:255], body=body, link=link))
    await db.flush()
    return len(targets)


async def list_for(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, limit: int = 50) -> list[dict]:
    rows = (
        await db.execute(
            select(Notification)
            .where(Notification.org_id == org_id, Notification.user_id == user_id)
            .order_by(Notification.created_at.desc())
            .limit(limit)
        )
    ).scalars()
    return [notification_out(n) for n in rows]


async def mark_all_read(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    await db.execute(
        update(Notification)
        .where(Notification.org_id == org_id, Notification.user_id == user_id, Notification.read_at.is_(None))
        .values(read_at=utcnow())
    )
