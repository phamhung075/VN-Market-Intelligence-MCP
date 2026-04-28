# Dev Team — Cron Orchestration Flow

## Input
`read_telegram_reports(status="new")` | TASKS.md | git log (last 30 commits) | `git branch` (stale branch audit)

## Output
Tasks executed → TASKS.md updated → WORK notified

---

## Step 1: PO Triage

Launch `po`. Triage inputs:
- `read_telegram_reports(status="new")`
- TASKS.md
- `git log --oneline -30`
- `git branch` — list all branches; flag any non-main branch as a **CLEAN** task if it has 0 unmerged commits (`git log main..<branch> --oneline` returns empty) or is a stale worktree branch

Return EXACTLY ONE of:

`NOTHING` → `send_telegram(work, "Dev loop idle.")` → EXIT

`BATCH([{type, id, title, desc, size?, files, baseline_pass}])`

- **FIX**: ≤10 lines ≤3 files no new types — skip planning
- **SPRINT-S**: ≤30 lines ≤5 files 1 domain
- **SPRINT-M**: multi-domain or 1 new interface
- **SPRINT-L**: arch change or new service
- **UNBLOCK**: blocker + `route_to` agent
- **CLEAN**: stale branch list to delete + worktrees to remove → route to `qa`
- Priority: recurring bugs → UNBLOCK → FIX → CLEAN → S → M/L

---

## Step 2: Planning loop (sequential by nature — each needs previous output)

**FIX** → skip to Step 3

**SPRINT-S**:
1. Spawn `architect` → read return
2. Spawn `pm` → read return (contains task list + deps) → Step 3

**SPRINT-M/L**:
1. Spawn `ba` → read return
2. Spawn `architect` → read return
3. Spawn `pm` → read return → Step 3
   - L only: after last merge → spawn `architect` post-merge review

**UNBLOCK** → spawn `{route_to}` → read return → `send_telegram(work, "Unblocked: [brief]")` → EXIT

**CLEAN** → spawn `qa` with branch list → qa runs:
```
for each branch:
  unmerged=$(git log main..<branch> --oneline | wc -l)
  if unmerged == 0: git branch -d <branch>
  if worktree: git worktree remove --force <path> && git branch -D <branch>
  if unmerged > 0: report to WORK — "Branch <name> has N unmerged commits — manual review needed"
git push origin --prune  # clean up remote refs
```
→ EXIT

---

## Step 3: Execution loop (parallel where possible)

Read `pm` return to get task list + dependency map. Then:

**Group tasks by dependency tier:**
```
Tier 1: tasks with no deps → spawn ALL developers in one message (parallel)
Tier 2: tasks that depend on Tier 1 → spawn after Tier 1 Done
Tier 3: tasks that depend on Tier 2 → etc.
```

**Per tier — main terminal spawns all independent tasks together:**
```
# Example: Tier 1 has task A and task B (no shared files, no deps)
→ ONE message: Agent(developer, task A) + Agent(developer, task B)
→ Read both returns

# QA for completed tasks — also parallel if different branches:
→ ONE message: Agent(qa, task A) + Agent(qa, task B)
→ Read both returns

# Fixer if needed — parallel per task:
→ ONE message: Agent(fixer, task A) + Agent(fixer, task B)
```

**Conflict check before parallel spawn** (main terminal must verify):
- Different files → ✅ parallel
- Same file modified by both → ❌ sequential
- Task B `depends_on` Task A → ❌ sequential (wait for A Done)
- Same test suite → ⚠️ parallel ok if different test files

**After each tier completes:**
- Spawn `pm` to update TASKS.md + unblock next tier → read return → spawn next tier

---

## Step 4: Scan

After all tasks Done:
1. `git branch` — any non-main branches remain? → add CLEAN batch → Step 1.
2. `read_telegram_reports(status="new")` — new? → Step 1.
3. Nothing → `send_telegram(work, "Dev loop idle.")` → EXIT

---

## Invariants

- WIP ≤ 2 | TASKS.md ≤ 80 lines | project-stats.json updated each sprint
- Docker restart: after final sprint merge only
- Branch deleted by QA post-merge
- notify work at: fix shipped | sprint complete | blocker resolved | idle
