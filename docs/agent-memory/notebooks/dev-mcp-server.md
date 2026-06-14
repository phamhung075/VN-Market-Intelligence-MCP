# dev-mcp-server -- Notebook

## 2026-06-14 · T3-ARCH-CRON-WATCHDOG round-2 — manifest key drift fixed + integrity guard added

**Task:** T3-ARCH-CRON-WATCHDOG CHANGES_REQUESTED round 2 (router RAW-verified false-green)
**Root cause:** 3/16 WATCHDOG_MANIFEST keys did not match cron_job_runs.job_name — watchdog queried wrong name → false "never run" alerts; monitor blind to those jobs' real freshness.

**Fixes (A):** Corrected manifest keys in `schedulerWatchdogJob.ts`:
- `ohlcvDailyAggregatorJob` → `ohlcv-daily-aggregator` (startScheduler wrapRun L631, 25 runs/30d)
- `foreignFlowAlert` → `foreignFlowAlertJob` (foreignFlowAlertJob.ts recordJobRun L314, 28 runs/30d)
- `taOhlcvBackfill` → `ta-ohlcv-backfill` (startScheduler wrapRun L664, 10 runs/30d)
Also fixed `liveManifest` selfHealFn wrapRun literals in `startScheduler.ts` to match (ohlcvDailyAggregatorJob→ohlcv-daily-aggregator, taOhlcvBackfill→ta-ohlcv-backfill). Other 13 keys audited — all correct.
Added `CANONICAL_WATCHDOG_JOB_NAMES` export annotated with recording sites per job.

**Test (B):** Added WD-10 (3 assertions) to `ARCH-CRON-watchdog.test.ts`:
- every manifest key in canonical set (fail-loud with exact error); no canonical duplicates; count parity.
Fail-loud proof verified: corrupt key → WD-10 fails naming the bad key; restore → 17/17 green.

**Decision (C):** weekday-only threshold non-trivial; left TODO comment in 3 summary job manifest entries + flagged for architect. Not blocking.

**Commit:** 9a7e1aef | tsc: 0 errors | ARCH-CRON-watchdog.test.ts: 17 pass / 0 fail

## 2026-06-14 · T1-ARCH-CRON-T4-DEDUP-GUARDS — Recovery replay dedup guards SHIPPED

**Task:** T1-ARCH-CRON-T4-DEDUP-GUARDS (M, ARCH-CRON-SCHEDULER-RELIABILITY phase 1a)
**Root cause addressed:** No guard prevents double-execution when node-cron recoverMissedExecutions replays a tick that already ran successfully.

**Implementation:**
- `scheduler/startupHelpers.ts`: added `shouldSkipRecoveryReplay(db, jobName, cadenceMs, nowMsFn?)` — queries `cron_job_runs WHERE status='success' AND started_at >= cutoff` (90% of cadence); fail-open on DB error; logs skip on match.
- Applied guard to **26 jobs** across 6 scheduler subdirectories: calibrationReportJob, baseRateComputationJob, predictionResolutionJob, reputationComputeJob, verdictResolutionJob, signalOutcomeJob, alertOutcomeJob, weeklyPortfolioReportJob, devTeamHeartbeatJob, dataAuditJob (daily+weekly), patternWatchJob, predictionOutcomeJob, bctcOverdueCheckJob, bctcReparseJob, davPharmacyJob, sscCheckerJob, marketScanJob (open+close), cascadeBacktestJob, bondMaturityPollerJob, signalOutcomeResolutionJob, tasksMdJanitorJob, diskUsageAlertJob, dailyDashboardJob, newsHeadlinesRefreshJob.
- Added `@idempotency T4` JSDoc on each guarded function.
- `nowMsFn?: () => number` added to all injectable options interfaces for test control.

**Tests:** 13 new tests in `ARCH-CRON-idempotency.test.ts` — all GREEN (13/13). Covers: no-prior-run, success-within-window, error-retry, outside-window, missing-table fail-open, per-job cadence correctness (daily/weekly/30min), 90% boundary precision.
**tsc:** 0 errors. Full suite: 12853 pass / 60 pre-existing fail (deprecated) / 0 new failures.
**Board:** T1 moved to REVIEW; next_agent=ops (rebuild + live verify).

