# Architecture Brief: Simplicity Gate Skill

**ID:** SIMPLICITY-GATE-SKILL-2026-06-28
**Date:** 2026-06-28
**Author:** agents-architect
**Status:** READY-FOR-IMPLEMENTATION
**Target agent:** agent-father

---

## 1. Problem Statement

The system has NO preventive minimalism gate at authoring time. Dev-* agents trend toward DDD/3-tier/factory maximalism because every existing quality gate fires AFTER code lands:

- `code-janitor` — DRY/structural duplication scanner, cron-based, reactive.
- `code-simplifier` — post-QA readability; polishes already-merged code.
- `self-critique` — end-of-cycle review; PLAN-ONLY, does not block REVIEW flip.

None of these fire between "TDD GREEN" and "task flipped to REVIEW". That gap is where unnecessary abstractions, surplus config knobs, and over-engineered error-handling accumulate uncontested.

The Simplicity First principle from the Karpathy coding skill (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution) maps cleanly to this gap without conflicting with our autonomy doctrine: it is a self-check the agent runs, not a human-ask gate.

---

## 2. Scope Decisions (Pre-settled — Do Not Re-derive)

| Principle | Status | Reason |
|---|---|---|
| Goal-Driven Execution | OUT — massively over-covered | exec-proof-gate, QA gate, self-critique, DoD gates |
| Surgical Changes | OUT of scope | Style-matching + zone-enforcement + 120L split; minor residual gap, not worth a new skill |
| Think Before Coding (stop-and-ask) | OUT — doctrine conflict | "Never ask user / auto-continue" autonomy doctrine; suppressed by design |
| **Simplicity First** | **IN — this brief** | Only preventive gap; self-check = no doctrine conflict |

---

## 3. Skill Specification

### 3.1 Skill metadata

**Path:** `.claude/skills/simplicity-gate/SKILL.md`
**Trigger:** authoring-time, called by dev-* agent immediately after tests pass and code is committed, before the task status flips to REVIEW.
**Format:** lazy-load, ≤200L, standard SKILL.md frontmatter.

### 3.2 Exact skill body

The skill is a self-enforced 4-question checklist the developer agent runs autonomously. On any YES → developer MUST simplify before proceeding. On all NO → self-certify and continue.

```
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
```

### 3.3 Line count

The body above is approximately 110 lines. Including frontmatter and headers: under 130L. Well within the ≤200L lazy-load cap.

---

## 4. Wiring into the Dev-Team Handoff Chain

### 4.1 Verified insertion point

Based on direct inspection of the three authoritative dev flow files:

| Flow file | Verified "After code" step | Insert after | Insert before |
|---|---|---|---|
| `docs/agents/developer/flow/main.md` | Line 97–108 (tests pass + commit) | Decision journal entry | "Doc update + graphify" |
| `docs/agents/developer/flow/microservice-main.md` | Line 96–111 (tests pass + commit) | Commit step | "Documentation review" |
| `docs/agents/dev-frontend/flow/main.md` | Line 95–103 (tests pass + G12 gate) | Commit step | "Documentation review" |

### 4.2 Standard wiring line

Add this single-line reference at the insertion point in each flow file:

```markdown
**Simplicity gate** (before REVIEW) → skill: `.claude/skills/simplicity-gate/SKILL.md`
Run after all tests GREEN and code committed. Self-check: all 4 questions NO (or simplify + re-run).
Certify in handoff Implementation Record before proceeding to doc update.
```

### 4.3 All other dev-* specialist flows

The same wiring line applies to any other `docs/agents/dev-*/flow/main.md` that follows the same "After code → Documentation review → Append to handoff" pattern. Agent-father should survey all dev-* flow files and add the wiring at the equivalent insertion point.

---

## 5. Distinction from Existing Reactive Lanes

| Lane | Agent | Trigger | Focus | When |
|---|---|---|---|---|
| **simplicity-gate (NEW)** | developer (self-check) | Pre-REVIEW, authoring time | Scope creep, unnecessary abstraction, line inflation | PREVENTIVE — before code merges |
| code-janitor | code-janitor | Cron / on-demand | DRY: same data expressed in 2+ places | REACTIVE — after code lands |
| code-simplifier | code-simplifier | Post-QA, on-demand | Readability: naming, comments, structural clarity | REACTIVE — after merge |
| self-critique | every agent | End-of-cycle | Per-agent quality self-review | PLAN-ONLY — advisory, no block |

The simplicity-gate is the ONLY gate that:
- Fires before the task reaches REVIEW status.
- Has blocking power (developer MUST simplify before flipping to REVIEW if any question triggers YES).
- Is scoped to "is this code minimal for THIS task?" not "is this code clean in general?"

---

## 6. Autonomy Doctrine Compliance

The skill is a fully self-enforced check. The developer agent answers the questions by inspecting its own diff; there is no `send_telegram`, no `ask_user`, no stop-and-wait. If any question triggers YES, the developer simplifies autonomously and continues. This design is consistent with the "Never ask user / auto-continue" doctrine.

The QA checklist item (§3.2 final block) is advisory and routes back to developer as an automated flow step, not a human-ask gate.

---

## 7. Implementation Instructions for agent-father

1. **Create** `.claude/skills/simplicity-gate/SKILL.md` with the exact body in §3.2.
2. **Add wiring line** (§4.2) to these three flow files at the insertion points in §4.1:
   - `docs/agents/developer/flow/main.md`
   - `docs/agents/developer/flow/microservice-main.md`
   - `docs/agents/dev-frontend/flow/main.md`
3. **Survey** all other `docs/agents/dev-*/flow/main.md` files and add the equivalent wiring line at the "After code → Documentation review" boundary.
4. **Do NOT** add a hard-block flag to the QA flow at this time. The QA checklist item (advisory) is already embedded in the skill body itself — QA agents will load it naturally when they load skill files referenced from the handoff.
5. **Commit** all created/modified files under: `feat(simplicity-gate): add pre-REVIEW minimalism self-check skill`

---

## 8. Dependencies and Sequencing

- No blocking dependencies. This skill creates a new file and adds reference lines to existing flow files.
- No schema changes, no MCP tool changes, no Docker rebuild required.
- Risk: LOW. The wiring is a lazy-load reference; agents that do not load the skill are unaffected until they encounter the wiring line.

---

## 9. Success Criterion

After implementation, every task handoff doc's `[Developer] Implementation Record` section should carry a `Simplicity gate: PASS` line. PO channel audit can surface any handoffs missing the line as a signal that the gate was skipped.
