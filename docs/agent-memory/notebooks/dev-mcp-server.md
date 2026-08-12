# dev-mcp-server -- Notebook

## 2026-08-09 — FIX-SSE-SOAK-VERIFY-DEPENDS-ON-SHARED-CONTAINER-UPTIME-3RD-RESET (P1, S, dispatch_lane=dev-mcp-server) → REVIEW, next_agent=qa

**Session:** 165f4245-6173-4054-87fd-c55bb626265f (dev-team Step 3 direct-execute, branch:null). The already-shipped `FIX-MCP-SSE-SESSION-MANAGER-PERCONN-LEAK-NO-REAPER` fix (own entry above, 2026-08-08) had an unverifiable-by-construction soak AC: its evidence was the shared `dev-mcp-server` container's `StartedAt` (>=4h uninterrupted uptime), which ANY of 8+ peers' legitimate rebuilds resets. Reset 3x in ~24h (most recently by `550fda673`, `FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION`) — the row sat in `qa[]` with an empty `status_note` through all 3 resets, no durable record on the row itself.

**Fix (AC-1):** added an injectable `_now: () => number = Date.now` 8th constructor param to `SseSessionManager` (`transport.ts`), same override idiom as the pre-existing `_heartbeatIntervalMs`/`_idleTimeoutMs`/`_maxAgeMs`/`_reaperIntervalMs`, threaded through all 3 `Date.now()` call sites. New T13/T14 tests in `1862c-transport-session-eviction.test.ts` construct the manager with every real shipped default intact and inject a fake clock: T13 advances it in <4h steps then crosses the real 4h mark and asserts `mcpServer.close()` fires; T14 is a boundary negative control (4h-1s survives). Bun 1.3.13 has no built-in fake-timer support — the injectable-clock pattern sidesteps the real-timer CPU-contention race class entirely.

**Verified under contention, not just locally:** 1862c file 14/14 pass (45 expect), 5 clean reruns. Under manufactured 48× `yes` CPU contention: T13/T14 clean 8/8 runs. `tsc --noEmit` clean. Gate 2: `PORT=3099` clean boot, `/health {toolCount:183,sessions:0}`; toolCount=183/cronJobCount=88, both match baseline.

**AC-2:** stamped `FIX-MCP-SSE-SESSION-MANAGER-PERCONN-LEAK-NO-REAPER`'s `qa[]` row `status_note` with the full incident history. That row's own lane/status left UNCHANGED.

