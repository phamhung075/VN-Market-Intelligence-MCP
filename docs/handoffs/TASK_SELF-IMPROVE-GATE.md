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

---

## [PO] SIG-PO-GATE critique — 2026-05-27T20:47:27Z

I red-teamed the brief against the live repo (verified all 5 edit-target files exist, read the actual `triage-signals.md`, `edit.md`, `drain-signals.md` 0a-3 table, and cross-checked the host-load claim against `SPIKE_1947-auto-improve-loop.md`). This is not a checkbox pass — concrete judgements below.

### 1. BREAK-RISK — which of the 5 flow edits is most likely to break a live cycle, and is it reversible?

**Most dangerous: EDIT-4 (`agent-father/flow/edit.md`).** Not because it touches a hot cron path, but because of an *input-contract mismatch I confirmed by reading the file*. `edit.md` takes two structured inputs: `agent_name` (kebab-case) and `change_description`. EDIT-4 says agent-father will "Read the 'Proposed Change' field from the proposal doc to *derive* `agent_name` and `change_description`." The proposal's "Proposed Change" field (brief §3) is free prose: *"What should change. Which file(s). No implementation — description only."* There is no structured `target_agent` field in the proposal schema. So agent-father must parse a free-text paragraph to extract which agent file to edit. If the parse is ambiguous or wrong, agent-father edits the *wrong agent's* `.md` autonomously — and per the loop's premise this happens with no human in the path. That is the single most break-prone seam: a self-improvement loop that mis-targets an edit is worse than no loop, because it corrupts a flow file that other agents depend on.
**Reversibility:** the edit itself is reversible — `edit.md`'s own error boundary already does `git checkout` rollback on partial edits, and all proposal/flow edits are git-tracked on `main`. So a bad edit can be reverted. But *detection* of a mis-targeted (yet internally-valid) edit is not automatic — the loop has no post-edit verification that the edited file was the intended one. Reversible in mechanism, but the loop won't know it needs reverting.

