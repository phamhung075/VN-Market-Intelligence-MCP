# TASK-1849c — Dev-Team Flow Step 4 Update (with Monitoring Guard)

**Sprint:** 1849
**Type:** SPRINT-S
**Priority:** MEDIUM
**Owner:** developer
**Status:** Todo
**Handoff Created:** 2026-05-07

---

## Objective

Update dev-team cron flow Step 4 (Scan) to:
1. Query new reports (status="new")
2. Query unresolved reports (resolution NOT IN fixed/wontfix/duplicate)
3. Implement C-6 monitoring-only guard to prevent infinite cron loop
4. Archive only fixed/wontfix/duplicate reports

---

## Acceptance Criteria

### AC-1: Query New Reports

- [ ] File: `.claude/flows/dev-team/main.md`
- [ ] Step 4 first reads: `read_telegram_reports(status="new")`
- [ ] If new reports exist, trigger Step 1 (retriage)

### AC-2: Query Unresolved (Non-Terminal) Reports

- [ ] Read unresolved reports using `listUnresolvedReports()` query
- [ ] Unresolved = WHERE `resolution NOT IN ('fixed', 'wontfix', 'duplicate') AND status != 'processed'`
- [ ] Includes `none` (old reports) and `monitoring` (known issues)
- [ ] If unresolved reports exist (excluding monitoring-only), trigger Step 1 (escalation)

### AC-3: Monitoring-Only Guard (C-6 Constraint)

- [ ] If `listUnresolvedReports()` returns ONLY monitoring reports (no new, no none, no claimed/in-progress):
  - DO NOT re-trigger Step 1
  - Log message to WORK: `"N report(s) in monitoring — no action needed."`
  - Proceed to Step 4 archive phase
- [ ] This prevents infinite loop where monitoring reports perpetually retrigger triage

### AC-4: Archive Resolved Reports

- [ ] After all new + unresolved (non-monitoring) handled:
  - Query `read_telegram_reports(status=new|processed, resolution=fixed|wontfix|duplicate)`
  - For each: `process_telegram_report(id=X, resolution="fixed|wontfix|duplicate", delete_telegram_message=true)`
  - Only these 3 resolutions are archived

### AC-5: Idle Message

- [ ] If all steps passed and no reports remain:
  - Send `send_telegram(work, "Dev loop idle.")`
  - Exit Step 4, end cron cycle

### AC-6: Flow Control Logic (Pseudocode)

```
Step 4: Scan

new_reports = read_telegram_reports(status="new")
if new_reports.length > 0:
  send_telegram(work, f"Found {new_reports.length} new report(s)")
  → Step 1 (retriage)
  return

unresolved_reports = listUnresolvedReports()  # resolution NOT IN (fixed, wontfix, duplicate) AND status != processed
non_monitoring = filter(unresolved_reports, resolution != "monitoring")

if non_monitoring.length > 0:
  send_telegram(work, f"Found {non_monitoring.length} unresolved report(s)")
  → Step 1 (escalation/triage)
  return

monitoring_only = filter(unresolved_reports, resolution == "monitoring")
if monitoring_only.length > 0:
  send_telegram(work, f"{monitoring_only.length} report(s) in monitoring — no action needed.")

# Archive all resolved (fixed, wontfix, duplicate):
resolved = read_telegram_reports(resolution IN (fixed, wontfix, duplicate))
for each report in resolved:
  process_telegram_report(id=report.id, delete_telegram_message=true)

send_telegram(work, "Dev loop idle.")
→ EXIT
```

---

## Implementation Notes

### File to Modify

| File | Changes | Estimated Lines |
|------|---------|-----------------|
| `.claude/flows/dev-team/main.md` | Replace Step 4 with new logic + monitoring guard | 30 |

**Total: ~30 lines**

### Flow Pattern (Markdown with pseudocode)

Current Step 4:
```markdown
## Step 4: Scan
- git status check
- read_telegram_reports(status="new")
- if new → Step 1
- mark_processed on all handled
```

New Step 4:
```markdown
## Step 4: Scan

After all tasks completed:

1. **Check for new reports:**
   ```
   new = read_telegram_reports(status="new")
   if new.length > 0:
     send_telegram(work, f"Found {new.length} new report(s)")
     → Step 1 (retriage)
   ```

2. **Check for unresolved (claimed + in-progress + monitoring):**
   ```
   unresolved = listUnresolvedReports()
   non_monitoring = [r for r in unresolved if r.resolution != "monitoring"]

   if non_monitoring.length > 0:
     send_telegram(work, f"Found {non_monitoring.length} unresolved report(s)")
     → Step 1 (escalation)
   ```

3. **Monitoring-only guard (C-6):**
   ```
   monitoring_only = [r for r in unresolved if r.resolution == "monitoring"]
   if monitoring_only.length > 0:
     send_telegram(work, f"{monitoring_only.length} report(s) in monitoring — no action needed.")
     # Do NOT re-trigger Step 1
   ```

4. **Archive resolved reports:**
   ```
   for each report with resolution IN (fixed, wontfix, duplicate):
     process_telegram_report(id, delete_telegram_message=true)
   ```

5. **Idle:**
   ```
   send_telegram(work, "Dev loop idle.")
   → EXIT
   ```
```

### Function Calls Needed

These functions must exist before this task can be tested:
- `read_telegram_reports(status, resolution?)` — returns TelegramReport[]
- `listUnresolvedReports()` — returns TelegramReport[] (implemented in 1849a)
- `process_telegram_report(id, resolution?, delete_telegram_message?)` — implemented in 1849b
- `send_telegram(channel, message)` — already exists

### Key Constraints

- **C-6:** Add monitoring-only guard to prevent infinite loop. If only monitoring reports remain, log and exit (no Step 1 retrigger).

---

## Definition of Done

- [ ] AC-1..6 all checked
- [ ] Step 4 implementation uses correct query filters
- [ ] Monitoring-only guard implemented (no infinite loop)
- [ ] Flow logic matches pseudocode above
- [ ] No syntax errors in .md file
- [ ] Flow runs through dev-team cron without errors
- [ ] Monitoring reports do NOT trigger Step 1 re-entry
- [ ] Code review: confirm C-6 guard present and correct
- [ ] Task report created in `reports/TASK_REPORT_1849c.md`

---

## Dependencies

- **Requires:** 1849a + 1849b merged first
  - 1849a: `listUnresolvedReports()` function
  - 1849b: `process_telegram_report(resolution?)` upgrade
- **Blocked by:** Both 1849a and 1849b

---

## Risk Mitigation

If monitoring reports accumulate >10:
1. PM initiates Sprint 1850 with auto-expiration logic
2. Temporary: dev-team cron operator can manually mark monitoring→wontfix to unblock

---

## Testing

Since this is a flow file (.md), testing occurs through:
1. Dev-team cron execution in next cycle
2. Manual inspection of log output
3. Confirmation that monitoring reports do NOT retrigger Step 1

No new tests in .test.ts files for this task.

