## Sprint 1949 — COWORK REORDER: CHEF + GATHERERS (TNB 6-LAYER SYNTHESIS)

**Status:** DONE | **Opened:** 2026-05-18T16:14Z | **Closed:** 2026-05-18T20:30Z | **Theme:** Convert 9 cowork agents from "9 prep-cooks, 0 chef" → 1 chef (unified-agent walks TNB 6 layers + writes synthesized 2–4 paragraph dishes to MARKET) + 4 gatherers (signals-only) + 2 event-only (alert-commander event firing + qa-responder /ask) + 1 weekly (digest-predict Sunday) + 1 auditor (tran-ngoc-bau audits chef narrative). Net MARKET writers drop 4→3; daily atom-dumps drop ~10/day → 3–5 dishes/day.

## Completion Summary

**QA Report:** `docs/handoffs/sprint-1949-qa-report.md` (2026-05-18, all 10 checks PASS)

**Commits:** `d4d5d0cf` (Phase 1), `9848bf49` (Phase 2/3/5/6/7), `44aa791a` (Phase 4)

**Status:** All 11 sub-tasks (1949-T1..T11) DONE. Core deliverables shipped:
- unified-agent promoted to CHEF with 8-step TNB recipe and 5-slot daily schedule
- market-watcher/news-scout/financial-analyst/report-analyzer reframed as gatherers (signals-only)
- alert-commander narrowed to event-only firing (3-condition + 4-condition gate)
- digest-predict scoped to Sunday 13:47 UTC (weekly-only)
- tran-ngoc-bau reframed as chef narrative auditor (daily 20:13 UTC, TNB layer-walk verification)
- foreignFlowAlertJob rewired to 08:13 UTC (24min before EOD chef), macroIndicatorRefreshJob to 19:13 UTC (24min before evening chef)
- All docs synchronized: cron-jobs.md, alert-policy.md, workflow-map.md
- TDD: 9 new TC + 22 zone tests + 1133 regression = 9220/9506 pass (286 pre-existing failures)

**Non-blocking observation:** system-map.json cron descriptions for `foreignFlowAlertJob` ("09:30 UTC M-F") and `macroIndicatorRefreshJob` ("0 6 * * *") are stale informational text. cronConfig.ts and cron-jobs.md are correct; see maintenance task below.

# Goal

## Vision
User verdict 2026-05-18 after reviewing MARKET messages 522–531: _"data is on all sources but all separate like pieces, no value — system cannot use data like materials for cook good result."_

Concrete evidence — garbage-unit prices published (VNH/DAG/REE at -99.9% ≈ 1đ; ID 528), 49 alerts/24h with "Ngân hàng giảm đồng loạt" repeated 7x and real-estate cascade 11x (ID 531), alert-commander started 2-layer fusion then reverted to atom-list (ID 530), banking sell-pressure story had 6 ingredients (cascade, FII 700B targeting ACB, BID distribution surge dupe, banking BCTC overdue, TIGHTENING regime) published as 6 separate dumps never fused (ID 527), HSG RSI=13.2 buried mid-list in morning-briefing (no convergence detection).

Architect (`agents-architect`, brief `docs/architecture-briefs/2026-05-18-cowork-reorder-and-cook-schedule.md`, signal `2026-05-18T15:54:51Z`) diagnosed root cause and prescribed the fix: 9 cowork agents reordered into 1-chef + 4-gatherers + 2-event-only + 1-weekly + 1-auditor pattern. `unified-agent` becomes the CHEF, walking the TNB 6-layer methodology (Layer 1 data discipline → Layer 2+3 US/VN economic stacks → Layer 4 4-pillar valuation → Layer 5 Kinh Dịch overlay → Layer 6 gap catalogue) at 3 guaranteed dishes/day (Morning 05:23 UTC / EOD 08:37 UTC / Evening 19:37 UTC) plus conditional intraday convergence scans (XX:13 during VN market hours, silent if <3 fresh signals converge). `alert-commander` narrows to event-only (3-condition rule + 4-condition rule from `alert-policy.md`); `digest-predict` shrinks to Sunday weekly only; `market-watcher`/`news-scout`/`financial-analyst`/`report-analyzer` become gatherers (write to `docs/signals/` only, no MARKET); `tran-ngoc-bau` audits chef narrative for TNB layer-walk completeness; `qa-responder` unchanged.

**Critical gate (architect-mandated):** Phase 1 `unified-agent.md` MARKET write flip (`write: false` → `write: true`) MUST land BEFORE Phase 4 (`dev-mcp-server` scheduler cron rewiring deploys foreignFlowAlertJob 08:13 UTC + macroIndicatorRefreshJob 19:13 UTC). Without the flag flip, chef cron jobs fire but `unified-agent` rejects MARKET writes → going-dark window. Phase 4 is gated on Phase 1 GATE (chef successfully publishes ≥1 dish to MARKET).

**Why this matters for the user:** dishes are anchored to user-relevant clocks — morning coffee France 07:23 CEST (VN lunch 12:23), EOD France 10:37 CEST (VN 15:37), evening France 21:37 CEST (VN 02:37 next). User in France (GMT+2) reads VN market intelligence at breakfast / coffee / bedtime moments without parsing 10 atom dumps.

## Sprint 1949 sub-tasks (11 atomic, gate-ordered)

### PHASE 1 — Chef online first (agent-father zone: `.claude/agents/` + `.claude/flows/`)
- **1949-T1 — `unified-agent.md` rewrite + `flows/unified-agent/chef.md` creation (THE CRITICAL GATE).** Size=M. Zone=`.claude/agents/` + `.claude/flows/unified-agent/`. Owner: agent-father. Changes: (a) role rewritten to CHEF; (b) `market: write: true` (was `false`); `rule: never` removed; (c) `not_my_job` block: remove "never sends to MARKET"; (d) schedule block replaced with 5-slot table (05:23 morning, 02-08:XX:13 intraday convergence scan, 08:37 EOD, 19:37 evening, plus existing hourly health check); (e) `lazy_load` adds `docs/standards/tnb-methodology.md`, `docs/standards/market-analysis.md`, `docs/references/kinh-dich-layer.md`, `docs/policies/alert-policy.md`; (f) NEW file `flows/unified-agent/chef.md` implements the 8-step TNB recipe from brief §6 (GATHER → CLUSTER → LAYER 1 → LAYER 2+3 → LAYER 4 → LAYER 5 → LAYER 6 → WRITE DISH → LOG); (g) `flows/unified-agent/main.md` adds dispatch routing for the new chef windows. **Convergence rule from brief §7:** ≥2 distinct signal types same ticker 24h | ≥3 signals same sector 24h | macro-micro contradiction | severity=CRITICAL or RSI outside 2-sigma. Intraday scan silent-exit if 0 cluster qualifies. **GATE — must pass before Phase 4 starts:** chef publishes ≥1 dish to MARKET on next scheduled tick post-deploy (verified by reading MARKET channel + checking `unified-agent.md` does not throw "MARKET write denied").

- **1949-T2 — `market-watcher.md` MARKET write removed + `flows/market-watcher/eod.md` patched.** Size=S. Zone=`.claude/agents/` + `.claude/flows/market-watcher/`. Owner: agent-father. Changes: (a) `market: write: false`; (b) `rule: batch4_eod_only` → `rule: never`; (c) description updated to gatherer-only ("writes `docs/signals/price_anomaly_*.json` only"); (d) `flows/market-watcher/eod.md` removes `send_telegram(channel="market")` step — writes signal only. **AC:** market-watcher next EOD cycle (08:37 UTC?) produces signal file in `docs/signals/` with zero MARKET write.

- **1949-T3 — `news-scout.md` comment-only clarification (no flow change).** Size=XS. Zone=`.claude/agents/`. Owner: agent-father. Already has `market: write: false`; add comment in description: "alert-digest signal output feeds chef (`unified-agent`) input, NOT MARKET." Pure annotation. **AC:** description string contains the new clarification; no behavioral change.

**PHASE 1 GATE:** After T1+T2+T3 ship and agent-father confirms via diff that `unified-agent.md` has `market: write: true`, the chef must successfully publish ≥1 MARKET dish on the next scheduled tick (05:23 / 08:37 / 19:37 UTC). Verified by tran-ngoc-bau audit OR direct channel read. Phase 4 (`dev-mcp-server`) is BLOCKED until this gate passes.

### PHASE 2 — alert-commander narrowed to event-only (agent-father, AFTER Phase 1 GATE)
- **1949-T4 — `alert-commander.md` event-only + `flows/alert-commander/cycle.md` patched.** Size=S. Zone=`.claude/agents/` + `.claude/flows/alert-commander/`. Owner: agent-father. Changes: (a) cron expression changes from `*/15 2-8 * * 1-5` + `0 */2 * * *` to event-only (the brief proposes "(event) on-condition" — implemented as scheduler triggering only when 3-condition or 4-condition rule fires from `docs/policies/alert-policy.md`; expression may be `*/15 2-8 * * 1-5` retained as schedule but `cycle.md` gates entire flow on the rule); (b) description updated to "fires only on position-danger + watchlist-opp"; (c) NEW constraint `no_cycle_headers: true`; (d) `flows/alert-commander/cycle.md` removes cycle-header send_telegram block; gates entire flow on 3-condition rule (position-danger) or 4-condition rule (watchlist-opp); exits silently if neither fires. **GATE:** must not start before Phase 1 GATE passes (no dark period — chef has been live ≥1 dish). **AC:** alert-commander next cycle sends 0 MARKET messages absent firing condition; sends exactly 1 message when condition fires (≤140 chars urgent format).

