"""Import every model so `Base.metadata` knows all tables (Alembic, schema bootstrap)."""

from app.db.models.domain import (
    Assessment,
    Campaign,
    CampaignEvent,
    CampaignMember,
    Dds,
    DdsSubmission,
    Plot,
    Product,
    Shipment,
    ShipmentAllocation,
    Supplier,
)
from app.db.models.platform import (
    AuditLog,
    Invitation,
    Membership,
    Notification,
    Organization,
    User,
    UserSession,
)

__all__ = [
    "Assessment",
    "AuditLog",
    "Campaign",
    "CampaignEvent",
    "CampaignMember",
    "Dds",
    "DdsSubmission",
    "Invitation",
    "Membership",
    "Notification",
    "Organization",
    "Plot",
    "Product",
    "Shipment",
    "ShipmentAllocation",
    "Supplier",
    "User",
    "UserSession",
]