**Evidence:** commits `a3d7ff35f` (code+test+doc), `50a0fce44` (board). DJ: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server-5.md` S84.

Zone health: reaper's max-age branch now re-provable in milliseconds via an injected clock, immune to both container-uptime resets and the T9-class real-timer contention flake, full-suite regression consistent with pre-existing baseline | HEALTHY.

## 2026-08-12 — FIX-CRON-ALERTSCAN-CONFIG-KEYS-ORPHANED-BY-PARALLEL-WRAPPER (P1/high, S, dispatch_lane=dev-mcp-server) → REVIEW, next_agent=qa

**Session:** 165f4245-6173-4054-87fd-c55bb626265f. PO-minted BACKLOG row (triage 20260812T0000Z), RAW-source-verified: `alertScanParallelJob` (task 1309c refactor) merged `taAlertScanJob`+`bbAlertScanJob` into one scheduled job, but `cronConfig.ts` still exported the two pre-refactor CRONS keys separately. `bbAlertScan` had zero registration call sites (grep-confirmed dead); both keys' `/api/cron-status` Layer-A rows resolved via `resolveJobNameDb`'s tier-3 honest fallback to their own literal key name, which matched frozen pre-refactor `cron_job_runs` rows (last real fire 2026-04-24, now 2630h+) — a permanent unfalsifiable CRITICAL `cron_fire_gap` every system-auditor Tier-1 cycle.

**Fix:** collapsed `taAlertScan`/`bbAlertScan` into one `alertScanParallel` CRONS key (`cronConfig.ts`, same cron string, new `CRON_ALERT_SCAN_PARALLEL` env var), repointed `schedulerJobTable.ts`'s sole `alertScanParallelJob` job-table entry's `cron:` field to it. Deliberately did NOT add `alertScanParallel` to `STATIC_JOB_NAME_MAP` (tier-1) — out of this row's OBSERVABILITY-only scope. Verified the tier-2 normalized-fallback alone suffices: `normalizeJobToken('alertScanParallel')` === `normalizeJobToken('alertScanParallelJob')` === `"alertscanparallel"`.

**Verified:** controlled unit probe confirms tier-2 resolves the real row (AC-2 mechanism proven). Live local server boot `/api/cron-status`: `layer_a_count` down by 1, zero `taAlertScan`/`bbAlertScan` rows, one `alertScanParallel` row present. Targeted 146/146 pass. `bun tsc --noEmit` clean. Gate 2: toolCount=183/cronJobCount=88 both match baseline. Full `bun test`: 15224 pass/40 skip/60 fail/2 errors/48030 expect — none of the 60 fail/2 error names touch cronConfig/schedulerJobTable/cronStatus/alertScan/CRONS, consistent with documented pre-existing flaky-churn baseline.

**Evidence:** DJ `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server-5.md` S85 for full detail.

Zone health: two permanently-frozen `/api/cron-status` Layer-A rows collapsed into one, correctly resolving to the real `alertScanParallelJob` cron_job_runs liveness data; tsc clean, toolCount/cronJobCount unchanged, targeted+full suite show zero regressions | HEALTHY.

## 2026-08-12 — FACTORY-APP-split-pollNews (P0, dispatch_lane=dev-mcp-server) → REVIEW, next_agent=qa

**Session:** 165f4245-6173-4054-87fd-c55bb626265f. BOUNDED-1 auto-pickup (WIP was 0), title-only spec, no detail_ref. `apps/mcp-server/src/application/usecases/pollNews.ts` was 1444L (baselined at 1444L in `size-lint-baseline.json`, no header) — 1 giant `pollNews()` orchestrator + 5 unrelated helper clusters bolted on.

**Split (staged, Stage 1):** extracted 5 single-responsibility siblings under new `pollNews/`: `types.ts` (5 public interfaces), `insiderDetectors.ts` (2 pure title classifiers, Task 1260/1308a), `signalDedup.ts` (1 internal helper), `defaultFetchers.ts` (6 lazy network fetchers — dropped the grep-confirmed-dead `defaultTradingEconomicsFetcher`, not relocated), `dbHelpers.ts` (4 SQLite helpers). `pollNews.ts` is now a 923L orchestrator (36% smaller) that imports + re-exports everything — zero external call-site changes (grep-verified: only `PollNewsResult`/`SourceFetchers`/`detectInsiderFamilyBuying`/`detectInsiderSelling`/`_resetAllDarkAlert`/`pollNews` are imported elsewhere, all still resolve). Decomposing the remaining ~790L orchestrator body itself is flagged as explicit follow-up, not done this pass (tightly-threaded local state — db/watchlist/macroContext/nmCfg closures — across every stage).

**Verified:** `tsc --noEmit` clean. `size-lint-justification.sh --check`: only pre-existing untouched `transport.ts` fails; scoped `jq` update of `pollNews.ts`'s baseline entry 1444→923 (not a wholesale `--update`, which would silently rebaseline `transport.ts` too). New files carry in-file `size-justification:` headers. All 13 pollNews-referencing test files pass in isolation (109/109). Full suite under contention showed 4 pollNews-touching timeouts at the ~5000ms bun-test-timeout mark; reproduced the IDENTICAL signature swapping the pre-split HEAD version back in, then re-ran `FIX-POLLNEWS-COUNTER-CONSERVATION.test.ts` alone post-suite on the split version (3/3 pass) — confirms pre-existing load-dependent network-timeout flake, not a split regression. Gate 2b/2c/2d: clean boot, toolCount=183/cronJobCount=88 both match baseline. Dashboard circular-dep check clean.

**Evidence:** DJ `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server-5.md` S86. Doc: `usecases.md` `pollNews.ts` entry expanded with the module map. Graphify: SKIPPED — no Skill-tool binding from this subagent context (noted honestly, not claimed).

Zone health: pollNews.ts god-file split into 5 verified single-responsibility modules (1444L→923L orchestrator), tsc clean, size-lint clean, toolCount/cronJobCount unchanged, isolated pollNews test suite 100% green, full-suite drift consistent with documented pre-existing flaky baseline | HEALTHY.
