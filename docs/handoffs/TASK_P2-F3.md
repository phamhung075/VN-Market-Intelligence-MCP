---
task_id: P2-F3
title: "QA reads flow file, confirms DoD step, counts 3-streak tasks"
phase: "2"
pilot: "technical-analysis"
owner: "qa"
goals: ["G12"]
files_touched: []
status: "PENDING"
blocked_by: ["P2-D3", "P2-E3"]
unblocks: []
estimate_hours: 0.167
ac_count: 5
---

# P2-F3 — QA reads flow file, confirms DoD step, counts 3-streak tasks

**Goal:** G12 (Dev-* agent flow requires dashboard-green before "done") — Final verification

**Description:**
QA verifies that the flow rule was inserted correctly, then tracks the 3-consecutive-task streak: QA-P1-closure (2026-05-22), P2-D3 (AI-fix), and P2-E3 (regression fix). Confirms all three completed under the dashboard-green DoD rule.

---

## Files Touched

None (verification only — evidence in handoff)

---

## Acceptance Criteria

1. **AC-1**: QA reads `.claude/flows/dev-technical-analysis/main.md` — confirms DoD step is present as specified in P2-F2
2. **AC-2**: QA tracks 3 consecutive dev-technical-analysis task completions:
   - Task #1: QA-P1-closure-verification (2026-05-22) — already logged in pilot-status.json g12Streak
   - Task #2: P2-D3 (AI-fix for G10) — qualifies if sandbox evidence in handoff + flow step followed
   - Task #3: P2-E3 (regression fix for G11) — qualifies if sandbox evidence in handoff + flow step followed
3. **AC-3**: For each of tasks #2 and #3: git log shows a sandbox-green commit before the DONE declaration
4. **AC-4**: `pilot-status.json` `goals[G12].g12Streak.tasks` array updated with entries for tasks #2 and #3
5. **AC-5**: `pilot-status.json` `goals[G12].status` updated to `"YES"` when 3 tasks confirmed

---

## Smoke Check

```bash
jq '.goals[] | select(.id == "G12") | .g12Streak' docs/data/pilot-status.json
# Must show completed: 3, tasks: [{...}, {...}, {...}]
```

---

## Atomic Commit Format

```
chore(pilot): P2-F3 — G12 3-task streak confirmed; update pilot-status.json G12=YES

Tasks: QA-P1-closure, P2-D3, P2-E3. All three show sandbox-green evidence before DONE.
Flow rule verified present in dev-technical-analysis/main.md.

Sprint: <sprint>
Task: P2-F3
AC: flow file DoD step confirmed / 3-streak tasks logged / G12 = YES in pilot-status.json
```

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G12  | COMPLETE (3-task streak confirmed under flow rule) |

---

## Dependencies

**Upstream:** P2-D3 (AI-fix task #2), P2-E3 (regression-fix task #3)
**Downstream:** None (G12 complete after this task)

---

## 3-Streak Task Tracking

The three tasks that must be logged:

1. **QA-P1-closure-verification** (2026-05-22, already in pilot-status.json)
   - Task ID: QA-P1-closure-verification
   - Date: 2026-05-22
   - Agent: qa
   - Sandbox green count: 30 / 30
   - Note: QA phase 1 gate — all 30 scenarios green before verdict issued

2. **P2-D3** (AI-fix for G10)
   - Task ID: P2-D3
   - Date: (to be filled)
   - Agent: dev-technical-analysis
   - Sandbox green count: 30 / 30
   - Note: G10 AI-fix task — sandbox green before DONE per new flow rule

3. **P2-E3** (regression fix for G11)
   - Task ID: P2-E3
   - Date: (to be filled)
   - Agent: dev-technical-analysis
   - Sandbox green count: 30 / 30
   - Note: G11 regression fix — sandbox green before DONE per flow rule

---

## Evidence to Record

- Flow file location and excerpt showing DoD step
- Git log entries for tasks #2 and #3 showing sandbox-green commits
- Timestamps of task completions
- Handoff doc references showing sandbox output evidence
- Proof that all three tasks followed the DoD rule
- pilot-status.json update with G12 = YES
