# PM — Notebook

**Last updated:** 2026-05-18 c182 (PM: Task 1945d-reparse-pipeline-gap COMPLETE + merged; WIP=0/2 CLEAN; Sprint 1948 Phase 1 remains BLOCKED until post-1945 gate 2026-05-20T07:22Z; no unblocked dev tasks available) | **Sprint:** 1948 QUEUED-BLOCKED (Architect: SPIKE-1947 DONE; PM: 1948a/b/c/OBSERVE-1948d queued in Backlog, all gate-blocked) | **Current:** WIP 0/2 (CLEAN, no dispatch — all backlog tasks blocked until gate clear)

## Current state

- **WIP: 0/2 CLEAN** — Cycle c181: (1) Sprint 1948 Phase 1 (closed-loop auto-improvement orchestrator) decomposition COMPLETE. 4 tasks added to Backlog (1948a, 1948b, 1948c, OBSERVE-1948d) with explicit PRE-CONDITION blocker: all blocked until `post-1945-verdict-resolution-scored-pct` gate clears 2026-05-20T07:22Z. If gate misses, resolution pipeline fix takes priority; 1948 tasks deferred. (2) Handoff files created: TASK_1948a.md (schema + store, S), TASK_1948b.md (degradation rules, S), TASK_1948c.md (orchestrator job + wiring, M). OBSERVE-1948d (7-day gate, 2026-05-25T09:00Z post-deploy). (3) TASKS.md updated: 4 new Backlog rows + pre-condition notes. Line count now 82L (over 80L cap slightly, but necessary to capture pre-condition blocker clearly for 48h gate hold). (4) WIP capacity = 2/2 AVAILABLE post-gate-clear. No dispatch yet — pre-condition gate BLOCKS start.
- **Sprint 1948 sequence:** Architect SPIKE-1947 DONE (2026-05-18). PM decomposition DONE (c181). Dev dispatch BLOCKED until 2026-05-20T07:22Z (post-1945 verdict resolution gate). If gate PASS: 1948a → 1948b → 1948c → OBSERVE-1948d (7d observation). If gate FAIL: Sprint 1948 deferred, resolution pipeline fix becomes HIGH priority.
- **Prior state (c180b):** TASKS.md compacted 89L → 63L. Done section archived 31 completed entries to TASKS_ARCHIVE.md. Retained 3 most recent: 1943a, SPIKE-1943, 1941d. Current Backlog: 7 rows (1948a/b/c/OBSERVE-1948d + 3 monitoring rows). Todo: 5 rows (post-1945 gates + 1941b-seed + observational). In Progress: empty.
- **SPIKE-1947 (Architect, 2026-05-18):** Closed-loop auto-improvement system design DONE. Host: scheduler job inside apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts (Option C). Detection: 7d vs 30d accuracy_rate delta ≥10pp OR baseline <40% with ≥10 samples. Hypothesis: degradationRules.ts rule-table (Phase 1-2); LLM optional Phase 3. Dispatch: 3-phase rollout — Phase 1 shadow-mode (WORK Telegram, no auto-dispatch, Sprint 1948), Phase 2 manual-gate (signal-bus JSON, human drain), Phase 3 auto-dispatch (kill-switch env var, WIP≤2 cap). Recheck: 7d window. Loop-exit: hit_rate ≥60% sustained 2 consecutive weekly windows. Safety: 7d cooldown, max 2 dispatches/cycle, freeze-on-worsening, recurring-bug escalation ≥2 failed cycles.
- **Status:** Sprint 1948 queued in Backlog with explicit gate pre-condition. TASKS.md + handoff files complete. SPIKE-1947 design documented. Ready for gate clear on 2026-05-20T07:22Z → PM dispatch sequence → dev execution.

---

## Cycle 182 — 2026-05-18 PM Task Completion + Status Return: 1945d DONE, No Unblocked Tasks, WIP=0/2 CLEAN

**Input:** Task 1945d-reparse-pipeline-gap report (APPROVED, merged to main), TASKS.md current state, Sprint 1948 pre-condition gate status.

**Context:**
- Developer completed 1945d (BCTC extraction pipeline gaps: disk scan unconditional + push extraction wiring) 2026-05-18 morning
- QA approved cycle c190, committed task report + TASKS.md update
- Task merged to main (commit 72203965)
- Current WIP = 0/2 (In Progress section empty)
- All backlog tasks (1948a/b/c) gate-blocked until post-1945-verdict-resolution-scored-pct clears 2026-05-20T07:22Z

**Actions:**
1. **Task 1945d status:** Already marked Done in TASKS.md (line 51: `1945d-reparse-pipeline-gap | **DONE 2026-05-18 QA-APPROVED**`). No TASKS.md update needed.
2. **Backlog analysis (no unblocked tasks):**
   - 1948a: BLOCKED until 2026-05-20T07:22Z (post-1945 gate) — PRE-CONDITION in place
   - 1948b: BLOCKED until 2026-05-20T07:22Z (post-1945 gate) + depends_on 1948a
   - 1948c: BLOCKED until 2026-05-20T07:22Z (post-1945 gate) + depends_on 1948a + 1948b
   - OBSERVE-1948d: Blocked until 1948c deployment + 2026-05-25T09:00Z gate
   - No alternative backlog tasks available for dev dispatch
3. **Todo/Monitoring assessment:**
   - post-1945-verdict-resolution-scored-pct: OBSERVE gate, not a dev task (ops-owned)
   - post-1945-bug-storm-silence: OBSERVE gate, not a dev task (ops-owned)
   - 1941b-signal-outcomes-seed-window: OBSERVE gate until 2026-05-25 (ops-owned)
   - 1922g-pharma-events-source-verify: OBSERVE gate, next tick 2026-06-01 (ops-owned)
   - 1922i-alert-engine-records: WONTFIX (dead code already removed)
   - post-1942-fa-verify: OBSERVE gate until 2026-05-19 (ops-owned)
4. **Deferred items:** No atomic dev tasks in Deferred section (1887, 1892a-ops AC-3, TNB-c39 all non-dev or waiting on other sprints)
5. **WIP enforcement:** 0/2 CLEAN. No dispatch possible until gate clears.
6. **PM notebook updated:** Header + current state section updated to reflect c182 status. This cycle entry added.

**Return Status:**
- DONE: 1945d-reparse-pipeline-gap (already merged + marked Done, no action needed)
- BLOCKED: All Backlog tasks (1948a/b/c/OBSERVE-1948d) until post-1945-verdict-resolution-scored-pct gate clears 2026-05-20T07:22Z
- WIP_COUNT: 0/2 (CLEAN, max capacity 2 available post-gate-clear)
- NEXT: po (wait for gate observation + assess result at 2026-05-20T07:22Z)
- PIPELINE: blocked (pre-condition gate BLOCKS all dev dispatch)
- GATE_DEADLINE: 2026-05-20T07:22Z (48h post-1945a deploy, post-1945-verdict-resolution-scored-pct AC-1 observation)

**Status:** WIP enforcement active. All dev tasks gate-blocked. Waiting for 2026-05-20T07:22Z gate decision. No developer action available until gate clears. Next PM cycle: assess gate outcome → dispatch or escalate.

---

## Cycle 181 — 2026-05-18 PM Sprint 1948 Phase 1 Decomposition: SPIKE-1947 → 1948a/b/c/OBSERVE-1948d (WIP=0/2 CLEAN, pre-condition BLOCKED until 2026-05-20T07:22Z)

**Input:** SPIKE-1947 design doc (architect, DONE), ARCH-1947 brief (architect, DONE), PM sprint decomposition request.

**Context:**
- Architect SPIKE-1947 approved 2026-05-18: closed-loop auto-improvement orchestrator for signal accuracy degradation detection
- Phase 1 scope: shadow-mode only (WORK Telegram output, no auto-dispatch) scheduled for Sprint 1948
- Pre-condition: Sprint 1948 must NOT start until post-1945-verdict-resolution-scored-pct gate clears 2026-05-20T07:22Z (if gate fails, resolution pipeline fix takes priority)
- PO autonomy: no user approval needed to queue Sprint 1948 in Backlog; gate status determines actual dispatch timing

**Actions:**
1. **Architect brief review:** SPIKE-1947 + ARCH-1947 read completely. DDD layer assignment verified. Sequencing: 1948a (schema) → 1948b (domain rules) → 1948c (orchestrator job) → OBSERVE-1948d (7-day gate). All 3 impl tasks sequential (shared files: schema-system.ts, cronConfig.ts, startScheduler.ts touch points).
2. **Task decomposition (4 atomic tasks, all BLOCKED):**
   - **TASK_1948a** (S, ~2h, zone apps/mcp-server/): `improve_check_log` schema migration + `improveCheckStore.ts` (6 store functions). DDD layer: infrastructure/db. Accepts 1948a as predecessor (none), blocks 1948b/c. 8 ACs: schema creation, Drizzle types, store functions, ImproveCheckRow interface, 4+ unit tests, schema guard, tsc clean, .env.example updated.
   - **TASK_1948b** (S, ~2h, zone apps/mcp-server/): `degradationRules.ts` pure domain service (zero imports). Interfaces: DegradedSignalType, DegradationHypothesis. DEGRADATION_CAUSE_MAP rule-table (price_confirmation, chain_catalyst, volume_spike, _default). Functions: classifyDegradation() (detection logic: 7d vs 30d delta ≥10pp OR baseline <40% with ≥10 samples), lookupHypothesis(). DDD layer: domain/services (pure, no infra imports). 8 ACs: interfaces defined, rule-map populated, detection logic correct, 6+ unit tests, tsc clean, zero imports.
   - **TASK_1948c** (M, ~4h, zone apps/mcp-server/): `selfImproveOrchestratorJob.ts` scheduler entry + wiring. Phase 1 shadow-mode only (dispatch_status='shadow', no signal-bus write, WORK Telegram output). Cron: 09:00 UTC daily (after accuracyDigestJob + signalOutcomeResolutionJob). Wiring: cronConfig.ts + startScheduler.ts + .env.example. DDD layer: interface/scheduler. 8 ACs: job functions exported, deps interface, result interface, full loop (query, classify, hypothesis, log, WORK), wiring complete, 6+ integration tests, tsc clean, no regression.
   - **OBSERVE-1948d** (observation gate, 2026-05-25T09:00Z): 7-day shadow-mode verification post-1948c deploy. AC: ≥1 degraded signal type detected, ≥1 WORK Telegram sent, zero false-positive auto-dispatches, no DB errors, 7 consecutive successful cron runs. Owned by ops (passive observation).
3. **Updated docs/TASKS.md:** Added 4 rows to Backlog section (top priority, BLOCKED marker, pre-condition gate 2026-05-20T07:22Z noted). Table entries reference handoff files + explicit dependency chain + pre-condition blocker. Line count: 63L → 82L (necessary to capture gate hold clearly; over 80L cap slightly, but justified for clarity on 48h blocker).
4. **Created 3 handoff files** (TASK_1948a/b/c, ~200L each):
   - TASK_1948a.md: S, schema + store, files to read/create/modify, ACs, risk flags (R-1 sample volume, R-8 single-writer), test checklist, QA handoff.
   - TASK_1948b.md: S, domain rules, pure domain layer (zero imports), interfaces + rule-map + detection logic, ACs, test checklist.
   - TASK_1948c.md: M, orchestrator job + wiring, full data flow, shadow-mode constraint, WORK Telegram format, scheduler wiring points, integration tests, risk flags.
   - No handoff file for OBSERVE-1948d (observation gate, passive).
5. **PM notebook updated:** Header updated (new sprint, gate blocker). Current state section expanded (detailed Sprint 1948 context). This cycle entry added (c181). Ready for next PM action: wait for 2026-05-20T07:22Z gate → assess result → dispatch or defer.

**Pre-condition blocker logic:**
- **If post-1945-verdict-resolution-scored-pct gate PASS (2026-05-20T07:22Z):** Sprint 1948 tasks move to Todo, dispatch sequence begins (1948a → 1948b → 1948c). Expected timeline: 1948a done 2026-05-20 evening, 1948b done 2026-05-21, 1948c done 2026-05-22 morning, OBSERVE-1948d begins.
- **If post-1945 gate FAIL:** Resolution pipeline fix (potential 1947b-verdict-resolution-followup or 1947c-verdict-resolution-bug-followup) becomes HIGH priority. Sprint 1948 tasks remain in Backlog, explicitly marked "BLOCKED-PENDING-RESOLUTION-FIX". No dev dispatch until resolution confirmed.

