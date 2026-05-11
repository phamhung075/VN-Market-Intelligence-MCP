# BATCH-S-1849 — Resolution Tracking for telegram_reports

**Sprint:** 1847 (post-concurrent alert scans)
**Type:** SPRINT-S (≤30 lines, ≤5 files, 1 domain: system alerts)
**Priority:** MEDIUM
**Owner:** developer (cross-zone: mcp-server infra + flow update)
**Created:** 2026-05-07

---

## Problem Statement

The `telegram_reports` table currently tracks only `status = new | processed`.

**Current flow:**
```
Bug Report → status='new' → Dev Team triage → process_telegram_report() → status='processed'
```

**Problem:** Once marked "processed", a report disappears from the dev-team cron loop, even if the underlying issue is NOT actually fixed. The dev-team has no visibility into:
- Reports that were triaged but are still being worked on
- Reports that were dismissed as "won't fix" or "duplicate"
- Reports that are under monitoring (not yet escalated to fix)

**Result:** Recurring issues slip through — same bug fires twice, dev-team doesn't know they're linked because the first report is already hidden.

---

## User Requirement

Add **resolution tracking** to telegram_reports:

1. **New statuses:** `new` → `claimed` → `fixed` | `wontfix` | `duplicate` | `monitoring`
   - `new`: Just arrived
   - `claimed`: Assigned to developer (same as current `claimed_by`)
   - `fixed`: Code fix deployed, issue resolved
   - `wontfix`: Dismissed, not a bug
   - `duplicate`: Links to another report
   - `monitoring`: Known issue, under observation, not yet fixed

2. **MCP tool:** `process_telegram_report()` accepts optional `resolution` field:
   ```
   process_telegram_report(id=42, resolution="fixed")
   ```

3. **Dev-team flow:** Step 4 (Scan) now includes:
   ```
   read_telegram_reports(status="new")     # new reports
   read_telegram_reports(status="unresolved")  # claimed+monitoring → still visible
   ```
   Only reports with `status = fixed | wontfix | duplicate` are removed from the loop.

---

## Acceptance Criteria

### AC-1: Schema Migration (1849a)
- [ ] `ALTER TABLE telegram_reports ADD COLUMN resolution TEXT DEFAULT 'none'`
- [ ] `ALTER TABLE telegram_reports ADD COLUMN resolved_at TEXT`
- [ ] Index on `resolution` for query performance: `CREATE INDEX idx_telegram_reports_resolution`
- [ ] Migration runs safely (IF NOT EXISTS pattern, existing rows default to 'none')

### AC-2: Type Definition (telegramReportStore.ts)
- [ ] `ReportStatus` type extended: `"new" | "claimed" | "fixed" | "wontfix" | "duplicate" | "monitoring"`
- [ ] `TelegramReport` interface includes `resolution: string` and `resolved_at: string | null`
- [ ] Export `type ResolutionStatus = "none" | "fixed" | "wontfix" | "duplicate" | "monitoring"`

### AC-3: Store Functions (telegramReportStore.ts)
- [ ] `markResolved(db, id, resolution, resolvedAt?)` — atomically sets resolution + resolved_at
- [ ] `listUnresolvedReports(db)` — returns status != (fixed|wontfix|duplicate), ordered by created_at ASC
- [ ] `listResolvedReports(db, limit)` — returns status IN (fixed, wontfix, duplicate), for audit
- [ ] All functions return `TelegramReport` with new fields populated

### AC-4: MCP Tool Signature (telegramReportTools.ts)
- [ ] `process_telegram_report(id, resolution?, delete_telegram_message?)`
  - `resolution`: optional enum = `"fixed" | "wontfix" | "duplicate" | "monitoring" | "none"`
  - Default: `"none"` (backward-compatible, existing calls still work)
- [ ] Zod schema validates resolution enum
- [ ] Tool description updated to explain resolution parameter

### AC-5: Process Flow in MCP Tool
- [ ] When `resolution` provided:
  ```
  1. Look up report by id
  2. Validate resolution enum
  3. Call markResolved(db, id, resolution, now())
  4. If delete_telegram_message=true: delete Telegram message
  5. Return confirmation with resolution value
  ```
- [ ] When `resolution` NOT provided: old behavior preserved (no resolution change, backward-compatible)

### AC-6: Dev-team Flow Update (.claude/flows/dev-team/main.md)
- [ ] Step 4 (Scan) updated:
  ```
  Step 4: Scan
  After all tasks Done:
  1. read_telegram_reports(status="new") — any new reports?
  2. read_telegram_reports(status="unresolved") — claimed or monitoring?
  3. If either returns results → Step 1 (retriage)
  4. If all empty → process_telegram_report() for all claimed+fixed → mark as processed
  5. send_telegram(work, "Dev loop idle.")
  ```
- [ ] Flow calls `listUnresolvedReports()` to detect `claimed | monitoring` reports (not yet resolved)
- [ ] Only `fixed | wontfix | duplicate` reports are marked "processed" to be archived

