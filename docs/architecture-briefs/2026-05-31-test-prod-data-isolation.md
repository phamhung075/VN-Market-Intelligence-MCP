# Architecture Brief — Test/Prod Data Isolation

**Sprint:** (none — investigation only, pending operator decision)
**Author:** architect
**Date:** 2026-05-31
**Mode:** INVESTIGATION + OPTIONS ANALYSIS ONLY — no sprint opened, operator review required before any build
**Status:** FINDINGS COMPLETE — awaiting operator decision
**Triggered by:** BCTC-TRUST-RED incident (FPT/ACB fabricated data reaching live market.db and analyst pipeline)

---

## Operator Question

"What system can we make to push all mock and test data to a separate environment from production, so test/mock data never pollutes real data and analysis?"

---

## Finding 1 — Data Store Topology

**Single-DB confirmed.** There is one authoritative production database: `market.db`, served via the Docker named volume `vn-market-intelligence-mcp_market_data` mounted at `/app/data` in all containers that use it.

**Services mounting `market_data` volume:**

| Service | Port | DB env var | Write/Read |
|---|---|---|---|
| mcp-server | 3000 | `DB_PATH=/app/data/market.db` | WRITE (sole writer) |
| pdf-extractor | 5001 | `MARKET_DB_PATH=/app/data/market.db` (read-only OCR source) | READ (`pdf_extracted_text` only) |
| technical-analysis | 5003 | `DB_PATH=/app/data/market.db`, `DB_READONLY=true` | READ |
| macro-indicators | 5004 | `DB_PATH=/app/data/market.db`, `DB_READONLY=true` | READ |
| kinh-dich-service | 5005 | `DB_PATH=/app/data/market.db`, `DB_READONLY=true` | READ |
| news-fetch | 5008 | `DB_PATH=/app/data/market.db`, `DB_READONLY=true` | READ |

**mcp-server is the single writer.** All other services are read-only consumers. The architecture doc (`docs/ARCHITECTURE.md`) explicitly states: `market.db — WRITE: mcp-server only`.

**No staging copy exists today.** A `docker volume ls` shows five named volumes (`bctc-page-images`, `market_data`, `pek_model_cache`, `vn_market_data`, `vnmarket_market_data`). The extra `vn_market_data` and `vnmarket_market_data` are orphans from compose project-name drift, not intentional staging. There is no `market.staging.db`, `market.test.db`, or separate compose project for dev/staging.

**On-host DB artefacts (not used by containers):**
- `data/market.db` (3.5 MB, active — the volume's host-side backing store under Docker's VM, mirrored to `data/` on the host through Docker Desktop bind mount)
- `apps/mcp-server/market.db` (0 bytes — placeholder, not used)
- `market.db` at repo root (0 bytes — placeholder, not used)

**Analyst read path:** The cowork analysis agents and market dishes reach `market.db` exclusively through MCP tool calls via the claude.ai gateway (`call_tool(server="vn-market", tool="get_bctc_full", ...)` etc.). There is no direct DB connection from any agent; all reads flow through mcp-server's tool handlers.

---

## Finding 2 — Test Isolation Today

**mcp-server TypeScript tests: isolated and correct.**

The test suite uses `apps/mcp-server/src/__tests__/setup.ts` as a Bun preload, which sets `Bun.env["DB_PATH"] = ":memory:"` before any module imports. This intercepts the DB singleton at the earliest possible point. Every test file that opens a DB through `getDb()` / `initDatabase()` gets an in-memory SQLite instance. The preload is enforced by `bunfig.toml` `preload` configuration.

Two dedicated isolation test files exist:
- `1400-db-isolation.test.ts` — asserts `Bun.env["DB_PATH"] === ":memory:"` and verifies the DB singleton file is not the production path.
- `1347a-test-db-isolation.test.ts` — opens the production DB read-only and checks for 0 fixture-pattern rows in `telegram_reports`; documents a historical leak that was cleaned.

**This pattern is universal for all `apps/mcp-server/src/__tests__/*.test.ts` files.**

Several individual test files also set `Bun.env["DB_PATH"] = ":memory:"` redundantly (double guard pattern). None of the test files open the on-disk `market.db` with write access.

**Python tests (pdf-extractor): isolated and correct.**

`apps/pdf-extractor/__tests__/unit/test_ocr_text_source.py` and `test_fu1_fail_loud.py` use `tempfile.mkdtemp()` to create isolated temporary SQLite files. No test opens `/app/data/market.db` or `data/market.db`.