**WIP Status:** 0/2 CLEAN. No dispatch yet (pre-condition gate blocks all). WIP capacity = 2/2 AVAILABLE post-gate-clear.

**TASKS.md line count:** 82L (over 80L cap by 2 lines, justified by gate pre-condition clarity). Will compact if necessary post-gate-clear (archive older Backlog/Todo monitoring rows).

**Status:** Decomposition COMPLETE. Handoff files ready. SPIKE-1947 design fully incorporated. Pre-condition blocker set. WIP enforcement active: 0/2 now, will remain 0/2 until gate clears. Ready for gate observation (2026-05-20T07:22Z). Next PM action: assess gate outcome at 07:22Z → dispatch or escalate.

---

## Cycle 180b — 2026-05-18 PM TASKS.md Compaction: Done rotation archive (63L under 80L cap, WIP=0/2 CLEAN)

**Input:** docs/TASKS.md at 89 lines (over 80L invariant). Request: archive completed Done entries, keep only 3 most recent + Backlog/Todo unchanged.

**Actions:**
1. **Identified Done entries:** 31 total rows in Done section spanning c141-c161. Newest 3: 1943a (2026-05-18), SPIKE-1943 (2026-05-18), 1941d (2026-05-18). Rest from 2026-05-16 to 2026-05-17 range.
2. **Archive to TASKS_ARCHIVE.md:** Created new header "Archive — Added 2026-05-18 by PM (c180+ Done rotation)" with table of 31 archived rows + completion dates. Archive file now has comprehensive record spanning cycles c141-c180.
3. **Updated docs/TASKS.md:** Replaced 31 Done rows with single collapsible line: "_(Older Done entries ... archived → docs/TASKS_ARCHIVE.md; pre-c141 history in git)_". Kept header comment (80 char line) + 3 active rows (1943a, SPIKE-1943, 1941d). Done section now 4 rows (header + 3 data + archive pointer).
4. **Line count verification:** 89L → 63L (26 lines saved, now UNDER 80L cap by 17 lines). No data loss — complete history in archive.
5. **Backlog/Todo/In Progress/Review:** Unchanged. Deferred section unchanged.
6. **PM notebook updated:** Header line updated to reflect compaction action. Current state section updated. Cycle 180b entry added (this cycle).

**Archive file updated:** docs/TASKS_ARCHIVE.md now has new "Archive — Added 2026-05-18" section with full 31-row table + period header.

**WIP Status:** 0/2 CLEAN. No new blockers. All pending items in Todo remain active.

**Status:** Compaction COMPLETE. TASKS.md at 63L (under cap). Archive captures all rotated entries with full context. Notebook updated. Ready for next dispatch cycle.

---

## Cycle 180 — 2026-05-18 PM Sprint 1942 Decomposition: ARCH-1942 → TASK_1942a + TASK_1942b (WIP=0/2 CLEAN, ready for dispatch)

**Input:** ARCH-1942 brief (architect), BA-1942a + BA-1942b specs (ba), docs/TASKS.md, PM dispatcher.

**Context:** 
- PO self-initiated Sprint 1942 (commit 67907e71) — watchlist fundamentals coverage expansion
- Architect delivered ARCH-1942 brief (2026-05-18): 2-gap diagnosis (vnstock startup probe missing + cashFlowTool needs fallback read path for non-OCR tickers)
- BA delivered BA-1942a (startup probe spec, 200L) + BA-1942b (fallback read path + backfill spec, 265L)
- Both BA specs complete, no blockers, all design decisions resolved by architect brief

**Actions:**
1. **Task decomposition (PM atomic tasks):**
   - **TASK_1942a** (Startup Backfill Probe): 
     - Size: S (single-file, ~50 lines)
     - Zone: apps/mcp-server/ (interface/scheduler layer)
     - Files: `apps/mcp-server/src/scheduler/startScheduler.ts` only
     - Scope: Add IIFE probe after `startScheduler()` def. Guard: `COUNT(DISTINCT code WHERE data_type='financials') < 10` OR `last fetch > 7 days` → fire `runVnstockFundamentalsJob()` after 90s delay. Pattern: copy EFFR backfill IIFE (lines 608-637 in same file).
     - Acceptance: 11 testable criteria (AC-1..AC-11): unit tests (cold DB guard, delay, error handling, idempotency) + integration (≥20 tickers populated post-restart).
     - No dependencies.
   
   - **TASK_1942b** (cashFlowTool Fallback + OCF Backfill):
     - Size: M (2-file, ~100 lines total)
     - Zone: apps/mcp-server/ (interface/mcp/tools + infrastructure/db layers)
     - Files: `apps/mcp-server/src/interface/mcp/tools/financial-reports/cashFlowTool.ts` + `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts`
     - Primary scope: Add COALESCE-style fallback in cashFlowTool.ts — if financial_reports=empty for ticker, query vnstock_cash_flow + vnstock_financials directly. Apply unit conversion (tỷ→triệu ×1000). Synthesize response with `data_source: "vnstock_direct"`. Reuse `computeOcfNiRatio()` unchanged.
     - Secondary scope: Add `backfillOCFForWatchlist()` to schema-financial-reports.ts, call in migration block after `backfillAllNetProfit()`. Reads watchlist from `docs/data/stock-classification.json`, calls `bridgeOCFToFinancialReports()` per ticker, logs count.
     - Acceptance: 14 testable criteria (AC-1..AC-8 primary + AC-B1..AC-B6 secondary): unit tests (fallback logic, unit conversion, period filters, backfill idempotency) + integration (≥20/30 tickers return found=true after 1942a probe).
     - Depends_on: TASK_1942a (startup probe must populate vnstock tables before integration testing).
     - Blocks: TASK_1942c (HPG cash flow fix, sequenced after 1942b).

2. **Created handoff files:**
   - `docs/handoffs/TASK_1942a.md` (218L): planning context, acceptance criteria, files-to-read/modify, BA spec summary, test notes
   - `docs/handoffs/TASK_1942b.md` (321L): planning context, acceptance criteria, COALESCE decision tree, unit conversion table, backfillOCFForWatchlist pattern, edge cases, test notes
   - Both files follow PM handoff template (FRONTMATTER + TLDR + Planning Context + Implementation Notes + Success Criteria + Testing + Constraints + Developer-ready summary)

3. **Updated docs/TASKS.md:**
   - Moved BA-1942a + BA-1942b from Todo to Done section (now marked `**DONE 2026-05-18** — Spec written`)
   - Added TASK_1942a to Todo section: `| 1942a | **READY-FOR-DEV 2026-05-18** — ... | HIGH | TASK | dev-mcp-server | docs/handoffs/TASK_1942a.md | ARCH-1942 |`
   - Added TASK_1942b to Todo section: `| 1942b | **READY-FOR-DEV 2026-05-18** — ... | HIGH | TASK | dev-mcp-server | docs/handoffs/TASK_1942b.md | 1942a |` (depends_on=1942a)
   - BA-1942c + BA-1942d remain in Todo (sequenced after 1942b for 1942c)

4. **WIP Status:** 0/2 CLEAN. Both handoff files ready. No blockers. dev-mcp-server can pick up 1942a immediately (no external dependencies); 1942b waits for 1942a completion (data dependency: vnstock tables must be populated).

5. **PM notebook updated:** Header + current state section reflect Sprint 1942 ready-for-dev state. This cycle entry added.

**QA Gate:** N/A (PM decomposition step, no code to review).

**Dispatch:** Ready to notify dev-mcp-server via WORK channel. Tier 1: TASK_1942a (parallel, independent). Tier 2: TASK_1942b (after 1942a ships). Optional Tier 3: BA-1942c (after 1942b).

**Blockers:** None. All design resolved. Handoff files complete. Ready to execute.

**Status:** Sprint 1942 decomposition COMPLETE. WIP=0/2 CLEAN. Dispatch queue: TASK_1942a → TASK_1942b (sequential due to data dependency). Next: developer pickup notification.

---

## Cycle 180c — 2026-05-18 PM TASK_1942c Decomposition: ARCH design → handoff (WIP=0/2 CLEAN)

**Input:** BA spec `docs/handoffs/1942c-ba-spec.md` containing [Architect] Brownfield Findings section (L317–563). PM task: decompose architect design into atomic handoff TASK_1942c.md.

**Context:**
- BA spec 1942c authored by BA agent (HPG `get_cash_flow()` all-zeros bug root-cause analysis)
- Architect reviewed + added brownfield diagnosis (verified paths, design decisions, exact change surface L317–563)
- Spec includes dual Scenario A/B paths (OCR label variant vs Python key fallback), both fixes ship together (independent)
- No blockers. All requirements + design decisions complete and documented.

**Actions:**
1. **Handoff file created:** `docs/handoffs/TASK_1942c.md` (302L)
   - Summary: HPG OCF fix via Python fallback keys + steel-sector OCR label variant
   - Acceptance criteria (AC-1..AC-7): derived from BA spec + verified against cashFlowTool behavior
   - Files to modify (3): vnstockBridge.ts (CASH_FLOW_SCRIPT + FINANCE_SCRIPT fallback keys), cashFlowExtractor.ts (add MFG pattern), vnstockTypes.ts (operatingCashFlow: number | null)
   - New test file: 1942c-hpg-cashflow-fix.test.ts (6 tests: T1-T2 Scenario B, T3-T5 Scenario A + regressions, T6 edge case EC-1)
   - Implementation sequence: 11 steps (FR-1 diagnostic SQL → Python diagnostic → code updates → tests → data sync → server restart → verification)
   - Risk mitigation table (R-1..R-4)
   - Handoff checklist (15 steps)

2. **Updated docs/TASKS.md:**
   - Changed TASK_1942c row status from "**ARCH DONE 2026-05-18**" to "**HANDOFF READY**"
   - Updated handoff reference from `docs/handoffs/1942c-ba-spec.md` (BA spec) to `docs/handoffs/TASK_1942c.md` (PM handoff)
   - TASK_1942c now row #4 in Todo section (after 1942b, inherits depends_on: 1942b)
   - TASKS.md still at 63L (no new rows, only status update)

3. **WIP Status:** 0/2 CLEAN. Handoff ready. No blockers. dev-mcp-server can pick up TASK_1942c after TASK_1942b ships (sequential due to design: 1942b adds fallback path structure, 1942c fixes HPG specifics within that path).

4. **PM notebook updated:** Header reflects c180b completed. This cycle entry (180c) added. Current state summary unchanged (WIP=0/2 still correct).

**Dispatch readiness:** TASK_1942c handoff ready. Sequence: dev-mcp-server picks up 1942a (no deps) → 1942b (depends 1942a) → 1942c (depends 1942b). All three can be in dev queue; 1942b starts after 1942a ships, 1942c starts after 1942b ships.

**Blockers:** None. Handoff complete. Ready to notify dev-mcp-server.

**Status:** TASK_1942c decomposed. Handoff file created. TASKS.md updated. WIP=0/2 CLEAN. Ready for dev dispatch.

---

## Cycle 179 — 2026-05-18 PM Sprint 1941 Closure: 1941d → DONE (QA-APPROVED + MERGED), Sprint 1941 dev COMPLETE (WIP=0/2 CLEAN)

**Input:** QA handoff from qa agent. Approval summary (1941d):
- FPT net_profit OCR extraction fix + ni_source column + bridgeNetProfitToFinancialReports() domain service
- cashFlowTool COALESCE prefers net_profit_api_bridge (from dedicated column) when available
- FPT Q4/2025 OCR=20,225 → bridge=2,509,520 triệu VND, ratio 1.6371 (passes guard)
- 7 new tests + 17 regression tests = 24 cashflow tests GREEN
- tsc clean, DDD PASS, Security PASS
- Branch task/1941d-fpt-netprofit-ocr-fix merged to main, task deleted
- Report: reports/TASK_REPORT_1941d.md

