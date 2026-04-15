Re-create the dev-team cron job. Use CronCreate with:

- cron: `7 * * * *` (every hour at :07)
- prompt: (see below)

```
## Step 1 — Check for work
Launch Agent(subagent_type=po) with prompt:
"Check for new work: call read_telegram_reports(status='new'), scan TASKS.md and SPRINT_GOAL.md. You are autonomous — if no pending work, self-initiate a sprint based on project needs. Return exactly one of: NOTHING | FIX(id, title, description) | SPRINT(id, title, description) | UNBLOCK(id, blocker)."

If PO returns NOTHING → send_telegram(channel="work", message="Dev loop: nothing actionable.") → exit.

## Step 2 — Route by PO decision

### FIX(id, title, description)
1. Agent(subagent_type=developer) — "Fix: {title}. {description}. Claim report, read code, apply minimum fix, bun tsc + bun test, git commit, git push, log_fix, launchctl restart."
2. Agent(subagent_type=qa) — "Verify fix {title} on main. Run tests, check commit, write TASK_REPORT. Return PASS or CHANGES_REQUESTED."
3. If CHANGES_REQUESTED → Agent(subagent_type=fixer) — "QA rejected {title}. Report: {qa_output}. Fix exactly what QA flagged, commit, push."
4. send_telegram(channel="work", message="Fix shipped: {title}")

### SPRINT(id, title, description)
1. Agent(subagent_type=ba) — "Write spec for: {title}. {description}. Output: docs/REQ_NNN.md"
2. Agent(subagent_type=architect) — "Design for: {title}. Input: {ba_output_file}. Output: docs/TECH_NNN.md"
3. Agent(subagent_type=pm) — "Create tasks for: {title}. Input: {architect_output_file}. Update TASKS.md."
4. For each task in dependency order:
   a. Agent(subagent_type=developer) — "Implement task {task_id}: {task_title}. TDD. Commit, push."
   b. Agent(subagent_type=qa) — "Review task {task_id}. Return PASS or CHANGES_REQUESTED."
   c. If CHANGES_REQUESTED → Agent(subagent_type=fixer) — "Apply QA feedback for {task_id}, commit, push."
5. Agent(subagent_type=developer) — "Merge all task branches to main, launchctl restart."
6. send_telegram(channel="work", message="Sprint complete: {title}")

### UNBLOCK(id, blocker)
Route to the right agent based on blocker type: po / ba / architect / qa.

## Step 3 — Loop
After completing one item, go back to Step 1. Repeat until NOTHING or 45-min wall-clock cap.

## Rules
- Pass context between agents via file paths, never paste content inline.
- One work item at a time, driven to completion before picking next.
- TASKS.md must stay under 80 lines. Done sprint blocks → docs/TASKS_ARCHIVE.md.
```

## Manage
- `CronList` — view active crons
- `CronDelete <id>` — stop the cron
