# PM SPRINT-S-1849 Breakdown — Resolution Tracking for telegram_reports

**Date Created:** 2026-05-07
**Sprint:** 1849
**Type:** SPRINT-S (≤30 lines, ≤5 files, 1 domain)
**Status:** Todo (4 atomic tasks)
**PM Agent:** Claude Code PM

---

## Executive Summary

SPRINT-S-1849 adds resolution tracking to the telegram_reports system. Current state: reports marked "processed" disappear from visibility immediately, even if the underlying issue is still being worked on. **Goal:** Keep unresolved reports visible through the dev-team cron loop using new resolution enum (none/fixed/wontfix/duplicate/monitoring).

**Architecture approved** with 4 mandatory constraints:
- **C-1:** ResolutionStatus = 5 values only (NO "claimed")
- **C-2:** All SELECT statements must project all 10 columns
- **C-4:** Use try/catch ALTER TABLE pattern
- **C-6:** Monitoring-only guard in dev-team flow Step 4 (prevent infinite loop)

---

## Task Breakdown

### 1849a — Schema Migration + Store Functions (dev-mcp-server)

**Type:** INFRA | **Priority:** MEDIUM | **Est. Time:** 1.5h | **Dependency:** None

**Handoff:** `/docs/handoffs/TASK_1849a.md`

**Scope:**
- ALTER TABLE telegram_reports: add `resolution TEXT NOT NULL DEFAULT 'none'`
- ALTER TABLE telegram_reports: add `resolved_at TEXT`
- CREATE compound index on (status, resolution)
- Implement store functions:
  - `markResolved(db, id, resolution, resolvedAt?)` — atomic update
  - `listUnresolvedReports(db)` — WHERE resolution NOT IN (fixed,wontfix,duplicate) AND status != processed
  - `listResolvedReports(db, limit?)` — WHERE resolution IN (fixed,wontfix,duplicate)
- **Fix C-2:** All SELECT statements project all 10 columns (currently omitting claimed_by/claimed_at)

**Files Modified:** 2
- `apps/mcp-server/src/infrastructure/db/schema-system.ts` (~8 lines)
- `apps/mcp-server/src/infrastructure/db/telegramReportStore.ts` (~65 lines)

**Tests:** 5 new test cases in `226-telegram-report-store.test.ts`

**Constraint Compliance:**
- C-2: Fix SELECT gap by projecting all 10 columns ✓
- C-4: Use try/catch pattern for ALTER TABLE ✓

---

### 1849b — MCP Tool Upgrade + serializeReport Fix (dev-mcp-server)

**Type:** FEATURE | **Priority:** MEDIUM | **Est. Time:** 1.5h | **Dependency:** 1849a

**Handoff:** `/docs/handoffs/TASK_1849b.md`

**Scope:**
- Update `process_telegram_report()` Zod schema:
  - Add `resolution: z.enum(["none","fixed","wontfix","duplicate","monitoring"]).optional().default("none")`
  - Keep `id` (required), `delete_telegram_message` (optional)
- Implementation:
  - If `resolution` provided (not "none"): call `markResolved()` from 1849a
  - If not provided: backward-compatible (no resolution change)
- **Fix C-2:** Update `serializeReport()` to include all 11 fields:
  - Was omitting: claimed_by, claimed_at
  - Add: resolution, resolved_at

**Files Modified:** 1
- `apps/mcp-server/src/interface/mcp/tools/briefings/telegramReportTools.ts` (~45 lines)

**Tests:** 3 new test cases

**Constraint Compliance:**
- C-1: ResolutionStatus = 5 values only (no "claimed") ✓
- C-2: serializeReport() includes all fields ✓

---

### 1849c — Dev-Team Flow Step 4 Update (developer)

**Type:** FLOW | **Priority:** MEDIUM | **Est. Time:** 1h | **Dependency:** 1849a + 1849b

**Handoff:** `/docs/handoffs/TASK_1849c.md`

**Scope:**
Update `.claude/flows/dev-team/main.md` Step 4 (Scan phase):

1. Query new reports: `read_telegram_reports(status="new")`
   - If found → trigger Step 1 (retriage)