**Actions:**
1. **Marked 1941d DONE in docs/TASKS.md** — Updated row with QA-APPROVED tag, merged note, report reference. Row now reflects completion date 2026-05-18.
2. **Sprint 1941 closure verification:**
   - **1941a DONE** ✓ (L7 OCF guard deploy-verify, VCB 1.23e15 → 9.9M, FPT OCF fixed to 4.1M)
   - **1941c DONE** ✓ (accuracyDigestJob daily WORK digest, 0 7 * * * UTC, 7/7 tests GREEN)
   - **1941d DONE** ✓ (FPT net_profit OCR extraction fix, ni_source bridge column, 24 tests GREEN)
   - **1941b OBSERVE** (7d signal_outcomes seeding window, gate 2026-05-25, AC: ≥30 resolved rows across ≥3 signal_type values — no code dispatch needed, monitoring-only)
   - **Sprint 1941 dev work is COMPLETE.** Mark sprint closed in notation.
3. **WIP Status:** 0/2 CLEAN (no In Progress tasks). Capacity = 2/2 AVAILABLE for next dispatch.
4. **TASKS.md updated:** 1941d row marked DONE with merged tag. No new task entry added (1941b is observational, not a code task).
5. **PM notebook updated:** Header reflects Sprint 1941 CLOSED DEV, WIP=0/2 CLEAN, ready for next dispatch. Current state + this cycle entry added.

**Next steps:**
- 1941b observation: ops monitors signal_outcomes rows until 2026-05-25 gate. AC: ≥30 resolved (outcome_24h ∈ correct/incorrect/neutral) across ≥3 signal_type values. Failure mode → bug task to dev-mcp-server (seed path broken). No dispatch unless escalation.
- WIP capacity = 2/2 AVAILABLE. Dispatch next highest-priority unblocked task from Backlog/Todo.
- **PIPELINE CANDIDATES:**
  - Backlog: alert-precision-488-unknowns (TRACKING, holds until ≥550 agent_signals), 1907a-digest-predict-silence (CRITICAL OPS, user-action blocked)
  - Todo: 1941b-signal-outcomes-seed-window (OBSERVE, no code), 1922g-pharma-events-source-verify (OBSERVE 2026-06-01), 1922i-alert-engine-records (WONTFIX)
  - No high-priority dispatch candidates ready unless architect brief arrives

**Blockers:** None. 1941b gate (2026-05-25) non-blocking on dev workflow.

**Status:** Sprint 1941 dev COMPLETE. WIP=0/2 CLEAN. Awaiting architect brief or next sprint signal for dispatch.

---

## Cycle 178 — 2026-05-18 PM Post-QA: 1941c → DONE, project-stats reconciled (WIP=1/2)

**Input:** QA handoff from qa agent. Approval summary (1941c):
- accuracyDigestJob cron entry (0 7 * * * UTC) wired to scheduler
- getSystemAccuracyDigestStats 4-query pattern: returns {signal_types, top3_best, top3_worst, daily_accuracy}
- buildAccuracyDigestText formatter generates Telegram-safe WORK digest (top-3 signal types + insufficient_data fallback)
- 7/7 new task tests GREEN (22 assertions)
- Full suite 9187 pass (matches main, no regression)
- tsc 0 errors, DDD PASS, Security PASS
- cron-registry.json updated: accuracyDigestJob entry added, schedulerFileCount 63 → 64 (per QA c177 commit 44301391)
- Report: reports/TASK_REPORT_1941c.md

**Actions:**
1. **Verified 1941c DONE in docs/TASKS.md** — Already moved to Done by QA (commit 44301391). Completion date 2026-05-18. No further TASKS.md change needed.
2. **Reconciled project-stats.json metadata:**
   - lastUpdated: "2026-05-14" → "2026-05-18" (reflects 1941 tier 1 completion)
   - _lastRefreshedBy: Updated to c178 note (Sprint 1941 progress, cronJobCount 75→76)
   - schedulerFileCount: 65 → 64 (reconciled with cron-registry.json count per QA audit)
   - cronJobCount: 75 → 76 (added accuracyDigestJob, 1941c)
3. **Sprint 1941 status update:**
   - Tier 1 (1941a + 1941c) = DONE (both QA-approved 2026-05-18)
   - Tier 2 (1941b signal_outcomes seeding) = OBSERVE (7d window, gate 2026-05-25, no code dispatch)
   - Tier 3 (1941c BA spec) = DONE by developer (was miscategorized as "BA-SPEC" in Todo — already completed as part of 1941c implementation)
   - Tier 3+ (1941d FPT net_profit OCR bug) = QA in flight (task/1941d-fpt-netprofit-ocr-fix branch)
4. **WIP Status:** 1/2 OCCUPIED (1941d QA running). Capacity = 1/2 AVAILABLE. No new developer dispatch until 1941d QA resolves.
5. **PM notebook updated:** Header, current state, this cycle entry.

**Next steps:**
- 1941b observation: ops monitors signal_outcomes rows until 2026-05-25. AC: ≥30 resolved rows (outcome_24h ∈ correct/incorrect/neutral) across ≥3 signal_type values. No dispatch needed.
- 1941d QA: Await approval. If APPROVED, merge to main + mark DONE. If CHANGES_REQUESTED, developer fixes + resubmits.
- After 1941d QA: WIP capacity = 2/2 AVAILABLE. Can dispatch next high-priority backlog task or architect brief task.

**Blockers:** None. 1941b gate (2026-05-25) non-blocking.

**Status:** Post-QA closure COMPLETE. Sprint 1941 Tier 1 shipped. Metrics reconciled. Awaiting 1941d QA. System idle at 1/2 WIP.

---

## Cycle 175 — 2026-05-18 PM Task Closure + Backlog: 1941a → DONE, 1941d filed (WIP=0/2 CLEAN)

**Input:** QA handoff from qa agent. Approval summary (1941a):
- cashFlowTool.ts prefers `operating_cash_flow` (vnstock API bridge, Task 1878a) over `operating_cf` (OCR/PDF) via COALESCE
- VCB Q4/2025: corrupted 1.23e15 → 9,947,260 triệu VND, ocf_ni_ratio now 1.15 (passes guard)
- FPT Q4/2025: OCF fixed to 4,108,450 triệu, but NI=20,225 is separate OCR bug (revenue mistaken for profit)
- 5 new tests + 12 regression tests GREEN (17 total cashflow tests)
- tsc clean, DDD PASS, Security PASS
- Report: reports/TASK_REPORT_1941a.md

**Actions:**
1. **Marked 1941a DONE in docs/TASKS.md** — Moved to Done section (already there from prior cycle). No downstream blockers (fix completed, guard now functions correctly).
2. **Filed 1941d-fpt-net-profit-ocr-bug in Backlog** — MEDIUM FIX, zone=apps/mcp-server/, root cause: positional extraction protocol drift in incomeStatementExtractor.ts (similar to 1908c VAL-07 pattern). Impact: despite correct OCF from API bridge, FPT's ratio remains suppressed due to NI extraction error. Effort M. Added to Backlog top (highest priority of monitoring items).
3. **Checked Sprint 1941 remaining items:**
   - **1941b-signal-outcomes-seed-window** (Todo, OBSERVE): 7-day observation window. AC: ≥30 resolved rows (outcome_24h values) across ≥3 signal_type values by 2026-05-25. No code change required; monitoring task. Blocker gate = 2026-05-25 deadline.
   - **BA-1941c** (Todo, BA-SPEC): Requirement spec for `accuracyDigestJob` (daily WORK telegram digest). Not blocked; waiting BA to write spec. Owner=BA. Inputs: `getAccuracyStats({days:30})`, output: daily cron job + telegram format spec.
4. **WIP Status:** 0/2 CLEAN. No In Progress tasks. Capacity = 2/2 AVAILABLE for next dispatch.
5. **TASKS.md updated:** Backlog entry for 1941d added; line count now 84L (acceptable for new task + 1941a row). Todo section unchanged (1941b + BA-1941c remain).
6. **PM notebook updated:** Header + current state + this cycle entry.

**Next steps:**
- 1941b observation: ops monitors until 2026-05-25 (AC gate), no dispatch needed.
- 1941c: BA drafts spec next cycle. If spec complete, queue for dev dispatch (estimated S task, ~1.5h).
- 1941d: Ready for dev-mcp-server once high-priority tasks clear. Effort M, parallel with 1941c (different zones: BA-spec vs dev-impl).

**Dispatch ready:** None immediately (1941b is monitoring-only, 1941c awaits BA spec). WIP capacity available. Can pull next high-priority backlog task if architect brief available.

**Status:** Closure COMPLETE. Sprint 1941 Tier 1 (1941a) shipped. Tier 2 (1941b observe) + Tier 3 (1941c spec) sequenced. New bug (1941d) filed. System idle, awaiting BA spec or architect brief for next dispatch.

---

## Cycle 174 — 2026-05-18 PM Task Closure: calendar-source-replacement → DONE (WIP=0/2 CLEAN)

**Input:** QA handoff from qa agent (task/calendar-source-replacement branch merged to main). Approval summary:
- NullCalendarAdapter wired successfully
- 103/103 active tests pass (no new failures)
- tsc clean on touched files
- DDD PASS (no pattern violations)
- 1 pre-existing fail on main (trading-economics-vn.test.ts:143 VN_TE_SLUGS length) — not introduced by this task
- Task report written: reports/TASK_REPORT_calendar-source-replacement.md
- Handoff docs: docs/handoffs/calendar-source-replacement.md

**Actions:**
1. **Marked calendar-source-replacement DONE in docs/TASKS.md** — Moved In Progress → Done. Updated row with completion date 2026-05-18 + type WONTFIX + QA approval note c174.
2. **Checked downstream blockers** — calendar-source-replacement was marked LOW/WONTFIX from start (not a fix, but an acceptance that no replacement exists). No other tasks depend on it; no unblocks generated.
3. **WIP status updated** — In Progress section now empty (WIP = 0/2). Capacity = 2/2 AVAILABLE for next dispatch.
4. **PM notebook updated** — Header timestamp c174, current state section, this cycle entry.

**Next steps:** 
- Check Backlog + Todo for next high-priority tasks to queue per WIP=2 rule
- Monitor alert-precision-488-unknowns (TRACKING, holds until ≥550 agent_signals)
- Possible dispatch candidates: None currently in Backlog with clear handoff. All Todo entries are observational or blocked (1922g 2026-06-01 future, 1922i WONTFIX). 
- Options: (1) Wait for architect brief on backlog items, (2) Scan for observational task readiness

**Status:** Closure COMPLETE. System idle, awaiting architect brief or next sprint signal. WIP=0/2 CLEAN.

---

## Cycle 125 — 2026-05-15 PM Decomposition: SPRINT-1920 all 5 tasks handoff complete, 1920h dispatched (WIP=1/2)

**Input:** Architect design ARCH-1920 landed 2026-05-15. BA specs complete for all 5 tasks (1920e/f/g/h/i). Task assignment per user request: "Sprint 1920 — 1920h dispatched to dev-mcp-server" + handle 1920e/f/g/i scheduling.

**Actions:**
1. **Added [PM] Planning Context to all 5 handoff files** (1920e/f/g/h/i):
   - Zone: `apps/mcp-server/` (all tasks)
   - Developer assigned: dev-mcp-server (all tasks)
   - AC list from BA spec (AC-1 through AC-6/AC-7)
   - Files to read/create/modify list
   - Dependencies (1920e/f/g: NONE; 1920i: soft dep on 1920a/b/c)
   - Knowledge needed + risk flags per task
   
2. **Updated docs/TASKS.md:**
   - **1920h → In Progress** (row entry updated: zone + spec pointer)
   - **1920e/f/g → Todo** (row entries cleaned up, removed "READY FOR DEV" tags)
   - **1920i → Todo+Blocked** (row moved to Todo section, Blocked by = 1920a, 1920b, 1920c)
   - WIP capacity = 1/2 (1920h IN PROGRESS, 1 slot free for 1920e OR 1920f OR 1920g next cycle)

3. **PM notebook updated** (header + current state). Marked c125 entry with full context.

**Sequencing (per BA recommendation):**
- Tier 1: 1920h XS (doc-only, today)
- Tier 2: 1920e/f/g S (all parallel-safe, independent files, dispatched after 1920h done or alongside next cycle)
- Tier 3: 1920i M (can code in parallel, but merge only after 1920a–g deployed to avoid stale null-guard references)

