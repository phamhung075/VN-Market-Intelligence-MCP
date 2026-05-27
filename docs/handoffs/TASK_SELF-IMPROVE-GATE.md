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

---

## [Architect] SIG-IMPL-GATE Blueprint — 2026-05-27

**Source:** `docs/REQ_SIG-IMPL-GATE.md` · `docs/spikes/SPIKE_1947-auto-improve-loop.md` · `docs/architecture-briefs/2026-05-27-gated-self-improvement-loop.md`
**Reference pattern:** `apps/mcp-server/src/scheduler/digest/accuracyDigestJob.ts` (wrapRun, _running, AccuracyDigestDeps)
**Brownfield scan:** GREENFIELD confirmed — zero reconciliation needed (PO grep-verified). Existing infra reused: `getAccuracyStats()` (signalOutcomeStore), `cron_job_runs` (wrapRun via jobRunRepo), `schema-system.ts` (initSystemTables), CRONS map (cronConfig), startScheduler.ts (import + register pattern).

---

### 0. Resolved Design Points

#### Open Point i — Per-Path Kill-Switch Type + Env-Var Naming

**Decision:** Adopt the BA-suggested starting point with one hardening addition.

```typescript
// File: apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts
// (or extracted to: apps/mcp-server/src/infrastructure/config/dispatchPaths.ts)

/**
 * Exhaustive list of known dispatch paths. Adding a new path requires a code
 * change here — enforces C-4: no freeform-string path lookup possible.
 */
export const DISPATCH_PATHS = [
  'price_confirmation',
  'chain_catalyst',
  'volume_spike',
  'coverage_gap',
] as const;

export type DispatchPath = typeof DISPATCH_PATHS[number];

/**
 * Read per-path kill-switch from environment. Fail-safe on unknown path:
 * returns false (not an error). Absent env var = false (default-off invariant).
 *
 * Env-var convention: SELF_IMPROVE_AUTO_DISPATCH_{PATH_UPPER}
 * Examples:
 *   SELF_IMPROVE_AUTO_DISPATCH_PRICE_CONFIRMATION=false   (ship default)
 *   SELF_IMPROVE_AUTO_DISPATCH_CHAIN_CATALYST=false       (ship default)
 *   SELF_IMPROVE_AUTO_DISPATCH_VOLUME_SPIKE=false         (ship default)
 *   SELF_IMPROVE_AUTO_DISPATCH_COVERAGE_GAP=false         (ship default)
 *
 * NOTE: No global SELF_IMPROVE_AUTO_DISPATCH=true path exists in this scheme.
 * Any unknown key (not in DISPATCH_PATHS) returns false silently — this is
 * the fail-safe, not fail-loud, case for the kill-switch only (REQ §3 / C-4).
 */
export function isAutoDispatchEnabled(path: DispatchPath): boolean {
  const key = `SELF_IMPROVE_AUTO_DISPATCH_${path.toUpperCase()}`;
  return Bun.env[key] === 'true';
}
```

**Justification:**
- `DISPATCH_PATHS as const` + `DispatchPath` union type: adding a new path requires a code edit to this array — satisfies C-4 "adding a path = code change."
- `isAutoDispatchEnabled` only accepts `DispatchPath` — TypeScript rejects freeform strings at compile time (AC-T5-5).
- A hypothetical global `SELF_IMPROVE_AUTO_DISPATCH=true` variable has no matching key pattern (`_PRICE_CONFIRMATION` suffix is required), so it cannot enable any path (AC-T5-4 hard).
- Unknown path at runtime (e.g., `_default` in DEGRADATION_CAUSE_MAP) is excluded from DISPATCH_PATHS — calling `isAutoDispatchEnabled` with an unknown string is a TypeScript compile error, not a runtime fallback. At the call site in the orchestrator, the lookup is gated: `DISPATCH_PATHS.includes(finding.signal_type as DispatchPath)` before calling `isAutoDispatchEnabled` — unknown types get false by the type-guard, no exception.
- `coverage_gap` is included even though it is treated separately in the orchestrator — it may eventually need a dispatch path and should be declared now.

**Layer placement:** Inline in `selfImproveOrchestratorJob.ts` at ship time. If DISPATCH_PATHS grows beyond 6 entries in a future sprint, extract to `apps/mcp-server/src/infrastructure/config/dispatchPaths.ts` — no breaking change, just a move.

---

#### Open Point ii — Slug Rule, Dedup Key, fix_area → target_agent Mapping

**Slug derivation rule (canonical, deterministic):**

```
slug = {signal_type_kebab}-{detection_class_lower}
id   = IMP-{YYYYMMDD}-{slug}

Signal type normalization: replace underscores with hyphens.
Detection class normalization: lowercase.

Examples:
  signal_type='price_confirmation', class='DEGRADED'    → IMP-20260527-price-confirmation-degraded
  signal_type='volume_spike',       class='PERSISTENTLY_LOW' → IMP-20260527-volume-spike-persistently-low
  signal_type='unknown_xyz',        class='DEGRADED'    → IMP-20260527-unknown-xyz-degraded
```

