"""Products, shipments, plot allocations, readiness checks (mass balance, mixing) and traceability."""

from __future__ import annotations

import uuid
from collections import defaultdict
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import RequestContext
from app.core.errors import conflict, not_found, validation_error
from app.db.base import utcnow
from app.db.models.domain import Assessment, Dds, Plot, Product, Shipment, ShipmentAllocation, Supplier
from app.services import domain
from app.services.audit import audit

TIER_ORDER = {"low": 0, "standard": 1, "high": 2}


def product_out(p: Product) -> dict:
    return {
        "id": str(p.id),
        "name": p.name,
        "commodity": p.commodity,
        "hsCode": p.hs_code,
        "description": p.description,
    }


async def list_products(db: AsyncSession, org_id: uuid.UUID) -> list[dict]:
    rows = (
        await db.execute(select(Product).where(Product.org_id == org_id).order_by(Product.name))
    ).scalars()
    return [product_out(p) for p in rows]


async def create_product(db: AsyncSession, ctx: RequestContext, data: dict) -> Product:
    p = Product(
        org_id=ctx.org_id,
        name=data["name"],
        commodity=data["commodity"],
        hs_code=" ".join(data["hs_code"].split()),
        description=data.get("description"),
    )
    db.add(p)
    await db.flush()
    await audit(
        db,
        ctx,
        action="product.created",
        resource_type="product",
        resource_id=p.id,
        metadata={"name": p.name},
    )
    return p


# ── Evaluation ───────────────────────────────────────────────────────────────
async def _allocation_rows(
    db: AsyncSession, shipment: Shipment
) -> list[tuple[ShipmentAllocation, Plot, str]]:
    rows = await db.execute(
        select(ShipmentAllocation, Plot, Supplier.name)
        .join(Plot, Plot.id == ShipmentAllocation.plot_id)
        .join(Supplier, Supplier.id == Plot.supplier_id)
        .where(ShipmentAllocation.shipment_id == shipment.id)
        .order_by(Plot.reference)
    )
    return [(a, p, n) for a, p, n in rows.all()]


async def _other_allocated(
    db: AsyncSession, shipment: Shipment, plot_ids: list[uuid.UUID]
) -> dict[uuid.UUID, float]:
    if not plot_ids:
        return {}
    rows = await db.execute(
        select(ShipmentAllocation.plot_id, func.sum(ShipmentAllocation.quantity_kg))
        .join(Shipment, Shipment.id == ShipmentAllocation.shipment_id)
        .where(
            ShipmentAllocation.plot_id.in_(plot_ids),
            ShipmentAllocation.shipment_id != shipment.id,
            Shipment.harvest_year == shipment.harvest_year,
            Shipment.org_id == shipment.org_id,
        )
        .group_by(ShipmentAllocation.plot_id)
    )
    return {pid: float(total or 0) for pid, total in rows.all()}


def _check_dict(c: Any) -> dict:
    d = domain.as_dict(c) or {}
    return {
        "code": d.get("code"),
        "status": d.get("status"),
        "label": d.get("label"),
        "detail": d.get("detail", ""),
    }


def _mass_balance_dict(m: Any) -> dict:
    d = domain.as_dict(m) or {}
    out = {}
    for key, camel in (
        ("plot_id", "plotId"),
        ("reference", "reference"),
        ("allocated_kg", "allocatedKg"),
        ("capacity_kg", "capacityKg"),
        ("utilisation_pct", "utilisationPct"),
        ("ok", "ok"),
    ):
        out[camel] = d.get(camel, d.get(key))
    return out


def _mixing_dict(m: Any) -> dict:
    d = domain.as_dict(m) or {}
    return {
        "mixed": bool(d.get("mixed", False)),
        "verifiedKg": d.get("verifiedKg", d.get("verified_kg", 0)),
        "unverifiedKg": d.get("unverifiedKg", d.get("unverified_kg", 0)),
    }


