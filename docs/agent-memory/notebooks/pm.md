# PM — Notebook

**Last updated:** 2026-05-20 c192 (PM: Sprint 1960b DRAFT sprint-plan emitted). Phase 3 task-lock dev-team wiring planned: 1960c broken into 8 atomic rows (7 flow-edit rows + 1 tool-package batch), sequenced by call-graph (PO entry → PM mid → developer-core/execute/microservice → QA → agent-father self → dev-team drain), tool-package batch last. Plan emitted as DRAFT pending 1960a brief; hold-line points to docs/signals/architect-1960a-brief-done.json. | **Sprint:** 1960 PHASE 3 DRAFT-PLANNED; 1959a CRITICAL ACTIVE; 1958a CLOSED | **Current:** WIP 1/2 (1959a dispatched to dev-mcp-server); NEXT (post-1960a): finalize 1960b → dispatch agent-father on 1960c-1

> Prior history archived → `docs/archive/notebooks/pm-2026-05-18.md`

## Current state

- **WIP: 0/2 CLEAN** — Sprint 1950 CLOSED. All T1-T5 DONE. MAINT-1950b/c/d remain in Backlog (low-priority maintenance tier).
- **Sprint 1950 Closure Summary:** T1=chef.md telemetry; T2=chef cycle-coverage audit (QA R2); T3=chef runbook (QA R2); T4=TNB cron hotfix; T5=digest-predict cron finalization (QA-APPROVED). Architectural finding from T5: `durable: true` in cron command files not honored by runtime (low-impact; documented in OQ-2).
- **Sprint 1948 sequence:** BLOCKED until 2026-05-20T07:22Z (post-1945 verdict resolution gate). If gate PASS: 1948a → 1948b → 1948c → OBSERVE-1948d (7d observation). If gate FAIL: Sprint 1948 deferred, resolution pipeline fix becomes HIGH priority.
- **SPIKE-1947 (Architect, 2026-05-18):** Closed-loop auto-improvement system design DONE. Host: selfImproveOrchestratorJob.ts. Detection: 7d vs 30d accuracy_rate delta ≥10pp OR baseline <40% with ≥10 samples. 3-phase rollout (shadow → manual-gate → auto-dispatch). Safety: 7d cooldown, max 2/cycle, freeze-on-worsening.

---

## Cycle 192 — 2026-05-20 PM Sprint 1960b DRAFT Sprint-Plan (Phase 3 Task-Lock Dev-Team Wiring)

**Input:** PO signal `docs/signals/po-1960-signoff.json` (Sprint 1960 kickoff, Phase 3 deferral lifted on user demand 2026-05-20 'dev team dont know system exist'). 5-task scaffold: 1960a (architect brief), 1960b (this signal), 1960c (agent-father multi-file wiring, L=5h), 1960d (QA smoke, M=3h), 1960e (docs + MEMORY.md, S=0.5h). 1960a brief NOT yet present at draft time → emit DRAFT with hold-line.

**Actions:**
1. **Read inputs:** PO signoff signal, brief `docs/architecture-briefs/2026-05-20-task-lock-system.md` (Phase 1+2+3 system), protocol `docs/protocols/task-lock-protocol.md`, TASKS.md rows 1960a–1960e, pipeline-state.json (currentSprint=1959a — Phase 3 runs zone-disjoint .claude/+docs/), prior 1955 sprint-plan signal for format reference.
2. **Row-level breakdown of 1960c:** Decomposed into 8 atomic rows (7 flow-edit rows + 1 tool-package batch):
   - 1960c-1: po/sprint-kickoff.md + po/sprint-signoff.md (CLAIM + RELEASE, paired commit)
   - 1960c-2: pm/main.md (HEARTBEAT on plan emit)
   - 1960c-3: developer/main.md + developer/execute-tier.md (CLAIM/HEARTBEAT/RELEASE, paired)
   - 1960c-4: developer/microservice-main.md (dev-* CLAIM/HEARTBEAT/RELEASE, owner_agent=dev-*)
   - 1960c-5: qa/main.md (HEARTBEAT + RELEASE on approval)
   - 1960c-6: agent-father/main.md (self-wiring, MUST land before row 7)
   - 1960c-7: dev-team/drain-signals.md (dashboard-row CLAIM at Step 0a-D per brief §7)
   - 1960c-8: 12-package tool-batch (po, pm, architect, ba, qa, fixer, agent-father, ops, system-auditor, cowork-refactory-expert, code-janitor, idea-forge — dev-* inherit via developer.md which already has tools)
