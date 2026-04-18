Re-create the dev-team cron job. Use CronCreate with:

- cron: `7 * * * *` (every hour at :07)
- prompt: (see below)

```
## Step 1 — PO Triage

Launch Agent(subagent_type=po) with prompt:
"Run Step 0 (message quality audit). Then scan read_telegram_reports(status='new'), TASKS.md, SPRINT_GOAL.md, docs/data/project-stats.json, recent reports/TASK_REPORT_*.md.
You are fully autonomous — if no pending work, self-initiate a sprint based on project needs.

Return EXACTLY ONE of these structured blocks:

NOTHING

FIX(
  id: NNN,
  title: '...',
  desc: '...',
  files: ['src/path/to/file.ts:42 — what to change here', ...],
  baseline_pass: N
)

SPRINT(
  id: NNN,
  title: '...',
  desc: '...',
  size: S|M|L,
  files: ['src/path/to/file.ts:42 — injection point / change', ...],
  baseline_pass: N
)

UNBLOCK(id: NNN, blocker: '...', route_to: po|ba|architect|qa)

Size rules:
  S = ≤30 lines, ≤5 files, 1 domain, no new interfaces → skip BA, Architect folds TASKS.md
  M = medium scope, multiple domains or 1 new interface → full BA→Arch→PM pipeline
  L = architectural change, new service/repo pattern → full pipeline + Architect post-merge review
FIX rules: ≤10 lines, ≤3 files, no new types/interfaces → skip BA+Arch+PM entirely
Always include confirmed file:line locations from your scan."

If NOTHING → send_telegram(channel="work", message="Dev loop: nothing actionable.") → exit.

---

## Step 2A — FIX route

Use when PO returned FIX(...).

1. Agent(subagent_type=developer):
   "Fix task {id}: {title}. {desc}
   locations={files} baseline={baseline_pass} handoff=docs/handoffs/TASK_{id}.md
   Return CHANGED, NEW_PASS"

2. Agent(subagent_type=qa):
   "Verify fix {title} on branch task/{id}-*.
   Dev changed: {CHANGED} | baseline={baseline_pass} expected={NEW_PASS}
   Return PASS or CHANGES_REQUESTED(file:line — exact issue)"

3. If CHANGES_REQUESTED → Agent(subagent_type=fixer):
   "QA rejected task {id}: {exact_issue}
   Fix exactly that — nothing more. bun test + bun tsc, commit, push."
   → repeat step 2 QA agent

4. send_telegram(channel="work", message="Fix {id} shipped: {title} | {NEW_PASS} pass")

---

## Step 2B — SPRINT route, size=S

Use when PO returned SPRINT(size=S).
Skip BA. Architect folds TASKS.md update.

1. Agent(subagent_type=architect):
   "Design SPRINT {id}: {title}.
   {desc}
   PRE-CONFIRMED locations (skip brownfield for these, verify adjacent only): {files}
   Write handoff files only (no TECH doc for size=S):
     - docs/handoffs/TASK_{id}a.md (RED phase: test file, failing assertions, exact function stubs)
     - docs/handoffs/TASK_{id}b.md (GREEN phase: implementation details, injection points, return types)
   Then update TASKS.md: add sprint block with tasks NNN_a (TDD RED) and NNN_b (GREEN), status Todo.
   Keep TASKS.md under 80 lines — archive Done sprints to docs/archive/sprints-NNN-NNN.md if needed.
   Update docs/data/project-stats.json: increment sprint number.
   Return: TASKS=['NNN_a:title', 'NNN_b:title']"

2. Check handoff `depends_on` field for all tasks in TASKS order:
- If multiple tasks have no inter-dependencies (depends_on is empty or all already-merged) → launch those Dev agents IN PARALLEL (multiple Agent calls in one message). Collect all CHANGED+NEW_PASS returns before starting QA.
- If tasks depend on each other → run sequentially as below.
QA always runs sequentially (merges must be ordered).

For each task in TASKS order:
   a. Agent(subagent_type=developer):
      "Implement task {task_id}: {task_title}.
      handoff=docs/handoffs/TASK_{task_id}.md
      Return CHANGED, NEW_PASS"

   b. Agent(subagent_type=qa):
      "Review task {task_id}: {task_title}.
      Dev changed: {CHANGED} | baseline → expected {NEW_PASS} pass.
      Return PASS or CHANGES_REQUESTED(file:line — exact issue)"

   c. If CHANGES_REQUESTED → Agent(subagent_type=fixer):
      "Fix task {task_id}: {exact_issue}. Commit, push."
      → repeat step b

3. Agent(subagent_type=developer):
   "Sprint {id} final: check CHANGED list from all tasks. If any changed file is under src/scheduler/, src/interface/mcp/, src/infrastructure/db/schema.ts, or src/index.ts → run: launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp && sleep 3 && curl http://localhost:3000/health. Otherwise (pure domain/test change) → run: bun tsc --noEmit only. No restart needed."

4. send_telegram(channel="work", message="Sprint {id} complete: {title} | {NEW_PASS} pass")

---

## Step 2C — SPRINT route, size=M or L

Use when PO returned SPRINT(size=M) or SPRINT(size=L).
Full BA→Arch→PM pipeline with context forwarding.

1. Agent(subagent_type=ba):
   "Write spec for SPRINT {id}: {title}.
   {desc}
   PRE-CONFIRMED locations from PO (use directly — do not re-scan): {files}
   Output: docs/REQ_{id}.md
   Include confirmed file:line references in the DDD Layer Map section.
   Return: REQ_FILE=docs/REQ_{id}.md, CONFIRMED_LOCATIONS={files}"

2. Agent(subagent_type=architect):
   "Design SPRINT {id}: {title}.
   Input: {REQ_FILE}
   BA pre-confirmed these locations — skip brownfield for them, verify adjacent lines only: {CONFIRMED_LOCATIONS}
   Output:
     - docs/TECH_{id}.md
     - docs/handoffs/TASK_{task_id}.md for each atomic task (RED + GREEN handoffs)
   Return: TECH_FILE=docs/TECH_{id}.md, TASKS_PROPOSED=['NNN_a:title:layer', ...]"

3. Agent(subagent_type=pm):
   "Create sprint tasks from {TECH_FILE}.
   Architect proposed: {TASKS_PROPOSED}
   Update TASKS.md: add sprint block. Check git log for recurring bugs before assigning.
   Keep TASKS.md under 80 lines — archive if needed.
   Update docs/data/project-stats.json: increment sprint number.
   Return: TASK_ORDER=['NNN_a', 'NNN_b', ...]"

4. Check handoff `depends_on` field for all tasks in TASK_ORDER:
- If multiple tasks have no inter-dependencies (depends_on is empty or all already-merged) → launch those Dev agents IN PARALLEL (multiple Agent calls in one message). Collect all CHANGED+NEW_PASS returns before starting QA.
- If tasks depend on each other → run sequentially as below.
QA always runs sequentially (merges must be ordered).

For each task in TASK_ORDER:
   a. Agent(subagent_type=developer):
      "Implement task {task_id}: {task_title}.
      handoff=docs/handoffs/TASK_{task_id}.md
      Return CHANGED, NEW_PASS"

   b. Agent(subagent_type=qa):
      "Review task {task_id}: {task_title}.
      Dev changed: {CHANGED} | baseline → expected {NEW_PASS} pass.
      Return PASS or CHANGES_REQUESTED(file:line — exact issue)"

   c. If CHANGES_REQUESTED → Agent(subagent_type=fixer):
      "Fix task {task_id}: {exact_issue}. Commit, push."
      → repeat step b

5. If size=L → Agent(subagent_type=architect):
   "Post-merge review for sprint {id}. git diff main~N..main (N=number of sprint commits). Verify TECH_{id}.md compliance. Return APPROVED or ISSUES=['file:line — issue']."

6. Agent(subagent_type=developer):
   "Sprint {id} final: check CHANGED list from all tasks. If any changed file is under src/scheduler/, src/interface/mcp/, src/infrastructure/db/schema.ts, or src/index.ts → run: launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp && sleep 3 && curl http://localhost:3000/health. Otherwise (pure domain/test change) → run: bun tsc --noEmit only. No restart needed."

7. send_telegram(channel="work", message="Sprint {id} complete: {title} | {NEW_PASS} pass")

---

## Step 2D — UNBLOCK route

Route to the right agent based on route_to field:
- po → resolve with PO agent, update SPRINT_GOAL.md
- ba → BA clarifies spec, update docs/REQ_NNN.md
- architect → Architect proposes solution, update docs/TECH_NNN.md
- qa → QA clarifies test failure root cause

send_telegram(channel="work", message="Blocker resolved for task {id}: {blocker}")

---

## Step 3 — Loop

After completing one item: go back to Step 1.
Repeat until NOTHING or 45-min wall-clock cap.

---

## Invariants (never skip)

- TASKS.md ≤ 80 lines always. Done sprints → docs/archive/sprints-NNN-NNN.md immediately after merge.
- docs/data/project-stats.json updated on every new sprint.
- reports/TASK_REPORT_NNN.md written by QA after every task review.
- docs/SYSTEM_STATUS.md updated by Developer when scheduler/VPS/MCP tool changes.
- send_telegram(channel="work") at: fix shipped, sprint complete, blocker resolved.
- launchctl kickstart only after final sprint merge — never mid-sprint.
- Branch deleted (local + remote) by QA after merge. git checkout main verified.
- Handoff docs are SSOT — agents read them, not the full codebase.
- Dev returns CHANGED+NEW_PASS so QA never re-discovers what changed.
- Confirmed file:line locations flow PO→BA→Arch→Dev — no redundant scanning.
```

## Manage
- `CronList` — view active crons
- `CronDelete <id>` — stop the cron
