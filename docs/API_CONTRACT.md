# Plotline API contract (v1)

The reference for Plotline's module boundaries. Part 1 is the HTTP API (the web app builds against it; the
backend implements it). Part 2 is the data model, Part 3 the Python interfaces between the backend platform and
the domain core, Part 4 module boundaries and conventions, Part 5 the demo seed.

# Part 1 — HTTP API

Base path `/api/v1`. JSON is **camelCase** on the wire. Errors are RFC 7807 `application/problem+json`:
`{ type, title, status, detail?, code?, errors?: [{ field, message }], requestId? }`.

Browser auth uses httpOnly cookies (`pl_at` access, `pl_rt` refresh scoped to `/api/v1/auth`) plus a readable
`pl_csrf` cookie that must be echoed in the `X-CSRF-Token` header on every unsafe method (POST/PUT/PATCH/DELETE).
On `401` with `code: "token_expired"` the client calls `POST /auth/refresh` once and retries.
The web app proxies `/api/v1/*` to the API (same origin), so cookies just work.

Ids are UUID strings. Timestamps are ISO-8601 UTC. Areas are hectares (`ha`), weights kilograms (`kg`).

## Enumerations
| Name | Values |
|---|---|
| Role | `owner`, `compliance_manager`, `sourcing`, `reviewer`, `supplier`, `auditor` |
| Commodity | `cocoa`, `coffee`, `soy`, `oil_palm`, `cattle`, `rubber`, `wood` |
| Verdict | `compliant`, `needs_review`, `non_compliant`, `pending` (not yet assessed / evidence missing) |
| RiskTier | `low`, `standard`, `high` |
| GeometryKind | `point`, `polygon` |
| ShipmentStatus | `draft`, `blocked`, `ready`, `submitted` |
| DdsStatus | `draft`, `submitted`, `accepted`, `rejected` |
| CampaignStatus | `running`, `completed`, `cancelled` |
| CampaignStage (per supplier) | `requested`, `reminded`, `submitted`, `assessing`, `awaiting_review`, `changes_requested`, `approved`, `overdue` |
| ReviewDecision | `confirm_compliant`, `confirm_non_compliant`, `request_information` |

Permissions (returned by `/auth/me` as `membership.permissions`):
`dashboard:read, suppliers:read, suppliers:write, plots:read, plots:write, plots:review, shipments:read, shipments:write, dds:read, dds:write, dds:submit, campaigns:read, campaigns:write, campaigns:approve, audit:read, org:admin`.

