"""Public supplier portal (token in the URL, no account). Rate-limited per IP and per token."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.schemas.common import Commodity
from app.schemas.domain import PlotValidateIn, PortalPlotIn
from app.services import plots as plot_svc
from app.services import portal as portal_svc

router = APIRouter(prefix="/portal", tags=["portal"])


@router.get("/{token}")
async def view(token: str, db: AsyncSession = Depends(get_db)) -> dict:
    s, org = await portal_svc.resolve(db, token)
    return await portal_svc.view(db, s, org)


@router.post("/{token}/plots/validate")
async def validate(token: str, body: PlotValidateIn, db: AsyncSession = Depends(get_db)) -> dict:
    s, org = await portal_svc.resolve(db, token)
    _r, out = await plot_svc.validate_for_org(
        db, org.id, body.geometry, body.country or s.country, body.declared_area_ha
    )
    return out


@router.post("/{token}/plots", status_code=status.HTTP_201_CREATED)
async def add_plot(token: str, body: PortalPlotIn, db: AsyncSession = Depends(get_db)) -> dict:
    s, org = await portal_svc.resolve(db, token)
    await portal_svc.ensure_open(db, s)
    portal_svc.check_commodity(s, body.commodity)
    plot = await plot_svc.create_plot(
        db,
        org,
        s,
        reference=body.reference,
        commodity=body.commodity,
        country=s.country,
        geometry=body.geometry,
        declared_area_ha=body.declared_area_ha,
        created_via="portal",
        actor_type="supplier",
        assess=False,
    )
    await portal_svc.record_upload(db, s, org, plot)
    await db.commit()
    return plot_svc.plot_item(plot, s.name)


@router.post("/{token}/plots/import")
async def import_plots(
    token: str,
    file: UploadFile = File(...),
    commodity: Commodity = Form(...),
    db: AsyncSession = Depends(get_db),
) -> dict:
    s, org = await portal_svc.resolve(db, token)
    await portal_svc.ensure_open(db, s)
    portal_svc.check_commodity(s, commodity)
    content = await file.read()
    out = await plot_svc.import_plots(
        db,
        org,
        s,
        commodity=commodity,
        filename=file.filename or "upload",
        content=content,
        created_via="portal",
    )
    if out["created"] and s.status != "active":
        s.status = "active"
    await db.commit()
    return out


@router.delete("/{token}/plots/{plot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_plot(token: str, plot_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Response:
    s, org = await portal_svc.resolve(db, token)
    await portal_svc.remove_plot(db, s, org, plot_id)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{token}/submit")
async def submit(token: str, db: AsyncSession = Depends(get_db)) -> dict:
    s, org = await portal_svc.resolve(db, token)
    return await portal_svc.submit(db, s, org)
