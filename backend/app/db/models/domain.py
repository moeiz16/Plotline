"""EUDR domain tables: suppliers, plots, assessments, products, shipments, statements, campaigns.

Plots, assessments, shipments, statements and audit rows are never hard-deleted (EUDR Art. 12 retention).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
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


class Supplier(UUIDPkMixin, OrgScopedMixin, TimestampMixin, Base):
    __tablename__ = "suppliers"

    name: Mapped[str] = mapped_column(ShortStr)
    country: Mapped[str] = mapped_column(String(2))
    kind: Mapped[str] = mapped_column(String(16), default="cooperative")
    commodities: Mapped[list] = mapped_column(JSONType, default=list)
    contact_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="invited")  # invited | active
    portal_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    portal_nonce: Mapped[str | None] = mapped_column(String(64), nullable=True)
    portal_expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    last_submission_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    external_key: Mapped[str | None] = mapped_column(String(64), nullable=True)  # seed key, e.g. "coop-nawa"


class Plot(UUIDPkMixin, OrgScopedMixin, TimestampMixin, Base):
    __tablename__ = "plots"
    __table_args__ = (
        UniqueConstraint("org_id", "reference", name="uq_plots_org_reference"),
        Index("ix_plots_org_h3_parent", "org_id", "h3_parent"),
    )

    supplier_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("suppliers.id"), index=True)
    reference: Mapped[str] = mapped_column(String(64))
    commodity: Mapped[str] = mapped_column(String(16))
    country: Mapped[str] = mapped_column(String(2))
    kind: Mapped[str] = mapped_column(String(10))  # point | polygon
    geometry: Mapped[dict] = mapped_column(JSONType)
    area_ha: Mapped[float] = mapped_column(Float)
    declared_area_ha: Mapped[float | None] = mapped_column(Float, nullable=True)
    centroid_lon: Mapped[float] = mapped_column(Float)
    centroid_lat: Mapped[float] = mapped_column(Float)
    h3_cell: Mapped[str | None] = mapped_column(String(20), nullable=True)
    h3_parent: Mapped[str | None] = mapped_column(String(20), nullable=True)
    producer_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    validation: Mapped[dict] = mapped_column(JSONType, default=dict)
    latest_assessment_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)
    # Denormalised from the latest assessment (+ review) for fast lists, maps and dashboards.
    verdict: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    headline: Mapped[str | None] = mapped_column(String(300), nullable=True)
    change_level: Mapped[str | None] = mapped_column(String(10), nullable=True)
    review_required: Mapped[bool] = mapped_column(Boolean, default=False)
    assessed_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    embedding: Mapped[list | None] = mapped_column(JSONType, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active | archived
    created_via: Mapped[str] = mapped_column(String(16), default="app")  # app | portal | import | seed
    archived_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)


class Assessment(UUIDPkMixin, OrgScopedMixin, Base):
    """Append-only. Only `review` is ever written after insert."""

    __tablename__ = "assessments"

    plot_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("plots.id"), index=True)
    verdict: Mapped[str] = mapped_column(String(16))
    headline: Mapped[str] = mapped_column(String(300))
    reasons: Mapped[list] = mapped_column(JSONType, default=list)
    metrics: Mapped[dict] = mapped_column(JSONType, default=dict)
    review_required: Mapped[bool] = mapped_column(Boolean, default=False)
    review: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    datasets: Mapped[dict] = mapped_column(JSONType, default=dict)
    inputs_hash: Mapped[str] = mapped_column(String(64))
    result_hash: Mapped[str] = mapped_column(String(64))
    source: Mapped[str] = mapped_column(String(10), default="bundled")
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class Product(UUIDPkMixin, OrgScopedMixin, TimestampMixin, Base):
    __tablename__ = "products"

    name: Mapped[str] = mapped_column(ShortStr)
    commodity: Mapped[str] = mapped_column(String(16))
    hs_code: Mapped[str] = mapped_column(String(16))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class Shipment(UUIDPkMixin, OrgScopedMixin, TimestampMixin, Base):
    __tablename__ = "shipments"
    __table_args__ = (UniqueConstraint("org_id", "reference", name="uq_shipments_org_reference"),)

    reference: Mapped[str] = mapped_column(String(64))
    product_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("products.id"))
    quantity_kg: Mapped[float] = mapped_column(Float)
    harvest_year: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="draft")
    checks: Mapped[dict] = mapped_column(JSONType, default=dict)  # last evaluation


class ShipmentAllocation(UUIDPkMixin, OrgScopedMixin, Base):
    __tablename__ = "shipment_allocations"

    shipment_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("shipments.id", ondelete="CASCADE"), index=True
    )
    plot_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("plots.id"), index=True)
    quantity_kg: Mapped[float] = mapped_column(Float)


class Dds(UUIDPkMixin, OrgScopedMixin, TimestampMixin, Base):
    __tablename__ = "dds"

    shipment_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("shipments.id"), index=True)
    internal_ref: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="draft")
    payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    summary: Mapped[str] = mapped_column(Text, default="")
    reference_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    verification_number: Mapped[str | None] = mapped_column(String(16), nullable=True)
    payload_hash: Mapped[str] = mapped_column(String(64))
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)


class DdsSubmission(UUIDPkMixin, OrgScopedMixin, Base):
    """Append-only submission log."""

    __tablename__ = "dds_submissions"

    dds_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("dds.id"), index=True)
    at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    status: Mapped[str] = mapped_column(String(16))
    message: Mapped[str] = mapped_column(String(400))
    reference_number: Mapped[str | None] = mapped_column(String(32), nullable=True)


class Campaign(UUIDPkMixin, OrgScopedMixin, TimestampMixin, Base):
    __tablename__ = "campaigns"

    name: Mapped[str] = mapped_column(ShortStr)
    commodity: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="running")
    due_date: Mapped[date] = mapped_column(Date)
    reminder_every_days: Mapped[int] = mapped_column(Integer, default=7)
    workflow_id: Mapped[str] = mapped_column(String(80))
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)


class CampaignMember(UUIDPkMixin, OrgScopedMixin, Base):
    __tablename__ = "campaign_members"
    __table_args__ = (
        UniqueConstraint("campaign_id", "supplier_id", name="uq_campaign_members_campaign_supplier"),
    )

    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("campaigns.id", ondelete="CASCADE"), index=True
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("suppliers.id"), index=True)
    stage: Mapped[str] = mapped_column(String(24), default="requested")
    reminders_sent: Mapped[int] = mapped_column(Integer, default=0)
    submitted_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_event_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)


class CampaignEvent(UUIDPkMixin, OrgScopedMixin, Base):
    """Campaign timeline (written by workflow activities and API actions)."""

    __tablename__ = "campaign_events"

    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("campaigns.id", ondelete="CASCADE"), index=True
    )
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)
    at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    kind: Mapped[str] = mapped_column(String(32))
    message: Mapped[str] = mapped_column(String(400))
