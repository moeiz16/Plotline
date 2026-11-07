"""Plots: validation, creation (app, import, supplier link), assessment, review, imagery and similarity."""

from __future__ import annotations

import asyncio
import hashlib
import json
import math
import uuid
from collections import OrderedDict
from typing import Any

import h3
from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import RequestContext
from app.core.errors import AppError, conflict, not_found, validation_error
from app.core.metrics import ASSESSMENT_SECONDS, ASSESSMENTS, REVIEWS
from app.db.base import utcnow
from app.db.models.domain import Assessment, Plot, Shipment, ShipmentAllocation, Supplier
from app.db.models.platform import Organization
from app.services import domain
from app.services.audit import audit
from app.services.notifications import notify

REVIEW_VERDICT = {
    "confirm_compliant": "compliant",
    "confirm_non_compliant": "non_compliant",
    "request_information": "needs_review",
}
REVIEW_HEADLINE = {
    "confirm_compliant": "Confirmed compliant by a reviewer",
    "confirm_non_compliant": "Confirmed non-compliant by a reviewer",
    "request_information": "More information requested from the supplier",
}
DECISION_LABEL = {
    "confirm_compliant": "confirmed compliant",
    "confirm_non_compliant": "confirmed non-compliant",
    "request_information": "returned for more information",
}


# ── Serialisers ──────────────────────────────────────────────────────────────
def plot_item(p: Plot, supplier_name: str) -> dict:
    return {
        "id": str(p.id),
        "reference": p.reference,
        "supplierId": str(p.supplier_id),
        "supplierName": supplier_name,
        "commodity": p.commodity,
        "country": p.country,
        "countryName": domain.country_name(p.country),
        "riskTier": domain.risk_tier(p.country),
        "kind": p.kind,
        "areaHa": round(p.area_ha, 2),
        "verdict": p.verdict or "pending",
        "headline": p.headline,
        "changeLevel": p.change_level,
        "reviewRequired": bool(p.review_required),
        "assessedAt": p.assessed_at.isoformat() if p.assessed_at else None,
        "centroid": [round(p.centroid_lon, 6), round(p.centroid_lat, 6)],
    }


def effective_verdict(a: Assessment) -> str:
    if a.review and a.review.get("decision") in REVIEW_VERDICT:
        return REVIEW_VERDICT[a.review["decision"]]
    return a.verdict


def assessment_out(a: Assessment) -> dict:
    m = a.metrics or {}
    review = None
    if a.review:
        review = {k: a.review.get(k) for k in ("decision", "note", "reviewerName", "reviewedAt")}
    return {
        "id": str(a.id),
        "plotId": str(a.plot_id),
        "verdict": effective_verdict(a),
        "headline": a.headline,
        "createdAt": a.created_at.isoformat(),
        "source": a.source,
        "reasons": list(a.reasons or []),
        "forest2020Ha": m.get("forest2020Ha"),
        "forest2020Share": m.get("forest2020Share"),
        "lossAfter2020Ha": m.get("lossAfter2020Ha"),
        "lossByYear": m.get("lossByYear") or {},
        "treeCover2000Pct": m.get("treeCover2000Pct"),
        "cloudFreeShare": m.get("cloudFreeShare"),
        "changeScore": m.get("changeScore"),
        "changeLevel": m.get("changeLevel"),
        "signalsAgree": m.get("signalsAgree"),
        "reviewRequired": bool(a.review_required) and not a.review,
        "review": review,
        "datasets": a.datasets or {},
        "inputsHash": a.inputs_hash,
        "resultHash": a.result_hash,
    }


