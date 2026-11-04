"""Credential primitives: password hashing, access JWTs, refresh tokens, CSRF, opaque link tokens."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import get_settings
from app.core.errors import AppError, unauthorized

_hasher = PasswordHasher(time_cost=2, memory_cost=19_456, parallelism=1)  # OWASP argon2id minimums
_DUMMY_HASH = _hasher.hash("timing-equaliser-not-a-real-password")
JWT_ALG = "HS256"
ISSUER = "plotline"
_COMMON = {"password1234", "123456789012", "qwertyuiopas", "letmein12345", "plotline1234", "passwordpassword"}


# ── Passwords ────────────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    """Always runs one argon2 verification, even for unknown users (no user-enumeration timing)."""
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def validate_password_strength(password: str) -> None:
    s = get_settings()
    problems = []
    if len(password) < s.password_min_length:
        problems.append(f"Use at least {s.password_min_length} characters.")
    if len(password) > 256:
        problems.append("Use at most 256 characters.")
    if len(set(password)) < 5:
        problems.append("Use a less repetitive password.")
    if password.lower() in _COMMON:
        problems.append("This password is too common.")
    if problems:
        raise AppError(
            422,
            "weak_password",
            "Password does not meet requirements",
            " ".join(problems),
            errors=[{"field": "password", "message": p} for p in problems],
        )


# ── Token hashing (HMAC with the server secret: a database leak reveals no usable tokens) ──
def hash_token(token: str) -> str:
    key = get_settings().secret_key.get_secret_value().encode()
    return hmac.new(key, token.encode(), hashlib.sha256).hexdigest()


def tokens_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def new_link_token() -> str:
    """Opaque URL token for invitations: 32 random bytes."""
    return secrets.token_urlsafe(32)


def derive_portal_token(supplier_id: uuid.UUID, nonce: str) -> str:
    """Supplier portal token: HMAC(secret, supplier id + random 32-byte nonce).

    Only the token's hash is used for lookups. Deriving it from a stored random nonce lets managers re-display
    the current link (e.g. in a campaign) while a database leak alone still yields no usable link.
    """
    key = get_settings().secret_key.get_secret_value().encode()
    digest = hmac.new(key, f"portal:{supplier_id}:{nonce}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


# ── Access tokens ────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class AccessClaims:
    user_id: uuid.UUID
    org_id: uuid.UUID | None
    session_id: uuid.UUID | None
    jti: str


def create_access_token(user_id: uuid.UUID, org_id: uuid.UUID | None, session_id: uuid.UUID | None) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "org": str(org_id) if org_id else None,
        "sid": str(session_id) if session_id else None,
        "typ": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=s.access_token_ttl_minutes)).timestamp()),
        "jti": secrets.token_hex(8),
        "iss": ISSUER,
    }
    return jwt.encode(payload, s.secret_key.get_secret_value(), algorithm=JWT_ALG)


def decode_access_token(token: str) -> AccessClaims:
    try:
        data = jwt.decode(
            token,
            get_settings().secret_key.get_secret_value(),
            algorithms=[JWT_ALG],
            issuer=ISSUER,
            options={"require": ["exp", "sub", "typ"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise unauthorized("Your session has expired.", code="token_expired") from exc
    except jwt.PyJWTError as exc:
        raise unauthorized("Please sign in again.", code="unauthorized") from exc
    if data.get("typ") != "access":
        raise unauthorized("Please sign in again.", code="unauthorized")
    try:
        return AccessClaims(
            user_id=uuid.UUID(data["sub"]),
            org_id=uuid.UUID(data["org"]) if data.get("org") else None,
            session_id=uuid.UUID(data["sid"]) if data.get("sid") else None,
            jti=data.get("jti", ""),
        )
    except (ValueError, TypeError) as exc:
        raise unauthorized("Please sign in again.", code="unauthorized") from exc


# ── Refresh tokens (format: "<session_id>.<secret>") ─────────────────────────
def new_refresh_token(session_id: uuid.UUID) -> str:
    return f"{session_id}.{secrets.token_urlsafe(32)}"


def parse_refresh_token(token: str) -> uuid.UUID:
    try:
        sid, secret = token.split(".", 1)
        if len(secret) < 20:
            raise ValueError
        return uuid.UUID(sid)
    except ValueError as exc:
        raise unauthorized("Please sign in again.", code="unauthorized") from exc


# ── CSRF (double submit) ─────────────────────────────────────────────────────
def new_csrf_token() -> str:
    return secrets.token_urlsafe(24)