## 2026-06-14 · FIX-MCP-CRASH-LOOP-D-1 — WAL > 10 MB escalation gate SHIPPED

**Tasks:** D-1 (S, guardrail — last child of FIX-MCP-CRASH-LOOP-WRITEWAL sprint; after BC-1 + A-1)
**Root cause addressed:** No orch-state signal written when WAL grows past 10 MB — ops/triage loop had no visibility before next crash.

**Implementation:**
- `infrastructure/db/checkpoint.ts`: added 4th optional param `escalateFn?(walBytes): Promise<void>` to `checkWalFileSize()`; called non-fatally after Telegram alert when bytes > 10 MB; return type extended with `escalated?: boolean`.
- `scheduler/startScheduler.ts`: added imports for `appendSignalQueueRow`, `getOrchStatePath`, `getProjectRoot`; defined `walEscalateFn` closure at scheduler layer (DDD boundary preserved — checkpoint.ts stays orch-state-agnostic); writes `WAL_ESCALATION` signal via `appendSignalQueueRow` (CAS retry, WF-2 protocol); passed as 4th arg to `checkWalFileSize()`.

**Tests:** 7 unit tests in `FIX-MCP-CRASH-LOOP-D-wal-escalation.test.ts` — all GREEN (7/7). 37 pass / 0 fail across all 6 checkpoint test files.
**tsc:** 0 errors. Full suite: 12841 pass / 54 pre-existing fail / 0 new failures.
**Tool count:** 157 (unchanged). Scheduler count: 80 cron.schedule (no new registrations).
**Board:** D-1 moved to REVIEW; QA picks up next.

## 2026-06-14 · FIX-MCP-CRASH-LOOP-A-1 — Restart-cadence alert guardrail SHIPPED

**Tasks:** A-1 (S, guardrail layer after BC-1 root fix)
**Root cause addressed:** No visibility into repeated mcp-server restarts within a 4h window.

**Implementation:**
- `composition-root.ts`: startup sentinel write to `cron_job_runs` (job_name='mcpServerStartup', status='success') immediately after WAL replay (step 1c). Uses `insertCronJobRunStart` + `updateCronJobRunEnd` directly — best-effort try/catch.
- `scheduler/system/restartCadenceAlertJob.ts` (new): queries sentinel rows in last 4h; sends WORK-channel alert when count≥2. Injectable db+sendFn for TDD. Non-fatal error handling.
- `scheduler/cronConfig.ts`: `restartCadenceAlert: '15,45 * * * *'` (staggered 15min from WAL checkpoint at :00 and :30).
- `scheduler/startScheduler.ts`: registered via `jobRunRepo.wrapRun('restartCadenceAlertJob', ...)` with `db` injection. Passes live db so no second getDb() call needed.

**Tests:** 4 unit tests in `FIX-MCP-CRASH-LOOP-A-restart-cadence.test.ts` — all GREEN (4/4)
**tsc:** 0 errors
**Commit:** ef0ce87c
**Board:** A-1 moved to REVIEW; QA/live-verify gate next.

## 2026-06-14 · FIX-FUNDAMENTALS-REFRESH-CRON-DEAD — vnstock banner suppression SHIPPED

**Tasks:** FIX-FUNDAMENTALS-REFRESH-CRON-DEAD (P0) + FIX-VNSTOCK-FUNDAMENTAL-RATELIMIT (P1)
**Root cause:** vnstock v4 emits TWO stdout banners on every `Vnstock().stock()` + finance API call:
1. Deprecation notice with box-drawing chars (╭╮│) → mis-detected as RATE_LIMITED by `isRateLimitResponse(BOX_DRAWING_RE)`
2. Community-edition limit notice (ℹ️ prefix, non-JSON) → `stripAnsiAndDetectJunk` marks junk=true

Both banners caused every financial fetch to return null → `markFetched()` was called (fetch_log updated) → `storeFinancials()` never called → financial tables frozen since 2026-04-15. Jun-8 cron crash was container restart mid-run (zombie reaper set crashed; no thrown exception).

