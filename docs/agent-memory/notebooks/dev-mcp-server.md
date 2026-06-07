# dev-mcp-server -- Notebook

## c377 · 2026-06-06T23:44Z (F-1/FETCH-OPS-PAGE-TRUTH) — COMMITTED c299f6c3

**Task:** F-1 (M) — news domain anchor fix + GET /api/fetch-status endpoint.

**Fix 1 (newsHeadlinesHandler.ts):** Tightened `buildSql()` LIKE filters from `'%bloomberg%'` / `'%reuters%'` to `'%bloomberg.com%'` / `'%reuters.com%'`. Applied same anchor to `deriveProvider()`. Exported `buildSql` for testability.

**Fix 2 (fetchStatusHandler.ts NEW):** `GET /api/fetch-status` — aggregates per-source article freshness from `rag_analyses` (GROUP BY slug via SQLite substr/instr), VPS proxy health via `getVpsProxyHealth()`, BCTC queue counts from `bctc_vps_queue`. Status: fresh (<2h) / stale (≥2h) / no-data. R-5 guard: `WHERE source_url IS NOT NULL AND source_url LIKE 'http%'`.

**server.ts:** Added import + route dispatch at `/api/fetch-status` (NOT `/mcp/api/`) per D-2 gateway alias design.

**Tests:** 21 tests / 0 fail — `F-1-fetch-ops-page-truth.test.ts` (buildSql anchors, deriveSourceSlug, computeFreshnessStatus, handleFetchStatus AC-3/AC-4 integration).

**Live verify:** bloomberg count:0, reuters count:0, /api/fetch-status → sources[13]+vpsProxy{4}+bctcPipeline{pending:370}. Container rebuilt healthy.

Zone health: F-1 REVIEW, 21 tests GREEN, tsc no new errors | HEALTHY

---

## c376 · 2026-06-06T17:00Z (FIX-SLA-WEEKEND-AWARE) — COMMITTED

**Task:** FIX-SLA-WEEKEND-AWARE (S) — calendar-aware SLA for market-hours-only sources.

**Root cause:** prices/foreign_flow VPS fetch loops are DOW/hour-gated (Mon–Fri 02:00–08:59 UTC). SLA monitor used flat 10-min threshold 24/7 → guaranteed CRITICAL every weekend (1462-min breach on Saturday while in designed sleep). `vpsProxyTools.isStale()` and `vpsProxyHealthHandler.computeStale()` also had no market-hours awareness.

**Fix (7 files):**
- `freshnessSlaChecker.ts`: added `MARKET_HOURS_ONLY_SOURCES`, `lastExpectedWindowEnd()`, `minutesSinceLastWindowEnd()`. Updated `getSlaThreshold()` — price/foreign_flow off-hours threshold = `minutesSinceLastWindowEnd + 30 min grace` (data from last session always passes; tight 10-min SLA only during active window).
- `vpsProxyTools.ts`: imported domain helpers; `isStale()` now calendar-aware; `formatHealth()` shows "off-hours" label and separates true-stale from off-hours-stale in summary.
- `vpsProxyHealthHandler.ts`: `computeStale()` calendar-aware; `handleVpsProxyHealth()` accepts injectable `now`; response JSON gains `off_hours` field per service.
- `slaStatusTools.ts`: replaced inline `isVnMarketHours()` with domain import; `getSlaThresholds()` delegates to domain `getSlaThreshold()`; status can now be "off-hours" (not counted as breach in summary).
- `234-vps-health-sla.test.ts`: AC-3+AC-5 fixed to pass market-hours `now`.
- `1352c-freshness-sla-monitor-e2e-sscchecker-guard.test.ts`: A-3 fixed with market-hours `now`.
- `VPT-1-vps-proxy-health-endpoint.test.ts`: (c) updated to use `news` (non-market-hours-only service) for stale test.
- `FIX-SLA-WEEKEND-AWARE.test.ts` (NEW): 21 tests W-1..W-10 covering weekend, Friday-close, Monday-stale, mid-session cases.

**Results:** tsc 0 errors. 69 targeted pass / 0 fail (FIX-SLA + 234 + 1352c + VPT-1 + 1920i). tools=164, sched=72 (baseline intact).

**Live proof path:** `GET /api/vps-proxy-health` → prices.off_hours=true + prices.stale=false (if last push within window); `get_sla_status` → price/foreign_flow status="off-hours" on weekend.

Zone health: SLA weekend false-CRITICAL eliminated, off-hours gate in domain+handler+MCP tool, tsc clean | HEALTHY

---

## c375 · 2026-06-06T12:45Z (FIX-REFINE-IDEM-LOCK-ISO) — COMMITTED 368b7bad

**Task:** FIX-REFINE-IDEM-LOCK-ISO (S) — isolate coordination-store lock in AR-refined-units-idempotency tests.

**Root cause:** `claimTask` used `owner_agent:"refine-orchestrator"` but `releaseTask` was called with `pid-${process.pid}` as `owner_agent` (positional mismatch) → DELETE matched 0 rows → lock zombied until TTL → all same-taskId subsequent calls skipped → 4 scenarios RED. Cross-scenario bleed: `_coordDb` singleton never reset between `it` blocks.

**Fix (2 files):**
- `AR-refined-units-idempotency.test.ts`: added `beforeEach` → `_resetCoordinationDbState()` + `ensureCoordinationTable(db)` + `_injectCoordinationDb(db)` + `afterEach` reset/close; imported 3 seam functions.
- `bctcRefineJob.ts` L512: `releaseTask(taskId, \`pid-${process.pid}\`)` → `releaseTask(taskId, "refine-orchestrator")` (owner_agent must match the claim).

