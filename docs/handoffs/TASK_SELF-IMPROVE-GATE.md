# TASK_SELF-IMPROVE-GATE — Gated Self-Improvement Loop

Sprint SELF-IMPROVE-GATE. Goal SSOT: `docs/SPRINT_GOAL.md § Sprint SELF-IMPROVE-GATE`. Tasks: `docs/TASKS.md § Sprint SELF-IMPROVE-GATE`.

## [PO] Kickoff Context — 2026-05-27T20:37:53Z

**User-approved direction (verbatim):** "po approve, all automate, need thinking before approve anything."

**What this sprint builds:** the governance loop by which the system auto-improves its OWN flows AND tools — system-auditor/agents-architect auto-detect a weakness → auto-generate an improvement proposal → PO deliberates (mandatory written critique) → approved proposals flow to agent-father (`.md`) or the dev-team chain (code/tools, behind QA) → behind a PROVEN gate. PO is the routine approval authority; the human is reserved for the lane-c blind spot.

**FIRST ACTION (current task SIG-DESIGN, owner agents-architect):** write the architecture brief. DESIGN ONLY — zero code, zero `.md` edits outside the brief itself.

### Brief MUST formalize (the 9 required sections)
1. **THREE LANES** with a crisp classification rule + worked examples from real system memory:
   - (a) AUTO-PROPOSE + PO-APPROVE — flow/agent `.md` PO can judge. DEFAULT lane. Impl: agent-father.
   - (b) AUTO-IMPLEMENT BEHIND A PROVEN GATE — ONLY where the success signal is hard + ungameable (tests pass / lint / dedup). The gate must be PROVEN live by injecting a deliberate violation and confirming it goes red (`feedback_fence_false_green`: lint exit 0 != enforces). Impl: dev-team chain WITH QA.
   - (c) NEVER AUTO-CLOSE → escalate to user — subjective quality (comprehensibility), irreversible actions, AND any change to the gate/audit logic itself (the system must NOT rewrite its own success criteria).
   - Worked examples: stale-doc = lane-a; missing-test-with-proven-gate = lane-b; plain-VN-comprehensibility = lane-c.
2. **DETECT→PROPOSE→DELIBERATE→IMPLEMENT pipeline on EXISTING agents ONLY** — system-auditor (detect, via DASHBOARD/signal-dashboard), agents-architect (emit proposal doc), PO (deliberation gate), agent-father (`.md` impl) / dev-team po→ba→architect→pm→dev-*→qa (code impl). NO new orchestrator agent, NO new always-on cron without a budgeted exception.
3. **PROPOSAL artifact** — exact file format + location (suggest `docs/improvement-proposals/<id>.md`) with required fields: weakness, evidence, proposed change, lane, success-signal, rollback.
4. **PO CRITIQUE gate** — mandatory red-team fields recorded BEFORE the verdict, auditable: (i) what could break, (ii) false-green / silent-swallow risk, (iii) is the success signal gameable, (iv) host-load impact. An approval without a recorded critique = protocol violation.
5. **PROVEN-GATE proof procedure (lane-b)** — inject a deliberate violation → confirm the gate goes red → only then trust it. "Tests pass / lint exit 0" is NOT proof (`feedback_fence_false_green`, `feedback_silent_swallow_serial_bugs`).
6. **HOST-LOAD budget rule** — no new always-on agent/cron without a line-itemed RAM+disk+tick budget; prefer riding existing cron ticks (`project_host_memory_panic` kernel-panic, Docker 8GB cap, `project_enospc_blocker`).
7. **ESCALATION boundary** — how lane-c reaches the human; why the loop can NEVER self-promote a lane-c item into lane-a/b.
8. **COMMIT-SAFETY note** — serialized commits, no `-A`, main terminal / commit-mutex owns commit (`feedback_concurrent_commit_race`, `feedback_merge_gate_cherrypick_serialize`).
9. **IMPLEMENTATION SEQUENCE proposal** — which flow/agent `.md` each phase touches + which (if any) phase needs code. Per the doc-ownership rule, signal agent-father for any `.md` the brief proposes to edit.

