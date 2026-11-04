"""Shipment traceability checks: mass balance, verdicts, reviews and mixing of verified / unverified product.

A shipment can only be placed on the EU market (and get a due diligence statement) when every kilogram is
traced to assessed, deforestation-free plots and the volumes are plausible for the plots' size. Regulation
(EU) 2023/1115 does not allow mass-balance mixing with product of unknown or non-compliant origin.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.rules.risk import risk_tier

RULES_VERSION = "eudr-traceability-2026.1"

# Plausible maximum yield per hectare and harvest year (kg). Roughly the upper end of national yields in
# FAOSTAT (2019-2023) for the main producing countries, with headroom so that only implausible claims fail.
MAX_YIELD_KG_PER_HA: dict[str, float] = {
    "cocoa": 1_500.0,  # dry beans
    "coffee": 3_000.0,  # green coffee
    "soy": 4_500.0,  # beans
    "oil_palm": 30_000.0,  # fresh fruit bunches
    "rubber": 2_500.0,  # dry rubber
    "cattle": 600.0,  # live-weight gain on pasture
    "wood": 15_000.0,  # roundwood
}
COMMODITY_LABELS = {
    "cocoa": "cocoa",
    "coffee": "coffee",
    "soy": "soy",
    "oil_palm": "oil palm",
    "rubber": "rubber",
    "cattle": "cattle",
    "wood": "wood",
}
QTY_TOLERANCE_SHARE = 0.005
NEAR_CAPACITY = 0.9

CheckStatus = Literal["pass", "warn", "fail"]


@dataclass
class Check:
    code: str
    status: CheckStatus
    label: str
    detail: str

    def as_dict(self) -> dict:
        return {"code": self.code, "status": self.status, "label": self.label, "detail": self.detail}


@dataclass
class AllocationIn:
    plot_id: str
    reference: str
    commodity: str
    area_ha: float
    verdict: str  # compliant | needs_review | non_compliant | pending
    quantity_kg: float
    other_allocated_kg_same_year: float
    country: str
    geometry_valid: bool = True
    reviewed: bool = False  # a reviewer confirmed the latest assessment


@dataclass
class ShipmentEvaluation:
    status: Literal["blocked", "ready"]
    checks: list[Check] = field(default_factory=list)
    mass_balance: list[dict] = field(default_factory=list)
    mixing: dict = field(default_factory=dict)

    @property
    def issues(self) -> int:
        return sum(1 for c in self.checks if c.status == "fail")

    def as_dict(self) -> dict:
        return {
            "status": self.status,
            "checks": [c.as_dict() for c in self.checks],
            "massBalance": self.mass_balance,
            "mixing": self.mixing,
        }


def plot_capacity_kg(commodity: str, area_ha: float) -> float:
    """Plausible maximum harvest of one plot in one harvest year (kg)."""
    return round(MAX_YIELD_KG_PER_HA.get(commodity, 0.0) * max(area_ha, 0.0), 1)


def _refs(items: list[AllocationIn], limit: int = 4) -> str:
    refs = [a.reference for a in items]
    more = len(refs) - limit
    return ", ".join(refs[:limit]) + (f" and {more} more" if more > 0 else "")


def _kg(v: float) -> str:
    return f"{v:,.0f} kg"


def check_shipment(
    allocations: list[AllocationIn], shipment_qty_kg: float, harvest_year: int
) -> ShipmentEvaluation:
    checks: list[Check] = []
    allocs = [a for a in allocations if a.quantity_kg > 0]

    # 1. allocations present
    if not allocs:
        checks.append(
            Check(
                "allocations_present",
                "fail",
                "Plots linked to the shipment",
                "No plots of origin are linked yet. Allocate the shipment volume to its plots.",
            )
        )
    else:
        n_sup = len({a.plot_id for a in allocs})
        checks.append(
            Check(
                "allocations_present",
                "pass",
                "Plots linked to the shipment",
                f"{n_sup} plot{'s' if n_sup != 1 else ''} of origin linked.",
            )
        )

    # 2. quantities match
    total = sum(a.quantity_kg for a in allocs)
    gap = total - shipment_qty_kg
    if shipment_qty_kg <= 0:
        checks.append(
            Check(
                "quantities_match",
                "fail",
                "Allocated volume matches the shipment",
                "The shipment has no quantity.",
            )
        )
    elif abs(gap) <= max(shipment_qty_kg * QTY_TOLERANCE_SHARE, 1.0):
        checks.append(
            Check(
                "quantities_match",
                "pass",
                "Allocated volume matches the shipment",
                f"{_kg(total)} allocated for {_kg(shipment_qty_kg)} shipped.",
            )
        )
    elif gap < 0:
        checks.append(
            Check(
                "quantities_match",
                "fail",
                "Allocated volume matches the shipment",
                f"{_kg(-gap)} of the {_kg(shipment_qty_kg)} shipment is not traced to any plot.",
            )
        )
    else:
        checks.append(
            Check(
                "quantities_match",
                "fail",
                "Allocated volume matches the shipment",
                f"Plots are allocated {_kg(gap)} more than the shipment contains.",
            )
        )

    # 3. mass balance per plot (this shipment + other shipments from the same harvest year)
    rows: list[dict] = []
    over: list[AllocationIn] = []
    near: list[AllocationIn] = []
    for a in allocs:
        cap = plot_capacity_kg(a.commodity, a.area_ha)
        claimed = a.quantity_kg + max(a.other_allocated_kg_same_year, 0.0)
        util = claimed / cap * 100 if cap > 0 else float("inf")
        ok = claimed <= cap
        rows.append(
            {
                "plotId": a.plot_id,
                "reference": a.reference,
                "allocatedKg": round(claimed, 1),
                "capacityKg": cap,
                "utilisationPct": round(util, 1) if util != float("inf") else None,
                "ok": ok,
            }
        )
        if not ok:
            over.append(a)
        elif util >= NEAR_CAPACITY * 100:
            near.append(a)
    if over:
        worst = max(rows, key=lambda r: r["utilisationPct"] or 1e9)
        checks.append(
            Check(
                "mass_balance",
                "fail",
                "Volumes are plausible for the plots' size",
                f"{_refs(over)}: more {COMMODITY_LABELS.get(over[0].commodity, over[0].commodity)} is "
                f"claimed for {harvest_year} than the plot can produce (up to "
                f"{worst['utilisationPct'] or '∞'}% of a plausible harvest).",
            )
        )
    elif near:
        checks.append(
            Check(
                "mass_balance",
                "warn",
                "Volumes are plausible for the plots' size",
                f"{_refs(near)} {'is' if len(near) == 1 else 'are'} close to a plausible full "
                f"harvest for {harvest_year}.",
            )
        )
    elif allocs:
        checks.append(
            Check(
                "mass_balance",
                "pass",
                "Volumes are plausible for the plots' size",
                f"All plots stay within a plausible {harvest_year} harvest.",
            )
        )
    else:
        checks.append(
            Check(
                "mass_balance",
                "fail",
                "Volumes are plausible for the plots' size",
                "No plots to compare the volume with.",
            )
        )

    # 4. every plot assessed
    pending = [a for a in allocs if a.verdict == "pending"]
    checks.append(
        Check(
            "plots_assessed",
            "fail",
            "All plots assessed",
            f"{_refs(pending)} {'has' if len(pending) == 1 else 'have'} not been assessed yet.",
        )
        if pending
        else Check(
            "plots_assessed",
            "pass" if allocs else "fail",
            "All plots assessed",
            "Every linked plot has a deforestation assessment." if allocs else "No plots linked.",
        )
    )

    # 5. no non-compliant plots
    bad = [a for a in allocs if a.verdict == "non_compliant"]
    checks.append(
        Check(
            "no_non_compliant",
            "fail",
            "No plots with deforestation after 2020",
            f"{_refs(bad)} {'shows' if len(bad) == 1 else 'show'} forest cleared after 31 December 2020. "
            "Remove this volume from the shipment.",
        )
        if bad
        else Check(
            "no_non_compliant",
            "pass",
            "No plots with deforestation after 2020",
            "None of the linked plots shows forest cleared after the cut-off date.",
        )
    )

    # 6. reviews complete
    review = [a for a in allocs if a.verdict == "needs_review"]
    checks.append(
        Check(
            "reviews_complete",
            "fail",
            "Reviews complete",
            f"{_refs(review)} {'is' if len(review) == 1 else 'are'} waiting for a reviewer's decision.",
        )
        if review
        else Check("reviews_complete", "pass", "Reviews complete", "No plot is waiting for a reviewer.")
    )

    # 7. mixing of verified and unverified product
    verified = sum(a.quantity_kg for a in allocs if a.verdict == "compliant")
    unverified = total - verified
    mixed = verified > 0 and unverified > 0
    mixing = {"mixed": mixed, "verifiedKg": round(verified, 1), "unverifiedKg": round(unverified, 1)}
    if mixed:
        checks.append(
            Check(
                "mixing",
                "fail",
                "No mixing with unverified product",
                f"{_kg(unverified)} from plots that are not cleared is mixed with {_kg(verified)} of "
                "verified product. EUDR does not allow mixing; split or hold the shipment.",
            )
        )
    elif unverified > 0:
        checks.append(
            Check(
                "mixing",
                "fail",
                "No mixing with unverified product",
                "None of the shipment volume comes from cleared plots yet.",
            )
        )
    else:
        checks.append(
            Check(
                "mixing",
                "pass",
                "No mixing with unverified product",
                "All volume comes from plots cleared as deforestation-free."
                if allocs
                else "No volume allocated.",
            )
        )

    # 8. geometry valid
    invalid = [a for a in allocs if not a.geometry_valid]
    checks.append(
        Check(
            "geometry_valid",
            "fail",
            "Plot locations meet EUDR rules",
            f"{_refs(invalid)} {'has' if len(invalid) == 1 else 'have'} a location that does not meet EUDR "
            "geolocation rules.",
        )
        if invalid
        else Check(
            "geometry_valid", "pass", "Plot locations meet EUDR rules", "All plot locations are valid."
        )
    )

    # 9. high-risk origins need a reviewer's confirmation (enhanced scrutiny)
    high = [a for a in allocs if risk_tier(a.country) == "high"]
    unreviewed = [a for a in high if not a.reviewed]
    if unreviewed:
        checks.append(
            Check(
                "high_risk_review",
                "fail",
                "High-risk origins reviewed",
                f"{_refs(unreviewed)} {'is' if len(unreviewed) == 1 else 'are'} in a high-risk country "
                "and need a reviewer's confirmation.",
            )
        )
    elif high:
        checks.append(
            Check(
                "high_risk_review",
                "pass",
                "High-risk origins reviewed",
                "Plots in high-risk countries have been reviewed.",
            )
        )
    elif allocs and all(risk_tier(a.country) == "low" for a in allocs):
        checks.append(
            Check(
                "high_risk_review",
                "pass",
                "High-risk origins reviewed",
                "All origins are low-risk countries; simplified due diligence may apply.",
            )
        )
    else:
        checks.append(
            Check(
                "high_risk_review",
                "pass",
                "High-risk origins reviewed",
                "No origin is in a high-risk country.",
            )
        )

    status: Literal["blocked", "ready"] = "blocked" if any(c.status == "fail" for c in checks) else "ready"
    return ShipmentEvaluation(status=status, checks=checks, mass_balance=rows, mixing=mixing)
