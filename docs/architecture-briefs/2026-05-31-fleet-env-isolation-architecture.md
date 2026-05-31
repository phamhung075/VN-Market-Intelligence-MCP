# Architecture Brief — Fleet-Wide Environment Isolation

**Sprint:** (none — design complete, operator review required before any build)
**Author:** architect
**Date:** 2026-05-31
**Mode:** COMPLETE SYSTEM DESIGN — read-only. No sprint opened, no code modified.
**Status:** DESIGN COMPLETE — operator decision required before dispatch
**Predecessor:** `docs/architecture-briefs/2026-05-31-test-prod-data-isolation.md` (commit 192f6c56) — BCTC-scoped investigation that established Option 2 as the recommended model. This brief extends that recommendation fleet-wide.
**Triggered by:** Operator escalation — prior brief scoped isolation to BCTC path only; operator requires complete system design for ALL microservices.

---

## 1. Scope Clarification

The prior brief established the *mechanism* (Option 2: separate DB file per env via `DB_PATH` env var). This brief answers: how does that mechanism extend across every service, every datastore, every write vector, and every caller in the fleet — consistently, without breaking existing tests or the live production pipeline.

Single decision rule applied throughout: one fleet-wide environment model, not per-service options.

---

## 2. Complete Service and Datastore Inventory

Source: `docs/data/system-map.json` (queried, not hardcoded). `docker-compose.yml` confirmed env var wiring.

### 2.1 SQLite Datastores — Fleet Map

Seven distinct SQLite files exist in the fleet. Five live inside the shared named volume `market_data` mounted at `/app/data`.

