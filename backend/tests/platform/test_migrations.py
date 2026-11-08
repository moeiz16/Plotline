"""Alembic migrations build the full schema and match the models (no drift)."""

from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

from alembic import command
from app.cli import alembic_config
from app.db import models  # noqa: F401
from app.db.base import Base


def _config(db_path: Path):
    cfg = alembic_config()
    cfg.attributes["database_url"] = f"sqlite+aiosqlite:///{db_path}"
    cfg.attributes["configure_logger"] = False
    return cfg


def test_upgrade_head_creates_every_table_without_drift() -> None:
    db_path = Path(tempfile.mkdtemp(prefix="plotline-mig-")) / "m.db"
    cfg = _config(db_path)
    command.upgrade(cfg, "head")
    with sqlite3.connect(db_path) as conn:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert set(Base.metadata.tables) <= tables
    command.check(cfg)  # raises when the models and migrations disagree
    command.downgrade(cfg, "base")
    with sqlite3.connect(db_path) as conn:
        left = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert left <= {"alembic_version"}