**Fix:** `apps/mcp-server/src/infrastructure/fetchers/vnstockBridge.ts`
- Wrapped ALL vnstock API calls (init + data calls) in `sys.stdout = _io.StringIO()` blocks
- Banners discarded; JSON printed only after `sys.stdout = _real_stdout` restore
- Applied to all 10 Python script templates: FINANCE, TRADING_STATS, OFFICERS, SHAREHOLDERS, INTRADAY, ORDER_BOOK, BALANCE_SHEET, CASH_FLOW, NEWS, PRICE
- Exported `SUPPRESS_BANNER` + `RESTORE_STDOUT` for test coverage

**Tests:** 12 new assertions in `fix-fundamentals-refresh-cron-dead.test.ts` — all GREEN
**Live verification:** 2-ticker sync (ACB, VCB) wrote rows to vnstock_financials within 90s of deploy; fetch_log updated with live timestamps
**G12 gate:** tsc clean, 12 pass / 0 fail, 157 tools, 79 cron.schedule
**Commit:** c35db4fc

## 2026-06-14 · FIX-MCP-CRASH-LOOP-WRITEWAL BC-1 — WAL root fix SHIPPED

**Task:** BC-1 | Sprint: FIX-MCP-CRASH-LOOP-WRITEWAL | Zone: apps/mcp-server/src/infrastructure/db/ + scheduler/
**Root cause:** wal_autocheckpoint=4000 (16MB) + FULL-only live-hours cron defeated by 40+ concurrent reader snapshots pinning WAL frames → WAL wedges at threshold → ~2h crash cadence.
**Fix:**
1. `schema.ts:109` — wal_autocheckpoint 4000 → 1000 (4MB threshold, passive drain 4x more often).
2. `checkpoint.ts` — added `runForcedTruncateCheckpoint(deps?)`: BEGIN IMMEDIATE (expires reader snapshots) + PRAGMA wal_checkpoint(TRUNCATE); injectable deps; normalizes SQLite -1 return (WAL not applicable) to {walSize:0, checkpointed:true}; non-fatal on all errors.
3. `startScheduler.ts` — replaced FULL(live)/TRUNCATE(off-hours) split with unconditional runForcedTruncateCheckpoint() every 30min; off-hours backup call preserved.
4. `FIX-MCP-CRASH-LOOP-BC-waltruncate.test.ts` — 6 tests: call order, return shape, wal_autocheckpoint=1000, 10k-write load (<1000 frames post-truncate), concurrent reader.
**Results:** bun test 6/6 pass. tsc 0 errors. Commit: b41070b7. NEXT: ops-rebuild (build --no-cache mcp-server + up -d --no-deps --force-recreate mcp-server). A-1 and D-1 unblocked.

---

## 2026-06-13 · FIX-BCTC-VPS-QUEUE-SYNC — 404 retry cap + orphan re-sync — REVIEW

