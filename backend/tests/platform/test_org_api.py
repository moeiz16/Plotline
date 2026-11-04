from __future__ import annotations

import uuid
from datetime import timedelta

from sqlalchemy import update

from app.db.base import utcnow
from app.db.models.platform import Invitation
from app.db.session import session_scope
from tests.conftest import PASSWORD, add_member, create_supplier, signup, unique_email


async def test_get_and_patch_org(owner) -> None:
    r = await owner.patch("/api/v1/org", json={"operatorSize": "sme", "settings": {"autoAssess": False}})
    assert r.status_code == 200
    org = r.json()
    assert org["operatorSize"] == "sme"
    assert org["deadline"]["date"] == "2027-06-30"
    assert org["settings"]["autoAssess"] is False and org["settings"]["retentionYears"] == 5
    assert (await owner.get("/api/v1/org")).json()["eori"] == "DE1234567890123"


async def test_patch_org_validation(owner) -> None:
    r = await owner.patch("/api/v1/org", json={"eori": "not valid!", "settings": {"retentionYears": 2}})
    assert r.status_code == 422
    fields = {e["field"] for e in r.json()["errors"]}
    assert "eori" in fields and "settings.retentionYears" in fields


async def test_invitation_flow_and_members(owner, make_client) -> None:
    reviewer = await add_member(owner, make_client(), "reviewer")
    me = (await reviewer.get("/api/v1/auth/me")).json()
    assert me["membership"]["role"] == "reviewer"
    assert "plots:review" in me["membership"]["permissions"]
    members = (await owner.get("/api/v1/org/members")).json()
    assert {m["role"] for m in members} == {"owner", "reviewer"}
    assert all(
        {"id", "userId", "fullName", "email", "roleLabel", "status", "joinedAt"} <= set(m) for m in members
    )
    actions = [i["action"] for i in (await owner.get("/api/v1/audit")).json()["items"]]
    assert "invitation.created" in actions and "invitation.accepted" in actions


async def test_invitation_preview_and_single_use(owner, make_client) -> None:
    email = unique_email("inv")
    r = await owner.post("/api/v1/org/invitations", json={"email": email, "role": "auditor"})
    assert r.status_code == 201
    token = r.json()["inviteUrl"].rsplit("/", 1)[1]
    assert r.json()["inviteUrl"].startswith("http://localhost:3010/invite/")
    preview = (await make_client().get(f"/api/v1/invitations/{token}")).json()
    assert preview == {**preview, "email": email, "role": "auditor", "roleLabel": "Auditor"}
    assert (await owner.get("/api/v1/org/invitations")).json()[0]["email"] == email
    c = make_client()
    ok = await c.post(f"/api/v1/invitations/{token}/accept", json={"fullName": "Ines", "password": PASSWORD})
    assert ok.status_code == 200
    again = await make_client().post(
        f"/api/v1/invitations/{token}/accept", json={"fullName": "X", "password": PASSWORD}
    )
    assert again.status_code == 410 and again.json()["code"] == "invitation_used"


async def test_expired_and_revoked_invitations(owner, make_client) -> None:
    r = await owner.post("/api/v1/org/invitations", json={"email": unique_email(), "role": "sourcing"})
    inv_id, token = r.json()["invitation"]["id"], r.json()["inviteUrl"].rsplit("/", 1)[1]
    async with session_scope() as db:
        await db.execute(
            update(Invitation)
            .values(expires_at=utcnow() - timedelta(days=1))
            .where(Invitation.id == uuid.UUID(inv_id))
        )
    r = await make_client().get(f"/api/v1/invitations/{token}")
    assert r.status_code == 410 and r.json()["code"] == "link_expired"
    r2 = await owner.post("/api/v1/org/invitations", json={"email": unique_email(), "role": "sourcing"})
    assert (await owner.delete(f"/api/v1/org/invitations/{r2.json()['invitation']['id']}")).status_code == 204
    token2 = r2.json()["inviteUrl"].rsplit("/", 1)[1]
    assert (await make_client().get(f"/api/v1/invitations/{token2}")).status_code == 404


