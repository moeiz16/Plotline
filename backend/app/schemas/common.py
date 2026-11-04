"""Request-body schemas share camelCase aliases on the wire (`fullName` → `full_name`)."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from pydantic.alias_generators import to_camel

Role = Literal["owner", "compliance_manager", "sourcing", "reviewer", "supplier", "auditor"]
Commodity = Literal["cocoa", "coffee", "soy", "oil_palm", "cattle", "rubber", "wood"]
SupplierKind = Literal["cooperative", "exporter", "farm", "trader"]
ReviewDecision = Literal["confirm_compliant", "confirm_non_compliant", "request_information"]
Verdict = Literal["compliant", "needs_review", "non_compliant", "pending"]

CountryCode = Annotated[str, StringConstraints(pattern=r"^[A-Za-z]{2}$", to_upper=True)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Reference = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._\-/ ]+$"),
]
Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
Kg = Annotated[float, Field(gt=0, le=1e9)]


class CamelIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")