## Auth & account
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/signup` | `{ email, password, fullName, orgName? }` | `201 { user, activeOrgId }` (creates org + owner membership when `orgName`) |
| POST | `/auth/login` | `{ email, password }` | `{ user, orgs: OrgSummary[], activeOrgId }` |
| POST | `/auth/logout` | – | `204` |
| POST | `/auth/refresh` | – | `{ ok: true }` |
| GET | `/auth/me` | – | `Me` |
| POST | `/auth/switch-org` | `{ orgId }` | `Me` |

`User = { id, email, fullName, avatarColor, createdAt }`
`OrgSummary = { id, name, slug, role }`
`Me = { user, activeOrg: Org | null, membership: { role, roleLabel, permissions: string[], supplierId: string | null } | null, orgs: OrgSummary[] }`

## Organisation, members, invitations (`org:admin` to change)
| Method | Path | Notes |
|---|---|---|
| GET | `/org` | `Org` |
| PATCH | `/org` | partial `{ name, eori, address, country, operatorSize, settings }` |
| GET | `/org/members` | `Member[]` = `{ id, userId, fullName, email, role, roleLabel, status, joinedAt }` |
| PATCH | `/org/members/{id}` | `{ role }` |
| DELETE | `/org/members/{id}` | `204` |
| GET | `/org/invitations` | `Invitation[]` = `{ id, email, role, expiresAt, acceptedAt, createdAt }` |
| POST | `/org/invitations` | `{ email, role }` → `{ invitation, inviteUrl }` (url shown once; no email is sent offline) |
| DELETE | `/org/invitations/{id}` | revoke |
| GET | `/invitations/{token}` | public preview `{ orgName, email, role, roleLabel, expiresAt }` |
| POST | `/invitations/{token}/accept` | `{ fullName, password }` (new user) or `{}` when signed in → `Me` + session cookies |

`Org = { id, name, slug, eori, address, country, operatorSize: "large"|"sme", settings: { retentionYears, reviewAllHighRisk, autoAssess }, deadline: { date, daysLeft }, createdAt }`

## Dashboard
`GET /dashboard` →
```json
{
  "deadline": { "date": "2026-12-30", "daysLeft": 46, "operatorSize": "large" },
  "kpis": { "suppliers": 9, "suppliersReady": 5, "plots": 26, "plotsCompliant": 15, "plotsNeedsReview": 5,
            "plotsNonCompliant": 3, "plotsPending": 3, "areaHa": 412.5, "deforestedHa": 18.2,
            "shipments": 8, "shipmentsReady": 4, "shipmentsBlocked": 3, "shipmentsSubmitted": 1,
            "readinessPct": 58 },
  "byCommodity": [{ "key": "cocoa", "label": "Cocoa", "plots": 12, "compliant": 8, "needsReview": 2, "nonCompliant": 1, "pending": 1, "readinessPct": 67 }],
  "byCountry":   [{ "key": "CI", "label": "Côte d'Ivoire", "riskTier": "standard", "plots": 8, "compliant": 5, "needsReview": 2, "nonCompliant": 1, "pending": 0, "readinessPct": 63 }],
  "bySupplier":  [{ "id": "…", "name": "…", "country": "GH", "plots": 4, "compliant": 3, "needsReview": 1, "nonCompliant": 0, "pending": 0, "readinessPct": 75 }],
  "plotsAtRisk": [{ "id": "…", "reference": "CI-NAW-0007", "supplierName": "…", "commodity": "cocoa", "country": "CI", "verdict": "non_compliant", "headline": "2.4 ha of forest cleared in 2022", "areaHa": 6.1 }],
  "insights": [{ "id": "…", "tone": "warning"|"positive"|"info", "title": "…", "body": "…", "href": "/app/…" }],
  "recentActivity": [{ "id": 1, "action": "plot.assessed", "label": "Plot CI-NAW-0007 assessed", "actorName": "…", "createdAt": "…" }]
}
```

## Suppliers
| Method | Path | Notes |
|---|---|---|
| GET | `/suppliers?q=&country=&commodity=` | `SupplierListItem[]` |
| POST | `/suppliers` | `{ name, country, commodities: Commodity[], kind: "cooperative"|"exporter"|"farm"|"trader", contactEmail? }` |
| GET | `/suppliers/{id}` | `Supplier` = `SupplierListItem` fields + `{ contactEmail, portalExpiresAt }`, except that here `plots` is a `PlotListItem[]` (in the list endpoint it is a count) |
| PATCH | `/suppliers/{id}` | partial |
| POST | `/suppliers/{id}/portal-link` | `{ url, expiresAt }` – a fresh supplier upload link (old links stop working) |

`SupplierListItem = { id, name, country, countryName, riskTier, kind, commodities, plots, compliant, needsReview, nonCompliant, pending, readinessPct, status: "invited"|"active", lastSubmissionAt }`

## Plots
| Method | Path | Notes |
|---|---|---|
| GET | `/plots?supplierId=&verdict=&country=&commodity=&q=` | `PlotListItem[]` |
| GET | `/plots/map?…same filters` | GeoJSON `FeatureCollection`; feature `properties = { id, reference, verdict, commodity, supplierName, areaHa, kind }`; points are returned as polygons (circle of the declared area) **and** `properties.kind = "point"` |
| POST | `/plots/validate` | `{ geometry, country, declaredAreaHa? }` → `{ valid, issues: Issue[], areaHa, kind, normalized: geometry }` (no write) |
| POST | `/plots` | `{ supplierId, reference, commodity, country, geometry, declaredAreaHa?, producerName? }` → `Plot` (`422` with `errors` when invalid) |
| POST | `/plots/import` | multipart `file` (`.geojson`/`.json`, `.kml`, `.csv` with `reference,latitude,longitude[,area_ha]` or `wkt`), `supplierId`, `commodity` → `{ created: PlotListItem[], rejected: [{ reference, row, issues: Issue[] }] }` |
| GET | `/plots/{id}` | `Plot` |
| PATCH | `/plots/{id}` | `{ reference?, commodity?, declaredAreaHa? }` |
| DELETE | `/plots/{id}` | archives (kept for retention) `204` |
| POST | `/plots/{id}/assess` | runs the assessment now → `Assessment` |
| GET | `/plots/{id}/assessments` | `Assessment[]` newest first |
| GET | `/plots/{id}/imagery/{kind}.png` | `kind` = `baseline` (2020) / `current` / `forest` (2020 forest map overlay) / `loss` (loss since 2021 overlay); PNG |
| GET | `/plots/{id}/similar?k=6` | `[{ plot: PlotListItem, similarity: 0..1 }]` |
| POST | `/plots/{id}/review` | `{ decision: ReviewDecision, note }` (`plots:review`) → `Assessment` |
| GET | `/reviews` | review queue `PlotListItem[]` (plots whose latest assessment needs a reviewer) |

`Issue = { code, severity: "error"|"warning", message, field? }`
`PlotListItem = { id, reference, supplierId, supplierName, commodity, country, countryName, riskTier, kind, areaHa, verdict, headline, changeLevel: "low"|"elevated"|"high"|null, reviewRequired, assessedAt, centroid: [lon, lat] }`
`Plot = PlotListItem & { geometry, declaredAreaHa, producerName, h3Cell, validation: { valid, issues: Issue[] }, latestAssessment: Assessment | null, createdAt, shipments: [{ id, reference, quantityKg }] }`

```text
Assessment = {
  id, plotId, verdict, headline, createdAt, source: "bundled"|"live",
  reasons: [{ code, severity: "info"|"warning"|"critical", message }],
  forest2020Ha, forest2020Share, lossAfter2020Ha, lossByYear: { "2022": 1.2 },
  treeCover2000Pct, cloudFreeShare,
  changeScore,            // 0..1 land-change signal; null when imagery is too cloudy
  changeLevel,            // "low" | "elevated" | "high" | null
  signalsAgree,           // official forest data and the land-change signal agree
  reviewRequired, review: { decision, note, reviewerName, reviewedAt } | null,
  datasets: { forest2020, forestLoss, imagery, changeModel, rules },   // dataset versions used
  inputsHash, resultHash
}
```

## Products & shipments
| Method | Path | Notes |
|---|---|---|
| GET | `/products` | `[{ id, name, commodity, hsCode, description }]` |
| POST | `/products` | `{ name, commodity, hsCode, description }` |
| GET | `/shipments?status=` | `ShipmentListItem[]` |
| POST | `/shipments` | `{ reference, productId, quantityKg, harvestYear, allocations: [{ plotId, quantityKg }] }` |
| GET | `/shipments/{id}` | `Shipment` |
| PATCH | `/shipments/{id}` | `{ quantityKg?, harvestYear?, allocations? }` (not when `submitted`) |
| GET | `/shipments/{id}/trace` | `{ nodes: [{ id, type: "product"|"shipment"|"supplier"|"plot", label, verdict? }], edges: [{ source, target, quantityKg? }] }` |

`ShipmentListItem = { id, reference, productName, commodity, hsCode, quantityKg, harvestYear, status, suppliers: number, plots: number, issues: number, riskTier, ddsId, ddsStatus, updatedAt }`
`Shipment = ShipmentListItem & { allocations: [{ plotId, reference, supplierName, country, verdict, quantityKg, areaHa }], checks: Check[], massBalance: [{ plotId, reference, allocatedKg, capacityKg, utilisationPct, ok }], mixing: { mixed: boolean, verifiedKg, unverifiedKg }, countries: [{ code, name, riskTier }] }`
`Check = { code, status: "pass"|"warn"|"fail", label, detail }`

## Due diligence statements
| Method | Path | Notes |
|---|---|---|
| GET | `/dds` | `DdsListItem[]` = `{ id, internalRef, shipmentId, shipmentReference, status, referenceNumber, verificationNumber, createdAt, submittedAt }` |
| POST | `/shipments/{id}/dds` | create a draft from a `ready` shipment → `Dds` (`409` when the shipment is not ready) |
| GET | `/dds/{id}` | `Dds = DdsListItem & { payload, summary, submissions: [{ id, at, status, message, referenceNumber }] }` |
| POST | `/dds/{id}/submit` | `dds:submit` → `Dds` (EU information system submission is simulated offline) |
| GET | `/dds/{id}/payload.json` | download, `Content-Disposition: attachment` |
| GET | `/dds/{id}/evidence.html` | printable evidence pack |
| GET | `/dds/{id}/evidence.pdf` | PDF evidence pack |

## Supplier campaigns (durable workflows)
| Method | Path | Notes |
|---|---|---|
| GET | `/campaigns` | `CampaignListItem[]` = `{ id, name, commodity, status, dueDate, suppliers, approved, awaitingReview, overdue, progressPct, createdAt }` |
| POST | `/campaigns` | `{ name, commodity, supplierIds, dueDate, reminderEveryDays }` → `Campaign` |
| GET | `/campaigns/{id}` | `Campaign = CampaignListItem & { engineOnline: boolean, reminderEveryDays, members: [{ supplierId, supplierName, country, stage, remindersSent, plotsSubmitted, verdictSummary: { compliant, needsReview, nonCompliant }, lastEventAt, portalUrl }], timeline: [{ at, supplierName, kind, message }] }` |
| POST | `/campaigns/{id}/suppliers/{supplierId}/decision` | `{ approve: boolean, note }` (`campaigns:approve`) |
| POST | `/campaigns/{id}/suppliers/{supplierId}/remind` | send a reminder now |
| POST | `/campaigns/{id}/cancel` | |
| GET | `/campaigns/{id}/events` | SSE: events `campaign.updated` `{ campaignId, supplierId, stage }`, `heartbeat` |

## Supplier portal (public, token in URL; no account)
| Method | Path | Notes |
|---|---|---|
| GET | `/portal/{token}` | `{ orgName, supplierName, country, commodities, dueDate, campaignName, status: "open"\|"submitted", plots: PlotListItem[], submittedAt }` (`410 link_expired` when expired/revoked) |
| POST | `/portal/{token}/plots/validate` | as `/plots/validate` |
| POST | `/portal/{token}/plots` | `{ reference, commodity, geometry, declaredAreaHa? }` → `PlotListItem` |
| POST | `/portal/{token}/plots/import` | multipart `file`, `commodity` |
| DELETE | `/portal/{token}/plots/{plotId}` | only before submission |
| POST | `/portal/{token}/submit` | marks the submission complete; the campaign continues automatically |

## Reference data, audit, notifications
| Method | Path | Notes |
|---|---|---|
| GET | `/countries` | `[{ code, name, riskTier, commodities: string[] }]` (EU country benchmarking) |
| GET | `/audit?limit=&before=&action=` | `{ items: [{ id, action, label, actorName, resourceType, resourceId, metadata, createdAt }], nextBefore }` (`audit:read`) |
| GET | `/audit/verify` | `{ valid, checked, brokenAt }` |
| GET | `/notifications` | `[{ id, type, title, body, link, readAt, createdAt }]` |
| POST | `/notifications/read-all` | `204` |
| GET | `/health`, `/health/ready`, `/metrics` | root level, no prefix |

## Response conventions (all endpoints)
- List endpoints return a bare JSON array unless the table above shows an object (only `/audit` paginates).
- `401` → not signed in / expired (`code`: `unauthorized`, `token_expired`, `session_revoked`); `403` → `forbidden` (missing permission) or `csrf_failed`; `404` → `not_found` (also for other tenants' ids — never leak existence); `409` → state conflicts (`shipment_not_ready`, `dds_already_submitted`, `campaign_closed`, `portal_submitted`); `422` → `validation_error` / `geometry_invalid` with `errors[]`; `429` → `rate_limited` with `Retry-After`; `503` → `engine_unavailable` (campaign action while the workflow server is down; reads still work).
- Every response carries `X-Request-ID`. API responses are `Cache-Control: no-store` except imagery PNGs (`private, max-age=3600`). SSE responses send `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`.
- Portal endpoints are public but rate-limited per IP and per token; tokens are 32+ random bytes, stored only as HMAC hashes, expire after `PORTAL_LINK_TTL_DAYS` (30) and are revoked when a new link is created.

# Part 2 — Data model (SQLAlchemy 2, SQLite by default, Postgres-ready)

All tenant tables carry `org_id` (indexed) and every query filters on it. UUID primary keys unless noted.
Timestamps are timezone-aware UTC. JSON columns use the portable `JSONType`.

| Table | Key columns |
|---|---|
| `organizations` | name, slug, eori, address, country, operator_size (`large`/`sme`), settings JSON |
| `users` | email (unique), full_name, password_hash (argon2id), is_active, avatar_color, last_login_at |
| `memberships` | org_id, user_id, role, supplier_id (nullable; set for `supplier` role), status |
| `invitations` | org_id, email, role, token_hash, invited_by, expires_at, accepted_at, revoked_at |
| `sessions` | user_id, refresh_token_hash, active_org_id, expires_at, revoked_at (refresh rotation + reuse detection) |
| `audit_log` | int id, org_id, actor_id, actor_type, action, resource_type, resource_id, ip, user_agent, metadata JSON, prev_hash, hash (per-org SHA-256 chain) |
| `notifications` | org_id, user_id, type, title, body, link, read_at |
| `suppliers` | org_id, name, country (ISO-2), kind, commodities JSON, contact_email, status (`invited`/`active`), portal_token_hash, portal_expires_at, last_submission_at |
| `plots` | org_id, supplier_id, reference (unique per org), commodity, country, kind (`point`/`polygon`), geometry JSON (GeoJSON, WGS84, 6 dp), area_ha, declared_area_ha, centroid_lon, centroid_lat, h3_cell (res 9), h3_parent (res 5), producer_name (nullable, minimised), validation JSON, latest_assessment_id, embedding JSON (list[float], nullable), status (`active`/`archived`), created_via (`app`/`portal`/`import`/`seed`) |
| `assessments` | org_id, plot_id, verdict, headline, reasons JSON, metrics JSON (forest2020Ha, forest2020Share, lossAfter2020Ha, lossByYear, treeCover2000Pct, cloudFreeShare, changeScore, changeLevel, signalsAgree), review_required, review JSON, datasets JSON, inputs_hash, result_hash, source, created_by, created_at (append-only; never updated except `review`) |
| `products` | org_id, name, commodity, hs_code, description |
| `shipments` | org_id, reference (unique per org), product_id, quantity_kg, harvest_year, status, checks JSON (last evaluation), updated_at |
| `shipment_allocations` | org_id, shipment_id, plot_id, quantity_kg |
| `dds` | org_id, shipment_id, internal_ref, status, payload JSON, summary text, reference_number, verification_number, payload_hash, created_by, submitted_at |
| `dds_submissions` | org_id, dds_id, at, status, message, reference_number (append-only log) |
| `campaigns` | org_id, name, commodity, status, due_date, reminder_every_days, workflow_id, created_by |
| `campaign_members` | org_id, campaign_id, supplier_id, stage, reminders_sent, submitted_at, decided_at, decision_note, last_event_at |
| `campaign_events` | org_id, campaign_id, supplier_id, at, kind, message (timeline; written by workflow activities) |

Retention: plots, assessments, shipments, DDS and audit rows are never hard-deleted (archive only) for at
least `EVIDENCE_RETENTION_YEARS` (5), per EUDR Art. 12.

# Part 3 — Python interfaces between the platform/API and the domain core

Domain-core modules are plain Python (no FastAPI, no SQLAlchemy sessions, no global state besides read-only
loaded data), deterministic, and fully offline in `EO_SOURCE=bundled`. The platform calls them from services,
routers and Temporal activities through the signatures below.

```python
# app/spatial/validate.py
@dataclass
class Issue: code: str; severity: Literal["error", "warning"]; message: str; field: str | None = None
@dataclass
class ValidationResult:
    valid: bool                     # no "error" issues
    issues: list[Issue]
    kind: Literal["point", "polygon"] | None
    area_ha: float | None           # geodesic area (polygon) or declared/assumed area (point)
    normalized: dict | None         # GeoJSON geometry, WGS84, coordinates rounded to 6 decimals, closed rings, CCW
    centroid: tuple[float, float] | None   # (lon, lat)
    h3_cell: str | None             # H3 res 9 of the centroid
    country_detected: str | None    # ISO-2 containing the centroid (bundled boundaries)