**Task:** FIX-BCTC-VPS-QUEUE-SYNC | Priority: high BUG | Zone: apps/mcp-server/src/scheduler/financial-reports/
**Root cause (ops raw-verified):**
- G1: `bctc_vps_queue` had 10 rows at 532-562 attempts (VNM, VEA, SHB, HUT, DIG, DXG, KDH, PDR, MSN, FRT Q1-2026) — no retry cap, no `deferred_infra` transition, VPS hammered forever with 404s.
- G2: Those 10 rows had placeholder VPS source_url (`<VPS_BASE><TICKER>/<TICKER>_YEAR_Q.pdf`) — never actually cached on VPS. Several 0-attempt rows have the same placeholder pattern. Root cause: placeholder URLs auto-generated at seed time (no date-prefix, not a real cache file). VPS discovery arm not triggered because source_url IS NOT NULL.
**Fix seams:**
1. `bctcPdfPullJob.ts` — G1: `MAX_404_ATTEMPTS=10` named constant exported. `recordFailedAttempt()` helper: if `row.attempts + 1 >= MAX_404_ATTEMPTS` → `deferred_infra`, else `pending`. Added `deferred` count to `BctcPdfPullResult`. Added `attempts` column to `SELECT`. All 4 failure paths routed through `recordFailedAttempt()`.
2. `bctcQueueEnricherJob.ts` — G2: orphan-re-sync arm added. Detects rows where `source_url LIKE VPS_BASE%` AND `source_url NOT LIKE '%/20%'` (placeholder filename, no date-prefix). Resets `source_url=NULL, status='pending', attempts=0` → re-discovery on next cycle. Covers `pending` + `deferred_infra` statuses. Also: `orphansResynced` added to result type. `VPS_BCTC_ENRICH_BASE_URL` and `VPS_PLACEHOLDER_NOT_LIKE` constants document the detection rule.
**Orphan detection proof (generic, not hardcoded):** SQL set-difference: `LIKE VPS_BASE% AND NOT LIKE '%/20%'`. Real cached VPS files always start with date (`20YYMMDD-`). Placeholder files start with ticker (`VNM_2026_Q1.pdf`). No ticker names, no date ranges in the query.
**Expected G3 outcome (VNM/MSN Q1-2026):** Both have placeholder VPS URLs → orphan arm resets → enricher re-discovers → if hsx.vn / VPS-Playwright finds a real cached PDF: `done`. If no upstream PDF available: `url_not_found` (HONEST terminal state, not fabricated cached). QA should calibrate G3 to whichever state the live VPS reports.
**Tests:** FIX-BCTC-VPS-QUEUE-SYNC.test.ts — 18 pass / 0 fail. FENCE proofs: G1-FENCE (guard-absent shows deferred=0), G2-FENCE (inverted NOT LIKE hits real URLs). All BCTC tests (8 files, 91 tests): 91 pass / 0 fail. Full test baseline: 157 tools, 79 cron.schedule.
**tsc:** clean (exit 0).
**Pre-rebuild live DB observation:** `SELECT status, attempts, COUNT(*) FROM bctc_vps_queue GROUP BY status, attempts`: 10 rows at pending/562 (stuck), 16 at pending/0, 27 at url_not_found, 328 at deferred_infra, 48 at done. After rebuild+1 enricher cycle: those 10 stuck rows should hit cap in the first pull cycle → deferred_infra → orphan arm resets → NULL → re-discovery.
**REBUILD REQUIRED:** ops rebuilds container. QA verifies G3 (VNM/MSN) and G4 (stuck-count→0/all-deferred).
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, G1+G2 deployed | HEALTHY

---

## 2026-06-13 · TSU-DEV-U3 — Deregister 5 / Integrate 7 weak-claim tools — REVIEW

**Task:** TSU-DEV-U3 | Sprint: TOOL-SURFACE-UPGRADE | Priority: P2 | Zone: apps/mcp-server/src/interface/mcp/tools/
**Status:** Implementation verified complete in HEAD (commit 50772c2a, QA-approved 2e321dec). This cycle re-verified all evidence per task brief requirements.
**Part A — Deregister (5):** read_bctc_pdf (reports.ts — server.tool block removed, superseded by OCR/PEK pipeline), backfill_bctc_scalars (backfillBctcScalarsTool.ts — no-op, admin-only), compute_accruals (computeAccrualsTool.ts — no-op, domain calc no live store), get_accuracy_context (getAccuracyContextTool.ts — no-op, get_calibration_report covers use case), is_trading_day (isTradingDayTool.ts — no-op, DWF-PHASE1 unshipped worktree).
**Part B — Integrate (7 description-only):** mark_alert_outcome (post-hoc + write_alert_verdict lifecycle + ops/alert-commander package), get_market_foreign_flow (market-wide SUM vs per-ticker + market-analyst package), diagnose+reset_foreign_flow_circuit_breaker (ops/debug pair), get_label_accuracy_report (label-level vs calibration curve + market-analyst), get_public_contracts (tran-ngoc-bau package confirmed), list_flagged_bctc_cells (bctc-analyst inspect flow), submit_bctc_correction (BCTC-HUMAN-CONFIRM entry point).
**Tests:** TSU-DEV-U3-weak-claim-tools.test.ts — 12 pass / 0 fail. FENCE proof: T-U3-5 re-added is_trading_day registration → RED (1 fail), restored → GREEN (12 pass). Integration test (123-integration-mcp.test.ts) 27 pass / 0 fail.
**RAW grep:** server.tool("read_bctc_pdf"|"backfill_bctc_scalars"|"compute_accruals"|"get_accuracy_context"|"is_trading_day") → zero live registration hits across apps/mcp-server/src/.
**tsc:** exit 0 (clean). **Full suite baseline (pre-existing):** 12798 pass / 50 fail (50 failures are pre-existing deprecated/stale tests in _deprecated/ unrelated to U3).
**Tool count:** 157 (162−5 deregistered). Scheduler count: 79 cron.schedule (unchanged).
Zone health: tsc clean, 157 tools (5 deregistered per U3), all 12 U3 tests green, FENCE verified | HEALTHY

