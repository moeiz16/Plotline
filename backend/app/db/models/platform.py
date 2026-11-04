"""Platform tables: organisations, users, memberships, invitations, sessions, audit log, notifications."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import (
    Base,
    JSONType,
    OrgScopedMixin,
    ShortStr,
    TimestampMixin,
    UTCDateTime,
    UUIDPkMixin,
    UUIDType,
    utcnow,
)


class Organization(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(ShortStr)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    eori: Mapped[str | None] = mapped_column(String(32), nullable=True)
    address: Mapped[str | None] = mapped_column(String(400), nullable=True)
    country: Mapped[str | None] = mapped_column(String(2), nullable=True)
    operator_size: Mapped[str] = mapped_column(String(10), default="large")
    settings: Mapped[dict] = mapped_column(JSONType, default=dict)


class User(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True)
    full_name: Mapped[str] = mapped_column(ShortStr)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    avatar_color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    preferences: Mapped[dict] = mapped_column(JSONType, default=dict)


class Membership(UUIDPkMixin, OrgScopedMixin, TimestampMixin, Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("org_id", "user_id", name="uq_memberships_org_user"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(32))
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active | removed


class Invitation(UUIDPkMixin, OrgScopedMixin, TimestampMixin, Base):
    __tablename__ = "invitations"

    email: Mapped[str] = mapped_column(String(320))
    role: Mapped[str] = mapped_column(String(32))
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime())
    accepted_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)


class UserSession(UUIDPkMixin, TimestampMixin, Base):
    """Refresh-token session (rotation with reuse detection)."""

    __tablename__ = "sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    refresh_token_hash: Mapped[str] = mapped_column(String(64))
    active_org_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(400), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime())
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    revoked_reason: Mapped[str | None] = mapped_column(String(40), nullable=True)
    rotation_count: Mapped[int] = mapped_column(Integer, default=0)
    last_used_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)


class AuditLog(Base):
    """Append-only, per-org SHA-256 hash chain (see services/audit.py)."""

    __tablename__ = "audit_log"
    __table_args__ = (Index("ix_audit_log_org_id_id", "org_id", "id"),)

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    org_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)
    actor_type: Mapped[str] = mapped_column(String(16), default="user")  # user | system | supplier
    action: Mapped[str] = mapped_column(String(64), index=True)
    resource_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(400), nullable=True)
    meta: Mapped[dict] = mapped_column("metadata", JSONType, default=dict)
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class Notification(UUIDPkMixin, OrgScopedMixin, Base):
    __tablename__ = "notifications"

    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, index=True)
    type: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(ShortStr)
    body: Mapped[str] = mapped_column(Text, default="")
    link: Mapped[str | None] = mapped_column(String(400), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
