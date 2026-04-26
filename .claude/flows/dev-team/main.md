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

- **FIX**: ≤10 lines ≤3 files no new types — skip BA+Arch+PM
- **SPRINT-S**: ≤30 lines ≤5 files 1 domain
- **SPRINT-M**: multi-domain or 1 new interface
- **SPRINT-L**: arch change or new service
- **UNBLOCK**: blocker + `route_to` agent
- Priority: recurring bugs → UNBLOCK → S → M/L

---

## Step 2: Execute (WIP ≤ 2)

**FIX**
`developer` → `qa` → [`fixer` → `qa`]* → notify work

**SPRINT-S**
`architect` (design + TASKS.md) → per task: `developer` → `qa` → [`fixer` → `qa`]* → notify work

**SPRINT-M/L**
`ba` → `architect` → `pm` → per task: `developer` → `qa` → [`fixer` → `qa`]* → L: post-merge `architect` review → notify work

**UNBLOCK**
`{route_to}` → notify work

---

## Step 3: Scan

`read_telegram_reports(status="new")` — new? → Step 1. None → EXIT

---

## Invariants

- WIP ≤ 2 | TASKS.md ≤ 80 lines | project-stats.json updated each sprint
- Docker restart: after final sprint merge only
- Branch deleted by QA post-merge
- notify work at: fix shipped | sprint complete | blocker resolved | idle
