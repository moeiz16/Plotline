"""Cross-cutting HTTP behaviour: headers, request ids, errors, rate limits, metrics, SSE bus."""

from __future__ import annotations

import asyncio

from app.core.config import get_settings
from app.core.events import bus, event_stream, format_sse, publish
from app.core.middleware import route_label
from tests.conftest import signup


async def test_security_headers_and_request_id(client) -> None:
    r = await client.get("/health")
    assert r.status_code == 200
    h = r.headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert h["referrer-policy"] == "no-referrer"
    assert "default-src 'none'" in h["content-security-policy"]
    assert len(h["x-request-id"]) >= 16


async def test_incoming_request_id_is_echoed(client) -> None:
    r = await client.get("/api/v1/auth/me", headers={"X-Request-ID": "trace-abc-12345"})
    assert r.headers["x-request-id"] == "trace-abc-12345"
    assert r.json()["requestId"] == "trace-abc-12345"


async def test_api_responses_are_no_store(client) -> None:
    await signup(client)
    assert (await client.get("/api/v1/auth/me")).headers["cache-control"] == "no-store"


async def test_unknown_route_is_problem_json(client) -> None:
    r = await client.get("/api/v1/nope")
    assert r.status_code == 404
    assert r.headers["content-type"].startswith("application/problem+json")
    assert r.json()["status"] == 404 and r.json()["type"].startswith("https://plotline.dev/problems/")


async def test_auth_rate_limit_returns_429(client, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "auth_rate_limit_per_minute", 3)
    for _ in range(3):
        await client.post("/api/v1/auth/login", json={"email": "a@b.example", "password": "x"})
    r = await client.post("/api/v1/auth/login", json={"email": "a@b.example", "password": "x"})
    assert r.status_code == 429
    assert r.json()["code"] == "rate_limited"
    assert int(r.headers["retry-after"]) >= 1


async def test_portal_rate_limited_per_token(client, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "portal_rate_limit_per_minute", 2)
    for _ in range(2):
        assert (await client.get("/api/v1/portal/" + "x" * 40)).status_code == 410
    assert (await client.get("/api/v1/portal/" + "x" * 40)).status_code == 429


async def test_health_ready_and_metrics(client) -> None:
    r = await client.get("/health/ready")
    assert r.status_code == 200
    assert r.json()["databaseOk"] is True and r.json()["workflowEngine"] == "offline"
    await client.get("/api/v1/auth/me")
    text = (await client.get("/metrics")).text
    assert "plotline_http_requests_total" in text
    assert 'route="/api/v1/auth/me"' in text


def test_route_label_collapses_ids_and_tokens() -> None:
    assert (
        route_label("/api/v1/plots/0b7e6f8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b/assess")
        == "/api/v1/plots/{id}/assess"
    )
    assert (
        route_label("/api/v1/portal/abcdefghijklmnopqrstuvwxyz012345/plots") == "/api/v1/portal/{token}/plots"
    )


async def test_event_bus_fanout_and_heartbeat() -> None:
    received: list[dict] = []

    async def consume() -> None:
        async for msg in event_stream("campaign:test", heartbeat=0.05, max_events=3):
            received.append(msg)

    task = asyncio.create_task(consume())
    for _ in range(50):
        if bus.subscriber_count("campaign:test"):
            break
        await asyncio.sleep(0.01)
    await publish("campaign:test", "campaign.updated", {"stage": "reminded"})
    await asyncio.sleep(0.12)
    await asyncio.wait_for(task, 2)
    events = [m["event"] for m in received]
    assert events[0] == "campaign.updated"
    assert "heartbeat" in events
    assert bus.subscriber_count("campaign:test") == 0


def test_format_sse() -> None:
    assert format_sse("campaign.updated", {"a": 1}) == {"event": "campaign.updated", "data": '{"a":1}'}
