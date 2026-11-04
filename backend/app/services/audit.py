"""Tamper-evident audit trail.

Each organisation has its own hash chain: `hash = sha256(prev_hash || canonical_json(row))`. Editing or
deleting a row breaks every later link, which `verify_chain` detects. On Postgres a transaction-scoped
advisory lock serialises appends per org so concurrent requests cannot fork the chain.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.metrics import AUDIT_APPENDS
from app.db.base import utcnow
from app.db.models.platform import AuditLog

if TYPE_CHECKING:
    from app.core.deps import RequestContext

GENESIS = "0" * 64


def _canonical(row: AuditLog) -> str:
    payload = {
        "org_id": str(row.org_id) if row.org_id else None,
        "actor_id": str(row.actor_id) if row.actor_id else None,
        "actor_type": row.actor_type,
        "action": row.action,
        "resource_type": row.resource_type,
        "resource_id": row.resource_id,
        "ip": row.ip,
        "user_agent": row.user_agent,
        "metadata": row.meta or {},
        "created_at": row.created_at.isoformat(),
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def compute_hash(prev_hash: str, row: AuditLog) -> str:
    return hashlib.sha256((prev_hash + _canonical(row)).encode("utf-8")).hexdigest()


def _lock_key(org_id: uuid.UUID | None) -> int:
    digest = hashlib.sha256((str(org_id) if org_id else "system").encode()).digest()
    return int.from_bytes(digest[:8], "big", signed=True)


async def _last_hash(db: AsyncSession, org_id: uuid.UUID | None) -> str:
    cond = AuditLog.org_id == org_id if org_id else AuditLog.org_id.is_(None)
    last = (
        await db.execute(select(AuditLog.hash).where(cond).order_by(AuditLog.id.desc()).limit(1))
    ).scalar_one_or_none()
    return last or GENESIS


async def audit(
    db: AsyncSession,
    ctx: RequestContext | None = None,
    *,
    action: str,
    resource_type: str | None = None,
    resource_id: Any = None,
    metadata: dict | None = None,
    org_id: uuid.UUID | None = None,
    actor_id: uuid.UUID | None = None,
    actor_type: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> AuditLog:
    """Append an audit record. Keep personal data out of `metadata` (ids, references and field names only)."""
    if ctx is not None:
        org_id = org_id or (ctx.org.id if ctx.org else None)
        actor_id = actor_id or ctx.user.id
        actor_type = actor_type or ctx.actor_type
        ip = ip or ctx.ip
        user_agent = user_agent or ctx.user_agent
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        await db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _lock_key(org_id)})
    prev = await _last_hash(db, org_id)
    row = AuditLog(
        org_id=org_id,
        actor_id=actor_id,
        actor_type=actor_type or ("system" if actor_id is None else "user"),
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        ip=ip,
        user_agent=(user_agent or "")[:400] or None,
        meta=metadata or {},
        prev_hash=prev,
        created_at=utcnow(),
    )
    row.hash = compute_hash(prev, row)
    db.add(row)
    await db.flush()
    AUDIT_APPENDS.labels(action).inc()
    return row


async def verify_chain(db: AsyncSession, org_id: uuid.UUID | None) -> dict:
    cond = AuditLog.org_id == org_id if org_id else AuditLog.org_id.is_(None)
    prev = GENESIS
    checked = 0
    last_id = 0
    while True:
        rows = (
            (
                await db.execute(
                    select(AuditLog).where(cond, AuditLog.id > last_id).order_by(AuditLog.id).limit(1000)
                )
            )
            .scalars()
            .all()
        )
        if not rows:
            break
        for row in rows:
            if row.prev_hash != prev or compute_hash(prev, row) != row.hash:
                return {"valid": False, "checked": checked, "brokenAt": row.id}
            prev = row.hash
            checked += 1
            last_id = row.id
    return {"valid": True, "checked": checked, "brokenAt": None}


# ── Human-readable labels (shown in activity feeds and the audit trail) ─────────
_LABELS: dict[str, str] = {
    "auth.signup": "Account created",
    "auth.login": "Signed in",
    "auth.login_failed": "Sign-in attempt failed",
    "auth.logout": "Signed out",
    "auth.switch_org": "Switched organisation",
    "auth.refresh_reuse_detected": "Session ended after a reused sign-in token",
    "org.created": "Organisation {name} created",
    "org.updated": "Organisation settings updated",
    "member.role_changed": "Role of {email} changed to {roleLabel}",
    "member.removed": "{email} removed from the organisation",
    "invitation.created": "{email} invited as {roleLabel}",
    "invitation.revoked": "Invitation for {email} revoked",
    "invitation.accepted": "{email} joined as {roleLabel}",
    "supplier.created": "Supplier {name} added",
    "supplier.updated": "Supplier {name} updated",
    "supplier.portal_link_issued": "New upload link issued to {name}",
    "plot.created": "Plot {reference} added",
    "plot.imported": "{created} plots imported",
    "plot.updated": "Plot {reference} updated",
    "plot.archived": "Plot {reference} archived",
    "plot.assessed": "Plot {reference} assessed",
    "plot.reviewed": "Plot {reference} reviewed",
    "product.created": "Product {name} added",
    "shipment.created": "Shipment {reference} created",
    "shipment.updated": "Shipment {reference} updated",
    "dds.created": "Due diligence statement drafted for {shipmentReference}",
    "dds.submitted": "Due diligence statement {referenceNumber} submitted",
    "campaign.created": "Campaign {name} started",
    "campaign.cancelled": "Campaign {name} cancelled",
    "campaign.reminder_sent": "Reminder sent to {supplierName}",
    "campaign.decision": "Evidence from {supplierName} {decisionLabel}",
    "portal.plot_added": "{supplierName} added plot {reference}",
    "portal.plot_removed": "{supplierName} removed plot {reference}",
    "portal.submitted": "{supplierName} submitted their plots",
}


class _Default(dict):
    def __missing__(self, key: str) -> str:
        return "…"


def describe(action: str, metadata: dict | None) -> str:
    template = _LABELS.get(action)
    if not template:
        return action.replace(".", " ").replace("_", " ").capitalize()
    return template.format_map(_Default({k: v for k, v in (metadata or {}).items() if v is not None}))