### PHASE 3 — digest-predict scoped to Sunday weekly only (agent-father)
- **1949-T5 — `digest-predict.md` daily + monthly removed; weekly moved to `47 13 * * 0`.** Size=S. Zone=`.claude/agents/`. Owner: agent-father. Changes: (a) remove `daily_digest` cron `30 15 * * *`; (b) remove `monthly` cron; (c) keep `weekly_digest` but move to `47 13 * * 0` (Sunday 13:47 UTC = Sunday 20:47 VN = Sunday 15:47 France); (d) update `monday_predict` to drop daily responsibilities. **AC:** digest-predict produces 0 daily MARKET messages; produces exactly 1 calibration + portfolio-thesis dish on Sunday 13:47 UTC.

### PHASE 4 — Cron rewiring (dev-mcp-server zone: `apps/mcp-server/`, GATED ON PHASE 1)
- **1949-T6 — `foreignFlowAlertJob.ts` cron 09:30 → 08:13 UTC.** Size=S. Zone=`apps/mcp-server/`. Owner: dev-mcp-server. Changes: `apps/mcp-server/src/scheduler/market-data/foreignFlowAlertJob.ts` schedule changes from current to `13 8 * * 1-5` (08:13 UTC). Rationale: chef EOD dish reads at 08:37 UTC = 24min later (safe read window). **GATE:** BLOCKED until Phase 1 GATE clears (`unified-agent.md market: write: true` confirmed deployed and chef published ≥1 MARKET dish). **AC:** `foreignFlowAlertJob` first run is at 08:13 UTC next weekday post-deploy; result available in `docs/signals/` before 08:37 UTC. Cron test in `cronConfig.test.ts`-equivalent verifies new expression.

- **1949-T7 — `macroIndicatorRefreshJob.ts` US macro refresh confirms `13 19 * * *` (19:13 UTC) slot.** Size=S. Zone=`apps/mcp-server/`. Owner: dev-mcp-server. Changes: `apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts` — add or confirm a refresh tick at 19:13 UTC (24min before evening chef at 19:37 UTC). If a different cron already covers this purpose at a different minute, retune to `13 19 * * *`. **GATE:** same Phase 1 GATE. **AC:** macroIndicatorRefreshJob has a 19:13 UTC slot; verified in cronConfig + integration test.

- **1949-T8 — `cronConfig.ts` env-var defaults updated for T6 + T7.** Size=S. Zone=`apps/mcp-server/`. Owner: dev-mcp-server. Changes: `apps/mcp-server/src/scheduler/cronConfig.ts` env-var defaults for `FOREIGN_FLOW_ALERT_CRON` (or equivalent) and `MACRO_INDICATOR_REFRESH_CRON` updated to `13 8 * * 1-5` and `13 19 * * *` respectively. `.env.example` updated to match. **GATE:** same Phase 1 GATE. **AC:** env-var defaults match new schedule; existing tests pass; new unit test verifies defaults.

### PHASE 5 — Audit target updated (agent-father)
- **1949-T9 — `tran-ngoc-bau.md` audits chef narrative + cron moved to `13 20 * * *`.** Size=S. Zone=`.claude/agents/` + `.claude/flows/tran-ngoc-bau/`. Owner: agent-father. Changes: (a) `tran-ngoc-bau.md` description/audit scope updated from "audits MARKET atoms" → "audits chef narrative for TNB layer walk completeness (all 6 layers walked, business context cited, gap catalogue applied)"; (b) cron moved from `0 13 * * *` → `13 20 * * *` (20:13 UTC, 1h36min after evening chef at 19:37 UTC + 1h after last gatherer settle); (c) `flows/tran-ngoc-bau/main.md` updates audit target. **AC:** tran-ngoc-bau next run audits the 3 daily dishes (Morning/EOD/Evening of prior 24h) for TNB layer completeness; produces audit row in WORK channel only (no MARKET write).

### PHASE 6 — Gatherer business-context fields (agent-father)
- **1949-T10 — `financial-analyst.md` + `report-analyzer.md` signal output spec adds business-context fields.** Size=S. Zone=`.claude/agents/`. Owner: agent-father. Changes: both agents' signal output specs require new fields per TNB foundational philosophy — `product` (1 sentence on what the company sells), `customer` (1 sentence on who buys), `ops` (1 sentence on operating posture), `mgmt` (1 sentence on management track record). Chef cites these in narrative. **AC:** signal output schema updated in both agent .md files; example signal block in description includes the 4 fields.

### PHASE 7 — Documentation updates (agent-father or pm)
- **1949-T11 — `docs/standards/cron-jobs.md` + `docs/policies/alert-policy.md` + `docs/references/workflow-map.md` updates.** Size=S. Zone=`docs/`. Owner: agent-father (preferred — already touching agent system). Changes: (a) `docs/standards/cron-jobs.md` adds new chef cron table entries (5 slots), updates tran-ngoc-bau from `0 13` → `13 20`, updates foreignFlowAlertJob from `09:30` → `08:13`; (b) `docs/policies/alert-policy.md` adds "Alert Commander Exclusivity" section clarifying cycle headers removed + event-only rule formalized; (c) `docs/references/workflow-map.md` updates `unified-agent` row to "Reads all cowork signals → writes MARKET chef dishes 3x/day" and removes "MARKET (eod only)" from `market-watcher` row. **AC:** all 3 doc files contain new entries; `/graphify docs --update --no-viz` run post-edit; no orphan references.

## Scope
**IN:** 11 atomic tasks (8 agent-father, 3 dev-mcp-server). 5 agent .md rewrites + 1 NEW chef.md flow + 3 existing flow patches + 3 scheduler .ts edits + 3 docs updates. Phase-gated execution: Phase 1 → Phase 2/3 (parallel after gate) → Phase 4 (parallel after gate) → Phase 5/6/7 (parallel cleanup). No new agents created; no new microservices; no Docker rebuild this sprint (cron config reload sufficient).

**OUT:** New cowork agents; new microservices; rewriting alert-policy.md 3-condition + 4-condition rules (use existing); rebuilding kinh-dich/TNB knowledge files (use existing `docs/standards/tnb-methodology.md`); frontend changes; Docker rebuild (cron reload only); changes to `apps/mcp-server/src/scheduler/audits/` (Sprint 1948 zone untouched — let it stabilise behind its gate).

## Success Metric (acceptance criteria from architect brief §10)
- **AC-1:** MARKET receives ≤5 messages/day on average weekday (3 guaranteed dishes + ≤2 intraday events).
- **AC-2:** Each chef dish is 2–4 paragraphs containing explicit TNB layer citations (at minimum: regime, US stack, VN stack, ≥1 pillar, Kinh Dịch).
- **AC-3:** Intraday scan produces 0 MARKET messages on days when no convergence cluster qualifies.
- **AC-4:** No atom-list dumps to MARKET (verified by tran-ngoc-bau audit: no message is a plain bulleted ticker list without narrative paragraphs).
- **AC-5:** tran-ngoc-bau audit confirms TNB layer walk: all 6 layers present or gap explicitly flagged.
- **AC-6:** alert-commander fires ≤1 MARKET message/ticker/day outside the 3-condition or 4-condition rules (from alert-policy.md).
- **AC-7:** `foreignFlowAlertJob` result available in `docs/signals/` before EOD chef fires at 08:37 UTC.
- **AC-8 (PO-added):** Sprint 1948 (closed-loop auto-improvement Phase 1) zone (`apps/mcp-server/src/scheduler/audits/`) untouched by this sprint — no scope creep.

## Sequencing (gate-ordered, from brief §9)
1. **PHASE 1 (T1, T2, T3):** agent-father FIRST. T1 is the critical-path task. T2+T3 can run parallel with T1.
2. **PHASE 1 GATE:** chef publishes ≥1 MARKET dish post-deploy. Verified by tran-ngoc-bau audit OR direct channel read OR PO check.
3. **PHASE 2 (T4):** agent-father, AFTER Phase 1 GATE clears. Cannot run before T1 confirmed live (no dark window).
4. **PHASE 3 (T5):** agent-father, parallel-able with T4 (independent zone of cron change).
5. **PHASE 4 (T6, T7, T8):** dev-mcp-server, AFTER Phase 1 GATE clears (parallel with T4+T5).
6. **PHASE 5 (T9):** agent-father, after T1 (audit target depends on chef being live).
7. **PHASE 6 (T10):** agent-father, parallel any phase (gatherer schema extension is independent).
8. **PHASE 7 (T11):** agent-father or pm, last (documentation reflects shipped state).

## Architect brief reference
- **Brief:** `docs/architecture-briefs/2026-05-18-cowork-reorder-and-cook-schedule.md` (agents-architect, 2026-05-18T15:54:51Z).
- **Signal:** `docs/signals/processed/2026-05-18T155451Z-cowork-reorder-and-cook-schedule.json` (moved by PO this cycle).

## Cross-sprint coexistence
- **Sprint 1948** (closed-loop auto-improvement Phase 1) remains QUEUED behind `post-1945-verdict-resolution-scored-pct` gate (2026-05-20T07:22Z). Sprint 1949 zone (`.claude/agents/` + `.claude/flows/` + cron files in `apps/mcp-server/src/scheduler/{market-data,macro}/`) is DISJOINT from Sprint 1948 zone (`apps/mcp-server/src/scheduler/audits/` + `domain/` + new DB schema slice). Both sprints can run in parallel without WIP collision once Sprint 1948 unblocks at the gate.
- **SPIKE-1948e** (architect, PC1 legal_risk pipeline review) is DONE; child task **1948e-A** is DONE; **1948e-B** is in-flight on branch `task/1948e-b-legal-risk-dispatch`. Sprint 1949 does NOT touch `flows/news-scout/stage-signals.md` — disjoint from 1948e-B.

