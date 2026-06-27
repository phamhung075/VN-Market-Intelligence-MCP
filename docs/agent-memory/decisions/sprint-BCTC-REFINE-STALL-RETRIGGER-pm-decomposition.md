# BCTC-REFINE-STALL-RETRIGGER — PM Task Decomposition

**Date:** 2026-06-27T21:00:00Z  
**Cycle:** dev-team tick :07  
**Agent:** pm  
**Input:** Architect recon-first brief (docs/architecture-briefs/2026-06-27-bctc-refine-stall-retrigger.md), PO dispatch context (cowork ownership guard)  
**Output:** 5 atomic tasks atomized on task_board, handoff files created, .head set to A1, orch-state validators PASS

---

## Decomposition Rationale

**Parent Context:** BCTC refine queue stalled for 20+ days (47 docs, text_status=COMPLETE/refine_status=PENDING). Root causes identified across 3 tracks: (a) cowork CronCreate not re-armed after session restart, (b) VIC discovery-gap (absent from financial_reports), (c) zero observability. Architect recommended 5-task split with explicit sequencing.

**Atomization Approach:**
1. **A1 (OPS, route to PO):** Immediate unblock via cowork re-arm. Unblocks all 47 docs TODAY. Critical guard: PO must verify no parallel cowork dispatcher (double-fire risk per memory feedback_router_cowork_defer_to_live_leader).
2. **A2 (dev-mcp-server, SPRINT-S):** Server-side staleness watchdog. Closes observability gap that enabled 20-day silent stall. Depends on nothing; blocks C1 (for signal-type scaffolding).
3. **B1 (dev-mcp-server, FIX):** VIC RAW-probe + manual reset. Confirms root-cause hypothesis (url_not_found terminal status). XS (~30 min). Unblocks B2.
4. **B2 (dev-vps-crawls, SPRINT-S):** Structural fix for VIC discovery (conditional: re-discovery sweep OR regex fix per B1 findings). Depends on B1.
5. **C1 (dev-mcp-server, SPRINT-S):** Staleness observability wiring (wrapRun logging + signal types). Enables Check 2 of A2 watchdog. Depends on A2.

**WIP Constraint:** WIP=1 active sprint, seq-1 (A1) is the only dispatchable task via .head. Once A1 done, next wave is A2+B1 parallel (different zones within dev-mcp-server: A2 new job, B1 query-only; no file conflict). C1 and B2 follow as dependencies unblock.

---

## PM Decisions (DJ-GATE-1 thru DJ-GATE-6)

### DJ-GATE-1: Architect Ratification
✅ **ACCEPTED as-written.** Architect brief fully ratified. No renegotiation. 5-task split is correct. Zone splits are sound (ops/.claude/, mcp-server/scheduler/, mcp-server/scheduler/, vps-scripts/, mcp-server+agent-flow).

### DJ-GATE-2: Cowork Ownership Guard
✅ **CRITICAL ENFORCEMENT.** Per memory `feedback_router_cowork_defer_to_live_leader`, dev-team router MUST NOT blind-arm cowork crons. A1 routed to `owner: "po"` with explicit note: "PO verifies no parallel cowork dispatcher is already armed (double-fire risk) before executing /cron-cowork-team re-arm."

**Verification path:** PO checks (1) cron_job_runs for recent refine_bctc_md runs, (2) WORK channel for recent refine logs, (3) confirms no parallel session owns dispatcher, (4) runs skill. This is non-delegable to dev-team.

### DJ-GATE-3: Board Mutation
✅ **ATOMICALLY APPLIED.** New sprint BCTC-REFINE-STALL-RETRIGGER created in active_sprints with 5 tasks (status=TODO). .head updated: active_task_id=BCTC-REFINE-A1, next_agent=po, next_action describes cowork verification + re-arm. Applied via orch-apply.sh (validators PASS, 74 pre-existing SHG warnings only).

### DJ-GATE-4: Handoff File Creation
✅ **ALL 5 CREATED.** Handoff files written:
- `docs/handoffs/BCTC-REFINE-A1.md` (PO action, cowork re-arm, AC-1..AC-5, critical guard)
- `docs/handoffs/BCTC-REFINE-A2.md` (dev-mcp-server, watchdog job, Check 1+2, unit tests)
- `docs/handoffs/BCTC-REFINE-B1.md` (dev-mcp-server, VIC probe+reset, 1 SQL query, AC-1..AC-5)
- `docs/handoffs/BCTC-REFINE-B2.md` (dev-vps-crawls, conditional structural fix, depends on B1 findings)
- `docs/handoffs/BCTC-REFINE-C1.md` (dev-mcp-server, staleness wiring, wrapRun+signal-types, depends on A2)

Each file includes TLDR, AC, knowledge needed, files to read/modify/create, dependencies, risks, and done-verified gates.

### DJ-GATE-5: Sequencing & WIP Compliance
✅ **SEQUENCING:** Seq-1=A1 (unblock); Seq-2=(A2 || B1) parallel after A1 done; Seq-3=(C1 after A2, B2 after B1).
✅ **WIP=1:** .head.active_task_id = BCTC-REFINE-A1. Only ONE task in active dispatch loop. Router will move .head to next dispatchable task after A1 completes (expected: A2+B1 wave).
✅ **NO PARALLEL OVER-DISPATCH:** A2+B1 both dev-mcp-server but disjoint files (A2 new job file, B1 query-only, different zones in brief). No file conflict; parallel isolation OK.

