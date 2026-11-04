"""Audit trail, chain verification and notifications."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import RequestContext, get_ctx, get_db, require_perm
from app.db.models.platform import AuditLog, User
from app.services import notifications as notif_svc
from app.services.audit import describe, verify_chain

router = APIRouter(tags=["audit"])


def audit_item(row: AuditLog, actor_name: str | None) -> dict:
    return {
        "id": row.id,
        "action": row.action,
        "label": describe(row.action, row.meta),
        "actorName": actor_name
        or (
            "Supplier link"
            if row.actor_type == "supplier"
            else "Plotline"
            if row.actor_type == "system"
            else None
        ),
        "resourceType": row.resource_type,
        "resourceId": row.resource_id,
        "metadata": row.meta or {},
        "createdAt": row.created_at.isoformat(),
    }


async def audit_items(
    db: AsyncSession, org_id, *, limit: int, before: int | None = None, action: str | None = None
) -> list[dict]:
    stmt = (
        select(AuditLog, User.full_name)
        .outerjoin(User, User.id == AuditLog.actor_id)
        .where(AuditLog.org_id == org_id)
        .order_by(AuditLog.id.desc())
        .limit(limit)
    )
    if before:
        stmt = stmt.where(AuditLog.id < before)
    if action:
        stmt = (
            stmt.where(AuditLog.action.startswith(action))
            if action.endswith(".")
            else stmt.where(AuditLog.action == action)
        )
    return [audit_item(r, name) for r, name in (await db.execute(stmt)).all()]


@router.get("/audit")
async def list_audit(
    limit: int = Query(50, ge=1, le=200),
    before: int | None = Query(None, ge=1),
    action: str | None = Query(None, max_length=64),
    ctx: RequestContext = Depends(require_perm("audit:read")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    items = await audit_items(db, ctx.org_id, limit=limit + 1, before=before, action=action)
    more = len(items) > limit
    items = items[:limit]
    return {"items": items, "nextBefore": items[-1]["id"] if more and items else None}


@router.get("/audit/verify")
async def verify(
    ctx: RequestContext = Depends(require_perm("audit:read")), db: AsyncSession = Depends(get_db)
) -> dict:
    return await verify_chain(db, ctx.org_id)


@router.get("/notifications", tags=["notifications"])
async def notifications(
    ctx: RequestContext = Depends(get_ctx), db: AsyncSession = Depends(get_db)
) -> list[dict]:
    return await notif_svc.list_for(db, ctx.org_id, ctx.user.id)


@router.post("/notifications/read-all", status_code=status.HTTP_204_NO_CONTENT, tags=["notifications"])
async def read_all(ctx: RequestContext = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> Response:
    await notif_svc.mark_all_read(db, ctx.org_id, ctx.user.id)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