**Runner-up: EDIT-1 (system-auditor Tier-2).** This rides the every-4h cron. I confirmed `## Tier-2 — Freshness Sweep` exists and the TIER=2 dispatch path skips all other steps. The D-IMPROVE step adds a `improve_check_log` query + per-candidate classify + doc write + commit-mutex on every Tier-2 tick. The risk is a *commit on a high-frequency tick*: 6 ticks/day each grabbing commit-mutex on `main`. The §8 commit rules and the D-IMPROVE-4 cooldown guard mitigate runaway emits, but a malformed candidate that throws mid-write could leave a half-written proposal doc + un-released mutex. Reversible (git), and the cooldown guard caps volume, so this is acceptable — but it must fail-loud-skip on a bad candidate, not abort the whole Tier-2 sweep (the freshness sweep is the auditor's primary job and must not be taken down by the improve add-on).

**EDIT-3 / EDIT-5 are low break-risk** — pure additive routing rows in tables I read; they no-op when no `improvement_proposal` signal exists.

### 2. FALSE-GREEN / SILENT-SWALLOW — can a lane report "improved" while the real goal is unmet? Is the lane-B proven-gate actually inject-violation-confirm-red, or merely asserted?

The lane-B proven-gate in §5 is correctly *specified* as inject-violation → confirm-red → remove → confirm-green (GATE-PROOF-1..5), with the explicit `feedback_fence_false_green` citation and the crucial detail that the violation goes **into the subject code, not the gate config**. That is the right shape — it is not merely asserted in the brief; it is written as QA's acceptance criterion for SIG-IMPL-GATE, and §5 even handles the gate-fails-to-go-red case by *demoting* lane-B to lane-A. Good.

**But there is one real false-green hole the brief does not close:** the gate is proven *once*, "for the first real proposal the loop generates" (§5 / §9 Phase-2 AC). The brief then flips `SELF_IMPROVE_AUTO_DISPATCH=true` and trusts the gate for *all future* lane-B dispatches. A gate proven red on proposal #1's regression does **not** prove it goes red on proposal #2's *different* regression class. This is exactly the `feedback_silent_swallow_serial_bugs` failure mode at the governance layer: one green proof masks the next unproven path. **This must be a condition, not a blocker** — the per-dispatch-path GATE-PROOF must be re-run whenever the lane-B fix touches a *new* gate mechanism, and `SELF_IMPROVE_AUTO_DISPATCH` must remain scoped per-path, not a single global flag that, once true, blesses everything.

Second, smaller: the proposal status field can read `DONE` (set by agent-father in EDIT-4 after `edit.md` completes) without any check that the **Success Signal** in the proposal was actually met — `edit.md` returning a clean diff means "the edit applied," not "the weakness is gone." That is a lane-A false-green: status=DONE asserts implementation, not improvement. Condition below.

### 3. GAMEABILITY — can the loop self-promote a lane-C item into lane-A/B to escape human escalation?

The logical barrier in §7 is sound and I accept it: the classification rule is itself gate logic, so any change that loosens lane-C criteria is *itself* a lane-C action, which the loop cannot auto-close. The first-match-wins ordering in §1 (lane-C tested FIRST, before lane-A/B) is the correct defensive ordering — an item that touches gate/audit logic OR is irreversible OR whose success metric is "user finds this comprehensible" is caught before any auto lane can claim it.

**The residual gameability risk is not promotion — it is mis-classification at birth.** The lane is assigned by system-auditor (D-IMPROVE-2a) and only *validated* by agents-architect (IP-2). Both are automated. If system-auditor labels a genuinely-lane-C item as lane-A because its weakness text doesn't obviously trip the §1 keywords (e.g. an improvement phrased as "tighten the degradation threshold" — which is actually editing the loop's own success criteria, a lane-C gate-edit — but worded as a routine tuning), and agents-architect's validation also misses it, then a lane-C item reaches PO *labeled* lane-A. The barrier holds only if PO catches it at the gate. **So the gameability defense ultimately rests on the PO critique, not on an automated invariant.** That is acceptable *given the user's mandate that PO is the thinking gate* — but it means the PO critique's "is this actually a gate/audit self-edit in disguise?" check must be an explicit, mandatory critique field, not folded into "gameability." I am not rejecting on this — the §1 ordering + PO gate is a reasonable defense — but I attach it as a condition (add a 5th mandatory critique field: "lane-C-in-disguise check").

No REJECT on this axis: the boundary cannot be *crossed by an automated step*; it can only be *mislabeled*, and the human-authority PO gate plus the architect validation are two independent reads before any auto-implement.

### 4. HOST-LOAD — does anything add RAM/disk/cron beyond the budgeted Sprint 1948 job?

Verified against SPIKE_1947 directly. Confirmed:
- **No new Docker service, no new cowork agent.** SPIKE §3 Option B (dedicated `self-improver` cowork agent) was explicitly REJECTED; this brief honors that (§6 "Forbidden").
- **The only cron is `selfImproveOrchestratorJob` at `0 9 * * *`**, which is the *already-designed, already-budgeted* Sprint 1948 job running *inside the existing mcp-server process* (SPIKE §4 chosen Option A: "zero new Docker services," direct SQLite access). ~0 MB incremental RAM, ~0.5 KB/day to `improve_check_log`.
- **D-IMPROVE and IP-review add ZERO new ticks** — they ride system-auditor's existing Tier-2 (every 4h) / Tier-3 (03:00Z) and agents-architect's existing on-demand invocation. The brief's §6 budget table is line-itemed and each line is justified.
- **Disk:** `docs/improvement-proposals/` is append-only, ~2-5 KB/proposal, ~1-5 rows/day to DASHBOARD.md. Negligible against the `project_disk_full_lancedb_bloat` history (that was 23 GB LanceDB orphans — different order of magnitude).

This is within budget. No unbudgeted growth. The kernel-panic / 8GB-cap risk (`project_host_memory_panic`) is *not* aggravated by this loop because nothing new runs always-on and nothing new spawns a container. PASS — no REJECT, no new budget required.

