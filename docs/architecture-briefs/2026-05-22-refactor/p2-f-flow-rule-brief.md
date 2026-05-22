---
title: "P2-F Flow-Rule Brief — Dashboard-Green DoD for dev-technical-analysis"
date: "2026-05-23"
author: "architect"
status: "READY-FOR-AGENT-FATHER"
pilot: "technical-analysis"
charter_goal: "G12"
target_flow: ".claude/flows/dev-technical-analysis/main.md"
downstream_agents:
  - "agent-father (implements the flow edit)"
  - "qa (verifies the edit + 3-task streak)"
---

# P2-F Flow-Rule Brief — Dashboard-Green DoD

**Audience:** agent-father (to implement) + qa (to verify)
**Authority:** architect (pilot charter §G12, phase-2-task-plan-go.md §P2-F2)
**DO NOT implement directly.** This brief goes to agent-father; agent-father edits the flow file.

---

## Why This Rule Exists

G12 of the pilot charter requires:

> `flows/dev-technical-analysis/main.md` updated with hard rule. 3 consecutive tasks verified following the rule.

Charter verification method (verbatim):

> QA reads `flows/dev-technical-analysis/main.md` and confirms it contains an explicit step: "Do not mark task DONE until sandbox dashboard shows all TA scenarios green." QA tracks 3 consecutive `dev-technical-analysis` task completions and confirms in each case: (a) git log shows a dashboard-check step before the final commit, (b) the pilot-status.json goal state was updated to IN-PROGRESS during the task, not after.

The flow rule turns the dashboard from a post-hoc check into a pre-commit gate. Without it, an agent may fix a bug in the code but ship a broken dashboard — which defeats the entire point of the pilot's Track B trust layer.

---

## Current Flow File State

**File:** `.claude/flows/dev-technical-analysis/main.md`
**Current state:** The file already has a "Pilot Hard Rule (G12 — blocking)" section that contains the spirit of the rule. However:

1. The rule is positioned as a section header, not as an explicit numbered step in the main flow body.
2. The charter verification method requires the rule to be findable as "an explicit step" — meaning the numbered step must be in the main task flow, not just a reference section.
3. The current sandbox command in the flow uses `go run ./cmd/sandbox -tier=all -module=technical-analysis -scenario=all` which does not match the two-command pattern proven in Phase 1 (`-tier=primitive` then `-tier=module` separately).

This brief specifies the upgrade. agent-father does a surgical edit — NOT a rewrite.

---

## Insertion Point

**Insert AFTER the last substantive task step, BEFORE the RETURN/DONE block.**

In the current flow, the shared microservice flow is at `.claude/flows/developer/microservice-main.md`. The dev-technical-analysis flow is a thin pointer that delegates to the shared flow with a TA-specific extension.

agent-father must identify one of two insertion strategies:

**Strategy A (preferred):** Insert the DoD step as a numbered step inside the existing "Pilot Hard Rule (G12 — blocking)" section, directly after the preamble, using the exact command format. The rule section already exists — upgrade it from a header+prose block to a header+numbered-steps block. This satisfies the charter ("explicit step") without restructuring the flow.

**Strategy B (fallback):** If the shared microservice flow's RETURN block is referenced from the pointer file, insert a TA-specific pre-RETURN section in the pointer file that adds the DoD step before delegation to the shared RETURN.

agent-father picks the strategy that is least invasive. The content of the step is the same regardless of strategy.

---

## Exact Step Language (verbatim — agent-father must include this)

```markdown
### G12 DoD Gate (mandatory — blocking)

**Do not mark task DONE until sandbox dashboard shows all TA scenarios green.**

Run both tiers before declaring complete:

```bash
cd apps/technical-analysis
go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=all
go run ./cmd/sandbox -tier=module -module=technical-analysis -scenario=all
```

Both commands must exit 0 with all scenarios GREEN.

If ANY scenario is RED:
- The task is NOT done.
- Fix the failing scenario before re-running.
- Each fix attempt that does not result in all-GREEN = 1 cycle (counted for G10/G11 evidence).

Evidence requirement: paste the sandbox output (pass/fail summary line) into the task handoff doc before writing the RETURN block.
```