async def plot_detail(db: AsyncSession, p: Plot, supplier_name: str) -> dict:
    latest = await db.get(Assessment, p.latest_assessment_id) if p.latest_assessment_id else None
    ships = (
        await db.execute(
            select(Shipment.id, Shipment.reference, ShipmentAllocation.quantity_kg)
            .join(ShipmentAllocation, ShipmentAllocation.shipment_id == Shipment.id)
            .where(ShipmentAllocation.plot_id == p.id, Shipment.org_id == p.org_id)
            .order_by(Shipment.reference)
        )
    ).all()
    validation = p.validation or {}
    return {
        **plot_item(p, supplier_name),
        "geometry": p.geometry,
        "declaredAreaHa": p.declared_area_ha,
        "producerName": p.producer_name,
        "h3Cell": p.h3_cell,
        "validation": {"valid": bool(validation.get("valid", True)), "issues": validation.get("issues", [])},
        "latestAssessment": assessment_out(latest) if latest else None,
        "createdAt": p.created_at.isoformat() if p.created_at else None,
        "shipments": [{"id": str(i), "reference": r, "quantityKg": q} for i, r, q in ships],
    }


# ── Queries ──────────────────────────────────────────────────────────────────
def _filtered(
    ctx: RequestContext,
    *,
    supplier_id: uuid.UUID | None = None,
    verdict: str | None = None,
    country: str | None = None,
    commodity: str | None = None,
    q: str | None = None,
) -> Select:
    stmt = (
        select(Plot, Supplier.name)
        .join(Supplier, Supplier.id == Plot.supplier_id)
        .where(Plot.org_id == ctx.org_id, Plot.status == "active")
        .order_by(Plot.reference)
    )
    if ctx.is_supplier:
        stmt = stmt.where(Plot.supplier_id == ctx.supplier_scope)
    if supplier_id:
        stmt = stmt.where(Plot.supplier_id == supplier_id)
    if verdict:
        stmt = stmt.where(Plot.verdict == verdict)
    if country:
        stmt = stmt.where(Plot.country == country.upper())
    if commodity:
        stmt = stmt.where(Plot.commodity == commodity)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Plot.reference.ilike(like), Supplier.name.ilike(like)))
    return stmt


async def list_plots(db: AsyncSession, ctx: RequestContext, **filters: Any) -> list[dict]:
    return [plot_item(p, name) for p, name in (await db.execute(_filtered(ctx, **filters))).all()]


def circle_polygon(lon: float, lat: float, area_ha: float, n: int = 32) -> dict:
    """A point plot drawn as a circle of its declared area (for maps)."""
    r = math.sqrt(max(area_ha, 0.01) * 10_000 / math.pi)
    dlat = r / 111_320
    dlon = r / (111_320 * max(math.cos(math.radians(lat)), 1e-6))
    ring = [
        [
            round(lon + dlon * math.cos(2 * math.pi * i / n), 6),
            round(lat + dlat * math.sin(2 * math.pi * i / n), 6),
        ]
        for i in range(n)
    ]
    ring.append(ring[0])
    return {"type": "Polygon", "coordinates": [ring]}