### DJ-GATE-6: Risk Encoding
✅ **RISKS DOCUMENTED IN HANDOFFS:**
- **Risk-1 (HIGH, A1):** Re-arm alone is band-aid. Without A2+C1 watchdog, future session restart re-stalls silently. A2+C1 are definitif closes (documented in A1 handoff).
- **Risk-2 (MEDIUM, B1):** VIC url_not_found is terminal/no-auto-retry. B1 manual reset is only same-day path. B2 structural fix required.
- **Risk-3 (MEDIUM, A2):** Check 2 (cowork drain-lapse detect) requires C1 to land. Interim: use heuristic if C1 delays.
- **Risk-4 (LOW, drain speed):** 47 docs ÷ 2 slots/day ≈ 23 days. Router may accelerate with manual refine invocations (reset=true idempotent).

---

## Task Identity & Acceptance Criteria Summary

### **task-id: BCTC-REFINE-A1** 
- **Owner:** po (cowork ownership verification non-delegable)
- **Type:** OPS
- **Size:** XS
- **Zone:** .claude/
- **Seq:** 1 (unblock all downstream)
- **AC:** Verify cowork ownership + re-arm via skill + wait next slot + probe refine_status flipping
- **Done-Verified:** AC-1..AC-5 checked (confirmed no conflict, re-armed, enabled, cron_job_runs logs refine, live get_bctc_pending_refine shows status changes)

### **task-id: BCTC-REFINE-A2**
- **Owner:** dev-mcp-server
- **Type:** SPRINT-S
- **Size:** S (~2h)
- **Zone:** apps/mcp-server/src/scheduler/financial-reports/
- **Seq:** 2 (parallel with B1)
- **AC:** Job implements Check 1+2, domain signal types extended, jobs.ts wiring, unit tests
- **Done-Verified:** AC-1..AC-5 verified (unit tests pass, live rebuild, WORK alert fires when tested with aged data)

### **task-id: BCTC-REFINE-B1**
- **Owner:** dev-mcp-server
- **Type:** FIX
- **Size:** XS (~30 min)
- **Zone:** apps/mcp-server/src/scheduler/financial-reports/
- **Seq:** 2 (parallel with A2)
- **AC:** RAW-probe VIC row, confirm status + attempts, reset to pending/0, re-probe after enricher cycle
- **Done-Verified:** AC-1..AC-5 verified (probe executed, reset confirmed in DB, enricher re-attempted, findings documented)

### **task-id: BCTC-REFINE-B2**
- **Owner:** dev-vps-crawls
- **Type:** SPRINT-S
- **Size:** S (~2h)
- **Zone:** vps-scripts/
- **Seq:** 3 (after B1)
- **AC:** Conditional per B1 findings (re-discovery sweep OR regex fix OR documented)
- **Done-Verified:** AC-1..AC-5 verified per confirmed hypothesis (sweep runs + enricher picks up OR regex tests pass + manual discovery finds URL OR findings documented)

### **task-id: BCTC-REFINE-C1**
- **Owner:** dev-mcp-server
- **Type:** SPRINT-S
- **Size:** S (~2h)
- **Zone:** apps/mcp-server/src/scheduler/financial-reports/ + docs/agents/refine_bctc_md/
- **Seq:** 3 (after A2)
- **AC:** wrapRun integrated in flow, signal types extended, unit tests, live rebuild + manual test
- **Done-Verified:** AC-1..AC-5 verified (integration merged, compile clean, unit tests pass, live rebuild, WORK alert fires on old cron_job_runs timestamp)

---

## Key PM Decisions (No Negotiation)

1. **COWORK OWNERSHIP GUARD IS LOAD-BEARING.** A1 must route to PO, not blind dev-team dispatch. Memory feedback_router_cowork_defer_to_live_leader is canonical.

2. **ACCEPTED 5-TASK SPLIT AS ARCHITECT WROTE IT.** No renegotiation. Track (a)+(b)+(c) are the right grouping.

3. **WIP=1 CONSTRAINT ENFORCED.** Only A1 in active dispatch loop. Router will sequence next wave after A1 done.

4. **DONE-VERIFIED GATES ARE LIVE-PROBE, NOT BUILD-GREEN.** Each task's done-verified requires raw probing (querying DB, checking cron_job_runs, running manual tests, observing live status changes) — not just passing tests.

5. **RISKS DOCUMENTED FOR VISIBILITY.** Risk-1 (band-aid) drives A2+C1 as definitif closes. Risk-2 (terminal status) acknowledged with manual reset as only path. No surprises post-deployment.

---

## Dispatch Readiness

✅ **BOARD STATE:** BCTC-REFINE-STALL-RETRIGGER active sprint created, 5 tasks TODO, .head set to A1.
✅ **HANDOFFS:** All 5 files written, uploaded to docs/handoffs/.
✅ **VALIDATORS:** orch-state passed (Stage 0 + Stage 1), coherence warnings pre-existing.
✅ **NEXT ACTION:** PO to execute A1 (cowork re-arm after ownership verification). After A1 done, router sequences A2+B1 wave.

---

## Related Documents

- **Architect brief:** docs/architecture-briefs/2026-06-27-bctc-refine-stall-retrigger.md (full 3-track root cause + 5-task split)
- **Handoff files:** docs/handoffs/BCTC-REFINE-{A1,A2,B1,B2,C1}.md (AC + implementation guidance per task)
- **Memory:** feedback_router_cowork_defer_to_live_leader.md (cowork ownership guard, non-delegable to dev-team)
- **Board:** docs/data/orch/orch-state.json .task_board.active_sprints (canonical SSOT)
