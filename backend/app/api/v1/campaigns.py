"""Supplier evidence campaigns (durable workflows) and their live event stream."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import events as ev
from app.core.deps import RequestContext, get_db, require_perm
from app.schemas.domain import CampaignDecisionIn, CampaignIn
from app.services import campaigns as campaign_svc

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.get("")
async def list_campaigns(
    ctx: RequestContext = Depends(require_perm("campaigns:read")), db: AsyncSession = Depends(get_db)
) -> list[dict]:
    return await campaign_svc.list_campaigns(db, ctx.org_id)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_campaign(
    body: CampaignIn,
    ctx: RequestContext = Depends(require_perm("campaigns:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    c = await campaign_svc.create_campaign(db, ctx, body.model_dump())
    return await campaign_svc.campaign_detail(db, ctx, c)


@router.get("/{campaign_id}")
async def get_campaign(
    campaign_id: uuid.UUID,
    ctx: RequestContext = Depends(require_perm("campaigns:read")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    c = await campaign_svc.get_campaign(db, ctx.org_id, campaign_id)
    return await campaign_svc.campaign_detail(db, ctx, c)


@router.post("/{campaign_id}/suppliers/{supplier_id}/decision", status_code=status.HTTP_202_ACCEPTED)
async def decision(
    campaign_id: uuid.UUID,
    supplier_id: uuid.UUID,
    body: CampaignDecisionIn,
    ctx: RequestContext = Depends(require_perm("campaigns:approve")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    c = await campaign_svc.get_campaign(db, ctx.org_id, campaign_id)
    return await campaign_svc.decide(db, ctx, c, supplier_id, body.approve, body.note)


@router.post("/{campaign_id}/suppliers/{supplier_id}/remind", status_code=status.HTTP_202_ACCEPTED)
async def remind(
    campaign_id: uuid.UUID,
    supplier_id: uuid.UUID,
    ctx: RequestContext = Depends(require_perm("campaigns:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    c = await campaign_svc.get_campaign(db, ctx.org_id, campaign_id)
    return await campaign_svc.remind(db, ctx, c, supplier_id)


@router.post("/{campaign_id}/cancel")
async def cancel(
    campaign_id: uuid.UUID,
    ctx: RequestContext = Depends(require_perm("campaigns:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    c = await campaign_svc.get_campaign(db, ctx.org_id, campaign_id)
    await campaign_svc.cancel(db, ctx, c)
    return await campaign_svc.campaign_detail(db, ctx, c)


@router.get("/{campaign_id}/events")
async def events(
    campaign_id: uuid.UUID,
    request: Request,
    ctx: RequestContext = Depends(require_perm("campaigns:read")),
    db: AsyncSession = Depends(get_db),
):
    c = await campaign_svc.get_campaign(db, ctx.org_id, campaign_id)
    max_events = None
    if request.query_params.get("maxEvents", "").isdigit():  # bounded streams for scripted clients
        max_events = int(request.query_params["maxEvents"])
    return ev.sse_response(f"campaign:{c.id}", heartbeat=ev.HEARTBEAT_SECONDS, max_events=max_events)
