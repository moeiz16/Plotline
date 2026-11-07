"""Suppliers and supplier upload links."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import RequestContext, get_db, require_perm
from app.schemas.common import Commodity
from app.schemas.domain import SupplierIn, SupplierPatchIn
from app.services import plots as plot_svc
from app.services import suppliers as supplier_svc
from app.services.audit import audit

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


async def _detail(db: AsyncSession, ctx: RequestContext, s) -> dict:
    counts = (await supplier_svc.verdict_counts(db, ctx.org_id)).get(s.id, {})
    return {
        **supplier_svc.supplier_item(s, counts),
        "plots": await plot_svc.list_plots(db, ctx, supplier_id=s.id),
        "contactEmail": s.contact_email,
        "portalExpiresAt": s.portal_expires_at.isoformat() if s.portal_expires_at else None,
        "createdAt": s.created_at.isoformat() if s.created_at else None,
    }


@router.get("")
async def list_suppliers(
    q: str | None = Query(None, max_length=100),
    country: str | None = Query(None, pattern=r"^[A-Za-z]{2}$"),
    commodity: Commodity | None = None,
    ctx: RequestContext = Depends(require_perm("suppliers:read")),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    return await supplier_svc.list_suppliers(db, ctx, q=q, country=country, commodity=commodity)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_supplier(
    body: SupplierIn,
    ctx: RequestContext = Depends(require_perm("suppliers:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    s = await supplier_svc.create_supplier(db, ctx, body.model_dump())
    await db.commit()
    return await _detail(db, ctx, s)


@router.get("/{supplier_id}")
async def get_supplier(
    supplier_id: uuid.UUID,
    ctx: RequestContext = Depends(require_perm("suppliers:read")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await _detail(db, ctx, await supplier_svc.get_supplier(db, ctx, supplier_id))


@router.patch("/{supplier_id}")
async def patch_supplier(
    supplier_id: uuid.UUID,
    body: SupplierPatchIn,
    ctx: RequestContext = Depends(require_perm("suppliers:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    s = await supplier_svc.get_supplier(db, ctx, supplier_id)
    await supplier_svc.update_supplier(db, ctx, s, body.model_dump(exclude_unset=True))
    await db.commit()
    return await _detail(db, ctx, s)


@router.post("/{supplier_id}/portal-link")
async def portal_link(
    supplier_id: uuid.UUID,
    ctx: RequestContext = Depends(require_perm("suppliers:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    s = await supplier_svc.get_supplier(db, ctx, supplier_id)
    url, expires = supplier_svc.issue_portal_link(s)
    await audit(
        db,
        ctx,
        action="supplier.portal_link_issued",
        resource_type="supplier",
        resource_id=s.id,
        metadata={"name": s.name},
    )
    await db.commit()
    return {"url": url, "expiresAt": expires}