def validate_geometry(geometry: dict, country: str, declared_area_ha: float | None = None) -> ValidationResult
# Rules: WGS84 lon/lat ranges; >= 6 decimal places of precision required (warning if fewer); Point allowed only
# when area <= 4 ha (declared_area_ha required for points, else error "point_needs_area"; > 4 ha -> error
# "polygon_required"); Polygon/MultiPolygon: closed, >= 4 positions, no self-intersection ("self_intersection"),
# no holes larger than the shell, area > 0; country plausibility ("country_mismatch" error when the centroid
# is outside the declared country, with 1 km tolerance); implausibly large plot (> 10,000 ha) error.

# app/spatial/parsers.py
@dataclass
class ParsedPlot: row: int; reference: str | None; geometry: dict | None; declared_area_ha: float | None; issues: list[Issue]
def parse_upload(filename: str, content: bytes) -> list[ParsedPlot]   # .geojson/.json, .kml, .csv (reference,latitude,longitude[,area_ha] or reference,wkt[,area_ha])

# app/spatial/overlaps.py   (DuckDB spatial; Shapely fallback if the extension cannot load)
def find_overlaps(geometry: dict, others: list[tuple[str, dict]], min_overlap_ha: float = 0.01) -> list[tuple[str, float]]
#   -> [(other_plot_id, overlap_ha)]; the plots service pre-filters `others` by shared H3 res-5 parent.
def plots_in_bbox(...)  # optional helper