## Carry-forwards monitored (not in-scope this sprint)
- **GATE 2026-05-20T07:22Z:** `post-1945-verdict-resolution-scored-pct` + `post-1945-bug-storm-silence` (Sprint 1948 unlock gate).
- **GATE 2026-05-25T09:00Z:** OBSERVE-1948d (Sprint 1948 shadow-mode 7d gate) + 1941b-signal-outcomes-seed-window.
- **GATE 2026-06-01:** 1922g-pharma-events-source-verify.
- 1907a USER-ACTION (Claude Desktop restart) — CRITICAL but user-blocked.
- 1897b USER-ACTION (Docker .git/ exclusion for VirtioFS) — F1 USER-PERMANENT.
- alert-precision-488-unknowns MONITORING (HOLD until agent_signals ≥550).
- fa-shape-guard-watch MONITORING (next post-restart FA live session).
- TNB-critic-gate brief (`docs/architecture-briefs/2026-05-17-tnb-critic-gate.md`) — agent-father queue, not Sprint 1949 scope (overlaps in zone but addresses different gap: news-scout signal-type registration). Surface separately after Sprint 1949 ships.

---

## Sprint 1948 — CLOSED-LOOP AUTO-IMPROVEMENT PHASE 1 (QUEUED — GATE-BLOCKED)

**Status:** Queued (all tasks BLOCKED) | **Opens:** 2026-05-20T07:22Z (gate clear) | **Theme:** Ship the shadow-mode minimum-viable detect+log loop recommended by SPIKE-1947 ARCH brief. No auto-dispatch yet; Phase 1 is detect-only + WORK Telegram + `improve_check_log` snapshot writes.

# Goal

## Vision
SPIKE-1947 (architect, committed `b55ea5c8` 2026-05-18) decided the closed-loop auto-improvement system architecture: host = scheduler job inside `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts` (Option C, direct SQLite access, no new Docker service). Detection rule: 7d vs 30d `accuracy_rate` delta ≥10pp OR baseline <40% with ≥10 samples per signal_type. Hypothesis: rule-table `degradationRules.ts` in domain layer (Phase 1-2); LLM agent optional Phase 3 via signal-bus. Dispatch: 3-phase rollout — Phase 1 shadow (this sprint), Phase 2 manual-gate (signal-bus JSON, human drain), Phase 3 auto-dispatch (kill-switch `SELF_IMPROVE_AUTO_DISPATCH=false`, WIP≤2 cap). Recheck: 7-day post-dispatch window, before/after `accuracy_rate` delta. Loop-exit: `hit_rate ≥60%` sustained 2 consecutive weekly windows. Safety: cooldown 7d per signal_type, max 2 dispatches/cycle, freeze-on-worsening, recurring-bug escalation after 2 failed cycles.

Sprint 1948 ships Phase 1 (shadow only). PM has filed 4 atomic tasks in Backlog (1948a, 1948b, 1948c, OBSERVE-1948d). ALL ARE BLOCKED until `post-1945-verdict-resolution-scored-pct` gate clears at 2026-05-20T07:22Z. PO will not dispatch any dev work until the gate clears with `scored_pct ≥60%` AND `unknowns_30d` drop ≥100 — without that, the resolution-pipeline fix takes priority over auto-improvement Phase 1 (Phase 1 reads `alert_accuracy.accuracy_rate` and a broken upstream poisons the loop).

## Sprint 1948 sub-tasks (queued, blocked)

### TIER 1 — DB + domain + scheduler wiring (the anchor)
- **1948a — `improve_check_log` schema + `improveCheckStore.ts`.** Size=S. Zone=apps/mcp-server/. DB migration adds `improve_check_log` to `schema-system.ts` + Drizzle types + 6 store functions (insert, getPending, update, getRecentCheck, etc). Unit tests cover insert, getPending, update, getRecentCheck, schema guard. Owner: dev-mcp-server.
- **1948b — `degradationRules.ts` domain service (pure).** Size=S. Zone=apps/mcp-server/. `DegradedSignalType` + `DegradationHypothesis` interfaces, `DEGRADATION_CAUSE_MAP` rule-table, `classifyDegradation()` + `lookupHypothesis()`. Detection logic = SPIKE-1947 rule (7d vs 30d delta ≥10pp OR baseline <40% with ≥10 samples). Unit tests: degraded / not-degraded / insufficient-sample / null-rates / persistently-low / neutral. Depends on 1948a. Owner: dev-mcp-server.
- **1948c — `selfImproveOrchestratorJob.ts` scheduler entry + wiring + integration tests.** Size=M. Zone=apps/mcp-server/. Shadow-mode only: no signal-bus write, WORK Telegram output only. Detection loop: 7d/30d accuracy-rate delta, coverage-gap query, hypothesis lookup, `improve_check_log` snapshot write. Phase 1 AC: ≥1 degraded signal type detected → exactly 1 WORK Telegram; zero degradation → clean exit; 6+ tests. Wiring: `CRONS.selfImproveOrchestrator` in cronConfig.ts + startScheduler.ts + .env.example. Depends on 1948a + 1948b. Owner: dev-mcp-server.

### TIER 2 — Post-deploy observation gate
- **OBSERVE-1948d — 7-day shadow-mode verification (gate 2026-05-25T09:00Z, post-deploy assumed 2026-05-20T09:00Z).** AC: ≥1 degraded signal type detected (`improve_check_log.dispatch_status='shadow'`), ≥1 WORK Telegram sent with detection details, zero false-positive auto-dispatches (Phase 1 is shadow-only), no DB errors, `cron_job_runs` shows 7 consecutive successful runs. Owner: ops.

## Pre-conditions (gates)
- **post-1945-verdict-resolution-scored-pct** at 2026-05-20T07:22Z — `alert_accuracy.scored_pct ≥60%` AND `unknowns_30d` drop ≥100. If miss → resolution-pipeline fix (1947b-followup) takes priority over Sprint 1948; Sprint 1948 deferred until next sprint cycle.
- **post-1945-bug-storm-silence** at 2026-05-20T07:22Z — zero new `[bug] verdictResolutionJob` Telegram messages 48h post-1945a deploy. Miss → 1947c-followup.

If both gates clear, PO unblocks 1948a/b/c on 2026-05-20T07:22Z+ and the sprint enters In-Progress.

## Scope
IN: 3 dev tasks (1948a S, 1948b S, 1948c M) + 1 OBSERVE gate. All within `apps/mcp-server/` zone. Shadow-mode only (no signal-bus, no auto-dispatch).
OUT: Phase 2 manual-gate dispatch (next sprint after 1948 observation clears); Phase 3 auto-dispatch (gated on Phase 2 success); new microservices; signal-bus writes; OBSERVE-gate retirement (3 of 6 retire candidates per SPIKE-1947 — deferred to Phase 1 sign-off).

## Success Metric
- **AC-1 (PRIMARY):** 1948a + 1948b + 1948c all QA-approved within 48h of unblock. ≥1 `improve_check_log` row written in Shadow mode per detection cycle.
- **AC-2:** WORK Telegram fires when degradation detected (visible end-to-end signal).
- **AC-3:** Zero auto-dispatches (Phase 1 must be shadow-only — any signal-bus JSON write = AC failure).
- **AC-4:** 7-day OBSERVE gate (OBSERVE-1948d) clears with 7 consecutive cron runs.
- **AC-5:** Recurring-bug-escalation rule respected — if 1948c fails twice with same root cause, escalate to architect before re-spawning fix.

## Sequencing
1. **BLOCKED.** Wait for gate clear at 2026-05-20T07:22Z. No dev dispatch until then.
2. 1948a first (DB schema + store) → 1948b (domain service, pure) → 1948c (scheduler wiring + integration).
3. OBSERVE-1948d gate fires 2026-05-25T09:00Z (7d post-1948c deploy).

## Architect brief reference
- **ARCH brief:** `docs/architecture-briefs/2026-05-18-closed-loop-auto-improvement.md` (SPIKE-1947 output, committed `b55ea5c8` 2026-05-18).
- **Spike:** `docs/spikes/SPIKE_1947-auto-improve-loop.md`.

## Carry-forwards monitored (not in-scope this sprint)
- 1907a USER-ACTION (Claude Desktop restart for digest-predict MCP) — CRITICAL but blocked on user.
- 1897b USER-ACTION (Docker .git/ exclusion for VirtioFS HEAD.lock) — F1 USER-PERMANENT.
- alert-precision-488-unknowns MONITORING (HOLD until agent_signals ≥550)
- fa-shape-guard-watch MONITORING (next post-restart FA live session)
- ~~`post-1944-financial-reports-q1-2026` gate at 2026-05-18T12:00Z~~ — **FAILED 2026-05-18T11:37Z (c189)**: 0/7 banking Q1-2026 rows; EIB PDF stored but not reparsed; 6/7 banks still no PDF. FIX `1945d-reparse-pipeline-gap` dispatched to dev-mcp-server (HIGH, In Progress). Recurring-bug watch armed: 3rd BCTC-pipeline patch this sprint cycle.
- `post-1942-fa-verify` gate ~23Z tonight (independent OBSERVE)
- `1941b-signal-outcomes-seed-window` gate 2026-05-25 (independent OBSERVE)
- `1922g-pharma-events-source-verify` gate 2026-06-01 (independent OBSERVE)

---

## Sprint 1947 — CLOSED-LOOP AUTO-IMPROVEMENT DESIGN (DONE)

**Status:** DONE | **Closed:** 2026-05-18T09:09Z | **Theme:** Convert the passive accuracy-monitoring surface (signal_outcomes + alert_accuracy + AccuracyDigestStats + OBSERVE gates) into an active detect → hypothesize → fix → recheck → loop closed-loop self-improvement system.

