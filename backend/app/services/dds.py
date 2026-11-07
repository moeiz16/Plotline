"""Due diligence statements: draft from a ready shipment, simulated submission, evidence pack context."""

from __future__ import annotations

import uuid
from collections import Counter

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.summary import shipment_summary
from app.core.config import get_settings
from app.core.deps import RequestContext
from app.core.errors import conflict, not_found
from app.core.metrics import DDS_SUBMISSIONS
from app.db.base import utcnow
from app.db.models.domain import (
    Assessment,
    Dds,
    DdsSubmission,
    Plot,
    Product,
    Shipment,
    ShipmentAllocation,
    Supplier,
)
from app.db.models.platform import Organization
from app.evidence.payload import build_payload, payload_hash, simulated_numbers
from app.services import domain
from app.services import shipments as shipment_svc
from app.services.audit import audit, verify_chain
from app.services.notifications import notify
from app.services.plots import assessment_out


def list_item(d: Dds, shipment_ref: str) -> dict:
    return {
        "id": str(d.id),
        "internalRef": d.internal_ref,
        "shipmentId": str(d.shipment_id),
        "shipmentReference": shipment_ref,
        "status": d.status,
        "referenceNumber": d.reference_number,
        "verificationNumber": d.verification_number,
        "createdAt": d.created_at.isoformat() if d.created_at else None,
        "submittedAt": d.submitted_at.isoformat() if d.submitted_at else None,
    }


async def list_dds(db: AsyncSession, org_id: uuid.UUID) -> list[dict]:
    rows = (
        await db.execute(
            select(Dds, Shipment.reference)
            .join(Shipment, Shipment.id == Dds.shipment_id)
            .where(Dds.org_id == org_id)
            .order_by(Dds.created_at.desc())
        )
    ).all()
    return [list_item(d, ref) for d, ref in rows]


async def get_dds(db: AsyncSession, org_id: uuid.UUID, dds_id: uuid.UUID) -> tuple[Dds, Shipment]:
    row = (
        await db.execute(
            select(Dds, Shipment)
            .join(Shipment, Shipment.id == Dds.shipment_id)
            .where(Dds.id == dds_id, Dds.org_id == org_id)
        )
    ).first()
    if not row:
        raise not_found("Statement")
    return row[0], row[1]


async def dds_detail(db: AsyncSession, d: Dds, shipment: Shipment) -> dict:
    subs = (
        await db.execute(select(DdsSubmission).where(DdsSubmission.dds_id == d.id).order_by(DdsSubmission.at))
    ).scalars()
    return {
        **list_item(d, shipment.reference),
        "payload": d.payload,
        "summary": d.summary,
        "submissions": [
            {
                "id": str(x.id),
                "at": x.at.isoformat(),
                "status": x.status,
                "message": x.message,
                "referenceNumber": x.reference_number,
            }
            for x in subs
        ],
    }


async def _plots_for(db: AsyncSession, shipment: Shipment) -> list[tuple[ShipmentAllocation, Plot, str]]:
    rows = await db.execute(
        select(ShipmentAllocation, Plot, Supplier.name)
        .join(Plot, Plot.id == ShipmentAllocation.plot_id)
        .join(Supplier, Supplier.id == Plot.supplier_id)
        .where(ShipmentAllocation.shipment_id == shipment.id)
        .order_by(Plot.reference)
    )
    return [(a, p, n) for a, p, n in rows.all()]


def org_dict(org: Organization) -> dict:
    return {"name": org.name, "eori": org.eori, "address": org.address, "country": org.country}


