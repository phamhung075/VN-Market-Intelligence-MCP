# Code Janitor — Session 2026-05-09

**Scan 7** (12:15–12:18 UTC)

## Checks Run

1. Check 1 — Duplicate classification maps: 3 files scanned, 0 findings
2. Check 2 — Hardcoded ticker arrays: 3 files scanned, 0 findings
3. Check 3 — Repeated magic numbers / cron duplication: 3 files scanned, 1 finding
4. Check 4 — Schema duplication: 3 files scanned, 0 findings
5. Check 5 — Config drift: 3 files scanned, 0 findings

## Findings

### JANITOR-024 [SHIPPED]

**File:** `apps/mcp-server/src/infrastructure/db/telegramReportStore.ts`

**Issue:** Magic number `4 * 3600` inlined in `isDuplicateReport()` function default parameter (line 318), duplicating the `DEDUP_WINDOW_SECONDS` constant defined at line 219.

**Fix:** Replace default parameter with constant reference.

**Test coverage:** 1215-bug-report-dedup.test.ts — 7 tests pass

**TypeScript:** clean

**Commit:** dd2e6b82

**Status:** shipped directly (single-file mechanical, covered by tests)

## Summary

- Findings: 1
- Shipped: 1
- Backlog tasks created: 0
- Clean areas: 4

## Next scan

Watch for new inline timeout/threshold values appearing in infrastructure/fetchers (continuation of JANITOR-017 monitor).