async def evaluate(db: AsyncSession, shipment: Shipment) -> dict:
    """Run the readiness checks and persist status + results (never touches a submitted shipment)."""
    rows = await _allocation_rows(db, shipment)
    others = await _other_allocated(db, shipment, [p.id for _a, p, _n in rows])
    latest_ids = [p.latest_assessment_id for _a, p, _n in rows if p.latest_assessment_id]
    reviewed = set()
    if latest_ids:
        reviewed = {
            pid
            for pid, review in (
                await db.execute(
                    select(Assessment.plot_id, Assessment.review).where(Assessment.id.in_(latest_ids))
                )
            ).all()
            if review
        }
    allocations = [
        domain.make_allocation(
            plot_id=str(p.id),
            reference=p.reference,
            commodity=p.commodity,
            area_ha=float(p.area_ha),
            verdict=p.verdict or "pending",
            quantity_kg=float(a.quantity_kg),
            other_allocated_kg_same_year=others.get(p.id, 0.0),
            country=p.country,
            review_required=bool(p.review_required),
            reviewed=p.id in reviewed,
            geometry_valid=bool((p.validation or {}).get("valid", True)),
            risk_tier=domain.risk_tier(p.country),
            status=p.status,
        )
        for a, p, _n in rows
    ]
    ev = domain.check_shipment(allocations, float(shipment.quantity_kg), int(shipment.harvest_year))
    result = {
        "checks": [_check_dict(c) for c in getattr(ev, "checks", [])],
        "massBalance": [_mass_balance_dict(m) for m in getattr(ev, "mass_balance", [])],
        "mixing": _mixing_dict(getattr(ev, "mixing", {})),
        "evaluatedAt": utcnow().isoformat(),
    }
    if shipment.status != "submitted":
        shipment.status = "draft" if not rows else getattr(ev, "status", "blocked")
        shipment.checks = result
    return result


# ── Serialisers ──────────────────────────────────────────────────────────────
async def _latest_dds(db: AsyncSession, shipment_ids: list[uuid.UUID]) -> dict[uuid.UUID, Dds]:
    if not shipment_ids:
        return {}
    rows = (
        await db.execute(select(Dds).where(Dds.shipment_id.in_(shipment_ids)).order_by(Dds.created_at))
    ).scalars()
    return {d.shipment_id: d for d in rows}


def _issues(checks: dict) -> int:
    return sum(1 for c in (checks or {}).get("checks", []) if c.get("status") in ("fail", "warn"))


def _highest_tier(countries: set[str]) -> str:
    tiers = [domain.risk_tier(c) for c in countries] or ["low"]
    return max(tiers, key=lambda t: TIER_ORDER.get(t, 1))


async def list_shipments(db: AsyncSession, org_id: uuid.UUID, status: str | None = None) -> list[dict]:
    stmt = (
        select(Shipment, Product)
        .join(Product, Product.id == Shipment.product_id)
        .where(Shipment.org_id == org_id)
        .order_by(Shipment.updated_at.desc())
    )
    if status:
        stmt = stmt.where(Shipment.status == status)
    rows = (await db.execute(stmt)).all()
    ids = [s.id for s, _p in rows]
    alloc_rows = (
        (
            await db.execute(
                select(ShipmentAllocation.shipment_id, Plot.id, Plot.supplier_id, Plot.country)
                .join(Plot, Plot.id == ShipmentAllocation.plot_id)
                .where(ShipmentAllocation.shipment_id.in_(ids))
            )
        ).all()
        if ids
        else []
    )
    agg: dict[uuid.UUID, dict[str, set]] = defaultdict(
        lambda: {"plots": set(), "suppliers": set(), "countries": set()}
    )
    for sid, pid, sup, country in alloc_rows:
        agg[sid]["plots"].add(pid)
        agg[sid]["suppliers"].add(sup)
        agg[sid]["countries"].add(country)
    dds = await _latest_dds(db, ids)
    return [list_item(s, p, agg[s.id], dds.get(s.id)) for s, p in rows]