async def summary_context(db: AsyncSession, shipment: Shipment, product: Product) -> dict:
    rows = await _plots_for(db, shipment)
    verdicts = Counter(p.verdict or "pending" for _a, p, _n in rows)
    assessments = {
        a.plot_id: a
        for a in (
            await db.execute(
                select(Assessment).where(
                    Assessment.id.in_(
                        [p.latest_assessment_id for _x, p, _n in rows if p.latest_assessment_id]
                    )
                )
            )
        ).scalars()
    }
    loss = sum(
        float((assessments[p.id].metrics or {}).get("lossAfter2020Ha") or 0)
        for _a, p, _n in rows
        if p.id in assessments and p.verdict != "compliant"
    )
    countries = sorted({p.country for _a, p, _n in rows})
    checks = (shipment.checks or {}).get("checks", [])
    return {
        "shipmentReference": shipment.reference,
        "productName": product.name,
        "commodity": product.commodity,
        "quantityKg": shipment.quantity_kg,
        "harvestYear": shipment.harvest_year,
        "plots": len(rows),
        "areaHa": round(sum(p.area_ha for _a, p, _n in rows), 2),
        "suppliers": sorted({n for _a, _p, n in rows}),
        "countries": [{"name": domain.country_name(c), "riskTier": domain.risk_tier(c)} for c in countries],
        "verdicts": {
            "compliant": verdicts.get("compliant", 0),
            "needsReview": verdicts.get("needs_review", 0),
            "nonCompliant": verdicts.get("non_compliant", 0),
            "pending": verdicts.get("pending", 0),
        },
        "reviewed": sum(1 for a in assessments.values() if a.review),
        "lossAfter2020Ha": round(loss, 2),
        "checksFailed": [c.get("label") or c.get("code") for c in checks if c.get("status") == "fail"],
        "mixing": (shipment.checks or {}).get("mixing", {}),
    }


async def _next_internal_ref(db: AsyncSession, org_id: uuid.UUID) -> str:
    n = (await db.execute(select(func.count()).select_from(Dds).where(Dds.org_id == org_id))).scalar_one()
    return f"DDS-{utcnow().year}-{n + 1:04d}"


async def create_from_shipment(
    db: AsyncSession, ctx: RequestContext | None, org: Organization, shipment: Shipment, product: Product
) -> Dds:
    if shipment.status == "submitted":
        raise conflict("dds_already_submitted", "A statement for this shipment has already been submitted.")
    await shipment_svc.evaluate(db, shipment)
    if shipment.status != "ready":
        raise conflict(
            "shipment_not_ready", "Resolve the open checks on this shipment before drafting a statement."
        )
    rows = await _plots_for(db, shipment)
    plots = [
        {
            "reference": p.reference,
            "kind": p.kind,
            "geometry": p.geometry,
            "areaHa": p.area_ha,
            "declaredAreaHa": p.declared_area_ha,
            "country": p.country,
            "supplierName": n,
        }
        for _a, p, n in rows
    ]
    internal_ref = await _next_internal_ref(db, org.id)
    payload = build_payload(
        internal_ref=internal_ref,
        org=org_dict(org),
        product={"name": product.name, "commodity": product.commodity, "hsCode": product.hs_code},
        shipment={
            "reference": shipment.reference,
            "harvestYear": shipment.harvest_year,
            "quantityKg": shipment.quantity_kg,
        },
        plots=plots,
    )
    # Supersede any earlier draft for this shipment.
    for old in (
        await db.execute(select(Dds).where(Dds.shipment_id == shipment.id, Dds.status == "draft"))
    ).scalars():
        old.status = "rejected"
    d = Dds(
        org_id=org.id,
        shipment_id=shipment.id,
        internal_ref=internal_ref,
        status="draft",
        payload=payload,
        summary=shipment_summary(await summary_context(db, shipment, product)),
        payload_hash=payload_hash(payload),
        created_by=ctx.user.id if ctx else None,
    )
    db.add(d)
    await db.flush()
    await audit(
        db,
        ctx,
        org_id=org.id,
        action="dds.created",
        resource_type="dds",
        resource_id=d.id,
        metadata={
            "internalRef": internal_ref,
            "shipmentReference": shipment.reference,
            "payloadHash": d.payload_hash,
        },
    )
    return d