async def plots_geojson(db: AsyncSession, ctx: RequestContext, **filters: Any) -> dict:
    features = []
    for p, name in (await db.execute(_filtered(ctx, **filters))).all():
        geom = p.geometry
        if p.kind == "point" or geom.get("type") == "Point":
            geom = circle_polygon(p.centroid_lon, p.centroid_lat, p.declared_area_ha or p.area_ha)
        features.append(
            {
                "type": "Feature",
                "id": str(p.id),
                "geometry": geom,
                "properties": {
                    "id": str(p.id),
                    "reference": p.reference,
                    "verdict": p.verdict or "pending",
                    "commodity": p.commodity,
                    "supplierName": name,
                    "areaHa": round(p.area_ha, 2),
                    "kind": p.kind,
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


async def get_plot(db: AsyncSession, ctx: RequestContext, plot_id: uuid.UUID) -> tuple[Plot, str]:
    row = (
        await db.execute(
            select(Plot, Supplier.name)
            .join(Supplier, Supplier.id == Plot.supplier_id)
            .where(Plot.id == plot_id, Plot.org_id == ctx.org_id, Plot.status == "active")
        )
    ).first()
    if not row or (ctx.is_supplier and row[0].supplier_id != ctx.supplier_scope):
        raise not_found("Plot")
    return row[0], row[1]


# ── Validation ───────────────────────────────────────────────────────────────
def validation_out(result: Any) -> dict:
    issues = [domain.issue_out(i) for i in getattr(result, "issues", [])]
    return {
        "valid": bool(getattr(result, "valid", False)),
        "issues": issues,
        "areaHa": round(result.area_ha, 4) if getattr(result, "area_ha", None) is not None else None,
        "kind": getattr(result, "kind", None),
        "normalized": getattr(result, "normalized", None),
    }


async def overlap_issues(
    db: AsyncSession,
    org_id: uuid.UUID,
    geometry: dict,
    h3_parent: str | None,
    exclude: uuid.UUID | None = None,
) -> list[dict]:
    if not h3_parent:
        return []
    stmt = select(Plot.id, Plot.reference, Plot.geometry, Plot.kind).where(
        Plot.org_id == org_id, Plot.status == "active", Plot.h3_parent == h3_parent
    )
    if exclude:
        stmt = stmt.where(Plot.id != exclude)
    rows = (await db.execute(stmt)).all()
    others = [(str(i), g) for i, _r, g, k in rows if k == "polygon" and g.get("type") != "Point"]
    if not others or geometry.get("type") == "Point":
        return []
    refs = {str(i): r for i, r, _g, _k in rows}
    hits = await asyncio.to_thread(domain.find_overlaps, geometry, others, 0.01)
    return [
        {
            "code": "overlap",
            "severity": "warning",
            "message": f"Overlaps plot {refs.get(pid, pid)} by {ha:.2f} ha. "
            "Check that the boundaries are right.",
            "field": "geometry",
        }
        for pid, ha in hits
    ]


def h3_parent_of(cell: str | None, lon: float, lat: float) -> tuple[str | None, str | None]:
    try:
        cell = cell or h3.latlng_to_cell(lat, lon, 9)
        return cell, h3.cell_to_parent(cell, 5)
    except Exception:
        return cell, None


async def validate_for_org(
    db: AsyncSession,
    org_id: uuid.UUID,
    geometry: dict,
    country: str,
    declared_area_ha: float | None,
    exclude: uuid.UUID | None = None,
) -> tuple[Any, dict]:
    result = await asyncio.to_thread(domain.validate_geometry, geometry, country, declared_area_ha)
    out = validation_out(result)
    centroid = getattr(result, "centroid", None)
    if out["valid"] and out["normalized"] and centroid:
        _cell, parent = h3_parent_of(getattr(result, "h3_cell", None), centroid[0], centroid[1])
        out["issues"] += await overlap_issues(db, org_id, out["normalized"], parent, exclude)
    return result, out


def geometry_error(out: dict) -> AppError:
    errors = [
        {"field": i.get("field") or "geometry", "message": i["message"], "code": i["code"]}
        for i in out["issues"]
        if i["severity"] == "error"
    ]
    return validation_error(
        errors[0]["message"] if errors else "The plot boundary is not valid.", errors, code="geometry_invalid"
    )


async def _reference_taken(
    db: AsyncSession, org_id: uuid.UUID, reference: str, exclude: uuid.UUID | None = None
) -> bool:
    stmt = select(Plot.id).where(Plot.org_id == org_id, func.lower(Plot.reference) == reference.lower())
    if exclude:
        stmt = stmt.where(Plot.id != exclude)
    return (await db.execute(stmt)).first() is not None


async def create_plot(
    db: AsyncSession,
    org: Organization,
    supplier: Supplier,
    *,
    reference: str,
    commodity: str,
    country: str,
    geometry: dict,
    declared_area_ha: float | None,
    producer_name: str | None = None,
    created_via: str = "app",
    ctx: RequestContext | None = None,
    actor_type: str | None = None,
    assess: bool | None = None,
    validated: tuple[Any, dict] | None = None,
) -> Plot:
    if await _reference_taken(db, org.id, reference):
        raise conflict("reference_taken", f"A plot with reference {reference} already exists.")
    result, out = validated or await validate_for_org(db, org.id, geometry, country, declared_area_ha)
    if not out["valid"]:
        raise geometry_error(out)
    lon, lat = result.centroid
    cell, parent = h3_parent_of(getattr(result, "h3_cell", None), lon, lat)
    plot = Plot(
        org_id=org.id,
        supplier_id=supplier.id,
        reference=reference,
        commodity=commodity,
        country=country.upper(),
        kind=out["kind"] or "polygon",
        geometry=out["normalized"],
        area_ha=float(result.area_ha),
        declared_area_ha=declared_area_ha,
        centroid_lon=float(lon),
        centroid_lat=float(lat),
        h3_cell=cell,
        h3_parent=parent,
        producer_name=(producer_name or None),
        validation={"valid": True, "issues": out["issues"]},
        verdict="pending",
        created_via=created_via,
    )
    db.add(plot)
    await db.flush()
    await audit(
        db,
        ctx,
        org_id=org.id,
        action="plot.created",
        resource_type="plot",
        resource_id=plot.id,
        actor_type=actor_type,
        metadata={"reference": reference, "via": created_via},
    )
    auto = (org.settings or {}).get("autoAssess", True) if assess is None else assess
    if auto:
        await run_assessment(db, org, plot, ctx=ctx)
    return plot


# ── Assessment ───────────────────────────────────────────────────────────────
def to_plot_input(p: Plot) -> Any:
    return domain.plot_input(
        id=str(p.id),
        reference=p.reference,
        geometry=p.geometry,
        commodity=p.commodity,
        country=p.country,
        area_ha=float(p.area_ha),
    )


def _apply_to_plot(org: Organization, p: Plot, a: Assessment) -> None:
    p.latest_assessment_id = a.id
    p.verdict = effective_verdict(a)
    p.headline = REVIEW_HEADLINE[a.review["decision"]] if a.review else a.headline
    p.change_level = (a.metrics or {}).get("changeLevel")
    policy_review = (org.settings or {}).get("reviewAllHighRisk", True) and domain.risk_tier(
        p.country
    ) == "high"
    p.review_required = not a.review and (
        bool(a.review_required) or (policy_review and a.verdict != "pending")
    )
    p.assessed_at = a.created_at


async def run_assessment(
    db: AsyncSession,
    org: Organization,
    p: Plot,
    *,
    ctx: RequestContext | None = None,
    notify_reviewers: bool = True,
) -> Assessment:
    started = utcnow()
    result = await asyncio.to_thread(domain.assess_plot, to_plot_input(p))
    ASSESSMENT_SECONDS.observe((utcnow() - started).total_seconds())
    a = Assessment(
        org_id=org.id,
        plot_id=p.id,
        verdict=result.verdict,
        headline=result.headline,
        reasons=[domain.as_dict(r) for r in result.reasons],
        metrics=dict(result.metrics or {}),
        review_required=bool(result.review_required),
        datasets=dict(result.datasets or {}),
        inputs_hash=result.inputs_hash,
        result_hash=result.result_hash,
        source=result.source,
        created_by=ctx.user.id if ctx else None,
        created_at=utcnow(),
    )
    db.add(a)
    await db.flush()
    if getattr(result, "embedding", None) is not None:
        p.embedding = [round(float(x), 6) for x in result.embedding]
    _apply_to_plot(org, p, a)
    ASSESSMENTS.labels(a.verdict, a.source).inc()
    await audit(
        db,
        ctx,
        org_id=org.id,
        action="plot.assessed",
        resource_type="plot",
        resource_id=p.id,
        metadata={"reference": p.reference, "verdict": a.verdict, "resultHash": a.result_hash},
    )
    if p.review_required and notify_reviewers:
        await notify(
            db,
            org.id,
            type="review.needed",
            title=f"Plot {p.reference} needs a reviewer",
            body=a.headline,
            link=f"/app/plots/{p.id}",
            permission="plots:review",
        )
    await refresh_shipments_for_plots(db, org.id, [p.id])
    return a


async def review(
    db: AsyncSession, ctx: RequestContext, org: Organization, p: Plot, decision: str, note: str
) -> Assessment:
    if not p.latest_assessment_id:
        raise conflict("not_assessed", "This plot has not been assessed yet.")
    a = await db.get(Assessment, p.latest_assessment_id)
    assert a is not None
    if a.verdict == "pending":
        raise conflict("not_assessed", "This plot has no forest evidence yet. Run an assessment first.")
    if decision == "confirm_compliant" and a.verdict == "non_compliant" and len(note.strip()) < 10:
        raise validation_error(
            "Explain why the forest loss does not apply to this plot.",
            [{"field": "note", "message": "A short justification is required to overrule forest loss."}],
        )
    a.review = {
        "decision": decision,
        "note": note,
        "reviewerName": ctx.user.full_name,
        "reviewerId": str(ctx.user.id),
        "reviewedAt": utcnow().isoformat(),
        "verdictBefore": a.verdict,
    }
    _apply_to_plot(org, p, a)
    REVIEWS.labels(decision).inc()
    await audit(
        db,
        ctx,
        action="plot.reviewed",
        resource_type="plot",
        resource_id=p.id,
        metadata={"reference": p.reference, "decision": decision, "decisionLabel": DECISION_LABEL[decision]},
    )
    await refresh_shipments_for_plots(db, org.id, [p.id])
    return a


async def assessments_for(db: AsyncSession, plot_id: uuid.UUID) -> list[dict]:
    rows = (
        await db.execute(
            select(Assessment).where(Assessment.plot_id == plot_id).order_by(Assessment.created_at.desc())
        )
    ).scalars()
    return [assessment_out(a) for a in rows]


async def review_queue(db: AsyncSession, ctx: RequestContext) -> list[dict]:
    stmt = (
        select(Plot, Supplier.name)
        .join(Supplier, Supplier.id == Plot.supplier_id)
        .where(Plot.org_id == ctx.org_id, Plot.status == "active", Plot.review_required.is_(True))
        .order_by(Plot.assessed_at)
    )
    return [plot_item(p, n) for p, n in (await db.execute(stmt)).all()]


async def refresh_shipments_for_plots(db: AsyncSession, org_id: uuid.UUID, plot_ids: list[uuid.UUID]) -> None:
    from app.services import shipments as shipment_svc

    ids = (
        await db.execute(
            select(ShipmentAllocation.shipment_id)
            .where(ShipmentAllocation.org_id == org_id, ShipmentAllocation.plot_id.in_(plot_ids))
            .distinct()
        )
    ).scalars()
    for sid in list(ids):
        s = await db.get(Shipment, sid)
        if s and s.status != "submitted":
            await shipment_svc.evaluate(db, s)


# ── Imagery and similarity ───────────────────────────────────────────────────
_IMAGERY_CACHE: OrderedDict[str, bytes] = OrderedDict()
_IMAGERY_MAX = 96


async def imagery_png(p: Plot, kind: str) -> bytes:
    key = hashlib.sha256(
        json.dumps(
            [str(p.id), kind, p.geometry, p.latest_assessment_id and str(p.latest_assessment_id)],
            sort_keys=True,
        ).encode()
    ).hexdigest()
    if key in _IMAGERY_CACHE:
        _IMAGERY_CACHE.move_to_end(key)
        return _IMAGERY_CACHE[key]
    png = await asyncio.to_thread(domain.render_imagery, to_plot_input(p), kind)
    _IMAGERY_CACHE[key] = png
    while len(_IMAGERY_CACHE) > _IMAGERY_MAX:
        _IMAGERY_CACHE.popitem(last=False)
    return png


async def similar(db: AsyncSession, ctx: RequestContext, p: Plot, k: int) -> list[dict]:
    if not p.embedding:
        return []
    rows = (await db.execute(_filtered(ctx).where(Plot.id != p.id, Plot.embedding.is_not(None)))).all()
    by_id = {str(row[0].id): row for row in rows}
    candidates = [(pid, row[0].embedding) for pid, row in by_id.items() if row[0].embedding]
    hits = await asyncio.to_thread(domain.similar_plots, p.embedding, candidates, k)
    out = []
    for pid, score in hits:
        row = by_id.get(pid)
        if row:
            out.append(
                {"plot": plot_item(row[0], row[1]), "similarity": round(max(0.0, min(1.0, float(score))), 4)}
            )
    return out


async def archive(db: AsyncSession, ctx: RequestContext | None, p: Plot) -> None:
    open_alloc = (
        await db.execute(
            select(Shipment.reference)
            .join(ShipmentAllocation, ShipmentAllocation.shipment_id == Shipment.id)
            .where(ShipmentAllocation.plot_id == p.id, Shipment.status != "submitted")
        )
    ).first()
    if open_alloc:
        raise conflict("plot_in_use", f"Remove this plot from shipment {open_alloc[0]} first.")
    p.status = "archived"
    p.archived_at = utcnow()
    await audit(
        db,
        ctx,
        org_id=p.org_id,
        action="plot.archived",
        resource_type="plot",
        resource_id=p.id,
        actor_type=None if ctx else "supplier",
        metadata={"reference": p.reference},
    )


# ── Bulk import (GeoJSON / KML / CSV) ────────────────────────────────────────
ALLOWED_UPLOADS = (".geojson", ".json", ".kml", ".csv")


async def import_plots(
    db: AsyncSession,
    org: Organization,
    supplier: Supplier,
    *,
    commodity: str,
    filename: str,
    content: bytes,
    created_via: str,
    ctx: RequestContext | None = None,
) -> dict:
    from app.core.config import get_settings

    if not filename.lower().endswith(ALLOWED_UPLOADS):
        raise AppError(415, "unsupported_file", "Unsupported file", "Upload a GeoJSON, KML or CSV file.")
    if len(content) > get_settings().max_upload_bytes:
        raise AppError(413, "file_too_large", "File too large", "Upload a file under 5 MB.")
    parsed = await asyncio.to_thread(domain.parse_upload, filename, content)
    created: list[dict] = []
    rejected: list[dict] = []
    seen: set[str] = set()
    for item in parsed:
        issues = [domain.issue_out(i) for i in (getattr(item, "issues", None) or [])]
        ref = (getattr(item, "reference", None) or "").strip() or None
        row = getattr(item, "row", None)
        geometry = getattr(item, "geometry", None)
        if ref is None:
            issues.append(
                {
                    "code": "missing_reference",
                    "severity": "error",
                    "message": "Add a plot reference (a name or code for the plot).",
                    "field": "reference",
                }
            )
        elif ref.lower() in seen or await _reference_taken(db, org.id, ref):
            issues.append(
                {
                    "code": "duplicate_reference",
                    "severity": "error",
                    "message": f"A plot with reference {ref} already exists.",
                    "field": "reference",
                }
            )
        if geometry is None and not any(i["severity"] == "error" for i in issues):
            issues.append(
                {
                    "code": "missing_geometry",
                    "severity": "error",
                    "message": "No location found.",
                    "field": "geometry",
                }
            )
        if any(i["severity"] == "error" for i in issues):
            rejected.append({"reference": ref, "row": row, "issues": issues})
            continue
        assert ref is not None and geometry is not None
        validated = await validate_for_org(
            db, org.id, geometry, supplier.country, getattr(item, "declared_area_ha", None)
        )
        if not validated[1]["valid"]:
            rejected.append({"reference": ref, "row": row, "issues": issues + validated[1]["issues"]})
            continue
        validated[1]["issues"] = issues + validated[1]["issues"]
        plot = await create_plot(
            db,
            org,
            supplier,
            reference=ref,
            commodity=commodity,
            country=supplier.country,
            geometry=geometry,
            declared_area_ha=getattr(item, "declared_area_ha", None),
            created_via=created_via,
            ctx=ctx,
            actor_type="supplier" if created_via == "portal" else None,
            validated=validated,
        )
        seen.add(ref.lower())
        created.append(plot_item(plot, supplier.name))
    await audit(
        db,
        ctx,
        org_id=org.id,
        action="plot.imported",
        resource_type="supplier",
        resource_id=supplier.id,
        actor_type="supplier" if created_via == "portal" else None,
        metadata={"created": len(created), "rejected": len(rejected), "file": filename[-80:]},
    )
    return {"created": created, "rejected": rejected}
