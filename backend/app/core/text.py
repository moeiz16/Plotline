"""Small helpers for user-facing text."""

from __future__ import annotations

from datetime import date, datetime


def human_date(value: date | datetime) -> str:
    """`8 Dec 2026` (no leading zero, short month)."""
    return f"{value.day} {value.strftime('%b')} {value.year}"