**Outcome:** SHIPPED. SPIKE-1947 (architect, time-boxed 3h) closed-loop auto-improvement system designed end-to-end. Single anchor task DONE QA-APPROVED architect-committed `b55ea5c8` 2026-05-18. All 5 ACs met:
- **AC-1 (PRIMARY):** Spike doc + ARCH brief both committed (`docs/spikes/SPIKE_1947-auto-improve-loop.md` + `docs/architecture-briefs/2026-05-18-closed-loop-auto-improvement.md`).
- **AC-2:** Phased Sprint 1948 scope recommended: Phase 1 shadow-mode `selfImproveOrchestratorJob.ts` (detect + WORK Telegram + `improve_check_log` writes, no auto-dispatch). PM has decomposed into 4 atomic tasks filed in Backlog.
- **AC-3:** Loop step → component mapping done (detect → `accuracy_rate` queries via `signalOutcomeStore`; hypothesize → rule-table `degradationRules.ts` in domain layer; dispatch → Phase 2 signal-bus + Phase 3 auto-dispatch with kill-switch; recheck → 7-day post-dispatch window; loop → cron cadence).
- **AC-4:** Safety section complete — WIP≤2 cap, max 2 dispatches/cycle, cooldown 7d per signal_type, kill-switch `SELF_IMPROVE_AUTO_DISPATCH=false`, freeze-on-worsening, recurring-bug-escalation after 2 failed cycles, shadow → manual-gate → auto-dispatch phased rollout.
- **AC-5:** Of 6 carry-over OBSERVE gates, 3 candidates for retirement once Phase 1 proves stable (verdict-resolution-scored-pct + bug-storm-silence + 1941b-seed-window absorbed by orchestrator).

**Host decision (Option C):** Scheduler job inside `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts` — direct SQLite access, no new Docker service. Rejected alternatives: new microservice (DDD overhead, deploy cost) + cowork agent (token cost, latency).

**Sprint outcome:** Sprint 1948 unblocked from a scoping/design standpoint. Implementation gate-blocked separately on `post-1945-verdict-resolution-scored-pct` (2026-05-20T07:22Z) so Phase 1 reads a clean `alert_accuracy` substrate.

---

## Sprint 1947 ORIGINAL VISION (preserved for traceability)

**Status:** Active | **Opened:** 2026-05-18T08:56Z | **Theme:** Convert the passive accuracy-monitoring surface (signal_outcomes + alert_accuracy + AccuracyDigestStats + OBSERVE gates) into an active detect → hypothesize → fix → recheck → loop closed-loop self-improvement system.

# Goal

## Vision
The user request (verbatim 2026-05-18): _"add to goal — compare system to real result with historic analysis for auto improve recheck and improve continue loop workflow"_.

Sprints 1926a + 1941b + 1945a-b shipped the **measurement primitives**: every signal gets a verdict (`signal_outcomes` table, 24h lookback resolver), every signal type accumulates accuracy stats (`alert_accuracy` table), and the dashboard renders top-3/bottom-3 (`AccuracyDigestStats` + `AccuracyDigestCard`). What is STILL MISSING is the **active control loop** on top:

1. **Detect** — Read accuracy history, detect signal types whose `hit_rate` is degrading (regression vs prior 7d/30d window) or coverage gaps (stocks with N signals but 0 resolved verdicts).
2. **Hypothesize** — Generate improvement hypotheses (e.g., "alert-engine PMI threshold too low → false positives in regime=overheat", "news-scout chain_catalyst TTL too short → expires before verdict").
3. **Dispatch** — Auto-spawn FIX tasks via the existing signal-bus (`docs/signals/{agent-id}-{ISO}.json` → PO picks up).
4. **Recheck** — After fix deploys, re-measure the same metric over a fresh window; if hit_rate did not improve → re-hypothesize.
5. **Loop** — Continue indefinitely on a daily/weekly cadence.

Today the six OBSERVE gates carried out of Sprint 1946 are passive — a human reads them and maybe files a follow-up. This sprint asks: can we replace the human-in-the-loop with a `selfImproveOrchestratorJob` that reads `alert_accuracy`, applies a degradation policy, and posts a `dev-team-signal` for the gap?

This is **architectural in scope** — the design must decide: (a) is the orchestrator a new microservice or a scheduler job inside `apps/mcp-server`?, (b) does it auto-dispatch FIX tasks to dev-team or only post `signal_quality_audit` rows for PO triage?, (c) what is the safety gate (avoid runaway auto-fix storms — must respect WIP≤2)?, (d) does the recheck window equal the cron cadence of the affected job, or a fixed N-cycle wait?

**Sprint 1947 must NOT ship code yet.** Sprint 1947 ships an ARCHITECT brief + READ-ONLY SPIKE that scopes the system. Sprint 1948 will ship the minimum-viable loop based on the brief's recommendation.

## Sprint 1947 sub-tasks

### TIER 1 — Architect-led design (the anchor)
- **SPIKE-1947 — Closed-loop auto-improvement system design.**
  Owner: architect. Time-box 3h. Output: `docs/spikes/SPIKE_1947-closed-loop-auto-improvement.md` + `docs/architecture-briefs/2026-05-18-closed-loop-auto-improvement.md`.

  Questions to answer:
  1. **Where does the loop live?** Options: (a) new microservice `apps/self-improve/`, (b) scheduler job inside `apps/mcp-server/src/scheduler/jobs/selfImproveOrchestratorJob.ts`, (c) cowork agent (`agent: self-improver`). Trade-offs: speed-of-iteration vs DDD purity vs token cost.
  2. **What metric is the loop trigger?** Candidates: `alert_accuracy.hit_rate` regression ≥10pp week-over-week, `signal_outcomes.scored_pct` drop ≥10pp, per-stock `agent_signals` count with 0 resolved verdicts, `signal_quality_audit` row count rising.
  3. **What is the detection policy?** Hard threshold (e.g., hit_rate <40% over ≥30 samples → flag) or rolling-mean delta?
  4. **What is the hypothesis generator?** Rule-based table lookup (signal_type → likely-cause) or an LLM call (cowork agent self-reflection)?
  5. **Auto-dispatch vs human-gate?** Option (a) auto-spawn FIX tasks via signal-bus respecting WIP≤2. Option (b) post `signal_quality_audit` rows for PO triage (no auto-dispatch). The user request implies (a) but the recurring-bug-escalation rule (≥2 fix commits same module → architect rethink) implies safety gates needed.
  6. **What is the recheck cadence?** N cycles of the affected job? Fixed 48h window? Until next OBSERVE gate fires?
  7. **What is the loop-exit / convergence criterion?** Hit_rate ≥X% sustained over Y windows? Max-N-iterations (declare WONTFIX)?
  8. **What pre-existing primitives are reusable?** signal_outcomes, alert_accuracy, AccuracyDigestStats endpoint, signal-bus, OBSERVE gate pattern, recurring-bug-escalation rule. The brief must explicitly map each loop step to an existing component or a new one.
  9. **Safety: how does the loop avoid runaway?** WIP cap, max-iterations-per-signal-type, kill-switch env var, OBSERVE-only "shadow mode" before going live.
  10. **Phasing.** Sprint 1948 minimum-viable scope: detect-only (no auto-dispatch, just log to `signal_quality_audit` + Telegram WORK)? Detect + manual-dispatch via PO? Full auto-loop?

  **AC:** Spike doc identifies architecture + writes architect brief recommending phasing for Sprint 1948. Brief includes: decision tree (microservice vs job vs agent), metric+threshold table, hypothesis-generator design (rule table OR LLM agent spec), safety-gate design, phased rollout (shadow → manual-dispatch → auto-dispatch).

### TIER 2 — Observation gates (carried from Sprint 1946 — no new work)
- All six existing OBSERVE gates run unchanged:
  - `post-1944-financial-reports-q1-2026` (gate 2026-05-18T12:00Z — ~3h from sprint open)
  - `post-1942-fa-verify` (~23Z tonight)
  - `post-1945-verdict-resolution-scored-pct` (2026-05-20T07:22Z)
  - `post-1945-bug-storm-silence` (2026-05-20T07:22Z)
  - `1941b-signal-outcomes-seed-window` (2026-05-25)
  - `1922g-pharma-events-source-verify` (2026-06-01)

  These gates ARE the empirical input that SPIKE-1947's design must read. If `post-1945-scored-pct` fires "scored_pct ≥60%" cleanly at 2026-05-20 → that becomes the spike's reference data showing the measurement substrate works. If it misses → spike has live evidence of the gap the auto-improve loop must close.

## Scope
IN: 1 architect SPIKE (time-boxed 3h, read-only diagnostic + design brief). 6 passive OBSERVE gates carrying from Sprint 1946.
OUT: Any code change. Any new microservice scaffolding. Any auto-dispatch wiring. Cowork agent definition changes. New cron jobs. Schema migrations. The whole point of the spike is to decide what to build BEFORE building.

## Success Metric
- **AC-1 (PRIMARY):** SPIKE-1947 doc + ARCH-1947 brief both committed within 48h of sprint open (target 2026-05-20T08:00Z, aligning with the post-1945 OBSERVE gate so the spike can reference fresh data).
- **AC-2:** Brief recommends a phased Sprint 1948 scope (detect-only → manual-dispatch → auto-dispatch) with concrete file/zone targets for the first phase.
- **AC-3:** Brief explicitly maps each loop step (detect / hypothesize / dispatch / recheck / loop) to either an existing primitive or a new component with naming + DDD layer.
- **AC-4:** Brief includes a safety section: WIP cap mechanism, max-iterations-per-signal-type, kill-switch, shadow-mode rollout.
- **AC-5:** SPIKE-1947 reviews the six carry-over OBSERVE gates and proposes which ones can be retired once the loop is live (and which stay as belt-and-suspenders monitoring).

## Sequencing
1. SPIKE-1947 runs first and last in Sprint 1947 — it IS the sprint deliverable.
2. The six OBSERVE gates run passively in the background; their outputs feed SPIKE-1947's empirical data section but do not block the spike.
3. Sprint 1948 (next sprint) picks up the brief's recommended Phase 1 scope as its anchor.