def list_item(s: Shipment, product: Product, agg: dict[str, set], dds: Dds | None) -> dict:
    return {
        "id": str(s.id),
        "reference": s.reference,
        "productName": product.name,
        "commodity": product.commodity,
        "hsCode": product.hs_code,
        "quantityKg": s.quantity_kg,
        "harvestYear": s.harvest_year,
        "status": s.status,
        "suppliers": len(agg["suppliers"]),
        "plots": len(agg["plots"]),
        "issues": _issues(s.checks),
        "riskTier": _highest_tier(agg["countries"]),
        "ddsId": str(dds.id) if dds else None,
        "ddsStatus": dds.status if dds else None,
        "updatedAt": s.updated_at.isoformat() if s.updated_at else None,
    }


async def get_shipment(
    db: AsyncSession, org_id: uuid.UUID, shipment_id: uuid.UUID
) -> tuple[Shipment, Product]:
    row = (
        await db.execute(
            select(Shipment, Product)
            .join(Product, Product.id == Shipment.product_id)
            .where(Shipment.id == shipment_id, Shipment.org_id == org_id)
        )
    ).first()
    if not row:
        raise not_found("Shipment")
    return row[0], row[1]


async def shipment_detail(
    db: AsyncSession, s: Shipment, product: Product, *, reevaluate: bool = True
) -> dict:
    if reevaluate and s.status != "submitted":
        await evaluate(db, s)
    rows = await _allocation_rows(db, s)
    agg: dict[str, set] = {
        "plots": {p.id for _a, p, _n in rows},
        "suppliers": {p.supplier_id for _a, p, _n in rows},
        "countries": {p.country for _a, p, _n in rows},
    }
    dds = (await _latest_dds(db, [s.id])).get(s.id)
    checks = s.checks or {}
    return {
        **list_item(s, product, agg, dds),
        "allocations": [
            {
                "plotId": str(p.id),
                "reference": p.reference,
                "supplierName": name,
                "country": p.country,
                "verdict": p.verdict or "pending",
                "quantityKg": a.quantity_kg,
                "areaHa": round(p.area_ha, 2),
            }
            for a, p, name in rows
        ],
        "checks": checks.get("checks", []),
        "massBalance": checks.get("massBalance", []),
        "mixing": checks.get("mixing", {"mixed": False, "verifiedKg": 0, "unverifiedKg": 0}),
        "countries": [
            {"code": c, "name": domain.country_name(c), "riskTier": domain.risk_tier(c)}
            for c in sorted(agg["countries"])
        ],
    }


# ── Writes ───────────────────────────────────────────────────────────────────
async def _validate_allocations(
    db: AsyncSession, org_id: uuid.UUID, product: Product, allocations: list[dict]
) -> list[tuple[uuid.UUID, float]]:
    seen: dict[uuid.UUID, float] = {}
    for a in allocations:
        seen[a["plot_id"]] = seen.get(a["plot_id"], 0.0) + float(a["quantity_kg"])
    if not seen:
        return []
    plots = {
        p.id: p
        for p in (
            await db.execute(select(Plot).where(Plot.org_id == org_id, Plot.id.in_(list(seen))))
        ).scalars()
    }
    errors = []
    for i, pid in enumerate(seen):
        p = plots.get(pid)
        if not p or p.status != "active":
            errors.append({"field": f"allocations.{i}.plotId", "message": "Plot not found."})
        elif p.commodity != product.commodity:
            errors.append(
                {
                    "field": f"allocations.{i}.plotId",
                    "message": f"Plot {p.reference} produces {p.commodity.replace('_', ' ')}, "
                    f"not {product.commodity.replace('_', ' ')}.",
                }
            )
    if errors:
        raise validation_error("Some allocations are not valid.", errors)
    return list(seen.items())


async def create_shipment(db: AsyncSession, ctx: RequestContext, data: dict) -> Shipment:
    product = await db.get(Product, data["product_id"])
    if not product or product.org_id != ctx.org_id:
        raise validation_error(
            "Choose one of your products.", [{"field": "productId", "message": "Product not found."}]
        )
    exists = (
        await db.execute(
            select(Shipment.id).where(Shipment.org_id == ctx.org_id, Shipment.reference == data["reference"])
        )
    ).first()
    if exists:
        raise conflict("reference_taken", f"A shipment with reference {data['reference']} already exists.")
    allocs = await _validate_allocations(db, ctx.org_id, product, [a for a in data.get("allocations") or []])
    s = Shipment(
        org_id=ctx.org_id,
        reference=data["reference"],
        product_id=product.id,
        quantity_kg=data["quantity_kg"],
        harvest_year=data["harvest_year"],
        status="draft",
        checks={},
    )
    db.add(s)
    await db.flush()
    for pid, qty in allocs:
        db.add(ShipmentAllocation(org_id=ctx.org_id, shipment_id=s.id, plot_id=pid, quantity_kg=qty))
    await db.flush()
    await evaluate(db, s)
    await audit(
        db,
        ctx,
        action="shipment.created",
        resource_type="shipment",
        resource_id=s.id,
        metadata={"reference": s.reference, "status": s.status},
    )
    return s