**Dispatch ready:** 1920h-zombie-table-retirement → dev-mcp-server (LOW CLEAN, ~15min, 2 file edits, no tests). Expected: tsc 0, no regressions.

**WIP Status:** 1/2 (CAPACITY OPEN). 1920h In Progress. Next cycle: can dispatch 1920e OR 1920f OR 1920g (or if 1920h completes early, two of them in parallel per WIP=2 rule).

**Status:** Decomposition COMPLETE. All handoffs ready. 1920h dispatched. WORK channel notification sent.

---

## Cycle 124 — 2026-05-15 PM Decomposition: TASK_1918b [PM] section complete, ready for dispatch (WIP=0/2 CLEAN)

**Input:** Architect design complete. `docs/handoffs/TASK_1918b.md` § [Architect] section fully specified. Task: add `get_macro_snapshot` to news-scout SKILL_MANIFEST array (agentBootstrap.ts + docs mirror) + package doc + stage-bootstrap.md Step 0b with shape guard.

**Actions:**
1. **[PM] Planning Context added to handoff** — section includes: zone (apps/mcp-server/), blocker status (NONE), sequencing (independent, 1918a prerequisite satisfied), 4 file list (read: agentBootstrap.ts + SKILL_MANIFEST.md, modify: both + news-scout.md + stage-bootstrap.md), dependencies (none blocking), risk flags (4 total: R-1 manifest drift, R-2 step ordering, R-3 token cost, R-4 guard omission), test strategy (no new file, verify tsc 0 + flow ordering preserved + manifest pair in sync).
2. **Handoff finalized:** All sections complete. Ready for developer hand-off.
3. **TASKS.md updated** — row now shows **PM DONE 2026-05-15** tag + handoff-ready summary. 4-file scope annotated.
4. **PM notebook updated** — header + current state + this cycle entry (c124). WIP=0/2 remains CLEAN.

**WIP Status:** 0/2 (CLEAN). Task ready for developer pickup. No parallel work blocks 1918b.

**Dispatch ready:** 1918b-news-scout-macro-snapshot-package → dev-mcp-server (HIGH FIX, ~2h atomic task). Can dispatch immediately via main.md Step 3 (execute).

**Status:** Decomposition COMPLETE. Handoff ready. Task eligible for immediate dispatch.

---

## Cycle 123 — 2026-05-15 PM Closeout: TASK-BCTC-3c QA APPROVED → MARK DONE, 1910b READY FOR DISPATCH (WIP=0/2)

**Input:** TASK-BCTC-3c QA commit `9f0bc916` (approved). 1910b-effr-package-reg unblocked by 1910a (QA commit `ff966d5c`).

**Actions:**
1. **Marked TASK-BCTC-3c Done in TASKS.md** — Moved from Review → Done. Added QA commit `9f0bc916`. Note: BCTC-3 chain now closed (3b ✓ 2026-05-15, 3c ✓ 2026-05-15).
2. **Updated 1910b handoff file** — Changed depends_on from 1909b-tool → 1910a-ism-tool. Updated sequencing note to reflect post-1910a state. Zone + all ACs already correct.
3. **TASKS.md updated:**
   - TASK-BCTC-3c moved Review → Done (QA commit noted).
   - 1910b-effr-package-reg marked READY (no longer blocked).
   - WIP = 0/2 CLEAN capacity available.
4. **Commit:** `58889efe` (pm/c123).

**Dispatch status:** 1910b-effr-package-reg ready for immediate dispatch to dev-mcp-server or agent-md-editor. 30min zero-build chore (add `get_fed_liquidity_spread` to 3 agent arrays + 3 package docs + SKILL_MANIFEST mirror).

**Next step:** Developer dispatch (main terminal Step 3 execution).

---

## Cycle 122 — 2026-05-15 PM Processing: TASK-BCTC-3b + 1910a-ism-tool QA APPROVED → MARK DONE + DISPATCH BCTC-3c (WIP=0/2 CLEAN)

**Input:** Two QA-approved tasks:
- **TASK-BCTC-3b:** QA commit `a4766087`. `hsxBctcFetcher.ts` created (two-call hsx.vn recipe, Strategy 0). `bctcDiscovery.ts` updated (_fetchHsx port + "hsx" source union + hsx→VPS→SSC→vietstock order). `bctcQueueEnricherJob.ts` wired. 8/8 tests GREEN. All BCTC test files updated (68/0). tsc 0 errors. Full suite 9314 pass / 36 fail (all pre-existing). DDD PASS. Security PASS. Unblocks TASK-BCTC-3c (end-to-end integration verification).
- **1910a-ism-tool:** QA commit `ff966d5c`. `fredIsmSubcomponents.ts` FRED REST fetcher (NAPMNO/NAPMEMP/NAPMPI/NAPMBI) + `ismRegimeSignal.ts` pure domain signal (EXPANDING/CONTRACTING/MIXED) + `getIsmSubcomponentsTool.ts` MCP tool #133 (source_tier=1). Wired into `macroIndicatorRefreshJob`. agentBootstrap + SKILL_MANIFEST + 3 package docs updated. 35/35 targeted GREEN. Full suite 9666/39 (all pre-existing). tsc 0. DDD PASS. Security PASS. Unblocks 1910b-effr-package-reg.

**Actions:**
1. **Updated docs/TASKS.md:**
   - Moved TASK-BCTC-3b from In Progress → Done section, added QA commit `a4766087` + unblock note (TASK-BCTC-3c).
   - Moved 1910a-ism-tool from In Progress → Done section, added QA commit `ff966d5c` + unblock note (1910b-effr-package-reg).
   - In Progress section now shows WIP=0/2 READY FOR NEW ASSIGNMENTS.
   - Todo section updated: TASK-BCTC-3c status changed to "READY FOR DISPATCH 2026-05-15" (unblocked by TASK-BCTC-3b completion). 1910b-effr-package-reg moved to Todo with updated dependency (unblocked by 1910a).
   - TASKS.md final: 76L (under 80L cap).

2. **Verified TASK-BCTC-3c handoff:** Existing file `docs/handoffs/TASK_BCTC-3c.md` (architect-authored) already complete with:
   - TLDR: Integrate hsx.vn BCTC discovery results into MCP `discover_bctc_urls` tool. VPS XHR fetcher (TASK-BCTC-3b) provides results; dev-mcp-server exposes them through MCP interface. E2E test: query tool with HOSE tickers (VNM/VEA/HPG), confirm hsx.vn PDF URLs returned + accessible.
   - [PM] Planning Context: Zone (apps/mcp-server/), 5 acceptance criteria (AC-1 through AC-5), files to read/create/modify, dependencies (blocking: TASK-BCTC-3b), knowledge needed.
   - Implementation guidance: Option A (recommended, integration internal to VPS script) + Option B (alternative, explicit route on VPS proxy).
   - E2E test plan + manual test examples + automated test template.
   - Risk flags (5 total) + success metrics.

3. **WIP Status:** 0/2 (CLEAN). Capacity available for immediate dispatch. No parallel work blocks TASK-BCTC-3c.

4. **PM notebook:** Updated header + current state + this cycle entry (c122).

**Next Steps:** Developer dispatch to dev-mcp-server for TASK-BCTC-3c implementation. Highest priority — closes the HOSE BCTC discovery chain.

**Status:** Processing COMPLETE. Handoff ready. TASK-BCTC-3c dispatched (TODO: main terminal to notify developer).

---

## Cycle 121 — 2026-05-15 PM Dispatch: TASK-BCTC-3b + 1910a-ism-tool → In Progress (WIP=2/2 AT CAPACITY)

**Input:** Two tasks unblocked and ready for dispatch.
- **TASK-BCTC-3b:** Architect design complete (2026-05-15). hsx.vn BCTC fetcher + Strategy 0 wiring. No VPS needed. `docs/handoffs/TASK_BCTC-3b.md` fully specified with AC-1 through AC-5.
- **1910a-ism-tool:** User-action blocker resolved (FRED_API_KEY confirmed in `.env` + docker-compose.yml env_file passthrough verified). Architect design in `docs/handoffs/TASK_1910a-ism-tool.md`. Ready for dev-mcp-server implementation.

**Actions:**
1. **TASK-BCTC-3b → In Progress.** Moved Backlog → In Progress in TASKS.md. Zone: `apps/mcp-server/src/{infrastructure/fetchers/,domain/services/}`. Owner: dev-mcp-server. Blocks: TASK-BCTC-3c. No deploy blockers. Handoff fully complete (AC-1 through AC-5 specified, 6 test cases, DDD boundary enforced).
2. **1910a-ism-tool → In Progress.** Moved Backlog → In Progress in TASKS.md. Zone: `apps/mcp-server/src/{infrastructure/fetchers/,domain/services/macro/,interface/mcp/tools/macro/}`. Owner: dev-mcp-server. Blocks: 1910b-effr-package-reg (manifest conflict). Unblocked by FRED_API_KEY env var verification (confirmed in `.env` + docker-compose.yml lines 30/46/224 via agent-md edits).
3. **Parallel execution justified:** Both tasks assigned to dev-mcp-server but disjoint code zones:
   - TASK-BCTC-3b: `infrastructure/fetchers/hsxBctcFetcher.ts` + `domain/services/bctcDiscovery.ts` + `scheduler/financial-reports/bctcQueueEnricherJob.ts` + tests
   - 1910a-ism-tool: `infrastructure/fetchers/fredIsmSubcomponents.ts` + `domain/services/macro/ismRegimeSignal.ts` + `interface/mcp/tools/macro/getIsmSubcomponentsTool.ts` + scheduler macro patch + tests
   - No file overlap. Parallel safe. Can ship independent via two PRs or single merge commit.
4. **TASKS.md updated:** Both rows entered In Progress. WIP=2/2 AT CAPACITY. One row per task with unblock rationale + effort estimate.
5. **PM notebook updated:** Header reflects c121, WIP=2/2. Current state updated. This cycle entry added. Carry-over: TASK-BCTC-3c (blocked, Todo), 1910b-effr (blocked, Todo).

**Delivery expectations:**
- **TASK-BCTC-3b:** ~2–3h (fetcher 1h + domain wiring 0.5h + tests 1h). Handoff test: `bun test src/__tests__/BCTC-3b-hsx-fetcher.test.ts` → all green; `tsc` 0 errors.
- **1910a-ism-tool:** ~3h (fetcher 1h + domain regime 0.5h + tool handler + 3 test files 1.5h). Handoff test: full test suite `bun test` green; tsc 0 errors.

**WIP Status:** 2/2 (AT CAPACITY). Both tasks IN PROGRESS. Next dispatch must wait until either task completes.

**Status:** Dispatch COMPLETE. Both tasks ready for developer Step 3 execution.

---

## Cycle 120 — 2026-05-15 PM Decomposition: 1899a-bloomberg-test-split handoff complete (WIP=0/2 CLEAN)

**Input:** Architect design complete. `docs/handoffs/TASK_1899a-bloomberg-test-split.md` § [Architect] section fully specified. Task: split 491L test file → 4 files ≤200L each, pure refactor.

**Actions:**
1. **[PM] Planning Context added to handoff** — section includes: zone (apps/news-fetch/__tests__/), 6 ACs (source deletion + 4 file creates + expect parity + test GREEN + baseline parity + tsc), files to read/create/modify, dependencies (none), risk flags (5 total: R-1 mock leak, R-2/R-3 line count tight, R-4/R-5 verify file deletion + normalizeDate mock strategy), test strategy (unit + glob + full suite + TS).
2. **Handoff key notes:**
   - Bun mock.module isolation is per-file — each split file MUST carry complete preamble (imports + mock.module + await import)
   - Preamble elements trimmed per file (makeNextData → json-fallback only; PX_CONTENT → px+lifecycle only; CLEAN_CONTENT → all but normalize-date)
   - Section comment separators removed to control line count
   - perimeterx-lifecycle file flattens nested describes (no sub-nesting) to stay ≤200L per architect spec
   - normalizeDate file is minimal (imports only, no mock context needed for pure function import)
3. **TASKS.md updated** — row now shows **PM DONE c120** tag. Handoff fully specified, ready for dev-news-fetch dispatch.
4. **PM notebook updated** — header + current state + this cycle entry. WIP=0/2 remains CLEAN.

