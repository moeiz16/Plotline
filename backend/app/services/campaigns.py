"""Supplier campaigns: database view + commands that drive the durable workflows."""

from __future__ import annotations

import uuid
from collections import Counter, defaultdict
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import RequestContext
from app.core.errors import conflict, not_found, validation_error
from app.core.text import human_date
from app.db.base import utcnow
from app.db.models.domain import Campaign, CampaignEvent, CampaignMember, Plot, Supplier
from app.services import suppliers as supplier_svc
from app.services.audit import audit
from app.workflows import client as wf
from app.workflows.activities import add_event, announce
from app.workflows.types import IN_REVIEW_STAGES, Decision, campaign_workflow_id, member_workflow_id

REMINDABLE = ("requested", "reminded", "overdue", "changes_requested")


async def _members(db: AsyncSession, campaign_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[CampaignMember]]:
    out: dict[uuid.UUID, list[CampaignMember]] = defaultdict(list)
    if campaign_ids:
        for m in (
            await db.execute(select(CampaignMember).where(CampaignMember.campaign_id.in_(campaign_ids)))
        ).scalars():
            out[m.campaign_id].append(m)
    return out


def list_item(c: Campaign, members: list[CampaignMember]) -> dict:
    stages = Counter(m.stage for m in members)
    n = len(members)
    return {
        "id": str(c.id),
        "name": c.name,
        "commodity": c.commodity,
        "status": c.status,
        "dueDate": c.due_date.isoformat(),
        "suppliers": n,
        "approved": stages.get("approved", 0),
        "awaitingReview": stages.get("awaiting_review", 0),
        "overdue": stages.get("overdue", 0),
        "progressPct": round(100 * stages.get("approved", 0) / n) if n else 0,
        "createdAt": c.created_at.isoformat() if c.created_at else None,
    }


async def list_campaigns(db: AsyncSession, org_id: uuid.UUID) -> list[dict]:
    campaigns = list(
        (
            await db.execute(
                select(Campaign).where(Campaign.org_id == org_id).order_by(Campaign.created_at.desc())
            )
        ).scalars()
    )
    members = await _members(db, [c.id for c in campaigns])
    return [list_item(c, members[c.id]) for c in campaigns]


async def get_campaign(db: AsyncSession, org_id: uuid.UUID, campaign_id: uuid.UUID) -> Campaign:
    c = await db.get(Campaign, campaign_id)
    if not c or c.org_id != org_id:
        raise not_found("Campaign")
    return c


async def campaign_detail(db: AsyncSession, ctx: RequestContext, c: Campaign) -> dict:
    members = (await _members(db, [c.id]))[c.id]
    suppliers = (
        {
            s.id: s
            for s in (
                await db.execute(select(Supplier).where(Supplier.id.in_([m.supplier_id for m in members])))
            ).scalars()
        }
        if members
        else {}
    )
    plot_rows = (
        (
            await db.execute(
                select(Plot.supplier_id, Plot.verdict).where(
                    Plot.org_id == c.org_id,
                    Plot.status == "active",
                    Plot.supplier_id.in_(list(suppliers)),
                )
            )
        ).all()
        if suppliers
        else []
    )
    per_supplier: dict[uuid.UUID, Counter] = defaultdict(Counter)
    for sid, verdict in plot_rows:
        per_supplier[sid][verdict or "pending"] += 1
    events = (
        await db.execute(
            select(CampaignEvent)
            .where(CampaignEvent.campaign_id == c.id)
            .order_by(CampaignEvent.at.desc())
            .limit(100)
        )
    ).scalars()
    show_links = ctx.has("campaigns:write")
    return {
        **list_item(c, members),
        "engineOnline": wf.is_online(),
        "reminderEveryDays": c.reminder_every_days,
        "members": [
            {
                "supplierId": str(m.supplier_id),
                "supplierName": suppliers[m.supplier_id].name if m.supplier_id in suppliers else "",
                "country": suppliers[m.supplier_id].country if m.supplier_id in suppliers else "",
                "stage": m.stage,
                "remindersSent": m.reminders_sent,
                "plotsSubmitted": sum(per_supplier[m.supplier_id].values()),
                "verdictSummary": {
                    "compliant": per_supplier[m.supplier_id].get("compliant", 0),
                    "needsReview": per_supplier[m.supplier_id].get("needs_review", 0),
                    "nonCompliant": per_supplier[m.supplier_id].get("non_compliant", 0),
                },
                "lastEventAt": m.last_event_at.isoformat() if m.last_event_at else None,
                "portalUrl": supplier_svc.current_portal_url(suppliers[m.supplier_id])
                if show_links and m.supplier_id in suppliers and c.status == "running"
                else None,
            }
            for m in sorted(
                members, key=lambda m: suppliers[m.supplier_id].name if m.supplier_id in suppliers else ""
            )
        ],
        "timeline": [
            {
                "at": e.at.isoformat(),
                "supplierName": suppliers[e.supplier_id].name if e.supplier_id in suppliers else None,
                "kind": e.kind,
                "message": e.message,
            }
            for e in events
        ],
    }


