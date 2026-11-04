"""Role → permission map (RBAC). Single source of truth for the API and the web app (`/auth/me`)."""

from __future__ import annotations

ROLES: tuple[str, ...] = ("owner", "compliance_manager", "sourcing", "reviewer", "supplier", "auditor")
ROLE_LABELS = {
    "owner": "Owner",
    "compliance_manager": "Compliance manager",
    "sourcing": "Sourcing",
    "reviewer": "Reviewer",
    "supplier": "Supplier",
    "auditor": "Auditor",
}

_ALL = set(ROLES)
_STAFF = _ALL - {"supplier"}
_MANAGERS = {"owner", "compliance_manager"}

PERMISSIONS: dict[str, set[str]] = {
    "dashboard:read": _STAFF,
    "suppliers:read": _ALL,  # suppliers only ever see their own record
    "suppliers:write": _MANAGERS | {"sourcing"},
    "plots:read": _ALL,  # suppliers only ever see their own plots
    "plots:write": _MANAGERS | {"sourcing", "supplier"},
    "plots:review": _MANAGERS | {"reviewer"},
    "shipments:read": _STAFF,
    "shipments:write": _MANAGERS | {"sourcing"},
    "dds:read": _STAFF,
    "dds:write": _MANAGERS,
    "dds:submit": _MANAGERS,
    "campaigns:read": _STAFF,
    "campaigns:write": _MANAGERS | {"sourcing"},
    "campaigns:approve": _MANAGERS | {"reviewer"},
    "audit:read": _MANAGERS | {"auditor"},
    "org:admin": _MANAGERS,
}

ALL_PERMISSIONS: tuple[str, ...] = tuple(PERMISSIONS)


def permissions_for(role: str | None) -> list[str]:
    if not role:
        return []
    return [p for p, roles in PERMISSIONS.items() if role in roles]


def role_has(role: str | None, perm: str) -> bool:
    return bool(role) and role in PERMISSIONS.get(perm, set())


def role_label(role: str | None) -> str:
    return ROLE_LABELS.get(role or "", (role or "").replace("_", " ").capitalize())
