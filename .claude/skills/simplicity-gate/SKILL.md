---
name: simplicity-gate
description: >
  Preventive minimalism self-check. Run AFTER tests pass and code committed,
  BEFORE flipping task status to REVIEW. Self-enforced — no human ask.
  Developer answers 4 questions; any YES = simplify first.
version: "2026-06-28"
---

# Simplicity Gate — Pre-REVIEW Self-Check

**When to call:** After all TDD loops pass (GREEN) and code is committed.
Before "Update orch-state IN_PROGRESS → REVIEW" and the RETURN block.

**How:** Answer all 4 questions for every FILE you wrote or modified this task.
"The task" = the Acceptance Criteria in docs/handoffs/TASK_NNN.md — nothing more.

---

## Q1 — Feature Scope

> Does this code contain any feature, configuration knob, flag, or branch
> that the task's Acceptance Criteria do NOT explicitly require?

Examples of excess: optional "mode" param no AC mentions, env-var toggle for
a behaviour with only one caller, extra error-handling path for an error the
task never asked you to handle.

- All NO → continue.
- Any YES → delete the excess now. Re-run tests. Re-commit.

---

## Q2 — Abstraction Necessity

> Is there an interface, base class, factory, wrapper, or helper function
> that has exactly ONE call-site in the current changeset?

A single-use abstraction is a speculation tax on every future reader.
Exception: the abstraction is required by an existing interface contract
(e.g. must satisfy an interface defined outside this task's files).

- All NO → continue.
- Any YES → inline it. Re-run tests. Re-commit.

---

## Q3 — Senior-Engineer Test

> If a senior engineer opened a PR review on this code RIGHT NOW,
> would they comment "this is overcomplicated for what it does"?

Gut-check triggers (any one counts as YES):
- More than 2 layers of indirection to reach the real logic.
- A config struct whose fields are all set to the same value everywhere it is used.
- A "strategy" or "plugin" pattern for something that will never have a second strategy.
- An abstraction named "Manager", "Handler", "Processor", "Service" wrapping ≤5 lines.

- All NO → continue.
- Any YES → flatten/simplify. Re-run tests. Re-commit.

---

## Q4 — Line Ratio Test

> If you count only the lines your task required (lines that directly
> satisfy an AC), are the remaining lines more than 50% of your changeset?

In practice: "Could 200 lines be 50 if I removed speculation?"
This is a ratio signal, not an absolute limit.

- NO (< 50% overhead) → continue.
- YES → identify the speculative block, delete or defer it via a BACKLOG note.
  Re-run tests. Re-commit.

---

## Self-Certification

After passing all 4 questions (all NO, or YES → simplified → re-check → NO):

Append ONE line to the `[Developer] Implementation Record` in the handoff:

```
- **Simplicity gate:** PASS — Q1 scope clean, Q2 no single-use abstractions,
  Q3 senior-test clean, Q4 ratio <50% overhead
```

If you simplified code in response to a YES answer, write what you removed:

```
- **Simplicity gate:** PASS after simplification — removed <what> (Q<N> trigger)
```

---

## What This Gate Does NOT Cover

- DRY violations (same data in two places) → code-janitor owns that lane.
- Post-merge readability polish (naming, comments) → code-simplifier owns that lane.
- Architecture-level over-engineering (wrong service boundary) → architect brief channel.
- Test code — tests are allowed to be explicit and verbose; do not apply Q2/Q4 to test files.

---

## QA Checklist Item (Optional — Belt-and-Suspenders)

QA agent MAY verify that the handoff's Implementation Record contains a
"Simplicity gate: PASS" line. If absent and the changeset is > 100 lines:

```
Raise: [SIMPLICITY-GATE-MISSING] — developer did not run simplicity gate.
Route: back to developer (REVIEW → IN_PROGRESS) with note "run simplicity-gate skill".
```

This is advisory for QA — not a hard-block unless the task's DoD explicitly
lists simplicity-gate as a mandatory gate.