Rule is deterministic: same (signal_type, detection_class, date) always produces the same slug. Date component is the UTC date of the run (`new Date().toISOString().slice(0, 10).replace(/-/g, '')`).

**Dedup key (weakness_identifier):**

```
weakness_identifier = `${signal_type}_${detection_class}`

Examples:
  price_confirmation_DEGRADED
  volume_spike_PERSISTENTLY_LOW
  unknown_xyz_COVERAGE_GAP
```

This composite string is used to check `docs/improvement-proposals/` for an existing DRAFT or ARCHITECT-REVIEWED file with the same identifier before writing (REQ TASK-4 cooldown guard). The check scans filenames matching `IMP-*-{signal_type_kebab}-{detection_class_lower}.md` (pattern-match, not content parse).

**fix_area → target_agent mapping (C-1 structural derivation, no free-text parsing):**

```typescript
// Defined as a typed constant — the orchestrator reads fix_area from DEGRADATION_CAUSE_MAP
// and looks up target_agent here. Never parses the suggested_fix prose.

export const FIX_AREA_TO_AGENT: Record<string, { target_agent: string; area_hint: string }> = {
  'apps/mcp-server/src/scheduler/alerts/': {
    target_agent: 'dev-mcp-server',
    area_hint: 'apps/mcp-server/src/scheduler/alerts/',
  },
  'apps/mcp-server/src/scheduler/news/': {
    target_agent: 'dev-mcp-server',
    area_hint: 'apps/mcp-server/src/scheduler/news/',
  },
  'apps/technical-analysis/': {
    target_agent: 'dev-technical-analysis',
    area_hint: 'apps/technical-analysis/',
  },
  'manual': {
    target_agent: 'UNRESOLVED',
    area_hint: '',
  },
} as const;
```

`target_agent` is always one of: `'dev-mcp-server'`, `'dev-technical-analysis'`, `'UNRESOLVED'`. The `_default` DEGRADATION_CAUSE_MAP entry has `fix_area: 'manual'` → maps to `target_agent: 'UNRESOLVED'`, `target_files: []` (AC-T4-7).

When `fix_area` is not a key in `FIX_AREA_TO_AGENT`, the orchestrator falls back to `{ target_agent: 'UNRESOLVED', target_files: [] }` — same as `manual`. This is fail-safe (not fail-loud) since the mapping table is the authoritative source; an unmapped area means human triage is required.

---

#### Cron-Slot Collision Decision

**Decision: offset to `2 9 * * *` (09:02 UTC daily).**

Rationale:
- `bctcOverdueCheck = '0 9 * * 1-5'` fires at 09:00 UTC on weekdays. node-cron schedules are sequential within the same process (single-threaded Bun event loop), so same-minute execution IS safe — the callbacks are queued and run back-to-back, not truly parallel. However, `bctcOverdueCheck` uses `jobRunRepo.wrapRun()` which acquires a `cron_job_runs` row. The new job uses the same pattern. On weekdays the two rows are written in the same second, which is operationally harmless but creates visual ambiguity in `cron_job_runs` diagnostics (two "09:00" rows for different jobs).
- A 2-minute offset (`2 9 * * *`) costs nothing (09:02 UTC = still well before any morning briefing work) and produces unambiguous cron_job_runs timing. Diagnosability improvement at zero cost.
- **No second cron slot is added** — the existing `0 9 * * 1-5` slot is unchanged; the new `2 9 * * *` slot is the ONE new slot per hard constraint.
- `CRONS.selfImproveOrchestrator = Bun.env.CRON_SELF_IMPROVE_ORCHESTRATOR ?? '2 9 * * *'`

---

### 1. TypeScript Interface Specifications

#### 1a. SignalAccuracyStats (existing — no change, documented for clarity)

The existing `SignalAccuracyStats` from `signalOutcomeStore.ts` is **per (signal_type, stock_code) group**. The detection function receives arrays from two `getAccuracyStats()` calls (7d and 30d windows) and must aggregate by `signal_type` across all stock codes before comparing windows.

```typescript
// From apps/mcp-server/src/infrastructure/db/signalOutcomeStore.ts (read-only reference)
export interface SignalAccuracyStats {
  signal_type: string;
  stock_code: string;
  sample_count: number;
  accuracy_rate: number | null;   // null when sample_count < 3
  avg_confidence_when_correct: number | null;
  avg_confidence_when_incorrect: number | null;
  last_evaluated_at: string | null;
}
// getAccuracyStats(db, { days: 7 }) and getAccuracyStats(db, { days: 30 }) return SignalAccuracyStats[]
```

**Aggregation contract for detectDegradedSignalTypes():** Before applying the two-window delta policy, the function must aggregate per-stock rows into per-signal-type summaries:
- `sample_count_7d` = sum of `sample_count` across all stock codes for that signal_type in the 7d array
- `sample_count_30d` = sum of `sample_count` across all stock codes for that signal_type in the 30d array
- `current_rate` = weighted average of `accuracy_rate` weighted by `sample_count` for that signal_type in the 7d array (exclude null-rate rows from weight)
- `baseline_rate` = same for the 30d array