**Results:** 9→13/13 GREEN; task-lock-coordination-store 27/27 still GREEN; tsc 0 errors; no coordination.db on disk (no leak path).

Zone health: 13/13 idempotency GREEN, 27/27 lock-store GREEN, tsc clean | HEALTHY

---

## c378 · 2026-06-07T00:00Z (WF-2/WORKFLOW-FLUIDITY) — REVIEW

**Task:** WF-2 — ORCH-HEAD-CAS + signal_queue retry-read-compare (WORKFLOW-FLUIDITY sprint).

**Implemented (2 files):**
- `apps/mcp-server/src/infrastructure/orchStateStore.ts`: Added `statSync` import. Refactored `appendSignalQueueRow` with `CAS_MAX_RETRIES=3` mtime-compare-retry loop (pre-rename mtime check detects concurrent clobber; retry re-reads file and re-applies append; exhaustion logs WARN + HIGH-SEVERITY extra WARN, no throw). Added new exported `writeHeadAtomic()` function with same CAS loop for FU-ORCH-HEAD-CAS closure. Both functions have full injectable seam (statMtimeFn, warnFn) for deterministic unit tests.
- `.claude/skills/signal-dashboard/SKILL.md`: Added concurrent-writers warning block (3 classes: dev-team/:07, cowork-team/15min, system-auditor/4h) + CAS guard mandate.

**Tests written:** `apps/mcp-server/src/__tests__/WF2-signal-queue-cas.test.ts` — 12 tests (T1-T12): happy path, single-collision retry, exhausted retries drop+warn, CRITICAL/HIGH extra warn, file-absent no-op, summary cap, sequential two-append regression, writeHeadAtomic happy/collision/exhausted/absent.

**Results:** 18 pass / 0 fail (12 new + 6 existing orchStateStore). tsc: 0 new errors (5 pre-existing TECH-DEBT-LINTING unchanged). WF-2 → REVIEW. FU-ORCH-HEAD-CAS watch item removed.

Zone health: WF-2 CAS guard in production path, 18 orchStateStore tests GREEN, tsc clean | HEALTHY

---

## c379 · 2026-06-07T00:00Z (FIX-SLA-EXEMPT-NEWS-SBVFX) — COMMITTED d71e3f2e

**Task:** FIX-SLA-EXEMPT-NEWS-SBVFX (S) — extend calendar-aware SLA exemption to news + sbv_fx.

**Root cause:** Signal `sau-news-sla-critical-202606062231` fired CRITICAL at 289 min vs 30-min SLA at 22:31Z (05:31 VN overnight). 9e74cf0a covered price/foreign_flow only; news + sbv_fx had flat SLAs.

**Fix (5 files):**
- `freshnessSlaChecker.ts`: Added `NEWS_QUIET_HOURS_SOURCES`, `SBV_BUSINESS_DAY_ONLY_SOURCES`, `isVnNewsPublishHours()` (UTC 00:00-14:59 = VN 07:00-21:59; 7 days/week), `isVnSbvBusinessDay()` (delegates to isVnTradingDay), `lastExpectedNewsWindowEnd()`, `minutesSinceLastNewsWindowEnd()`, `lastExpectedSbvWindowEnd()`, `minutesSinceLastSbvWindowEnd()`. `getSlaThreshold()` extended: news quiet-hours and sbv_fx non-business-day use dynamic threshold pattern.
- `slaStatusTools.ts`: offHours flag covers all 3 source classes; label updated.
- `vpsProxyTools.ts`: `NEWS_QUIET_HOURS_SERVICES`/`SBV_BUSINESS_DAY_SERVICES` sets; `isStale()` calendar-aware; `formatHealth()` summary updated.
- `vpsProxyHealthHandler.ts`: `computeStale()` extended; `off_hours` field covers news + sbv.
- `FIX-SLA-EXEMPT-NEWS-SBVFX.test.ts` (NEW): 31 tests N-1..N-8 + S-1..S-8 GREEN.

**Results:** 52 pass / 0 fail (31 new + 21 W-1..W-10 baseline). tools=164, sched=72 (unchanged).

Zone health: news/sbv_fx false-CRITICAL on overnight/weekend eliminated, dynamic threshold in domain, tsc no new errors | HEALTHY

---

## c378 · 2026-06-07 (FIX-PROJECT-STATS-GENERATED)

**Task:** Generate project-stats.json from source — kill hand-typed drift.

**Investigation:** toolCount discrepancy: naive grep counted .bak files (+3) and missed registerTool (-1) = wrong. Correct: 162 unique tool names (161 server.tool + 1 registerTool). Live /health confirms 162. cronJobCount: startScheduler.ts=71 + summaryJobs.ts=5 = 76 total. Health never reported cronJobCount; "77" in task spec was stale/alternate data.

**Generator:** `scripts/gen-project-stats.ts` — walks tools/**/*.ts (server.tool + registerTool) and scheduler/**/*.ts (cron.schedule), atomic temp→validate→rename. Fail-loud on zero count or duplicate tool names.

**Docs updated:** dev-mcp-server flow/main.md Gate-2c/2d probes corrected; system-auditor flow stats-drift step #6 updated to invoke generator.

**Orch-state:** FIX-PROJECT-STATS-GENERATED added to task_board with status REVIEW.

Zone health: gen-project-stats.ts verified 162 tools / 76 crons, atomic write confirmed, no container rebuild needed | HEALTHY

---

## Working Memory

### Baselines (FIX-PROJECT-STATS-GENERATED 2026-06-07)
- tools=162 (server.tool+registerTool unique names), sched=76 (all cron.schedule in scheduler/**/*.ts)
- Generator: `bun scripts/gen-project-stats.ts` — must be run after any tool/cron change

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
