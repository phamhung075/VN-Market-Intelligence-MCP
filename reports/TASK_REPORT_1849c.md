# TASK REPORT — 1849c: Dev-Team Flow Update (Monitoring Guard)

**Date:** 2026-05-07
**Status:** DONE
**File modified:** `.claude/flows/dev-team/main.md`

---

## Changes Made

### Input header
Added unresolved reports as second input source alongside `read_telegram_reports(status="new")`.

### Step 1 (PO Triage)
Added `listUnresolvedReports()` as second triage input so PO considers both new AND unresolved reports when deciding the batch.

### Step 4 (Scan) — full rewrite
Old: 4 bullet items, only checked `status="new"`.

New (6 numbered steps):
1. `git branch` clean check → Step 1 if stale branches.
2. New reports check → `read_telegram_reports(status="new")` → Step 1 if found.
3. Unresolved (non-terminal) check → `listUnresolvedReports()` filtered to `resolution != "monitoring"` → Step 1 (escalation) if found.
4. **C-6 monitoring-only guard** — if only monitoring reports remain, log to WORK and do NOT re-trigger Step 1. Prevents infinite cron loop.
5. Archive phase — `process_telegram_report(id, delete_telegram_message=true)` for `fixed|wontfix|duplicate` only. Resolution guide included.
6. Idle → `send_telegram(work, "Dev loop idle.")` → EXIT.

---

## Acceptance Criteria

- [x] AC-1: `read_telegram_reports(status="new")` checked first in Step 4
- [x] AC-2: `listUnresolvedReports()` query added; non-monitoring subset triggers Step 1
- [x] AC-3: Monitoring-only guard (C-6) implemented — logs, does not re-trigger Step 1
- [x] AC-4: Archive only fixed/wontfix/duplicate with `delete_telegram_message=true`
- [x] AC-5: Idle message sent before EXIT
- [x] AC-6: Flow logic matches pseudocode in handoff

---

## No code changes
Flow file only. No `.ts` files touched.