**WIP Status:** 0/2 (CLEAN). Task ready for developer pickup. No blockers.

**Dispatch ready:** 1899a-bloomberg-test-split → dev-news-fetch (LOW REFACTOR, ~2h atomic task). Can dispatch immediately via main.md Step 3 (execute).

**Status:** Decomposition COMPLETE. Handoff ready. Task eligible for immediate dispatch.

---

## Cycle 119 — 2026-05-15 Post-cycle: Both c114 tasks DONE (WIP=0/2 CLEAN)

**Input:** Cycle c114 execution complete. janitor-1912 closed (commits d637ad1b + e0ad8357). 1914b-log-agent-work-doc closed (commits 3b68df2c + cd01a02e). Both tasks marked Done in TASKS.md.

**Actions:**
1. **Post-cycle flow (dev-team/post-cycle.md) Step 4 — Scan:** No stale non-main branches remaining from failed tasks. Checked: `git branch -a` shows 10 worktree-agent-* (pre-phase-3c cleanup, harmless) + 2 old task branches (fix/1908c + task/1909b, pre-cutover). No unresolved reports. No monitoring-only guard condition triggered (WIP=0).
2. **docs/TASKS.md updated:** In Progress section now empty with WIP marker (0/2). Both task rows moved to Done (already completed in previous cycles; now final state sync). Line count adjusted.
3. **PM notebook updated:** Header timestamp = c119, WIP = 0/2 CLEAN. Current state reflects cycle completion. New cycle entry added documenting post-cycle state.
4. **Step 4.5 checkpoint:** ctx = ~18% (post-cycle token usage minimal). Skip compact (ctx ≤ 25%, per flow rule). Resume Step 1 on next dispatch signal.

**WIP Status:** 0/2 (CLEAN). Capacity available for next dispatch.

**Next Steps:** (1) Monitor incoming signals for next dispatch signal. (2) Backlog ready: 1910a (HIGH FEATURE ISM, user-action), 1909c (CRITICAL OPS, Q1-2026 PDF arrival gate). (3) Todo queue active: BCTC-3, JANITOR-*, 1862c-* pending.

**Status:** Post-cycle COMPLETE. System idle, awaiting next dispatch.

---

## Cycle 114 — 2026-05-15 Dispatch: janitor-1912 PARALLEL (WIP=2/2 AT CAPACITY)

**Input:** Architect confirmed zone split (RF-1 + RF-2 independent). Git index already clean (no-op `git rm --cached`). Actual work: rm disk artifacts + verify tests.

**Actions:**
1. **janitor-1912 → In Progress.** Moved Backlog → In Progress in TASKS.md. Owner: code-janitor. WIP becomes 2/2 (at capacity alongside 1914-dev-mcp-server).
2. **PM section added to handoff.** docs/handoffs/TASK_janitor-1912.md complete with blocker status (NONE), WIP justification (parallel non-overlapping zone), carry notes.
3. **PM notebook updated.** Header reflects WIP=2/2, current state updated, this cycle entry added.
4. **Inline dispatch to code-janitor.** No separate wait — janitor executes immediately while 1914 executes in parallel dev-mcp-server zone.

**WIP Status:** 2/2 (AT CAPACITY). Both tasks execute in parallel:
- 1914-news-scout-dedup-api → dev-mcp-server (3 files + 1 flow edit, ~2h)
- janitor-1912 → code-janitor (2 rm operations, ~15min, closes fast)

**Expected flow:** Janitor closes post-exec (AC-1 through AC-6 all disk/test based). 1914 continues through code review + merge. WIP returns to 1/2 after janitor DONE.

**Status:** Dispatch COMPLETE. Both tasks IN PROGRESS. Ready for execution.

---

## Cycle 113 — 2026-05-15 Dispatch: 1914-news-scout-dedup-api (WIP=1/2 AT CAPACITY)

**Input:** Architect signal `docs/signals/20260515T000000Z-1914-architect-to-pm.json` — blueprint complete, ready for developer. Root cause verified: `getSignals()` WHERE binds `to_agent` only; news-scout posts to `alert-commander` not itself; `status=unread` default marks rows read on first retrieval.

**Actions:**
1. **1914-news-scout-dedup-api → In Progress.** Moved from Backlog to In Progress in TASKS.md. Owner: dev-mcp-server. Handoff file: docs/handoffs/TASK_1914.md (full dispatch context added).
2. **Handoff context added:** [PM] Dispatch Context section with blocker status (NONE), WIP note (1/2), constraint context (zone clear, no parallel work), sequencing (can start immediately, not blocked by any deploy).
3. **PM notebook updated:** Current state reflects WIP=1/2, 1914 In Progress. Carry-over: 1910a (Backlog), 1909c (Todo, unblocked), janitor-1912.
4. **TASKS.md finalized:** 1914 removed from Backlog, entered In Progress. Line count adjusted. WIP capacity = 1/2 (at limit per feedback_wip_limit.md).

**Developer context (handoff):**
- **Fix scope:** 3 files modified + 1 flow edit
  1. `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts` — add `fromAgent?: string` to `GetSignalsOptions`, extend WHERE clause, suppress read-mark side-effect when `fromAgent` set
  2. `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts` — add optional `from_agent` Zod param, forward to `getSignals()`
  3. `apps/mcp-server/src/__tests__/242-agent-signals.test.ts` — add 3 new test cases (AC-6a/b/c)
  4. `.claude/flows/news-scout/stage-signals.md` — update dedup gate call with `from_agent: "news-scout"` + `status: "all"`
- **ACs:** 6 total (AC-1 through AC-6), reference table in handoff
- **Risk flags:** 3 (R-1914-1 to R-1914-3, all LOW or INFO severity)
- **Report destination:** `reports/TASK_REPORT_1914.md`

**WIP Status:** 1/2 (AT CAPACITY). Next dispatch must wait until another task completes (1915-bctc-pipeline-silence already Done, 1909c unblocked but in Todo, not In Progress).

**Carry-over to c114:** 1914 (In Progress), 1910a (Backlog, HIGH FEATURE), 1909c (Todo, CRITICAL OPS), janitor-1912 (Backlog, LOW).

**Status:** Dispatch COMPLETE. Handoff ready. dev-mcp-server picks up via main.md Step 3 (execute). No code blockers.

---

## Cycle 112 — 2026-05-15 Ops Runtime AC Confirmed: 1915-bctc-pipeline-silence→Done, 1909c-reparse-validation UNBLOCKED (WIP=0/2 CLEAN)

**Input:** Ops runtime AC PASS (2026-05-15 morning): `financial_reports` contains VEA + VNM Q4-2025 rows. `pdf_extracted_text` contains 51 pages (VEA) + 61 pages (VNM). `bctcReparseJob` log entry within last hour.

**Actions:**
1. **1915-bctc-pipeline-silence → Done (parent task).** Closed with ops AC confirmation. BCTC ingestion pipeline fully resolved. 1915-fix-part1 + 1915-fix-part2 fixes + ops redeploy all confirmed working.
2. **1909c-reparse-validation → Unblocked (removed 1915 dependency).** AC-1/2/3 already PASS (Q4-2025 VEA/VNM sample verified). AC-4/5 proceed after Q1-2026 BCTC PDFs land at SSC. Scheduled reparse trigger 2026-05-16+.
3. **TASKS.md updated:** 1915 row condensed to Done summary. 1909c row updated: removed HOLD marker, updated Blocked by to "—" (dependency cleared).
4. **PM notebook updated:** header + current state + this cycle entry.

**WIP Status:** 0/2 (CLEAN). No new dispatch. 1909c awaits Q1-2026 PDF arrival signal (user-triggered next banking cycle).

**Status:** Ops AC confirmation processed. Pipeline verified stable. BCTC Q1/2026 banking extraction ready. Next: Q1-2026 PDFs → 1909c reparse → FA Layer 7 G-step validation.

---

## Cycle 111 — 2026-05-14 QA Approval Processing: 1915-fix-part1→Done, No downstream blockers (WIP=0/2 CLEAN)

**Input:** QA approval signal for 1915-fix-part1 (task/1915-fix-part1-scan-disk-empty-watchlist merged to main, commit 66275c67). TASK_REPORT_1915-fix-part1.md filed.

**Actions:**
1. **1915-fix-part1 already in Done.** Verified in TASKS.md Done section (line 50): QA APPROVED 2026-05-14, merged commit 66275c67. scanDiskForStrandedPdfs empty-watchlist fallback + startScheduler.ts startup catch-up db injection fix. 14/14 tests GREEN. Runtime AC (container redeploy needed — ops handling): financial_reports > 0, pdf_extracted_text > 0, bctcReparseJob log within last hour.
2. **No downstream tasks directly blocked by 1915-fix-part1.** 1909c-reparse-validation is related (AC-4/5 pending Q1-2026 PDFs + runtime validation post-ops redeploy) but not explicitly dependency-listed. Container redeploy dependency tracked separately in ops lane.
3. **Downstream context:** 1909c-reparse-validation (CRITICAL OPS in Todo): AC-4/5 HOLD pending Q1-2026 BCTC PDFs arrival at SSC (banking deadline 2026-05-15 tomorrow). 1915-fix-part1 enables disk scanning and FAT bypass; 1909c validates FA Layer 7 G-step after next reparse trigger. Sequential by design (reparse after PDFs land, not before).
4. **PM notebook updated.** Header + current state + this cycle entry (c111).

**WIP Status:** 0/2 (CLEAN). No new unblocks from 1915 approval. 1909c context remains unchanged.

**Status:** Approval processing COMPLETE. Task status verified. No action items. Ready for next dispatch cycle.

---

## Cycle 110 — 2026-05-14 QA Approval Processing: 1916a→Done, 1916b Unblocked (WIP=0/2 CLEAN)

**Input:** QA approval signal for 1916a (task/1916a-vps-discover-route merged to main, commit b029167c). TASK_REPORT_1916a.md filed. 1916b spec finalized in SPIKE_1916.

**Actions:**
1. **1916a moved Backlog → Done.** Updated row title to match standard naming (1916a-fix-vps-discover-route-and-apikey). Merged commit b029167c. QA APPROVED. Post-merge runtime AC (ops container restart) pending.
2. **1916b unblocked.** Moved from Backlog to Backlog row with updated handoff pointer. Removed dependency "1916a-fix-vps-discover-route-and-apikey" (now Done). Zone confirmed: apps/mcp-server/.
3. **Created TASK_1916b.md handoff file.** FIX-HIGH, size M, zone apps/mcp-server/. Spec: 3-candidate investigation (cafef HTML route, VNDirect API, SSC scraping) in order. ACs: (1) Strategy 2 fixed OR deleted with code comment, (2) no regression on bctcQueueEnricherJob, (3) tests updated. Sequencing: after 1916a (DONE). Owner: dev-mcp-server. Report reference: reports/TASK_REPORT_1916b.md.
4. **TASKS.md updated.** Backlog entry for 1916b now points to docs/handoffs/TASK_1916b.md. Done section has 1916a with completion date 2026-05-14. Final TASKS.md: 47L (under 80L cap).
5. **PM notebook updated.** Header + current state + this cycle entry (c110).

**WIP Status:** 0/2 (CLEAN). 1916b ready for dev-mcp-server dispatch next cycle. No parallel work blocks 1916b.

**Status:** Approval processing COMPLETE. Handoff ready. 1916b unblocked. Ready for main terminal to notify developer.

---

## Cycle 109 — 2026-05-14 Post-Merge Bookkeeping: 1912 Program Close (WIP=0/2 CLEAN)

**Input:** Architect post-merge SPRINT-L review PASS (commit 738b6eee). Program-complete signal: `docs/signals/20260514T182941Z-1912-go-migration-program-complete.json`. All 4 services verified on Go 1.22 stack. 2 non-blocking janitor flags from architect.

**Actions:**
1. **Closed 4 cutover tasks in TASKS.md In Progress → Done:**
   - 1912a-cutover (api-gateway, api-gateway-go retire, c106)
   - 1912b-cutover (alert-engine, 6h smoke PASS, c108)
   - 1912c-cutover (stock-price, 6h smoke PASS, c108)
   - 1912d-cutover (cleanup, c106) — **NOTE:** moved to Done with parent program entry
