"""Plotline command line: database setup, demo seed and the standalone campaign worker.

python -m app.cli db init          # create / upgrade the schema (Alembic)
python -m app.cli seed demo        # seed the demo organisation (offline, synthetic)
python -m app.cli worker           # run the campaign worker outside the API process
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import typer

from app.core.config import BACKEND_ROOT, get_settings
from app.core.logging import configure_logging

app = typer.Typer(help="Plotline administration", no_args_is_help=True, add_completion=False)
db_app = typer.Typer(help="Database schema", no_args_is_help=True)
seed_app = typer.Typer(help="Demo data", no_args_is_help=True)
app.add_typer(db_app, name="db")
app.add_typer(seed_app, name="seed")


def alembic_config():
    from alembic.config import Config

    cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    cfg.attributes["configure_logger"] = False  # keep the app's logging setup
    return cfg


async def _schema_state(url: str) -> tuple[bool, bool]:
    from sqlalchemy import inspect
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine(url)
    try:
        async with engine.connect() as conn:
            names = await conn.run_sync(lambda c: set(inspect(c).get_table_names()))
    finally:
        await engine.dispose()
    return "organizations" in names, "alembic_version" in names


def upgrade_head() -> None:
    """Upgrade to the latest migration. A schema created by the dev bootstrap is adopted (stamped) first."""
    from alembic import command

    cfg = alembic_config()
    has_tables, versioned = asyncio.run(_schema_state(get_settings().database_url))
    if has_tables and not versioned:
        command.stamp(cfg, "head")
    command.upgrade(cfg, "head")


@db_app.command("init")
def db_init() -> None:
    """Create or upgrade the database schema to the latest migration."""
    upgrade_head()
    typer.echo("Database schema is up to date.")


@db_app.command("upgrade")
def db_upgrade(revision: str = "head") -> None:
    from alembic import command

    command.upgrade(alembic_config(), revision)


@db_app.command("reset")
def db_reset(
    yes: bool = typer.Option(False, "--yes", help="Confirm deleting the local SQLite database"),
) -> None:
    """Delete the local SQLite database and recreate the schema (development only)."""
    s = get_settings()
    if not s.is_sqlite or s.is_prod:
        raise typer.BadParameter("reset is only available for a local SQLite database")
    if not yes:
        raise typer.BadParameter("pass --yes to confirm")
    path = Path(s.database_url.split("///", 1)[1])
    for suffix in ("", "-wal", "-shm"):
        Path(f"{path}{suffix}").unlink(missing_ok=True)
    upgrade_head()
    typer.echo("Database recreated.")


async def _seed() -> bool:
    from app.db.session import get_engine, session_scope
    from app.services.seed import already_seeded, seed_demo

    try:
        async with session_scope() as db:
            if await already_seeded(db):
                return False
            await seed_demo(db)
        return True
    finally:
        await get_engine().dispose()


@seed_app.command("demo")
def seed_demo_cmd() -> None:
    """Seed Northbank Cocoa & Coffee Imports (synthetic sample data, works offline)."""
    configure_logging("WARNING")
    if asyncio.run(_seed()):
        typer.echo(
            "Seeded the demo organisation. Sign in as amelie.kraus@northbank.example / Northbank-Demo-2026"
        )
    else:
        typer.echo(
            "Demo organisation already present; nothing to do. "
            "(`python -m app.cli db reset --yes` starts over.)"
        )


@app.command("worker")
def worker() -> None:
    """Run the campaign worker on its own (when TEMPORAL_WORKER_INLINE=false)."""
    configure_logging(get_settings().log_level)

    async def _run() -> None:
        from app.workflows import client as wf

        while True:
            client = await wf.connect()
            if client is not None:
                break
            typer.echo("Waiting for the workflow service…")
            await asyncio.sleep(5)
        await wf.reconcile(client)
        await wf.build_worker(client).run()

    asyncio.run(_run())


if __name__ == "__main__":
    app()
