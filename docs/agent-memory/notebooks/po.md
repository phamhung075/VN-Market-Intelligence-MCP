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