| DB id | File path in container | Sole writer | Other readers | Env var (writer) | Env var (reader) |
|---|---|---|---|---|---|
| `market` | `/app/data/market.db` | mcp-server | technical-analysis, macro-indicators, kinh-dich-service, news-fetch, stock-price (market_prices read), pdf-extractor (pdf_extracted_text read) | `DB_PATH` | `DB_PATH` (all) + `MARKET_DB_PATH` (pdf-extractor) |
| `coordination` | `/app/data/coordination.db` | mcp-server | none (mcp-server owns both read and write) | derived: sibling of `DB_PATH`, override via `COORDINATION_DB_PATH` | same |
| `stock_price` | `/app/data/stock_price.db` | stock-price | none (price results POSTed to mcp-server, not read cross-service) | `STOCK_PRICE_DB_PATH` | n/a |
| `alert_engine` | `/app/data/alert_engine.db` | alert-engine | none (alert results POSTed to mcp-server) | `ALERT_ENGINE_DB_PATH` | n/a |
| `pdf_extractor` | `/app/data/pdf_extractor.db` | pdf-extractor | none | `DB_PATH` (pdf-extractor's own) | n/a |
| `rag_service` | `/app/data/rag_service.db` | rag-service | none | `DB_PATH` (rag-service's own) | n/a |

**Correction vs. prior brief:** The prior brief incorrectly listed stock-price as not having a `DB_PATH` pointing at `market.db`. `apps/stock-price/cmd/server/main.go` line 31 confirms: `marketDBPath := envStr("DB_PATH", "./data/market.db")` — stock-price reads from `market.db` via `DB_PATH`, exactly like the other read-only consumers. It does NOT write to `market.db`; it writes prices via `POST /api/push-prices` to mcp-server.

**Also confirmed:** `alert-engine` has TWO env vars: `DB_PATH` points at `market.db` for reads (alerts reading price thresholds), and `ALERT_ENGINE_DB_PATH` points at its own `alert_engine.db` for writes.

### 2.2 LanceDB Vector Store

| DB id | Path in container | Sole writer | Sole reader | Env var |
|---|---|---|---|---|
| `rag_vectors` | `/app/data/lancedb` | rag-service | rag-service (search_similar_context tool queries through mcp-server → HTTP call to rag-service) | `LANCEDB_PATH` |

LanceDB is a directory structure (not a single file). Auto-compaction runs every 100 inserts (`_COMPACT_EVERY = 100` in `apps/rag-service/infrastructure/repositories.py`). The directory is inside the `market_data` named volume.

**Analysis read path for LanceDB:** Cowork agents (unified-agent/CHEF, news-scout, market-watcher, etc.) call `search_similar_context` via the gateway → mcp-server fetches from rag-service via HTTP → rag-service queries LanceDB at `LANCEDB_PATH`. No agent has a direct LanceDB connection.

### 2.3 File Stores (non-DB)

| Store | Path | Writer | Reader | Purpose |
|---|---|---|---|---|
| `alert-verdicts.json` | `./docs/data/alert-verdicts.json` (bind mount into container) | mcp-server (`write_alert_verdict` tool) | mcp-server (`verdictResolutionJob`) | Two-stage alert verdict flow |
| PDF files | `./data/pdfs/` (bind mount) | VPS bctc-fetch service deposits; mcp-server stores | pdf-extractor reads (ro mount) | BCTC PDF corpus |
| `docs/agent-memory/` | bind mount | mcp-server (`save_agent_memory_update`, `update_memory_file`) | mcp-server, all cowork agents | Agent notebook persistence |

These file stores are bind mounts from the host. They are PATH-based — the host path controls which version (prod vs. dev) is used. No special env var treatment is needed for the JSON stores: dev sessions would naturally use the same host path, which is low-risk (verdict store and agent memory are transient / recoverable).

### 2.4 Services With No DB Access

| Service | Why no DB | Communication pattern |
|---|---|---|
| api-gateway | Pure HTTP router — no storage | Routes requests to downstream services |
| news-fetch | No DB reads in source code (confirmed: zero `DB_PATH` reads in `apps/news-fetch/src/`) | POSTs news to mcp-server via HTTP; reads nothing from DB |
| frontend | No DB access (confirmed: zero `DB_PATH` reads in `apps/frontend/src/`) | Reads via api-gateway HTTP |
| flaresolverr | Third-party utility, no project DB | Called by news-fetch for Cloudflare-protected pages |

---

## 3. Complete Write Vector Inventory — Fleet-Wide

Every path that writes to a datastore, classified by whether it can carry non-production data.

### W-1: VPS-Originated HTTP Push Routes (mcp-server receiver)

All target mcp-server port 3000. VPS push is production by design — these pushes carry real market data from Vietnam geo-blocked sources.

| Route | VPS service | Tables written | Non-prod data risk |
|---|---|---|---|
| `POST /api/push-prices` | `vn-price-fetch.service` | `market_prices`, `market_prices_history`, `daily_ohlcv` | LOW — real VPS prices |
| `POST /api/push-foreign-flow` | `vn-foreign-flow.service` | `foreign_flow` | LOW — real VPS data |
| `POST /api/push-news` | `vn-news-fetch.service` | `news_articles` | LOW — real VPS news |
| `POST /api/push-sbv-rates` | `vn-sbv-fetch.service` | `macro_indicators` | LOW — real SBV rates |
| `POST /api/push-reuters` | news-fetch service (local) | `news_articles` | LOW — real Reuters feed |
| `POST /api/push-tradingeconomics` | macro-indicators service | `macro_indicators` | LOW — real TE data |
| `POST /api/push-gso` | macro-indicators service | `macro_indicators` | LOW — real GSO data |
| `POST /api/push-bctc-pdf` | VPS bctc-fetch service | `bctc_vps_queue`, `financial_reports` | LOW — real PDFs |
| `POST /api/push-ohlcv-history` | stock-price service | `daily_ohlcv` | LOW — real OHLCV |
| `POST /api/push-bctc-table` | pdf-extractor (local) | `bctc_table_rows`, `bctc_balance_checks` | MEDIUM — if pdf-extractor runs against test PDFs |
| `POST /api/push-bctc-md-tables` | pdf-extractor (local) | `bctc_md_tables` | MEDIUM — same |
| `POST /api/push-bctc-layout` | pdf-extractor (local) | `bctc_layout_units`, `bctc_page_zones` | MEDIUM — same |
| `POST /api/enrich-queue-item` | BCTC queue enricher cron (mcp-server internal) | `bctc_vps_queue` | LOW — derived from existing queue |
| `POST /api/bctc-inspect/correct/` | Human operator (browser) | `bctc_human_corrections` | LOW — human review corrections |
| `POST /api/bctc-inspect/confirm/` | Human operator (browser) | `financial_reports.confirm_status` | LOW — human confirmation |

**VPS W-1 routes are production by design.** The VPS systemd services hardcode port 3000 at the production mcp-server. A dev mcp-server on a different port is invisible to VPS scripts — VPS data never enters a dev DB unless a developer deliberately reconfigures VPS targets (which would require editing VPS scripts on the Vinahost host — not a normal dev operation).

**Local-origin W-1 routes** (pdf-extractor pushing `push-bctc-table`, `push-bctc-md-tables`, `push-bctc-layout`): these can carry non-prod data if a developer triggers pdf-extractor against test PDFs. In a dev session where mcp-server points at `market.dev.db`, these pushes land in the dev DB — correct behavior. In production, they land in `market.db` — also correct.

### W-2: Agent MCP Tool Calls (via gateway — contamination-proven path)

All reach mcp-server via the `claude.ai gateway` wrapper. These are the HIGH-risk vectors — the BCTC-TRUST-RED incident (FPT/ACB fabricated data) used this path.

| Tool | Tables written | Non-prod risk |
|---|---|---|
| `push_bctc_refined_unit` | `bctc_refined_units` | HIGH — agent-generated content |
| `finalize_bctc_refine` | `bctc_table_rows`, `financial_reports.refine_status` | HIGH — same |
| `bctc_skip` | `financial_reports.refine_status` | MED — lifecycle flag only |
| `set_alert`, `update_alert`, `delete_alert` | `price_alerts` | LOW — operator-set thresholds |
| `save_agent_memory_update` | `agent_memory` | LOW — agent working notes |
| `update_watchlist` / `add_to_watchlist` / `remove_from_watchlist` | `watchlist` | LOW — operator-set config |
| `save_macro_evidence` | `macro_evidence` | MED — agent-synthesized evidence |
| `save_news_analysis` | `news_analysis` | MED — agent-synthesized analysis |
| `post_agent_signal` | `agent_signals` | MED — agent cycle output |
| `record_evidence_fragment` | `evidence_items` | MED — agent evidence |
| `write_alert_verdict` | `alert-verdicts.json` (file store) | LOW — verdict lifecycle |
| `log_agent_work` | `agent_work_log` | LOW — audit trail |
| `create_prediction_claim` | `prediction_claims` | MED — agent-generated forecast |
| `set_position` / `close_position` | `positions` | LOW — operator-set portfolio |

**The TRUST-RED gates (DT-1/DT-2/DT-3, shipped)** are the primary semantic defense against fabrication in `push_bctc_refined_unit` / `finalize_bctc_refine`. The env isolation is a structural complement — it ensures that even a tool call that bypasses semantic checks (e.g. a legitimate tool with non-prod data) lands in the right DB.

### W-3: Cron-Driven Use Cases (mcp-server internal scheduler — 60+ jobs)

All write derived / aggregated data from existing production inputs. No hallucination path; all inputs are real market data already in the DB.

Key write destinations:
- `telegram_reports` — morningBriefingJob, eveningSummaryJob, franceSummaryJob, alertDigestJob
- `agent_signals`, `hexagram_signals` — intelligenceCycleJob
- `prediction_market_outcomes` — predictionOutcomeJob, predictionResolutionJob
- `calibration_reports` — calibrationReportJob
- `cron_job_runs`, `job_runs`, `scheduler_locks` — observability jobs
- `financial_reports.text_status`, `pdf_extracted_text` — bctcReparseJob
- `kinhdich_readings`, `hexagram_transitions` — hexagram jobs
- `briefing_log`, `market_summaries` — summary jobs
- `cascade_results`, `evidence_items` — evidenceAccumulatorJob, cascadeBacktestJob
- `daily_ohlcv` — ohlcvDailyAggregatorJob (aggregation, not injection)

**Risk: NEAR-ZERO.** Cron jobs are mcp-server internal. They read and aggregate from whatever DB they are connected to. In production, they read/write `market.db`. In a dev session (mcp-server pointing at `market.dev.db`), cron jobs would write to `market.dev.db` — correct behavior. No env-specific code change needed for cron paths.

### W-4: One-Shot Maintenance Scripts (host-side, outside Docker)

| Script | Path | DB access | Risk |
|---|---|---|---|
| `run-bt7-backfill.ts` | `scripts/run-bt7-backfill.ts` | HARDCODED `/Users/admin/.../apps/mcp-server/data/market.db` with `readwrite:true` | MED — path smells; wrong on any other machine |
| `purge-phantom-reports.ts` | `scripts/purge-phantom-reports.ts` | `resolve(PROJECT_ROOT, "data", "market.db")` writable, no env guard | MED — no guard prevents accidental production purge |

### W-5: Stock-Price Service (indirect write via POST)

stock-price writes to `stock_price.db` directly (its own private DB, not `market.db`). It then POSTs price updates to mcp-server via `POST /api/push-prices`. This is effectively W-1 for market data purposes. The `stock_price.db` is stock-price's private Tier-3 cache; it does not need cross-service env isolation beyond its own `STOCK_PRICE_DB_PATH` pointing at the right file.

### W-6: Alert-Engine (indirect write via POST)

alert-engine reads `market.db` (read-only, price thresholds). It writes alert events to `alert_engine.db` privately, then POSTs signals to mcp-server. Same pattern as stock-price. `alert_engine.db` is private cache; env isolation is via `ALERT_ENGINE_DB_PATH`.

### W-7: rag-service Embeddings (LanceDB writes)

rag-service is the sole writer to the LanceDB vector index at `LANCEDB_PATH`. Writes happen when:
- `intelligenceCycleJob` sends news articles for embedding (HTTP call from mcp-server to rag-service `/embed`)
- `search_similar_context` MCP tool call reaches rag-service to search; no write on search
- The mcp-server `rag/` infrastructure module also holds embedding code — but in the Docker architecture, the rag-service FastAPI container handles the actual LanceDB writes via HTTP

**LanceDB non-prod contamination scenario:** A developer runs a dev mcp-server that triggers intelligence cycles, which call rag-service to embed test/synthetic news articles. Those embeddings land in the LanceDB index at `LANCEDB_PATH`. If the dev rag-service shares the same `LANCEDB_PATH` as production, the production semantic search index is contaminated with dev embeddings. This scenario is realistic when a developer runs a dev intelligence cycle.

---

## 4. Analysis Read Path — Production Guarantee Required

Every cowork agent (unified-agent/CHEF, market-watcher, news-scout, digest-predict, alert-commander, bctc-analyst, qa-responder) + fb-market-poster reads production data via MCP tools through the gateway. They never connect to any DB directly. The chain is:

```
cowork agent → gateway call_tool(server="vn-market") → mcp-server (port 3000) → SQLite market.db
cowork agent → gateway call_tool(search_similar_context) → mcp-server → HTTP → rag-service → LanceDB
```

**The production guarantee** is achieved by ensuring the production mcp-server (port 3000) always connects to `market.db` (not a dev DB), and the production rag-service always connects to the production `LANCEDB_PATH`. As long as these env vars point to production files in the production compose project, no code change in the analysis path is needed. The gateway always reaches port 3000; a dev mcp-server on port 3099 is unreachable from the gateway.

---

## 5. The Chosen Fleet Environment Model

**Model name: Single-Stack Dev Override with Physical Datastore Boundaries**

One compose project. One physical host. One `APP_ENV` env var propagated to every service. Production is the default (zero-opt-out). Development is an explicit opt-in via a compose override file.

### 5.1 Environment Selector — `APP_ENV`

One environment variable, same name everywhere:

```
APP_ENV=production    ← default in docker-compose.yml (no change for prod)
APP_ENV=dev           ← set in docker-compose.dev.yml override
APP_ENV=test          ← set in-process by test preloads (already works via :memory:)
```

**Default is production.** Every service that has `APP_ENV` in its environment block defaults to `production`. A developer must explicitly invoke the dev override to get `APP_ENV=dev`. This satisfies the operator requirement: "nothing changes until a dev explicitly opts out."

`APP_ENV` is the single canonical selector. It is NOT a per-service convention — it is fleet-wide uniform. Every container reads the same env var name, same values.

### 5.2 SQLite Boundary — Fleet-Wide DB_PATH Convention

**Rule:** In the dev compose override, every `DB_PATH`-based env var that points at `market.db` is redirected to `market.dev.db` within the same named volume. Services with private DBs get their own dev filenames.

Production (docker-compose.yml — unchanged):
```yaml
# mcp-server
DB_PATH: /app/data/market.db
COORDINATION_DB_PATH: /app/data/coordination.db   # add this explicit path (currently derived)

# technical-analysis, macro-indicators, kinh-dich-service, news-fetch
DB_PATH: /app/data/market.db

# stock-price
DB_PATH: /app/data/market.db           # reads
STOCK_PRICE_DB_PATH: /app/data/stock_price.db   # writes

# alert-engine
DB_PATH: /app/data/market.db           # reads
ALERT_ENGINE_DB_PATH: /app/data/alert_engine.db  # writes

# pdf-extractor
DB_PATH: /app/data/pdf_extractor.db   # its own DB
MARKET_DB_PATH: /app/data/market.db   # reads market.db for OCR text

# rag-service
DB_PATH: /app/data/rag_service.db     # its own DB
LANCEDB_PATH: /app/data/lancedb       # vector index
```

Development override (docker-compose.dev.yml — new file):
```yaml
# mcp-server
DB_PATH: /app/data/market.dev.db
COORDINATION_DB_PATH: /app/data/coordination.dev.db

# technical-analysis, macro-indicators, kinh-dich-service, news-fetch
DB_PATH: /app/data/market.dev.db      # read the dev DB

# stock-price
DB_PATH: /app/data/market.dev.db
STOCK_PRICE_DB_PATH: /app/data/stock_price.dev.db

# alert-engine
DB_PATH: /app/data/market.dev.db
ALERT_ENGINE_DB_PATH: /app/data/alert_engine.dev.db

# pdf-extractor
DB_PATH: /app/data/pdf_extractor.dev.db
MARKET_DB_PATH: /app/data/market.dev.db

# rag-service
DB_PATH: /app/data/rag_service.dev.db
LANCEDB_PATH: /app/data/lancedb.dev
```

All `.dev.db` files live inside the same named volume `market_data`. No new volume is needed. A `docker volume rm market_data` still deletes everything — the operator decides whether to use a separate named volume (OD-A below).

**Read-only DB consumers follow the same env var.** When `DB_PATH=/app/data/market.dev.db` and `DB_READONLY=true`, the service opens the dev DB read-only. This is correct — a dev technical-analysis service should read the dev market data, not production.

### 5.3 LanceDB Boundary

In the dev override: `LANCEDB_PATH: /app/data/lancedb.dev`

LanceDB is a directory. The `.dev` suffix makes it a sibling directory within the volume. The rag-service creates the directory on first use. Production LanceDB at `/app/data/lancedb` is never touched by the dev rag-service.

**Critical:** the dev override must be applied to the rag-service container, not just mcp-server. The dev intelligence cycle would call the dev rag-service (port 5002, same port — see section 5.5 on port strategy) which reads/writes `lancedb.dev`.

### 5.4 The Hard Write-Guard Layer (Defense-in-Depth)

The physical file boundary (separate DB filenames) is the PRIMARY guard. The write-guard layer is the SECONDARY defense — it catches misconfiguration before a write lands.

**Implementation: startup assertion + per-write env stamp**

Step 1 — Startup assertion (all write-path services):
- mcp-server startup: log `[startup] APP_ENV=${APP_ENV} DB_PATH=${DB_PATH} LANCEDB_PATH=${LANCEDB_PATH}`
- Detect misconfiguration: if `APP_ENV=production` and `DB_PATH` does not end with `market.db` (i.e., the prod env var was accidentally overridden to a dev file), emit a `WARN` telegram to the WORK channel and refuse to start (fail-loud-first, per `docs/protocols/fail-loud-protocol.md`)
- Symmetrically: if `APP_ENV=dev` and `DB_PATH` ends with `market.db` (dev APP_ENV but prod file), same warn + refuse

Step 2 — Per-write env stamp on the high-risk tables:

Add `data_env TEXT NOT NULL DEFAULT 'production'` to:
- `bctc_refined_units` (confirmed contamination target — TRUST-RED incident)
- `bctc_table_rows` (confirmed contamination target)
- `news_analysis` (agent-synthesized content — MED risk)
- `macro_evidence` (agent-synthesized evidence — MED risk)
- `agent_signals` (agent cycle output — MED risk, used by MARKET dishes)

For each INSERT into these tables, stamp `data_env = Bun.env["APP_ENV"] ?? 'production'`.

This is an AUDIT column, not a read filter. The read path does NOT change. The stamp enables forensic investigation ("which rows were written by a dev session?") and gives the operator a way to detect and clean contamination if the primary file boundary is somehow bypassed.

Step 3 — Startup env consistency check interacts with TRUST-RED gates:

The TRUST-RED gates (DT-1/DT-2/DT-3) operate on content semantics. The write-guard operates on environment identity. They are independent and composing — a row must pass BOTH the semantic gate AND land in the correct DB file.

### 5.5 VPS Push Routes — Production Protection

**The VPS is hardwired to port 3000 on the mcp-server.** The VPS systemd scripts (`vn-price-fetch.service`, `vn-bctc-fetch.service`, `vn-news-fetch.service`, `vn-sbv-fetch.service`, `vn-foreign-flow.service`) call mcp-server at the host IP + port 3000. They have no awareness of any dev instance.

**Strategy: dev mcp-server runs on a different EXTERNAL port.** In the dev compose override, the port mapping is changed:

```yaml
# docker-compose.dev.yml — mcp-server port override
services:
  mcp-server:
    ports:
      - "3099:3000"    # dev external port; VPS targets 3000 (host), not 3099
```

VPS services push to port 3000 on the host → production mcp-server at `market.db`. Dev mcp-server at port 3099 is invisible to VPS. Real production data NEVER enters `market.dev.db` via VPS push routes.

**BUT: this requires the prod and dev mcp-server to NOT run simultaneously on the same host.** The host cannot bind port 3000 to two containers. This means:

- When running dev compose override: production mcp-server must be stopped or down-scaled
- OR: the dev compose override REMOVES the production mcp-server service (replaces it entirely) — not runs alongside it

The recommended dev workflow (see section 7 on compose strategy) is: stop production → bring up dev override → test → stop dev → restart production. This is a sequential model. The 16GB Mac memory constraint (Docker 8GB cap) also makes running two stacks simultaneously infeasible.

**W-1 routes in dev mode:** Dev mcp-server at port 3099 receives no VPS push data. The dev database starts empty of real-time market prices. This is expected and correct for BCTC refine testing (the use case that triggered this design). The dev DB can be seeded with a DB snapshot or subset of production data if needed — see section 6 on data promotion.

### 5.6 How Cowork Agents and the Gateway Connect

The `claude.ai gateway` at `zenmidi.com/gateway` connects to the MCP server at port 3000 (via the Cloudflare tunnel configured on the host). In dev mode (production mcp-server down, dev mcp-server on port 3099), the gateway CANNOT reach the dev mcp-server unless the Cloudflare tunnel is reconfigured to point at port 3099.

**Implication:** Cowork agents running in Claude.ai sessions cannot call tools against the dev mcp-server during a dev session without Cloudflare tunnel reconfiguration. This is intentional — the dev env is for developer testing, not for live cowork agent cycles. The production analysis path is offline during dev sessions (production mcp-server is stopped).

**Consequence for sequencing:** Dev sessions are maintenance windows. They should be scheduled during off-market-hours (no live VN price data is expected when VN market is closed, so stopping the production mcp-server for a dev session during UTC 09:00-01:00 does not miss live price pushes). BCTC refine testing is the primary dev use case; it does not require live prices.

### 5.7 Maintenance Scripts — Guard Fix

Both host-side maintenance scripts must be hardened:

`scripts/run-bt7-backfill.ts`:
- Replace hardcoded path with: `const DB_PATH = process.env.DB_PATH ?? resolve(PROJECT_ROOT, "data", "market.db")`
- Add guard: if `DB_PATH` does not contain `market.db` (i.e., running against a dev file), require `--force-dev` CLI flag

`scripts/purge-phantom-reports.ts`:
- Add `APP_ENV` check: if `APP_ENV` is unset or not `'production'`, refuse unless `--force-dev` flag passed
- Add startup log: print resolved DB path before any write

Both scripts must print resolved DB path to stdout before executing any write — fail-loud, per protocol.

### 5.8 Unit Tests — :memory: Pattern Preservation

The existing `:memory:` test pattern is UNTOUCHED. The `apps/mcp-server/src/__tests__/setup.ts` preload sets `Bun.env["DB_PATH"] = ":memory:"` before any module load. The `APP_ENV` env var would also be set to `"test"` in this preload (additive change — one line). This means:

- `data_env` stamp in INSERT paths reads `Bun.env["APP_ENV"] ?? 'production'` → gets `"test"` in tests → no prod contamination
- Startup assertion guard checks `APP_ENV=test` → skips the prod/dev mismatch check (test mode is explicitly exempt)
- All existing test files continue to pass without modification

Python tests (pdf-extractor): use `tempfile.mkdtemp()` isolated paths. Unaffected.

Migration tests: use `:memory:` or tmp paths. Unaffected.

### 5.9 Integration and E2E Tests

The `:memory:` pattern covers unit-level integration tests (mcp-server intra-process). True E2E tests (FastAPI TestClient for pdf-extractor, Go `httptest` for stock-price/alert-engine/kinh-dich/TA/macro) use injected fakes per the DDD ports pattern. Neither pattern touches the production DB file.

Where an E2E test needs a real SQLite file (not `:memory:`), it should use `APP_ENV=test` and a test-specific DB path via env injection in the test harness. The dev compose override is NOT used for automated tests — tests manage their own isolation.

---

## 6. Data Promotion Path

### 6.1 What "Promotion" Means

Dev data is strictly throwaway by default. The primary dev use case is BCTC refine testing: a developer runs the refine pipeline against real PDFs in `market.dev.db`, verifies the output is correct (via `get_bctc_full` against port 3099), then decides whether to promote those verified refined units to production.

### 6.2 Promotion Decision: Bespoke Script (not a framework)

Promotion is not a generic ETL pipeline. It is a targeted, per-report SQL operation:

```bash
# Conceptual promotion script (bun run scripts/promote-bctc-to-prod.ts)
# Reads from market.dev.db, writes to market.db (both files in volume)
# Arguments: --report-id <uuid> --tables bctc_refined_units,bctc_table_rows
# Validates: parent financial_reports row exists in prod before inserting child rows
# Transaction: wrapped in BEGIN/COMMIT; rolls back on FK violation
# Audit: stamps data_env='promoted' on inserted rows for traceability
```

FK constraint order (mandatory): `financial_reports` row must exist in prod DB before `bctc_table_rows` rows are inserted (references `report_id`). The promotion script must check and insert parent-before-child.

For non-BCTC tables (e.g. `news_analysis`, `macro_evidence`): dev data in these tables is throwaway — it was produced against dev inputs (empty price DB, no live news) and has no value in production. No promotion needed.

### 6.3 Seed Data for Dev Sessions

The dev DB starts empty. For realistic BCTC refine testing, the developer needs:
- `pdf_extracted_text` rows for the reports being refined (these are in `market.db`, written by the bctcReparseJob cron)
- `financial_reports` metadata rows for the same reports

Seed approach (documented SOP, not a script):
```bash
# Copy relevant rows from prod to dev (run inside mcp-server container or with bun)
bun run scripts/seed-dev-db.ts --report-id <uuid>
# OR: SQLite file copy subset:
# sqlite3 market.db ".dump financial_reports" | sqlite3 market.dev.db
```

The simplest seed: copy the entire `financial_reports` and `pdf_extracted_text` tables from `market.db` to `market.dev.db`. These are read-only inputs for the refine pipeline. No real-time price data is needed for BCTC refine.

---

## 7. Docker Compose Strategy

### 7.1 Base Compose (docker-compose.yml) — No Change to Production

The base `docker-compose.yml` is the production truth. Zero changes to any production service config except:
1. Add `APP_ENV: production` explicitly to every service's `environment` block (previously absent — this makes the env var intentional and visible)
2. Add `COORDINATION_DB_PATH: /app/data/coordination.db` explicitly to mcp-server (currently derived from `DB_PATH` sibling — making it explicit prevents dev override accidents)

Both are additive, backward-compatible, zero-behavior-change. Production starts/restarts without any schema or config migration needed.

### 7.2 Dev Override (docker-compose.dev.yml — new file)

```yaml
# docker-compose.dev.yml — dev environment overlay
# Usage: docker compose -f docker-compose.yml -f docker-compose.dev.yml up
# Stops production first: docker compose down (then apply override)
# Memory budget: same as production (~7-8GB Docker cap) — dev and prod never run simultaneously

services:
  mcp-server:
    ports:
      - "3099:3000"    # dev external port; VPS continues targeting host:3000 (N/A in dev)
    environment:
      APP_ENV: dev
      DB_PATH: /app/data/market.dev.db
      COORDINATION_DB_PATH: /app/data/coordination.dev.db
      NODE_ENV: development

  pdf-extractor:
    environment:
      APP_ENV: dev
      DB_PATH: /app/data/pdf_extractor.dev.db
      MARKET_DB_PATH: /app/data/market.dev.db

  rag-service:
    environment:
      APP_ENV: dev
      DB_PATH: /app/data/rag_service.dev.db
      LANCEDB_PATH: /app/data/lancedb.dev

  technical-analysis:
    environment:
      APP_ENV: dev
      DB_PATH: /app/data/market.dev.db

  macro-indicators:
    environment:
      APP_ENV: dev
      DB_PATH: /app/data/market.dev.db

  kinh-dich-service:
    environment:
      APP_ENV: dev
      DB_PATH: /app/data/market.dev.db

  news-fetch:
    environment:
      APP_ENV: dev
      DB_PATH: /app/data/market.dev.db

  stock-price:
    environment:
      APP_ENV: dev
      DB_PATH: /app/data/market.dev.db
      STOCK_PRICE_DB_PATH: /app/data/stock_price.dev.db

  alert-engine:
    environment:
      APP_ENV: dev
      DB_PATH: /app/data/market.dev.db
      ALERT_ENGINE_DB_PATH: /app/data/alert_engine.dev.db

  # api-gateway and frontend: no DB access — APP_ENV not required
  # flaresolverr: third-party — no change
```

### 7.3 Memory Budget (16GB Mac, Docker 8GB cap)

The dev override runs the SAME service count as production — no new containers are added. Memory footprint is identical to production. The constraint is satisfied because dev replaces production (never adds to it).

A "partial dev stack" variant (mcp-server + pdf-extractor only, ~3.5GB) is feasible alongside a running production stack. This would allow BCTC-only dev testing without stopping production. However, this variant is out of scope for the initial sprint (it requires the production stack to be reconfigured to route pdf-extractor calls to the dev instance — complex). Defer to a future sprint if needed.

### 7.4 Named Volume Strategy

**Recommendation: same named volume, different filenames within it.** This is simpler to operate and lower migration cost. The `market_data` volume contains both `market.db` (production) and `market.dev.db` (dev). Both files are protected by the physical filename boundary.

**Risk:** `docker volume rm market_data` deletes both. Mitigation: document this in the dev SOP. The operator is the sole user of this system.

**Alternative (OD-A below):** separate named volumes (`market_data` for prod, `market_data_dev` for dev). More rigorous isolation; slightly higher ops complexity (volume provisioning, two `docker volume rm` commands for full cleanup). Either approach satisfies the isolation requirement.

---

## 8. Rollout Plan — Phased, Non-Breaking

### Phase 0 — No-Op Default (prerequisite, no code change)

Verify: production stack continues running with `APP_ENV` absent (current state). All services start normally without `APP_ENV` set. The startup assertion (Phase 2) will be written to treat absent `APP_ENV` as `'production'` — backward-compatible.

**Phase 0 exit condition:** All services healthy, no behavioral change. This is the current state.

### Phase 1 — Explicit Production Tagging (LOW risk, ops-only)

Add `APP_ENV: production` explicitly to every service's environment block in `docker-compose.yml`. Add `COORDINATION_DB_PATH: /app/data/coordination.db` to mcp-server.

Changes: `docker-compose.yml` only. No code changes. No schema changes.
Rolling deploy: `docker compose up -d` (services restart with new env var, no downtime).

**Phase 1 exit condition:** All services healthy; `APP_ENV=production` visible in `docker inspect` for each container. Verification: `docker compose exec mcp-server env | grep APP_ENV`.

### Phase 2 — Startup Assertion + Data_env Audit Column (MEDIUM risk, code change)

Two parallel sub-tasks:

2a. mcp-server startup assertion:
- `apps/mcp-server/src/index.ts`: add startup check — if `APP_ENV=production` and `DB_PATH` ends with `.dev.db`, warn + refuse; if `APP_ENV=dev` and `DB_PATH` ends with `market.db`, warn + refuse
- Log line: `[startup] APP_ENV=${APP_ENV} DB_PATH=${DB_PATH}`
- Test: add `ENV-GUARD-1` test (see section 8.1)

2b. Schema: add `data_env TEXT NOT NULL DEFAULT 'production'` to `bctc_refined_units`, `bctc_table_rows`, `news_analysis`, `macro_evidence`, `agent_signals`
- All are additive migrations with `DEFAULT 'production'` — no ALTER TABLE risk
- Existing rows retain `data_env='production'` (correct — they were produced by production)
- INSERT paths for each table stamp `data_env = Bun.env["APP_ENV"] ?? 'production'`

Also: add `APP_ENV=test` to `apps/mcp-server/src/__tests__/setup.ts` preload (one line).

**Phase 2 exit condition:** `ENV-GUARD-1` test passes. QA verifies `data_env` is stamped correctly in test mode. Startup log visible in production container after redeploy.

### Phase 3 — Dev Compose Override + Maintenance Script Guards (MEDIUM risk)

3a. Create `docker-compose.dev.yml` (new file, per section 7.2).

3b. Fix `scripts/run-bt7-backfill.ts`: replace hardcoded path with env var + `--force-dev` guard.

3c. Fix `scripts/purge-phantom-reports.ts`: add `APP_ENV` check + startup log.

3d. Write `docs/protocols/dev-environment.md`: SOP for starting a dev session, seeding the dev DB, running tests, promoting BCTC data, and restoring production.

**Phase 3 exit condition:** Developer can run `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` and observe mcp-server log showing `APP_ENV=dev DB_PATH=/app/data/market.dev.db`. Maintenance scripts refuse to run without `--force-dev` when `APP_ENV != production`.

### Phase 4 — Promotion Script + LanceDB Seeding SOP

4a. Write `scripts/promote-bctc-to-prod.ts`: bespoke promotion script per section 6.2.

4b. Write `scripts/seed-dev-db.ts`: copy `financial_reports` + `pdf_extracted_text` rows by report-id from prod to dev DB.

4c. Add LanceDB path segregation SOP to `docs/protocols/dev-environment.md`.

**Phase 4 exit condition:** Operator can run a complete dev cycle: seed → refine → verify at port 3099 → promote → restart production → verify promotion in prod.

---

## 9. Interaction with Active Sprints

### FU-TRUST-REFRESH (in progress)

**Relationship:** Complementary, non-blocking. TRUST-RED gates (DT-1/DT-2/DT-3) are the semantic defense against fabrication in `push_bctc_refined_unit` / `finalize_bctc_refine`. Env isolation adds the structural complement (wrong env = wrong DB file). They compose:

- A fabricated row rejected by DT-1 gate never reaches `bctc_refined_units` — env isolation not needed for that case
- A legitimate dev dry-run bypassing the gate (e.g. developer writes a tool call with `window_status=DONE` synthetically) lands in `market.dev.db` not `market.db` — env isolation stops what the gate cannot

**Sequencing:** FU-TRUST-REFRESH should complete (and its re-refine of FPT/ACB confirmed clean) BEFORE Phase 2 of env isolation is deployed. Reason: Phase 2 adds the `data_env` column to `bctc_refined_units` — the FU-TRUST-REFRESH re-refine will be the first real usage and should stamp `data_env='production'` on clean rows. If the column is added after re-refine, the FU-TRUST-REFRESH rows will have `DEFAULT 'production'` — also correct, but a full cycle with the stamp active is cleaner.

**FU-TRUST-REFRESH does NOT block Phase 1** (env var tagging, ops-only). Phase 1 can deploy immediately.

### BCTC-LAYOUT-FIRST (in progress or planned)

**Relationship:** Disjoint file scopes. BCTC-LAYOUT-FIRST touches `bctc_layout_units`, `bctc_page_zones`, and the layout pipeline in pdf-extractor. Env isolation touches mcp-server startup, DB schema (additive), compose files, and scripts. No overlap.

**Sequencing:** Can proceed in parallel. BCTC-LAYOUT-FIRST does not touch `docker-compose.yml` or `DB_PATH` logic. Env isolation Phase 1 and Phase 3 can ship independently. Phase 2 (schema) should coordinate on migration ordering if BCTC-LAYOUT-FIRST also adds schema (unlikely, but check before merging).

---

## 10. Owner Map

This is a multi-zone task. PM will split into per-zone subtasks at sprint open.

| Task | Zone | Owner | Estimated effort |
|---|---|---|---|
| Phase 1: Add `APP_ENV` to compose | `ops` | ops | 30 min |
| Phase 2a: Startup assertion in mcp-server | `apps/mcp-server` | dev-mcp-server | 1 hour |
| Phase 2b: Schema columns + INSERT stamps + ENV-GUARD-1 test | `apps/mcp-server` | dev-mcp-server | 2 hours |
| Phase 3a: Create docker-compose.dev.yml | `ops` | ops | 30 min |
| Phase 3b/3c: Fix maintenance scripts | `scripts/` | developer (cross-service zone) | 1 hour |
| Phase 3d: Write dev-environment.md SOP | `docs/` | developer or ops | 1 hour |
| Phase 4a: promote-bctc-to-prod.ts | `scripts/` | dev-mcp-server | 2 hours |
| Phase 4b: seed-dev-db.ts | `scripts/` | dev-mcp-server | 1 hour |
| Phase 4c: LanceDB SOP addendum | `docs/` | dev-rag-service | 30 min |
| QA: ENV-GUARD-1 test, script guard tests, dev session dry-run | QA | qa | 2 hours |

**LanceDB owner:** dev-rag-service owns `LANCEDB_PATH` env var handling. The only code change for LanceDB isolation is in `docker-compose.dev.yml` (ops territory) — rag-service already reads `LANCEDB_PATH` from env (`apps/rag-service/infrastructure/config.py` confirmed). No rag-service code change is needed for isolation; the compose override suffices.

---

## 11. Operator Decision Flags

**OD-A (DESIGN — REQUIRED):** Named volume strategy for dev DB files: same volume (`market_data`) with `.dev.db` suffix, or separate named volume (`market_data_dev`)? Recommendation: same volume (simpler). If the operator wants absolute volume isolation, the compose override adds a second volume declaration. This is a pure ops decision; no code impact.

**OD-B (SCOPE — REQUIRED):** Which tables get the `data_env` audit column? Recommendation (minimum viable): `bctc_refined_units`, `bctc_table_rows`, `news_analysis`, `macro_evidence`, `agent_signals`. Operator may narrow to BCTC-only (`bctc_refined_units`, `bctc_table_rows`) for lower migration surface. Agent-synthesized content tables (`news_analysis`, `macro_evidence`, `agent_signals`) are less critical because the BCTC tables are the proven contamination path.

**OD-C (TIMING — REQUIRED):** Confirm sequencing: Phase 1 (ops) and Phase 3 (compose/scripts) can deploy now. Phase 2 (schema/code) should wait for FU-TRUST-REFRESH to complete re-refine of FPT/ACB. Confirm this ordering is acceptable.

**OD-D (PROMOTION — DECISION):** Is the promotion script (Phase 4a) in scope for the initial sprint? Alternative: document promotion as a manual operator SOP in `docs/protocols/dev-environment.md` (sqlite3 CLI commands, no script). For a single-user system, a documented manual procedure is often sufficient initially. If a script is desired, scope it to `bctc_refined_units` + `bctc_table_rows` only (the proven use case).

**OD-E (PARTIAL STACK):** Should a "partial dev stack" variant be designed now (mcp-server + pdf-extractor only, alongside running production)? This would allow dev BCTC testing without production downtime. It requires more complex Cloudflare/port routing. Recommendation: defer to a future sprint; initial sprint uses the full-replace model (stop prod, start dev). Confirm.

**OD-F (SPRINT NAME AND SIZE):** Is this one sprint (ENV-ISOLATION, all 4 phases) or two (ENV-ISOLATION-P1 covering ops/compose now, ENV-ISOLATION-P2 covering code/schema after FU-TRUST-REFRESH)? Given FU-TRUST-REFRESH timing, splitting is practical. Confirm.

---

## 12. Risk Flags

**RISK-1 (HIGH — operational):** Dev session requires production mcp-server to stop. VPS push routes stop delivering data during dev sessions. Real-time price, news, and macro data gaps during dev windows. Mitigation: schedule dev sessions during VN market off-hours (UTC 09:00 – 01:00 next day). BCTC refine testing is the primary dev use case and does not require live prices.

**RISK-2 (MED — data):** Dev DB starts empty. BCTC refine pipeline requires `pdf_extracted_text` and `financial_reports` rows to exist. Mitigation: seed-dev-db.ts script (Phase 4b). Without the script, developers must manually copy rows — acceptable in Phase 1-3; blocked in Phase 4 until script ships.

**RISK-3 (MED — LanceDB):** LanceDB dev path (`/app/data/lancedb.dev`) starts empty. Intelligence cycle in dev mode cannot retrieve semantic context. This is acceptable for BCTC refine testing (which does not require RAG). If a developer needs RAG in dev mode, they must copy the LanceDB directory from production (not scripted in Phase 1-3). Mitigation: document in SOP.

**RISK-4 (MED — coordination.dev.db):** If `COORDINATION_DB_PATH` is not explicitly set in the dev override and the `coordinationStore.ts` derives it from `DB_PATH` sibling, the dev coordination DB would be `coordination.dev.db` automatically (derived correctly from `market.dev.db` sibling). This is correct behavior — no risk. But making `COORDINATION_DB_PATH` explicit in the compose override is cleaner.

**RISK-5 (LOW — volume deletion):** `docker volume rm market_data` deletes both production and dev DB files. Operator must backup `market.db` before any volume operations. Mitigation: SOP documents this warning prominently.

**RISK-6 (LOW — alert-engine reads):** alert-engine has `DB_PATH` pointing at `market.db` for reads. In dev mode, it reads `market.dev.db`. If the dev DB is empty, alert-engine finds no price thresholds and may behave unexpectedly (no alerts, or default thresholds). This is benign for BCTC testing — alert-engine is not in the BCTC pipeline. Document in SOP.

**RISK-7 (LOW — scripts):** `run-bt7-backfill.ts` hardcoded path bug: low actual risk (path does not resolve on other machines) but structural risk if another developer ever runs it. Fix is in Phase 3.

---

## 13. Build Standard Tag

```
BUILD-STANDARD: lean
NOTE: ENV-ISOLATION — no new microservice.
      All services already exist; this adds env vars (compose), schema columns (additive),
      startup assertions, and scripts. Multi-zone: mcp-server, ops, scripts/, rag-service.
      PM splits into per-zone subtasks; dev-mcp-server is the heaviest implementer.
```

---

## 14. Brief Summary — What This System Achieves

After all 4 phases are complete:

| Threat | Protection | Layer |
|---|---|---|
| Agent (W-2) writes fabricated BCTC data to prod | Dev sessions use `market.dev.db`; prod mcp-server not running | Physical file boundary (primary) |
| Agent writes semantic fabrication past dev guard | TRUST-RED DT-1/DT-2/DT-3 gates | Semantic filter (pre-existing) |
| Developer accidentally calls prod maintenance script against dev DB | `APP_ENV` check + `--force-dev` flag | Script guard |
| Dev embeddings contaminate prod LanceDB index | Dev rag-service uses `lancedb.dev`; prod rag-service uses `lancedb` | Physical directory boundary |
| Misconfigured env var points dev APP_ENV at prod DB file | Startup assertion refuses to start | Startup guard |
| Contaminating row forensic investigation | `data_env` column on high-risk tables | Audit stamp |
| Cron jobs writing derived prod data | Run against whichever DB is active — correct behavior in both envs | Natural consequence of DB_PATH |
| VPS real data entering dev DB | VPS targets port 3000; dev on 3099 — VPS is invisible to dev | Port separation |
| Production analysis agents reading dev data | Gateway always hits port 3000; dev is on 3099, unreachable | Port separation |
| :memory: test isolation regressed | `APP_ENV=test` added to test preload; no file DB touched in tests | Existing + additive |

---

*Brief path:* `docs/architecture-briefs/2026-05-31-fleet-env-isolation-architecture.md`
*Predecessor brief:* `docs/architecture-briefs/2026-05-31-test-prod-data-isolation.md` (commit 192f6c56)
*Read-only pass — no code, DB, test, or compose files were modified.*
*Return to router for operator review. Do NOT dispatch next agent until operator confirms OD-A through OD-F.*