Integration tests (`test_bt3_fix2_full_pipeline.py`) reference `/app/data/pdfs/` for PDF paths but are designed to run inside the container where those paths resolve to the real test corpus, not writes to the live DB.

**Migration tests (scripts/migrations/__tests__/): isolated.**

All three migration test files use either `new Database(":memory:")` or `mkdtempSync()` temporary paths. No live DB access.

**Gap found — scripts that write to the live on-disk DB:**

| Script | Path | Write mode | Status |
|---|---|---|---|
| `scripts/run-bt7-backfill.ts` | Hardcodes `/Users/admin/…/apps/mcp-server/data/market.db` | `readwrite: true` | One-shot backfill; the hardcoded path is the developer's local path, not the container volume path. In practice this path does not exist (it resolves to the host's `apps/mcp-server/data/` subdirectory, not the Docker volume's backing store). Low risk in practice but structurally unsound. |
| `scripts/purge-phantom-reports.ts` | `resolve(PROJECT_ROOT, "data", "market.db")` | Writable | Purge script; opens `data/market.db` (the host-side mirror of the Docker volume). Intended for forensic cleanup. No environment guard. |

These two scripts are the only non-test code that opens `market.db` with write access outside the Docker container. Both are one-shot maintenance scripts, not cron jobs. They carry a structural risk: running them in the wrong context could write to or delete from production data.

---

## Finding 3 — Write Vectors Into Production

Every path that writes to the live `market.db` runs through mcp-server. The complete enumeration:

**W-1: HTTP push routes (VPS-originated, real production data)**

| Route | Caller | Writes to |
|---|---|---|
| `POST /api/push-prices` | stock-price service (VPS feed) | `market_prices`, `market_prices_history`, `daily_ohlcv` |
| `POST /api/push-foreign-flow` | VPS foreign-flow service | `foreign_flow` |
| `POST /api/push-news` | VPS news service | `news_articles` |
| `POST /api/push-sbv-rates` | VPS SBV rate service | `macro_indicators` |
| `POST /api/push-reuters` | news-fetch service | `news_articles` |
| `POST /api/push-tradingeconomics` | VPS scraper | `macro_indicators` |
| `POST /api/push-gso` | VPS scraper | `macro_indicators` |
| `POST /api/push-bctc-pdf` | VPS BCTC fetch service | `bctc_vps_queue`, `financial_reports` metadata |
| `POST /api/push-ohlcv-history` | stock-price service | `daily_ohlcv` |
| `POST /api/push-bctc-table` | pdf-extractor | `bctc_table_rows`, `bctc_balance_checks` |
| `POST /api/push-bctc-md-tables` | pdf-extractor | `bctc_md_tables` |
| `POST /api/push-bctc-layout` | pdf-extractor | `bctc_layout_units`, `bctc_page_zones` |
| `POST /api/enrich-queue-item` | BCTC queue enricher cron | `bctc_vps_queue` |
| `POST /api/bctc-inspect/correct/` | Human operator (browser) | `bctc_human_corrections` |
| `POST /api/bctc-inspect/confirm/` | Human operator (browser) | `financial_reports.confirm_status` |

**W-2: MCP tool calls (agent-originated via gateway)**

| Tool | Writes to |
|---|---|
| `push_bctc_refined_unit` | `bctc_refined_units` |
| `finalize_bctc_refine` | `bctc_table_rows`, `financial_reports.refine_status` |
| `bctc_skip` | `financial_reports.refine_status` |
| `set_alert`, `update_alert`, `delete_alert` | `price_alerts` |
| `save_agent_memory_update` | `agent_memory` |
| `update_watchlist` | `watchlist` |
| `save_macro_evidence` | `macro_evidence` |
| `save_news_analysis` | `news_analysis` |

**W-3: Cron-driven application use cases (mcp-server internal, scheduled)**

The 40+ cron jobs in `cronConfig.ts` drive application use cases that write to:
- `telegram_reports` (morning briefing, evening summary, alerts, prediction reports)
- `agent_signals`, `hexagram_signals` (intelligence cycle)
- `prediction_market_outcomes` (prediction resolution)
- `calibration_reports` (calibration cron)
- `job_runs`, `cron_job_runs`, `scheduler_locks` (observability)
- `financial_reports.text_status`, `pdf_extracted_text` (BCTC reparse cron)

