# QA Validation Report — Two Fixes (Commits 857e4e63 & 52e401cf)

**Date:** 2026-05-06
**Status:** APPROVED
**Validator:** QA Agent

---

## Summary

Both fixes passed all validation checks:

1. **Commit 857e4e63** — fix(news-scout): document urgent_news signal schema
   - Docs-only change (no code modification)
   - Signal tests: **394 pass / 0 fail**

2. **Commit 52e401cf** — fix(mcp): resolve DB schema drift in get_macro_snapshot
   - Code: 3 column name corrections + 2 schema drift guard tests
   - Macro tests: **155 pass / 0 fail**

---

## Detailed Results

### Test Suite Execution

| Test Category | Result | Count |
|---|---|---|
| Signal tests (fix #1 context) | PASS | 394 pass / 0 fail |
| Macro tests (fix #2 directly) | PASS | 155 pass / 0 fail |
| TypeScript check | PASS | 0 errors |

### Code Changes Validation

**Fix #1: .claude/tools/package/news-scout.md**
- 28 insertions, 15 deletions
- Change type: Documentation update
- Impact: Clarifies required `finding_data` fields for `urgent_news` signal
- New requirement: `severity` field (low|medium|high|critical) now explicitly documented
- Blocks: Unblocks Telegram reports 2740+2752

**Fix #2: apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts**
- Column name corrections (3 fixes):
  - Line 595: `fetched_at` → `extracted_at` (tracked_indicators, earning_yield query)
  - Line 603: `fetched_at` → `extracted_at` (tracked_indicators, median_pe query)
  - Line 609: `effective_date` → `fetched_at` (sbv_rates query)
- Root cause: Column names did not exist in actual schema DDL
- Impact: Resolves "no such column" errors in Dinh Gia section
- Blocks: Unblocks Telegram report 2746

**Fix #2: apps/mcp-server/src/__tests__/1570c-dinh-gia-snapshot.test.ts**
- 53 insertions (new schema drift guard tests)
- Tests DG-I-08 & DG-I-09: Verify query column names match actual schema
- Prevents regression of schema drift issues

### DDD Compliance

**PASS** — No domain/infrastructure layer violations detected

- Changes isolated to interface layer (MCP tools)
- Documentation changes only
- No imports from restricted layers

### Security Scan

**PASS** — No security issues found

- No hardcoded credentials or API keys
- No process.env usage (uses Bun.env only where applicable)
- All SQL queries use parameterized prepared statements
- No unvalidated file path access

---

## Files Modified

```
.claude/tools/package/news-scout.md                    (+28, -15)
apps/mcp-server/src/__tests__/1570c-dinh-gia-snapshot.test.ts  (+53, -0)
apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts   (+0, -3 / changes on lines 595, 603, 609)
```

**Total:** 3 files modified, 81 insertions, 18 deletions

---

## Issues Found

### Blocking Issues
None.

### Non-Blocking Issues
None.

---

## Merge Status

**APPROVED FOR MERGE**

Both commits are ready to merge to main:
- All required tests pass (signal + macro coverage)
- TypeScript compilation successful (0 errors)
- Code changes are minimal and well-scoped
- Documentation is clear and accurate
- No security or DDD violations detected

**Next steps:**
1. Merge commits to main
2. Update docs/TASKS.md if applicable
3. Notify affected agents (news-scout, alert-commander)

---

## Test Output Summary

```
Signal tests:  394 pass / 0 fail ✓
Macro tests:   155 pass / 0 fail ✓
TypeScript:    0 errors ✓
```
