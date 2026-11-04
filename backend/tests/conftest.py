"""Shared test fixtures (owned by workstream A).

* Settings are pinned via env vars before the app is imported (temp SQLite DB, generous rate limits, offline).
* Tests isolate by creating fresh users / orgs (unique emails) rather than truncating tables.
* API tests run against the real domain core (bundled synthetic landscape); a few swap single functions of
  the domain gateway (`app.services.domain`) with monkeypatch to pin exact outcomes.
"""

from __future__ import annotations

import asyncio
import os
import tempfile
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="plotline-test-"))
os.environ.update(
    {
        "ENVIRONMENT": "test",
        "DATABASE_URL": f"sqlite+aiosqlite:///{_TMP / 'test.db'}",
        "SECRET_KEY": "test-secret-key-0123456789abcdefghijklmnop",
        "RATE_LIMIT_PER_MINUTE": "100000",
        "AUTH_RATE_LIMIT_PER_MINUTE": "100000",
        "PORTAL_RATE_LIMIT_PER_MINUTE": "100000",
        "LLM_FAKE": "true",
        "EO_SOURCE": "bundled",
        "LOG_LEVEL": "WARNING",
        "TEMPORAL_WORKER_INLINE": "false",
    }
)

import httpx  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.ratelimit import limiter  # noqa: E402
from app.db.session import get_engine  # noqa: E402

get_settings.cache_clear()
PASSWORD = "Correct-Horse-Battery-42"
TOOLS_DIR = Path(__file__).resolve().parents[2] / ".tools"


async def _create_schema() -> None:
    import app.db.models  # noqa: F401
    from app.db.base import Base

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def _schema() -> None:
    asyncio.run(_create_schema())


@pytest_asyncio.fixture(autouse=True)
async def _isolate() -> AsyncIterator[None]:
    from app.workflows import client as wf

    limiter.reset()
    wf.set_client(None)
    yield
    wf.set_client(None)
    await get_engine().dispose()


@pytest.fixture
def app():
    from app.main import app as fastapi_app

    return fastapi_app


def _client(app) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver", follow_redirects=False
    )


@pytest_asyncio.fixture
async def client(app) -> AsyncIterator[httpx.AsyncClient]:
    async with _client(app) as c:
        yield c


@pytest_asyncio.fixture
async def make_client(app) -> AsyncIterator:
    """Factory for extra independent clients (separate cookie jars = separate users)."""
    clients: list[httpx.AsyncClient] = []

    def _make() -> httpx.AsyncClient:
        c = _client(app)
        clients.append(c)
        return c

    yield _make
    for c in clients:
        await c.aclose()


def csrf(client: httpx.AsyncClient) -> dict[str, str]:
    token = client.cookies.get("pl_csrf")
    return {"X-CSRF-Token": token} if token else {}


def unique_email(prefix: str = "user") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}@plotline-tests.example"


@dataclass
class Account:
    client: httpx.AsyncClient
    email: str
    user: dict
    org_id: str | None = None
    extra: dict = field(default_factory=dict)

    @property
    def headers(self) -> dict[str, str]:
        return csrf(self.client)

    async def get(self, url: str, **kw) -> httpx.Response:
        return await self.client.get(url, **kw)

    async def post(self, url: str, **kw) -> httpx.Response:
        return await self.client.post(url, headers={**self.headers, **kw.pop("headers", {})}, **kw)

    async def patch(self, url: str, **kw) -> httpx.Response:
        return await self.client.patch(url, headers={**self.headers, **kw.pop("headers", {})}, **kw)

    async def delete(self, url: str, **kw) -> httpx.Response:
        return await self.client.delete(url, headers={**self.headers, **kw.pop("headers", {})}, **kw)


async def signup(
    client: httpx.AsyncClient,
    *,
    org_name: str | None = "Riverside Imports",
    email: str | None = None,
    full_name: str = "Test User",
) -> Account:
    email = email or unique_email()
    body = {"email": email, "password": PASSWORD, "fullName": full_name}
    if org_name:
        body["orgName"] = org_name
    r = await client.post("/api/v1/auth/signup", json=body)
    assert r.status_code == 201, r.text
    data = r.json()
    acct = Account(client=client, email=email, user=data["user"], org_id=data["activeOrgId"])
    if acct.org_id:
        r = await acct.patch(
            "/api/v1/org",
            json={"country": "DE", "eori": "DE1234567890123", "address": "Speicherstadt 1, Hamburg"},
        )
        assert r.status_code == 200, r.text
    return acct


async def add_member(
    owner: Account, new_client: httpx.AsyncClient, role: str, supplier_id: str | None = None
) -> Account:
    email = unique_email(role)
    body = {"email": email, "role": role}
    if supplier_id:
        body["supplierId"] = supplier_id
    r = await owner.post("/api/v1/org/invitations", json=body)
    assert r.status_code == 201, r.text
    token = r.json()["inviteUrl"].rsplit("/", 1)[1]
    r = await new_client.post(
        f"/api/v1/invitations/{token}/accept",
        json={"fullName": f"{role.title()} Person", "password": PASSWORD},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    return Account(client=new_client, email=email, user=body["user"], org_id=body["activeOrg"]["id"])


@pytest_asyncio.fixture
async def owner(client) -> Account:
    return await signup(client)


# ── Domain helpers ───────────────────────────────────────────────────────────
def demo(reference: str):
    from app.eo.demo import DEMO_PLOTS

    return next(p for p in DEMO_PLOTS if p.reference == reference)


def demo_by_scenario(scenario: str):
    from app.eo.demo import DEMO_PLOTS

    return [p for p in DEMO_PLOTS if p.scenario == scenario]


async def create_supplier(
    acct: Account, name: str = "Cooperative Test", country: str = "CI", commodities: list[str] | None = None
) -> dict:
    r = await acct.post(
        "/api/v1/suppliers",
        json={
            "name": name,
            "country": country,
            "commodities": commodities or ["cocoa"],
            "kind": "cooperative",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def create_plot_from_demo(acct: Account, supplier_id: str, dp, reference: str | None = None) -> dict:
    body = {
        "supplierId": supplier_id,
        "reference": reference or dp.reference,
        "commodity": dp.commodity,
        "country": dp.country,
        "geometry": dp.geometry,
    }
    if dp.declared_area_ha is not None:
        body["declaredAreaHa"] = dp.declared_area_ha
    r = await acct.post("/api/v1/plots", json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def create_product(acct: Account, commodity: str = "cocoa") -> dict:
    r = await acct.post(
        "/api/v1/products",
        json={
            "name": "Cocoa beans" if commodity == "cocoa" else "Green coffee",
            "commodity": commodity,
            "hsCode": "1801" if commodity == "cocoa" else "0901 11",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()
