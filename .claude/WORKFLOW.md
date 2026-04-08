# MAS Workflow — Auto-Running Engine

## Overview

This project uses a **Hierarchical Multi-Agent System (MAS)** inspired by Lê Hoàng Dũng's AI Native SDLC.
Instead of a single chatbot, a team of specialized agents collaborate like a real software department.

```
Human (you)
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                   THE CHAIN OF AGENTS                       │
│                                                             │
│  PO → BA → Architect → PM → Developer → QA                 │
│                                           │                 │
│                                     Fixer (if needed)       │
│                                           │                 │
│                              merge to main (after PO ok)    │
└─────────────────────────────────────────────────────────────┘
         ↑
    Gatekeeper Loop
  (pauses for human only at
   Blockers and Smoke Test)
```

---

## The 4 Mechanical Loops (Auto-Running)

### 1. State Management — TASKS.md as Source of Truth

Every agent reads and writes `TASKS.md`.
It is the **shared memory** of the entire team.

```
Kanban columns: Backlog → Todo → In Progress → Review → Done
```

Task row format:
```
| ID  | Title                | Agent    | Layer  | Depends | Branch          | Status      |
| 045 | Cash flow extractor  | Developer| domain | 041 ✓   | task/045-...    | In Progress |
```

**Rules:**
- WIP limit = max 2 tasks In Progress simultaneously
- Never skip a column
- Agent writes status before starting, not after finishing

---

### 2. Handoff Triggers — Automatic Chain Progression

When an agent completes its output, it **triggers the next agent** automatically.

| From | Output | Triggers |
|------|--------|----------|
| Human → PO | New feature idea | PO writes SPRINT_GOAL.md, triggers BA |
| PO → BA | Approved vision in SPRINT_GOAL.md | BA writes REQ_NNN.md |
| BA → Architect | docs/REQ_NNN.md (status: READY_FOR_ARCHITECT) | Architect writes TECH_NNN.md |
| Architect → PM | docs/TECH_NNN.md (status: APPROVED_BY_ARCHITECT) | PM creates tasks in TASKS.md |
| PM → Developer | Task moved to In Progress in TASKS.md + context injection | Developer starts TDD |
| Developer → QA | Task moved to Review in TASKS.md + commit on branch | QA runs test pipeline |
| QA APPROVED → PM | reports/TASK_REPORT_NNN.md (outcome: APPROVED) | PM pulls next task |
| QA CHANGES_REQUESTED → Fixer | reports/TASK_REPORT_NNN.md (blocking issues listed) | Fixer diagnoses and fixes |
| Fixer → QA | Fix log appended + new commit | QA re-reviews |
| All tasks Done → QA | Sprint complete | QA runs smoke test, notifies PO |
| QA smoke test → PO | reports/SPRINT_REPORT_NNN.md | PO gives final sign-off |

**Trigger mechanism**: Each agent checks `TASKS.md` and the `docs/` + `reports/` folder to determine what to do next without human direction.

---

### 3. Context Injection — Feed the Agent Before It Starts

Before any agent starts a task, PM injects full context:

```
Context for Developer Task 045:
  - Read: docs/TECH_045.md (Architect's design)
  - Read: src/domain/services/vnNumberParser.ts (dependency)
  - Read: bctc-schema.ts (interface reference)
  - Create: src/domain/services/cashFlowExtractor.ts
  - Modify: src/domain/services/index.ts
  - Test file: src/__tests__/045-cash-flow-extractor.test.ts
  - Acceptance criteria: [Given/When/Then from TASKS.md]
```

This prevents agents from "getting lost" by reading too much unrelated code.

---

### 4. Gatekeeper Loop — When to Pause for Human

The system runs **autonomously** and only pauses for human input at these gates:

| Gate | Who pauses | Human action required |
|------|-----------|----------------------|
| Blocker list | BA | Answer domain/business questions |
| Smoke test ready | QA → PO | Approve before merge to main |
| Sprint review | PO | Review sprint report, set next sprint goal |

All other issues (test failures, type errors, DDD violations, scraper breakage) are handled internally by the agent chain without disturbing the user.

---

## Sprint Lifecycle (Step-by-Step)