# app/spatial/countries.py
def country_at(lon: float, lat: float) -> str | None
def country_name(code: str) -> str

# app/rules/risk.py      (static EU benchmarking table; Implementing Regulation (EU) 2025/1093)
def risk_tier(country: str) -> Literal["low", "standard", "high"]
def list_countries() -> list[dict]   # [{code, name, riskTier, commodities}]

# app/rules/massbalance.py
def plot_capacity_kg(commodity: str, area_ha: float) -> float      # plausible max yield per harvest year
def check_shipment(allocations: list[AllocationIn], shipment_qty_kg: float, harvest_year: int) -> ShipmentEvaluation
#   AllocationIn(plot_id, reference, commodity, area_ha, verdict, quantity_kg, other_allocated_kg_same_year, country)
#   ShipmentEvaluation(status: "blocked"|"ready", checks: list[Check], mass_balance: list[dict], mixing: dict)
#   Check codes: allocations_present, quantities_match, mass_balance, plots_assessed, no_non_compliant,
#   reviews_complete, mixing, geometry_valid, high_risk_review.

# app/assessment/engine.py
@dataclass
class PlotInput: id: str; reference: str; geometry: dict; commodity: str; country: str; area_ha: float
@dataclass
class AssessmentResult:            # field names mirror the API `Assessment` (snake_case here)
    verdict: Literal["compliant", "needs_review", "non_compliant", "pending"]
    headline: str
    reasons: list[dict]            # {code, severity: info|warning|critical, message}
    metrics: dict                  # forest2020Ha, forest2020Share, lossAfter2020Ha, lossByYear, treeCover2000Pct,
                                   # cloudFreeShare, changeScore, changeLevel, signalsAgree
    review_required: bool
    datasets: dict                 # {forest2020, forestLoss, imagery, changeModel, rules} version strings
    inputs_hash: str               # sha256(canonical geometry + commodity + dataset versions)
    result_hash: str               # sha256(canonical verdict + reasons + metrics)
    source: Literal["bundled", "live"]
    embedding: list[float] | None  # current-epoch embedding for similar-plot search
