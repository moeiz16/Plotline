"""Leadership dashboard and country benchmarking."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import RequestContext, get_db, require_perm
from app.services import dashboard as dashboard_svc

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
async def dashboard(
    ctx: RequestContext = Depends(require_perm("dashboard:read")), db: AsyncSession = Depends(get_db)
) -> dict:
    assert ctx.org is not None
    return await dashboard_svc.build(db, ctx.org)
