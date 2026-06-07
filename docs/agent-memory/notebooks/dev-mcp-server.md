# dev-mcp-server -- Notebook

## c381 · 2026-06-07T02:39Z (FIX-BCTC-IDENTITY-SERVE-GUARD) — COMMITTED 921be65a

**Task:** Balance-sheet identity guard in get_financial_summary serve path + CTG 2026-Q1 triage. *(entry numbered c347 in stale worktree; renumbered at merge)*

**Root cause:** 3rd occurrence of OCR-corruption fingerprint served raw (VNM→VEA→CTG).
CTG 2026-Q1: total_assets=0, equity_total=244,904,306, net_margin_pct=229,157% at 56% confidence.
Guard added at serve layer in `reports.ts` — not a per-ticker patch.

**Guard logic (reports.ts):**
- Condition: `total_assets <= 0 OR total_assets < equity_total`
- Response: `[CORRUPT DATA — SKIP]` + explicit reason + confidence=0 (forced)
- Derived ratios (margin, ROE, ROA, D/E) suppressed entirely
- Live CTG confirmed: total_assets=0 < equity_total=244,904,306 → guard fires

**CTG re-extraction attempt:**
- Triggered `POST /api/refine-bctc/49c11ce2` → FAILED
- Root cause: `spawnWindowSubagent` requires `deps.spawnSubagent` injected by fleet cron context; on-demand handler does not provide it
- CTG remains refine_status=FAILED, has_pdf=true, has_ocr=true (56.25% confidence)
- Re-extraction deferred to fleet cron cycle (ops/bctc-analyst scope)

**FU-CTG-REFINE-PICKUP disposition:** SUPERSEDED. Guard makes CTG serve honest corrupt skip immediately. Full re-extraction is separate fleet-cron concern.

**Tests:** 5 new DV-BCTC-GUARD-* (RED→GREEN) in fix-bctc-identity-serve-guard.test.ts
- G1 CTG fingerprint (assets=0) → CORRUPT + zero-or-negative reason
- G2 assets < equity (assets=100, equity=244904000) → CORRUPT + identity-violated reason
- G3 valid report passes guard unchanged
- G4 assets=0, equity=0 → zero guard fires
- G5 assets=equity (no-debt) → passes guard (equality is valid)

**Gates:** tsc EXIT 0 | 10 pass / 0 fail (085+new) | tools=156/sched=70 in stale worktree base (main baseline 162/76 — guard adds no tool/cron)

**INV-GATEWAY-1:** MCP gateway unavailable in worktree session — commit-mutex and telegram skipped.

---

## c378 · 2026-06-07T01:21Z (FIX-ORCH-KEY-NORMALIZE-TASKID) — REVIEW

**Task:** FIX-ORCH-KEY-NORMALIZE-TASKID (FIX, S, HIGH) — normalize `task_id` -> `id` across all task_board rows.

**Migration:** Python3 one-pass script. 189 rows migrated: 159 active_sprints (all `task_id` only), 27 backlog (`task_id` only), 1 backlog (`BA-ORCH-TASK-CANON` had both keys — kept `id`, dropped `task_id`), 2 done (`task_id` only). Row counts unchanged: 159/38/84. AC1 task_id=0. AC4 signal_queue byte-identical (3 rows, 2 DONE + 1 READ).

**Code change (tasksMdJanitorJob.ts):** Read-path coalesce added to `parseTasksFromOrchState` and `parseTasksFromOrchStateJson`: `t.id || t.task_id || ""`. Write-path already emits `id` only.

**Standards (task-schema.md):** Write Rules section added: write `id` never `task_id`; timestamps via real `date -u`.

**Own task row:** Flipped to REVIEW in backlog (key `id` — ate own dogfood).

**Tests:** 6 pass / 0 fail (orchStateStore-atomic-write.test.ts). tsc: 3 pre-existing errors, 0 new.

Zone health: migration REVIEW, tsc 0 new errors, 6 tests GREEN | HEALTHY

---

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

## c380 · 2026-06-07 (CLEAN-DEAD-SOURCE-IDS) — REVIEW

**Task:** CLEAN-DEAD-SOURCE-IDS (S) BATCH-5 — remove 6 dead source IDs from fetch-status.

**Root cause:** fetchStatusHandler.ts derives source slugs dynamically from rag_analyses GROUP BY. Dead sources (news/cafef1/vnexpress1/shared-url/vnbusiness/vietnambiz) have historical rows but no live fetchers, producing permanent VERY-STALE dashboard noise.

**Fix (1 file):** `fetchStatusHandler.ts` — added `DEAD_SOURCE_SLUGS` (exported ReadonlyArray, 6 entries), extended HAVING clause: `AND source_slug NOT IN (?,?,?,?,?,?)` with bound params `[cutoff, ...DEAD_SOURCE_SLUGS]`.

**Tests:** `CLEAN-DEAD-SOURCE-IDS.test.ts` (NEW) — 8 tests, 8 pass / 0 fail. F-1 still 21/0. tsc: no new errors (pre-existing in tasksMdJanitorJob.ts/1980-f2). Historical DB rows preserved.

**Grep justified:** remaining hits for vnbusiness/vietnambiz in pollNews.ts/vnRelevanceFilter.ts are news-pipeline infrastructure (not fetch-status surface). system-map.json: none of 6 IDs appear as data_source entries.

Zone health: DEAD_SOURCE_SLUGS filter LIVE, 8 new tests GREEN, compiled code changed (rebuild required) | HEALTHY

---

## Working Memory

### Last Completed: FIX-BCTC-IDENTITY-SERVE-GUARD
- DONE: committed 921be65a (merged to main as 62ef64fe)
- Guard: total_assets<=0 OR total_assets<equity_total → confidence=0 + corrupt flag
- CTG re-extract: FAILED (fleet cron required), deferred to ops
- FU-CTG-REFINE-PICKUP: SUPERSEDED by guard

### Baselines (FIX-PROJECT-STATS-GENERATED 2026-06-07)
- tools=162 (server.tool+registerTool unique names), sched=76 (all cron.schedule in scheduler/**/*.ts)
- Generator: `bun scripts/gen-project-stats.ts` — must be run after any tool/cron change

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
