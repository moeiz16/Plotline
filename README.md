# Plotline

**EU Deforestation Regulation (EUDR) due diligence, proven plot by plot.**

Plotline lets EU importers and their suppliers abroad prove that every shipment of cocoa, coffee, soy, palm
oil, cattle, rubber or wood comes from land that was not deforested after 31 December 2020, and prepares the
due diligence statement the EU requires. The regulation applies from 30 December 2026 (medium and large
operators) and 30 June 2027 (micro and small).

> Status: in active development. This README is completed with quick start, screenshots and measured
> results as the workstreams land.

## Repository layout
| Path | What |
|---|---|
| `backend/` | FastAPI API, platform (auth, orgs, RBAC, audit), spatial and Earth-observation core, assessment rules, Temporal workflows |
| `ml/` | LeJEPA training of the tiny land-change encoder, data fetch, evaluation against Hansen, Kaggle notebook |
| `frontend/` | Next.js 15 web app: landing, map-first product, supplier portal |
| `eval/` | Evaluation gates |
| `docs/` | [Problem statement](docs/PROBLEM_STATEMENT.md), [architecture](docs/ARCHITECTURE.md), [API contract](docs/API_CONTRACT.md), [ADRs](docs/adr/) |

## Quick start (offline, no accounts)
```bash
make setup      # Python venv, web app dependencies, Temporal CLI into .tools/
make seed       # demo organisation "Northbank Cocoa & Coffee Imports" (synthetic data)
make dev        # Temporal :7233 · API :8010 · web :3010
```
Sign in at http://localhost:3010 with `amelie.kraus@northbank.example` / `Northbank-Demo-2026`.

## Data sources
EU JRC Global Forest Cover 2020 (CC BY 4.0) · Hansen/UMD/Google/USGS/NASA Global Forest Change v1.13
(CC BY 4.0) · Copernicus Sentinel-2 L2A via Microsoft Planetary Computer · EU country benchmarking,
Implementing Regulation (EU) 2025/1093.

## License
MIT
