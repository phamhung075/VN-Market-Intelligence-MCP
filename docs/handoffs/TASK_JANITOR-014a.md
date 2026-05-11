# TASK JANITOR-014a — Create extractorHelpers.ts with canonical shared helpers

## Context

Three BCTC extractors (balanceSheetExtractor.ts, incomeStatementExtractor.ts, cashFlowExtractor.ts) each define private copies of `LOOKAHEAD_LINES`, `extractNumber`, `stripDiacritics`, and `detectUnitMultiplier`. This task creates the single canonical source of truth.

## Target File

`apps/mcp-server/src/domain/services/financial-reports/extractorHelpers.ts`

## Acceptance Criteria

1. File is created at the exact path above.
2. Exports the following (all named exports, no default):
   - `LOOKAHEAD_LINES = 3` (const number)
   - `extractNumber(line: string): number | null` — richest implementation: handles scientific notation (from incomeStatementExtractor), strips Vietnamese diacritics before parse, applies year guards (rejects values 1900–2099 range treated as years, from balanceSheetExtractor logic)
   - `stripDiacritics(text: string): string` — verbatim copy from incomeStatementExtractor.ts (Unicode NFD + remove combining marks)
   - `detectUnitMultiplier(lines: string[]): number` — from balanceSheetExtractor verbatim: 400-line scan, detects `triệu VND` / `(Triệu VND)` → 1, `nghìn` → 0.001, `đồng` → sentinel -1, no-header found → sentinel -2
3. No imports from infrastructure or application layers (domain-only file).
4. Import path uses `.js` extension in any re-exports.
5. File passes `bun tsc --noEmit` with zero errors.
6. Baseline tests still pass: `bun test` >= 8519.

## Implementation Notes

- Read balanceSheetExtractor.ts and incomeStatementExtractor.ts to extract the exact implementations before writing.
- `extractNumber` must merge both implementations: scientific notation handling from incomeStatement + year-value guards from balanceSheet.
- `detectUnitMultiplier` must be the balanceSheet version (400-line scan, full pattern set including bank BCTC `(Triệu VND)` variant). Do NOT use the incomeStatement version (50-line scan, incomplete).
- Do not delete anything from the source files yet — that is done in JANITOR-014b/c/d.

## Dependencies

- Blocks: JANITOR-014b, JANITOR-014c, JANITOR-014d

## Branch

`task/JANITOR-014a-extractor-helpers`

## Estimated effort

~1h