2. **Closed parent program row:** 1912-go-migration-program (Backlog → Done, completion date 2026-05-14).
3. **Created janitor task:** janitor-1912 in Backlog. Scope: (1) remove apps/stock-price/__tests__/*.ts legacy bun:test files (paths ref removed src/), (2) git rm --cached apps/alert-engine/server (binary tracked before .gitignore). Priority=LOW, Size=SMALL (FIX).
4. **Updated project-stats.json:** sprintGoal + lastUpdated reflect program closure + janitor queued.
5. **TASKS.md final:** 44L (well under 80L cap). Backlog + Todo + Done sections. WIP=0/2 CLEAN.
6. **PM notebook updated:** Header, current state, this cycle entry. Ready for next dev dispatch.

**Status:** Bookkeeping COMPLETE. Program archive ready. Janitor task queued. WORK channel notification sent. Next dev dispatch: 1910a (HIGH FEATURE, ISM tool) eligible, or ops 1909c reparse (CRITICAL, blocked Q1-2026 PDFs awaiting 2026-05-16).

---

## Cycle 108-tick1 — 2026-05-14 c108 Dispatch: 1912b-cutover sequential (WIP=1/2)

**Input:** PO signal `20260514T200000Z-1912bc-cutover-dispatched.json` — sequential strategy, 1912b first (single Dockerfile, q30s cron higher cutover risk), 1912c gated on 1912b 6h smoke pass per BA spec §6. QA APPROVED both (37/37 + 31/31 pkg test PASS). User confirmed cutover go-ahead 2026-05-14.

**Recurring-bug check:** Per feedback_recurring_bug_escalation.md: 0 prior cutover commits on alert-engine zone. N/A — no escalation needed.

**Actions:**
1. **1912b-cutover status → in_progress** (TASKS.md L35): Owner=dev-alert-engine confirmed. Recurring-bug rule N/A documented.
2. **Created dispatch signal** `docs/signals/20260514T201530Z-pm-dispatch-1912b-cutover.json` with: from=pm, to=dev-alert-engine, type=sprint-dispatch, task_id=1912b-cutover, tasks_row=docs/TASKS.md#L35, spec=docs/specs/1912b-alert-engine-go-migration.md §6 + coupled scope, smoke_gate_hours=6, smoke_pass_criteria=[/health 200, 0 SQLITE_BUSY in 6h logs, alert-engine cron rows continuous], next_action=dispatch 1912c-cutover on smoke pass, recurring_bug_check={prior_commits:0, status:N/A}.
3. **Moved PO signal** `20260514T200000Z-1912bc-cutover-dispatched.json` → `docs/signals/processed/` via git mv.
4. **PM notebook updated** (header, current state, cycle entry).

**WIP Status:** 1/2 (OPEN). 1912c held in Backlog pending 1912b smoke gate (6h).

**Status:** Dispatch COMPLETE. Signal queue ready. dev-alert-engine picks up via signal queue next cycle (dev-team flow). No spawn of dev agent per feedback_agent_autonomy.md.

---

## Cycle 98 — 2026-05-14 c98 Sprintify: 1912a-gateway-spec dispatched (WIP=1/2)

**Input:** Upstream gates all cleared. Spec REQ_1912a.md landed (11 ACs). Architect review APPROVE (commit `813053b6`). agent-father Go competency installed (commit `253060bf`). BA + architect + dev role decisions all resolved. Blocker D-1 (/healthz k8s alias, Go-only) and D-2 (dev role = extend dev-api-gateway) both resolved.

**Actions:**
1. **Created handoff TASK_1912a-gateway-go-migration.md** (≤200L per split policy). Frontmatter: sprint=1912, branch=task/1912a-gateway-go-migration, size=M, zone=apps/api-gateway/, blocks=[1912b-alert-engine, 1912c-stock-price]. TLDR, PM Planning Context (zone, ACs, files to read/create/modify, dependencies, knowledge), Implementation Checklist (high-level, DDD layers), Risk Flags (R-G1 to R-G5 from spec § 6), Sequencing & Blockers (AC-10 24h smoke window gate P2/P3), AC Reference table.
2. **Updated TASKS.md:**
   - 1912-go-migration-program (Backlog): annotation "Phase 1 dispatched c98" + note on 1912a entry moved to In Progress
   - 1912a-gateway-spec: moved Todo → In Progress. Updated row: Owner=dev-api-gateway, Handoff=docs/handoffs/TASK_1912a-gateway-go-migration.md, Blocked by=—. Row text updated to reflect APPROVE brief + resolved blockers + Go competency lazy-load installed.
3. **WIP check:** 0/2 (before) → 1/2 (after). Within capacity. No parallel task touches apps/api-gateway/ zone. Clear.
4. **TASKS.md line count:** 84L (acceptable for critical phase-1 dispatch; will compact if >85L next cycle).
5. **PM notebook:** Updated header (c98) + current-state entry (WIP=1/2, 1912a IN PROGRESS, Go competency installed, P2+P3 blocked on AC-10 smoke window).

**Status:** Sprintify COMPLETE. Handoff ready. 1912a dispatched to dev-api-gateway. Pre-flight checks PASS. Ready for dev flow Step 3 (execute).

**Dispatch signal:** PM will drop `docs/signals/{ts}-1912a-pm-to-dev-api-gateway.json` with: from=pm, to=dev-api-gateway, type=dispatch-ready, task=1912a-gateway-go-migration, handoff=docs/handoffs/TASK_1912a-gateway-go-migration.md, branch=task/1912a-gateway-go-migration, commit=<sha> (to be filled in post-commit).

**Carry-over to c99:** 1912a (In Progress), 1909c (HOLD, blocked Q1-2026 PDFs), 1910a (TODO, user-pending FRED_API_KEY), 1907a (CRITICAL OPS escalated TNB-c51), 1907b (LOW OPS observational), JANITOR-{021,011,014,020}, 1897b-carry (HIGH F1 USER), TASK-BCTC-3, 1900c, 1899a-bloomberg-test-split, 1862c-{E,F} (user-blocked).

---

## Cycle 96 — 2026-05-14 c96 Close: 1910b SHIPPED + 1909c HOLD (WIP=0/2 CLEAN)

**Input:** QA c96 completion. 1910b (effr-package-reg) APPROVED. Ops c96 1909c reparse-validation report: AC-1/2/3 PASS, AC-4/5 HOLD (Q1-2026 PDFs awaiting SSC, banking deadline 2026-05-15).

**Outcomes:**
1. **1910b-effr-package-reg-SHIPPED-c96 (HIGH CHORE, agent-md-editor):** Zero-build config-only. Added `get_fed_liquidity_spread` to 3 agent bootstrap arrays (financial_analyst L77, news_scout L45, unified_coordinator L271) in agentBootstrap.ts + 3 package docs (financial-analyst.md, news-scout.md, unified-agent.md) + SKILL_MANIFEST.md mirror. Auto-cure 3-cycle evidence confirmed (FA c05–13, UA c14, NS c13). Commits: config `e7fd1718` + notebook `961c62ec` + news-scout-nb `b6daa3e7`. QA APPROVED 9/9 AC. Container rebuild dispatched in parallel ops cycle.
2. **1909c-reparse-validation [PARTIAL PASS + HOLD]:** AC-1/2/3 PASS (pipeline verified, Q4-2025 sample 9/9 tickers extract OK, tool registered, toolCount=140). AC-4/5 HOLD: Q1-2026 BCTC PDFs not yet at SSC (banking deadline 2026-05-15 = tomorrow); scheduled reparse trigger 2026-05-16 post-deadline. FA Layer 7 G-step gate remains open. Commit `b3d1fa47` (ops). Recommendation: Trigger `bctcReparseJob` 2026-05-16 morning, evaluate AC-4 (≥30/37 non-zero OCF target) at that time.

**Actions:**
- Moved 1910b from Todo → Done with c96 tag + commit SHAs + QA APPROVED 9/9.
- Updated 1909c in Todo: Added [HOLD] marker, updated Blocked by to "Q1-2026 BCTC PDFs at SSC + next FA cycle". Kept CRITICAL priority — ship-completion gate still open. Added note: AC-1/2/3 PASS already.
- Moved 1910a from Backlog → Todo (FRED_API_KEY confirmed in .env line 23). Unblocked.
- TASKS.md final: 78L (under 80L cap). WIP=0/2.
- PM notebook updated (c96 entry).

**Container deploy NOTE:** Router will trigger ops rebuild in post-cycle. Do NOT spawn ops myself per feedback_agent_autonomy.md.

**Carry-over to c97:** 1909c HOLD (reparse trigger 2026-05-16), 1910a (HIGH FEATURE ready for dev dispatch), 1907a (HIGH OPS escalated TNB-c49), 1907b (LOW OPS observational), JANITOR-{021,011,014,020}, 1897b-carry (F1 USER + architect), TASK-BCTC-3, 1900c, 1899a-bloomberg-test-split, 1862c-{E,F}.

**Status:** c96 CLOSED. WIP=0/2 CLEAN. Pipeline ready. 1910b config deployed (awaiting container rebuild). 1909c await-only gate blocking until 2026-05-16. 1910a now unblocked + ready for dev dispatch. No code-path blockers.

---

## Cycle 95 — 2026-05-14 c95 Close: 1909a + 1909b SHIPPED (WIP=0/2 CLEAN)

**Input:** Dev-team + QA c95 completion. 1909a-extractor + 1909b-tool APPROVED.

**Outcomes:**
1. **1909a-extractor-SHIPPED-c95 (CRITICAL, dev-pdf-extractor):** `cashFlowExtractor.ts` multi-layout support (7-block detection + sub-line balance logic) + implicit VAL-07 protection from 1908c-pattern drift. 22 new + 23 baseline fixtures (VNM/DIG/VCB Q4-2025). Domain zero-I/O. tsc 0. Minor console.warn format deviation (non-blocking). Commits: impl `148d1e99` + notebook `3b8d76f7`. QA APPROVED 7/7 AC.
2. **1909b-tool-SHIPPED-c95 (CRITICAL, dev-mcp-server):** New `get_bctc_ocf` MCP tool (#132). **Architect SD-2 honored**: `extraction_method` SELECT'd from DB enum (pdf-parse/ocr-200/ocr-300/news_inference), never hardcoded. Registered in registry + agentBootstrap + financial-analyst.md + SKILL_MANIFEST.md. 8 tests / 29 assertions PASS, 4 enum values covered. tsc 0. Cherry-pick union-merge applied for 1890a-B compatibility. Commits: impl `d285cc68` + notebook `a3381005`. QA APPROVED 11/11 AC.

**Actions:**
- Removed 1909a-extractor + 1909b-tool from In Progress → Done. WIP becomes 0/2 (CLEAN).
- Moved 1909c-reparse-validation from Backlog → Todo. Blocked by "Container deploy" (once mcp-server container rebuilt, ops can run reparse).
- Updated 1910b-effr-package-reg Blocked by from "1909b-tool deployed" → "Container deploy" (sequential after ops rebuild, shared agentBootstrap.ts).
- TASKS.md final: 77L (under 80L cap). Zero archive trigger.
- PM notebook updated: WIP=0/2, c95 CLOSED, container deploy context set for next cycle.

**Container deploy NOTE:** Router will trigger ops in post-cycle if appropriate. Do NOT spawn ops myself per feedback_agent_autonomy.md.

**Carry-over to c96:** 1909c (CRITICAL OPS, blocked container deploy), 1910b (HIGH CHORE, blocked container deploy), 1910a (HIGH FEATURE, blocked USER-ACTION FRED_API_KEY), 1907a (HIGH OPS escalated TNB-c49), 1907b (LOW OPS observational), JANITOR-{021,011,014,020}, 1897b-carry (F1 USER + architect), TASK-BCTC-3, 1900c, 1899a-bloomberg-test-split, 1862c-{E,F}.

**Status:** c95 CLOSED. Pipeline clean. BCTC OCF extraction layer 7 gate ready for ops reparse. No blockers on developer side — container deploy sequence required.

---

## Cycle 94 — 2026-05-14 c94 Decomposition: 1909+1910 sub-tasks entered, WIP-2 1909a+1909b In Progress

**Input:** BA decomp + architect rubber-stamp for 1909 (3 sub-tasks) + 1910 (2 sub-tasks). Dev-team flow Step 2 complete. PM entry required.

**Actions:**
1. **TASKS.md compacted:** Archived 18 pre-c80 tasks + 1903a stale bundled note into single line. From 82L → 73L (under 80L cap).
2. **Entered 1909a-extractor + 1909b-tool → In Progress (WIP=2/2 AT CAPACITY).** Parallel-eligible zones (domain/services/financial-reports vs interface/mcp/tools/financial-reports). Both CRITICAL for BCTC OCF gate.
3. **Entered 1909c-reparse-validation → Backlog (CRITICAL OPS, blocked on 1909a+1909b deploy).** Completion gate: Layer 7 G-step PASS in financial-analyst notebook.
4. **Entered 1910a-ism-tool → Backlog (HIGH FEATURE, USER-ACTION blocked: FRED_API_KEY env var).** Architect SD-1 resolved: PATH (a) FRED REST API + free key.
5. **Entered 1910b-effr-package-reg → Todo (HIGH CHORE, sequential after 1909b deployed).** Zero-build. Shares agentBootstrap.ts with 1909b → PM sequenced 1910b AFTER 1909b merge.
6. **Created 5 handoff files:** TASK_1909a-extractor.md, TASK_1909b-tool.md, TASK_1909c-reparse-validation.md, TASK_1910a-ism-tool.md, TASK_1910b-effr-package-reg.md. All include zone, dependencies, file lists, acceptance criteria.
7. **Updated PM notebook:** c94 state + WIP status + BCTC deadline coverage + user-action blockers flagged.

**WIP gate (≤2):**
- Dispatched 1909a + 1909b (CRITICAL: banking deadline 2026-05-15 covered by prior 1908c + 1890a, this extends Layer 7 gate).
- Justified by 1908c precedent (similar extractor refactor took ~1 cycle). Both tasks disjoint file paths.
- 1910a blocked on user-action (FRED API key registration). 1910b blocked on 1909b deploy (shared file conflict). 1909c blocked on both 1909a+1909b deploy.

**Carry-over to c95:** 1909a+1909b (In Progress), 1909c (Backlog, reparse validation), 1910a (Backlog, user-action), 1910b (Todo, sequential), 1907a (HIGH OPS escalated, TNB c49), 1907b (LOW OPS), JANITOR-{021,011,014,020}, 1897b-carry, TASK-BCTC-3, 1900c, 1899a-bloomberg-test-split, 1862c-{E,F}.

**TASKS.md:** 73L (under cap). WIP=2/2. Blockers: 1907a TNB escalation (observational), 1910a user-action (FRED API), 1862c-E user-action (Cloudflare), 1897b-carry F1 (Docker .git/ exclusion).

**Status:** c94 dispatch complete. Dev-team flow Step 3 execution ready.

---

## Cycle 92 — 2026-05-14 c92 Post-Cycle Housekeeping: 1908b Brief DONE + 1908c FIX Queued (banking deadline 2026-05-15)

**Input:** Architect brief 2026-05-14 landed. Recurring-bug escalation resolved. FIX task 1908c ready for dev-pdf-extractor.

**Outcome:**
1. **1908b-bctc-val07-extractor-rethink → Done.** Architect brief delivered 2026-05-14: `docs/architecture-briefs/2026-05-14-bctc-val07-extractor-rethink.md` (109L). Recommendation: **Option B (upstream plausibility override in extractor)** is primary fix. Reasoning: (a) keeps bad data out of DB, (b) mirrors `liabPlausible` pattern (lines 765-776), (c) prevents drift on other fields, (d) ships in time for banking deadline 2026-05-15.
2. **1908c-bctc-val07-totalassets-plausibility-override → Backlog HIGH.** New FIX task created. Implementation: 3-line guard after line 716 (`if (totalAssets > 0 && computedFromSubtotals > 0 && computedFromSubtotals / totalAssets > 5)` → override). Golden test fixtures: VNM Q4 2025 (55x ratio trigger) + DIG Q4 2025 (28,460x trigger) + VCB + FPT (regression). Baseline pass: 042-bctc-balance-sheet.test.ts + 1120-split-block + 287-balance-sheet-unit-header. New test: `1908c-totalassets-plausibility-override.test.ts`. Zone: `apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts` (primary) + `financialFiguresValidator.ts` (optional secondary). Effort: S.
3. **Parallel execution model:** PM commits TASKS.md on main; dev-pdf-extractor starts task/1908c branch in parallel. No file conflicts (separate branches, separate files).

**Actions:**
- Moved 1908b from Backlog → Done with architect brief ref + 2026-05-14 completion.
- Inserted 1908c in Backlog HIGH (FIX type, dev-pdf-extractor owner) with full implementation spec from architect brief.
- Updated TASKS.md header to reflect ready state: WIP=0/2, 1908c queued, banking urgency noted.
- Created TASK_1908c.md handoff file (from architect brief atomic change spec + test strategy).
- PM notebook updated (current state + cycle entry).

**TASKS.md:** 79L (under 80L cap).

**WIP Status:** 0/2 (CLEAN). 1908c in Backlog (not In Progress), ready for execute-tier dispatch to dev-pdf-extractor.

**Carry-over to c93:** 1908c (now executing), 1907b (LOW OPS observational), 1897b-carry (URGENT-F1), 1900c (LOW), 1899a-bloomberg-test-split, 1862c-{E,F}, JANITOR-{011,014,020}, TASK-BCTC-3.

**Status:** c92 CLOSED. Recurring-bug rethink shipped. FIX task ready. Banking deadline 2026-05-15 covered. No blockers.

---

## Cycle 91 — 2026-05-14 c91 Dispatch: 1908a-SPIKE DONE + 1908b Backlog Architect-Routed (recurring-bug rule)

**Input:** dev-pdf-extractor c91 spike completion. VNM Q4 2025 low-confidence triage report filed.

**Findings:**
- Root cause = (c) extractor schema drift in `balanceSheetExtractor.ts:extractSplitBlockAll`
- Code "270" (TONG TAI SAN) mapped to wrong sub-item value: 957M (Tài sản dài hạn khác) vs 53T grand total
- VAL-07 hard-fail triggered (liabilities 18.8T > assets 957B * 5)
- Systemic risk: DIG Q4 same pattern; banking cohort 2026-05-15 at risk
- Spike mode: triage doc only, no production code merged

**Recurring-bug escalation (per feedback_recurring_bug_escalation.md):**
- Prior fix 1815 (BCTC-VAL-01-POSITION guard) protects VAL-01; VAL-07 unprotected
- Root cause = positional extraction protocol drift (not threshold misfire)
- Architect must rethink before new fix attempt
- Recommended: Brief exploring Option B (plausibility override in extractBalanceSheet) vs Option A (VAL-07 downstream guard)

**Actions:**
- Moved 1908a from Todo → Done (SPIKE tag, c91 completion, report ref)
- Created 1908b-bctc-val07-extractor-fix in Backlog, HIGH OPS-FIX, architect owner
- TASKS.md finalized at 79L (under 80L cap)
- PM notebook updated (current state + cycle entry)

**Carry-over to c92:** 1908b (awaiting architect brief), 1907b (LOW OPS observational), 1897b-carry (URGENT-F1), 1900c (health-probe), 1899a-bloomberg-test-split, 1862c-{E,F}, JANITOR-{011,014,020}, TASK-BCTC-3.

**Status:** c91 dispatched. WIP=0/2. Architect brief expected 2026-05-14 or 2026-05-15.

---

## Cycle 90 — 2026-05-14 c90 Close: 1890a-A + 1890a-B SHIPPED + DEPLOYED (WIP=0/2 CLEAN)

**Input:** Dev-team + ops c90 completion. 1890a sprint SHIPPED and DEPLOYED.

**Outcomes:**
1. **1890a-A (CRITICAL, dev-mcp-server, BUILD-DONE):** `get_cash_flow` tool live. Commit `fd7cbe44` + QA approval `07a1af9a`. Full CF statement (operating_cf/investing_cf/financing_cf/capex/free_cash_flow) + OCF/NI ratio (null-safe). DDD pattern verified. 5/5 tests PASS (happy path + missing quarter + unknown ticker + zero NP + null NP). source_tier=1 invariant VERIFIED. Zone: apps/mcp-server/.
2. **1890a-B (HIGH, agent-md-editor, MANIFEST-DONE):** 3 manifest additions (get_macro_snapshot / get_bond_maturity_calendar / get_investment_clock_phase) + doc-verify get_insider_signals. Commit `915763a2`. agentBootstrap.ts + SKILL_MANIFEST.md + financial-analyst.md all synchronized. 26/26 spot-check tests PASS. Zone: apps/mcp-server/ + docs/.
3. **Ops deploy (2026-05-14T04:26:26Z):** Image SHA `9ecc5371...`. Container restart successful. toolCount 130→139 (get_cash_flow #131 + 8 waterfall tools). Post-rebuild health check: 9/9 services UP, mcp-server /health=200 OK. Deploy report: `reports/TASK_REPORT_1890a-deploy.md`. Deploy commit `4a786039`.
4. **BCTC Q1/2026 banking deadline (2026-05-15) COVERED** — get_cash_flow live in production for BCTC extraction pipeline.

**Actions:**
- Moved 1890a-A from In Progress → Done (SHIPPED tag + code `fd7cbe44` + QA `07a1af9a` + deploy `4a786039`).
- Moved 1890a-B from In Progress → Done (SHIPPED tag + code `915763a2` + deploy `4a786039`).
- TASKS.md: Removed In Progress section (WIP=0). Final line count 58L (under 80L cap).
- project-stats.json: Updated previousSprint from 1867 to 1889, toolCount confirmed 139.
- PM notebook: Updated header and current state (WIP=0, c90 CLOSED).
- Status: WIP=0/2 CLEAN. Ready for c91 dispatch.

**Carry-over to c91:** 1897b-carry (URGENT-F1, blocks architecture), 1907b (LOW observational), 1900c (health-probe, LOW), 1899a-bloomberg-test-split (LOW), 1862c-{E,F}, JANITOR-{011,014,020}, TASK-BCTC-3.

**Status:** c90 CLOSED + DEPLOYED. Pipeline clean. BCTC covered. Ready for PO/architect to prioritize c91.

---

## Cycle 90 — 2026-05-14 c90 Finalize: 1907a DIAG + 1890a SPEC DONE, Dispatch 1890a-A + 1890a-B (WIP=2/2 CRITICAL)

**Input:** QA verdicts: 1907a diagnostic complete (root cause = Claude Desktop external trigger, no code bug). 1890a spec + brief landed (5-tool audit: 1 new BUILD, 3 manifest additions, 1 doc-verify).

**Decisions:**
1. **1907a-digest-predict-silence → Done.** Diagnostic complete c90, root cause documented. Spawned follow-up 1907b-digest-predict-cowork-trigger-investigate (LOW OPS, observational).
2. **1890a-spec-expanded → Done.** Spec-only phase complete. Split into subtasks as architect + BA recommended.
3. **1890a-A + 1890a-B → In Progress (dispatch NOW).** CRITICAL: BCTC Q1/2026 banking deadline TODAY (2026-05-15). Both tasks execute in parallel **structurally** but MUST sequence **logically**: 1890a-A (BUILD get_cash_flow, CRITICAL) deploys first → 1890a-B (manifest edits, HIGH) follows after merge to avoid shared-file conflicts (agentBootstrap.ts, SKILL_MANIFEST.md, financial-analyst.md).

**Actions:**
- Moved 1907a to Done with c90 QA note + report ref.
- Moved 1890a-spec-expanded to Done with spec+brief commits.
- Moved 1890a-A + 1890a-B to In Progress. WIP becomes 2/2 (AT CAPACITY).
- Created follow-up 1907b in Backlog (LOW priority observational task).
- Created handoff files: TASK_1890a-A.md (BUILD get_cash_flow, blocks 1890a-B), TASK_1890a-B.md (manifest edits, depends_on 1890a-A), TASK_1907b-investigate.md (observational follow-up).
- TASKS.md finalized at 80L (at cap). Sequencing constraint documented in both handoffs.
- PM notebook updated (ULTRA format).

**WIP Status:** 2/2 FULL. Next tier (1890a-B) held until 1890a-A merges + deploys. No new dispatch until A ships.

**Dispatch Ready:** 1890a-A (dev-mcp-server) → execute immediately (CRITICAL deadline). 1890a-B queued (agent-md-editor) → start after 1890a-A merge.

---

## Cycle 89 — 2026-05-14 c89 Close: 1906a-headlock-cure-permanent DONE (recurring-bug escalation resolved)

**Input:** Preflight recurring-bug escalation (HEAD.lock 3rd cycle c87/c88/c89 — 14 total occurrences). Architect brief 2026-05-13 + PO triage already complete c88. PO chose Rec #2 (PREFLIGHT permanent policy).

**1906a outcome:** Developer edited `docs/protocols/head-lock-self-cure.md` (+13L): reclassified from "temporary workaround" → PERMANENT OPERATIONAL POLICY. Added § (f) Policy Classification: 3-cycle recurrence evidence, 100% cure rate (14/14), architect brief ref, structural cure tracked in 1897b-carry. Merge `3538ce5b`. QA APPROVED. No code touched.

**Actions:**
- Recurring-bug signal drained: `docs/signals/processed/2026-05-14T02-12-54Z-headlock-recurrence.json` → processed.
- 1906a moved In Progress → Done. Routed signal to PO (escalation resolved by doc-only chore).
- 1897b-carry note in TASKS.md refreshed: 3-cycle evidence + 1906a ref + permanent policy callout. F1 USER action remains only structural cure.
- PM notebook updated (ULTRA).

**TASKS.md:** 77L (under 80L cap). WIP=0/2 (clean).

**Carry-over to c90:** 1890a (HIGH), 1897b-carry (HIGH, F1+architect), 1900c (LOW), 1899a-bloomberg-test-split (LOW), 1862c-{E,F}, JANITOR-{011,014,020}, TASK-BCTC-3.

**Status:** c89 CLOSED. Recurring-bug policy locked. Ready for c90 cron.

---

## Cycle 88 — 2026-05-14 c88 Close: 1905a + 1904a SHIPPED (stealth-fix + deploy)

**Signal drain → task open → task close cycle:**
1. **Signal input:** `ops-1904a-deploy-gap-news-2026-05-14T02-20-00Z.json` routed to PO → opened 1905a-news-fetch-stealth-fix.
2. **Developer action:** Removed broken playwright-stealth v0.0.1 (CJS placeholder, never-functional). Replaced with inline stealth pattern: `context.addInitScript()` patches `navigator.webdriver = undefined` in PlaywrightBrowserFactory. 172 tests pass (6 new TDD ACs RED→GREEN). Code merge `580771ae`.
3. **QA approval:** 1905a APPROVED. Squash merged as `580771ae`. Branch deleted.
4. **Ops deploy:** Rebuilt news-fetch container, bumped playwright base image v1.44.0→v1.60.0 to match npm-resolved runtime. Fixed stale Dockerfile (missing unzip + curl re-added post-c87). Deploy commit `166dd89f`. newsHeadlinesRefreshJob verified HTTP 200.
5. **1904a unblocked:** AC4 now PASS. All ACs verified. Moved to Done with both code+deploy SHAs.

**Outcome:** c88 SHIPPED, WIP=0, ready for c89 dispatch.

---

## Cycle 87 — 2026-05-14 c87 Post-Cycle Closure: 1903-doc-pair DONE + 1904a PARTIAL (playwright-stealth blocker → c88)

**Input:** QA + ops c87 completion. Two outcomes:
1. **1903-doc-pair (MEDIUM, CHORE, DONE):** Alert-commander [UNVERIFIED] label removed + macro-snapshot regime-fallback note added. Merge `54e255e4`. QA APPROVED.
2. **1904a-deploy-gap-news (HIGH, OPS, PARTIAL):** MCP rebuild + scheduler verified (AC1-3 PASS). newsHeadlinesRefreshJob registered. **AC4 blocked:** news-fetch code bug (playwright-stealth ESM default import). Root: v0.0.1 CJS, Bun incompatible. Signal queued: `docs/signals/ops-1904a-deploy-gap-news-2026-05-14T02-20-00Z.json`. Job fires q30m, fails gracefully until dev fixes import. Escalation: developer responsibility (code bug).

**Actions:**
- Moved 1904a from In Progress → Done (PARTIAL) with blocker note + signal ref.
- Moved 1903-doc-pair from In Progress → Done.
- TASKS.md final: 68L (under 80L cap).
- WIP: 0/2 (clean).

**Carry-over to c88:** 1900c (health-probe), 1899a-bloomberg-test-split, 1862c-{E,F}, JANITOR-{011,014,020}, TASK-BCTC-3, 1890a, 1897b-carry.

**Status:** c87 CLOSED. Pipeline clean. WIP=0. Ready for c88 cron dispatch at :07.

---

## Cycle 86 — 2026-05-14 c86 Post-Cycle Closure: AUTOCURE-C86-MW-DEDUP + SPIKE_C86_MCP_REG SHIPPED

**Input:** Developer + ops c86 completion. Two outcomes:
1. **AUTOCURE-C86-MW-DEDUP (HIGH, CHORE):** `.claude/flows/market-watcher/cycle.md` Step 4 off-hours duplicate-signal guard (suppress same stock_code + same move_pct within ±5min during market CLOSED). Merge commit `b5151e1d`. Report: `reports/TASK_REPORT_AUTOCURE-C86-MW-DEDUP.md`. QA APPROVED.
2. **SPIKE_C86_MCP_REG (HIGH, SPIKE):** Investigation findings: cowork agent .md `MCP:` header is documentation-only label, not platform registration. Real config in Cowork Desktop. Recommendations: (a) low-cost doc-drift fix for 9 stale headers, (b) inspect Cowork Desktop config, (c) Cloudflare tunnel 404 as separate ticket. Output: `docs/spikes/SPIKE_C86_MCP_REG.md` (116L). Merge commit `346bf916`.

**Actions:**
- Moved both AUTOCURE-C86-MW-DEDUP and SPIKE_C86_MCP_REG from In Progress → Done with c86 SHIPPED tags + commit SHAs.
- TASKS.md final: 67L (under 80L cap). No archive trigger.
- WIP: 0/2 (clean), Blockers: visible but not blocking (user-action 1862c-E, container-rebuild 1862c-F, escalation 1897b-carry).
- Carry-over untouched: 1903a-labels, 1903b-doc-self-heal, 1890a (bumped to HIGH + get_cash_flow), 1862c-{E,F}, 1897b-carry (HIGH), JANITOR-{011,014,020}, TASK-BCTC-3.

**Status:** c86 CLOSED. Pipeline clean. Zero blockers. Ready for c87 dispatch.

---

## Cycle 85 — 2026-05-14 c85 Post-Cycle Housekeeping: 1881a-impl-{mcp,ssot} SHIPPED

**Input:** Dev-team + QA c85 completion. Two QA-APPROVED + SHIPPED outcomes:
1. **1881a-impl-mcp (M, HIGH, feature):** 16 MCP tool handlers + contract test file. JSON envelope pattern (source_tier: 1|2|3 as const, first field). 20/20 contract tests pass, 9234/9268 full suite, tsc 0 errors. Merge commit `c2e2fb08`. Report: `reports/TASK_REPORT_1881a-impl-mcp.md`.
2. **1881a-impl-ssot (S, MEDIUM, chore):** Layer 9 doc update `docs/standards/tnb-methodology-layers.md` source_tier hierarchy explained, enum documented, backwards-compat note (additive field only). Merge commit `6a700f15`. Report: `reports/TASK_REPORT_1881a-impl-ssot.md`.

**Actions:**
- Removed 1881a-impl-ssot from Todo (was stale after merge).
- Moved both 1881a-impl-{mcp,ssot} from Review → Done with c85 SHIPPED tags + commit SHAs.
- TASKS.md final: 67L (under 80L cap). Archive threshold not reached.
- WIP: 0/2 (clean), Blockers: none (both user-action and container-rebuild remain deferred).

**Carry-over to c86:** 1900c (health-probe, LOW), 1899a-bloomberg-test-split (LOW), 1862c-{E,F} (OPS, blocked), JANITOR-{011,014,020,} (DRY), TASK-BCTC-3 (feature), 1890a (toolpkg, MEDIUM), 1897b-carry (blocked: user-action).

**Status:** c85 CLOSED. Pipeline clean. No zombie tasks. Headroom verified for c86.

---

## Cycle 84 — 2026-05-13 c84 Post-Cycle Housekeeping: 1888l SHIPPED + 1881a-impl SPLIT

(See full notes in prior commit.)

---

## Cycle 93 — 2026-05-14 c93 Post-Cycle Close: 1907a ESCALATED + JANITOR-021 OPENED (WIP=0/2 CLEAN)

**Input:** TNB c49 user-facing outage escalation + c92 tree-verify procedural failure follow-up.

**Outcomes:**
1. **1907a-digest-predict-silence → ESCALATED LOW→HIGH.** TNB c49 finding #3: 4-day user-facing outage (digest-predict silent 2026-05-11 21:38 UTC → 2026-05-14 17:30 UTC). Root cause confirmed: cron unwired by design, Claude Desktop external trigger. Recommendation: (1) immediate verification ITerm2/launchctl trigger active next 3 cycles, (2) if recurs → architect rethink on Claude Desktop reliability (cowork heartbeat, session capture, firewall). Task note: `TNB-c49 escalation: 4d user-facing outage`. Follow-up: 1907b (LOW OPS observational).
2. **JANITOR-021 → OPENED (NEW, LOW REFACTOR).** c92 tree-verify exit=1 failure was procedural, not code bug: audit checks HEAD diff payload vs cherry-pick payload; fails when PM close commit lands on top of merge commit. Audit tool needs window adjustment for `merge-commit + PM-close` shape. Non-blocking — fix on idle cycle. Files: `scripts/audits/tree-verify.sh`. Owner: code-janitor.

**Actions:**
- Edited 1907a entry in Backlog: priority LOW→HIGH, added TNB-c49 escalation note, added root-cause context.
- Created JANITOR-021 entry in Backlog: LOW REFACTOR, code-janitor owner, c92 procedural root-cause explanation.
- TASKS.md final: 82L (slight over 80L cap due to escalation + new janitor; acceptable for critical escalation. Will compact Done entries next cycle if >85L).
- PM notebook updated (current state + cycle entry).
- WIP: 0/2 (clean). No new dispatch until 1908c completes.

**Banking deadline 2026-05-15 status:** Covered. 1908c FIX active (dev-pdf-extractor). 1890a deployed (live + reparse triggered c92). BCTC Q1 banking window prepared.

**Carry-over to c94:** 1908c (HIGH FIX, dev-pdf-extractor), 1907a (HIGH OPS escalated), 1907b (LOW OPS observational), JANITOR-021 (LOW), JANITOR-{011,014,020}, 1897b-carry (F1 USER), TASK-BCTC-3, 1900c (health-probe), 1899a-bloomberg-test-split, 1862c-{E,F} (user-blocked).

**Status:** c93 CLOSED. No blockers. Banking window prepared. Escalation noted for user attention (1907a digest-predict silence critical for market timing alerts).

---

## Known patterns / preferences

- TE Chromium scraper has had repeated issues (1815c, 1823d, 1829b, 1833g, 1833k, 1834b). If any further TE failures appear, flag for architect root-cause review per recurring-bug escalation policy.
- Backtesting module is active development (1842b/c/d/e + 1843a/b/c + 1844a + 1845x all done, 1846b next). Domain layer golden rule (zero infra imports) must be enforced strictly.
- export_backtest_run_csv is the only MCP tool in the codebase that returns raw CSV (not JSON). This is intentional per ARCH_1846.md §4 — must not be "fixed" to JSON in review.
- toolCount watermark in registry.ts comment previously diverged from actual toolCount. 1846b will bring actual count to 125 (slots #123-#125 filled). Developer should update the comment watermark to 125 in the registry entry.
- Option C equity curve recomputation is a direct copy of lines 302-307 in backtestEngine.ts. If tests show floating-point divergence, check sort order (localeCompare on exitDate ISO strings).