### Binding constraints (locked by PO — do NOT re-open)
- Three lanes are FIXED; the brief formalizes boundaries + routing, it does not drop a lane.
- Reuse existing agents only; any new cron needs an explicit PO-signed host-load budget.
- **Anchor case study (binding):** today's plain-VN MARKET fix PASSED the internal tran-ngoc-bau audit (analytically rigorous) yet FAILED the user ("too complicated to understand"). Self-audit structurally cannot detect subjective comprehensibility → that axis is lane-c FOREVER. A design that lets the loop self-certify comprehensibility is REJECTED.
- **Reconcile with prior work:** Sprint 1948 (PAUSED) was closed-loop auto-improvement Phase-1 shadow-mode (`improve_check_log` schema, `degradationRules.ts`, `selfImproveOrchestratorJob.ts`, 7d shadow gate) — see `docs/data/project-stats.json#previousSprint`. The brief SHOULD reconcile with / absorb that shadow-mode design rather than reinvent it; note where this governance loop layers on top of (or supersedes) it.
- Tool/code self-improvement ALWAYS routes through the QA gate — never a shortcut.

### Return
Brief → `docs/architecture-briefs/2026-05-27-gated-self-improvement-loop.md`. Return to the PO deliberation gate (SIG-PO-GATE). Append a `[Architect] Design Record` section to this handoff before returning.

---

## [Architect] Design Record — 2026-05-27T20:41:55Z

**Brief authored:** `docs/architecture-briefs/2026-05-27-gated-self-improvement-loop.md`
**Signal dropped:** `docs/signals/gated-self-improvement-loop-20260527.json` → agent-father (BLOCKED on SIG-PO-GATE)

**Key decisions in the brief:**

1. Sprint 1948 shadow-mode substrate (SPIKE_1947) is RECONCILED and absorbed: `selfImproveOrchestratorJob.ts` becomes the lane-b detection engine. This brief adds the governance wrapper on top — not a reinvention.

2. Five concrete flow edits (EDIT-1 through EDIT-5) named with exact file paths and exact steps:
   - EDIT-1: `docs/agents/system-auditor/flow/main.md` — add D-IMPROVE step to Tier-2 sweep
   - EDIT-2: `docs/agents/agents-architect/flow/main.md` + `handlers.md` — add IP-review dispatch branch
   - EDIT-3: `docs/agents/po/flow/triage-signals.md` — add `improvement_proposal` routing row with mandatory critique gate
   - EDIT-4: `docs/agents/agent-father/flow/main.md` dispatch table — add `improvement_approved_md` route
   - EDIT-5: `docs/agents/dev-team/flow/drain-signals.md` routing table — add `improvement_proposal_lane_b` row

3. No new agents, no new Docker services, no new always-on cron beyond the already-budgeted 1948 `selfImproveOrchestratorJob` (0 MB incremental RAM, inside existing mcp-server process).

4. PO critique gate is enforced by triage-signals.md rejecting proposals where PO-Critique section is empty — not by convention, by the flow step itself.

5. Lane-c comprehensibility blind spot is explicitly named and routed: the loop detects it, writes a WORK Telegram, stops. The human decides. No automated path out.

6. Proven-gate procedure (§5) is QA's acceptance criterion for SIG-IMPL-GATE, not an assertion.

**SIG-IMPL-MD scope:** EDIT-1 through EDIT-5 in the brief §9 Phase 1 (flow `.md` files only — agent-father's domain).
**SIG-IMPL-GATE scope:** Phase 2 code work (Sprint 1948 substrate, extended with proposal-doc emit). Zone: `apps/mcp-server/`.

**NEXT:** SIG-PO-GATE deliberation.
