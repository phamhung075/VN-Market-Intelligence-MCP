# Dev Team — Scan

## docs_required
> Read ALL of the following in a single parallel tool call before Step 1.

- docs/TASKS.md    # why: check remaining tasks and new reports

## Step 1: Expire stale monitoring reports

Call `expire_monitoring_reports` via MCP gateway:

```
result = expire_monitoring_reports()
log to notebook: "[dev-team] Expired {result.expired} monitoring reports (>72h)"
```

This flips stale monitoring reports (resolution="monitoring", age >72h) to "wontfix" so the archive loop picks them up in Step 2 sub-step 5.

## Step 2: Post-execution checks

1. `git branch` — any non-main branches remain? → add CLEAN batch → return to triage flow.

2. **Check new reports:**
   ```
   new = read_telegram_reports(status="new")
   if new.length > 0:
     send_telegram(work, f"Found {new.length} new report(s)")
     → return to triage flow
   ```

3. **Check unresolved (non-terminal) reports:**
   ```
   unresolved = listUnresolvedReports()  # resolution NOT IN (fixed, wontfix, duplicate) AND status != processed
   non_monitoring = [r for r in unresolved if r.resolution != "monitoring"]

   if non_monitoring.length > 0:
     send_telegram(work, f"Found {non_monitoring.length} unresolved report(s)")
     → return to triage flow (escalation)
   ```

4. **Monitoring-only guard (C-6):** If `listUnresolvedReports()` returns ONLY monitoring reports (resolution="monitoring"), do NOT re-trigger triage.
   ```
   monitoring_only = [r for r in unresolved if r.resolution == "monitoring"]
   if monitoring_only.length > 0:
     send_telegram(work, f"{monitoring_only.length} report(s) in monitoring — no action needed.")
     # Do NOT re-enter triage — proceed to archive + exit
   ```
   This prevents infinite cron loops from perpetually-unresolved reports.

5. **Archive resolved reports** (fixed / wontfix / duplicate only):
   ```
   for each report with resolution IN (fixed, wontfix, duplicate):
     process_telegram_report(id, delete_telegram_message=true)
   ```
   Resolution guide:
   - Fixed after code change → `process_telegram_report(id, resolution="fixed")`
   - Transient/informational → `process_telegram_report(id, resolution="wontfix")`
   - Deferred for observation → `process_telegram_report(id, resolution="monitoring")`

6. Nothing remaining → `send_telegram(work, "Dev loop idle.")` → EXIT

## Step 3: Proactive Compact Checkpoint

> Invariant: timestamp = current UTC, never future, never speculative.

### Notebook + pipeline-state timestamp guard
- Before writing `docs/pipeline-state.json` or `docs/agent-memory/notebooks/main.md`, ALWAYS get current UTC via:
  ```
  date -u +"%Y-%m-%dT%H:%M:%SZ"
  ```
- Use the returned value verbatim — NEVER speculatively round up, NEVER pick a future minute, NEVER guess "approximate close time"
- This applies to `updatedAt` in pipeline-state.json AND to the `**Written:** YYYY-MM-DD HH:MM UTC` header line in notebooks/main.md
- If notebook contains task table rows with timestamps, each timestamp must reflect actual measured UTC at that step

Run this **after Step 2 exits cleanly and before re-entering triage** (i.e., when more work exists):

```
if ctx > 25%:
  1. log_agent_work(tag="sprint-boundary", state=current_sprint_id)
  2. Write: docs/agent-memory/notebooks/main.md (current tier, next sprint intent)
  3. git add docs/agent-memory/notebooks/main.md && git commit -m "chore(memory/dev-team): notebook YYYY-MM-DD"
     (Convention: docs/policies/commit-convention.md § Notebook Commits)
  4. send_telegram(work, "Sprint boundary — offloaded state, ctx at N%")
  5. Return
     → stop-context-advisor.sh fires automatically on every response end
     → ctx >40%: osascript types /compact into main terminal (iTerm2 only)
     → ctx 30-40%: injects decision:block warning
     → ctx <30%: no action needed, hook exits silently
```

After compact, resume from triage using the Resume Protocol in smart-compact-protocol.md.

**If ctx ≤ 25%:** skip — proceed directly to triage.

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

## RETURN

```
DONE: Scan complete — N reports archived, loop idle
PIPELINE: complete
```

---

## next_flows (compose)
> After this flow, you MAY read AND follow any of the below. Multiple allowed.
- → flows/dev-team/triage.md      # when: new Telegram reports arrived OR non-main branches remain after execution
- → STOP                          # when: no new reports, no unresolved items, loop idle