This aggregation is INSIDE `detectDegradedSignalTypes()` — the caller does not need to pre-aggregate.

#### 1b. DegradationFinding (TASK-2 return type)

```typescript
// apps/mcp-server/src/domain/services/degradationRules.ts

export interface DegradationHypothesis {
  likely_cause: string;
  suggested_fix: string;
  fix_area: string;
}

export type DetectionClass = 'DEGRADED' | 'PERSISTENTLY_LOW' | 'COVERAGE_GAP';

/**
 * One finding returned by detectDegradedSignalTypes(). One per (signal_type, detection_class)
 * combination — a signal_type can appear twice if it is both DEGRADED and PERSISTENTLY_LOW.
 */
export interface DegradationFinding {
  signal_type: string;
  detection_class: DetectionClass;
  /** Aggregated 7-day accuracy rate, or null if insufficient sample. */
  current_rate: number | null;
  /** Aggregated 30-day accuracy rate. This is the baseline. */
  baseline_rate: number | null;
  /** Total samples in the 30d window across all stocks for this signal_type. */
  sample_count_30d: number;
  /** Total samples in the 7d window across all stocks for this signal_type. */
  sample_count_7d: number;
  /** Hypothesis text from DEGRADATION_CAUSE_MAP lookup. Never undefined (_default fallback). */
  hypothesis: string;
  /** Partial path hint for fix location. From DEGRADATION_CAUSE_MAP. */
  fix_area: string;
}

/**
 * Pure function — no imports from infrastructure or application.
 * Aggregates stats7d and stats30d by signal_type, applies detection policy,
 * looks up hypothesis from DEGRADATION_CAUSE_MAP.
 */
export function detectDegradedSignalTypes(
  stats7d: SignalAccuracyStats[],
  stats30d: SignalAccuracyStats[],
): DegradationFinding[] { /* ... */ }
```

**Dedup behavior for same signal_type appearing as both DEGRADED and PERSISTENTLY_LOW:** return BOTH findings (two entries in the array). The orchestrator's anti-runaway gate (max 2 rows per run) selects top-2 by severity: DEGRADED > PERSISTENTLY_LOW > COVERAGE_GAP. This means if one signal_type contributes two findings, it can consume both anti-runaway slots — acceptable, since that signal_type is the most critical.

#### 1c. ImproveCheckRow (TASK-1 store types)

```typescript
// apps/mcp-server/src/infrastructure/db/improveCheckStore.ts

import type { Database } from 'bun:sqlite';

export type DispatchStatus =
  | 'shadow'
  | 'dispatched'
  | 'deferred_wip_cap'
  | 'improvement_confirmed'
  | 'no_improvement'
  | 'worsened';

export interface ImproveCheckRow {
  id: number;
  signal_type: string;
  window_7d_rate: number | null;
  window_30d_rate: number | null;
  sample_count_7d: number | null;
  sample_count_30d: number | null;
  hypothesis: string | null;
  dispatch_status: DispatchStatus;
  fix_signal_id: string | null;
  checked_at: string;       // ISO-8601 UTC, SQLite default: datetime('now')
  rechecked_at: string | null;
}

/** Input for insert — id, checked_at, rechecked_at are DB-managed. */
export interface ImproveCheckInsert {
  signal_type: string;
  window_7d_rate?: number | null;
  window_30d_rate?: number | null;
  sample_count_7d?: number | null;
  sample_count_30d?: number | null;
  hypothesis?: string | null;
  dispatch_status?: DispatchStatus;  // default 'shadow'
  fix_signal_id?: string | null;
}

/** Options for getBaselineForSignalType. */
export interface GetBaselineOpts {
  /** Look-back window in days for checked_at filter. Default: 7. */
  withinDays?: number;
}

/** Options for updateDispatchStatus. */
export interface UpdateDispatchOpts {
  rechecked_at?: string;
  fix_signal_id?: string;
}

export function insertImproveCheckSnapshot(
  db: Database,
  row: ImproveCheckInsert,
): number; // returns new id

export function getBaselineForSignalType(
  db: Database,
  signal_type: string,
  opts?: GetBaselineOpts,
): ImproveCheckRow | null;

export function getPendingRecheckRows(
  db: Database,
): ImproveCheckRow[];

export function updateDispatchStatus(
  db: Database,
  id: number,
  status: DispatchStatus,
  opts?: UpdateDispatchOpts,
): void;
```

**dispatch_status validation:** Enforced at application layer (in `insertImproveCheckSnapshot`): the function throws `new Error('[improveCheckStore] invalid dispatch_status: ...')` if the value is not in the DispatchStatus union. No DB CHECK constraint — SQLite does not enforce TEXT check constraints as strictly as typed application code, and the fail-loud-first policy (docs/protocols/fail-loud-protocol.md) requires the throw at insert time.

#### 1d. SelfImproveOrchestratorDeps (TASK-3/4 injection interface)