### 5. BLIND-SPOT NAMED — does the brief explicitly state the system cannot self-certify comprehensibility (plain-VN anchor)?

**Yes, explicitly and bindingly.** §1 lane-C lists "Plain-Vietnamese comprehensibility of any user-facing output" as lane-C FOREVER, and cites the binding anchor verbatim: the plain-VN MARKET fix PASSED the tran-ngoc-bau internal audit yet FAILED the user ("too complicated to understand"), with the conclusion "Self-audit structurally cannot detect subjective comprehensibility. This axis stays human-judged permanently." §7 restates it as a standing proof and names it so it is "never confused for a solvable technical problem." This is exactly the binding constraint from the handoff §Binding-constraints, and it is honored. PASS.

### Summary judgement

Four of five axes PASS clean (host-load, blind-spot, gameability-barrier, lane-B-gate-shape). The real findings are two false-green seams (one-time gate proof trusted globally; status=DONE ≠ success-signal-met) and one input-contract mismatch (EDIT-4 derives a structured edit target from free prose). None of these touch a lane-C axis or require a product call only the human can make — they are implementation-hardening conditions agent-father and dev-team can honor without re-opening the design. Therefore: APPROVE-WITH-CONDITIONS, not REJECT.

---

## [PO] VERDICT — APPROVE-WITH-CONDITIONS — 2026-05-27T20:47:27Z

The design is sound: three lanes fixed and correctly ordered (lane-C first-match-wins), host-load within the already-budgeted Sprint 1948 footprint, the plain-VN comprehensibility blind spot named as lane-C-forever with the binding anchor, and the lane-B proven-gate written as inject-violation-confirm-red (not asserted). I approve it to proceed. SIG-DESIGN is **DONE**.

agent-father MUST honor these conditions in SIG-IMPL-MD; dev-team MUST honor C-4/C-5 in SIG-IMPL-GATE. None re-opens the design — they are implementation-hardening:

**C-1 (EDIT-4 input contract — REQUIRED before any auto-edit fires).** The proposal schema (§3) must carry a *structured* `target_agent` field (kebab-case) and a structured `target_files[]` list, written by system-auditor at D-IMPROVE-2 and validated by agents-architect at IP-2. EDIT-4 must read `target_agent`/`target_files` from those structured fields — NOT parse the free-text "Proposed Change" paragraph. agent-father must FAIL-LOUD (reject the proposal back to PO, do not edit) if `target_agent` is absent or is not an existing kebab-case agent. A self-improvement loop that mis-targets an edit is worse than no loop.

**C-2 (post-edit target verification — lane-A false-green).** After `edit.md` completes, agent-father must verify the file it edited == the proposal's `target_files[]`, and must NOT set proposal status to `DONE` on the basis of "edit applied." Status after a clean edit is `IMPLEMENTING`. `DONE` is set only after the proposal's **Success Signal** is independently confirmed (for lane-A: by the next system-auditor freshness/audit tick re-checking the original weakness; the proposal carries a `success_verified_by` + date field). "Edit applied" ≠ "weakness gone."

**C-3 (5th mandatory PO critique field — lane-C-in-disguise).** EDIT-3 must add a FIFTH mandatory critique field to the proposal PO-Critique section and to the triage-signals gate: **"lane-C-in-disguise check"** — PO must explicitly judge whether the proposal, regardless of its labeled lane, actually edits the gate/audit logic, the loop's own success criteria, an irreversible action, or user-facing comprehensibility. Empty/placeholder on this field auto-rejects with reason "critique incomplete" exactly like the other four. Rationale: the gameability defense rests on PO catching a mislabeled-at-birth lane-C item; make that catch a named, enforced step, not an implicit one.

**C-4 (per-path gate proof — lane-B, dev-team/QA, SIG-IMPL-GATE).** `SELF_IMPROVE_AUTO_DISPATCH` must NOT be a single global flag that, once `true`, blesses all lane-B dispatches. GATE-PROOF-1..5 must be re-executed by QA whenever a lane-B fix touches a gate mechanism not previously proven red. One green proof of proposal #1 does not bless proposal #2's different regression class (`feedback_silent_swallow_serial_bugs`). Scope the kill-switch per dispatch-path; default `false` per path until that path's GATE-PROOF is recorded in the proposal doc.

