Re-create the dev-team cron job. Use CronCreate with:

- cron: `7 * * * *` (every hour at :07)
- prompt: (see below)

```
## Step 1 — PO Triage (Batch Lookahead Mode)

Launch Agent(subagent_type=po) with prompt:
"Run Step 0 (message quality audit). Then scan read_telegram_reports(status='new'), TASKS.md, git log (last 30 commits), recent reports/TASK_REPORT_*.md.

Return a PRIORITY QUEUE of actionable work items (or NOTHING if idle).

Return EXACTLY ONE of these:

NOTHING

BATCH([
  { type: \"FIX\", id: NNN, title: '...', desc: '...', files: ['src/path/to/file.ts:42 — what to change'], baseline_pass: N },
  { type: \"SPRINT\", id: MMM, title: '...', desc: '...', size: \"S\"|\"M\"|\"L\", files: ['src/path:line — injection point'], baseline_pass: N },
  { type: \"UNBLOCK\", id: KKK, blocker: '...', route_to: po|ba|architect|qa }
])

**Priority rules:**
1. Recurring bugs (git log ≥2 commits on same module) → FIX first
2. UNBLOCK (resolves sprint blockers) → before new SPRINT
3. Time-locked tasks (defer until scheduled date, e.g. 233c until 2026-04-22) → queue but note 'deferred'
4. Size=S SPRINT → before size=M/L (faster feedback)

**Ordering:** Return items in execution order (dependencies first, parallelizable items grouped).
**Confirmed locations:** Always include file:line references from your scan — no guessing.

Size rules:
  S = ≤30 lines, ≤5 files, 1 domain, no new interfaces → skip BA, Architect folds TASKS.md
  M = medium scope, multiple domains or 1 new interface → full BA→Arch→PM pipeline
  L = architectural change, new service/repo pattern → full pipeline + Architect post-merge review
FIX rules: ≤10 lines, ≤3 files, no new types/interfaces → skip BA+Arch+PM entirely"

If NOTHING → send_telegram(channel="work", message="Dev loop idle: next scan in 1h.") → exit.
If BATCH → proceed to Step 2 (execute all items in order).

---

## Step 2 — Execute Batch (respect WIP limit of max 2 In Progress)

### For Item Type: FIX

1. Agent(subagent_type=developer):
   "Fix task {id}: {title}. {desc}
   locations={files} baseline={baseline_pass} handoff=docs/handoffs/TASK_{id}.md
   Return CHANGED, NEW_PASS"

2. Agent(subagent_type=qa):
   "Verify fix {title} on branch task/{id}-*.
   Dev changed: {CHANGED} | baseline={baseline_pass} expected={NEW_PASS}
   Return PASS or CHANGES_REQUESTED(file:line — exact issue)"

3. If CHANGES_REQUESTED → Agent(subagent_type=fixer):
   "QA rejected task {id}: {exact_issue}. Fix exactly that — nothing more. bun test + bun tsc, commit, push."
   → repeat step 2

4. send_telegram(channel="work", message="Fix {id} shipped: {title}")

### For Item Type: SPRINT (size=S)

Skip BA. Architect folds TASKS.md update.

1. Agent(subagent_type=architect):
   "Design SPRINT {id}: {title}. {desc}
   PRE-CONFIRMED locations: {files} (verify adjacent lines only, skip brownfield)
   Write handoff files:
     - docs/handoffs/TASK_{id}a.md (RED phase)
     - docs/handoffs/TASK_{id}b.md (GREEN phase)
   Update TASKS.md: add sprint with tasks {id}a (RED) and {id}b (GREEN), status Todo.
   Keep TASKS.md ≤80 lines. Update docs/data/project-stats.json sprint number.
   Return: TASKS=['NNN_a:title', 'NNN_b:title']"

2. For each task in TASKS (check depends_on):
   - If multiple tasks have NO dependencies → launch ALL Dev agents IN PARALLEL
   - If tasks depend on each other → run sequentially

   For each task:
   a. Agent(subagent_type=developer):
      "Implement task {task_id}: {task_title}. handoff=docs/handoffs/TASK_{task_id}.md
      Return CHANGED, NEW_PASS"

   b. Agent(subagent_type=qa):
      "Review task {task_id}: {task_title}. Dev changed: {CHANGED} | baseline → {NEW_PASS} pass.
      Return PASS or CHANGES_REQUESTED(file:line — exact issue)"

   c. If CHANGES_REQUESTED → Agent(subagent_type=fixer):
      "Fix task {task_id}: {exact_issue}. Commit, push."
      → repeat step b

3. Agent(subagent_type=developer):
   "Sprint {id} final: check CHANGED list. If any file under src/scheduler/, src/interface/mcp/, src/infrastructure/db/schema.ts, or src/index.ts → run: launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp && sleep 3 && curl http://localhost:3000/health. Otherwise → bun tsc --noEmit only."

4. send_telegram(channel="work", message="Sprint {id} complete: {title}")

### For Item Type: SPRINT (size=M or L)

Full BA→Arch→PM→Dev→QA pipeline.

1. Agent(subagent_type=ba):
   "Write spec for SPRINT {id}: {title}. {desc}
   PRE-CONFIRMED locations: {files} (use directly, skip brownfield)
   Output: docs/REQ_{id}.md with confirmed file:line references.
   Return: REQ_FILE=docs/REQ_{id}.md"

2. Agent(subagent_type=architect):
   "Design SPRINT {id}. Input: {REQ_FILE}. BA confirmed: {files} (verify adjacent only).
   Output: docs/TECH_{id}.md + docs/handoffs/TASK_{task_id}.md for each task.
   Return: TECH_FILE, TASKS_PROPOSED=['NNN_a:title:layer', ...]"

3. Agent(subagent_type=pm):
   "Create sprint tasks from {TECH_FILE}. Architect proposed: {TASKS_PROPOSED}.
   Update TASKS.md + docs/data/project-stats.json.
   Return: TASK_ORDER=['NNN_a', 'NNN_b', ...]"

4. For each task in TASK_ORDER (check depends_on, same parallelism rules):
   a. Agent(subagent_type=developer): Implement
   b. Agent(subagent_type=qa): Review
   c. If CHANGES_REQUESTED → Agent(subagent_type=fixer): Fix → repeat b

5. If size=L → Agent(subagent_type=architect):
   "Post-merge review for sprint {id}. git diff main~N..main. Verify TECH_{id}.md compliance.
   Return APPROVED or ISSUES=['file:line — issue']"

6. Agent(subagent_type=developer): Sprint final cleanup + restart if needed.

7. send_telegram(channel="work", message="Sprint {id} complete: {title}")

### For Item Type: UNBLOCK

Route to correct agent based on route_to:
- po → Agent(subagent_type=po): Resolve, update SPRINT_GOAL.md
- ba → Agent(subagent_type=ba): Clarify spec, update docs/REQ_NNN.md
- architect → Agent(subagent_type=architect): Propose solution, update docs/TECH_NNN.md
- qa → Agent(subagent_type=qa): Root cause analysis

send_telegram(channel="work", message="Blocker resolved for task {id}: {blocker}")

---

## Step 3 — Incremental Scan (not full re-scan)

After completing all BATCH items:

check_for_new_telegram_reports(status='new')
  IF new reports exist:
    send_telegram(channel="work", message="New reports detected. Running full triage...")
    go back to Step 1 (full scan + new batch)
  ELSE:
    send_telegram(channel="work", message="Dev loop idle. Monitoring for next 1h.")
    exit cron

---

## Invariants (never skip)

- **Batch Mode:** PO returns BATCH([...]) in priority order, not single items. Step 2 executes all items respecting WIP limit.
- **Incremental Scan:** Step 3 checks new telegram reports only (fast), not full re-scan. Full re-scan only if new reports exist.
- **WIP Limit:** Max 2 In Progress in TASKS.md across entire batch at any time.
- TASKS.md ≤ 80 lines always. Done sprints → docs/archive/sprints-NNN-NNN.md immediately after merge.
- docs/data/project-stats.json updated on every new sprint.
- reports/TASK_REPORT_NNN.md written by QA after every task review.
- send_telegram(channel="work") at: fix shipped, sprint complete, blocker resolved, dev loop idle, new reports detected.
- launchctl kickstart only after final sprint merge — never mid-sprint.
- Branch deleted (local + remote) by QA after merge. git checkout main verified.
- Handoff docs are SSOT — agents read them, not the full codebase.
- Dev returns CHANGED+NEW_PASS so QA never re-discovers what changed.
- Confirmed file:line locations flow PO→BA→Arch→Dev — no redundant scanning.
```

## Manage
- `CronList` — view active crons
- `CronDelete <id>` — stop the cron