2. Query unresolved reports: `listUnresolvedReports()` (from 1849a)
   - Filter out monitoring-only: `resolution NOT IN (fixed,wontfix,duplicate) AND resolution != monitoring`
   - If found → trigger Step 1 (escalation)

3. **Monitoring-only guard (C-6):**
   - If only monitoring reports remain (no new, no claimed/in-progress):
   - DO NOT re-trigger Step 1
   - Log: "N report(s) in monitoring — no action needed."
   - Prevents infinite loop

4. Archive resolved reports: process_telegram_report() for resolution IN (fixed, wontfix, duplicate)

5. Idle: send "Dev loop idle." → EXIT

**Files Modified:** 1
- `.claude/flows/dev-team/main.md` (~30 lines)

**Tests:** None (flow testing via cron execution)

**Constraint Compliance:**
- C-6: Monitoring-only guard implemented to prevent infinite loop ✓

---

### 1849d — Tests + Regression Verification (dev-mcp-server)

**Type:** QA | **Priority:** MEDIUM | **Est. Time:** 1h | **Dependency:** 1849a

**Handoff:** `/docs/handoffs/TASK_1849d.md`

**Scope:**
Extend `226-telegram-report-store.test.ts` with 12+ new test cases:

**Store function tests:**
- markResolved() atomicity (resolution + resolved_at set together)
- markResolved() idempotency (unknown id doesn't error)
- listUnresolvedReports() filters correctly (includes none/monitoring, excludes fixed/wontfix/duplicate)
- listUnresolvedReports() excludes status=processed rows
- listResolvedReports() returns only terminal states
- SELECT column projection (all 10 columns) for 4 functions

**MCP tool tests:**
- process_telegram_report(id, resolution="fixed") calls markResolved()
- Backward-compatibility: process_telegram_report(id) without resolution param
- Zod schema defaults resolution="none"
- serializeReport() includes all 11 fields

**Type safety:**
- ResolutionStatus = 5 values only (C-1)
- No "claimed" in enum

**Regression:**
- Run `bun test` → baseline ≥8804 pass, 0 fail
- TypeScript clean: `tsc --noEmit`
- Code coverage ≥95% for new functions

**Files Modified:** 1
- `apps/mcp-server/src/__tests__/226-telegram-report-store.test.ts` (~40 lines)

**Constraint Compliance:**
- C-1: Verify ResolutionStatus = 5 values only ✓
- C-2: Verify SELECT projection across all functions ✓

---

## Execution Order

**Tier 1 (parallel):**
- 1849a (schema + store) — blocker for 1849c, can run with 1849b
- 1849b (MCP tool) — blocker for 1849c, can run with 1849a

**Tier 2 (serial, after Tier 1):**
- 1849c (flow update) — requires 1849a + 1849b merged
- 1849d (tests) — requires 1849a complete

**Critical path:** 1849a + 1849b (parallel 1.5h each) → 1849c (1h) + 1849d (1h) = ~4 hours total

---

## Task Dependencies

```
     1849a
       ↓
    ┌──┴──┐
    ↓     ↓
  1849c  1849d
    ↑
  1849b
```

**Blocking relationships:**
- 1849a blocks: 1849c, 1849d
- 1849b blocks: 1849c
- 1849c depends on: 1849a + 1849b
- 1849d depends on: 1849a

**Non-blocking (can run in parallel):**
- 1849a ↔ 1849b (different files, no conflicts)
- 1849d can start once 1849a is complete (doesn't wait for 1849b)

---

## Success Criteria (Per Architect)

### Mandatory Constraints

1. **C-1: ResolutionStatus = 5 values**
   - ✓ "none" | "fixed" | "wontfix" | "duplicate" | "monitoring"
   - ✗ Remove "claimed" (belongs to claimed_by/claimed_at, not resolution)

2. **C-2: SELECT column coverage**
   - ✓ All SELECT statements project 10 columns: id, message_id, text, from_agent, priority, status, created_at, claimed_by, claimed_at, resolution, resolved_at
   - ✗ No function returns partial columns

3. **C-4: ALTER TABLE pattern**
   - ✓ Use try/catch, not IF NOT EXISTS (SQLite limitation)
   - ✗ Follow existing schema-system.ts lines 266-267 pattern

4. **C-6: Monitoring guard in flow**
   - ✓ If only monitoring reports remain, log to WORK and do NOT re-trigger Step 1
   - ✗ Prevents infinite loop on monitoring-only queue

### Quality Gates

- **Test baseline:** ≥8804 pass, 0 fail (maintained)
- **TypeScript:** `tsc --noEmit` clean
- **Code coverage:** ≥95% for new functions (markResolved, listUnresolved*, listResolved*)
- **Backward-compatibility:** Existing calls to process_telegram_report(id) work unchanged

---

## Risk Register

| Risk | Severity | Probability | Mitigation |
|------|----------|-------------|-----------|
| SELECT gap propagates to new functions | MEDIUM | HIGH | C-2 enforced: all functions must return all 10 columns |
| Monitoring reports create infinite loop | MEDIUM | MEDIUM | C-6 guard: only monitoring → log and exit (no Step 1 retrigger) |
| "claimed" included in ResolutionStatus | HIGH | MEDIUM | C-1 enforced: ResolutionStatus = 5 values only, not 6 |
| Schema migration corrupts old DB | LOW | LOW | Test on clone, use try/catch pattern, keep rollback script ready |
| Backward-compatibility break | LOW | LOW | Default resolution="none", existing calls still work |

---

## WIP Limit Status

**Current In Progress:** 1 task (1847d-A)
**This sprint adds:** 4 tasks (1849a-d)
**WIP Limit:** 2 max

**Recommendation:** Release 1847d-A first, or split 1849 into:
- Release window 1: 1849a + 1849b (parallel)
- Release window 2: 1849c + 1849d (after window 1 merged)

This maintains WIP limit while ensuring proper dependency ordering.

---

## File Manifest

**Handoff Files Created:**
- `/docs/handoffs/TASK_1849a.md` — Schema + store functions
- `/docs/handoffs/TASK_1849b.md` — MCP tool + serializeReport
- `/docs/handoffs/TASK_1849c.md` — Flow Step 4 update
- `/docs/handoffs/TASK_1849d.md` — Tests + regression

**SSOT Updated:**
- `/docs/TASKS.md` — 4 tasks added to Todo section, Backlog cleaned

**Files to Modify During Execution:**
- `apps/mcp-server/src/infrastructure/db/schema-system.ts` (1849a)
- `apps/mcp-server/src/infrastructure/db/telegramReportStore.ts` (1849a)
- `apps/mcp-server/src/interface/mcp/tools/briefings/telegramReportTools.ts` (1849b)
- `.claude/flows/dev-team/main.md` (1849c)
- `apps/mcp-server/src/__tests__/226-telegram-report-store.test.ts` (1849d)

**Total lines to write/modify:** ~140 lines (4 files, excluding tests)

---

## Next Steps

1. **Release 1847d-A first** (currently In Progress, blocks 1849 start)
2. **Assign 1849a + 1849b** to dev-mcp-server (parallel, 1.5h each)
3. **Monitor WIP limit:** keep ≤2 In Progress at all times
4. **Merge 1849a + 1849b** before starting 1849c
5. **Assign 1849c** to developer (1h, blocked by step 3)
6. **Assign 1849d** to dev-mcp-server (1h, parallel with 1849c)
7. **QA sign-off:** schema safety, backward-compat, test baseline ≥8804 pass

---

## Architect Post-Merge Review

NOT required for SPRINT-S. QA sign-off sufficient:
- Schema migration ran cleanly
- listUnresolvedReports() filters correctly
- MCP tool persists resolution
- Flow detects unresolved + monitoring reports
- Test baseline maintained

---

## Notes for Developer

- **1849a:** Read architect ARCH_1849.md C-2 notes — SELECT gap is pre-existing, must be fixed
- **1849b:** Follow Zod pattern in existing tools for consistency
- **1849c:** Check existing dev-team flow syntax before updating Step 4
- **1849d:** Reuse existing 226-telegram-report-store.test.ts describe structure

---

## Documentation References

- **Batch spec:** `docs/handoffs/BATCH_SPRINT_S_1849.md`
- **Architecture:** `docs/handoffs/ARCH_1849.md` (approved with 4 constraints)
- **Task details:** Individual `docs/handoffs/TASK_1849*.md` files (4 files)

