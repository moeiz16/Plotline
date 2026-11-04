from __future__ import annotations

from tests.conftest import PASSWORD, csrf, signup, unique_email


async def test_signup_sets_cookies_and_me(client) -> None:
    acct = await signup(client, org_name="Hanse Coffee Traders")
    assert {"pl_at", "pl_rt", "pl_csrf"} <= set(client.cookies.keys())
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 200
    me = r.json()
    assert me["user"]["email"] == acct.email
    assert me["activeOrg"]["name"] == "Hanse Coffee Traders"
    assert me["activeOrg"]["slug"] == "hanse-coffee-traders"
    assert me["membership"]["role"] == "owner"
    assert me["membership"]["roleLabel"] == "Owner"
    assert "org:admin" in me["membership"]["permissions"]
    assert me["orgs"][0]["role"] == "owner"
    assert me["activeOrg"]["deadline"]["date"] == "2026-12-30"
    assert me["activeOrg"]["settings"] == {"retentionYears": 5, "reviewAllHighRisk": True, "autoAssess": True}


async def test_signup_without_org_has_no_membership(client) -> None:
    await signup(client, org_name=None)
    me = (await client.get("/api/v1/auth/me")).json()
    assert me["activeOrg"] is None and me["membership"] is None
    r = await client.get("/api/v1/dashboard")
    assert r.status_code == 403 and r.json()["code"] == "no_active_org"


async def test_duplicate_email_conflict(client, make_client) -> None:
    acct = await signup(client)
    r = await make_client().post(
        "/api/v1/auth/signup", json={"email": acct.email.upper(), "password": PASSWORD, "fullName": "Again"}
    )
    assert r.status_code == 409 and r.json()["code"] == "email_taken"


async def test_signup_validation_errors_are_problem_json(client) -> None:
    r = await client.post(
        "/api/v1/auth/signup", json={"email": "not-an-email", "password": "x", "fullName": ""}
    )
    assert r.status_code == 422
    assert r.headers["content-type"].startswith("application/problem+json")
    body = r.json()
    assert body["code"] == "validation_error"
    assert {e["field"] for e in body["errors"]} >= {"email", "fullName"}


async def test_weak_password_rejected(client) -> None:
    r = await client.post(
        "/api/v1/auth/signup", json={"email": unique_email(), "password": "short", "fullName": "Weak Pw"}
    )
    assert r.status_code == 422 and r.json()["code"] == "weak_password"


async def test_login_success_and_failure(client, make_client) -> None:
    acct = await signup(client)
    other = make_client()
    bad = await other.post("/api/v1/auth/login", json={"email": acct.email, "password": "Wrong-Password-99"})
    assert bad.status_code == 401 and bad.json()["code"] == "invalid_credentials"
    unknown = await other.post("/api/v1/auth/login", json={"email": unique_email(), "password": PASSWORD})
    assert unknown.status_code == 401 and unknown.json()["detail"] == bad.json()["detail"]
    ok = await other.post("/api/v1/auth/login", json={"email": acct.email, "password": PASSWORD})
    assert ok.status_code == 200
    body = ok.json()
    assert body["activeOrgId"] == acct.org_id
    assert body["orgs"][0]["id"] == acct.org_id


async def test_failed_login_is_audited(client, make_client) -> None:
    acct = await signup(client)
    await make_client().post(
        "/api/v1/auth/login", json={"email": acct.email, "password": "Wrong-Password-99"}
    )
    items = (await acct.get("/api/v1/audit?action=auth.login_failed")).json()["items"]
    assert len(items) == 1 and items[0]["label"] == "Sign-in attempt failed"


async def test_unauthenticated_requests_get_401(client) -> None:
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 401 and r.json()["code"] == "unauthorized"


async def test_csrf_required_for_cookie_writes(client) -> None:
    acct = await signup(client)
    r = await client.patch("/api/v1/org", json={"name": "No CSRF"})
    assert r.status_code == 403 and r.json()["code"] == "csrf_failed"
    r = await client.patch("/api/v1/org", json={"name": "Wrong CSRF"}, headers={"X-CSRF-Token": "nope"})
    assert r.status_code == 403
    r = await acct.patch("/api/v1/org", json={"name": "With CSRF"})
    assert r.status_code == 200 and r.json()["name"] == "With CSRF"


async def test_bearer_token_needs_no_csrf(client, make_client) -> None:
    await signup(client)
    token = client.cookies.get("pl_at")
    bare = make_client()
    r = await bare.patch(
        "/api/v1/org", json={"name": "Bearer Org"}, headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 200


async def test_refresh_rotates_and_detects_reuse(client) -> None:
    await signup(client)
    old_refresh = client.cookies.get("pl_rt", path="/api/v1/auth")
    r = await client.post("/api/v1/auth/refresh", headers=csrf(client))
    assert r.status_code == 200 and r.json() == {"ok": True}
    new_refresh = client.cookies.get("pl_rt", path="/api/v1/auth")
    assert new_refresh != old_refresh
    # Replaying the superseded token revokes the session.
    client.cookies.set("pl_rt", old_refresh, path="/api/v1/auth")
    r = await client.post("/api/v1/auth/refresh", headers=csrf(client))
    assert r.status_code == 401 and r.json()["code"] == "session_revoked"
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 401 and r.json()["code"] == "session_revoked"


async def test_logout_revokes_session(client) -> None:
    await signup(client)
    access = client.cookies.get("pl_at")
    r = await client.post("/api/v1/auth/logout", headers=csrf(client))
    assert r.status_code == 204
    r = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert r.status_code == 401 and r.json()["code"] == "session_revoked"


async def test_switch_org(client, make_client) -> None:
    a = await signup(client, org_name="First Importer")
    b = await signup(make_client(), org_name="Second Importer")
    r = await b.post("/api/v1/org/invitations", json={"email": a.email, "role": "auditor"})
    token = r.json()["inviteUrl"].rsplit("/", 1)[1]
    assert (await a.post(f"/api/v1/invitations/{token}/accept", json={})).status_code == 200
    r = await a.post("/api/v1/auth/switch-org", json={"orgId": a.org_id})
    assert r.status_code == 200
    assert r.json()["activeOrg"]["name"] == "First Importer"
    assert r.json()["membership"]["role"] == "owner"
    assert (await a.get("/api/v1/org")).json()["id"] == a.org_id


async def test_switch_to_foreign_org_is_404(client, make_client) -> None:
    a = await signup(client)
    b = await signup(make_client(), org_name="Foreign Org")
    r = await a.post("/api/v1/auth/switch-org", json={"orgId": b.org_id})
    assert r.status_code == 404