async def update_shipment(
    db: AsyncSession, ctx: RequestContext, s: Shipment, product: Product, data: dict
) -> Shipment:
    if s.status == "submitted":
        raise conflict(
            "dds_already_submitted", "This shipment's statement has been submitted; it can no longer change."
        )
    if data.get("quantity_kg") is not None:
        s.quantity_kg = data["quantity_kg"]
    if data.get("harvest_year") is not None:
        s.harvest_year = data["harvest_year"]
    if data.get("allocations") is not None:
        allocs = await _validate_allocations(db, ctx.org_id, product, data["allocations"])
        for old in (
            await db.execute(select(ShipmentAllocation).where(ShipmentAllocation.shipment_id == s.id))
        ).scalars():
            await db.delete(old)
        await db.flush()
        for pid, qty in allocs:
            db.add(ShipmentAllocation(org_id=ctx.org_id, shipment_id=s.id, plot_id=pid, quantity_kg=qty))
    s.updated_at = utcnow()
    await db.flush()
    # A changed shipment invalidates any draft statement built from it.
    for d in (await db.execute(select(Dds).where(Dds.shipment_id == s.id, Dds.status == "draft"))).scalars():
        d.status = "rejected"
        d.summary = (d.summary or "") + "\n\nWithdrawn: the shipment changed after this draft was prepared."
    await evaluate(db, s)
    await audit(
        db,
        ctx,
        action="shipment.updated",
        resource_type="shipment",
        resource_id=s.id,
        metadata={"reference": s.reference, "fields": sorted(k for k, v in data.items() if v is not None)},
    )
    return s


async def trace(db: AsyncSession, s: Shipment, product: Product) -> dict:
    rows = await _allocation_rows(db, s)
    nodes = [
        {"id": f"product:{product.id}", "type": "product", "label": f"{product.name} (HS {product.hs_code})"},
        {"id": f"shipment:{s.id}", "type": "shipment", "label": s.reference, "verdict": None},
    ]
    edges: list[dict] = [
        {"source": f"product:{product.id}", "target": f"shipment:{s.id}", "quantityKg": s.quantity_kg}
    ]
    per_supplier: dict[uuid.UUID, float] = defaultdict(float)
    supplier_names: dict[uuid.UUID, str] = {}
    supplier_verdicts: dict[uuid.UUID, list[str]] = defaultdict(list)
    for a, p, name in rows:
        per_supplier[p.supplier_id] += a.quantity_kg
        supplier_names[p.supplier_id] = name
        supplier_verdicts[p.supplier_id].append(p.verdict or "pending")
        nodes.append(
            {"id": f"plot:{p.id}", "type": "plot", "label": p.reference, "verdict": p.verdict or "pending"}
        )
        edges.append(
            {"source": f"supplier:{p.supplier_id}", "target": f"plot:{p.id}", "quantityKg": a.quantity_kg}
        )
    severity = ["compliant", "pending", "needs_review", "non_compliant"]
    for sid, qty in per_supplier.items():
        worst = max(supplier_verdicts[sid], key=lambda v: severity.index(v) if v in severity else 1)
        nodes.insert(
            2, {"id": f"supplier:{sid}", "type": "supplier", "label": supplier_names[sid], "verdict": worst}
        )
        edges.insert(
            1, {"source": f"shipment:{s.id}", "target": f"supplier:{sid}", "quantityKg": round(qty, 2)}
        )
    return {"nodes": nodes, "edges": edges}
