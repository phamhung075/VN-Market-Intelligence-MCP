# Docker Close Gate Step-4 — Atomic Head+Board Handoff, Commit-Gated Completion, Journal Discipline

**Date:** 2026-07-09T07:25:08Z · **Author:** agents-architect · **Type:** FIX-DESIGN (RECURRING-BUG root-cause), size M, zone `cross-service/`
**Task:** `UNBLOCK-CLOSEGATE-STEP4-HEAD-SYNC` (PO triage → agents-architect, recurring-bug-escalation tier — 2x router-level ad-hoc fixes: `f4afa0e03` 2026-07-08, `b907a8ea6` 2026-07-09)
**Files touched by this brief's recommendations:** `docs/protocols/docker-deployment-runbook.md` § Microservice Code-Change Close Gate, `docs/agents/ops/flow/docker.md`, `.claude/skills/commit-boundary/SKILL.md` (zone table), a new `scripts/ops-closegate-handoff.jq` — none edited here (agents-architect does not implement; fanout below).

---

## 1. Problem — root cause (re-verified from live evidence, not taken on the backlog row's word)

I pulled the exact jq transform ops actually ran for occurrence 2, from its own decision-journal entry (`docs/agent-memory/decisions/2026-07-09-FACTORY-FRONTEND-SPLIT-DASHBOARD-OPS-CLOSE-GATE.md`, "Board State Transition" section):

```bash
jq '.task_board.review |= map(if .id == "FACTORY-FRONTEND-split-dashboard-analysis" then .next_agent = "qa" else . end)' | bash scripts/orch-apply.sh
```

This is a **hand-rolled, single-purpose, inline jq one-liner, typed fresh on the terminal**, that touches only `.task_board.review[]`. It never references `.head` at all — the omission is not a typo in an otherwise-correct script, it is structural: there is no script here, only an ad hoc filter re-invented per task.

**Why this keeps happening — the missing procedure, not a missing habit.** I compared this against every OTHER place in the codebase where a task-board transition also needs to move `.head`. All of them are backed by a checked-in, reusable, parameterized `.jq` file that mutates the board row and `.head` in the SAME jq expression, run once through `orch-apply.sh`'s single-candidate CAS-gated write:
- `scripts/router-d1-claim.jq` — board claim + `.head` set, one expression.
- `scripts/devteam-backlog-claim-bounded1.jq` — board claim + `.head` set, one expression, explicitly documents "generalizes router-d1-claim.jq's ready[]->in_progress[] + .head set, but with NO hardcoded task ID."
- `scripts/architect-fix-drainesc-severity-gate-design-done.jq` — board owner-handoff, single expression (deliberately leaves `.head` untouched only because a documented router-held lock note says so — an explicit, reasoned exception, not an omission).

The ops Close Gate Step-4→qa handoff is the **only** cross-cutting board-transition point in the whole task-board lifecycle with **no such helper**. `orch-apply.sh` itself imposes no obstacle to combining both writes — it accepts one candidate document per call and validates/CAS-guards it as a whole (confirmed by reading `scripts/orch-apply.sh` directly: single stdin candidate, one Zod validation pass, one mtime-guarded rename). Nothing in the plumbing forces two separate writes. Ops just never had a template to copy.

**Confirms the runbook itself is silent on this exact step.** `docs/protocols/docker-deployment-runbook.md` § Microservice Code-Change Close Gate (ln 116-129) documents Steps 1-4 (disk/mem preflight → rebuild → health check → SHA gate) and Step 5-6 (qa verify, po sign-off) precisely — but has **no row at all** for the board-write/handoff action that must happen between ops's own Step 4 and qa's Step 5. Ops has been improvising this transition from memory/precedent every single time, because there is nothing to follow. That is the true root cause of the `.head` omission.

**The same missing-procedure gap explains the two adjacent process defects occurrence 2 exposed, not two separate bugs:**
- *Uncommitted artifacts:* nothing in the runbook or `docs/agents/ops/flow/docker.md` tells ops it must `git commit` its own notebook/journal/orch-state diff before Step 4 is complete — the runbook's Close-gate table describes *what to check*, never *what to land*.
- *One-off journal filenames:* same gap. I grepped for the anti-pattern and found it is not a one-time slip — **3 occurrences already exist in the repo**, not 1:
  - `docs/agent-memory/decisions/2026-07-08-FACTORY-INTERFACE-FINALIZEBCTC-OPS-CLOSE-GATE.md`
  - `docs/agent-memory/decisions/2026-07-08-FACTORY-DOMAIN-EXTRACT-BCTC-PARSING-LIB-OPS-CLOSE-GATE.md`
  - `docs/agent-memory/decisions/2026-07-09-FACTORY-FRONTEND-SPLIT-DASHBOARD-OPS-CLOSE-GATE.md`

  Meanwhile the CORRECT pattern already exists and was used correctly on two other occasions in the same sprint journal (`docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-ops.md`, `STEP ops-S1`/`STEP ops-S2`) — so ops knows the right pattern and uses it inconsistently, which is exactly what "no enforced procedure, relies on memory" produces.