## Architect brief required
- **ARCH-1947** is the architect's design output (not a pre-spike brief). The brief IS the spike's deliverable. No separate scoping brief is needed before SPIKE-1947 starts — the user request itself is the scoping input.

## Carry-forwards monitored (not in-scope this sprint)
- 1907a USER-ACTION (Claude Desktop restart for digest-predict MCP) — CRITICAL but blocked on user.
- 1897b USER-ACTION (Docker .git/ exclusion for VirtioFS HEAD.lock) — F1 USER-PERMANENT.
- alert-precision-488-unknowns MONITORING (HOLD until agent_signals ≥550)
- fa-shape-guard-watch MONITORING (next post-restart FA live session)

---

## Sprint 1946 — CRISIS DETECTION COVERAGE GAP (DONE)

**Status:** DONE | **Closed:** 2026-05-18T08:40Z | **Theme:** Diagnose whether `get_crisis_early_warning` is supposed to cover individual-stock -30%+ crashes, or only systemic/macro crises — TNB c69 finding #2.

**Outcome:** SHIPPED. SPIKE-1946 confirmed root cause = PLX absent from `watchlist` table → `get_crisis_early_warning` never evaluated PLX. Architectural scope of the tool was correct (velocity-spike detector for in-universe stocks); fix was minimum-viable watchlist seed extension. 1946a shipped PLX entry across 3 SSoT sources (`docs/data/system-map.json`, `mcp.config.json`, `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts`) plus frontend `apps/frontend/app/domain/market.ts`. 7 new tests in `1946a-plx-watchlist-crisis-coverage.test.ts` validate seed presence + velocity ratio ≥2.0 → crisisIndicators contains PLX + below-threshold negative test + idempotency. Pre-existing 1343a stale-count failures (from 1876a-A6 not updating row counts) also fixed: 26→34 rows, domain set 11→13, HNX assertion corrected. All 49 watchlist/crisis tests GREEN. tsc 0 errors. Docker rebuild dispatched to ops (separate agent in flight). R-1 honored: Sprint 1945 zone (`verdictResolutionJob.ts` + alert_accuracy tables) untouched.

**Open observation gates (carried into post-sprint monitoring window):**
- `post-1944-financial-reports-q1-2026` gate 2026-05-18T12:00Z (6 of 7 banking source_url populated; EIB fetched; reparse pending)
- `post-1942-fa-verify` gate ~23Z tonight
- `post-1945-verdict-resolution-scored-pct` + `post-1945-bug-storm-silence` both 2026-05-20T07:22Z
- `1941b-signal-outcomes-seed-window` 2026-05-25
- `1922g-pharma-events-source-verify` 2026-06-01

---

## Sprint 1946 ORIGINAL VISION (preserved for traceability)

**Status:** Active | **Opened:** 2026-05-18T07:24Z | **Theme:** Diagnose whether `get_crisis_early_warning` is supposed to cover individual-stock -30%+ crashes, or only systemic/macro crises — TNB c69 finding #2.

# Goal