---

## 2026-06-13 · TSU-DEV-U5 — Foreign-flow null holding ratio (DSI serve-null) — REVIEW

**Task:** TSU-DEV-U5 | Sprint: TOOL-SURFACE-UPGRADE | Priority: high | Zone: apps/mcp-server/
**Root cause:** `vnstockStore.ts:573` `row.current_holding_ratio ?? 0` fabricated 0 as real holding ratio. VPS API (`bgapidatafeed.vps.com.vn`) returns no `holding_ratio` field (ARCH-U5-1 confirmed). Every served `Holding Ratio: 0.00%` was fabricated — DSI invariant violation (never serve fabricated data as real). Same class as FDA-9 fail-open.
**Fix seams:**
  1. `vnstockStore.ts:573` — `?? 0` → `?? null` (carry absence through, not fabricated zero)
  2. `foreignFlowAnalyzer.ts` — `DailyForeignFlow.holdingRatio: number | null`; `ForeignFlowSignal.holdingRatioChange5d: number | null`; `isHoldingRatioFabricated` check updated to `=== null || === 0`; `holdingRatioChange5d = null` when fabricated; reasoning guard changed to `holdingRatioChange5d !== null`
  3. `foreignFlowTools.ts` — `hasRealHoldingData = !signal.is_holding_ratio_fabricated` gate; null check added on signal render; test injection path updated to `holdingRatio: null`; `fmtRatio(row.holdingRatio ?? 0)` for real-data branch
  4. `companyProfileTools.ts` — `foreign_holding_ratio = null` when `current_holding_ratio <= 0` (already correct pre-task; verified)
**Tests:** 25 pass (TSU-DEV-U5 test file) + 17 in vnstock-foreign-flow.test.ts = 42 pass total across U5 + related. FENCE-FALSE-GREEN proof: T-U5-FENCE inline — null history → absent, real history → present; gate discrimination proven in same test.
**Type fix downstream:** `vnstock-foreign-flow.test.ts:171` updated `Math.abs(signal!.holdingRatioChange5d)` → `Math.abs(signal!.holdingRatioChange5d as number)` with not-null assertion.
**tsc:** clean. **Docs updated:** domain-model.md foreignFlowAnalyzer.ts row.
**REBUILD REQUIRED:** container must be rebuilt before QA live-verifies get_foreign_flow / get_company_profile. no_rebuild=false. Router dispatches ops.
Zone health: tsc clean, 157 tools intact (no tool count change), 79 cron.schedule, serve-null DSI fix shipped | HEALTHY

---

## 2026-06-13 · TSU-DEV-U2-GEN — Tool-registry generator + parity test — REVIEW

