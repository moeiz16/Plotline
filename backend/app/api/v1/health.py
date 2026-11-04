"""Liveness, readiness and Prometheus metrics (mounted at the root and under the API prefix)."""

from __future__ import annotations

from fastapi import APIRouter, Response
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sqlalchemy import text

from app.core.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "plotline-api"}


@router.get("/health/ready")
async def ready() -> Response:
    from app.db.session import get_engine
    from app.workflows import client as wf_client

    s = get_settings()
    db_ok = True
    try:
        async with get_engine().connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    body = {
        "status": "ok" if db_ok else "degraded",
        "database": "sqlite" if s.is_sqlite else "postgresql",
        "databaseOk": db_ok,
        "eoSource": s.eo_source,
        "workflowEngine": "online" if wf_client.is_online() else "offline",
    }
    return JSONResponse(body, status_code=200 if db_ok else 503)


@router.get("/metrics", include_in_schema=False)
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
