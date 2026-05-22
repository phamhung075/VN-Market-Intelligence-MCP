---
task_id: P2-E3
title: "dev-technical-analysis fixes A (triggers B red); fixes B in same cycle; both GREEN"
phase: "2"
pilot: "technical-analysis"
owner: "dev-technical-analysis"
goals: ["G11", "G12"]
files_touched:
  - "Primitive A source file (MODIFY — fix A)"
  - "Primitive B source file (MODIFY — fix B, if regression triggered)"
status: "PENDING"
blocked_by: ["P2-E2"]
unblocks: ["P2-F3"]
estimate_hours: 1.0
ac_count: 6
---

# P2-E3 — dev-technical-analysis fixes A (triggers B red); fixes B in same cycle; both GREEN

**Goal:** G11 (Regression alarm bell works), G12 (Dev flow enforces dashboard-green DoD)

**Description:**
Agent fixes scenario A. Sandbox check immediately shows scenario B flipped RED (regression detected). G12 DoD rule prevents marking DONE. Agent fixes B in the same task cycle without being told. Final sandbox run: ALL scenarios GREEN.

---

## Files Touched

- Primitive A source file (MODIFY — fix A)
- Primitive B source file (MODIFY — fix B, if regression triggered)

---

## Acceptance Criteria

1. **AC-1**: Agent fixes scenario A → runs sandbox → scenario A GREEN, scenario B RED (regression triggered)
2. **AC-2**: G12 DoD rule prevents agent from marking task DONE while B is RED
3. **AC-3**: Agent fixes scenario B in the same task cycle (without being explicitly told about B — the dashboard RED is the signal)
4. **AC-4**: Final sandbox run: ALL 30 scenarios GREEN (A + B + all others)
5. **AC-5**: Evidence: git log shows two commits in the same task: "fix A" then "fix B" (or a combined fix if the root cause is shared); both committed before DONE is declared
6. **AC-6**: QA records: "at least 1 observed case of B flipping RED mid-fix, and agent addressing it before closing the task"

---

## Smoke Check

```bash
cd apps/technical-analysis && go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=all && go run ./cmd/sandbox -tier=module -module=technical-analysis -scenario=all
# Both must exit 0 with all GREEN
```

---

## Atomic Commit Format (fix A)

```
fix(technical-analysis): P2-E3a — fix [primitive A bug] — G11 regression alarm proof

Fix for scenario A. Running sandbox after this commit to check for regressions.

Sprint: <sprint>
Task: P2-E3
AC: scenario A GREEN / G12 sandbox check run / observed scenario B RED (regression triggered)
```

---

## Atomic Commit Format (fix B, same task)

```
fix(technical-analysis): P2-E3b — fix [primitive B regression] triggered by P2-E3a fix

G11: regression alarm observed. B flipped RED during fix of A. Fixed B before declaring DONE.
All 30 scenarios GREEN. G12 DoD satisfied.

Sprint: <sprint>
Task: P2-E3
AC: scenario B GREEN / all 30 scenarios GREEN / G11 observed case recorded / G12 DoD enforced
```

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G11  | COMPLETE (proven by 1 observed regression case) |
| G12  | IN-PROGRESS (streak task #3 — requires flow rule + sandbox evidence) |

---

## Dependencies

**Upstream:** P2-E2 (bug A injected, agent dispatched)
**Downstream:** P2-F3 (3-task streak verification)

---

## Flow Rule Integration (G12)

Per P2-F2 flow rule, agent MUST:
1. Run sandbox after fixing A
2. Detect B RED (regression)
3. NOT mark DONE while B is RED
4. Fix B in same cycle
5. Run final sandbox confirming ALL GREEN
6. Paste sandbox output into handoff before RETURN

This task is a PERFECT test of the dashboard + flow rule working together to detect and require fixing regressions.

---

## Regression Evidence

QA must record in handoff:
- Timestamp when B flipped RED (during fix of A)
- Evidence that agent detected it (git log commit message)
- Evidence that agent fixed both before DONE (two commits)
- Final sandbox output showing all 30 GREEN