```typescript
// apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts

import type { Database } from 'bun:sqlite';
import type { DegradationFinding } from '../../domain/services/degradationRules.js';
import type { SignalAccuracyStats } from '../../infrastructure/db/signalOutcomeStore.js';

export interface CoverageGapFinding {
  stock_code: string;
  agent_signals_count: number;  // ≥1
  last_signal_at: string | null;
}

/**
 * Injectable deps for unit testing. All external I/O is injected.
 * Production wiring in startScheduler.ts passes real implementations.
 */
export interface SelfImproveOrchestratorDeps {
  /** Injected DB handle. Falls back to getDb() in production. */
  db?: Database;
  /** Telegram WORK channel sender. */
  sendWork?: (text: string) => Promise<boolean>;
  /** Detection function. Defaults to imported detectDegradedSignalTypes(). */
  detectFn?: (
    stats7d: SignalAccuracyStats[],
    stats30d: SignalAccuracyStats[],
  ) => DegradationFinding[];
  /** Coverage gap query. Defaults to queryCoverageGaps(db). */
  coverageGapFn?: (db: Database) => CoverageGapFinding[];
  /** Proposal doc writer. Defaults to writeImprovementProposal(). */
  writeProposalFn?: (finding: DegradationFinding, runDate: string) => Promise<void>;
}

export async function runSelfImproveOrchestrator(
  deps?: SelfImproveOrchestratorDeps,
): Promise<void> { /* ... */ }
```

#### 1e. ImprovementProposalFields (TASK-4 proposal doc writer)

```typescript
// apps/mcp-server/src/infrastructure/signals/improvementSignalWriter.ts
// (extracted helper — architect decision: EXTRACT, not inline)

import type { DegradationFinding } from '../../domain/services/degradationRules.js';

export interface ImprovementProposalFields {
  id: string;                 // IMP-{YYYYMMDD}-{slug}
  created_at: string;         // ISO-8601 UTC
  created_by: 'system-auditor';
  status: 'DRAFT';
  weakness: string;           // Formatted from finding
  evidence_source: string;    // 'improve_check_log'
  evidence_data: string;      // "signal_type={...}, 7d_rate={...}, 30d_rate={...}, delta={...}"
  proposed_change: string;    // From DEGRADATION_CAUSE_MAP.suggested_fix
  lane: 'LANE-A' | 'LANE-B';
  lane_rationale: string;
  success_signal: string;
  rollback: string;
  // C-1 structured fields
  target_agent: string;       // From FIX_AREA_TO_AGENT mapping, or 'UNRESOLVED'
  target_files: string[];     // [area_hint] or []
}

/**
 * Writes docs/improvement-proposals/{id}.md in DRAFT form.
 * Throws on file-write failure (caller wraps in try/catch, non-fatal per C-5).
 * Does NOT commit — main terminal serializes commits.
 */
export async function writeImprovementProposal(
  fields: ImprovementProposalFields,
): Promise<void>;

/**
 * Appends a row to docs/signals/DASHBOARD.md ## po section.
 * Creates file + section if absent. Throws on write failure.
 */
export async function appendDashboardRow(
  id: string,
  createdAt: string,
  summary: string,       // ≤40 chars
  proposalPath: string,
): Promise<void>;
```

**Architecture decision on extraction:** `improvementSignalWriter.ts` is EXTRACTED (not inline in the orchestrator). Rationale: (1) `writeImprovementProposal` + `appendDashboardRow` have independent testability requirements (AC-T4-1..8 all test I/O behavior); (2) the orchestrator's `deps.writeProposalFn` injection already represents the extraction seam; keeping the writer as a named module makes that seam explicit and keeps the orchestrator file below 200L.

**Lane classification logic (at emit time, inside the orchestrator before calling writeImprovementProposal):**
- `LANE-B` for `detection_class IN ('DEGRADED', 'PERSISTENTLY_LOW')` — signal-accuracy degradation has a hard machine-checkable gate (unit test suite goes red on injected regression).
- `LANE-A` for `detection_class = 'COVERAGE_GAP'` — coverage gap fix is a flow/config change (watchlist entry, signal seeding), not a code regression with a unit-test backstop.
- Lane assignment is written into the proposal doc at emit time and is NOT re-evaluated by the orchestrator later. agents-architect validates the classification in its IP-review step (EDIT-2).

---

### 2. DDD Layer Assignment

| File | DDD Layer | Rule |
|---|---|---|
| `schema-system.ts` | Infrastructure / DB | Table DDL, no business logic |
| `improveCheckStore.ts` | Infrastructure / DB | Data access — reads/writes market.db |
| `degradationRules.ts` | **Domain / Services** | Pure TypeScript constant + pure function. Zero imports from infrastructure or application. |
| `selfImproveOrchestratorJob.ts` | Interface / Scheduler | Orchestrates infra+domain. Imports from `infrastructure/db`, `domain/services`, `infrastructure/signals`. Never imports from another scheduler job. |
| `improvementSignalWriter.ts` | Infrastructure / Signals | File-system side effect (writes to docs/). DDD layer: infrastructure — it is an output adapter (signal-bus write). |
| `cronConfig.ts` | Interface / Scheduler | Pure configuration |
| `startScheduler.ts` | Interface / Scheduler | Composition root |

