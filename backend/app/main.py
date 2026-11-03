"""Plotline API: application factory.

Scaffold only. Workstream A adds middleware (request id, security headers, rate limiting), error
handlers, the lifespan (schema bootstrap, inline Temporal worker) and the routers listed in
docs/API_CONTRACT.md.
"""

from __future__ import annotations

from fastapi import FastAPI

from app.api.v1.health import router as health_router
from app.core.config import get_settings


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title="Plotline API",
        version="0.1.0",
        description="EUDR due diligence: plots, forest evidence, traceability and due diligence statements.",
        docs_url="/docs" if not s.is_prod else None,
        redoc_url=None,
    )
    app.include_router(health_router)
    app.include_router(health_router, prefix=s.api_prefix, include_in_schema=False)
    return app


app = create_app()
