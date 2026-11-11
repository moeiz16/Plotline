"""Campaign activities: every step persists its stage and a timeline event, then publishes a live update."""

from __future__ import annotations

import uuid
from collections import Counter
from collections.abc import Callable
from datetime import UTC, date, datetime, time
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from temporalio import activity

from app.core.events import publish
from app.core.metrics import CAMPAIGN_EVENTS
from app.core.text import human_date
from app.db.base import utcnow
from app.db.models.domain import Campaign, CampaignEvent, CampaignMember, Plot, Supplier
from app.db.models.platform import Organization
from app.db.session import session_scope
from app.services import suppliers as supplier_svc
from app.services.audit import audit
from app.services.notifications import notify
from app.services.plots import run_assessment
from app.workflows.types import (
    ASSESS_SUBMISSION,
    COMPLETE_CAMPAIGN,
    IN_REVIEW_STAGES,
    LOAD_MEMBER,
    RECORD_DECISION,
    REMINDER_DUE,
    REQUEST_EVIDENCE,
    DecisionIn,
    MemberRef,
    MemberState,
    ReminderIn,
    ReminderOut,
)


def due_at(d: date) -> datetime:
    """A campaign is due at the end of its due date (UTC)."""
    return datetime.combine(d, time(23, 59, 59), tzinfo=UTC)


async def _load(
    db: AsyncSession, campaign_id: str, member_id: str
) -> tuple[Campaign, CampaignMember, Supplier]:
    campaign = await db.get(Campaign, uuid.UUID(campaign_id))
    member = await db.get(CampaignMember, uuid.UUID(member_id))
    if not campaign or not member or member.campaign_id != campaign.id:
        raise LookupError(f"campaign member {member_id} not found")
    supplier = await db.get(Supplier, member.supplier_id)
    assert supplier is not None
    return campaign, member, supplier


def add_event(
    db: AsyncSession,
    campaign: Campaign,
    member: CampaignMember | None,
    kind: str,
    message: str,
    stage: str | None = None,
    at: datetime | None = None,
) -> dict:
    at = at or utcnow()
    db.add(
        CampaignEvent(
            org_id=campaign.org_id,
            campaign_id=campaign.id,
            supplier_id=member.supplier_id if member else None,
            at=at,
            kind=kind,
            message=message,
        )
    )
    if member is not None:
        if stage:
            member.stage = stage
        member.last_event_at = at
    CAMPAIGN_EVENTS.labels(kind).inc()
    return {
        "campaignId": str(campaign.id),
        "supplierId": str(member.supplier_id) if member else None,
        "stage": member.stage if member else campaign.status,
    }


async def announce(updates: list[dict]) -> None:
    for u in updates:
        await publish(f"campaign:{u['campaignId']}", "campaign.updated", u)


@activity.defn(name=LOAD_MEMBER)
async def load_member(ref: MemberRef) -> MemberState:
    async with session_scope() as db:
        campaign, member, _s = await _load(db, ref.campaign_id, ref.member_id)
        closed = campaign.status != "running" or member.stage == "approved"
        submitted = member.stage in IN_REVIEW_STAGES or (
            member.submitted_at is not None and member.stage not in ("changes_requested",)
        )
        return MemberState(stage=member.stage, submitted=submitted, closed=closed)


@activity.defn(name=REQUEST_EVIDENCE)
async def request_evidence(ref: MemberRef) -> None:
    """Send the evidence request (idempotent: a member is only ever requested once)."""
    async with session_scope() as db:
        campaign, member, supplier = await _load(db, ref.campaign_id, ref.member_id)
        done = (
            await db.execute(
                select(CampaignEvent.id).where(
                    CampaignEvent.campaign_id == campaign.id,
                    CampaignEvent.supplier_id == supplier.id,
                    CampaignEvent.kind == "requested",
                )
            )
        ).first()
        if done:
            return
        if not supplier_svc.current_portal_url(supplier):
            supplier_svc.issue_portal_link(supplier)
        update = add_event(
            db,
            campaign,
            member,
            "requested",
            f"Evidence requested from {supplier.name}: plot locations "
            f"for {campaign.commodity.replace('_', ' ')} "
            f"due {human_date(campaign.due_date)}.",
            stage="requested",
        )
    await announce([update])


