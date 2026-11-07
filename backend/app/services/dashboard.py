"""Leadership dashboard: readiness, plots at risk, shipments cleared to ship, insights and recent activity."""

from __future__ import annotations

import hashlib
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.domain import Assessment, Campaign, CampaignMember, Plot, Shipment, Supplier
from app.db.models.platform import AuditLog, Organization, User
from app.services import domain
from app.services.audit import describe
from app.services.auth import deadline_for
from app.services.suppliers import counts_out, readiness

COMMODITY_LABEL = {
    "cocoa": "Cocoa",
    "coffee": "Coffee",
    "soy": "Soy",
    "oil_palm": "Oil palm",
    "cattle": "Cattle",
    "rubber": "Rubber",
    "wood": "Wood",
}
RISK_ORDER = {"non_compliant": 0, "needs_review": 1, "pending": 2}


def _insight(tone: str, title: str, body: str, href: str | None = None) -> dict:
    return {
        "id": hashlib.sha256(title.encode()).hexdigest()[:10],
        "tone": tone,
        "title": title,
        "body": body,
        "href": href,
    }


def _plural(n: int, one: str, many: str | None = None) -> str:
    return f"{n} {one if n == 1 else (many or one + 's')}"


async def build(db: AsyncSession, org: Organization) -> dict:
    plots = list(
        (
            await db.execute(
                select(Plot, Supplier.name)
                .join(Supplier, Supplier.id == Plot.supplier_id)
                .where(Plot.org_id == org.id, Plot.status == "active")
            )
        ).all()
    )
    suppliers = list(
        (
            await db.execute(select(Supplier).where(Supplier.org_id == org.id).order_by(Supplier.name))
        ).scalars()
    )
    shipments = list((await db.execute(select(Shipment).where(Shipment.org_id == org.id))).scalars())

    by_commodity: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    by_country: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    by_supplier: dict = defaultdict(lambda: defaultdict(int))
    totals: dict[str, int] = defaultdict(int)
    area = 0.0
    for p, _name in plots:
        v = p.verdict or "pending"
        by_commodity[p.commodity][v] += 1
        by_country[p.country][v] += 1
        by_supplier[p.supplier_id][v] += 1
        totals[v] += 1
        area += p.area_ha

    flagged_ids = [
        p.latest_assessment_id for p, _n in plots if p.latest_assessment_id and p.verdict != "compliant"
    ]
    loss_by_plot: dict = {}
    if flagged_ids:
        for a in (await db.execute(select(Assessment).where(Assessment.id.in_(flagged_ids)))).scalars():
            loss_by_plot[a.plot_id] = float((a.metrics or {}).get("lossAfter2020Ha") or 0)
    deforested = round(sum(loss_by_plot.values()), 2)

    suppliers_ready = sum(
        1 for s in suppliers if by_supplier.get(s.id) and readiness(by_supplier[s.id]) == 100
    )
    status_count: dict[str, int] = defaultdict(int)
    for s in shipments:
        status_count[s.status] += 1

    at_risk = sorted(
        (x for x in plots if (x[0].verdict or "pending") in RISK_ORDER),
        key=lambda x: (RISK_ORDER[x[0].verdict or "pending"], -loss_by_plot.get(x[0].id, 0), x[0].reference),
    )[:8]

    kpis = {
        "suppliers": len(suppliers),
        "suppliersReady": suppliers_ready,
        "plots": len(plots),
        "plotsCompliant": totals["compliant"],
        "plotsNeedsReview": totals["needs_review"],
        "plotsNonCompliant": totals["non_compliant"],
        "plotsPending": totals["pending"],
        "areaHa": round(area, 1),
        "deforestedHa": deforested,
        "shipments": len(shipments),
        "shipmentsReady": status_count["ready"],
        "shipmentsBlocked": status_count["blocked"],
        "shipmentsSubmitted": status_count["submitted"],
        "readinessPct": readiness(totals),
    }
    deadline = deadline_for(org)

    return {
        "deadline": {**deadline, "operatorSize": org.operator_size},
        "kpis": kpis,
        "byCommodity": [
            {"key": k, "label": COMMODITY_LABEL.get(k, k), **counts_out(v)}
            for k, v in sorted(by_commodity.items())
        ],
        "byCountry": [
            {"key": k, "label": domain.country_name(k), "riskTier": domain.risk_tier(k), **counts_out(v)}
            for k, v in sorted(by_country.items(), key=lambda kv: domain.country_name(kv[0]))
        ],
        "bySupplier": [
            {"id": str(s.id), "name": s.name, "country": s.country, **counts_out(by_supplier.get(s.id, {}))}
            for s in suppliers
        ],
        "plotsAtRisk": [
            {
                "id": str(p.id),
                "reference": p.reference,
                "supplierName": name,
                "commodity": p.commodity,
                "country": p.country,
                "verdict": p.verdict or "pending",
                "headline": p.headline or "Not assessed yet",
                "areaHa": round(p.area_ha, 2),
            }
            for p, name in at_risk
        ],
        "insights": await _insights(db, org, kpis, deadline, suppliers, by_supplier, plots),
        "recentActivity": await recent_activity(db, org, limit=8),
    }


