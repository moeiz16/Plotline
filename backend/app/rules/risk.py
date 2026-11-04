"""EU country benchmarking (low / standard / high risk) for EUDR due diligence.

Source: Commission Implementing Regulation (EU) 2025/1093, Annex (static table in ``data/country_risk.json``).
Countries not listed as low or high risk are standard risk. Low-risk operators may apply simplified due
diligence (Art. 13 of Regulation (EU) 2023/1115); high-risk origins need enhanced scrutiny. The table is a
transcription for this application: verify against the Annex before relying on it.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

from app.spatial.countries import all_countries, country_name

DATA = Path(__file__).parent / "data" / "country_risk.json"
RiskTier = Literal["low", "standard", "high"]


@lru_cache(maxsize=1)
def _table() -> dict:
    return json.loads(DATA.read_text(encoding="utf-8"))


def benchmarking_version() -> str:
    return str(_table()["version"])


def risk_tier(country: str) -> RiskTier:
    code = (country or "").upper()
    t = _table()
    if code in t["high"]:
        return "high"
    if code in t["low"]:
        return "low"
    return "standard"


def commodities_for(country: str) -> list[str]:
    return list(_table()["commodities"].get((country or "").upper(), []))


def list_countries() -> list[dict]:
    """Every country with its risk tier and main EUDR commodities, sorted by name."""
    return [
        {"code": code, "name": name, "riskTier": risk_tier(code), "commodities": commodities_for(code)}
        for code, name in all_countries()
    ]


def source() -> dict:
    t = _table()
    return {"source": t["source"], "url": t["url"], "version": t["version"], "note": t["note"]}


__all__ = ["benchmarking_version", "commodities_for", "country_name", "list_countries", "risk_tier", "source"]
