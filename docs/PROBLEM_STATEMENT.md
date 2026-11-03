# Plotline: problem statement

## The problem
The EU Deforestation Regulation (Regulation (EU) 2023/1115, as amended by Regulation (EU) 2025/2650) bans
placing cattle, cocoa, coffee, oil palm, rubber, soya and wood (and listed products made from them) on the EU
market unless they are **deforestation-free** (produced on land not deforested after **31 December 2020**),
legally produced, and covered by a **due diligence statement (DDS)** filed in the EU information system
(TRACES). It applies from **30 December 2026** for medium and large operators and **30 June 2027** for micro
and small ones.

For each shipment the operator must hold the **geolocation of every plot** the commodity came from (a point for
plots up to 4 ha, a polygon above that, WGS84, at least six decimal places), assess and mitigate the risk that
any of those plots was deforested, account for the country's **risk tier** from the EU benchmarking, keep the
evidence for **five years**, and be able to show an authority how the conclusion was reached.

Importers sit at the end of long supply chains: cooperatives aggregate thousands of smallholders, plot data
arrives late in spreadsheets and phone screenshots, and checking each plot against satellite forest data by
hand does not scale. The practical failure modes are missing or invalid plot geometry, product from unverified
plots mixed into a verified batch, shipments whose volumes the declared plots could not have produced, and
verdicts nobody can reproduce a year later.

## Who it is for
| Role | Needs |
|---|---|
| Compliance manager (importer) | Know which shipments can be placed on the market, file DDS on time, defend every verdict |
| Sourcing / buying team | See which suppliers are ready, chase missing plot data, avoid buying blocked volume |
| Reviewer | Resolve ambiguous plots with the evidence side by side |
| Supplier / cooperative | Submit plots easily (phone, map, file), see what is missing |
| Auditor / authority | Inspect evidence, data versions and a tamper-evident activity log |
| Executive | Readiness against the deadline, exposure by commodity and country |

## What Plotline does
1. **Plot onboarding:** suppliers are invited by link (no account); they draw, tap or upload plots (GeoJSON,
   KML, CSV). Geometry is validated against EUDR rules (point ≤ 4 ha, polygon above; WGS84; 6-decimal
   precision; self-intersection; overlaps with other plots; plausibility against the declared country).
2. **Plot assessment:** forest on 31 Dec 2020 from the **EU JRC Global Forest Cover 2020** map, forest loss
   since 2021 from **Hansen Global Forest Change**, a satellite **land-change signal** from a tiny
   self-supervised encoder (LeJEPA) on Sentinel-2, before/after imagery, and a verdict (*Compliant / Needs review
   / Non-compliant*) with reasons. The verdict always rests on the official forest datasets; the land-change
   signal is a second opinion and disagreements go to a reviewer.
3. **Traceability:** products → shipments → suppliers → plots, with mass-balance checks (volume vs plausible
   plot yield) and detection of mixed verified and unverified product.
4. **Country risk tiers** from the EU benchmarking (Implementing Regulation (EU) 2025/1093).
5. **Due diligence statement:** the DDS data in the structure TRACES expects, a human-readable evidence pack
   (HTML and PDF), reference numbers and a submission log (submission itself is simulated: no EU account).
6. **Supplier campaigns:** durable, weeks-long evidence collection (request → reminders → upload → automated
   assessment → reviewer approval) that survives restarts.
7. **Dashboards:** readiness by supplier, commodity and country; plots at risk; shipments cleared to ship;
   days to the deadline; plain-language insights for leaders.

## Requirements and non-functional constraints
- **Reproducible assessments:** the same geometry and the same dataset versions give the same verdict; every
  assessment stores its dataset versions and input/result hashes.
- **GDPR:** farmer personal data minimised; plots are identified by a producer reference, names optional.
- **Evidence retention:** five years; plots, assessments, DDS and the audit log are archived, never deleted.
- **Security:** argon2id passwords, short-lived sessions with refresh rotation, CSRF protection, RBAC with
  tenant isolation, rate limits, security headers, a hash-chained audit trail.
- **Runs offline, $0, no signups:** SQLite, a bundled synthetic landscape for the demo plots, a local Temporal
  dev server, deterministic text summaries. Live satellite reads (Planetary Computer, public Hansen and JRC
  files) are optional and need no account.

## Out of scope / honest limits
- Plotline supports due diligence; it does not certify compliance or replace the operator's legal judgement.
- Legality (land tenure, labour, tax) is captured only as supplier declarations, not verified.
- Submission to TRACES is simulated; the payload follows the published DDS structure but is not filed.
- Hansen loss is 30 m and misses selective logging and conversion under canopy; JRC GFC2020 has known
  commission/omission errors. Both are why a reviewer stays in the loop.
