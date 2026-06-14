# dev-mcp-server -- Notebook

## 2026-06-15 · VMT-7 Zone-B wave — 5 VN macro data MCP tools added

**Task:** VMT-7a–e + VMT-7-REGISTER (VN-MACRO-TOOLING Zone-B bundled wave)
**Commit:** (see below)

5 new MCP proxy tools wired into macro-indicators:5004 Zone-A endpoints:
- get_vn_trade_balance (POST /trade-balance) — tradeBalanceTools.ts; bloc_split.fdi/domestic.is_estimate=true PERMANENT (ARCH Decision A)
- get_vn_bop (POST /bop) — bopTools.ts; offshore_parked.is_estimate=true PERMANENT; fx_incidence.is_estimate=false; errors_omissions BPM6 sign
- get_vn_macro_indicators (POST /macro-indicators) — macroIndicatorsVnTools.ts; 4 IIP sectors; is_estimate=false (primary source)
- get_cpi_components (POST /cpi-components) — cpiComponentsTools.ts; weight_pct=null ALL baskets + headline; weights_is_estimate=true PERMANENT; do NOT coerce null→0
- get_vn_liquidity_state (POST /liquidity-state) — liquidityStateTools.ts; irs.is_estimate=true PERMANENT (DD-6); interbank_1w.is_estimate=true PERMANENT + rate_1w_pct=null + blocked_reason (Decision B); omo.is_estimate reflects parse success

VMT-7-REGISTER: wired all 5 into http-proxy/index.ts barrel + registry.ts (imports + toolRegistry array entries #164–#168).

Base URL mechanism: MACRO_INDICATORS_URL env var → http://localhost:5004 (via getMacroBaseUrl() from macroHttpClient.ts — identical to all existing macro HTTP-proxy tools).

**Gate results:** tsc --noEmit exit 0. bun test 13037 tests / 0 failures. Tool registrations +5 = 181 server.tool() calls. Scheduler count unchanged (no scheduler files touched).

Zone health: bun test 0 fail, 181 tool registrations (+5 from VMT-7), scheduler count unchanged | HEALTHY

## 2026-06-14 · VMT-6-CREDIT-FLOW-EXTEND — survey_distribution stub added (DEGRADED)

**Task:** VMT-6-CREDIT-FLOW-EXTEND (Zone C, VN-MACRO-TOOLING WAVE-1)
**Commit:** 105b07c4

Added `survey_distribution` field to `getCreditFlowSignalHandler` in `creditFlowTools.ts`. Ships DEGRADED: `is_estimate=true`, all data fields null/empty arrays, note cites VIRA/VARA deferred (BLOCKER-6). Exported `SurveyDistribution` interface for typed consumers. Return type extended from `{ content }` to `{ content; survey_distribution }`.

DDD boundary held: no fetch logic in handler; comment marks where `viraSurveyFetcher.ts` (infrastructure/fetchers/) wires in when source is confirmed (no schema change needed at that point).

**Gate results:** tsc --noEmit exit0. 6/6 new VMT-6 tests pass. 19/19 existing credit-flow tests (246 + 1254) pass. PR diff: pure additive, zero existing is_estimate/mortgageIsEstimate/yoyIsEstimate/static_seed lines removed or flipped.

Zone health: bun test (credit-flow suite) 0 fail, 157 tools intact, scheduler count unchanged (VMT-6 touches no scheduler files) | HEALTHY

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

---

## Archive

Pre-2026-06-10 tasks (FIX-PENDING-REFINE-LIMIT-CHECKKIND, CI-RED-b7b84d9b-FIX, etc.): See git history commits a7c2f4f–897877ec (2026-06-13 and prior)

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

## 2026-06-14 · FIX-REFINE-LOCK-TTL-RECLAIM — owner_agent fix + TTL increase + T1-T5 tests

**Task:** FIX-REFINE-LOCK-TTL-RECLAIM (P1, recurring [Lock orphaned by rebuild])
**Root cause:** refine_bctc_md flow called task_heartbeat/task_release WITHOUT owner_agent → legacy owner_session path → zombie after every mcp-server rebuild → lock never deleted → all future refine fires blocked.
**Fix A:** Added owner_agent:"refine-orchestrator" to task_heartbeat (~L82), happy-path task_release (~L97), and error-boundary task_release (~L101) in docs/agents/refine_bctc_md/flow/main.md.
**Fix C:** Increased ttl_seconds from 1000 to 1800 in task_claim call (~L38) — gives 30-min window for 7-window chunks.
**coordinationStore.ts:** No change — claimTask Step 2 stale-steal and heartbeatTask/releaseTask owner_agent paths were already correct.
**Tests:** apps/mcp-server/src/__tests__/FIX-REFINE-LOCK-TTL-RECLAIM.test.ts — T1 (expired steal) + T2 (live no-steal) + T3 (heartbeat rebuild-sim) + T4 (release rebuild-sim) + T5 (push idempotency). 5/5 pass.
**Gates:** tsc exit 0, bun test 5/5 green.
**Note:** Flow fix takes effect on next cron fire (no rebuild needed). New test file lives in apps/mcp-server so ops needs targeted rebuild for qa LIVE container gate. ops clears orphan bctc-refine:bdcfa5e0 after green.