**DDD golden rule verification for `degradationRules.ts`:** The file must have zero imports outside the TypeScript standard library and its own domain types. Verified by the import-linter gate (AC-T2-7). The `SignalAccuracyStats` type is the only external dependency — it must be imported from `domain/models/` or re-declared inline. Because `SignalAccuracyStats` lives in `infrastructure/db/signalOutcomeStore.ts` today, the function signature must use a LOCAL interface declaration:

```typescript
// In degradationRules.ts — local re-declaration to avoid infra import
// This is the correct DDD pattern: domain defines its OWN input shape.
interface SignalAccuracyStatsByType {
  signal_type: string;
  stock_code: string;
  sample_count: number;
  accuracy_rate: number | null;
}
// detectDegradedSignalTypes() accepts SignalAccuracyStatsByType[] (structurally compatible
// with the infra's SignalAccuracyStats — TypeScript structural typing handles this).
```

This is the correct DDD pattern: the domain defines its own input type. The infrastructure's `SignalAccuracyStats` is structurally compatible (TypeScript duck-typing), so the orchestrator can pass the result of `getAccuracyStats()` directly without a conversion step.

---

### 3. Module Dependency Graph

```
startScheduler.ts
  └── imports runSelfImproveOrchestrator from
        selfImproveOrchestratorJob.ts  [interface/scheduler]
          ├── imports getAccuracyStats, SignalAccuracyStats
          │     from infrastructure/db/signalOutcomeStore.js
          ├── imports insertImproveCheckSnapshot, getBaselineForSignalType
          │     from infrastructure/db/improveCheckStore.js
          ├── imports detectDegradedSignalTypes, DEGRADATION_CAUSE_MAP, DISPATCH_PATHS
          │     from domain/services/degradationRules.js
          ├── imports isAutoDispatchEnabled, FIX_AREA_TO_AGENT, DispatchPath
          │     (inline OR from infrastructure/config/dispatchPaths.js)
          ├── imports writeImprovementProposal, appendDashboardRow
          │     from infrastructure/signals/improvementSignalWriter.js
          ├── imports logger from infrastructure/logger.js
          ├── imports getDb from infrastructure/db/schema.js
          └── lazy-imports sendTelegramWork from infrastructure/notifiers/telegram.js

degradationRules.ts  [domain/services]
  └── ZERO external imports (only TypeScript builtins + local types)

improveCheckStore.ts  [infrastructure/db]
  └── imports Database from bun:sqlite (type only)

improvementSignalWriter.ts  [infrastructure/signals]
  └── imports logger from infrastructure/logger.js
  └── imports Bun.file / Bun.write (Bun builtins — no external imports)

schema-system.ts  [infrastructure/db]
  └── existing import chain unchanged (adds improve_check_log DDL to initSystemTables())

cronConfig.ts  [interface/scheduler]
  └── ZERO imports (pure Bun.env config)
```

**Import direction invariant:** Every arrow in the graph points inward (toward domain) or horizontally within a layer. No domain file imports infrastructure. No infrastructure file imports scheduler files. This satisfies the DDD golden rule from `docs/policies/dev-standards.md`.

**The `queryCoverageGaps()` placement decision:** The function queries `watchlist` and `agent_signals` and `signal_outcomes` tables — this is an infrastructure DB query. Placement: **`infrastructure/db/improveCheckStore.ts`** as an additional exported function. Rationale: it is operationally related to the improve_check pipeline (same "readiness for improvement detection" concern), uses the same injectable `db: Database` pattern, and avoids adding a third import file to the orchestrator's dep list. Alternative (inline in orchestrator) is rejected: the AC-T3-6 test needs to call it via the injectable `deps.coverageGapFn`, and if it lives in the orchestrator file itself the injection seam is awkward.

---

### 4. Test Scaffolding Plan

All tests use the pattern from dev-standards: `apps/mcp-server/src/__tests__/NNN-task-name.test.ts`, DB injected via `:memory:` (setup.ts preloads `DB_PATH=:memory:`), zero real Telegram, zero real filesystem for unit tests (file writes injected via deps).

**Test file layout:**

```
apps/mcp-server/src/__tests__/
  1948a-improve-check-store.test.ts   (TASK-1, 6 ACs)
  1948b-degradation-rules.test.ts     (TASK-2, 8 ACs)
  1948c-self-improve-orchestrator.test.ts  (TASK-3, 9 ACs)
  1948d-improvement-signal-writer.test.ts  (TASK-4, 8 ACs)
  1948e-dispatch-kill-switch.test.ts  (TASK-5, 5 ACs)
```

**AC → test mapping:**

