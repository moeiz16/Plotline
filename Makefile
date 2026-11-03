# Plotline developer tasks. Everything runs offline, without Docker or accounts.
# Ports: web 3010 · API 8010 · Temporal 7233 (UI 8233)
PY       := backend/.venv/bin/python
MLPY     := ml/.venv/bin/python
NPM      := npm --prefix frontend
TEMPORAL := .tools/temporal

.PHONY: help setup setup-backend setup-frontend setup-ml tools dev api web temporal seed test test-backend \
        test-ml test-frontend lint typecheck eval ml-data train ml-eval clean

help:            ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

setup: setup-backend setup-frontend tools  ## Install API + web app + Temporal CLI
	@test -f .env || cp .env.example .env

setup-backend:   ## Create the Python venv and install the API
	python3.13 -m venv backend/.venv
	$(PY) -m pip install -q --upgrade pip
	$(PY) -m pip install -q -e "backend[dev]"

setup-frontend:  ## Install the web app
	$(NPM) ci

setup-ml:        ## Optional: training environment (PyTorch CPU + LeJEPA + raster reads)
	python3.13 -m venv ml/.venv
	$(MLPY) -m pip install -q --upgrade pip
	$(MLPY) -m pip install -q -e "ml[dev]"

tools:           ## Download the Temporal CLI (single binary) into .tools/
	@mkdir -p .tools
	@test -x $(TEMPORAL) || (curl -sL "https://temporal.download/cli/archive/latest?platform=$$(uname -s | tr A-Z a-z)&arch=$$(uname -m | sed s/x86_64/amd64/)" | tar xz -C .tools temporal)

temporal:        ## Run the local Temporal dev server (state kept in data/temporal.db)
	$(TEMPORAL) server start-dev --db-filename data/temporal.db --port 7233 --ui-port 8233 --log-level warn

api:             ## Run the API on :8010 (inline campaign worker)
	cd backend && .venv/bin/python -m uvicorn app.main:app --port 8010

web:             ## Build and serve the web app on :3010
	$(NPM) run build && $(NPM) run start

dev:             ## Temporal + API + web together (Ctrl-C stops all)
	@$(MAKE) -j3 temporal api web

seed:            ## Create tables and seed the demo organisation (synthetic, offline)
	cd backend && .venv/bin/python -m app.cli db init && .venv/bin/python -m app.cli seed demo

test: test-backend test-frontend  ## Run all tests

test-backend:    ## API + domain tests (SQLite, bundled landscape, Temporal time-skipping)
	cd backend && .venv/bin/python -m pytest -q

test-ml:         ## Encoder export parity tests (needs `make setup-ml`)
	cd ml && .venv/bin/python -m pytest -q

test-frontend:   ## Typecheck + lint + production build of the web app
	cd frontend && npx tsc --noEmit && npm run lint && npm run build

lint:            ## Lint everything
	cd backend && .venv/bin/python -m ruff check app tests && .venv/bin/python -m ruff format --check app tests
	$(NPM) run lint

typecheck:       ## Static type checks
	cd backend && .venv/bin/python -m mypy app
	cd frontend && npx tsc --noEmit

eval:            ## Evaluation gates (verdict rules, geometry rules, change signal vs Hansen)
	cd backend && .venv/bin/python ../eval/run.py

ml-data:         ## Download demo-scale Sentinel-2 + Hansen + JRC windows (network, ~120 MB)
	$(MLPY) -m plotline_ml.fetch

train:           ## Train the change encoder with LeJEPA on CPU (a few minutes) and export it
	$(MLPY) -m plotline_ml.train && $(MLPY) -m plotline_ml.export

ml-eval:         ## Score the change signal against Hansen loss labels -> ml/artifacts/eval.json
	$(MLPY) -m plotline_ml.evaluate

clean:           ## Remove caches and local dev databases
	find backend ml -name "__pycache__" -type d -prune -exec rm -r {} +
	rm -rf backend/.pytest_cache backend/.ruff_cache backend/.mypy_cache ml/.pytest_cache ml/.ruff_cache
	rm -rf backend/plotline-dev.db backend/plotline-dev.db-wal backend/plotline-dev.db-shm frontend/.next