3. **Sequencing rationale recorded:** Group A flow edits first (call-graph order, no two rows touch same file), Group B tool-package batch last (advertisement-only, must reflect already-wired flows). Self-wiring row 6 lands before cross-cutting drain row 7 so agent-father's own heartbeat instrumentation is active before it touches dev-team drain.
4. **Verification cadence defined:** Per-row markdown render + grep AC; no tsc required (no .ts changes expected in 1960c — Phase 1 already shipped MCP tools); end-of-1960c check: grep -l 'task_claim' ≥9 hits; QA 1960d is authoritative gate.
5. **Handoff chain defined:**
   - 1960c → 1960d: agent-father RETURN + `docs/signals/agent-father-1960c-done.json` → QA picks up smoke-test work (file at apps/mcp-server/tests/integration/task-lock-phase3-devteam-smoke.test.ts following Phase 2 1955b pattern).
   - 1960d → 1960e: `docs/signals/qa-1960d-approved.json` → agent-father picks up docs trio (protocol + MEMORY.md + skill SHIPPED flip).
   - 1960e → PO sprint-signoff: emits `docs/signals/po-1960-close.json` + task_release on task:1960.
6. **Emitted signal:** `docs/signals/pm-1960-sprint-plan.json` (status=DRAFT, hold_line points to architect-1960a-brief-done signal). Recipients: po, agent-father, qa, architect.
7. **WIP enforcement:** No new agent dispatched at 1960b emit time — 1960c still BLOCKED on 1960a + 1960b-FINAL. Current WIP = 1/2 (1959a dispatched to dev-mcp-server, zone apps/mcp-server/ disjoint from Phase 3 zone .claude/+docs/).