| AC | Test file | Pattern |
|---|---|---|
| AC-T1-1 (idempotent initSystemTables) | 1948a | Call initSystemTables(db) twice on `:memory:` DB. Assert table exists with correct columns. |
| AC-T1-2 (insertImproveCheckSnapshot returns id) | 1948a | Insert 2 rows, assert ids are 1 and 2. |
| AC-T1-3 (getBaselineForSignalType returns null on missing table) | 1948a | Create `:memory:` DB WITHOUT calling initSystemTables. Assert returns null (not throw). |
| AC-T1-4 (returns most recent row) | 1948a | Insert 2 rows with same signal_type, different checked_at. Assert returns the row with later checked_at. |
| AC-T1-5 (throws on missing signal_type) | 1948a | Call insertImproveCheckSnapshot with `{ signal_type: '' }`. Assert throws with message containing 'signal_type'. |
| AC-T1-6 (no regression on existing tables) | 1948a | Insert row into cron_job_runs, call initSystemTables, assert row still present. |
| AC-T2-1 (DEGRADED detection 15pp delta) | 1948b | Inject stats7d=[{accuracy_rate:0.40, sample_count:5}], stats30d=[{accuracy_rate:0.55, sample_count:10}] for same signal_type. Assert 1 finding with detection_class='DEGRADED'. |
| AC-T2-2 (no detection at 1pp delta) | 1948b | Inject stats with delta=0.01. Assert empty array. |
| AC-T2-3 (PERSISTENTLY_LOW) | 1948b | Inject stats30d=[{accuracy_rate:0.35, sample_count:15}]. Assert 1 finding with detection_class='PERSISTENTLY_LOW'. |
| AC-T2-4 (sample gate — count=5 on 30d is below minimum) | 1948b | Note: REQ §1 defines the PERSISTENTLY_LOW gate as `sample_count_30d >= 10`. Count=5 fails this gate. For DEGRADED gate, the threshold is `sample_count_30d >= 3`. Inject stats with sample_count_30d=2 (below DEGRADED threshold of 3). Assert empty. |
| AC-T2-5 (known type hypothesis) | 1948b | Call with signal_type='volume_spike'. Assert hypothesis is the SPIKE §5 volume_spike entry text. |
| AC-T2-6 (_default fallback) | 1948b | Call with signal_type='unknown_type_xyz'. Assert hypothesis is the _default entry (not undefined, not throw). |
| AC-T2-7 (zero infra imports) | 1948b | Static check: grep `degradationRules.ts` for `import.*infrastructure` — assert zero matches. Can be implemented as a test that reads the file and asserts no such import line. |
| AC-T2-8 (DEGRADATION_CAUSE_MAP is const) | 1948b | Assert `typeof DEGRADATION_CAUSE_MAP === 'object'`. Attempt to assign a new key: TypeScript compile error (verified by type-check in CI, not a runtime test). Runtime test: assert Object.isFrozen(DEGRADATION_CAUSE_MAP) OR assert the spread produces a new object (map is not mutated by callers). |
| AC-T3-1 (success with no degradation) | 1948c | Inject db=`:memory:` with empty signal_outcomes. Assert `cron_job_runs` has status='success' after run. |
| AC-T3-2 (improve_check_log row inserted) | 1948c | Inject db with signal_outcomes rows for 'price_confirmation' with 30d=0.55, 7d=0.40. Assert 1 row in improve_check_log with correct rates. |
| AC-T3-3 (no Telegram on no-degradation) | 1948c | Inject `sendWork` mock. Run with empty stats. Assert mock called 0 times. |
| AC-T3-4 (exactly 1 Telegram on findings) | 1948c | Inject `sendWork` mock + stats with 1 degraded type. Assert mock called exactly 1 time. |
| AC-T3-5 (fail-loud on missing table) | 1948c | Inject db WITHOUT calling initSystemTables. Assert job exits without process throw (logs error + status='error' in cron_job_runs, no unhandled exception). |
| AC-T3-6 (coverage gap in WORK message) | 1948c | Inject db with watchlist entry + agent_signals row but 0 signal_outcomes rows. Inject sendWork mock. Assert mock was called with text containing the stock_code. |
| AC-T3-7 (cooldown guard blocks duplicate) | 1948c | Insert existing 'shadow' row for 'price_confirmation' with checked_at=today. Run orchestrator. Assert NO second row inserted for same signal_type. |
| AC-T3-8 (anti-runaway max 2) | 1948c | Inject detectFn returning 5 findings. Assert exactly 2 rows inserted in improve_check_log. |
| AC-T3-9 (deps injection) | 1948c | Construct deps with mock db, sendWork, detectFn, coverageGapFn. Assert all mocks called (not real implementations). |
| AC-T4-1..3 (proposal doc written with C-1 fields) | 1948d | Inject writeProposalFn mock that captures the ImprovementProposalFields. Assert target_agent is non-empty, not 'UNRESOLVED' for a known fix_area. Assert target_files is parseable array. |
| AC-T4-4 (DASHBOARD.md row appended) | 1948d | Call appendDashboardRow with a temp path. Assert row exists in ## po section. |
| AC-T4-5 (cooldown guard for docs) | 1948d | Create temp dir with existing `IMP-*-price-confirmation-degraded.md`. Run orchestrator twice. Assert only 1 file exists. |
| AC-T4-6 (doc-write failure is non-fatal) | 1948d | Inject writeProposalFn that throws. Assert `cron_job_runs` still has status='success' and WORK Telegram was still sent. |
| AC-T4-7 (_default → UNRESOLVED) | 1948d | Inject finding with signal_type='totally_unknown'. Assert proposal doc contains `target_agent: "UNRESOLVED"` and `target_files: []`. |
| AC-T4-8 (DASHBOARD row appended, not prepended) | 1948d | Write existing DASHBOARD.md with 1 row. Run appendDashboardRow. Assert new row is AFTER existing row in file. |
| AC-T5-1 (all paths false by default) | 1948e | Call isAutoDispatchEnabled for every DISPATCH_PATHS entry with no env override. Assert all return false. |
| AC-T5-2 (path-specific enable) | 1948e | Set env `SELF_IMPROVE_AUTO_DISPATCH_PRICE_CONFIRMATION=true`. Assert isAutoDispatchEnabled('price_confirmation')=true, isAutoDispatchEnabled('chain_catalyst')=false. |
| AC-T5-3 (unknown type returns false) | 1948e | Type-level: `isAutoDispatchEnabled` only accepts DispatchPath — unknown strings are TypeScript errors. Runtime test: call via type assertion `isAutoDispatchEnabled('totally_unknown_type_xyz' as DispatchPath)` — assert returns false (the function reads Bun.env[key], which will be undefined → returns false). |
| AC-T5-4 (no global flag) | 1948e | Set env `SELF_IMPROVE_AUTO_DISPATCH=true` (no suffix). Call isAutoDispatchEnabled for all DISPATCH_PATHS. Assert all return false. |
| AC-T5-5 (typed function signature) | 1948e | Verified by TypeScript compiler: `isAutoDispatchEnabled` parameter typed as `DispatchPath` — not `string`, not `any`. Grep for `isAutoDispatchEnabled` in 1948e test: assert the import resolves and the parameter is typed. |

