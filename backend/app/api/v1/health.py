"""Liveness, readiness and Prometheus metrics (mounted at the root and under the API prefix)."""

from __future__ import annotations

from fastapi import APIRouter, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.core.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "plotline-api"}


@router.get("/health/ready")
async def ready() -> dict:
    s = get_settings()
    return {"status": "ok", "database": "sqlite" if s.is_sqlite else "postgresql", "eoSource": s.eo_source}


@router.get("/metrics", include_in_schema=False)
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