@activity.defn(name=REMINDER_DUE)
async def reminder_due(inp: ReminderIn) -> ReminderOut:
    """Timer fired (or a manual reminder): reconcile with the database, then remind or mark overdue."""
    now = datetime.fromisoformat(inp.now_iso)
    async with session_scope() as db:
        campaign, member, supplier = await _load(db, inp.campaign_id, inp.member_id)
        if member.stage in IN_REVIEW_STAGES:
            return ReminderOut(submitted=True, stage=member.stage)
        if campaign.status != "running":
            return ReminderOut(submitted=False, stage=member.stage)
        overdue = now > due_at(campaign.due_date)
        member.reminders_sent = (member.reminders_sent or 0) + 1
        if overdue:
            msg = (
                f"{supplier.name} is overdue (due {human_date(campaign.due_date)}). "
                f"Reminder {member.reminders_sent} sent."
            )
            update = add_event(db, campaign, member, "overdue", msg, stage="overdue", at=utcnow())
            await notify(
                db,
                campaign.org_id,
                type="campaign.overdue",
                title=f"{supplier.name} is overdue",
                body=f"No evidence received for {campaign.name}.",
                link=f"/app/campaigns/{campaign.id}",
                permission="campaigns:write",
            )
        else:
            how = "sent by your team" if inp.manual else "sent automatically"
            update = add_event(
                db,
                campaign,
                member,
                "reminded",
                f"Reminder {member.reminders_sent} to {supplier.name} {how}.",
                stage="reminded",
            )
        stage = member.stage
    await announce([update])
    return ReminderOut(submitted=False, stage=stage)


@activity.defn(name=ASSESS_SUBMISSION)
async def assess_submission(ref: MemberRef) -> str:
    """Run the forest assessment on every plot the supplier shared, then hand over to a reviewer."""
    async with session_scope() as db:
        campaign, member, supplier = await _load(db, ref.campaign_id, ref.member_id)
        if member.stage == "awaiting_review":
            return "awaiting_review"
        first = add_event(
            db,
            campaign,
            member,
            "assessing",
            f"Checking {supplier.name}'s plots against forest records.",
            stage="assessing",
        )
    await announce([first])
    async with session_scope() as db:
        campaign, member, supplier = await _load(db, ref.campaign_id, ref.member_id)
        org = await db.get(Organization, campaign.org_id)
        assert org is not None
        plots = list(
            (
                await db.execute(
                    select(Plot).where(
                        Plot.org_id == campaign.org_id,
                        Plot.supplier_id == supplier.id,
                        Plot.status == "active",
                    )
                )
            ).scalars()
        )
        for p in plots:
            if p.latest_assessment_id is None or p.verdict == "pending":
                await run_assessment(db, org, p, notify_reviewers=False)
        counts = Counter(p.verdict for p in plots)
        summary = (
            f"{len(plots)} plots checked: {counts.get('compliant', 0)} compliant, "
            f"{counts.get('needs_review', 0)} need review, {counts.get('non_compliant', 0)} non-compliant."
        )
        done = add_event(db, campaign, member, "awaiting_review", summary, stage="awaiting_review")
        await notify(
            db,
            campaign.org_id,
            type="campaign.review",
            title=f"{supplier.name} is ready for review",
            body=summary,
            link=f"/app/campaigns/{campaign.id}",
            permission="campaigns:approve",
        )
    await announce([done])
    return "awaiting_review"


@activity.defn(name=RECORD_DECISION)
async def record_decision(inp: DecisionIn) -> str:
    async with session_scope() as db:
        campaign, member, supplier = await _load(db, inp.campaign_id, inp.member_id)
        member.decided_at = utcnow()
        member.decision_note = inp.note or None
        who = f" by {inp.reviewer_name}" if inp.reviewer_name else ""
        if inp.approve:
            update = add_event(
                db,
                campaign,
                member,
                "approved",
                f"Evidence from {supplier.name} approved{who}.",
                stage="approved",
            )
        else:
            note = f" Note: {inp.note}" if inp.note else ""
            update = add_event(
                db,
                campaign,
                member,
                "changes_requested",
                f"Changes requested from {supplier.name}{who}.{note}",
                stage="changes_requested",
            )
            member.submitted_at = None
        stage = member.stage
    await announce([update])
    return stage


@activity.defn(name=COMPLETE_CAMPAIGN)
async def complete_campaign(campaign_id: str) -> None:
    async with session_scope() as db:
        campaign = await db.get(Campaign, uuid.UUID(campaign_id))
        if not campaign or campaign.status != "running":
            return
        campaign.status = "completed"
        update = add_event(
            db, campaign, None, "completed", f"Campaign {campaign.name} completed: every supplier approved."
        )
        await audit(
            db,
            None,
            org_id=campaign.org_id,
            action="campaign.completed",
            resource_type="campaign",
            resource_id=campaign.id,
            metadata={"name": campaign.name},
        )
    await announce([update])


ALL_ACTIVITIES: list[Callable[..., Any]] = [
    load_member,
    request_evidence,
    reminder_due,
    assess_submission,
    record_decision,
    complete_campaign,
]
