"""Shared test fixtures (owned by workstream A)."""

from __future__ import annotations

import os

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("LLM_FAKE", "true")
os.environ.setdefault("EO_SOURCE", "bundled")