def assess_plot(plot: PlotInput) -> AssessmentResult      # same input + same dataset versions => identical result
def render_imagery(plot: PlotInput, kind: Literal["baseline", "current", "forest", "loss"]) -> bytes   # PNG
def similar_plots(target: list[float], candidates: list[tuple[str, list[float]]], k: int = 6) -> list[tuple[str, float]]
# Verdict rules (rules version "eudr-rules-2026.1"): official data decides. Forest-2020 (JRC) pixels with
# Hansen loss in 2021+ >= 0.5 ha -> non_compliant; > 0 and < 0.5 ha -> needs_review; none -> compliant.
# The land-change signal (LeJEPA encoder, ml/artifacts/encoder.npz) is a second opinion: compliant + high
# change -> needs_review (review_required); non_compliant + low change -> stays non_compliant with
# review_required (reviewer confirms). Too cloudy -> changeScore null, verdict from official data only.
# No evidence available (live mode offline) -> pending.

# app/eo/demo.py   (bundled synthetic landscape for the seeded plots; used by the demo seed)
@dataclass
class DemoPlot: reference: str; supplier_key: str; commodity: str; country: str; geometry: dict
               declared_area_ha: float | None; scenario: str   # intended outcome, for tests
DEMO_PLOTS: list[DemoPlot]   # ~26 plots across the supplier keys in Part 5