## Vision
TNB c69 (2026-05-18 07:00 UTC) raised a new methodology gap: PLX dropped -40% in a single session (signal #3383 typed `chain_catalyst` event_type=crisis by news-scout), and yet `get_crisis_early_warning` returned "no signals" when alert-commander queried it at 06:03 UTC. A -40% single-session crash on a watchlist stock is crisis-velocity territory by any reasonable definition — either the tool was always scoped narrower than its name implies (systemic-only), or the tool has a data-lag, or PLX falls outside coverage. We do not know which, and "we do not know" on a CRISIS tool is the worst possible state — alert-commander will silently under-report similar events again. TNB has explicitly escalated this to PO/architect.

This is **not a band-aid sprint** — no dev code, no new tool yet. It is a pure architect-led SPIKE to decide: (a) does crisis_velocity need expansion to cover individual-stock crashes ≥-30%/-40%, (b) is the gap really in news-scout's chain_catalyst pipeline (which DID catch PLX) and so crisis_velocity is correctly scoped to macro/systemic, or (c) is there a data-coverage gap (PLX not in the crisis_velocity universe). Whatever the spike concludes, the output is a FIX or NO-OP recommendation with concrete scope. PO will spawn the FIX as Sprint 1947 once the spike is in hand.

## Sprint 1946 sub-tasks

### TIER 1 — Single SPIKE (architect read-only)
- **SPIKE-1946 — Crisis detection coverage gap diagnosis.**
  Owner: architect. Time-box 2h. Output: `docs/spikes/SPIKE_1946-crisis-detection-coverage.md`.
  Questions to answer:
  1. Where is `get_crisis_early_warning` implemented, and what data source(s) does it read? (Likely `crisis_velocity` table or a derived view inside `apps/mcp-server`.)
  2. What is the intended scope — systemic/macro crisis only (e.g., VN-Index drawdown, FII outflow tipping, banking sector contagion) or also individual-stock -30%/-40% events?
  3. Was PLX in the crisis_velocity coverage universe at 06:03 UTC 2026-05-18, and if yes — why did it not register? If no — should it be?
  4. Is news-scout's `chain_catalyst event_type=crisis` (which DID catch PLX into signal #3383 at 05:21 UTC) the canonical individual-stock crash path, with `get_crisis_early_warning` correctly scoped narrower? If so → no code change, just document the scoping in `docs/standards/mcp-tools.md`.
  5. If a fix is warranted: minimum viable scope (extend crisis_velocity ingestion to single-stock -X% events? add an `individual_stock_crash` row type? new tool `get_stock_crash_warning`?).
  **AC:** Spike doc identifies root cause + recommended FIX/NO-OP path. If FIX → child task scoped (1947a-...) with clear zone (`apps/mcp-server/` likely). If NO-OP → doc update committed in `docs/standards/mcp-tools.md` + the spike itself is the artifact.

### TIER 2 — Observation gates (no code, passive — carried over from Sprint 1945)
- **post-1945-verdict-resolution-scored-pct** (NEW gate, 48h from 1945a deploy = ~07:22 UTC 2026-05-20). AC-1 from Sprint 1945: `alert_accuracy.scored_pct` rises ≥60% AND `unknowns_30d` drops by ≥100. If not achieved by 2026-05-20T08:00Z → re-open as 1947b-verdict-resolution-followup (HIGH FIX).
- **post-1945-bug-storm-silence** (NEW gate, 48h). AC-2: zero new `[bug] verdictResolutionJob` Telegram messages for 48h post-1945a deploy. If any new bug msg before 2026-05-20T08:00Z → 1947c-verdict-resolution-bug-followup.
- **post-1944-financial-reports-q1-2026** (gate 12:00 UTC 2026-05-18 = ~4.5h away). Pre-existing Todo carries over unchanged.
- **post-1942-fa-verify** (gate ~23:00 UTC 2026-05-18). Pre-existing Todo carries over unchanged.
- **1941b OBSERVE** gate 2026-05-25 (signal_outcomes ≥30 resolved). No PO action this sprint.
- **1922g OBSERVE** gate 2026-06-01 (pharma_events cron tick).

## Scope
IN: 1 spike (architect read-only, 2h time-box), 4 observation gates (2 new from 1945 sign-off, 2 pre-existing).
OUT: any code change before SPIKE-1946 concludes; new alert types; reworking crisis_velocity ingestion (gated on spike conclusion); new microservices; touching anything in `apps/mcp-server/scheduler/alerts/` (Sprint 1945 just shipped there — let it stabilise).

## Success Metric
- **AC-1 (PRIMARY):** SPIKE-1946 doc committed to `docs/spikes/SPIKE_1946-crisis-detection-coverage.md` within 24h, with clear FIX/NO-OP recommendation.
- **AC-2:** If FIX recommended → child task (1947a) scoped with zone + AC, queued in TASKS.md Todo for next sprint.
- **AC-3:** If NO-OP recommended → `docs/standards/mcp-tools.md` updated to document the scoping of `get_crisis_early_warning` (systemic vs individual-stock), and news-scout's `chain_catalyst event_type=crisis` confirmed as the canonical individual-stock crash path.
- **AC-4 (gating):** Sprint 1945 observation gates resolve cleanly: scored_pct ≥60%, bug-storm silent, banking Q1-2026 populated, FA ≥20/30. Any miss → follow-up task scoped under Sprint 1947.

## Sequencing
1. SPIKE-1946 runs in parallel with observation gates (no dependency).
2. Observation gate `post-1944-financial-reports-q1-2026` resolves at 12:00 UTC today (decides 1945d need).
3. Observation gate `post-1942-fa-verify` resolves at ~23 UTC tonight (decides 1945c need).
4. Observation gates `post-1945-*` resolve at ~07:22 UTC 2026-05-20 (decides 1947b/c need).
5. SPIKE-1946 conclusion → Sprint 1947 scoping decision.

## Architect brief required
- **SPIKE-1946** IS the architect output (read-only diagnostic). No separate ARCH brief required.

## Carry-forwards monitored (not in-scope this sprint)
- 1907a USER-ACTION (Claude Desktop restart for digest-predict MCP) — CRITICAL but blocked on user.
- 1897b USER-ACTION (Docker .git/ exclusion for VirtioFS HEAD.lock) — F1 USER-PERMANENT.
- alert-precision-488-unknowns MONITORING (HOLD until agent_signals ≥550)
- fa-shape-guard-watch MONITORING (next post-restart FA live session)

---

## Sprint 1945 — VERDICT RESOLUTION RECOVERY + FRONTEND ACCURACY DIGEST (DONE)

**Status:** DONE | **Closed:** 2026-05-18T07:24Z | **Theme:** Restore alert-accuracy signal (520→<200 unknowns, scored_pct 36%→≥60%) and unblock BA-1942d frontend card now that Sprint 1944 has stabilised the BCTC ingestion path.

**Outcome:** SHIPPED. All 3 child tasks (1945a, 1945b-backend, 1945b-frontend) QA-APPROVED 2026-05-18. SPIKE-1945 + BA-1942d + ARCH-1945b + PM-1945b breakdown all DONE. Docker rebuilt 07:22 UTC, container healthy, 142 tools, 76 cron jobs.
- **1945a:** `getPriceHistory` envelope unwrap in `verdictResolutionJob.ts` + `clients.ts`. 6 new unit tests GREEN. Root cause: Go `/price/history` returns `{code, history: DailyOHLCV[]}` envelope but TS code was reading `snaps[0].price` as `PriceSnapshot[]`. Fixed `defaultFetchHistory()` to read `envelope.history[0].close`. Eliminates silent TypeError → null → `false_positive:unresolvable` path that was preventing ~520 alerts from being scored.
- **1945b-backend:** `GET /api/accuracy/digest?days=N` handler in `server.ts` after line 1020. Days clamped [1,90] using `isNaN` guard (R-4 mitigated). 6 tests GREEN.
- **1945b-frontend:** `AccuracyDigestCard` SectionCard in `dashboard.analysis.tsx` after Kinh Dịch card. 6 UI states (loading/empty/all-neutral/insufficient-sample/partial/normal). 20 tests GREEN, full suite 144/144.
- **Open observation gates (carried into Sprint 1946):** post-1945-verdict-resolution-scored-pct + post-1945-bug-storm-silence (both at 2026-05-20T07:22Z). scored_pct recovery expected within 48h based on alert cron cadence.

---

## Sprint 1945 ORIGINAL VISION (preserved for traceability)

**Status:** Active | **Opened:** 2026-05-18T06:23Z | **Theme:** Restore alert-accuracy signal (520→<200 unknowns, scored_pct 36%→≥60%) and unblock BA-1942d frontend card now that Sprint 1944 has stabilised the BCTC ingestion path.

# Goal

## Vision
Sprint 1944 closed: BCTC pipeline restored end-to-end (banking 7/7 source_url populated, enricher cycling, dead strategies removed). Sprint 1942 closed: get_cash_flow coverage 31/33 = 94%. The next ceiling is **the closed-loop intelligence quality measurement** — unified-agent reports `alert_accuracy` stuck at `scored_pct=36% (520 unknown / 0 hit / 0 miss)` across 2026-05-17 → 2026-05-18 cycles. This means: even though signals fire and verdicts are written, `verdictResolutionJob` cannot resolve them to hit/miss because **historical baseline prices are missing** for the watchlist symbols at signal-fire-time.

The recurring-bug protocol trips at 3 instances:
- **TNB c68 finding #7** (2026-05-18): verdictResolutionJob no-baseline-price loop, 19 dup BUG msgs in 21h.
- **unified-agent 04:01 UTC 2026-05-18**: `alert_accuracy scored_pct=36% with 520 unknowns over 30d → resolution job likely still stalled per prior cycle carry-over. Same root cause as 2026-05-17 BUG msgs.`
- **1926a (DONE c146)** silenced the BUG storm via `false_positive` marking but did NOT restore the baseline-price ingestion that would let the job legitimately resolve verdicts.

1926a was a band-aid (suppress the BUG noise); the underlying signal is "alert-accuracy measurement is broken" — every cowork agent reads `scored_pct` to calibrate their own confidence thresholds, and a stuck-at-36% measurement is poisoning the whole feedback loop.

In parallel, **BA-1942d** (accuracy digest frontend card) is now unblocked post-Sprint-1944. Sprint 1941c shipped `getSystemAccuracyDigestStats` — the gateway endpoint + frontend card are the consumer side of the same accuracy pipeline. Land them together: if the resolver is fixed, the card has data to render; if the card lands first against a 36% pipeline, it visualises the bug.

## Sprint 1945 sub-tasks (priority order)

### TIER 1 — Diagnose + fix verdict resolution baseline (closed-loop intelligence repair)
- **SPIKE-1945 — Root-cause why `verdictResolutionJob` cannot resolve baseline prices for 520 alerts.**
  Time-box 2h. Output: `docs/spikes/SPIKE_1945-verdict-resolution-no-baseline.md`. Questions to answer:
  1. Where does `verdictResolutionJob` read baseline prices from? (Likely `market_prices_history` or `stock_price.db`.)
  2. For the 520 unknown verdicts, what's their `signal_emitted_at` timestamp distribution? Is the baseline-fetch reading the wrong source for that window?
  3. Did the SQLite corruption fix Sprint 1336 (`stock_price.db` isolation) change the path that `verdictResolutionJob` queries? Possibly a stale FQN.
  4. Is `1926a`'s `false_positive` marking correct here (no baseline EVER available → genuinely unresolvable), or are we masking a fixable upstream lag (price not yet ingested when verdict runs, but available a few hours later)?
  Owner: architect (read-only diagnostic).
  AC: Spike doc identifies root cause + recommended FIX task (e.g., 1945a-fix-baseline-source, 1945a-retry-grace-period, or 1945a-rebackfill-historical-prices). If conclusion is "1926a is correct, 520 unknowns are genuinely unresolvable" then **propose deletion of the unresolvable rows** and a back-off retry policy so the storm cannot recur.

- **1945a — FIX (FROM SPIKE).**
  Owner: dev-mcp-server. Scope sized from SPIKE-1945. Estimated S/M.
  AC: After 1 verdict-resolution cycle post-fix, `alert_accuracy.scored_pct` rises ≥10pp OR `unknowns_30d` drops by ≥100. Zero new BUG channel noise from `verdictResolutionJob`.

### TIER 2 — Frontend accuracy digest card (BA-1942d, now unblocked)
- **BA-1942d — Write requirement spec for accuracy digest frontend card.**
  Owner: ba. Re-priority MEDIUM (was LOW under Sprint 1944).
  AC: spec covers (a) frontend route + component shape, (b) gateway endpoint contract for top-3/bottom-3 from `getSystemAccuracyDigestStats`, (c) loading/empty states (must handle "0 hit / 0 miss" gracefully — no division-by-zero), (d) acceptance criteria. Output: `docs/REQ_NNN-accuracy-digest-frontend-card.md` style.
- **1945b — IMPLEMENTATION (FROM BA SPEC).**
  Owner: dev-frontend + dev-api-gateway. Sized from BA spec. Estimated M.
  Sequencing: lands after BA-1942d + 1945a (so the card has clean data to render).
  AC: card renders on dashboard; backed by gateway endpoint backed by `getSystemAccuracyDigestStats`; loading/empty/error states all exercised.

### TIER 3 — Observation gates (no code, passive)
- **post-1942-fa-verify** (gate ~23:00 UTC 2026-05-18) — already in Todo. If next FA cycle reports ≥20/30 BCTC analyses → close. If still ≤19 → spawn `1945c-fa-docker-deploy-gap` bug task to dev-mcp-server.
- **post-1944-financial-reports-q1-2026** (NEW gate, +1-3 cycles from 1944c sign-off ~10:00 UTC 2026-05-18). 1944c smoke shows banking 7/7 source_url populated but financial_reports Q1-2026 = 0 rows. Reparse pipeline expected to populate within 1-3 enricher+sweep cycles (30-90 min). If 0 rows after 3 cycles → spawn `1945d-reparse-pipeline-gap` bug task to dev-mcp-server.
- **1941b OBSERVE** gate 2026-05-25 (signal_outcomes ≥30 resolved rows). No PO action this sprint.
- **1922g OBSERVE** gate 2026-06-01 (pharma_events cron tick).

## Scope
IN: 1 spike (root-cause), 1 fix from spike, 1 BA spec (re-priority of BA-1942d), 1 frontend impl from spec, 2 observation gates.
OUT: refactoring the alert engine; new alert types; backfilling old verdicts beyond what the fix mandates; new BCTC pipeline work; new microservices.

## Success Metric
- **AC-1 (PRIMARY):** `alert_accuracy.scored_pct` rises from 36% to ≥60% within 24h of 1945a deploy. `unknowns_30d` drops from ~520 to ≤200.
- **AC-2:** Zero new `[bug] verdictResolutionJob` Telegram messages for 48h post-1945a deploy.
- **AC-3:** Frontend accuracy digest card renders top-3/bottom-3 from real data (not placeholder). Empty-state handled gracefully when `total_scored < 20` (insufficient sample).
- **AC-4:** SPIKE-1945 doc committed + 1945a's root-cause justification documented in the FIX commit message.

## Sequencing
1. SPIKE-1945 first (2h time-box; architect read-only).
2. BA-1942d re-spawn in parallel with SPIKE-1945 (no dependency).
3. 1945a (FIX from spike) — needs SPIKE-1945 done.
4. 1945b (frontend card) — needs BA-1942d done AND 1945a done (so card has real data).
5. TIER 3 observation gates run passively.

## Architect brief required
- **SPIKE-1945** itself is the architect output (read-only root-cause diagnosis). No separate ARCH brief required.

## Carry-forwards monitored (not in-scope this sprint)
- 1907a USER-ACTION (Claude Desktop restart for digest-predict MCP)
- 1897b USER-ACTION (Docker .git/ exclusion for VirtioFS HEAD.lock)
- alert-precision-488-unknowns MONITORING (HOLD until agent_signals ≥550)
- fa-shape-guard-watch MONITORING (next post-restart FA live session)

---

## Sprint 1944 — VPS BCTC DISCOVERY REPAIR (DONE)

**Status:** DONE | **Closed:** 2026-05-18T06:23Z | **Theme:** Restore the BCTC source_url ingestion pipeline so banking Q1-2026 cohort + 27 watchlist tickers stop accumulating `url_not_found`

**Outcome:** SHIPPED. All 4 tasks QA-approved 2026-05-18 (ARCH-1944, 1944a-vps, 1944a-mcp, 1944b, 1944c). Smoke report: `reports/TASK_REPORT_1944c.md` — PASS on all 5 ACs. Banking cohort 7/7 source_url populated (100%). VPS proxy returns `{results:[{url,source,confidence}],error}` envelope. X-API-Key injection verified. Dead strategies (SSC/vietstock) removed; strategy chain now `hsx(0) → VPS Playwright(1) → null`. Docker container rebuilt; enricher cycling at 05:45 + 06:15 UTC. financial_reports.Q1-2026 = 0 rows currently — reparse pipeline expected to populate within 1-3 cycles (carry-forward as `post-1944-financial-reports-q1-2026` observation gate in Sprint 1945).

---

## Sprint 1944 ORIGINAL VISION (preserved for traceability)

# Goal

## Vision
Sprint 1942 lifted `get_cash_flow` coverage to 31/33 (94%) via the `vnstock_cash_flow` fallback, and 1943a queue-reset + grace-period auto-retry was wired. But the **upstream BCTC PDF discovery layer is still dead** — diagnosed twice (SPIKE-1916 on 2026-05-14 and SPIKE-1943 on 2026-05-18). `bctcQueueEnricherJob` has never populated `source_url` for any ticker:
- **Strategy 0** (`/proxy/bctc-discover` VPS route): never deployed on `vps-proxy-server.js`; `bctcHttpFetcher.ts` never injects `X-API-Key` → 401/404.
- **Strategy 1** (SSC iboard): `iboard-query.ssc.vn` NXDOMAIN since 2026-04-27.
- **Strategy 2** (cafef FinanceInfo.ashx): migrated 301→404; query params lost.
- **Strategy 3** (vietstock): JS-rendered 404.

The 9 historically-working tickers (VCB/FPT/DIG/BSR/DGC/HPG/SHB/VEA/VNM) got their `source_url` from the **parallel VPS-push pipeline** (`fetch-bctc.sh` + `discover-bctc-urls-browser.py` on Vinahost VPS), not from the enricher. With Q1-2026 deadline 3+ days past (banking cohort 38/38 QUÁ HẠN), the auto-retry shipped in 1943a will fire after grace period and hit the same dead endpoints, then re-park the rows after 6 attempts. The recurring-bug protocol triggered: ≥2 SPIKEs on the same module ⇒ architect root-cause rethink already done; now the FIX must land before any further reparse or backfill work.

## Sprint 1944 sub-tasks (priority: minimum-viable enricher revival first)

### TIER 1 — Make the canonical VPS discovery route real (the minimum viable fix)
- **1944a — VPS `/proxy/bctc-discover` route + `X-API-Key` header injection.**
  Add `GET /proxy/bctc-discover/:ticker?year=&quarter=` to `vps-scripts/vps-proxy-server.js` that shells out to the existing working `discover-bctc-urls-browser.py` script. Extend `apps/mcp-server/src/infrastructure/fetchers/bctcHttpFetcher.ts` to inject `X-API-Key: ${Bun.env.VPS_PUSH_API_KEY}` whenever the request URL matches the Vinahost VPS host (`125.212.251.27:8765`). Zones: `multi` (`vps-scripts/` + `apps/mcp-server/`). Architect must split the brief into per-zone tasks before dev pickup.
  **AC:** Live probe `GET http://125.212.251.27:8765/proxy/bctc-discover/DPM?year=2025&quarter=4` with `X-API-Key` returns 200 + array of source URLs. `bctcQueueEnricherJob` next tick populates `source_url` for ≥10 of the 27 currently-`url_not_found` tickers. No new 401s in `tool-bctcqueueenricher.log`.

### TIER 2 — Retire or replace the dead non-canonical strategies
- **1944b — Replace dead cafef Strategy 2 OR delete it.**
  `s.cafef.vn/Candles/FinanceInfo.ashx` is permanently 404 after the cafef.vn migration. Either: (a) replace with `cafef.vn/tai-lieu-tai-chinh/<ticker>/bctc` after probing whether it's static or JS-rendered, or (b) delete the strategy and log a permanent deprecation note. Strategies 1 (SSC iboard NXDOMAIN) and 3 (vietstock JS-rendered) get the same treatment: comment with `DEPRECATED-YYYY-MM-DD` + reason; do not waste cycles re-probing dead endpoints.
  **AC:** `bctcDiscovery.ts` strategy list has zero strategies that throw or return 0 every time. Either the strategy is wired to a live endpoint, or it is removed/no-oped with a deprecation comment. Tests: at least one strategy returns ≥1 URL for VCB and DPM in dev.
  **Sequencing:** Land after 1944a. 1944a is the canonical path; 1944b is hardening / dead-code cleanup.

### TIER 3 — Verify the chain end-to-end
- **1944c — End-to-end smoke verification + watchlist coverage report.**
  After 1944a deploys and one `bctcQueueEnricherJob` + one `bctcBatchSweepJob` tick has run, produce a smoke report: how many of the 27 `url_not_found` tickers now have populated `source_url`, how many PDFs were fetched via the VPS pull pipeline (`mcp-server` pulls from `VPS:8765/bctc-files/`), how many entered `bctcReparseJob`, how many ended up in `financial_reports` with Q1-2026 rows. Report into `reports/TASK_REPORT_1944c.md`. Zone: `apps/mcp-server/` (read-only verification + report-only task — ops + dev-mcp-server collaboration).
  **AC:** Smoke report exists with concrete counts. ≥5 of the 7 watchlist banks (ACB/BID/CTG/EIB/MBB/VCB/VPB) have either a Q1-2026 row in `financial_reports` OR a populated `source_url` + `bctc_vps_queue.status='fetched'` row. If 0 banks file Q1-2026 via the upstream feed despite a working enricher, ops files an SSC ingestion lag feedback to PO (separate ticket).

## Scope
IN: 1 VPS route addition + 1 fetcher header tweak (1944a), 1 strategy cleanup task (1944b), 1 verification report (1944c). Architect brief on per-zone task split for 1944a (the only `multi` task).
OUT: New BCTC fetchers beyond the canonical VPS pull pipeline; OCR/extraction work (1942c already covered the steel-sector label gap; net_profit bridge 1941d already shipped); calendar deadline rewrites (SPIKE-1943 confirmed calendar logic is correct); new microservices.

## Success Metric
- **AC-1 (PRIMARY):** `bctc_vps_queue` `source_url IS NOT NULL` count rises by ≥10 within 24h of 1944a deploy. Baseline = 12 (the 9 historically-working VPS-pushed tickers + 3 ad-hoc). Target = ≥22.
- **AC-2:** `tool-bctcqueueenricher.log` shows ≥1 line of `source_url populated` per ticker for the previously-failing 27. Zero new 401 lines from the VPS endpoint.
- **AC-3:** After one full enricher + sweep cycle, ≥5 of 7 watchlist banks have ingested Q1-2026 BCTC (or PO escalates SSC ingestion lag as separate ticket).
- **AC-4:** Strategy list in `bctcDiscovery.ts` no longer contains live strategies hitting permanently-404/NXDOMAIN endpoints.

## Sequencing
- 1944a is the minimum viable fix. Architect brief on per-zone split lands first → ops handles the VPS-side route, dev-mcp-server handles the `bctcHttpFetcher` header injection. Parallel within the same task once split.
- 1944b lands after 1944a (cleanup is meaningless until the canonical path works).
- 1944c is the closing verification — runs ≥1 enricher cycle after 1944a + 1944b deploys.

## Architect brief required
- **ARCH-1944** — Per-zone task split for 1944a (the only `multi` task). Output → `docs/architecture-briefs/2026-05-18-vps-bctc-discover-route-zone-split.md`. ≤2 pages. Blocks 1944a only.

## Carry-forwards monitored (not in-scope this sprint)
- 1941b OBSERVE gate 2026-05-25 (signal_outcomes seeding window — verify ≥30 resolved rows)
- 1922g OBSERVE gate 2026-06-01 (pharma_events cron tick)
- 1907a USER-ACTION (Claude Desktop restart for digest-predict MCP)
- 1897b USER-ACTION (Docker .git/ exclusion for VirtioFS HEAD.lock)
- alert-precision-488-unknowns MONITORING (HOLD until ≥550)
- BA-1942d DEFERRED (accuracy digest frontend card — LOW; out-of-scope this sprint, can pick up after 1944 if 1944a/b/c finish early)
- **FA coverage post-1942 verification:** financial-analyst next live cycle (~23:00 UTC tonight) should report ≥20/30 BCTC analyses (vs prior 3/38). If post-1942 cycle still reports 3/38 → bug task to dev-mcp-server (Docker rebuild or 1942 deploy gap).

---

## Sprint 1942 — WATCHLIST FUNDAMENTALS COVERAGE (DONE)

**Status:** DONE | **Closed:** 2026-05-18 | **Theme:** Lift FA coverage from 3/30 to ≥20/30 watchlist tickers

**Outcome:** SHIPPED. `get_cash_flow` coverage 31/33 = 94% (sprint goal ≥20/30 EXCEEDED). All 4 tasks QA-approved: 1942a (vnstockStartupProbe), 1942b (cashFlowTool fallback + backfillOCFForWatchlist), 1942c (HPG OCF all-zeros fix — 3-key fallback + MFG steel label + NULL policy), 1943a (BCTC queue reset + grace-period auto-retry). toolCount 140→142. Docker rebuilt and healthy. ARCH-1942 brief in `docs/architecture-briefs/2026-05-18-watchlist-fundamentals-cadence.md`. Reports: `reports/TASK_REPORT_1942a.md`, `reports/TASK_REPORT_1943a.md`. Carry-forward: BA-1942d (accuracy digest frontend card — LOW, deferred to post-1944).

---

## Sprint 1920 — DB PIPELINE COMPLETENESS (COMPLETE)

**Status:** COMPLETE | **Closed:** 2026-05-16 | **Theme:** Every table feeds Cowork analysis

# Goal

## Vision
Cowork agents (financial-analyst, market-watcher, news-scout, unified-agent, alert-commander) need a **complete Vietnam-market picture**. Today ~10 SQLite tables across the 9 microservices are silent zombies — schema exists but no scheduler pushes data, or the writer exists but is wired to nothing. Sprint 1920 makes every defined table active or formally retires it. After this sprint, `freshnessSlaMonitor` covers 100% of declared tables, and the data-audit job has zero "stale" findings on the Cowork-critical surface.

## Sprint 1920 sub-tasks (priority order: Cowork-impact)

### TIER 1 — Financial / fundamentals (highest analyst impact)
- **1920a** — Wire `vnstockStore` upserts into a fundamentals refresh scheduler (quarterly cadence). Today `vnstockStore.ts` has writers for `vnstock_financials` / `vnstock_balance_sheet` / `vnstock_cash_flow` / `vnstock_events` / `vnstock_officers` / `vnstock_shareholders` / `vnstock_trading_stats` (7 tables) but ZERO scheduler invokes them. Financial-analyst PE/PB/ROE peer comparisons silently fall back to NULL today.
- **1920b** — Wire `bondMaturityStore.insertBondMaturity` into a scheduled poller. `bond_maturity` table currently zero-rows; news-scout / unified-agent cannot detect upcoming bond rolls.

### TIER 2 — Macro / external (regime + cycle inputs)
- **1920c** — Wire `commodityTracker` into a scheduler. `commodity_prices` / `commodity_prices_history` have writers (also shared with `shippingIndex.ts`) but no cron — Phase-clock / regime detection in financial-analyst loses commodity input.

### TIER 3 — Cowork analysis surface (alert/intelligence enrichment)
- **1920d** — Wire `broker_sanctions` ingestion into a quarterly SSC sweep. broker-credibility tool returns empty today.
- **1920e** — Wire `BacktestResultRepo.recordRun` into a closed-loop call from `cascadeBacktestJob` (rule-firing → outcome → backtest_runs persisted). Or formally retire backtest_runs if dual-stored elsewhere.

### TIER 4 — Internal observability (system health for Cowork debugging)
- **1920f** — Activate `signal_quality_audit` writer in `signalValidator` (currently only commented "future"). Helps QA agent + report-analyzer flag systematic agent-prompt regressions.
- **1920g** — Activate the `prediction_claims` auto-population path (today only written from manual evidenceTools MCP call). Wire from intelligenceCycleJob output so claims accumulate without user input.

### TIER 5 — Formal retirement (no analyst value)
- **1920h** — Drop or document-as-deprecated: `skips`, `user_requests` (replaced by `ask_queue` per docs) — zero writers anywhere. Update `schema-system.ts` with explicit DEPRECATED comment block or DROP if no read path.

## Scope
IN: scheduler wiring for 10 zombie tables (or formal retirement decision), `freshnessSlaMonitor` extension, 1 architect brief on shared cadence vs per-source-tier cadence.
OUT: rewriting fetchers (use existing infrastructure); UI changes; new microservices; backtest engine work beyond hooking the existing repo.

## Success Metric
- AC-1: Every Sprint-1920 task either ships a scheduler entry in `cronConfig.ts` OR a formal deprecation note in `schema-system.ts`.
- AC-2: `freshnessSlaMonitor` reports `coverage_pct >= 95%` of declared tables.
- AC-3: cowork agents financial-analyst + market-watcher each successfully query at least one of the newly-wired tables in a daily-review cycle with non-empty result.
- AC-4: Zero "Cheerio-selector-broken-style" surprises — for every wired source, runbook + circuit-breaker + WORK channel alert on fetch failure.

## Sequencing
- 1920a / 1920c are independent (TIER 1 & 2, parallel-able).
- 1920b / 1920d follow 1920a (share the `vpsProxyWatchdog` infrastructure).
- 1920e / 1920f / 1920g are pure code wiring (no external HTTP) — can ship any order after Docker DNS unblocks.
- 1920h is doc-only, can ship anytime.

## Docker dependency
Some sub-tasks (1920a/b/c/d) require redeploy to take effect. Tasks themselves can be coded today on `main`; deploy queued for next Docker restart (post-1919).

## Architect brief required
- **ARCH-1920** — Cadence policy: per-source-tier (T1/T2/T3) cadence vs per-domain (fundamentals quarterly / macro daily / news 15-min). Output → `docs/architecture-briefs/2026-05-15-db-pipeline-cadence-policy.md`. Blocks 1920a/b/c until landed.

---

## Sprints 1878–1881 + ARCH-1884 — ACTIVE

**Status:** Active | **Scheduled:** 2026-05-11 | **Theme:** TNB methodology infrastructure foundations

# Goal

## Vision
Stand up the missing data and tool surface that the TNB methodology layers (Cash-Flow Reality, Liquidity, Regime, Source-Tier) require, so forensic analysis sprints (1885, 1886) and the deferred Virtual Capital sprint (1887) have ground truth to compute against.

## In-Flight Sprints
- **1878** — OCF column migration (`schema-financial-reports.ts`) + vnstock cash-flow sync wiring + `compute_accruals(ticker, quarters)` MCP tool. Layer 7.
- **1879** — EFFR–IORB FRED fetcher (`apps/macro-indicators`) + `get_fed_liquidity_spread()` MCP tool. Layer 2.D.
- **1880** — `get_investment_clock_phase()` + `get_pyramid_tier(asset_class)` MCP tools (pure functions over existing macro snapshot). Layer 8.
- **1881** — Source-tier `1|2|3` tag retrofit on ~15 macro/news tool outputs. Layer 9.
- **ARCH-1884** — Architect brief: forensic-analysis host (new microservice vs extend financial-reports). Output → `docs/architecture-briefs/2026-05-12-forensic-analysis-host.md`. Parallel to 1878.

## Queued Behind
- **1882** — VIRA scraper deploy + `get_vira_snapshot()`.
- **1883** — PMI sub-components fetcher upgrade.

## Blocked
- **1885** — Beneish M-Score + Piotroski F-Score (needs ARCH-1884 + 1878).
- **1886** — BTN detectors phase 1: Cookie Jar + Big Bath (needs ARCH-1884 + 1885).

## Deferred
- **1887** — Virtual Capital / related-party graph detector. Separate architect brief required first (see Deferred table in TASKS.md).

## Scope
IN: schema migration, FRED fetcher, 5 new MCP tools, source-tier metadata retrofit, 1 architect brief.
OUT: forensic score computation (1885), BTN detectors (1886), graph analysis (1887), any UI/Cowork agent changes, BCTC reparse work.

## Success Metric
- 1878a: `operating_cash_flow` column present in `financial_reports` schema; vnstock cash-flow sync writes verified end-to-end.
- 1878b: `compute_accruals(ticker, quarters)` returns numeric series for VCB and FPT non-null.
- 1879a/b: EFFR + IORB ingested; `get_fed_liquidity_spread()` returns spread + 30d trend.
- 1880a/b: `get_investment_clock_phase()` returns enum from {Recovery, Overheat, Stagflation, Reflation}; `get_pyramid_tier()` returns valid tier.
- 1881a: ~15 macro/news tool outputs carry `source_tier ∈ {1,2,3}`.
- ARCH-1884: brief committed at `docs/architecture-briefs/2026-05-12-forensic-analysis-host.md` with explicit host pick + rationale.

---

## Sprint 1888 — BACKLOG (renumbered from 1878 SSOT)

**Status:** Backlog | **Scheduled:** TBD post 1878–1881

# Sprint 1888 Goal

## Vision
Eliminate all SSOT conflicts across agent definitions, knowledge files, and registry data so every count and reference resolves to a single authoritative source.

## Scope
11 SSOT anomalies — hardcoded tool/agent/scheduler counts in agent definitions and flows, stale tool-registry.json, agent-roster self-contradiction, wrong session_log paths, inlined task size rules, orphaned AGENT_STARTUP.md reference, undocumented microservice agents. (Originally numbered 1878a–k; renumbered to 1888a–k when 1878 was reassigned to the methodology-infra OCF sprint on 2026-05-11.)

## Success Metric
- Zero hardcoded tool/agent/scheduler counts in agent .md or flow .md files.
- tool-registry.json toolCount matches project-stats.json (132).
- agent-roster.md analysis team count consistent.
- analysisAgentCount in project-stats.json matches agent-roster.md.
- session_log paths resolve to real filenames.
- No orphaned file references.

---

## Sprint 1862 — ACTIVE (carry)

**Status:** Active (4 carry tasks: 1862c-D/E/F/G) | **Last touched:** 2026-05-11

Stabilize data pipeline reliability (vnstock + RSS), eliminate signal noise (dedup), and correct stale system metadata. TNB audit cycles 21-22. **Carry items:** 1862c-D/E (ops-gated, Cloudflare config), 1862c-F (rebuild-gated), 1862c-G (observation-gated post D+E).

---

## Sprint 1860 — DONE

**Status:** DONE | **Closed:** 2026-05-09

BUG channel hygiene: 3 root causes making BUG channel unusable (old messages never deleted, monitoring reports accumulate forever, identical reports filed every cycle). 5 tasks: 2 FIX (recurring bugs) + 3 SPRINT-S.

---

## Sprint 1858 — DONE

**Status:** DONE | **Closed:** 2026-05-08

2 FIX: pollNews all-dark cooldown 4h->24h (1858a) + logVpsPush silent failure fixed with safeLogVpsPush wrapper (1858c).

---

## Historical

Full history: `docs/TASKS_ARCHIVE.md` (Sprints 1777–1848)

---
