---
task_id: P2-F2
title: "agent-father inserts dashboard-green DoD step in dev-technical-analysis flow"
phase: "2"
pilot: "technical-analysis"
owner: "agent-father"
goals: ["G12"]
files_touched:
  - ".claude/flows/dev-technical-analysis/main.md (MODIFY — insert DoD step per flow-rule brief)"
status: "READY"
blocked_by: []
unblocks: ["P2-D2", "P2-E2", "P2-F3"]
estimate_hours: 0.5
ac_count: 5
---

# P2-F2 — agent-father inserts dashboard-green DoD step in dev-technical-analysis flow

**Goal:** G12 (Dev-* agent flow requires dashboard-green before "done")

**Description:**
agent-father inserts an explicit Definition-of-Done step into the dev-technical-analysis flow file. This step makes the dashboard sandbox check MANDATORY before task closure, turning the dashboard from a post-hoc check into a pre-commit gate.

---

## Files Touched

- `.claude/flows/dev-technical-analysis/main.md` (MODIFY — insert DoD step per flow-rule brief)

---

## Acceptance Criteria

1. **AC-1**: Flow file contains an explicit step (verbatim or near-verbatim from the brief): "Do not mark task DONE until sandbox dashboard shows all TA scenarios green"
2. **AC-2**: Step is inserted BEFORE the RETURN/DONE block (not after) — enforced pre-close, not post-close
3. **AC-3**: Step includes the exact sandbox command: `cd apps/technical-analysis && go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=all && go run ./cmd/sandbox -tier=module -module=technical-analysis -scenario=all`
4. **AC-4**: Step requires: if ANY scenario is RED → task is NOT done; re-cycle until green
5. **AC-5**: Step requires: sandbox output (pass/fail summary) appended to the task's handoff doc as evidence

---

## Insertion Strategy

Per flow-rule brief, agent-father may use:

**Strategy A (preferred):** Insert the DoD step as a numbered step inside the existing "Pilot Hard Rule (G12 — blocking)" section, directly after the preamble, using the exact command format. The rule section already exists — upgrade it from a header+prose block to a header+numbered-steps block.

**Strategy B (fallback):** If the shared microservice flow's RETURN block is referenced from the pointer file, insert a TA-specific pre-RETURN section in the pointer file that adds the DoD step before delegation to the shared RETURN.

---

## Smoke Check

```bash
grep -c "Do not mark task DONE\|sandbox dashboard\|all TA scenarios green" .claude/flows/dev-technical-analysis/main.md
# Must print ≥ 1
```

---

## Atomic Commit Format

```
feat(agents/dev-technical-analysis): P2-F2 — insert dashboard-green DoD step per G12 flow rule

Adds mandatory sandbox check before DONE. Agent must run all-scenario sandbox, verify GREEN,
append evidence to handoff before marking task complete. Per architect brief p2-f-flow-rule-brief.md.

Sprint: <sprint>
Task: P2-F2
AC: DoD step present / before RETURN block / includes exact sandbox command / RED = not done
```

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G12  | IN-PROGRESS (flow rule inserted, gates P2-D2 + P2-E2) |

---

## Dependencies

**Upstream:** None (P2-F1 brief authored by architect)
**Downstream:** P2-D2, P2-E2 (dispatch agents UNDER the rule), P2-F3 (3-task streak verification)

---

## Critical Path Note

**P2-F2 is on the critical path.** It must complete before P2-D2 and P2-E2 dispatch, otherwise the fix-work tasks do not count toward the 3-task streak (streak requires tasks to be completed UNDER the rule, not before it).

---

## Reference Documents

- Architect brief: `docs/architecture-briefs/2026-05-22-refactor/p2-f-flow-rule-brief.md`
- Charter goal: G12, `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G12

---

## What agent-father Must NOT Do

- Do not rewrite the flow file from scratch
- Do not change the Language Mode table
- Do not change the Smoke Checks table
- Do not change the References table
- Do not add new lazy-load triggers
- Do not duplicate the rule — the existing prose must be replaced by (or upgraded to) the structured step
- Respect agent-md-factory conventions per `feedback_agent_md_factory.md`
