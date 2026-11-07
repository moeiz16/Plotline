"""Due diligence statements: list, detail, simulated submission and evidence pack downloads."""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends, Response
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import RequestContext, get_db, require_perm
from app.evidence.pack import render_html, render_pdf
from app.services import dds as dds_svc

router = APIRouter(prefix="/dds", tags=["statements"])


@router.get("")
async def list_dds(
    ctx: RequestContext = Depends(require_perm("dds:read")), db: AsyncSession = Depends(get_db)
) -> list[dict]:
    return await dds_svc.list_dds(db, ctx.org_id)


@router.get("/{dds_id}")
async def get_dds(
    dds_id: uuid.UUID,
    ctx: RequestContext = Depends(require_perm("dds:read")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    d, s = await dds_svc.get_dds(db, ctx.org_id, dds_id)
    return await dds_svc.dds_detail(db, d, s)


@router.post("/{dds_id}/submit")
async def submit(
    dds_id: uuid.UUID,
    ctx: RequestContext = Depends(require_perm("dds:submit")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    d, s = await dds_svc.get_dds(db, ctx.org_id, dds_id)
    assert ctx.org is not None
    try:
        await dds_svc.submit(db, ctx, ctx.org, d, s)
    finally:
        await db.commit()  # keep the rejection log entry when submission fails
    return await dds_svc.dds_detail(db, d, s)


def _filename(d, ext: str) -> str:
    return f"{d.internal_ref}.{ext}"


@router.get("/{dds_id}/payload.json")
async def payload(
    dds_id: uuid.UUID,
    ctx: RequestContext = Depends(require_perm("dds:read")),
    db: AsyncSession = Depends(get_db),
) -> Response:
    d, _s = await dds_svc.get_dds(db, ctx.org_id, dds_id)
    return Response(
        json.dumps(d.payload, indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{_filename(d, "json")}"'},
    )


@router.get("/{dds_id}/evidence.html", response_class=HTMLResponse)
async def evidence_html(
    dds_id: uuid.UUID,
    ctx: RequestContext = Depends(require_perm("dds:read")),
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    d, s = await dds_svc.get_dds(db, ctx.org_id, dds_id)
    assert ctx.org is not None
    return HTMLResponse(render_html(await dds_svc.evidence_context(db, ctx.org, d, s)))


@router.get("/{dds_id}/evidence.pdf")
async def evidence_pdf(
    dds_id: uuid.UUID,
    ctx: RequestContext = Depends(require_perm("dds:read")),
    db: AsyncSession = Depends(get_db),
) -> Response:
    d, s = await dds_svc.get_dds(db, ctx.org_id, dds_id)
    assert ctx.org is not None
    pdf = render_pdf(await dds_svc.evidence_context(db, ctx.org, d, s))
    return Response(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{_filename(d, "pdf")}"'},
    )