**C-5 (Tier-2 add-on must not take down the freshness sweep — EDIT-1).** The D-IMPROVE step must fail-loud-SKIP a single bad candidate (log it, continue), never abort the whole Tier-2 freshness sweep. The freshness/DB sweep is the auditor's primary job; the improve-emit is the add-on and must be subordinate. A throw mid-write must release the commit-mutex and leave no half-written proposal doc.

### Routing

- **SIG-DESIGN:** DONE (this gate).
- **SIG-IMPL-MD → agent-father:** UNBLOCKED. Implement EDIT-1..EDIT-5 (brief §9 Phase 1, flow `.md` only) honoring C-1, C-2, C-3, C-5. The agent-father signal `docs/signals/gated-self-improvement-loop-20260527.json` is set to unblocked below.
- **SIG-IMPL-GATE → dev-team chain (po→ba→architect→pm→dev-mcp-server→qa):** sequenced AFTER SIG-IMPL-MD. Phase 2 code (Sprint 1948 substrate + D-IMPROVE proposal-doc emit), zone `apps/mcp-server/`. QA owns C-4 (per-path GATE-PROOF). Phase 3 gate-flip (ops, REBUILD not restart) only after QA records GATE-PROOF.
- **Lane-C anchor:** unchanged — comprehensibility stays human-judged forever.

**RETURN PIPELINE: continue. NEXT: agent-father (SIG-IMPL-MD).**

---

## [PO] SIG-IMPL-GATE Kickoff — Phase 2 lane-b proven-gate CODE — 2026-05-27

**Phase 1 closed.** SIG-IMPL-MD is DONE+committed `062a6569` — agent-father wired EDIT-1..5 into the 5 flow files honoring C-1/C-2/C-3/C-5 (verified: 166 insertions across system-auditor/agents-architect/po/agent-father/dev-team flows). SIG-PO-GATE verdict (above) APPROVE-WITH-CONDITIONS. SIG-IMPL-GATE is now READY (its blocker SIG-PO-GATE is resolved). I am routing it through the full dev-team chain **po→ba→architect→pm→dev-mcp-server→qa** with the QA gate. **NEXT agent: ba** (decompose into atomic tasks).

### What SIG-IMPL-GATE builds (the brief §9 Phase 2 + SPIKE_1947 §6 Phase 1)

This phase ships the lane-b **detection + log + proposal-emit** substrate in SHADOW MODE. The detection layer is ALREADY DESIGNED — do NOT reinvent it. The work is to write the designed-but-never-shipped Sprint-1948 code, EXTENDED with the brief's D-IMPROVE proposal-doc bridge.

**Substrate reconciliation (PO grep-confirmed at kickoff — read this before decomposing):** the Sprint-1948 files do NOT exist in the codebase yet. Sprint 1948 was QUEUED-and-gate-PAUSED (`project-stats.json#previousSprint`: "all 4 tasks BLOCKED") and never shipped. Confirmed ABSENT: `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts`, `apps/mcp-server/src/domain/services/degradationRules.ts`, `apps/mcp-server/src/infrastructure/db/improveCheckStore.ts`; no `improve_check_log` in `schema-system.ts`; no `SELF_IMPROVE_AUTO_DISPATCH` anywhere. So this is a GREENFIELD build of an ALREADY-SPECIFIED design — the spec is `docs/spikes/SPIKE_1947-auto-improve-loop.md`. **Reuse SPIKE_1947 §4 (detection policy: two-window 7d-vs-30d delta ≥10pp, persistently-low <40% w/ ≥10 samples, coverage-gap), §5 (DEGRADATION_CAUSE_MAP rule table — pure domain, zero imports), §8 (improve_check_log schema), §9 (anti-runaway safety gates), §12 (Phase-1 ACs AC-1..AC-8) verbatim. Do NOT re-litigate the 10pp threshold, the host topology (Option C = scheduler job inside mcp-server, NOT a new service/agent — both rejected in SPIKE §3), or the cron slot (`0 9 * * *`).**

