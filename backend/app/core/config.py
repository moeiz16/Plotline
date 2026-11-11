"""Central configuration (12-factor). Every setting is overridable via env / .env.

Add new settings to the relevant section; never rename existing ones.
"""

from __future__ import annotations

from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(REPO_ROOT / ".env"), str(BACKEND_ROOT / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── App ────────────────────────────────────────────────────────────────
    app_name: str = "Plotline"
    environment: Literal["dev", "test", "staging", "prod"] = "dev"
    api_prefix: str = "/api/v1"
    public_app_url: str = "http://localhost:3010"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3010"])
    log_level: str = "INFO"
    log_json: bool = False

    # ── Security ───────────────────────────────────────────────────────────
    secret_key: SecretStr = SecretStr("dev-insecure-change-me-0123456789abcdef")
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 7
    password_min_length: int = 12
    cookie_secure: bool = False
    cookie_domain: str | None = None
    trusted_proxies: list[str] = Field(default_factory=lambda: ["127.0.0.1", "::1"])
    rate_limit_per_minute: int = 240
    auth_rate_limit_per_minute: int = 10
    portal_rate_limit_per_minute: int = 60
    portal_link_ttl_days: int = 30
    max_upload_bytes: int = 5 * 1024 * 1024
    invitation_ttl_days: int = 7

    # ── Database ───────────────────────────────────────────────────────────
    database_url: str = "sqlite+aiosqlite:///./plotline-dev.db"
    database_echo: bool = False

    # ── Durable workflows (Temporal) ───────────────────────────────────────
    temporal_address: str = "localhost:7233"
    temporal_namespace: str = "default"
    temporal_task_queue: str = "plotline-campaigns"
    temporal_worker_inline: bool = True  # run the worker inside the API process (saves memory locally)
    # Demo time scale: 1 campaign "day" lasts this many seconds of wall time (86400 = real time).
    campaign_day_seconds: int = 86_400
    temporal_connect_timeout_s: float = 2.0

    # ── Earth observation & change signal ────────────────────────────────
    data_dir: Path = REPO_ROOT / "data"
    eo_source: Literal["bundled", "live"] = "bundled"
    change_encoder_path: Path = REPO_ROOT / "ml" / "artifacts" / "encoder.npz"
    change_eval_path: Path = REPO_ROOT / "ml" / "artifacts" / "eval.json"

    # ── Plain-language summaries ───────────────────────────────────────────
    llm_fake: bool = True
    groq_api_key: SecretStr = SecretStr("")
    gemini_api_key: SecretStr = SecretStr("")
    openrouter_api_key: SecretStr = SecretStr("")
    llm_timeout_s: float = 30.0

    # ── Compliance ─────────────────────────────────────────────────────────
    evidence_retention_years: int = 5
    # EUDR application dates (Regulation (EU) 2023/1115 as amended by 2025/2650).
    deadline_large: date = date(2026, 12, 30)
    deadline_sme: date = date(2027, 6, 30)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_prod(self) -> bool:
        return self.environment == "prod"


@lru_cache
def get_settings() -> Settings:
    return Settings()