```
[Day 0 — Sprint Planning]
1. Human gives idea → PO writes SPRINT_GOAL.md
2. PO → BA: write REQ_NNN.md
3. ⛔ GATEKEEPER: BA presents blockers → Human answers
4. BA (no blockers) → Architect: write TECH_NNN.md
5. Architect → PM: populate TASKS.md with atomic tasks

[Day 1-2 — Execution]
6. PM assigns Task 045 to Developer (context injection)
7. Developer: RED test → GREEN code → REFACTOR → commit
8. Developer moves task: In Progress → Review
9. PM triggers QA automatically
10. QA: runs bun test + tsc + DDD scan
    → APPROVED: merge branch, update TASKS.md, PM assigns next task
    → CHANGES_REQUESTED: trigger Fixer
11. Fixer: apply minimum fix → re-submit to QA
12. Repeat steps 6-11 for all tasks in sprint

[Day 3 — Sprint Close]
13. All tasks Done → QA runs smoke test
14. ⛔ GATEKEEPER: QA presents smoke test → Human approves
15. PO merges sprint to main
16. Cycle restarts with new sprint goal
```

---

## Agent Quick Reference

| Agent | File | Invocation | Model |
|-------|------|-----------|-------|
| Product Owner | .claude/agents/po.md | New feature / approval | sonnet |
| Business Analyst | .claude/agents/ba.md | After PO sets sprint goal | sonnet |
| Architect | .claude/agents/architect.md | After BA spec approved | sonnet |
| Project Manager | .claude/agents/pm.md | After Architect design done | sonnet |
| Developer | .claude/agents/developer.md | When PM assigns task | sonnet |
| QA / CI-CD | .claude/agents/qa.md | When Developer marks Review | sonnet |
| Fixer | .claude/agents/fixer.md | When QA returns changes | sonnet |
| Market Analyst | .claude/agents/market-analyst.md | Investment analysis | sonnet |

---

## Output Artifacts (what each agent produces)

```
docs/
├── REQ_NNN.md        ← BA: Requirement Spec
└── TECH_NNN.md       ← Architect: Technical Design

reports/
├── TASK_REPORT_NNN.md  ← QA: per-task review report
└── SPRINT_REPORT_NNN.md ← QA: sprint summary

SPRINT_GOAL.md          ← PO: current sprint vision
TASKS.md                ← PM: Kanban board (shared state)
```

---

## How to Start a New Feature (prompt template)

```
Use the @po agent:
"I want to add [feature description] to VN Market Intelligence MCP.
The investment goal is: [what this helps me do as an investor].
Constraints: [budget, timeline, scope exclusions if any]."
```

The PO agent will kick off the full chain automatically.
You will only be interrupted at the two Gatekeeper checkpoints.

---

## Branch hygiene checklist

The production MCP server runs from the `main` branch under launchd supervision on the zenmidi host. **Hot reload is forbidden in this project. Restart = full launchctl kickstart** (`launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp`). Any session that leaves the repo on a non-main branch risks the next restart picking up the wrong working tree.

### Rules (enforced by Developer and QA after every merge)

1. **Return to main**: every task ends with `git checkout main` and a clean working tree.
   ```bash
   git checkout main
   git status --short   # must be empty
   ```

2. **Delete merged branches**: both local and remote, verified with `git cherry`.
   ```bash
   git cherry main origin/<branch>   # must show zero "^+" lines
   git branch -d <branch>
   git push origin --delete <branch>
   ```

3. **Remove worktrees**: any `.claude/worktrees/agent-*` path left after task completion.
   ```bash
   git worktree remove --force .claude/worktrees/<name>
   git branch -D worktree-agent-<name>          # orphan branch if any
   ```

4. **Drop stale stashes**: stashes whose source branch is merged must be dropped.
   ```bash
   git stash list                               # review
   git stash drop stash@{N}                     # drop stash from merged branch
   ```

5. **No overnight feature branches**: if work is incomplete at session end, push WIP to the remote branch so the local copy can be deleted and main remains the live tree.
   ```bash
   git push origin task/NNN-branch-name         # push WIP
   git checkout main                            # return to main
   git branch -d task/NNN-branch-name           # safe to delete locally
   ```