async def create_campaign(db: AsyncSession, ctx: RequestContext, data: dict) -> Campaign:
    client = await wf.require_client()  # fail fast (503) before writing anything
    if data["due_date"] < date.today():
        raise validation_error(
            "Choose a due date in the future.", [{"field": "dueDate", "message": "Must not be in the past."}]
        )
    ids = list(dict.fromkeys(data["supplier_ids"]))
    suppliers = {
        s.id: s
        for s in (
            await db.execute(select(Supplier).where(Supplier.org_id == ctx.org_id, Supplier.id.in_(ids)))
        ).scalars()
    }
    missing = [i for i, sid in enumerate(ids) if sid not in suppliers]
    if missing:
        raise validation_error(
            "Some suppliers were not found.",
            [{"field": f"supplierIds.{i}", "message": "Supplier not found."} for i in missing],
        )
    busy = (
        (
            await db.execute(
                select(Supplier.name)
                .join(CampaignMember, CampaignMember.supplier_id == Supplier.id)
                .join(Campaign, Campaign.id == CampaignMember.campaign_id)
                .where(
                    Campaign.org_id == ctx.org_id,
                    Campaign.status == "running",
                    Campaign.commodity == data["commodity"],
                    Supplier.id.in_(ids),
                )
            )
        )
        .scalars()
        .all()
    )
    if busy:
        raise conflict(
            "supplier_in_campaign",
            f"{', '.join(busy)} already {'is' if len(busy) == 1 else 'are'} in a "
            "running campaign for this commodity.",
        )
    campaign_id = uuid.uuid4()
    c = Campaign(
        id=campaign_id,
        org_id=ctx.org_id,
        name=data["name"],
        commodity=data["commodity"],
        status="running",
        due_date=data["due_date"],
        reminder_every_days=data["reminder_every_days"],
        workflow_id=campaign_workflow_id(str(campaign_id)),
        created_by=ctx.user.id,
    )
    db.add(c)
    await db.flush()
    for sid in ids:
        db.add(
            CampaignMember(
                org_id=ctx.org_id,
                campaign_id=c.id,
                supplier_id=sid,
                stage="requested",
                last_event_at=utcnow(),
            )
        )
    add_event(
        db, c, None, "started", f"Campaign started with {len(ids)} suppliers, due {human_date(c.due_date)}."
    )
    await audit(
        db,
        ctx,
        action="campaign.created",
        resource_type="campaign",
        resource_id=c.id,
        metadata={"name": c.name, "suppliers": len(ids)},
    )
    await db.commit()  # the workflow's activities read these rows
    await wf.call(wf.start_campaign_workflow, client, str(c.id))
    return c


async def _member(db: AsyncSession, c: Campaign, supplier_id: uuid.UUID) -> tuple[CampaignMember, Supplier]:
    row = (
        await db.execute(
            select(CampaignMember, Supplier)
            .join(Supplier, Supplier.id == CampaignMember.supplier_id)
            .where(CampaignMember.campaign_id == c.id, CampaignMember.supplier_id == supplier_id)
        )
    ).first()
    if not row:
        raise not_found("Campaign supplier")
    return row[0], row[1]