async def _insights(db, org, kpis, deadline, suppliers, by_supplier, plots) -> list[dict]:
    out: list[dict] = []
    if kpis["plotsNonCompliant"]:
        out.append(
            _insight(
                "warning",
                f"{_plural(kpis['plotsNonCompliant'], 'plot')} with forest cleared after 2020",
                f"About {kpis['deforestedHa']:.1f} ha of forest loss sits on these plots. "
                "Product from them cannot "
                "enter the EU; agree replacement sourcing with the suppliers concerned.",
                "/app/plots?verdict=non_compliant",
            )
        )
    review = sum(1 for p, _n in plots if p.review_required)
    if review:
        out.append(
            _insight(
                "warning",
                f"{_plural(review, 'plot')} waiting for a reviewer",
                "Each needs a person to confirm the evidence before shipments that use it can be cleared.",
                "/app/reviews",
            )
        )
    if kpis["shipmentsBlocked"]:
        out.append(
            _insight(
                "warning",
                f"{_plural(kpis['shipmentsBlocked'], 'shipment')} blocked",
                "Open checks stop a due diligence statement from being drafted. "
                "The shipment page lists what to fix.",
                "/app/shipments?status=blocked",
            )
        )
    silent = [s for s in suppliers if not by_supplier.get(s.id)]
    if silent:
        names = ", ".join(s.name for s in silent[:2]) + ("…" if len(silent) > 2 else "")
        out.append(
            _insight(
                "info",
                f"{_plural(len(silent), 'supplier')} yet to share plots",
                f"{names} {'has' if len(silent) == 1 else 'have'} not provided any plot locations. "
                "Send an upload link or include them in a campaign.",
                "/app/suppliers",
            )
        )
    overdue = (
        await db.execute(
            select(CampaignMember.id)
            .join(Campaign, Campaign.id == CampaignMember.campaign_id)
            .where(Campaign.org_id == org.id, Campaign.status == "running", CampaignMember.stage == "overdue")
        )
    ).all()
    if overdue:
        out.append(
            _insight(
                "warning",
                f"{_plural(len(overdue), 'supplier')} overdue in a campaign",
                "They missed the due date for sharing evidence. A reminder is a click away.",
                "/app/campaigns",
            )
        )
    if kpis["shipmentsReady"]:
        out.append(
            _insight(
                "positive",
                f"{_plural(kpis['shipmentsReady'], 'shipment')} cleared to ship",
                "All checks pass. Draft the due diligence statement to release them.",
                "/app/shipments?status=ready",
            )
        )
    out.append(
        _insight(
            "info" if kpis["readinessPct"] >= 80 or deadline["daysLeft"] > 120 else "warning",
            f"{deadline['daysLeft']} days until the EUDR applies to you",
            f"{kpis['readinessPct']}% of your plots are verified deforestation-free today"
            + (
                f"; {kpis['suppliersReady']} of {kpis['suppliers']} suppliers are fully ready."
                if kpis["suppliers"]
                else "."
            ),
            "/app/suppliers",
        )
    )
    return out


async def recent_activity(db: AsyncSession, org: Organization, limit: int = 8) -> list[dict]:
    rows = (
        await db.execute(
            select(AuditLog, User.full_name)
            .outerjoin(User, User.id == AuditLog.actor_id)
            .where(AuditLog.org_id == org.id, ~AuditLog.action.startswith("auth."))
            .order_by(AuditLog.id.desc())
            .limit(limit)
        )
    ).all()
    return [
        {
            "id": r.id,
            "action": r.action,
            "label": describe(r.action, r.meta),
            "actorName": name or ("Supplier link" if r.actor_type == "supplier" else "Plotline"),
            "createdAt": r.created_at.isoformat(),
        }
        for r, name in rows
    ]