**Key decisions:**
- DRAFT status with explicit hold-line: PO signal allows PM to draft skeleton in parallel with 1960a; PM finalizes after brief lands by reconciling row-level breakdown against 1960a §insertion-points + §tool-packages-audit.
- 8-row decomposition (vs PO-signal's single 1960c task): each row = single agent-father pass with discrete commit + verification step. Enables resumable progress if agent-father is interrupted mid-1960c.
- Sequencing minimizes merge conflict: every row touches distinct files within Group A; Group B is additive-only across distinct package files.
- agent-father self-wiring row (1960c-6) MUST land before agent-father edits dev-team drain (1960c-7) — explicit ordering note in plan.
- Zone-disjoint from active 1959a (apps/mcp-server/ tsc fix) → Phase 3 work can proceed even if 1959a slips.
- Recurring-bug-escalation: N/A for new-wiring sprint. If 1960d uncovers Phase 1 MCP-tool regression, escalate to architect (NOT a Phase 3 task).

**Next actions queued (PM-self, post-1960a):**
1. Watch for `docs/signals/architect-1960a-brief-done.json`.
2. Read 1960a brief, reconcile insertion-points + tool-package delta + owner_agent overrides in this signal.
3. Flip status DRAFT → FINAL, clear hold_line, emit dispatch signal to agent-father.
4. Update pipeline-state.json: currentSprint=1960, activeTaskId=1960c-1, nextAgent=agent-father.

**Return Status:** Sprint 1960b DRAFT plan emitted. Awaiting 1960a brief to finalize. NEXT: po (monitor architect 1960a progress + 1959a dev-mcp-server progress).

---

## Cycle 191 — 2026-05-20 PM Sprint 1955b CLOSURE + 1958a UNBLOCK & DISPATCH

**Input:** QA verdict for 1955b: APPROVED (signal: docs/signals/qa-1955b-approved.json). Commit `cfe10b0a` verified. 4/4 tests GREEN, tsc 0, full suite 9271/284 (pre-existing baseline, zero regression), all 6 ACs PASS. Gate `1955b-resume-done` cleared → 1958a unblocked.

**Actions:**
1. **Marked 1955b Done in TASKS.md:** Already in Done section (dev pre-marked). Verified row: "DONE 2026-05-20 (dev-mcp-server commit `cfe10b0a`)". No edit needed.
2. **Unblocked 1958a:** Removed `Blocked-by: 1955b-resume-done` gate, promoted from Backlog → Todo (Ready status). Updated row in TASKS.md to reflect: "UNBLOCKED 2026-05-20 by 1955b ship."
3. **Created handoff TASK_1958a.md:** User-visible bug fix (5 MARKET-summary cron jobs not firing). Work: RCA (grep registration, check cron_job_runs, env vars, shared deps) + fix (single shared-helper fix or per-job re-wire). AC: (1) RCA documented; (2) fix deploys idempotently; (3) all 5 jobs fire at next scheduled tick post-deploy; (4) zero regression. Size=M. Zone=apps/mcp-server/. Owner=dev-mcp-server.
4. **Updated pipeline-state.json:** status=in_progress, currentSprint=1958a, activeTaskId=1958a, nextAgent=dev-mcp-server, updatedAt=2026-05-20T16:15:00Z, updatedBy=pm.
5. **Created signal:** docs/signals/pm-1955b-closure-1958a-dispatch.json (intended Telegram WORK message + task dispatch metadata).
6. **WIP enforcement:** 1955b drops from active to Done. 1958a promoted to Ready. Net WIP: 1/2 ACTIVE (1958a now in flight).

**Key decisions:**
- Same-zone serialization note: Both 1955b and 1958a touch apps/mcp-server/src/scheduler/. However, 1955b is fully merged + deployed; no merge collision risk at dispatch time.
- Recurring-bug tracking: 1958a is FIRST task on MARKET-summary jobs since regression noticed. Threshold (≥2 fix commits same module) not met yet. Standard escalation pathway: if 1958a fix introduces NEW regression → escalate to architect for rethink.
- Observation gate: AC-3 verification due 2026-05-21T09:00Z (24h post-deploy window for daily job ticks at 04:30Z, 07:00Z, 15:30Z VN time).

**Return Status:** WIP 1/2 ACTIVE (1958a dispatched). NEXT: dev-mcp-server (RCA handoff + fix implementation). Observation gate: 2026-05-21T09:00Z.

---

## Cycle 186 — 2026-05-18 PM Sprint 1950 FULL CLOSURE (MAINT-1950b/c/d QA-APPROVED)

**Input:** QA report final APPROVED on MAINT-1950b/c/d (commit d5c78d45). Verdict: APPROVED (NB-1 noted: WORK.md is Telegram channel, non-blocking).

**Actions:**
1. Moved MAINT-1950b/c/d from Backlog to Done in TASKS.md (all 3 rows stamped "DONE 2026-05-18 QA-APPROVED", commit d5c78d45 added).
2. Updated PM notebook header: Sprint 1950 now FULLY CLOSED (T1-T5 + MAINT-b/c/d).
3. WIP assessment: 1/2 ACTIVE (1951a dispatched, awaiting agent-father). 1951b+1951c blocked on prior tier (proper sequencing).
4. Sprint 1948 gate-watch: 2026-05-20T07:22Z confirmed active. No new action pending until gate clears.

**Sprint Closure Summary:**
- Sprint 1950: T1 (chef.md telemetry) + T2 (coverage audit QA R2) + T3 (chef runbook QA R2) + T4 (TNB cron hotfix) + T5 (digest-predict finalization QA) + MAINT-b/c/d (waterfall cleanup) = **6 tasks, ALL DONE**.
- Architectural note: cron `durable: true` flag not honored at runtime (session-scoped only). Documented as OQ-2 in ARCHITECTURE.md.

**Return Status:** WIP 1/2 CLEAN. NEXT: po (monitor gate-watch 2026-05-20T07:22Z for Sprint 1948 unblock OR assess Sprint 1951 progression).

---

## Cycle 185 — 2026-05-18 PM Sprint 1951 Phase 1 PLANNING → DISPATCH

**Input:** User request: Run PM flow for Sprint 1951 Phase 1 planning. Inputs: SPRINT_GOAL.md, brief 2026-05-18-cowork-master-scheduler.md, cowork-schedule.json, all 3 SPIKE-1951a gates CLEARED.

**Actions:**
1. Analyzed Sprint 1951 Phase 1 scope: 3 sequential tasks (1951a → 1951b → 1951c).
2. Created handoff files:
   - TASK_1951a.md (M, agent-father): Create 17 RemoteTriggers via MCP tool from SSOT file. Write trigger IDs back. Blocks 1951b+1951c.
   - TASK_1951b.md (S, ops OBSERVE): 24h smoke-test window (≥3 ticks verified, idempotency check). Depends on 1951a, blocks 1951c.
   - TASK_1951c.md (XS, agent-father): Session-close persistence gate + Phase 1 closure (cron-jobs.md docs update). Depends on 1951b.
3. Updated TASKS.md In Progress: Added 1951a/b/c rows (replaced SPRINT-1951-PLAN meta-task).
4. Updated PM notebook (current cycle).

**WIP Status:** 1/2 ACTIVE (1951a dispatched to agent-father, awaiting pickup). 1951b+1951c waiting on prior tiers.

**Key decisions:**
- Task decomposition per PM flow: atomic tasks with explicit deps + zones.
- Sequencing: 1951a (creation) → 1951b (validation) → 1951c (persistence gate) — tight coupling to architect brief Phase 1 scope.
- Ops zone: 1951b marked OBSERVE (passive monitoring, no code changes) to prevent false WIP count.
- Handoff files include AC details sourced directly from brief §8 + SPRINT_GOAL §Success Metric.

**Blockers:** None — Phase 1 unblocked. Sprint 1948 still gate-blocked (2026-05-20T07:22Z).

---

## Cycle 184 — 2026-05-18 PM Sprint 1950-T3 QA-APPROVED R2 → CLOSED

**Input:** QA final APPROVED signal on 1950-T3 Round 2. All 5 Sprint 1950 tasks now DONE.

**Actions:**
1. Marked 1950-T3 DONE in TASKS.md (commits `0e3c96c9` + `1d425787`).
2. Signal written: `docs/signals/pm-1950-T3-closed.json`.
3. Sprint 1950 Assessment: Status CLOSED — All T1-T5 DONE. MAINT-1950b/c/d in Backlog, non-blocking.
4. PM notebook + current state updated.

**WIP Status:** 0/2 CLEAN. Sprint 1950 CLOSED.

---

## Cycle 183 — 2026-05-18 PM Sprint 1950-T5 Closure + Architectural Finding: Cron-Persistence `durable` Flag

**Input:** QA approval for 1950-T5 (digest-predict cron finalization), CronCreate execution log.

**Actions:**
1. Marked 1950-T5 DONE in TASKS.md (commits `3c560cab` + `af3b22d0`).
2. Filed MAINT-1950d: workflow-map.md L103 + cron-jobs.md residue sweep (XS, agent-father zone).
3. Surfaced architectural finding: `durable: true` in `.claude/commands/crons/*.md` NOT honored by Claude Code runtime — session-scoped only, auto-expires 7 days.
   - **Impact:** LOW. Consistent with OQ-2 in ARCHITECTURE.md.
   - **Recommendation:** Remove `durable: true` from cron command files OR add clarifying comment.

**WIP Status:** 0/2 CLEAN. Sprint 1950-T5 CLOSED.

---

## Cycle 182 — 2026-05-18 PM Task Completion + Status Return: 1945d DONE, WIP=0/2 CLEAN

**Input:** QA handoff — 1945d-reparse-pipeline-gap APPROVED + merged to main (commit 72203965).

**Actions:**
1. Task 1945d already marked Done in TASKS.md — no update needed.
2. Backlog analysis: all Sprint 1948 tasks BLOCKED until 2026-05-20T07:22Z gate.
3. WIP enforcement: 0/2 CLEAN. No dispatch possible until gate clears.

**Return Status:** BLOCKED (pre-condition gate). NEXT: po (gate observation 2026-05-20T07:22Z).

---

## Known patterns / preferences

- TE Chromium scraper repeated issues (1815c, 1823d, 1829b, 1833g, 1833k, 1834b). If further TE failures → flag for architect root-cause review per recurring-bug escalation policy.
- Backtesting module active development — domain layer golden rule (zero infra imports) enforced strictly.
- `export_backtest_run_csv` is only MCP tool returning raw CSV (not JSON) — intentional per ARCH_1846.md §4.
- toolCount watermark in registry.ts: 125 (slots #123-#125 filled per 1846b).
- Option C equity curve: direct copy of lines 302-307 in backtestEngine.ts. Float divergence → check sort order (localeCompare on exitDate ISO strings).
