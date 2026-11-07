"""Request bodies for suppliers, plots, products, shipments, statements, campaigns and the supplier portal."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated, Any

from pydantic import EmailStr, Field, StringConstraints, field_validator

from app.schemas.common import (
    CamelIn,
    Commodity,
    CountryCode,
    Kg,
    Name,
    Note,
    Reference,
    ReviewDecision,
    SupplierKind,
)

Area = Annotated[float, Field(gt=0, le=100_000)]
HsCode = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[0-9 ]{4,12}$")]


def _check_geometry(value: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(value, dict) or "type" not in value:
        raise ValueError("Provide a GeoJSON geometry with a type and coordinates.")
    if value.get("type") == "Feature":
        value = value.get("geometry") or {}
    if value.get("type") not in ("Point", "Polygon", "MultiPolygon"):
        raise ValueError("Use a Point, Polygon or MultiPolygon geometry.")
    if "coordinates" not in value:
        raise ValueError("The geometry has no coordinates.")
    return value


class SupplierIn(CamelIn):
    name: Name
    country: CountryCode
    commodities: Annotated[list[Commodity], Field(min_length=1, max_length=7)]
    kind: SupplierKind = "cooperative"
    contact_email: EmailStr | None = None


class SupplierPatchIn(CamelIn):
    name: Name | None = None
    country: CountryCode | None = None
    commodities: Annotated[list[Commodity], Field(min_length=1, max_length=7)] | None = None
    kind: SupplierKind | None = None
    contact_email: EmailStr | None = None


class PlotValidateIn(CamelIn):
    geometry: dict[str, Any]
    country: CountryCode
    declared_area_ha: Area | None = None

    _geom = field_validator("geometry")(_check_geometry)


class PlotIn(CamelIn):
    supplier_id: uuid.UUID
    reference: Reference
    commodity: Commodity
    country: CountryCode
    geometry: dict[str, Any]
    declared_area_ha: Area | None = None
    producer_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None

    _geom = field_validator("geometry")(_check_geometry)


class PlotPatchIn(CamelIn):
    reference: Reference | None = None
    commodity: Commodity | None = None
    declared_area_ha: Area | None = None


class ReviewIn(CamelIn):
    decision: ReviewDecision
    note: Note = ""


class ProductIn(CamelIn):
    name: Name
    commodity: Commodity
    hs_code: HsCode
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None


class AllocationIn(CamelIn):
    plot_id: uuid.UUID
    quantity_kg: Kg


class ShipmentIn(CamelIn):
    reference: Reference
    product_id: uuid.UUID
    quantity_kg: Kg
    harvest_year: Annotated[int, Field(ge=2020, le=2100)]
    allocations: Annotated[list[AllocationIn], Field(max_length=500)] = []


class ShipmentPatchIn(CamelIn):
    quantity_kg: Kg | None = None
    harvest_year: Annotated[int, Field(ge=2020, le=2100)] | None = None
    allocations: Annotated[list[AllocationIn], Field(max_length=500)] | None = None


class CampaignIn(CamelIn):
    name: Name
    commodity: Commodity
    supplier_ids: Annotated[list[uuid.UUID], Field(min_length=1, max_length=200)]
    due_date: date
    reminder_every_days: Annotated[int, Field(ge=1, le=60)] = 7


class CampaignDecisionIn(CamelIn):
    approve: bool
    note: Note = ""


class PortalPlotIn(CamelIn):
    reference: Reference
    commodity: Commodity
    geometry: dict[str, Any]
    declared_area_ha: Area | None = None

    _geom = field_validator("geometry")(_check_geometry)
