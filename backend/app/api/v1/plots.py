"""Plots: list, map, validation, creation, import, assessment, imagery, similar plots and review."""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import RequestContext, get_db, require_perm
from app.core.errors import forbidden
from app.schemas.common import Commodity, Verdict
from app.schemas.domain import PlotIn, PlotPatchIn, PlotValidateIn, ReviewIn
from app.services import plots as plot_svc
from app.services import suppliers as supplier_svc
from app.services.audit import audit

router = APIRouter(tags=["plots"])


class _Filters:
    def __init__(
        self,
        supplierId: uuid.UUID | None = None,
        verdict: Verdict | None = None,
        country: str | None = Query(None, pattern=r"^[A-Za-z]{2}$"),
        commodity: Commodity | None = None,
        q: str | None = Query(None, max_length=100),
    ) -> None:
        self.values = {
            "supplier_id": supplierId,
            "verdict": verdict,
            "country": country,
            "commodity": commodity,
            "q": q,
        }


@router.get("/plots")
async def list_plots(
    f: _Filters = Depends(),
    ctx: RequestContext = Depends(require_perm("plots:read")),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    return await plot_svc.list_plots(db, ctx, **f.values)


@router.get("/plots/map")
async def plots_map(
    f: _Filters = Depends(),
    ctx: RequestContext = Depends(require_perm("plots:read")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await plot_svc.plots_geojson(db, ctx, **f.values)


@router.post("/plots/validate")
async def validate(
    body: PlotValidateIn,
    ctx: RequestContext = Depends(require_perm("plots:read")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    _result, out = await plot_svc.validate_for_org(
        db, ctx.org_id, body.geometry, body.country, body.declared_area_ha
    )
    return out


@router.post("/plots", status_code=status.HTTP_201_CREATED)
async def create_plot(
    body: PlotIn,
    ctx: RequestContext = Depends(require_perm("plots:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    supplier = await supplier_svc.get_supplier(db, ctx, body.supplier_id)
    assert ctx.org is not None
    plot = await plot_svc.create_plot(
        db,
        ctx.org,
        supplier,
        reference=body.reference,
        commodity=body.commodity,
        country=body.country,
        geometry=body.geometry,
        declared_area_ha=body.declared_area_ha,
        producer_name=body.producer_name,
        ctx=ctx,
    )
    await db.commit()
    return await plot_svc.plot_detail(db, plot, supplier.name)


@router.post("/plots/import")
async def import_plots(
    file: UploadFile = File(...),
    supplierId: uuid.UUID = Form(...),
    commodity: Commodity = Form(...),
    ctx: RequestContext = Depends(require_perm("plots:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    supplier = await supplier_svc.get_supplier(db, ctx, supplierId)
    assert ctx.org is not None
    content = await file.read()
    out = await plot_svc.import_plots(
        db,
        ctx.org,
        supplier,
        commodity=commodity,
        filename=file.filename or "upload",
        content=content,
        created_via="import",
        ctx=ctx,
    )
    await db.commit()
    return out


@router.get("/plots/{plot_id}")
async def get_plot(
    plot_id: uuid.UUID,
    ctx: RequestContext = Depends(require_perm("plots:read")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    p, name = await plot_svc.get_plot(db, ctx, plot_id)
    return await plot_svc.plot_detail(db, p, name)


@router.patch("/plots/{plot_id}")
async def patch_plot(
    plot_id: uuid.UUID,
    body: PlotPatchIn,
    ctx: RequestContext = Depends(require_perm("plots:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    p, name = await plot_svc.get_plot(db, ctx, plot_id)
    assert ctx.org is not None
    changes = body.model_dump(exclude_unset=True)
    reassess = False
    if changes.get("reference") and changes["reference"] != p.reference:
        if await plot_svc._reference_taken(db, ctx.org_id, changes["reference"], exclude=p.id):
            from app.core.errors import conflict

            raise conflict("reference_taken", f"A plot with reference {changes['reference']} already exists.")
        p.reference = changes["reference"]
    if changes.get("commodity"):
        p.commodity = changes["commodity"]
        reassess = True
    if "declared_area_ha" in changes and changes["declared_area_ha"] != p.declared_area_ha:
        result, out = await plot_svc.validate_for_org(
            db, ctx.org_id, p.geometry, p.country, changes["declared_area_ha"], exclude=p.id
        )
        if not out["valid"]:
            raise plot_svc.geometry_error(out)
        p.declared_area_ha = changes["declared_area_ha"]
        p.area_ha = float(result.area_ha)
        p.validation = {"valid": True, "issues": out["issues"]}
        reassess = True
    await audit(
        db,
        ctx,
        action="plot.updated",
        resource_type="plot",
        resource_id=p.id,
        metadata={"reference": p.reference, "fields": sorted(changes)},
    )
    if reassess and (ctx.org.settings or {}).get("autoAssess", True):
        await plot_svc.run_assessment(db, ctx.org, p, ctx=ctx)
    await db.commit()
    return await plot_svc.plot_detail(db, p, name)


@router.delete("/plots/{plot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plot(
    plot_id: uuid.UUID,
    ctx: RequestContext = Depends(require_perm("plots:write")),
    db: AsyncSession = Depends(get_db),
) -> Response:
    p, _name = await plot_svc.get_plot(db, ctx, plot_id)
    await plot_svc.archive(db, ctx, p)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/plots/{plot_id}/assess")
async def assess(
    plot_id: uuid.UUID,
    ctx: RequestContext = Depends(require_perm("plots:write")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    p, _name = await plot_svc.get_plot(db, ctx, plot_id)
    assert ctx.org is not None
    a = await plot_svc.run_assessment(db, ctx.org, p, ctx=ctx)
    await db.commit()
    return plot_svc.assessment_out(a)


@router.get("/plots/{plot_id}/assessments")
async def assessments(
    plot_id: uuid.UUID,
    ctx: RequestContext = Depends(require_perm("plots:read")),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    p, _name = await plot_svc.get_plot(db, ctx, plot_id)
    return await plot_svc.assessments_for(db, p.id)


@router.get("/plots/{plot_id}/imagery/{kind}.png", response_class=Response)
async def imagery(
    plot_id: uuid.UUID,
    kind: Literal["baseline", "current", "forest", "loss"],
    ctx: RequestContext = Depends(require_perm("plots:read")),
    db: AsyncSession = Depends(get_db),
) -> Response:
    p, _name = await plot_svc.get_plot(db, ctx, plot_id)
    png = await plot_svc.imagery_png(p, kind)
    return Response(png, media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})


@router.get("/plots/{plot_id}/similar")
async def similar(
    plot_id: uuid.UUID,
    k: int = Query(6, ge=1, le=24),
    ctx: RequestContext = Depends(require_perm("plots:read")),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    p, _name = await plot_svc.get_plot(db, ctx, plot_id)
    return await plot_svc.similar(db, ctx, p, k)


@router.post("/plots/{plot_id}/review")
async def review(
    plot_id: uuid.UUID,
    body: ReviewIn,
    ctx: RequestContext = Depends(require_perm("plots:review")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    p, _name = await plot_svc.get_plot(db, ctx, plot_id)
    assert ctx.org is not None
    a = await plot_svc.review(db, ctx, ctx.org, p, body.decision, body.note)
    await db.commit()
    return plot_svc.assessment_out(a)


@router.get("/reviews")
async def reviews(
    ctx: RequestContext = Depends(require_perm("plots:review")), db: AsyncSession = Depends(get_db)
) -> list[dict]:
    if ctx.is_supplier:
        raise forbidden()
    return await plot_svc.review_queue(db, ctx)