**Files (from SPIKE_1947 §6 Phase 1 — already designed):**
| File | Change |
|---|---|
| `apps/mcp-server/src/infrastructure/db/schema-system.ts` | Add `improve_check_log` table (SPIKE §8 schema) to `initSystemTables()` |
| `apps/mcp-server/src/infrastructure/db/improveCheckStore.ts` | NEW — snapshot write/read for recheck baseline |
| `apps/mcp-server/src/domain/services/degradationRules.ts` | NEW — `DEGRADATION_CAUSE_MAP` rule table (pure, zero imports) + `detectDegradedSignalTypes()` |
| `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts` | NEW — cron entry (Option C, inside mcp-server process) |
| `apps/mcp-server/src/scheduler/cronConfig.ts` | Add `CRONS.selfImproveOrchestrator` = `0 9 * * *` |
| `apps/mcp-server/src/scheduler/startScheduler.ts` | Wire the new cron via the existing `cron_job_runs.wrapRun()` dedup pattern |

**Extension from THIS brief (the D-IMPROVE bridge, brief §9 Phase 2):** `selfImproveOrchestratorJob.ts` must write `docs/improvement-proposals/<IMP-YYYYMMDD-slug>.md` in DRAFT form (the §3 proposal schema fields: weakness, evidence, proposed change, **structured `target_agent` + `target_files[]` per C-1**, lane, success-signal, rollback) INSTEAD OF / IN ADDITION TO the original WORK Telegram, and append a DASHBOARD.md row `type=improvement_proposal, status=NEW`. This is the seam that connects the 1948 code substrate to the flow-level governance layer that EDIT-1..5 already wired. Lane classification at emit time uses the §1 three-lane rule (lane-C tested FIRST, first-match-wins).

### Conditions the dev-team chain MUST honor (from SIG-PO-GATE verdict)

- **C-4 (HARD — QA owns it):** `SELF_IMPROVE_AUTO_DISPATCH` is NOT a single global boolean. It MUST be scoped PER-DISPATCH-PATH (e.g. keyed by the gate mechanism / signal_type the lane-b fix targets), **default `false` per path**. A path flips to `true` ONLY after QA records that specific path's GATE-PROOF in the proposal doc. **One global flag that, once true, blesses everything is REJECTED** (`feedback_silent_swallow_serial_bugs`: one green proof masks the next unproven regression class). The architect must design the per-path keying; dev implements it default-false-per-path; QA enforces that no path is `true` without a recorded GATE-PROOF.
- **Proven-gate proof = QA acceptance, NOT an assertion (brief §5 GATE-PROOF-1..5):** for the detection gate, QA must inject a deliberate violation **INTO THE SUBJECT CODE (not the gate config)** → confirm the gate/test goes RED → remove → confirm GREEN → record "Gate proven red on [date] by [method]. Evidence: [output]" in the proposal doc. "tests pass / lint exit 0" is NOT proof (`feedback_fence_false_green`). If the gate does NOT go red, the path is demoted to lane-A (PO approves manually, no automated backstop).
- **SHADOW MODE is the ship target.** This task ships detect→log→proposal-emit with auto-dispatch OFF (every path default-false). NO live auto-dispatch fires from this task. The Phase-3 flip of any path to live happens only after that path's QA GATE-PROOF; the global/fleet-wide enable across all paths at once is a SEPARATE, human-gated future step (see Lane-C boundary below) and is OUT of scope here.
- **Host budget (HARD, `project_host_memory_panic`, 8GB Docker cap):** NO new always-on agent, NO new Docker service, NO new cron beyond the single already-budgeted `selfImproveOrchestratorJob` `0 9 * * *` running inside the existing mcp-server process (~0 MB incremental RAM, ~0.5 KB/day to `improve_check_log`, ~2-5 KB/proposal to `docs/improvement-proposals/`). SPIKE §3 Option A (new microservice) and Option B (new cowork agent) are both REJECTED — do NOT reopen. If the chain finds it needs ANY new always-on tick/agent/service, STOP and return to PO with a line-itemed budget for a critique-gate decision; do NOT add it silently.
- **No test-baseline regression:** floor 9408 PASS / ceiling 348 FAIL per `project-stats.json`. New code carries ≥6 unit tests per SPIKE §12 AC-8 (degraded / not-degraded / insufficient-sample detection; known-type / `_default` hypothesis lookup; schema table-absent fallback) PLUS the C-4 per-path kill-switch default-false test PLUS the D-IMPROVE proposal-emit test (writes a valid DRAFT doc with structured `target_agent`/`target_files`).
- **Commit safety:** all on `main`, no branches; explicit-path `git add` only (never `-A`/`.`); no `--force`/`--no-verify`; leave files UNSTAGED — main terminal serializes commits (`feedback_concurrent_commit_race`); do NOT touch any `pilot-status-*.json`.
- **ops REBUILD (not restart) after dev change** (`feedback_rebuild_after_dev_change`) — the deploy task force-recreates mcp-server so the new cron/code is live; restart relaunches the stale image.