async def submit(
    db: AsyncSession, ctx: RequestContext | None, org: Organization, d: Dds, shipment: Shipment
) -> Dds:
    """Simulated submission to the EU information system: validates, then issues reference numbers."""
    if d.status in ("submitted", "accepted"):
        raise conflict("dds_already_submitted", "This statement has already been submitted.")
    if d.status != "draft":
        raise conflict("dds_superseded", "This draft was replaced by a newer one. Open the latest statement.")
    await shipment_svc.evaluate(db, shipment)
    now = utcnow()
    if shipment.status != "ready":
        db.add(
            DdsSubmission(
                org_id=org.id,
                dds_id=d.id,
                at=now,
                status="rejected",
                message="Not sent: the shipment no longer passes every check.",
            )
        )
        await db.flush()
        raise conflict(
            "shipment_not_ready", "The shipment changed since this draft was prepared; review its checks."
        )
    if payload_hash(d.payload) != d.payload_hash:
        raise conflict(
            "payload_changed", "The statement content changed after it was prepared. Draft it again."
        )
    reference, verification = simulated_numbers(str(d.id), d.payload_hash, now.year, org.country or "EU")
    db.add(
        DdsSubmission(
            org_id=org.id,
            dds_id=d.id,
            at=now,
            status="sent",
            message="Statement sent to the EU information system (simulated).",
        )
    )
    db.add(
        DdsSubmission(
            org_id=org.id,
            dds_id=d.id,
            at=now,
            status="submitted",
            reference_number=reference,
            message="Statement registered. Reference and verification numbers issued.",
        )
    )
    d.status = "submitted"
    d.reference_number = reference
    d.verification_number = verification
    d.submitted_at = now
    shipment.status = "submitted"
    shipment.updated_at = now
    DDS_SUBMISSIONS.labels("submitted").inc()
    await audit(
        db,
        ctx,
        org_id=org.id,
        action="dds.submitted",
        resource_type="dds",
        resource_id=d.id,
        metadata={
            "internalRef": d.internal_ref,
            "referenceNumber": reference,
            "shipmentReference": shipment.reference,
        },
    )
    await notify(
        db,
        org.id,
        type="dds.submitted",
        title=f"Statement {reference} submitted",
        body=f"Shipment {shipment.reference} is cleared to ship.",
        link=f"/app/statements/{d.id}",
        permission="dds:read",
    )
    await db.flush()
    return d


async def evidence_context(db: AsyncSession, org: Organization, d: Dds, shipment: Shipment) -> dict:
    product = await db.get(Product, shipment.product_id)
    assert product is not None
    rows = await _plots_for(db, shipment)
    ids = [p.latest_assessment_id for _a, p, _n in rows if p.latest_assessment_id]
    assessments = {
        a.id: a for a in (await db.execute(select(Assessment).where(Assessment.id.in_(ids)))).scalars()
    }
    plots, datasets = [], {}
    for _a, p, name in rows:
        a = assessments.get(p.latest_assessment_id) if p.latest_assessment_id else None
        out = assessment_out(a) if a else {}
        datasets.update(out.get("datasets") or {})
        plots.append(
            {
                "reference": p.reference,
                "supplierName": name,
                "country": p.country,
                "kind": p.kind,
                "areaHa": round(p.area_ha, 2),
                "verdict": p.verdict or "pending",
                "headline": p.headline,
                "forest2020Ha": out.get("forest2020Ha"),
                "lossAfter2020Ha": out.get("lossAfter2020Ha"),
                "changeLevel": out.get("changeLevel"),
                "review": out.get("review"),
                "assessedAt": out.get("createdAt"),
                "resultHash": out.get("resultHash"),
            }
        )
    detail = await dds_detail(db, d, shipment)
    checks = shipment.checks or {}
    labels = {
        "forest2020": "Forest map 2020",
        "forestLoss": "Forest loss record",
        "imagery": "Satellite imagery",
        "changeModel": "Land-change signal",
        "rules": "Assessment rules",
    }
    return {
        "generatedAt": utcnow().isoformat(),
        "org": org_dict(org),
        "dds": {**detail, "payloadHash": d.payload_hash},
        "shipment": {
            "reference": shipment.reference,
            "productName": product.name,
            "hsCode": product.hs_code,
            "commodity": product.commodity,
            "quantityKg": shipment.quantity_kg,
            "harvestYear": shipment.harvest_year,
            "status": shipment.status,
        },
        "summary": d.summary,
        "countries": [
            {"code": c, "name": domain.country_name(c), "riskTier": domain.risk_tier(c)}
            for c in sorted({p["country"] for p in plots})
        ],
        "plots": plots,
        "checks": checks.get("checks", []),
        "massBalance": checks.get("massBalance", []),
        "mixing": checks.get("mixing", {}),
        "datasets": {labels.get(k, k): v for k, v in datasets.items()},
        "submissions": detail["submissions"],
        "auditChain": await verify_chain(db, org.id),
        "retentionYears": max(
            get_settings().evidence_retention_years, int((org.settings or {}).get("retentionYears") or 5)
        ),
    }
