"""Public supplier portal: a supplier shares plot locations through a link, without an account."""

from __future__ import annotations

import uuid
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError, conflict, not_found
from app.core.metrics import PORTAL_UPLOADS
from app.core.security import hash_token
from app.db.base import utcnow
from app.db.models.domain import Plot, Supplier
from app.db.models.platform import Organization
from app.services import campaigns as campaign_svc
from app.services.audit import audit
from app.services.plots import plot_item
from app.workflows.types import IN_REVIEW_STAGES

CLOSED_STAGES = (*IN_REVIEW_STAGES, "approved")


def link_expired() -> AppError:
    return AppError(
        410,
        "link_expired",
        "Link expired",
        "This upload link has expired or was replaced. Ask your buyer for a new link.",
    )


async def resolve(db: AsyncSession, token: str) -> tuple[Supplier, Organization]:
    if not token or len(token) < 20 or len(token) > 128:
        raise link_expired()
    s = (
        await db.execute(select(Supplier).where(Supplier.portal_token_hash == hash_token(token)))
    ).scalar_one_or_none()
    if not s or not s.portal_expires_at or s.portal_expires_at < utcnow():
        raise link_expired()
    org = await db.get(Organization, s.org_id)
    assert org is not None
    return s, org


def _submitted_on_this_link(s: Supplier) -> bool:
    """Outside a campaign, a submission closes the current link; a freshly issued link opens a new round."""
    if not s.last_submission_at:
        return False
    if not s.portal_expires_at:
        return True
    issued_at = s.portal_expires_at - timedelta(days=get_settings().portal_link_ttl_days)
    return s.last_submission_at >= issued_at


async def status(db: AsyncSession, s: Supplier) -> tuple[str, dict | None]:
    found = await campaign_svc.running_member_for(db, s)
    if not found:
        return ("submitted" if _submitted_on_this_link(s) else "open"), None
    c, m = found
    info = {"campaignName": c.name, "dueDate": c.due_date.isoformat(), "commodity": c.commodity}
    return ("submitted" if m.stage in CLOSED_STAGES else "open"), info


async def view(db: AsyncSession, s: Supplier, org: Organization) -> dict:
    st, info = await status(db, s)
    plots = (
        await db.execute(
            select(Plot).where(Plot.supplier_id == s.id, Plot.status == "active").order_by(Plot.reference)
        )
    ).scalars()
    return {
        "orgName": org.name,
        "supplierName": s.name,
        "country": s.country,
        "commodities": list(s.commodities or []),
        "dueDate": info["dueDate"] if info else None,
        "campaignName": info["campaignName"] if info else None,
        "status": st,
        "plots": [plot_item(p, s.name) for p in plots],
        "submittedAt": s.last_submission_at.isoformat() if s.last_submission_at else None,
    }


async def ensure_open(db: AsyncSession, s: Supplier) -> None:
    st, _info = await status(db, s)
    if st == "submitted":
        raise conflict(
            "portal_submitted", "Your plots were submitted and are being checked. Changes are closed for now."
        )


def check_commodity(s: Supplier, commodity: str) -> None:
    if commodity not in (s.commodities or []):
        raise AppError(
            422,
            "validation_error",
            "Validation failed",
            "This commodity is not one you supply to this buyer.",
            errors=[{"field": "commodity", "message": "Choose one of your commodities."}],
        )


async def record_upload(db: AsyncSession, s: Supplier, org: Organization, plot: Plot) -> None:
    PORTAL_UPLOADS.labels("created").inc()
    if s.status != "active":
        s.status = "active"
    await audit(
        db,
        None,
        org_id=org.id,
        actor_type="supplier",
        action="portal.plot_added",
        resource_type="plot",
        resource_id=plot.id,
        metadata={"supplierName": s.name, "reference": plot.reference},
    )


async def remove_plot(db: AsyncSession, s: Supplier, org: Organization, plot_id: uuid.UUID) -> None:
    await ensure_open(db, s)
    p = await db.get(Plot, plot_id)
    if not p or p.supplier_id != s.id or p.status != "active":
        raise not_found("Plot")
    from app.services.plots import archive

    await archive(db, None, p)
    await audit(
        db,
        None,
        org_id=org.id,
        actor_type="supplier",
        action="portal.plot_removed",
        resource_type="plot",
        resource_id=p.id,
        metadata={"supplierName": s.name, "reference": p.reference},
    )


async def submit(db: AsyncSession, s: Supplier, org: Organization) -> dict:
    await ensure_open(db, s)
    count = len(
        (await db.execute(select(Plot.id).where(Plot.supplier_id == s.id, Plot.status == "active"))).all()
    )
    if count == 0:
        raise AppError(422, "no_plots", "Nothing to submit", "Add at least one plot before submitting.")
    s.last_submission_at = utcnow()
    s.status = "active"
    await audit(
        db,
        None,
        org_id=org.id,
        actor_type="supplier",
        action="portal.submitted",
        resource_type="supplier",
        resource_id=s.id,
        metadata={"supplierName": s.name, "plots": count},
    )
    from app.services.notifications import notify

    await notify(
        db,
        org.id,
        type="portal.submitted",
        title=f"{s.name} submitted {count} plots",
        body="Their plots are being checked against forest records.",
        link=f"/app/suppliers/{s.id}",
        permission="suppliers:write",
    )
    await db.commit()
    if await campaign_svc.mark_submitted(db, s) is None and (org.settings or {}).get("autoAssess", True):
        # No running campaign: check the plots straight away.
        from app.services.plots import run_assessment

        pending = (
            await db.execute(
                select(Plot).where(
                    Plot.supplier_id == s.id, Plot.status == "active", Plot.verdict == "pending"
                )
            )
        ).scalars()
        for p in list(pending):
            await run_assessment(db, org, p)
        await db.commit()
    return await view(db, s, org)