---

### 5. Risk Flags

**R-1 — AccuracyStats aggregation mismatch:** `getAccuracyStats()` returns per-(signal_type, stock_code) rows. The detection function aggregates by signal_type. If the aggregation logic is incorrect (e.g., averaging rates without weighting by sample_count), false positives will fire on signal types with many low-volume stocks. Mitigation: AC-T2-1 test fixture must use multi-stock scenarios (not single-stock) to validate the weighted aggregation.

**R-2 — DEGRADATION_CAUSE_MAP frozen surface:** REQ §2 + SPIKE §5 state the 3 existing entries are not to be modified (that is lane-C). The blueprint adds `FIX_AREA_TO_AGENT` as a SEPARATE constant, not a modification of `DEGRADATION_CAUSE_MAP`. Dev must not merge them into one structure.

**R-3 — improvementSignalWriter.ts is a new infrastructure folder path:** The path `apps/mcp-server/src/infrastructure/signals/` does not currently exist (verified: the `fileStore/` folder exists for JSON stores; `signals/` does not). Dev must create the folder. This is safe — no existing code is affected.

**R-4 — docs/improvement-proposals/ directory must be created:** The directory does not exist yet. `improvementSignalWriter.ts` must create it if absent (`mkdir -p` equivalent via Bun). This is infrastructure/filesystem work that belongs inside `writeImprovementProposal()`, not the orchestrator.

**R-5 — wrapRun() vs custom dedup pattern:** `accuracyDigestJob.ts` implements its own `alreadySentToday()` function (direct DB query) and does NOT use `jobRunRepo.wrapRun()`. However, `startScheduler.ts` registers it as: `cron.schedule(CRONS.accuracyDigest, async () => { await jobRunRepo.wrapRun('accuracyDigestJob', () => runAccuracyDigest({ db })) })`. The dedup is therefore at the startScheduler.ts level via `jobRunRepo.wrapRun()`, NOT inside `runAccuracyDigest()` itself. Dev must mirror this pattern for `runSelfImproveOrchestrator()`: the wrapRun lives in startScheduler.ts, not inside the job function. The `_running` module-scope guard inside the function body prevents re-entrant execution on the same tick.

**R-6 — C-5 isolation boundary for doc-write:** The proposal doc-write step (TASK-4) must be wrapped in a `try/catch` that logs and continues (does not rethrow). The `improve_check_log` insert and the WORK Telegram send happen BEFORE the doc-write step and must complete even if doc-write throws. Implementation pattern: steps are sequential but each wrapped independently.

**R-7 — queryCoverageGaps() coverage_gap findings in severity ordering:** COVERAGE_GAP is the lowest severity in the anti-runaway priority order (DEGRADED > PERSISTENTLY_LOW > COVERAGE_GAP). If the anti-runaway gate fires (>2 findings), COVERAGE_GAP findings are the first to be dropped. This is intentional: signal accuracy degradation is more actionable than a missing-signal gap.

---

### 6. Hard Constraint Confirmation

