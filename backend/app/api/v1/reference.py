"""Reference data: EU country benchmarking (Implementing Regulation (EU) 2025/1093)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from app.core.deps import RequestContext, get_ctx
from app.services import domain

router = APIRouter(tags=["reference"])


@router.get("/countries")
async def countries(response: Response, _ctx: RequestContext = Depends(get_ctx)) -> list[dict]:
    response.headers["Cache-Control"] = "private, max-age=3600"
    return domain.list_countries()