**DJ-GATE-1 does not close this gap, and I want to be precise about why** (`docs/protocols/agent-chaining-protocol.md` § Journal-before-DONE Gate): DJ-GATE-1 already enforces "journal entry exists, stamped with task-id" — but (a) it fires at the DONE flip (PO's Step 6), two steps after ops's own Step-4 REVIEW-row touch, so a missing/malformed ops journal is not caught until much later, by a different agent; (b) its grep (`grep -rl "task-id:** ${TASK_ID}" docs/agent-memory/decisions/sprint-${SPRINT_ID}-*.md`) reads the **working tree**, not `git log` — it would not have caught occurrence 2 (journal content was correct, just uncommitted and filed under the wrong name) even if it had fired at Step 4. DJ-GATE-1 is real prior art for "gate before flip," but it is the wrong layer for this specific defect and was never wired to Step 4 at all.

## 2. Fix design — three coordinated changes closing all three root causes

### 2.1 Atomic `.head` + board-row write (closes: `.head` omission)

A generalized, parameterized jq helper, following the exact precedent of `scripts/devteam-backlog-claim-bounded1.jq` / `scripts/router-d1-claim.jq` (fanout owner mints the file — contract only, specified here):

**`scripts/ops-closegate-handoff.jq`** — contract:
- Inputs via `--arg`: `task_id`, `from_lane` (e.g. `"review"`), `next_agent` (e.g. `"qa"`), `now`.
- Behavior, in ONE jq expression:
  1. Locate `.task_board.<from_lane>[] | select(.id==$task_id)`. If absent → `error(...)` (refuse — gate-guard convention matching `router-d1-claim.jq`), never a silent no-op.
  2. Set that row's `.next_agent = $next_agent` only (status unchanged — ops does not flip REVIEW/DONE, matching today's correct half of the behavior).
  3. **Conditionally, in the same expression:** `if .head.active_task_id == $task_id then .head.next_agent = $next_agent | .head.updated_at = $now | .head.updated_by = "ops" else . end`. The condition matters — this UNBLOCK task's own backlog row proves `.head` can legitimately point at a *different* task while ops works this one (confirmed live: at brief-authoring time `.head.active_task_id` = `"FACTORY-MACRO-split-repositories"`, a different task ops has not yet closed-gated). A blind unconditional `.head =` would stomp a correct, unrelated pointer — the fix must sync only when `.head` is actually about this task, never force it.
  4. No hardcoded task-id/lane literals in the file body (grep-verifiable, matching `devteam-backlog-claim-bounded1.jq`'s own self-declared invariant).
- Invocation (replaces every future ad hoc terminal one-liner):
  ```bash
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  jq --arg task_id "$TASK_ID" --arg from_lane "review" --arg next_agent "qa" --arg now "$NOW" \
    -f scripts/ops-closegate-handoff.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
  ```
- `docs/protocols/docker-deployment-runbook.md` § Close Gate table gets the currently-missing row, e.g.:
  | Step | Actor | Action |
  |------|-------|--------|
  | 4b | ops | Forward to QA: `scripts/ops-closegate-handoff.jq` (atomic board+head write, invocation above) — **NEVER** a hand-rolled inline jq filter. |

### 2.2 Step-ends-only-on-commit invariant (closes: uncommitted artifacts)

Model directly on **agents-architect's own Brief-Commit Invariant** (`docs/agents/agents-architect/handlers.md`) — dogfooding a pattern that already works reliably in this repo for a different maintenance-lane agent, extended to ops Step 4:

1. After 2.1's write succeeds, ops (still inside Step 4, before returning) runs `git add` on the explicit paths only: `docs/agent-memory/notebooks/ops.md`, `docs/agent-memory/decisions/sprint-<sprint_id>-ops.md`, `docs/data/orch/orch-state.json` — RULE 1 explicit-stage per `.claude/skills/commit-boundary/SKILL.md`. Note: `ops` is not in that skill's per-agent zone table today (only `agents-architect`/`agent-father`/`pm` are) — fanout owner should add an `ops` row scoped to exactly these 3 paths.
2. `git commit` → RULE 2 zone self-check, RULE 3 raw self-verify (`git show --name-only HEAD`) — same 3 rules already codified, no new mechanism invented.
3. Step 4's own RETURN block MUST carry the resulting commit SHA. A Step-4 report that says "board forwarded to qa" **without** a commit SHA is, by this rule, INCOMPLETE — router/PO must bounce it back to ops rather than silently committing ops's artifacts itself. That silent-fallback path is precisely what happened twice (`f4afa0e03`, `b907a8ea6`) and is the behavior this invariant retires.
4. Runbook § Close Gate gets a footnote under the table: *"Step 4/4b are not complete until ops's own commit lands. A router/PO/other-agent commit of ops's uncommitted Close-Gate artifacts is a defect to report, not a recovery path — if it recurs a 3rd time post-fix, escalate per the standing recurring-bug-escalation policy rather than patching again."*

### 2.3 STEP ops-Sn journal-filename enforcement (closes: one-off filenames)

Runbook (or `docs/agents/ops/flow/docker.md` — fanout owner/agent-father picks the better home; runbook is recommended since it is the canonical Close Gate SSOT) gets an explicit line:

> Ops's Close Gate decision-journal entry MUST use the decision-journal skill's own `SPRINT_ID` resolution (`.claude/skills/decision-journal/SKILL.md` § Resolve Sprint ID) and append a `STEP ops-S<N>` block to `docs/agent-memory/decisions/sprint-<resolved-id>-ops.md`. A one-off dated filename (e.g. `docs/agent-memory/decisions/YYYY-MM-DD-<slug>-OPS-CLOSE-GATE.md`) is never correct for this step.

3 existing offenders (listed in §1) should be folded into `sprint-SYSTEMIC-REMAKE-P1-ops.md`'s `STEP ops-Sn` sequence by the fanout owner as part of landing this — they are legitimate content, just filed under the wrong name; do not delete, migrate.

## 3. Sequencing / dependencies

2.1 must land before 2.2 is meaningfully testable (the commit-gate wraps the atomic write). 2.3 is independent and can land in parallel. All three are doc/script-only (no `apps/` code, no rebuild) — a single owner could land all three in one PR, or PO can split by zone: `scripts/ops-closegate-handoff.jq` (new script, Bash/jq authoring) vs. `docs/protocols/` + `docs/agents/ops/flow/` + `.claude/skills/commit-boundary/SKILL.md` (doc edits — agent-father's declared zone per that skill's own table: "agent-father: `docs/agents/` · `docs/agent-memory/` (any notebook) · `.claude/skills/` · `.claude/agents/`"; `docs/protocols/` is not explicitly listed there but its git history shows it is doc-owner-edited the same way — fanout owner should confirm at pickup).

**Live urgency note:** at brief-authoring time, `.head.active_task_id` = `FACTORY-MACRO-split-repositories`, `.head.next_agent` = `ops` — i.e. a task is *currently* sitting at exactly this Step-4 handoff point. If ops closes that gate before this fix lands, the same defect can recur a 3rd time. Per the backlog row's own status_note, a 3rd occurrence should be escalated rather than router-patched again — this brief does not block that in-flight task (not touching `.head`, per dispatch instructions), it only flags the timing risk for PO.

## 4. Explicitly not in scope

- Retrofitting the 3 existing one-off journal files into the `STEP ops-Sn` sequence is folded into the fanout task, not done here (agents-architect does not implement).
- General DJ-GATE-1 hardening beyond the ops Close Gate context — its "working-tree-presence, not committed" gap likely affects other pipeline agents' own DONE-flip checks too (developer/qa/pm). Flagging as a **separate** potential future architecture concern; out of this bug's blast radius (which is specifically the ops→qa Step-4 handoff).
- Redesigning Close Gate Steps 1-4 mechanics (disk/mem preflight, rebuild, health check, SHA gate) — both occurrences' evidence shows these work correctly; only the POST-Step-4 handoff is broken.

## 5. DoD / verification (for the fanout owner(s) to confirm before closing)

1. `scripts/ops-closegate-handoff.jq` exists; no hardcoded task-id/lane literals (grep-verify, matching `devteam-backlog-claim-bounded1.jq`'s stated invariant).
2. Runbook § Close Gate table has an explicit board-write row (2.1) citing the script and invocation.
3. Runbook has the commit-gate footnote (2.2); `.claude/skills/commit-boundary/SKILL.md` zone table has an `ops` row scoped to the 3 Close-Gate paths.
4. Runbook (or `docker.md`) has the `STEP ops-Sn` enforcement line (2.3); the 3 listed offending files are folded into `sprint-SYSTEMIC-REMAKE-P1-ops.md` or explicitly flagged with a follow-up task if folding is deferred.
5. Next real Close Gate execution (dry-run acceptable) produces ONE atomic write moving `.head` and the board row together, plus a real commit SHA present in ops's own Step-4 report — no router/PO cleanup commit needed.

## 6. RETURN

DONE: Brief authored — root cause is a missing canonical procedure at the ops Close Gate Step-4→qa handoff (the only board-transition point in the codebase with no checked-in atomic head+board jq helper), which also explains the two adjacent process defects (no commit-gate, no journal-filename enforcement) rather than these being 3 unrelated bugs.
NEXT: po — triage the 2 fanout backlog rows this cycle mints in `orch-state.json` `.task_board.backlog[]` (`FIX-CLOSEGATE-STEP4-ATOMIC-HANDOFF-SCRIPT`, `FIX-CLOSEGATE-STEP4-COMMIT-JOURNAL-DISCIPLINE`) to the right owner(s) — agent-father for `docs/protocols/` + `docs/agents/ops/flow/` + `.claude/skills/commit-boundary/SKILL.md` edits; developer or ops for `scripts/ops-closegate-handoff.jq` itself.
HANDOFF: `docs/architecture-briefs/2026-07-09-closegate-step4-atomic-handoff.md`
PIPELINE: continue
