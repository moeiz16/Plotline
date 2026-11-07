"""Suppliers, their readiness and their supplier upload links."""

from __future__ import annotations

import secrets
import uuid
from collections import defaultdict
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import RequestContext
from app.core.errors import not_found
from app.core.security import derive_portal_token, hash_token
from app.db.base import utcnow
from app.db.models.domain import Plot, Supplier
from app.services import domain
from app.services.audit import audit

VERDICTS = ("compliant", "needs_review", "non_compliant", "pending")


def readiness(counts: dict[str, int]) -> int:
    total = sum(counts.get(v, 0) for v in VERDICTS)
    return round(100 * counts.get("compliant", 0) / total) if total else 0


def counts_out(counts: dict[str, int]) -> dict:
    return {
        "plots": sum(counts.get(v, 0) for v in VERDICTS),
        "compliant": counts.get("compliant", 0),
        "needsReview": counts.get("needs_review", 0),
        "nonCompliant": counts.get("non_compliant", 0),
        "pending": counts.get("pending", 0),
        "readinessPct": readiness(counts),
    }


async def verdict_counts(db: AsyncSession, org_id: uuid.UUID) -> dict[uuid.UUID, dict[str, int]]:
    rows = await db.execute(
        select(Plot.supplier_id, Plot.verdict, func.count())
        .where(Plot.org_id == org_id, Plot.status == "active")
        .group_by(Plot.supplier_id, Plot.verdict)
    )
    out: dict[uuid.UUID, dict[str, int]] = defaultdict(dict)
    for sid, verdict, n in rows:
        out[sid][verdict or "pending"] = n
    return out


def supplier_item(s: Supplier, counts: dict[str, int]) -> dict:
    c = counts_out(counts)
    return {
        "id": str(s.id),
        "name": s.name,
        "country": s.country,
        "countryName": domain.country_name(s.country),
        "riskTier": domain.risk_tier(s.country),
        "kind": s.kind,
        "commodities": list(s.commodities or []),
        **c,
        "status": s.status,
        "lastSubmissionAt": s.last_submission_at.isoformat() if s.last_submission_at else None,
    }


async def list_suppliers(
    db: AsyncSession, ctx: RequestContext, *, q: str | None, country: str | None, commodity: str | None
) -> list[dict]:
    stmt = select(Supplier).where(Supplier.org_id == ctx.org_id).order_by(Supplier.name)
    if ctx.is_supplier:
        stmt = stmt.where(Supplier.id == ctx.supplier_scope)
    if q:
        stmt = stmt.where(Supplier.name.ilike(f"%{q.strip()}%"))
    if country:
        stmt = stmt.where(Supplier.country == country.upper())
    suppliers = list((await db.execute(stmt)).scalars())
    if commodity:
        suppliers = [s for s in suppliers if commodity in (s.commodities or [])]
    counts = await verdict_counts(db, ctx.org_id)
    return [supplier_item(s, counts.get(s.id, {})) for s in suppliers]


async def get_supplier(db: AsyncSession, ctx: RequestContext, supplier_id: uuid.UUID) -> Supplier:
    s = await db.get(Supplier, supplier_id)
    if not s or s.org_id != ctx.org_id or (ctx.is_supplier and s.id != ctx.supplier_scope):
        raise not_found("Supplier")
    return s


def portal_url(token: str) -> str:
    return f"{get_settings().public_app_url}/portal/{token}"


def current_portal_url(s: Supplier) -> str | None:
    """The live upload link, if one exists and has not expired."""
    if not s.portal_nonce or not s.portal_expires_at or s.portal_expires_at < utcnow():
        return None
    return portal_url(derive_portal_token(s.id, s.portal_nonce))


def issue_portal_link(s: Supplier) -> tuple[str, str]:
    """Rotate the supplier's upload link (old links stop working). Returns (url, expiresAt)."""
    nonce = secrets.token_urlsafe(32)
    token = derive_portal_token(s.id, nonce)
    s.portal_nonce = nonce
    s.portal_token_hash = hash_token(token)
    s.portal_expires_at = utcnow() + timedelta(days=get_settings().portal_link_ttl_days)
    return portal_url(token), s.portal_expires_at.isoformat()


async def create_supplier(db: AsyncSession, ctx: RequestContext, data: dict) -> Supplier:
    s = Supplier(
        org_id=ctx.org_id,
        name=data["name"],
        country=data["country"],
        kind=data.get("kind") or "cooperative",
        commodities=sorted(set(data["commodities"])),
        contact_email=data.get("contact_email"),
        status="invited",
    )
    db.add(s)
    await db.flush()
    await audit(
        db,
        ctx,
        action="supplier.created",
        resource_type="supplier",
        resource_id=s.id,
        metadata={"name": s.name, "country": s.country},
    )
    return s


async def update_supplier(db: AsyncSession, ctx: RequestContext, s: Supplier, data: dict) -> Supplier:
    for field, value in data.items():
        if value is None:
            continue
        if field == "commodities":
            value = sorted(set(value))
        setattr(s, field, value)
    await audit(
        db,
        ctx,
        action="supplier.updated",
        resource_type="supplier",
        resource_id=s.id,
        metadata={"name": s.name, "fields": sorted(data)},
    )
    return s