async def test_supplier_invitation_requires_supplier(owner) -> None:
    r = await owner.post("/api/v1/org/invitations", json={"email": unique_email(), "role": "supplier"})
    assert r.status_code == 422
    assert r.json()["errors"][0]["field"] == "supplierId"


async def test_role_change_and_last_owner_guard(owner, make_client) -> None:
    member = await add_member(owner, make_client(), "sourcing")
    members = (await owner.get("/api/v1/org/members")).json()
    mid = next(m["id"] for m in members if m["email"] == member.email)
    oid = next(m["id"] for m in members if m["role"] == "owner")
    r = await owner.patch(f"/api/v1/org/members/{mid}", json={"role": "compliance_manager"})
    assert r.status_code == 200 and r.json()["roleLabel"] == "Compliance manager"
    r = await owner.patch(f"/api/v1/org/members/{oid}", json={"role": "auditor"})
    assert r.status_code == 409 and r.json()["code"] == "last_owner"
    assert (await owner.delete(f"/api/v1/org/members/{oid}")).status_code == 409


async def test_compliance_manager_cannot_touch_owner(owner, make_client) -> None:
    cm = await add_member(owner, make_client(), "compliance_manager")
    members = (await cm.get("/api/v1/org/members")).json()
    oid = next(m["id"] for m in members if m["role"] == "owner")
    r = await cm.patch(f"/api/v1/org/members/{oid}", json={"role": "auditor"})
    assert r.status_code == 403
    r = await cm.post("/api/v1/org/invitations", json={"email": unique_email(), "role": "owner"})
    assert r.status_code == 403


async def test_removed_member_loses_access(owner, make_client) -> None:
    member = await add_member(owner, make_client(), "sourcing")
    mid = next(m["id"] for m in (await owner.get("/api/v1/org/members")).json() if m["email"] == member.email)
    assert (await owner.delete(f"/api/v1/org/members/{mid}")).status_code == 204
    r = await member.get("/api/v1/suppliers")
    assert r.status_code == 403 and r.json()["code"] == "no_active_org"


async def test_rbac_denies_non_admins(owner, make_client) -> None:
    auditor = await add_member(owner, make_client(), "auditor")
    assert (await auditor.patch("/api/v1/org", json={"name": "x"})).status_code == 403
    assert (await auditor.get("/api/v1/org/invitations")).status_code == 403
    assert (
        await auditor.post("/api/v1/suppliers", json={"name": "S", "country": "GH", "commodities": ["cocoa"]})
    ).status_code == 403
    assert (await auditor.get("/api/v1/audit")).status_code == 200
    reviewer = await add_member(owner, make_client(), "reviewer")
    r = await reviewer.get("/api/v1/audit")
    assert r.status_code == 403 and r.json()["code"] == "forbidden"


async def test_existing_user_accepts_when_signed_in(owner, make_client) -> None:
    other = await signup(make_client(), org_name="Other Importer")
    r = await owner.post("/api/v1/org/invitations", json={"email": other.email, "role": "auditor"})
    token = r.json()["inviteUrl"].rsplit("/", 1)[1]
    anon = await make_client().post(f"/api/v1/invitations/{token}/accept", json={})
    assert anon.status_code == 409 and anon.json()["code"] == "sign_in_required"
    r = await other.post(f"/api/v1/invitations/{token}/accept", json={})
    assert r.status_code == 200
    assert len(r.json()["orgs"]) == 2 and r.json()["activeOrg"]["id"] == owner.org_id


async def test_supplier_member_is_scoped(owner, make_client) -> None:
    mine = await create_supplier(owner, "Mine Coop")
    await create_supplier(owner, "Other Coop")
    sup_user = await add_member(owner, make_client(), "supplier", supplier_id=mine["id"])
    me = (await sup_user.get("/api/v1/auth/me")).json()
    assert me["membership"]["supplierId"] == mine["id"]
    listed = (await sup_user.get("/api/v1/suppliers")).json()
    assert [s["name"] for s in listed] == ["Mine Coop"]
    assert (await sup_user.get("/api/v1/dashboard")).status_code == 403
    assert (await sup_user.get("/api/v1/org/members")).status_code == 403