**W-4: One-shot dev/maintenance scripts (host-side, outside Docker)**

- `scripts/run-bt7-backfill.ts` — hardcoded local path, write mode
- `scripts/purge-phantom-reports.ts` — resolves `data/market.db`, write mode

**Which write vectors could write non-real / test / fabricated data?**

| Vector | Risk | How it reached prod in the BCTC-TRUST-RED incident |
|---|---|---|
| W-2: `push_bctc_refined_unit` via gateway | HIGH | This is exactly how FPT/ACB digit-run data entered. An agent (or developer via gateway) calls the tool with fabricated markdown. Before TRUST-RED: unconditional `INSERT OR REPLACE`. After TRUST-RED: DT-1/DT-2/DT-3 gates block obvious fabrication, but the write path still accepts all traffic from the gateway with no environment guard. |
| W-2: `finalize_bctc_refine` via gateway | HIGH | Called by fleet cron AND callable manually via gateway. No env guard. |
| W-4: maintenance scripts | MED | `purge-phantom-reports.ts` opens `data/market.db` writably with no confirmation prompt. `run-bt7-backfill.ts` uses hardcoded path (low actual risk since path doesn't resolve to volume, but pattern is dangerous). |
| W-1: `POST /api/push-bctc-table` | LOW | Called only by pdf-extractor after extracting from real PDFs. But: a developer or agent calling the pdf-extractor's extract endpoint against a test PDF would produce structured rows that flow into production. |
| W-3: cron jobs | NEAR-ZERO | These only write derived/aggregated data from already-stored production data. No agent hallucination path. |

---

## Finding 4 — Provenance: Existing Flags

The following columns carry data quality signals today:

| Column | Table | Values | What it tracks |
|---|---|---|---|
| `source_confidence` | `bctc_table_rows` | `REAL 0.0–1.0` | Per-row OCR legibility confidence, set by parser |
| `confirm_status` | `financial_reports` | `PENDING`, `CONFIRMED` | Human confirm gate (BCTC-HUMAN-CONFIRM sprint) |
| `refine_status` | `financial_reports` | `PENDING`, `IN_PROGRESS`, `DONE`, `FAILED`, `PARTIAL`, `REJECTED_SANITY` | Refine lifecycle |
| `window_status` | `bctc_refined_units` | `DONE`, `FAILED`, `REJECTED_SANITY` | Per-unit sanity gate (TRUST-RED) |
| `validation_status` | `financial_reports` | `pending`, others | Legacy validation flag |
| `ocr_confidence` | `financial_reports` | `REAL` | OCR-layer confidence |
| `extraction_method` | `financial_reports` | `ocr_pdf`, others | How the data was extracted |
| `quarantined` | `bctc_layout_units` | `0`, `1` | Layout-first quarantine flag |

**There is NO environment/source/is_synthetic column on any table.** No column distinguishes a row written by the production cron from a row written during a dev dry-run or a test fixture. The `extraction_method` field is the closest analogue but it tracks OCR technique, not whether the row came from a production pipeline run vs. a developer probe. The `refine_status=REJECTED_SANITY` value (TRUST-RED) blocks fabricated data at the publish gate but does not tag the row's origin environment.

**Conclusion:** The existing provenance model tracks data quality (confidence, validation) and lifecycle state (refine_status, window_status) but has no environment dimension. There is no structural barrier today that prevents a gateway call made during development from reaching the same DB as production cron output.

---

## Option 1 — Data-Provenance Tagging + Hard Prod-Write Guard (Lightweight)

**Concept:** Add an `env` TEXT column (`'production'`, `'dev'`, `'test'`) to the tables that are write vectors. A server-level `APP_ENV` env var gates which writes are accepted. Production reads filter to `env='production'`. Test/dev writes must carry `env='dev'` or `'test'` or are rejected by the guard.

**Scope of change:**

- `schema-financial-reports.ts`: `ALTER TABLE bctc_refined_units ADD COLUMN env TEXT NOT NULL DEFAULT 'production'`; same for `bctc_table_rows`, `financial_reports` (additive — no migration risk).
- `pushBctcRefinedUnitTool.ts`, `pushBctcTableHandler.ts`, `finalizeBctcRefineTool.ts`: read `Bun.env["APP_ENV"] ?? 'production'`; stamp every INSERT with `env = APP_ENV`.
- `bctcFullTools.ts` (`get_bctc_full`) and related read tools: add `WHERE env = 'production'` or equivalent filter.
- `docker-compose.yml` production: `APP_ENV: production`. Dev/test sessions: `APP_ENV: dev`.

**Does it stop all four write vectors?**

| Vector | Stopped? | Notes |
|---|---|---|
| W-2: push_bctc_refined_unit (agent-originated) | Partially | If the agent session has `APP_ENV=production` (the normal case), it can still write dev data unless the caller explicitly sets `env='dev'`. The guard only helps if the test/dev writer ALSO runs in a different `APP_ENV`. A developer using the gateway against the production container still writes `env='production'`. |
| W-2: finalize_bctc_refine | Same as above | |
| W-4: maintenance scripts | No | Scripts don't read `APP_ENV`. Must add explicit guard. |
| W-1: HTTP push routes | Only if caller sets header | Callers (VPS services) don't pass `APP_ENV`. Would require per-caller tagging — infeasible without changing all VPS scripts. |

**Does it break the `:memory:` test pattern?** No. Tests use `:memory:` DB, never touch the column.

**Dev-friction:** Low for new code (stamp env at write time). Non-trivial for reads: every query that should respect the env filter must be updated (scattered across multiple tool handlers). Risk of filter drift — a new tool added later that does not apply the filter creates a silent contamination path.

**Migration cost:** Additive schema changes (no ALTER with NOT NULL on existing rows — need DEFAULT 'production' to preserve existing rows). Low cost.

**How it interacts with TRUST-RED gates:** Complementary. TRUST-RED gates block fabricated data at the semantic level; provenance tagging adds an identity layer. They are independent mechanisms.

**How it interacts with FU-TRUST-REFRESH:** No conflict. The re-refine path (`push_bctc_refined_unit`, `finalize_bctc_refine`) would stamp `env='production'` on legitimate cron output. No change to the re-refine flow itself.

**Verdict:** Weakest isolation. The guard is only effective when the dev/test caller knows to set `APP_ENV=dev` AND uses a different Docker environment from production. A developer calling `push_bctc_refined_unit` via the production gateway container with `APP_ENV=production` (the default) bypasses the guard entirely. The filter-drift risk on read paths is a maintenance burden. Does not structurally separate the DB.

**Risk rating:** Read-path filter can be bypassed by any caller with access to the gateway. Stops accidental pollution but not intentional or misconfigured dev writes against prod.

---

## Option 2 — Separate Physical DB File Per Environment (Medium)

**Concept:** Select the SQLite file via env var (`DB_PATH`). Production cron and dishes use `market.db`; test/dev refine dry-runs and developer probes use `market.staging.db` (or `market.dev.db`). A promotion step copies vetted staging data to prod. The env var `DB_PATH` already exists per service in `docker-compose.yml`.

**Mechanism:**

- `docker-compose.yml` production: `DB_PATH: /app/data/market.db` (unchanged).
- A new `docker-compose.dev.yml` override (or a separate env file) flips: `DB_PATH: /app/data/market.staging.db`.
- When a developer wants to test the refine pipeline against real PDFs without touching prod: `docker-compose -f docker-compose.yml -f docker-compose.dev.yml up` — mcp-server writes to `market.staging.db`.
- Alternatively: a single toggle env var in `.env.local` (git-ignored) that overrides `DB_PATH` for the local session.
- A promotion script copies specific rows from `market.staging.db → market.db` when the data is verified clean (e.g. after a QA-confirmed refine run).

**Does it stop all four write vectors?**

| Vector | Stopped? | Notes |
|---|---|---|
| W-2: push_bctc_refined_unit (agent-originated) | YES — structurally | If dev session uses `market.staging.db`, gateway calls against that session cannot reach `market.db`. Physical separation, not a logic filter. |
| W-2: finalize_bctc_refine | YES | Same — writes go to whichever DB the running mcp-server is configured with. |
| W-4: maintenance scripts | Partially | Scripts must read `DB_PATH` from env (not hardcode). `purge-phantom-reports.ts` already reads `DB_PATH`; `run-bt7-backfill.ts` has a hardcoded path (must be fixed). |
| W-1: HTTP push routes (VPS-originated real data) | YES | VPS push routes always target `DB_PATH`. If dev session uses `market.staging.db`, real VPS data would also go to staging. This means staging and prod must NOT run simultaneously on the same port — or the VPS must target a separate endpoint. |

**Staging vs. prod service overlap:** Both production and dev/staging cannot run simultaneously on the same ports (mcp-server port 3000). The single-host architecture means either: (a) dev sessions require stopping the production mcp-server (unacceptable for a live system), or (b) dev sessions run on a different port (feasible but requires a port-mapped second compose project). This is the main friction point.

**Does it break the `:memory:` test pattern?** No. Tests use `:memory:` (preloaded by `setup.ts`), which is orthogonal to the on-disk file selection. The existing test isolation is not affected.

**Dev-friction:** Moderate. Developers must remember to use the dev compose override or env file. The VPS push routes present a problem: if the dev mcp-server instance is running, VPS push data goes to `market.staging.db` (real market data goes to staging, not prod). This means the dev instance should either: (1) not accept VPS push routes at all, or (2) run at a different port so VPS scripts target only the production endpoint. Option (1) requires blocking W-1 routes in dev mode — feasible with an `APP_ENV` check at the route level.

**Migration cost:** Low for the DB file selection (env var already exists). Medium for:
- The VPS push route conflict (requires route-level `APP_ENV` guard or port separation).
- The promotion script (new dev task — query, INSERT SELECT, or file copy).
- Maintenance scripts must respect `DB_PATH` (minor code fix).

**How it interacts with TRUST-RED gates:** No conflict. Gates operate on whatever DB is active. They remain effective regardless of which DB file is selected.

**How it interacts with FU-TRUST-REFRESH:** Compatible. The re-refine can be run against `market.staging.db` first (staging run), verified clean by QA, then the re-refine rerun on prod — or the staging results are promoted row-by-row.

**Verdict:** Strong structural isolation for agent-originated (W-2) write vectors. The VPS push routes (W-1) are the main friction: you cannot run a dev mcp-server on the same port as prod without redirecting VPS data. Practical workaround: dev mcp-server runs at a different port (e.g. 3099) with an env file. The promotion step adds explicit control over when staging data enters prod.

**Risk rating:** Much stronger than Option 1. The physical file boundary prevents any path from accidentally crossing environments as long as `DB_PATH` is correctly set. The residual risk is a misconfigured `DB_PATH` in the dev env file (rare; can be mitigated by a startup check that logs which DB is active).

---

## Option 3 — Full Separate Environment Stack (Heavyweight)

**Concept:** A second Docker Compose project with its own service instances (mcp-server, pdf-extractor, etc.) and its own named volumes. The dev/test environment is an entirely separate process tree, separate volume names, separate ports. An explicit data-promotion pipeline copies vetted data from dev volumes to prod volumes (either via `docker cp` of SQLite files or row-by-row SQL).

**Mechanism:**

- `docker-compose.dev.yml` (new file, separate project name): defines all services with distinct ports (mcp-server dev at 3099, pdf-extractor dev at 5099, etc.) and separate named volumes (`market_data_dev:/app/data`).
- Production compose project runs unaffected at ports 3000/5001/etc.
- Dev sessions: `docker compose -p vn-market-dev -f docker-compose.dev.yml up`. Completely separate volume, completely separate DB file, completely separate container network.
- Promotion: `docker run --rm -v market_data_dev:/src -v market_data:/dst alpine sh -c "sqlite3 /src/market.db '.dump financial_reports' | sqlite3 /dst/market.db"` (conceptual; real promotion is a bespoke SQL-level export/import of vetted rows).

**Does it stop all four write vectors?**

| Vector | Stopped? | Notes |
|---|---|---|
| W-2: push_bctc_refined_unit | YES — absolute | Dev instance physically cannot reach prod DB volume. Network namespace separation by Docker project. |
| W-2: finalize_bctc_refine | YES | Same. |
| W-4: maintenance scripts | YES if scripts target `DB_PATH` from env | Scripts still need to read env — same fix as Option 2. |
| W-1: HTTP push routes (VPS) | YES | VPS push routes target the production stack's port 3000 only. Dev stack at port 3099 is invisible to VPS. Real production data never enters dev volume. |

**Does it break the `:memory:` test pattern?** No. Tests are in-process and use `:memory:` — independent of Docker volumes.

**Dev-friction:** High. Developers must maintain two compose projects, manage two Docker networks, wait for the dev stack to start (2+ minutes cold start, 8GB memory cap constraint — see below). The dev stack runs all the same services (mcp-server, pdf-extractor, rag-service, etc.) — each consumes memory. On the host (16GB Mac, Docker capped at 8GB per memory panic lesson), running both stacks simultaneously is infeasible. The dev stack must replace the prod stack, not augment it.

**Memory constraint (binding):** The 16GB Mac with Docker capped at 8GB cannot run two full stacks simultaneously. Stack 1 (production, all 10 services) already uses the Docker cap. Stack 2 (dev, all 10 services) would require a second 8GB budget — impossible on this host. This means Option 3 is a sequential model (shut down prod, bring up dev, promote, shut down dev, restart prod) — high operational friction, production downtime for dev work.

**Migration cost:** Highest. Requires:
- New `docker-compose.dev.yml` (or override file with all port remappings and volume name changes).
- VPS push scripts targeting only port 3000 (already the case — no change needed, but worth verifying).
- Promotion script (complex: what tables to promote, in what order, how to handle FK constraints).
- Operational SOPs for start/stop of each environment.

**How it interacts with TRUST-RED gates:** No conflict. Dev instance has its own DB; gates apply to the dev instance's `market_data_dev` volume.

**How it interacts with FU-TRUST-REFRESH:** The re-refine would be a natural fit for the dev stack: fix the seam, run refine in dev, verify gates pass, promote to prod. Adds a step but the process is clean.

**Verdict:** Absolute isolation. Zero contamination risk by construction. Blocked by the 16GB Mac memory constraint in its full-stack form. If partial stack is acceptable (dev mcp-server + pdf-extractor only, without rag/TA/kinh-dich/etc.), memory footprint drops to ~3.5–4GB — within the Docker cap alongside the production stack at partial capacity. But partial dev stack means some analysis tools are missing.

**Risk rating:** Zero contamination risk if properly operated. Operational risk = production downtime during dev/test sessions (unless partial stack is used).

---

## Comparative Assessment

| Criterion | Option 1 (provenance tags) | Option 2 (separate DB file) | Option 3 (separate full stack) |
|---|---|---|---|
| Stops W-2 (agent writes) | Partial (requires caller to set APP_ENV=dev) | Yes (structural) | Yes (absolute) |
| Stops W-4 (maintenance scripts) | No (scripts bypass) | Partial (scripts must read DB_PATH) | Partial (same fix needed) |
| Stops W-1 (VPS push on prod port) | No | No (VPS hits whichever server is on port 3000) | Yes (dev stack on different port) |
| Stops W-3 (cron jobs) | N/A — cron writes are always real | N/A | N/A |
| Breaks :memory: test pattern | No | No | No |
| Migration cost | Low | Medium | High |
| Dev friction | Low (but deceptive — easy to bypass) | Medium (env file, port discipline) | High (start/stop stacks) |
| Memory constraint (16GB Mac) | None | None (same single stack) | Blocking for full dual stack |
| Interacts with TRUST-RED gates | Complementary | Neutral | Neutral |
| Read-path changes required | Yes (filter WHERE env='production') | No | No |
| Promotion step | No | Yes (explicit SQL copy) | Yes (complex dump/import) |
| Prevents BCTC-TRUST-RED recurrence | Partially (filter could be bypassed or drift) | Yes (physical file boundary) | Yes (absolute) |

---

## Single Recommendation

**Implement Option 2 with a scoped subset of Option 1's provenance tagging for audit visibility.**

### Rationale

Option 2 provides structural isolation — a physical file boundary that cannot be bypassed by write-path logic errors or filter drift. The existing `DB_PATH` env var pattern (already in docker-compose.yml for every service) is the natural extension point. No schema changes, no filter maintenance, no read-path modifications.

The memory constraint eliminates Option 3 as a practical choice for this host. Option 1 alone is insufficient: it requires every write path and every read path to correctly implement the env filter, and a single missed filter (a new tool added without the WHERE clause) silently re-opens the contamination path.

**Provenance tag (from Option 1) as an audit supplement:** Add `data_env TEXT NOT NULL DEFAULT 'production'` to `bctc_refined_units` and `bctc_table_rows` only (the two tables proven to be contamination targets). Write `Bun.env["APP_ENV"] ?? 'production'` at INSERT time. This is NOT a read-path filter — it is an audit column for forensic investigation (the TRUST-RED incident showed we had no way to trace which run produced a row). The TRUST-RED gates (DT-1/DT-2/DT-3) remain the primary semantic defense.

### Recommended Sequencing

**Phase 1 (prerequisite — already in FU-TRUST-REFRESH):**
Fix the broken OCR seam (`main.py` wiring) and ship TRUST-RED gates (DT-1/DT-2/DT-3). These are already designed and in progress. They handle the immediate fabrication risk.

**Phase 2 (this brief's recommendation — new sprint ENV-ISOLATION, small):**

Task ENV-1 (dev-mcp-server, ~1 hour):
- Add `data_env TEXT NOT NULL DEFAULT 'production'` to `bctc_refined_units` schema (additive migration — no ALTER TABLE on NOT NULL without DEFAULT; DEFAULT 'production' is safe for existing rows).
- Same column on `bctc_table_rows`.
- In `pushBctcRefinedUnitTool.ts` and `pushBctcTableHandler.ts` and `finalizeBctcRefineTool.ts`: stamp `data_env = Bun.env["APP_ENV"] ?? 'production'` on every INSERT.

Task ENV-2 (ops, ~30 min):
- Add `APP_ENV=production` to `docker-compose.yml` mcp-server environment block.
- Create `docker-compose.dev.yml` override with: `APP_ENV=dev`, `DB_PATH=/app/data/market.dev.db`, different host port (e.g. `3099:3000`). The `market_data` volume name stays the same — dev and prod share the named volume but use different DB filenames within it (SQLite file selection via `DB_PATH`).

Task ENV-3 (ops, ~30 min):
- Fix `scripts/run-bt7-backfill.ts`: remove hardcoded path, replace with `process.env.DB_PATH ?? resolve(PROJECT_ROOT, "data", "market.db")`.
- Fix `scripts/purge-phantom-reports.ts`: add explicit `APP_ENV` check — refuse to run if `APP_ENV !== 'production'` and `--force` flag is not passed.
- Add a startup log line in mcp-server that prints `[startup] APP_ENV=${APP_ENV} DB_PATH=${DB_PATH}` — operators can verify correct configuration at boot.

Task ENV-4 (dev-mcp-server, QA, ~1 hour):
- Write one test: `ENV-GUARD-1` — verify that a `push_bctc_refined_unit` call in a test session stamps `data_env='test'` (set `Bun.env["APP_ENV"]="test"` in test file, call handler, check column value via `:memory:` DB query).
- This test proves the stamp path without requiring a second DB file.

**What the promotion step looks like (ops SOP, not code):**

When a dev refine run on `market.dev.db` produces clean data (verified by QA via `get_bctc_full` against the dev mcp-server at port 3099):

```bash
# In-container promotion (example — must be adapted per table structure)
bun run /tmp/promote.ts --src /app/data/market.dev.db --dst /app/data/market.db \
  --table bctc_refined_units --report-id <uuid> --env dev
# promote.ts: SELECT from dev DB WHERE report_id=? AND data_env='dev', INSERT OR REPLACE into prod DB
```

This is a one-screen bespoke script, not a framework. It should be written as Task ENV-2b.

### What This Does and Does Not Solve

**Solved:**
- Agent-originated writes (W-2) in a dev session go to `market.dev.db`, not `market.db`. Physical boundary.
- Maintenance scripts are guarded by `APP_ENV` check.
- Every contaminating row has an audit stamp (`data_env`) for forensic investigation.
- No disruption to the `:memory:` test pattern.
- No read-path filter changes — production reads are unaffected.

**Not solved (out of scope, by design):**
- A developer who deliberately calls `push_bctc_refined_unit` against the production gateway (port 3000, `APP_ENV=production`) can still write to `market.db`. This is a policy/access-control problem, not an architecture problem. The TRUST-RED gates (DT-1/DT-2/DT-3) remain the defense for this case.
- VPS push routes (W-1) always target port 3000 (production). In a dev session on a different port (3099), VPS data does not flow in — this is correct behavior for the dev DB but means the dev DB has no real price/news/macro data (expected trade-off; dev refine pipeline uses the existing market.db's `pdf_extracted_text` as OCR source, not market price data).

---

## Operator Decision Flags

**OD-1 (REQUIRED):** Approve Option 2 + audit supplement as the recommended path. If the operator prefers Option 1 (lighter, lower friction) or Option 3 (absolute isolation, heavier), the architecture changes are different.

**OD-2 (DESIGN DECISION):** Should the dev compose override use a different file within the same named volume (`market.dev.db` inside `market_data:/app/data`) or a separate named volume (`market_data_dev`)? Same-volume approach is simpler (no volume provisioning) but means a `docker volume rm market_data` deletes both prod and dev DBs. Separate volume is cleaner but requires the VPS push routes to NOT point at the dev instance — which is already the case since VPS targets port 3000 only.

**OD-3 (SCOPE):** Should the `data_env` audit column be added to ALL write tables (telegram_reports, news_articles, macro_indicators, etc.) or only to the BCTC financial-report tables (`bctc_refined_units`, `bctc_table_rows`, `financial_reports`)? The BCTC tables are the contamination-proven target. Adding to all tables is broader coverage but larger change surface.

**OD-4 (PROMOTION STEP):** Does the operator want a bespoke promotion script (Task ENV-2b) in this sprint, or is the promotion step a manual ops procedure documented in `docs/protocols/`? For a single-user system, a documented manual procedure may be sufficient initially.

**OD-5 (TIMING):** This sprint should be sequenced AFTER FU-TRUST-REFRESH ships (the re-refine seam fix and verified clean re-refine of FPT/ACB). ENV-ISOLATION can proceed in parallel with BCTC-LAYOUT-FIRST (disjoint file scopes) but should not start until the TRUST-RED gates are live in production (already shipped per BCTC-TRUST-RED EXIT e0c900d0).

---

## Memory Constraint Interaction

The 16GB Mac with Docker capped at 8GB (memory panic lesson) is a binding constraint on Option 3. With the production stack consuming the Docker cap, a full second stack is not feasible simultaneously. Option 2 avoids this: both prod and dev mcp-server share the same Docker project; only one set of service containers is running at a time. The dev compose override replaces the production config (down prod, up dev with override) rather than adding containers. Memory footprint is identical to the production stack.

A partial Option 3 (dev mcp-server + pdf-extractor only, ~1.5–2GB overhead) is feasible alongside production if operator decides the partial stack is acceptable for dev purposes. This would allow simultaneous prod + dev without stopping production — at the cost of not having TA/macro/kinh-dich available on the dev stack.

---

## Build Standard Tag

```
BUILD-STANDARD: lean
NOTE: Option 2 recommendation. mcp-server zone exists; pdf-extractor zone exists.
      No new microservice, no new Docker volume (same named volume, different DB file path).
      ENV-ISOLATION is additive-only: new schema column (DEFAULT), env var in compose,
      two script fixes, one startup log line. dev-mcp-server + ops tasks only.
```

---

## Risk Flags

**RISK-1 (HIGH):** If a developer runs the dev compose override but forgets to change the VPS push routes' target endpoint, real market price data will continue flowing to the production port (3000) and into `market.db` — not to the dev DB. This is correct behavior (VPS must target prod), but the developer must understand that the dev DB will not receive live price/news data and must seed it manually if needed for testing. Mitigation: document in `docs/protocols/dev-environment.md`.

**RISK-2 (MED):** The `data_env` audit column DEFAULT 'production' means all existing rows in `bctc_refined_units` and `bctc_table_rows` are stamped 'production'. This is correct for rows that were written by the production pipeline. The fabricated FPT/ACB rows were already purged (TRUST-RED). No historical re-audit is needed.

**RISK-3 (MED):** The promotion script (ENV-2b) must handle FK constraints: `bctc_table_rows.report_id` references `financial_reports.id`. Promoting table rows without first promoting the parent `financial_reports` row will violate FK integrity if FK enforcement is ON in the dest DB. The promotion script must promote parent-then-child in a transaction. Mitigation: architect specifies the exact ORDER in the promotion script spec when ENV-2b is defined.

**RISK-4 (LOW):** SQLite does not enforce row-level isolation within a file. Two concurrent writers to `market.dev.db` (e.g. developer + dev cron both running) could interleave. The single-writer discipline (mcp-server sole writer) already enforces this; the dev environment must respect the same discipline. No new risk.

**RISK-5 (LOW — scripts):** `scripts/run-bt7-backfill.ts` has a hardcoded absolute path to the developer's local filesystem. If another developer clones the repo and runs this script, it will fail (path not found) or, worse, if the path accidentally resolves to something on the new developer's machine, corrupt a different DB. Fix is simple (ENV-3): replace with `process.env.DB_PATH`. This is a low-urgency fix but should ship in ENV-ISOLATION.