---

## What agent-father Must NOT Do

- Do not rewrite the flow file from scratch.
- Do not change the Language Mode table.
- Do not change the Smoke Checks table.
- Do not change the References table.
- Do not add new lazy-load triggers.
- Do not duplicate the rule — the existing "Pilot Hard Rule (G12 — blocking)" prose must be replaced by (or upgraded to) the structured step above, not doubled.

---

## Verification Protocol for QA

After agent-father's commit lands, QA runs:

```bash
grep -c "Do not mark task DONE\|sandbox dashboard\|all TA scenarios green" .claude/flows/dev-technical-analysis/main.md
```
Must print ≥ 1.

```bash
grep -A 5 "DoD Gate\|Do not mark task DONE" .claude/flows/dev-technical-analysis/main.md
```
Must show the sandbox command block.

QA then tracks the 3-streak tasks:
- Task #1: QA-P1-closure-verification (already logged in pilot-status.json)
- Task #2: P2-D3 (AI-fix for G10) — qualifies if sandbox evidence in handoff
- Task #3: P2-E3 (regression fix for G11) — qualifies if sandbox evidence in handoff

For each of tasks #2 and #3, QA verifies:
- (a) git log for the task shows a sandbox-check commit message reference or sandbox output in the handoff
- (b) pilot-status.json `goals[G12].status` was IN-PROGRESS during the task, not only updated at close

---

## pilot-status.json Updates Required

When QA confirms the 3-streak (P2-F3 task):

```json
{
  "goals": [
    {
      "id": "G12",
      "status": "YES",
      "verifiedAt": "<ISO timestamp of P2-F3 completion>",
      "verifiedBy": "qa (P2-F3 — 3-task streak confirmed)",
      "g12Streak": {
        "required": 3,
        "completed": 3,
        "tasks": [
          {
            "taskId": "QA-P1-closure-verification",
            "date": "2026-05-22",
            "agent": "qa",
            "sandboxGreenCount": 30,
            "sandboxTotalCount": 30,
            "note": "QA phase 1 gate — all 30 scenarios green before verdict issued"
          },
          {
            "taskId": "P2-D3",
            "date": "<date>",
            "agent": "dev-technical-analysis",
            "sandboxGreenCount": 30,
            "sandboxTotalCount": 30,
            "note": "G10 AI-fix task — sandbox green before DONE per new flow rule"
          },
          {
            "taskId": "P2-E3",
            "date": "<date>",
            "agent": "dev-technical-analysis",
            "sandboxGreenCount": 30,
            "sandboxTotalCount": 30,
            "note": "G11 regression fix — sandbox green before DONE per flow rule"
          }
        ]
      }
    }
  ]
}
```

---

## Dependency Chain

```
This brief (architect, done)
  ↓
P2-F2: agent-father edits .claude/flows/dev-technical-analysis/main.md
  ↓
P2-D2: QA dispatches dev-ta with G10 bug (agent now under the rule)
P2-E2: QA dispatches dev-ta with G11 bug (agent now under the rule)
  ↓
P2-F3: QA reads flow + counts streak → G12 = YES
```

P2-F2 is on the critical path. agent-father must complete it before P2-D2 and P2-E2 dispatch, otherwise the fix-work tasks do not count toward the streak (streak requires tasks to be completed UNDER the rule, not before it).

---

## Commit Format for agent-father

```
feat(agents/dev-technical-analysis): P2-F2 — insert G12 dashboard-green DoD step

Adds mandatory G12 DoD Gate section to dev-technical-analysis flow.
Agent must: (1) run both sandbox tiers, (2) verify all GREEN, (3) paste evidence to handoff,
before writing RETURN block. If ANY red: task is not done.

Per architect brief: docs/architecture-briefs/2026-05-22-refactor/p2-f-flow-rule-brief.md
Charter goal: G12, pilot-charter.md §G12.

Sprint: <sprint>
Task: P2-F2
AC: DoD step present / before RETURN / exact sandbox commands included / RED = not done enforced
```