# app/ai/summary.py: plain-language evidence summaries; deterministic text when LLM_FAKE=true,
# LiteLLM (free tiers, optional `[ai]` extra) otherwise. Never used for verdicts.
```

Domain-core settings (in `app/core/config.py`): `EO_SOURCE` (`bundled`|`live`), `DATA_DIR` (raster cache
under `data/rasters/`), `CHANGE_ENCODER_PATH`, `CHANGE_EVAL_PATH` (threshold from `api_threshold`).

# Part 4 — Module boundaries and conventions

| Area | Paths |
|---|---|
| Platform, API, workflows, documents | `backend/app/main.py`, `cli.py`, `core/`, `db/`, `schemas/`, `services/`, `api/`, `workflows/` (Temporal workflows, activities, worker, client), `ai/`, `evidence/` (DDS payload, HTML/PDF evidence pack), `alembic/` |
| Spatial, Earth observation, rules, change signal | `backend/app/spatial/`, `eo/`, `ml/` (NumPy copy of `ml/plotline_ml/npencoder.py`, change score, similarity), `rules/`, `assessment/`; training and evaluation in `ml/`; gates in `eval/run.py` |
| Web app | `frontend/` |

Conventions:
- Ports: web 3010, API 8010, Temporal 7233 (UI 8233).
- Python tools run from the venvs: `backend/.venv/bin/python -m pytest|ruff|mypy|uvicorn`; ML:
  `ml/.venv/bin/python -m plotline_ml.<step>`.
- Runs offline and without accounts by default; the tiny LeJEPA encoder is the only model and runs in NumPy.
- User-facing text the API returns (headlines, reasons, insights, check labels, summaries) is plain business
  language: no engineering terms such as "model", "embedding", "pipeline", "cache" or "fallback". The second
  signal is called the "land-change signal". Tests enforce this.

# Part 5 — Demo seed (`make seed`; plot geometries and scenarios from `app/eo/demo.py`)

Org: **Northbank Cocoa & Coffee Imports GmbH** (Hamburg, DE), EORI `DE4471902385516`, operator size `large`.
Users (password for all: `Northbank-Demo-2026`; synthetic people):

| Email | Name | Role |
|---|---|---|
| `amelie.kraus@northbank.example` | Amelie Kraus | owner (demo sign-in) |
| `jonas.weber@northbank.example` | Jonas Weber | compliance_manager |
| `lea.hoffmann@northbank.example` | Lea Hoffmann | sourcing |
| `tobias.brandt@northbank.example` | Tobias Brandt | reviewer |
| `ines.vogel@auditpartners.example` | Ines Vogel | auditor |
| `kouame.yao@coopnawa.example` | Kouamé Yao | supplier (supplier_key `coop-nawa`) |

Suppliers (`supplier_key` → name, country, commodities, kind):
`coop-nawa` Coopérative Agricole de Nawa (CI, cocoa, cooperative) · `cavally-cocoa` Cavally Cocoa Exporters SARL (CI, cocoa, exporter) ·
`wn-cocoa-union` Western North Cocoa Farmers Union (GH, cocoa, cooperative) · `sul-minas-cafe` Cooperativa Cafés do Sul de Minas (BR, coffee, cooperative) ·
`rondonia-robusta` Robusta Rondônia Comércio Ltda (BR, coffee, exporter) · `gayo-highland` Gayo Highland Coffee Cooperative (ID, coffee, cooperative) ·
`sulawesi-kakao` Koperasi Kakao Sulawesi (ID, cocoa, cooperative) · `san-martin-coop` Cooperativa Agraria San Martín (PE, coffee + cocoa, cooperative) ·
`ucayali-cacao` Cacao Ucayali SAC (PE, cocoa, exporter; invited, no plots yet).

Plots: `DEMO_PLOTS` (26; mix of compliant, needs review, non-compliant; at least one point plot ≤ 4 ha, one
plot with a geometry warning). Products: cocoa beans (HS 1801), green coffee not roasted (HS 0901 11). 8
shipments: 4 ready, 3 blocked (non-compliant plot, mass-balance overrun, unreviewed plot / mixing), 1 submitted
with a DDS. One running campaign "Q1 2027 harvest evidence" over `rondonia-robusta`, `gayo-highland`,
`ucayali-cacao`, `san-martin-coop` at different stages (requested, reminded, awaiting_review, approved).
