# PO Notebook

## Cycle 2026-05-27T20:37:53Z — SELF-IMPROVE-GATE kickoff (gated self-improvement loop, design-first)

**Input:** EXPLICIT user-approved DIRECTION (verbatim): "po approve, all automate, need thinking before
approve anything." = automate the self-improvement loop, PO holds the routine approval seat (not the user),
PO MUST red-team each proposal before approving — written critique mandatory, NO rubber-stamping.

**ACTION: self-initiated Sprint SELF-IMPROVE-GATE.** Authored `docs/SPRINT_GOAL.md § SELF-IMPROVE-GATE`
+ `docs/TASKS.md § SELF-IMPROVE-GATE` (5 tasks: SIG-DESIGN→SIG-PO-GATE→SIG-IMPL-MD/SIG-IMPL-GATE→SIG-EXIT)
+ handoff `docs/handoffs/TASK_SELF-IMPROVE-GATE.md`. Phase 1 = DESIGN BRIEF ONLY (zero code).

**Locked at kickoff (settled scope, not architect choices):**
- THREE LANES fixed: (a) PO-approve `.md` [default, →agent-father]; (b) auto-implement ONLY behind a
  PROVEN gate [hard/ungameable signals, →dev-team+QA]; (c) NEVER auto-close → human for subjective
  comprehensibility + irreversible actions + ANY change to the gate/audit logic itself.
- PO critique-before-approve = HARD gate (break / false-green+silent-swallow / gameability / host-load).
- Proven-gate = inject-a-violation-confirm-red, NOT asserted (feedback_fence_false_green).
- Host-bounded: reuse existing agents only (system-auditor detect, agents-architect propose, agent-father
  `.md`, dev-team code); NO new always-on cron/agent without a PO-signed RAM+disk+tick budget
  (project_host_memory_panic / project_enospc_blocker).
- ANCHOR (binding): plain-VN MARKET fix passed tran-ngoc-bau audit yet failed user ("too complicated") —
  self-audit can't see comprehensibility → lane-c FOREVER. Brief must name this blind spot.
- Reconcile with PAUSED Sprint 1948 shadow-mode (improve_check_log / degradationRules / orchestrator job).

**Docs touched (UNSTAGED — main terminal commits):** SPRINT_GOAL.md (+SELF-IMPROVE-GATE block at top),
TASKS.md (+sprint block), handoff created. NO code, NO `.md` agent/flow edits this cycle.

**NEXT:** dispatch agents-architect to write `docs/architecture-briefs/2026-05-27-gated-self-improvement-loop.md`.

## Carry-over
- **SIG-DESIGN READY** → agents-architect writes brief → returns to SIG-PO-GATE (PO red-teams the DESIGN
  itself, critique before verdict). Then lane-(a)/(c) `.md` → agent-father; lane-(b) code → dev-team+QA.
  SIG-EXIT ARMED until loop demonstrated end-to-end (lane-b proven red on injected violation; lane-c escalates).
- NEWS-CMD-QA in-flight (prior cycle BATCH) → NEWS-CMD-FIX (only if CHANGES_REQUESTED, dev-mcp-server) else
  NEWS-CMD-EXIT (po). Goal ARMED until USER confirms reads usefully (DoD #7) — main terminal owns verbal G9.
- PEK-INTEGRATE goal ARMED until USER verbal G9; PEK-MULTIPAGE re-deploy+QA closes the page-coverage defect
  (ops --no-cache rebuild + DELETE stale layout units + re-extract 12 → qa revised 4-gate, md_len>=1000).
- CHEF-ATTN (BA spec, READY, apps/mcp-server zone) HELD behind NEWS-CMD — same zone, avoid QA churn.
- TNB F9 = cowork-lane + data-blocked (BCTC Q1 unfiled), NOT a dev sprint. F3 PMI / F4 VIRA = backlog
  candidates, lower than NEWS-CMD in reliability→UX order.
- CW-DISPATCH-STEP47-BOOTSTRAP-ENUM (## ops) = dev-mcp-server backlog (add "cowork-team" to
  get_cycle_bootstrap enum); ZERO blocker (cowork falls back).
- Channel audit (MARKET/WORK/BUG via gateway) still owed → main terminal next cron tick (PO has no call_tool).
- All files left UNSTAGED except PO doc edits (pipeline-state.json, tnb ACK, dashboard READ, this notebook).

## 2026-05-27T20:47Z — SIG-PO-GATE (Sprint SELF-IMPROVE-GATE) — gated self-improvement loop
- VERDICT: APPROVE-WITH-CONDITIONS. Red-teamed brief 2026-05-27-gated-self-improvement-loop.md against LIVE
  repo (read all 5 edit-target files + SPIKE_1947, not just the brief). Critique written BEFORE verdict in
  handoff TASK_SELF-IMPROVE-GATE.md (5 axes, no rubber-stamp).
- PASS clean: host-load (cron = already-budgeted 1948 selfImproveOrchestratorJob 0 9 * * *, inside mcp-server
  process, no new Docker/agent/tick — SPIKE Option-B dedicated agent was REJECTED, brief honors it); plain-VN
  comprehensibility named lane-C FOREVER with binding tran-ngoc-bau anchor; lane-C first-match-wins barrier;
  lane-B gate written as inject-violation-confirm-red not asserted.
- 3 real findings → 5 conditions (NOT reject — none touch lane-C / human-only product call):
  C-1 EDIT-4 input-contract mismatch: edit.md takes structured agent_name+change_description but proposal
  "Proposed Change" is free prose → add structured target_agent+target_files[]; fail-loud if absent.
  C-2 status=DONE != success-signal-met (lane-A false-green) → DONE only after weakness re-verified.
  C-3 add 5th mandatory critique field "lane-C-in-disguise" (gameability rests on PO catch, make it explicit).
  C-4 per-path GATE-PROOF, NOT one global SELF_IMPROVE_AUTO_DISPATCH (silent-swallow serial bugs).
  C-5 D-IMPROVE must fail-loud-SKIP bad candidate, never abort Tier-2 freshness sweep.
- ROUTING: SIG-DESIGN done. agent-father signal set unblocked (conditions embedded in JSON). NEXT=agent-father
  (SIG-IMPL-MD, honor C-1/C-2/C-3/C-5). SIG-IMPL-GATE → dev-team chain AFTER, QA owns C-4. RETURN: continue.
- All writes UNSTAGED (handoff, signal JSON, this notebook) — main terminal commits to serialize.