### AC-7: Tests (mcp-server test suite)
- [ ] New test file: `apps/mcp-server/src/__tests__/226b-telegram-resolution.test.ts` OR extend existing `226-telegram-report-store.test.ts`
  - Test `markResolved()` atomicity (concurrent claims)
  - Test `listUnresolvedReports()` filters correctly
  - Test MCP tool with resolution parameter
  - Test backward-compatibility (no resolution → defaults to 'none')
  - Test process_telegram_report() marks resolution on update
- [ ] Run `bun test` — all new tests pass, no regressions
- [ ] Test coverage ≥ 95% for new functions

### AC-8: Query Performance
- [ ] `listUnresolvedReports()` uses index `idx_telegram_reports_resolution`
- [ ] EXPLAIN QUERY PLAN shows index usage (no full table scans)
- [ ] Max query time <10ms on 10k rows

---

## Files to Modify

| File | Changes | Lines |
|------|---------|-------|
| `apps/mcp-server/src/infrastructure/db/schema-system.ts` | Add 2 ALTER TABLE statements (resolution, resolved_at) + index | 10 |
| `apps/mcp-server/src/infrastructure/db/telegramReportStore.ts` | Extend TelegramReport type, add markResolved() + listUnresolvedReports() | 60 |
| `apps/mcp-server/src/interface/mcp/tools/briefings/telegramReportTools.ts` | Update process_telegram_report() Zod schema + tool impl | 50 |
| `.claude/flows/dev-team/main.md` | Update Step 4 (Scan) to check unresolved + only mark fixed/wontfix/duplicate as processed | 20 |

**Total:** 4 files, ~140 lines

---

## Dependencies

- Task 1847d-A must be merged first (concurrent alert scans, no file conflicts with this batch)
- No external API changes
- Backward-compatible: existing `process_telegram_report(id)` calls without `resolution` work unchanged

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Schema migration corruption on old DB | Low | High | Use `ALTER TABLE IF NOT EXISTS` pattern, test on clone. Add rollback rollback script. |
| Backward-compatibility break | Low | Medium | Default resolution='none', existing calls don't specify resolution param. |
| Flow deadlock on infinite unresolved loop | Low | Medium | Step 4 must have 3-strike limit for monitoring — if same report claimed 3x and never resolved, force mark as wontfix. |
| Index fragmentation | Low | Low | VACUUM after initial migration (ops task). |

---

## Implementation Notes

### Statuses Explained

| Status | Meaning | Next Action |
|--------|---------|------------|
| `new` | Just arrived from bug channel | Claim + investigate |
| `claimed` | Assigned to developer | Developer works on fix or monitor |
| `fixed` | Code fix deployed | Mark as processed, archive |
| `wontfix` | Intentional design, not a bug | Archive immediately |
| `duplicate` | Links to existing task | Archive, reference the original |
| `monitoring` | Known issue, observing behavior | Leave visible, re-check tomorrow |
| `none` | Old reports (pre-resolution tracking) | Ignore, or manually triage |

### Dev-team Step 4 Logic (Pseudocode)

```
Step 4: Scan

newReports = read_telegram_reports(status="new")
if newReports.length > 0:
  → Step 1 (retriage new batch)

unresolvedReports = read_telegram_reports(status="unresolved")
if unresolvedReports.length > 0:
  → Step 1 (triage unresolved, may need escalation)

# All new + unresolved handled. Archive resolved:
for each report in read_telegram_reports(status="fixed|wontfix|duplicate"):
  process_telegram_report(id, delete_telegram_message=true)

send_telegram(work, "Dev loop idle.") → EXIT
```

---

## Architect Decisions Needed

1. **Statuses enum:** Confirm the 6 statuses (new, claimed, fixed, wontfix, duplicate, monitoring) or propose alternative?
2. **Monitoring re-check interval:** Should dev-team auto-mark monitoring→fixed after 7 days? Or manual only?
3. **Cascading resolution:** If Report A marked duplicate → should it link to Report B? (OUT OF SCOPE for this sprint, but note for future)

---

## PM Planning Notes

- **Tier 1:** 1849a (schema), 1849b (MCP tool) — can run in parallel
- **Tier 2:** 1849c (flow update) — depends on 1849a + 1849b
- **Est. dev time:** 4-6 hours (schema + types + tests + flow review)
- **QA time:** 1-2 hours (schema safety, edge case testing)
- **Deploy blocker:** None — safe ALTER TABLE with defaults

---

## Backward-Compatibility Statement

✅ **Fully backward-compatible:**
- Existing rows: `resolution` defaults to 'none', `resolved_at` defaults to NULL
- Existing MCP calls: `process_telegram_report(id)` works unchanged (no resolution param)
- Existing flow: dev-team cron will see new resolution field in serialized output but can ignore it (JSON structure neutral)
- Rollback: DROP COLUMN resolution + DROP COLUMN resolved_at + DROP INDEX idx_telegram_reports_resolution (if needed)

---

## QA Sign-off Checklist

After merge:
- [ ] Schema migration ran cleanly on test DB (no corruption)
- [ ] `listUnresolvedReports()` returns only claimed + monitoring (not new, fixed, wontfix, duplicate)
- [ ] MCP tool accepts resolution param and persists correctly
- [ ] Dev-team flow step 4 detects unresolved reports and retriggers
- [ ] No new test failures; baseline maintained ≥8804 pass
- [ ] EXPLAIN QUERY PLAN confirms index usage (no full table scans)
