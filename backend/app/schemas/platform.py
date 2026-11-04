"""Request bodies for auth, organisation, members and invitations."""

from __future__ import annotations

import uuid
from typing import Annotated, Literal

from pydantic import EmailStr, Field, StringConstraints

from app.schemas.common import CamelIn, CountryCode, Name, Role

Password = Annotated[str, StringConstraints(min_length=1, max_length=256)]


class SignupIn(CamelIn):
    email: EmailStr
    password: Password
    full_name: Name
    org_name: Name | None = None


class LoginIn(CamelIn):
    email: EmailStr
    password: Password


class SwitchOrgIn(CamelIn):
    org_id: uuid.UUID


class OrgSettingsIn(CamelIn):
    retention_years: Annotated[int, Field(ge=5, le=30)] | None = None
    review_all_high_risk: bool | None = None
    auto_assess: bool | None = None


class OrgPatchIn(CamelIn):
    name: Name | None = None
    eori: (
        Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Z]{2}[A-Z0-9]{1,15}$")] | None
    ) = None
    address: Annotated[str, StringConstraints(strip_whitespace=True, max_length=400)] | None = None
    country: CountryCode | None = None
    operator_size: Literal["large", "sme"] | None = None
    settings: OrgSettingsIn | None = None


class MemberPatchIn(CamelIn):
    role: Role


class InvitationIn(CamelIn):
    email: EmailStr
    role: Role
    supplier_id: uuid.UUID | None = None


class AcceptInvitationIn(CamelIn):
    full_name: Name | None = None
    password: Password | None = None
