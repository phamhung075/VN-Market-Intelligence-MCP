# Dev Team — Cron Orchestration Flow

## Input
`read_telegram_reports(status="new")` | TASKS.md | git log (last 30 commits)

## Output
Tasks executed → TASKS.md updated → WORK notified

---

## Step 1: PO Triage

Launch `po`. Return EXACTLY ONE of:

`NOTHING` → `send_telegram(work, "Dev loop idle.")` → EXIT

`BATCH([{type, id, title, desc, size?, files, baseline_pass}])`

- **FIX**: ≤10 lines ≤3 files no new types — skip planning
- **SPRINT-S**: ≤30 lines ≤5 files 1 domain
- **SPRINT-M**: multi-domain or 1 new interface
- **SPRINT-L**: arch change or new service
- **UNBLOCK**: blocker + `route_to` agent
- Priority: recurring bugs → UNBLOCK → FIX → S → M/L

---

## Step 2: Planning (sequential, one-time per sprint)

**FIX** → skip to Step 3

**SPRINT-S** → `architect` (design + handoffs) → `pm` (TASKS.md breakdown) → Step 3

**SPRINT-M/L** → `ba` → PO approves → `architect` → `pm` → Step 3
  - L only: `architect` post-merge review after last task merged

**UNBLOCK** → `{route_to}` → notify work → EXIT

---

## Step 3: Execution (parallel lanes, WIP ≤ 2)

Launch up to 2 independent tasks concurrently:

```
Lane A │ developer → qa → [fixer → qa]* → APPROVED → merge
Lane B │ developer → qa → [fixer → qa]* → APPROVED → merge
         ↑ starts as soon as a slot is free + task has no pending deps
```

- **Dependency unblock**: QA Done on task N → immediately queue next unblocked Todo task (don't wait for lane to drain)
- **Fixer ceiling**: max 2 rounds → still failing → escalate to `architect`, open new task, STOP lane
- **Per task**: developer reads `docs/handoffs/TASK_NNN.md` → implements TDD → qa reviews → merge on APPROVED → notify work

---

## Step 4: Scan

After each task merged: `read_telegram_reports(status="new")` — new? → Step 1.
All tasks Done + no new work → EXIT

---

## Invariants

- WIP ≤ 2 | TASKS.md ≤ 80 lines | project-stats.json updated each sprint
- Docker restart: after final sprint merge only
- Branch deleted by QA post-merge
- notify work at: fix shipped | sprint complete | blocker resolved | idle
