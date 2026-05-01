# TASK JANITOR-014e — Full test suite verification and JANITOR-015 closure

## Context

After all three extractors have been migrated (JANITOR-014b/c/d), this task runs the full test suite and confirms the baseline is met. It also marks JANITOR-015 as resolved-by-014c because the canonical `detectUnitMultiplier` (400-line scan, `(Triệu VND)` pattern, nghìn/đồng sentinels) is now used by incomeStatementExtractor — which was the exact divergence JANITOR-015 tracked.

## Acceptance Criteria

1. Run `bun test` — result must be >= 8519 passing, zero new failures vs baseline.
2. Confirm `extractorHelpers.ts` is the only file defining `LOOKAHEAD_LINES`, `extractNumber`, `stripDiacritics`, and `detectUnitMultiplier` across the financial-reports folder:
   ```bash
   grep -r "function extractNumber\|const LOOKAHEAD_LINES\|function stripDiacritics\|function detectUnitMultiplier" \
     apps/mcp-server/src/domain/services/financial-reports/
   # Expected: only extractorHelpers.ts appears
   ```
3. Update TASKS.md:
   - Move JANITOR-014 from In Progress to Done.
   - Mark JANITOR-015 as Done with note "resolved by JANITOR-014c — canonical detectUnitMultiplier now used in incomeStatementExtractor".
4. Create `reports/TASK_REPORT_JANITOR-014.md` with: test count before/after, list of removed duplicate functions per file, any edge cases discovered.

## Dependencies

- Requires: JANITOR-014b, JANITOR-014c, JANITOR-014d all complete and merged

## Branch

`task/JANITOR-014e-full-verify`

## Estimated effort

~30min