async def decide(
    db: AsyncSession, ctx: RequestContext, c: Campaign, supplier_id: uuid.UUID, approve: bool, note: str
) -> dict:
    if c.status != "running":
        raise conflict("campaign_closed", "This campaign is no longer running.")
    m, s = await _member(db, c, supplier_id)
    if m.stage != "awaiting_review":
        raise conflict("not_awaiting_review", f"{s.name} has no evidence waiting for a decision.")
    if not approve and not note.strip():
        raise validation_error(
            "Tell the supplier what to change.",
            [{"field": "note", "message": "Required when requesting changes."}],
        )
    client = await wf.require_client()
    handle = wf.member_handle(client, member_workflow_id(str(c.id), str(m.id)))
    await wf.call(
        handle.signal, "decide", Decision(approve=approve, note=note, reviewer_name=ctx.user.full_name)
    )
    await audit(
        db,
        ctx,
        action="campaign.decision",
        resource_type="campaign",
        resource_id=c.id,
        metadata={
            "supplierName": s.name,
            "approve": approve,
            "decisionLabel": "approved" if approve else "returned for changes",
        },
    )
    await db.commit()
    return {"ok": True, "stage": "approved" if approve else "changes_requested"}


async def remind(db: AsyncSession, ctx: RequestContext, c: Campaign, supplier_id: uuid.UUID) -> dict:
    if c.status != "running":
        raise conflict("campaign_closed", "This campaign is no longer running.")
    m, s = await _member(db, c, supplier_id)
    if m.stage not in REMINDABLE:
        raise conflict("nothing_to_remind", f"{s.name} has already shared their evidence.")
    client = await wf.require_client()
    await wf.call(wf.member_handle(client, member_workflow_id(str(c.id), str(m.id))).signal, "remind")
    await audit(
        db,
        ctx,
        action="campaign.reminder_sent",
        resource_type="campaign",
        resource_id=c.id,
        metadata={"supplierName": s.name},
    )
    await db.commit()
    return {"ok": True}


async def cancel(db: AsyncSession, ctx: RequestContext, c: Campaign) -> None:
    if c.status != "running":
        raise conflict("campaign_closed", "This campaign is no longer running.")
    client = await wf.require_client()
    try:
        await wf.call(client.get_workflow_handle(c.workflow_id).cancel)
    except Exception as exc:  # already finished workflows are fine to cancel in the database
        if getattr(exc, "code", None) != "campaign_closed":
            raise
    c.status = "cancelled"
    update = add_event(db, c, None, "cancelled", f"Campaign cancelled by {ctx.user.full_name}.")
    await audit(
        db,
        ctx,
        action="campaign.cancelled",
        resource_type="campaign",
        resource_id=c.id,
        metadata={"name": c.name},
    )
    await db.commit()
    await announce([update])


async def running_member_for(db: AsyncSession, supplier: Supplier) -> tuple[Campaign, CampaignMember] | None:
    row = (
        await db.execute(
            select(Campaign, CampaignMember)
            .join(CampaignMember, CampaignMember.campaign_id == Campaign.id)
            .where(
                Campaign.org_id == supplier.org_id,
                Campaign.status == "running",
                CampaignMember.supplier_id == supplier.id,
            )
            .order_by(Campaign.due_date)
        )
    ).first()
    return (row[0], row[1]) if row else None


async def mark_submitted(db: AsyncSession, supplier: Supplier) -> dict | None:
    """Portal submission: record it in the database first, then nudge the workflow (best effort)."""
    found = await running_member_for(db, supplier)
    if not found:
        return None
    c, m = found
    if m.stage in IN_REVIEW_STAGES or m.stage == "approved":
        return None
    m.submitted_at = utcnow()
    plots = (
        await db.execute(select(Plot.id).where(Plot.supplier_id == supplier.id, Plot.status == "active"))
    ).all()
    update = add_event(
        db, c, m, "submitted", f"{supplier.name} submitted {len(plots)} plots.", stage="submitted"
    )
    await db.commit()
    await announce([update])
    if wf.is_online() and wf.state.client is not None:
        try:
            await wf.member_handle(wf.state.client, member_workflow_id(str(c.id), str(m.id))).signal("submit")
        except Exception:  # noqa: S110 - the workflow also picks the submission up from the database
            pass
    return update