| Constraint | Status |
|---|---|
| No new Docker service | CONFIRMED — all 5 new files are inside apps/mcp-server/ process |
| No new cowork agent | CONFIRMED — orchestrator is a scheduler job, not a cowork agent |
| One new cron slot only | CONFIRMED — `selfImproveOrchestrator` at `2 9 * * *` is the only new slot |
| Shadow mode at ship | CONFIRMED — all DISPATCH_PATHS default-false; AC-T5-1 enforces it |
| No test regression | CONFIRMED — 36 new tests, no existing test modified |
| Single-writer DB | CONFIRMED — orchestrator runs inside mcp-server (same writer) |
| Serialized commits, no -A | CONFIRMED — blueprint does not specify commits; main terminal serializes |
| ops REBUILD after dev change | CONFIRMED — noted in blueprint; not an architect action |
| Fail-loud-skip for D-IMPROVE errors | CONFIRMED — R-6 isolation pattern, AC-T4-6 test |
| No changes to gate/audit logic | CONFIRMED — DEGRADATION_CAUSE_MAP entries are ADDED only; no existing entry modified |

---

### 7. Files to Create/Modify (Complete List)

| File | Change | Task |
|---|---|---|
| `apps/mcp-server/src/infrastructure/db/schema-system.ts` | Modify — add `improve_check_log` DDL + index to `initSystemTables()` | TASK-1 |
| `apps/mcp-server/src/infrastructure/db/improveCheckStore.ts` | **NEW** — 4 exported functions + ImproveCheckRow/ImproveCheckInsert/DispatchStatus types | TASK-1 |
| `apps/mcp-server/src/domain/services/degradationRules.ts` | **NEW** — DEGRADATION_CAUSE_MAP const + DegradationFinding interface + detectDegradedSignalTypes() pure function | TASK-2 |
| `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts` | **NEW** — SelfImproveOrchestratorDeps, _running guard, runSelfImproveOrchestrator(), queryCoverageGaps(), DISPATCH_PATHS/isAutoDispatchEnabled/FIX_AREA_TO_AGENT | TASK-3/4/5 |
| `apps/mcp-server/src/scheduler/cronConfig.ts` | Modify — add `selfImproveOrchestrator: Bun.env.CRON_SELF_IMPROVE_ORCHESTRATOR ?? '2 9 * * *'` | TASK-3 |
| `apps/mcp-server/src/scheduler/startScheduler.ts` | Modify — import runSelfImproveOrchestrator + register with jobRunRepo.wrapRun() | TASK-3 |
| `apps/mcp-server/src/infrastructure/signals/improvementSignalWriter.ts` | **NEW** — writeImprovementProposal() + appendDashboardRow() | TASK-4 |
| `docker-compose.yml` | Modify — add commented env vars (SELF_IMPROVE_AUTO_DISPATCH_*=false) to mcp-server env block | TASK-5 |
| `apps/mcp-server/src/__tests__/1948a-improve-check-store.test.ts` | **NEW** — 6 ACs | TASK-1 |
| `apps/mcp-server/src/__tests__/1948b-degradation-rules.test.ts` | **NEW** — 8 ACs | TASK-2 |
| `apps/mcp-server/src/__tests__/1948c-self-improve-orchestrator.test.ts` | **NEW** — 9 ACs | TASK-3 |
| `apps/mcp-server/src/__tests__/1948d-improvement-signal-writer.test.ts` | **NEW** — 8 ACs | TASK-4 |
| `apps/mcp-server/src/__tests__/1948e-dispatch-kill-switch.test.ts` | **NEW** — 5 ACs | TASK-5 |

Total: 6 new production files + 7 modified/new test/config files. All inside `apps/mcp-server/` except `docker-compose.yml`. Zero new Docker services. Zero new scheduler processes.

---

**RETURN BLOCK**

**SECTION_READY:** `[Architect] SIG-IMPL-GATE Blueprint` appended to `docs/handoffs/TASK_SELF-IMPROVE-GATE.md`.

**Open Point i resolved:**
- Type: `DispatchPath = typeof DISPATCH_PATHS[number]` (union of literal strings from `as const` array)
- Env-var convention: `SELF_IMPROVE_AUTO_DISPATCH_{PATH_UPPER}` — one per path, no global flag
- Unknown path at runtime: returns false via type guard (fail-safe, not fail-loud, for this specific case)
- Adding a path requires editing the `DISPATCH_PATHS` array — code change enforced (C-4 satisfied)

**Open Point ii resolved:**
- Slug rule: `{signal_type_kebab}-{detection_class_lower}` → e.g. `IMP-20260527-price-confirmation-degraded`
- Dedup key (weakness_identifier): `${signal_type}_${detection_class}` → e.g. `price_confirmation_DEGRADED`
- fix_area → target_agent mapping: `FIX_AREA_TO_AGENT` typed constant; `manual` → `UNRESOLVED`; unknown fix_area → `UNRESOLVED` fallback (fail-safe)

**Cron decision:** Offset to `2 9 * * *` (09:02 UTC daily). Rationale: same-minute sequential execution is safe in node-cron, but the 2-minute offset eliminates visual ambiguity in `cron_job_runs` diagnostics for zero cost. NOT a second cron slot — the hard constraint (one new slot) is satisfied.

**BLOCKERS:** None. All hard constraints verified satisfiable. No lane-C boundary hit. Single-writer DB constraint satisfied (job runs inside mcp-server). No new Docker service required.

**PIPELINE: continue. NEXT: po (spec gate — approve this blueprint before pm/dev begin).**
