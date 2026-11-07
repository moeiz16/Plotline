"""Products, shipments, traceability and drafting a due diligence statement from a shipment."""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import RequestContext, get_db, require_perm
from app.schemas.domain import ProductIn, ShipmentIn, ShipmentPatchIn
from app.services import dds as dds_svc
from app.services import shipments as shipment_svc

router = APIRouter(tags=["shipments"])


@router.get("/products")
async def products(
    ctx: RequestContext = Depends(require_perm("shipments:read")), db: AsyncSession = Depends(get_db)
) -> list[dict]:
    return await shipment_svc.list_products(db, ctx.org_id)


@router.post("/products", status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductIn,
    ctx: RequestContext = Depends(require_perm("shipments:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    p = await shipment_svc.create_product(db, ctx, body.model_dump())
    await db.commit()
    return shipment_svc.product_out(p)


@router.get("/shipments")
async def shipments(
    status: Literal["draft", "blocked", "ready", "submitted"] | None = None,
    ctx: RequestContext = Depends(require_perm("shipments:read")),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    return await shipment_svc.list_shipments(db, ctx.org_id, status)


@router.post("/shipments", status_code=status.HTTP_201_CREATED)
async def create_shipment(
    body: ShipmentIn,
    ctx: RequestContext = Depends(require_perm("shipments:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    s = await shipment_svc.create_shipment(db, ctx, body.model_dump())
    await db.commit()
    s, product = await shipment_svc.get_shipment(db, ctx.org_id, s.id)
    return await shipment_svc.shipment_detail(db, s, product, reevaluate=False)


@router.get("/shipments/{shipment_id}")
async def get_shipment(
    shipment_id: uuid.UUID,
    ctx: RequestContext = Depends(require_perm("shipments:read")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    s, product = await shipment_svc.get_shipment(db, ctx.org_id, shipment_id)
    out = await shipment_svc.shipment_detail(db, s, product)
    await db.commit()  # persist a refreshed evaluation
    return out


@router.patch("/shipments/{shipment_id}")
async def patch_shipment(
    shipment_id: uuid.UUID,
    body: ShipmentPatchIn,
    ctx: RequestContext = Depends(require_perm("shipments:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    s, product = await shipment_svc.get_shipment(db, ctx.org_id, shipment_id)
    await shipment_svc.update_shipment(db, ctx, s, product, body.model_dump(exclude_unset=True))
    await db.commit()
    return await shipment_svc.shipment_detail(db, s, product, reevaluate=False)


@router.get("/shipments/{shipment_id}/trace")
async def trace(
    shipment_id: uuid.UUID,
    ctx: RequestContext = Depends(require_perm("shipments:read")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    s, product = await shipment_svc.get_shipment(db, ctx.org_id, shipment_id)
    return await shipment_svc.trace(db, s, product)


@router.post("/shipments/{shipment_id}/dds", status_code=status.HTTP_201_CREATED, tags=["statements"])
async def create_dds(
    shipment_id: uuid.UUID,
    ctx: RequestContext = Depends(require_perm("dds:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    s, product = await shipment_svc.get_shipment(db, ctx.org_id, shipment_id)
    assert ctx.org is not None
    d = await dds_svc.create_from_shipment(db, ctx, ctx.org, s, product)
    await db.commit()
    return await dds_svc.dds_detail(db, d, s)
