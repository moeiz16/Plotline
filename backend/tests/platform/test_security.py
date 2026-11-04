from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.permissions import ALL_PERMISSIONS, ROLES, permissions_for, role_has, role_label
from app.core.security import (
    ISSUER,
    JWT_ALG,
    create_access_token,
    decode_access_token,
    derive_portal_token,
    hash_password,
    hash_token,
    new_refresh_token,
    parse_refresh_token,
    tokens_equal,
    validate_password_strength,
    verify_password,
)


def test_password_hash_is_argon2id_and_verifies() -> None:
    h = hash_password("Correct-Horse-Battery-42")
    assert h.startswith("$argon2id$")
    assert verify_password("Correct-Horse-Battery-42", h)
    assert not verify_password("wrong-password-123", h)


def test_verify_password_unknown_user_is_false() -> None:
    assert verify_password("anything-at-all-1", None) is False


@pytest.mark.parametrize("pw", ["short", "aaaaaaaaaaaaaaaa", "password1234"])
def test_weak_passwords_rejected(pw: str) -> None:
    with pytest.raises(AppError) as exc:
        validate_password_strength(pw)
    assert exc.value.status == 422
    assert exc.value.code == "weak_password"
    assert exc.value.errors and exc.value.errors[0]["field"] == "password"


def test_access_token_roundtrip() -> None:
    uid, oid, sid = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    claims = decode_access_token(create_access_token(uid, oid, sid))
    assert (claims.user_id, claims.org_id, claims.session_id) == (uid, oid, sid)


def test_expired_access_token_reports_token_expired() -> None:
    s = get_settings()
    past = datetime.now(UTC) - timedelta(hours=1)
    token = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "typ": "access",
            "iss": ISSUER,
            "iat": int(past.timestamp()),
            "exp": int((past + timedelta(minutes=1)).timestamp()),
        },
        s.secret_key.get_secret_value(),
        algorithm=JWT_ALG,
    )
    with pytest.raises(AppError) as exc:
        decode_access_token(token)
    assert exc.value.status == 401 and exc.value.code == "token_expired"


def test_token_signed_with_other_key_rejected() -> None:
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "typ": "access", "iss": ISSUER, "exp": 9_999_999_999},
        "another-secret-key-0123456789abcdef",
        algorithm=JWT_ALG,
    )
    with pytest.raises(AppError) as exc:
        decode_access_token(token)
    assert exc.value.code == "unauthorized"


def test_wrong_token_type_rejected() -> None:
    s = get_settings()
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "typ": "refresh", "iss": ISSUER, "exp": 9_999_999_999},
        s.secret_key.get_secret_value(),
        algorithm=JWT_ALG,
    )
    with pytest.raises(AppError):
        decode_access_token(token)


def test_refresh_token_format() -> None:
    sid = uuid.uuid4()
    assert parse_refresh_token(new_refresh_token(sid)) == sid
    for bad in ("garbage", f"{sid}.short", "not-a-uuid.abcdefghijklmnopqrstuvwxyz"):
        with pytest.raises(AppError):
            parse_refresh_token(bad)


def test_token_hash_is_keyed_and_stable() -> None:
    assert hash_token("abc") == hash_token("abc")
    assert hash_token("abc") != hash_token("abd")
    assert len(hash_token("abc")) == 64
    assert tokens_equal("x", "x") and not tokens_equal("x", "y")


def test_portal_token_derivation() -> None:
    sid = uuid.uuid4()
    a = derive_portal_token(sid, "nonce-1")
    assert a == derive_portal_token(sid, "nonce-1")
    assert a != derive_portal_token(sid, "nonce-2")
    assert a != derive_portal_token(uuid.uuid4(), "nonce-1")
    assert len(a) >= 43  # 32 bytes, url-safe


def test_role_permissions_match_contract() -> None:
    assert set(ROLES) == {"owner", "compliance_manager", "sourcing", "reviewer", "supplier", "auditor"}
    assert set(permissions_for("owner")) == set(ALL_PERMISSIONS)
    assert len(ALL_PERMISSIONS) == 16
    assert "org:admin" not in permissions_for("auditor")
    assert "audit:read" in permissions_for("auditor")
    assert not any(
        p.endswith((":write", ":submit", ":approve", ":review")) for p in permissions_for("auditor")
    )
    assert role_has("reviewer", "plots:review") and not role_has("sourcing", "plots:review")
    assert "dashboard:read" not in permissions_for("supplier")
    assert permissions_for(None) == []
    assert role_label("compliance_manager") == "Compliance manager"
