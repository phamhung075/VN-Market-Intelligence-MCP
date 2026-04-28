# PO — Telegram Reports Flow

## Input
`read_telegram_reports(status="new")` — user requests, bug reports, feature ideas

## Output
TASKS.md updated | processed reports cleaned | architect flagged if recurrent

---

## Step 1: Fetch Reports

```
read_telegram_reports(status="new")
```

Empty → EXIT immediately (no return needed, caller continues).

---

## Step 2: Per-Report Processing

For each report:

### 2a. Parse Intent
Classify: `bug` | `feature` | `ux` | `question` | `feedback`
- `question` → do NOT create task; answer inline in WORK channel → `process_telegram_report(id=..., delete_telegram_message=true)` → next report

### 2b. Dedup Check
Search TASKS.md for keyword overlap (title + description):
- ≥80% keyword match → **duplicate** → skip task creation
- Log: `"[PO] Report #ID skipped — duplicate of TASK-NNN"` in WORK channel
- `process_telegram_report(id=..., delete_telegram_message=true)` → next report

### 2c. Recurrence Check
For non-duplicate reports, check if this pattern has appeared before:
```bash
grep -i "<keywords>" docs/TASKS.md
git log --oneline --all --grep="<keywords>" | head -10
```
- ≥2 previous occurrences of same module/component → **recurrent issue**
  - Create task with prefix `[ARCH REVIEW]` in title
  - Add note in description: `"Recurrent: same issue found N times in history. Architect root-cause review required before fix."`
  - Set `priority: high`

### 2d. Create Task
Add to TASKS.md:
```
| TASK-NNN | [ARCH REVIEW?] <title from report> | pending | <ba|developer|ops> | telegram:#ID |
```

Agent assignment:
- `bug` (infra) → `ops`
- `bug` (code) → `developer`
- `feature` | `ux` → `ba` (needs spec first)
- `feedback` → `po` (PO handles directly)

### 2e. Clean Report
```
process_telegram_report(id=..., delete_telegram_message=true)
```

---

## Step 3: Summary

After all reports processed:
```
send_telegram(channel="work", message="[PO] Telegram Reports: N processed | K tasks created (J arch-review flagged) | M duplicates skipped")
```

---

## Return

```
## RETURN
DONE: Telegram reports processed — N tasks created, K flagged for architect review
NEXT: [next agent per pipeline] | [continue sprint work]
PIPELINE: continue
```
