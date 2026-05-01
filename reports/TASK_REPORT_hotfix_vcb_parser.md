# Task Report: hotfix-vcb-parser — VCB Bank BCTC Parser Fix
date: 2026-04-29
outcome: CHANGES_REQUESTED

## Test Results
- Unit tests (targeted): 23 passed / 0 failed (hotfix-vcb-parser.test.ts + 287-balance-sheet-unit-header.test.ts)
- Full suite: 7908 passed / 117 failed / 21 skipped
- Pre-existing failures baseline (parent commit): 117 — zero new regressions introduced
- TypeScript (bun tsc --noEmit): 4 errors — all confirmed pre-existing on parent commit
- DDD scan: PASS — domain layer has zero infrastructure imports
- Security scan: PASS — no hardcoded secrets, no process.env, no unparameterized SQL

## DDD Compliance: PASS
## Security: PASS

## Issues Found

### Blocking

**B-1: `extractNumber` fallback does not apply year filter (1990–2030)**

File: `apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts`
Lines: 63–70 (fallback loop in `extractNumber`)

The year filter (`val >= 1990 && val <= 2030`) is only applied in the first-pass loop.
The fallback loop (lines 66–70) calls `parseVnNumber` and returns without year-checking.
When all tokens are years or small integers in the first pass, the fallback returns a year value.

Confirmed reproduction: VCB Q1 2025 live PDF — `findValue` look-ahead hits line 1623
("Nghị định 93/2017/NĐ-CP do") — first pass skips 93 (< 999), skips 2017 (year filter),
no large number found. Fallback returns 2017. Resulting DB row: `total_liabilities = 2017`.

Fix required: apply the same year guard in the fallback loop.

```typescript
// Line 66–70 current (broken fallback):
for (let i = tokens.length - 1; i >= 0; i--) {
  const val = parseVnNumber(tokens[i]!);
  if (val !== null) return val;
}

// Fix:
for (let i = tokens.length - 1; i >= 0; i--) {
  const val = parseVnNumber(tokens[i]!);
  if (val === null) continue;
  if (Number.isInteger(val) && val >= 1990 && val <= 2030) continue;
  return val;
}
```

**B-2: VCB live PDF produces `total_liabilities = 2017`, `equity_total = 2025` after hotfix**

Verified in production DB (`/app/data/market.db`, table `financial_reports`):
- `action_code = 'VCB'`, `sort_key = '2025-Q1'`: `total_liabilities = 2017`, `equity_total = 2025`
- These are calendar year values from note references, not financial values
- Root cause: B-1 above
- The current hotfix fixes the test fixtures but does not fix the live PDF

**B-3: `detectUnitMultiplier` loose scan window (50 lines) is too narrow for bank BCTCs**

File: `apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts`
Line: 143 (`const head = lines.slice(0, 50)`)

VCB Q1 PDF has "Triệu VND" at line 307 of the full concatenated text (page 1 is a
5-page cover letter). The loose scan finds nothing in lines 0–49 and falls through
to sentinel -2. For VCB Q1 this happens to be correct (multiplier = 1, values already
in triệu) but the warning "[balanceSheetExtractor] No unit header found" still fires.

For the `VCB_UNIT_TRIEU_VND` test fixture the fix works because the fixture has
"Triệu VND" in line 3. In real bank PDFs it may be further in.

Recommendation: expand head scan to `lines.slice(0, 200)` or scan the full document
for the loose patterns (they are cheap to evaluate).

### Non-Blocking

**N-1: Pre-existing TypeScript errors in test files**

- `apps/mcp-server/src/__tests__/1383-macro-alert-dispatch.test.ts:70,120` — mock missing `duplicates`/`errors` fields on `PollNewsResult`
- `apps/mcp-server/src/__tests__/1397c-vn-index-refresh.test.ts:137` — unchecked array access
- `apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts:352` — missing `alertBatchGrouper.js` module
These exist on the parent commit and are tracked separately.

## Merge Status

Branch `worktree-agent-a7ad12ea` merged to main (commit `34bcfcd8`) and pushed to origin.
Docker container rebuilt and started successfully.
VCB reparse triggered — OCR in progress for Q4 2025 PDF (72 pages, ~20 min).

Blocking issues B-1 and B-2 require a fixer pass before VCB live data is correct.