### Lane-C boundary check (per the kickoff STOP-if-human-call-required constraint)

I evaluated whether any part of THIS Phase-2 build requires a human product call. It does NOT:
- Building shadow-mode detection+log+proposal-emit code is **reversible** (git-tracked, no prod data deletion), the success signal is **machine-checkable** (gate proven red), and it **implements** the gate logic rather than **editing** it. Not lane-C.
- The per-path kill-switch defaults to `false`, so nothing auto-dispatches to production at ship time. Not an irreversible action.

**The forward-looking items that ARE human-reserved (named, NOT authorized by this kickoff, NOT part of SIG-IMPL-GATE):**
1. A GLOBAL / fleet-wide flip of `SELF_IMPROVE_AUTO_DISPATCH` to live across ALL paths at once (vs the per-path, post-GATE-PROOF flip C-4 permits) — that broad trust step is a product call.
2. ANY change to the gate/audit/classification logic itself (the loop rewriting its own success criteria) = lane-C forever per brief §1/§7.
3. Un-pausing Sprint 1948's production OBSERVE gates or running the orchestrator against a degradation input substrate the PO has not confirmed clean.

None of (1)-(3) is needed to ship the shadow-mode build. If the BA/architect chain discovers the build CANNOT proceed without one of them, the chain STOPS and returns to PO, who escalates to the user with the precise question. **For this kickoff, no such boundary is hit — PIPELINE: continue.**

### BA decomposition instructions (NEXT)

ba: read this handoff + `docs/architecture-briefs/2026-05-27-gated-self-improvement-loop.md` §9 Phase 2 + `docs/spikes/SPIKE_1947-auto-improve-loop.md` §4/§5/§6/§8/§9/§12. Decompose SIG-IMPL-GATE into atomic dev-mcp-server tasks (mirror SPIKE §15: schema+store / domain+detect / orchestrator+cron+wiring / D-IMPROVE proposal-emit extension / tests) with testable acceptance criteria per task. Make C-4 per-path-default-false an explicit AC. Make the D-IMPROVE proposal doc carry the structured `target_agent`/`target_files` (C-1) an explicit AC. Flag for the architect ONLY the genuinely-open design points: (i) the exact per-path keying scheme for `SELF_IMPROVE_AUTO_DISPATCH` (C-4), and (ii) the slug/id derivation + dedup key for the proposal-doc cooldown guard. Do NOT re-decide the detection policy, host topology, cron slot, or threshold — those are SPIKE-settled. Write the spec to `docs/REQ_SIG-IMPL-GATE.md` and return to the PO approval gate.

**RETURN PIPELINE: continue. NEXT: ba (decompose SIG-IMPL-GATE → `docs/REQ_SIG-IMPL-GATE.md`, return to PO spec gate).**
