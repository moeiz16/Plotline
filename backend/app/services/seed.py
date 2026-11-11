"""Demo seed: Northbank Cocoa & Coffee Imports GmbH.

All people, farms and shipments are synthetic sample data.

Runs fully offline: plot outlines and forest evidence come from the bundled synthetic landscape.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import RequestContext
from app.core.permissions import permissions_for
from app.core.security import hash_password
from app.core.text import human_date
from app.db.base import utcnow
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
    Supplier,
)
from app.db.models.platform import AuditLog, Membership, Organization, User
from app.services import dds as dds_svc
from app.services import domain
from app.services import plots as plot_svc
from app.services import shipments as shipment_svc
from app.services import suppliers as supplier_svc
from app.services.audit import GENESIS, compute_hash
from app.services.auth import AVATAR_COLORS, DEFAULT_ORG_SETTINGS
from app.workflows.types import campaign_workflow_id

log = structlog.get_logger(__name__)

DEMO_PASSWORD = "Northbank-Demo-2026"  # noqa: S105 - published demo credential (synthetic users)
ORG_SLUG = "northbank"

USERS = [
    ("amelie.kraus@northbank.example", "Amelie Kraus", "owner"),
    ("jonas.weber@northbank.example", "Jonas Weber", "compliance_manager"),
    ("lea.hoffmann@northbank.example", "Lea Hoffmann", "sourcing"),
    ("tobias.brandt@northbank.example", "Tobias Brandt", "reviewer"),
    ("ines.vogel@auditpartners.example", "Ines Vogel", "auditor"),
    ("kouame.yao@coopnawa.example", "Kouamé Yao", "supplier"),
]
SUPPLIER_USER_KEY = "coop-nawa"

SUPPLIERS = [
    (
        "coop-nawa",
        "Coopérative Agricole de Nawa",
        "CI",
        ["cocoa"],
        "cooperative",
        "evidence@coopnawa.example",
    ),
    (
        "cavally-cocoa",
        "Cavally Cocoa Exporters SARL",
        "CI",
        ["cocoa"],
        "exporter",
        "compliance@cavallycocoa.example",
    ),
    (
        "wn-cocoa-union",
        "Western North Cocoa Farmers Union",
        "GH",
        ["cocoa"],
        "cooperative",
        "office@wncfu.example",
    ),
    (
        "sul-minas-cafe",
        "Cooperativa Cafés do Sul de Minas",
        "BR",
        ["coffee"],
        "cooperative",
        "rastreabilidade@sulminas.example",
    ),
    (
        "rondonia-robusta",
        "Robusta Rondônia Comércio Ltda",
        "BR",
        ["coffee"],
        "exporter",
        "export@rondonia.example",
    ),
    (
        "gayo-highland",
        "Gayo Highland Coffee Cooperative",
        "ID",
        ["coffee"],
        "cooperative",
        "admin@gayohighland.example",
    ),
    (
        "sulawesi-kakao",
        "Koperasi Kakao Sulawesi",
        "ID",
        ["cocoa"],
        "cooperative",
        "info@kakaosulawesi.example",
    ),
    (
        "san-martin-coop",
        "Cooperativa Agraria San Martín",
        "PE",
        ["coffee", "cocoa"],
        "cooperative",
        "calidad@sanmartin.example",
    ),
    ("ucayali-cacao", "Cacao Ucayali SAC", "PE", ["cocoa"], "exporter", "ventas@cacaoucayali.example"),
]

CAMPAIGN_NAME = "Q1 2027 harvest evidence"
CAMPAIGN_STAGES = {
    "rondonia-robusta": "approved",
    "gayo-highland": "awaiting_review",
    "ucayali-cacao": "requested",
    "san-martin-coop": "reminded",
}


@dataclass
class Seeded:
    org: Organization
    users: dict[str, User]
    suppliers: dict[str, Supplier]
    plots: dict[str, Plot]


def _ctx(org: Organization, user: User, role: str) -> RequestContext:
    return RequestContext(
        user=user,
        org=org,
        membership=None,
        role=role,
        request_id=None,
        ip=None,
        user_agent="plotline-seed",
        permissions=set(permissions_for(role)),
    )


async def already_seeded(db: AsyncSession) -> bool:
    return (
        await db.execute(select(Organization.id).where(Organization.slug == ORG_SLUG))
    ).first() is not None


async def seed_demo(db: AsyncSession) -> Seeded:
    org = Organization(
        name="Northbank Cocoa & Coffee Imports GmbH",
        slug=ORG_SLUG,
        eori="DE4471902385516",
        address="Am Sandtorkai 52, 20457 Hamburg",
        country="DE",
        operator_size="large",
        settings=dict(DEFAULT_ORG_SETTINGS),
    )
    db.add(org)
    await db.flush()

    pw_hash = hash_password(DEMO_PASSWORD)
    users: dict[str, User] = {}
    for i, (email, name, role) in enumerate(USERS):
        u = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if u is None:
            u = User(
                email=email,
                full_name=name,
                password_hash=pw_hash,
                avatar_color=AVATAR_COLORS[i % len(AVATAR_COLORS)],
                preferences={"lastOrgId": str(org.id)},
            )
            db.add(u)
            await db.flush()
        users[role] = u

    suppliers: dict[str, Supplier] = {}
    for key, name, country, commodities, kind, email in SUPPLIERS:
        s = Supplier(
            org_id=org.id,
            name=name,
            country=country,
            commodities=commodities,
            kind=kind,
            contact_email=email,
            status="invited" if key == "ucayali-cacao" else "active",
            external_key=key,
        )
        db.add(s)
        suppliers[key] = s
    await db.flush()

    for _email, _name, role in USERS:
        db.add(
            Membership(
                org_id=org.id,
                user_id=users[role].id,
                role=role,
                supplier_id=suppliers[SUPPLIER_USER_KEY].id if role == "supplier" else None,
            )
        )
    await db.flush()

    sourcing = _ctx(org, users["sourcing"], "sourcing")
    manager = _ctx(org, users["compliance_manager"], "compliance_manager")

    # ── Plots (bundled synthetic evidence) ──
    plots: dict[str, Plot] = {}
    for dp in domain.demo_plots():
        supplier = suppliers[dp.supplier_key]
        plot = await plot_svc.create_plot(
            db,
            org,
            supplier,
            reference=dp.reference,
            commodity=dp.commodity,
            country=dp.country,
            geometry=dp.geometry,
            declared_area_ha=dp.declared_area_ha,
            producer_name=getattr(dp, "producer_name", None),
            created_via="seed",
            ctx=sourcing,
            assess=getattr(dp, "assess_on_seed", dp.scenario != "unassessed"),
        )
        plots[dp.reference] = plot
        supplier.last_submission_at = utcnow() - timedelta(days=12)

    # ── Products and shipments ──
    cocoa = Product(
        org_id=org.id,
        name="Cocoa beans, whole, raw",
        commodity="cocoa",
        hs_code="1801",
        description="Fermented and dried cocoa beans for grinding.",
    )
    coffee = Product(
        org_id=org.id,
        name="Green coffee, not roasted",
        commodity="coffee",
        hs_code="0901 11",
        description="Washed and natural green coffee for roasters.",
    )
    db.add_all([cocoa, coffee])
    await db.flush()
    await _seed_shipments(db, org, manager, plots, cocoa, coffee)

    # ── Supplier campaign ──
    await _seed_campaign(db, org, users, suppliers)
    await db.flush()
    await _spread_history(db, org)
    log.info("demo_seeded", plots=len(plots), suppliers=len(suppliers))
    return Seeded(org=org, users=users, suppliers=suppliers, plots=plots)


def _pick(
    plots: dict[str, Plot], commodity: str, verdict: str, used: set[str], countries: tuple[str, ...] = ()
) -> Plot:
    """Next unused plot with this commodity and verdict, preferring the given countries."""
    try:
        return _pick_strict(plots, commodity, verdict, used, countries)
    except LookupError:
        if not countries:
            raise
        return _pick_strict(plots, commodity, verdict, used, ())


def _pick_strict(
    plots: dict[str, Plot], commodity: str, verdict: str, used: set[str], countries: tuple[str, ...]
) -> Plot:
    for ref in sorted(plots):
        p = plots[ref]
        if ref in used or p.commodity != commodity or p.verdict != verdict:
            continue
        if countries and p.country not in countries:
            continue
        used.add(ref)
        return p
    raise LookupError(f"no {verdict} {commodity} plot left for the demo shipments")


def _qty(p: Plot, share: float) -> float:
    return max(100.0, round(domain.plot_capacity_kg(p.commodity, p.area_ha) * share / 100) * 100)


async def _shipment(
    db: AsyncSession,
    ctx: RequestContext,
    reference: str,
    product: Product,
    allocations: list[tuple[Plot, float]],
    total: float | None = None,
) -> Shipment:
    data: dict[str, Any] = {
        "reference": reference,
        "product_id": product.id,
        "quantity_kg": total if total is not None else sum(q for _p, q in allocations),
        "harvest_year": 2026,
        "allocations": [{"plot_id": p.id, "quantity_kg": q} for p, q in allocations],
    }
    return await shipment_svc.create_shipment(db, ctx, data)


async def _seed_shipments(
    db: AsyncSession,
    org: Organization,
    ctx: RequestContext,
    plots: dict[str, Plot],
    cocoa: Product,
    coffee: Product,
) -> None:
    used: set[str] = set()
    c1, c2 = (
        _pick(plots, "cocoa", "compliant", used, ("CI",)),
        _pick(plots, "cocoa", "compliant", used, ("CI",)),
    )
    submitted = await _shipment(db, ctx, "NB-2026-001", cocoa, [(c1, _qty(c1, 0.6)), (c2, _qty(c2, 0.6))])
    g1, g2 = (
        _pick(plots, "cocoa", "compliant", used, ("GH",)),
        _pick(plots, "cocoa", "compliant", used, ("GH",)),
    )
    await _shipment(db, ctx, "NB-2026-002", cocoa, [(g1, _qty(g1, 0.5)), (g2, _qty(g2, 0.5))])
    b1 = _pick(plots, "coffee", "compliant", used, ("BR",))
    b2 = _pick(plots, "coffee", "compliant", used, ("BR",))
    await _shipment(db, ctx, "NB-2026-003", coffee, [(b1, _qty(b1, 0.55)), (b2, _qty(b2, 0.55))])
    i1 = _pick(plots, "coffee", "compliant", used, ("ID", "PE"))
    await _shipment(db, ctx, "NB-2026-004", coffee, [(i1, _qty(i1, 0.6))])
    s1 = _pick(plots, "cocoa", "compliant", used, ("ID", "PE", "CI", "GH"))
    await _shipment(db, ctx, "NB-2026-005", cocoa, [(s1, _qty(s1, 0.5))])
    # Blocked: a plot with forest cleared after 2020.
    nc = _pick(plots, "cocoa", "non_compliant", used)
    ok = _pick(plots, "cocoa", "compliant", used)
    await _shipment(db, ctx, "NB-2026-006", cocoa, [(ok, _qty(ok, 0.4)), (nc, _qty(nc, 0.4))])
    # Blocked: more coffee claimed than the plot can grow.
    over = _pick(plots, "coffee", "compliant", used)
    await _shipment(db, ctx, "NB-2026-007", coffee, [(over, _qty(over, 1.6))])
    # Blocked: an unreviewed plot mixed with verified product.
    rv = _pick(plots, "cocoa", "needs_review", used)
    ok2 = _pick(plots, "cocoa", "compliant", used)
    await _shipment(db, ctx, "NB-2026-008", cocoa, [(ok2, _qty(ok2, 0.5)), (rv, _qty(rv, 0.5))])

    d = await dds_svc.create_from_shipment(db, ctx, org, submitted, cocoa)
    await dds_svc.submit(db, ctx, org, d, submitted)


async def _seed_campaign(
    db: AsyncSession, org: Organization, users: dict[str, User], suppliers: dict[str, Supplier]
) -> None:
    started = utcnow() - timedelta(days=16)
    cid = uuid.uuid4()
    campaign = Campaign(
        id=cid,
        org_id=org.id,
        name=CAMPAIGN_NAME,
        commodity="coffee",
        status="running",
        due_date=date.today() + timedelta(days=24),
        reminder_every_days=7,
        workflow_id=campaign_workflow_id(str(cid)),
        created_by=users["compliance_manager"].id,
        created_at=started,
    )
    db.add(campaign)
    await db.flush()
    db.add(
        CampaignEvent(
            org_id=org.id,
            campaign_id=cid,
            at=started,
            kind="started",
            message=f"Campaign started with {len(CAMPAIGN_STAGES)} suppliers, due "
            f"{human_date(campaign.due_date)}.",
        )
    )
    for key, stage in CAMPAIGN_STAGES.items():
        s = suppliers[key]
        supplier_svc.issue_portal_link(s)
        m = CampaignMember(
            org_id=org.id, campaign_id=cid, supplier_id=s.id, stage=stage, last_event_at=started
        )
        db.add(m)
        events = [
            (
                started,
                "requested",
                f"Evidence requested from {s.name}: plot locations due {human_date(campaign.due_date)}.",
            )
        ]
        if stage == "reminded":
            m.reminders_sent = 1
            events.append(
                (started + timedelta(days=7), "reminded", f"Reminder 1 to {s.name} sent automatically.")
            )
        if stage in ("awaiting_review", "approved"):
            m.submitted_at = started + timedelta(days=5)
            events += [
                (started + timedelta(days=5), "submitted", f"{s.name} submitted their plots."),
                (
                    started + timedelta(days=5, minutes=2),
                    "awaiting_review",
                    f"{s.name}'s plots checked against forest records and handed to a reviewer.",
                ),
            ]
        if stage == "approved":
            m.decided_at = started + timedelta(days=8)
            m.decision_note = "Plots and volumes consistent with last season."
            events.append(
                (
                    started + timedelta(days=8),
                    "approved",
                    f"Evidence from {s.name} approved by {users['reviewer'].full_name}.",
                )
            )
        for at, kind, message in events:
            db.add(
                CampaignEvent(
                    org_id=org.id, campaign_id=cid, supplier_id=s.id, at=at, kind=kind, message=message
                )
            )
        m.last_event_at = events[-1][0]
    await db.flush()


# Seeded history is spread over working hours of the past weeks, so the demo reads like an organisation that
# has been onboarding suppliers since early autumn rather than one created a minute ago.
HISTORY_DAYS = 34
_WORKDAY_MIN = 9 * 60


def _history_times(n: int, now: datetime) -> list[datetime]:
    start = (now - timedelta(days=HISTORY_DAYS)).replace(hour=8, minute=30, second=0, microsecond=0)
    total = (HISTORY_DAYS - 2) * _WORKDAY_MIN
    out = []
    for i in range(n):
        pos = int(total * i / max(n - 1, 1))
        out.append(start + timedelta(days=pos // _WORKDAY_MIN, minutes=pos % _WORKDAY_MIN))
    return out


async def _spread_history(db: AsyncSession, org: Organization) -> None:
    """Backdate the seeded records and re-link the audit chain in the same order (it still verifies)."""
    rows = list(
        (await db.execute(select(AuditLog).where(AuditLog.org_id == org.id).order_by(AuditLog.id))).scalars()
    )
    if not rows:
        return
    now = utcnow()
    times = _history_times(len(rows), now)
    plots = {str(p.id): p for p in (await db.execute(select(Plot).where(Plot.org_id == org.id))).scalars()}
    org_assessments = await db.execute(select(Assessment).where(Assessment.org_id == org.id))
    assessments = {a.plot_id: a for a in org_assessments.scalars()}
    by_type: dict[str, Any] = {"shipment": Shipment, "supplier": Supplier, "product": Product, "dds": Dds}
    prev = GENESIS
    last: AuditLog | None = None
    for row, at in zip(rows, times, strict=True):
        if row.action == "plot.assessed" and last is not None and last.resource_id == row.resource_id:
            at = last.created_at + timedelta(minutes=2)  # checked straight after it was mapped
        row.created_at = at
        last = row
        rid = row.resource_id
        if row.action == "plot.created" and rid in plots:
            plots[rid].created_at = plots[rid].updated_at = at
        elif row.action == "plot.assessed" and rid in plots:
            p = plots[rid]
            a = assessments.get(p.id)
            if a is not None:
                a.created_at = at
            p.assessed_at = p.updated_at = at
        elif row.action.endswith(".created") and row.resource_type in by_type and rid:
            obj = await db.get(by_type[row.resource_type], uuid.UUID(rid))
            if obj is not None:
                obj.created_at = obj.updated_at = at
        elif row.action == "dds.submitted" and rid:
            d = await db.get(Dds, uuid.UUID(rid))
            if d is not None:
                d.submitted_at = d.updated_at = at
                subs = await db.execute(select(DdsSubmission).where(DdsSubmission.dds_id == d.id))
                for sub in subs.scalars():
                    sub.at = at
                shipment = await db.get(Shipment, d.shipment_id)
                if shipment is not None:
                    shipment.updated_at = at
        row.prev_hash = prev
        row.hash = compute_hash(prev, row)
        prev = row.hash
    latest: dict[uuid.UUID, datetime] = {}
    for p in plots.values():
        latest[p.supplier_id] = max(latest.get(p.supplier_id, p.created_at), p.created_at)
    for sid, at in latest.items():
        s = await db.get(Supplier, sid)
        if s is not None and s.last_submission_at is not None:
            s.last_submission_at = at + timedelta(hours=2)
    joined = times[0] - timedelta(days=21)
    org.created_at = joined
    for m in (await db.execute(select(Membership).where(Membership.org_id == org.id))).scalars():
        m.created_at = joined
    await db.flush()