**Task:** TSU-DEV-U2-GEN | Sprint: TOOL-SURFACE-UPGRADE | Priority: high | Zone: scripts/ + apps/mcp-server/__tests__/
**Root cause:** docs/data/tool-registry.json was hand-edited and decayed (hand-maintained count drifted from live source; no generator existed to enforce SSOT).
**RECONCILIATION (ARCH-U2-2):** Brief estimated 162 (161 server.tool + 1 server.registerTool). Static scan shows 156 server.tool( + 1 server.registerTool( = 157. Generator says 157. Live /health says 157. ACTUAL = 157. Brief's 162 was pre-sprint estimate, not live reality. No discrepancy between generator and /health.
**Fix:** scripts/gen-tool-registry.ts (already existed from prior commit a5b34816) — scans both APIs, emits grouped JSON. scripts/gen-project-stats.ts already imports from registry. Regenerated docs/data/tool-registry.json (totalCount=157, 12 groups). docs/data/project-stats.json toolCount=157 confirmed. apps/mcp-server/src/__tests__/tool-registry-parity.test.ts (already existed) — 8 tests GREEN.
**Deliberate-violation proof:** Injected __test_fake_tool__ → T-U2-5 + T-U2-6 RED. Reverted → 8 GREEN. Fence proven.
**Idempotency:** Content (totalCount/groups/tools) byte-identical across runs; only lastUpdated timestamp differs.
**tsc:** clean. No runtime code changed.
Zone health: tsc clean, 157 tools intact (generator verified), 79 cron.schedule, parity test 8 pass | HEALTHY

---

## 2026-06-13 · TSU-DEV-U1 — Per-call telemetry counter — REVIEW

**Task:** TSU-DEV-U1 | Sprint: TOOL-SURFACE-UPGRADE | Priority: high | Zone: apps/mcp-server/
**Root cause:** sessionToolCache never populated under gateway per-call model (gateway dials SSE per-call, drops connection; sessionId never fires; trackSessionToolUsageJob reads always-empty snapshot → sessionCount:0/toolCounts:{} permanently).
**Fix:** New perCallCounterStore.ts singleton (Map<string,number>, exports incrementTool/getSnapshot/resetCounters/getTool). Handler-proxy hook installed in server.ts createMcpServerInstance() after registerAllTools() — wraps _registeredTools entries with synchronous Map.set() increment. trackSessionToolUsageJob.ts rewritten: reads counter snapshot, removes sessionCount field, keeps uniqueTools + toolCounts. startScheduler rowsWritten = stats.uniqueTools.
**Tests:** 8 pass / 0 fail isolation (TSU-DEV-U1-per-call-counter.test.ts). Deliberate-violation proof: broke incrementTool → 5 tests RED → reverted → 8 GREEN. tsc clean.
**Commit:** 829931b3 feat(TOOL-SURFACE-UPGRADE/telemetry): TSU-DEV-U1 per-call telemetry counter
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, perCallCounterStore shipped | HEALTHY

---

## 2026-06-13 · FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE — confidence recompute at finalize — REVIEW

**Task:** FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE | Sprint: BCTC-ANALYTICS-LAYER | Priority: P1 | Zone: apps/mcp-server/
**Root cause:** extraction_confidence frozen at OCR-parse time — ACB at 0.375 despite 27/27 refined units DONE with all 3 sections present. PUB-5 blocks publishing at confidence < 0.5.
**Fix:** Added BLOCK-5 to finalizeBctcRefineTool.ts — non-fatal try/catch after BLOCK-4. Formula: (hasBalanceSheet ? 0.4 : 0) + (hasIncomeStatement ? 0.4 : 0) + (hasCashFlow ? 0.2 : 0). Raise-only guard: only UPDATE if refinedConfidence > currentConfidence. All 3 sections → 1.0, unblocks PUB-5 for ACB. Guard tested: current=0.81, refined=0.8 → NO override (DE2 suite). current=0.9, refined=0.4 → NO override (AR suite).
**Tests:** 0 new files (AC-5-2 prohibits); existing suite 3× exit 0. DE2: 7 pass, AR: 20 pass, FU-6f: 8 pass.
**Commit:** (see git log)
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, confidence recompute shipped | HEALTHY

---

## 2026-06-13 · FIX-PENDING-REFINE-LIMIT-CHECKKIND — z.coerce.number + SDK pin — REVIEW

**Task:** FIX-PENDING-REFINE-LIMIT-CHECKKIND | Priority: high | Zone: apps/mcp-server/
**Root cause:** @modelcontextprotocol/sdk floated ^1.8.0 → 1.29.0 via Dockerfile `|| bun install` fallback + zod 3.25.76. SDK 1.29.0 + zod 3.25.76 produces Bun 1.3.13 JIT module-state corruption in the running container: ZodNumber._parse (zod/v3/types.js:1086) iterates undefined entries in _def.checks → `check.kind` crash. The crash is process-state specific: Docker restart clears it; full replica scripts run clean.
**Fix:** z.coerce.number() on 4 tools (getBctcPendingRefineTool, getFedLiquiditySpreadTool, carryTools, sequential-market-analysis) — aligns with working-tool pattern; all .int()/.min()/.max() constraints preserved. SDK exact pinned to "1.29.0" (removes ^ drift vector). Primary resolution: rebuild + restart clears corrupted Bun state.
**Tests:** 44 targeted pass / 0 fail; full run 12880 tests. tsc clean. Commit: 897877ec.
**Live verify:** G1 {limit:1} → 1 row; G2 {ticker:CTG,limit:1} → 1 CTG row; G3 {} → 35 rows; G4 {report_id} → 1 row.
Zone health: bun test 12880 pass, 157 tools intact, 79 cron.schedule, check.kind crash fixed | HEALTHY

---

## 2026-06-13 · CI-RED-b7b84d9b-FIX — 160-stock-aliases timing flake — REVIEW

**Task:** CI-RED-b7b84d9b-FIX | Priority: high | Zone: apps/mcp-server/
**Root cause:** Performance smoke test in 160-stock-aliases.test.ts used `expect(elapsed).toBeLessThan(5)` (5ms). Under P=16 parallel bun processes on the 2-core GitHub Actions ubuntu-latest runner, cold-JIT first-call latency + CPU scheduler preemption pushes wall-clock past 5ms intermittently. Same commit had both PASS (run 27440686945) and FAIL (run 27440686989) runs — nondeterministic timing, not shared state.
**Fix:** Raised threshold 5 → 500ms in test description and assertion. 500ms is still a meaningful regression guard (actual cost ~0.03ms; 500ms = >16,000x margin). No shared state/singleton/DB issue in the module or test.
**Files:** apps/mcp-server/src/__tests__/160-stock-aliases.test.ts (1 line changed: threshold + description)
**Tests:** 34 pass / 0 fail isolation. 34 pass / 0 fail standard. tsc clean. Tool count 157, scheduler 79.
**Repro script:** scripts/repro-ci-red-b7b84d9b.sh
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, CI-RED flake fixed | HEALTHY

---

## 2026-06-14 · FIX-MCP-500-SYMBOL-TO-STRING — WebStandardStreamableHTTPServerTransport — REVIEW

**Task:** FIX-MCP-500-SYMBOL-TO-STRING | Priority: P0 | Zone: apps/mcp-server/
**Root cause:** `StreamableHTTPServerTransport` (SDK 1.29.0) bridges Node.js HTTP through `@hono/node-server` which defines 13 Symbol-keyed prototype properties (`urlKey`, `headersKey`, `incomingKey`, `wrapBodyStream`, ...). Under Bun 1.3.13 JIT corruption (triggered ~80 min after startup during heavy `ohlcvBackfill` processing of 1608 tickers), accessing these Symbol keys attempts `Symbol→string` coercion and throws `TypeError: Cannot convert a symbol to a string` on every `/mcp` request — total cowork fleet outage.
**Fix:** Replaced `StreamableHTTPServerTransport` with `WebStandardStreamableHTTPServerTransport` in `apps/mcp-server/src/interface/mcp/server.ts`. Added `incomingToWebRequest()` + `pipeWebResponseToNode()` helpers to bridge `Node.js IncomingMessage/ServerResponse` ↔ Web Standard `Request/Response` using `Readable.toWeb()` — no @hono/node-server dependency, no Symbol-keyed property access on the `/mcp` hot path.
**Files:** apps/mcp-server/src/interface/mcp/server.ts (+100 lines, -5 lines)
**Commit:** e69b354f
**Tests:** tsc 0 errors. bun test 12847 pass, 0 new failures (53 pre-existing deprecated-test failures unchanged).
**Local verify:** /vn-market/mcp POST → event:message 200; /vn-market/sse → event:endpoint 200; /health → 200 toolCount:157.
**Next:** ops rebuild --no-cache mcp-server + force-recreate → live proof via call_tool get_market_snapshot.
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, Symbol-TypeError eliminated | REVIEW
