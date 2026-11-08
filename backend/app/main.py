"""Plotline API: application factory."""

from __future__ import annotations

import importlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.core.logging import configure_logging
from app.core.middleware import CachePolicyMiddleware, RequestContextMiddleware, SecurityHeadersMiddleware
from app.core.ratelimit import RateLimitMiddleware

log = structlog.get_logger("plotline")

ROUTERS = (
    "auth",
    "org",
    "dashboard",
    "suppliers",
    "plots",
    "shipments",
    "dds",
    "campaigns",
    "portal",
    "reference",
    "audit",
)

OPENAPI_TAGS = [
    {"name": "auth", "description": "Sign-in, sessions and organisation switching"},
    {"name": "organisation", "description": "Organisation profile, members and invitations"},
    {"name": "dashboard", "description": "Readiness, plots at risk and insights"},
    {"name": "suppliers", "description": "Suppliers and their upload links"},
    {"name": "plots", "description": "Plot geolocation, validation, assessment and review"},
    {"name": "shipments", "description": "Products, shipments, allocations and traceability"},
    {"name": "statements", "description": "Due diligence statements and evidence packs"},
    {"name": "campaigns", "description": "Supplier evidence campaigns (durable workflows)"},
    {"name": "portal", "description": "Public supplier upload portal"},
    {"name": "reference", "description": "Country benchmarking"},
    {"name": "audit", "description": "Tamper-evident audit trail"},
    {"name": "health", "description": "Liveness, readiness and metrics"},
]


async def bootstrap_schema() -> None:
    """Local SQLite convenience: dev runs the migrations, tests create the tables directly.

    Production schemas are managed explicitly with Alembic (`python -m app.cli db upgrade`).
    """
    import asyncio

    import app.db.models  # noqa: F401  (register all tables)
    from app.db.base import Base
    from app.db.session import get_engine

    if get_settings().environment == "dev":
        from app.cli import upgrade_head

        try:
            await asyncio.to_thread(upgrade_head)
            return
        except Exception as exc:  # fall back to creating tables so the API still boots
            log.warning("migrations_failed_using_create_all", error=type(exc).__name__)
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    from app.workflows import client as wf_client

    s = get_settings()
    if s.is_sqlite and s.environment in ("dev", "test"):
        await bootstrap_schema()
    if s.temporal_worker_inline and s.environment != "test":
        wf_client.start_background_worker()
    log.info(
        "plotline_started",
        environment=s.environment,
        db="sqlite" if s.is_sqlite else "postgresql",
        eo_source=s.eo_source,
    )
    try:
        yield
    finally:
        await wf_client.shutdown()
        from app.db.session import get_engine

        await get_engine().dispose()


def create_app() -> FastAPI:
    s = get_settings()
    configure_logging(s.log_level, s.log_json)
    app = FastAPI(
        title="Plotline API",
        version="1.0.0",
        description=(
            "EUDR due diligence: supplier plots, forest evidence, traceability, supplier campaigns and due "
            "diligence statements. Verdicts rest on official forest datasets."
        ),
        openapi_tags=OPENAPI_TAGS,
        lifespan=lifespan,
        docs_url="/docs" if not s.is_prod else None,
        redoc_url=None,
    )
    install_error_handlers(app)

    # Starlette applies middleware in reverse order of addition: the last added is outermost.
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(CachePolicyMiddleware, api_prefix=s.api_prefix)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-CSRF-Token", "X-Request-ID"],
        expose_headers=["X-Request-ID", "Retry-After", "Content-Disposition"],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestContextMiddleware)

    from app.api.v1.health import router as health_router

    app.include_router(health_router)  # /health, /health/ready, /metrics at the root for probes
    app.include_router(health_router, prefix=s.api_prefix, include_in_schema=False)
    for name in ROUTERS:
        app.include_router(importlib.import_module(f"app.api.v1.{name}").router, prefix=s.api_prefix)
    return app


app = create_app()
