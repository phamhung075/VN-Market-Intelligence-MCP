# TASK JANITOR-014b — Migrate balanceSheetExtractor.ts to use extractorHelpers

## Context

balanceSheetExtractor.ts defines private copies of `LOOKAHEAD_LINES`, `extractNumber`, and `detectUnitMultiplier`. These are now canonical in extractorHelpers.ts (JANITOR-014a). This task removes the private copies and wires the import.

## Target File

`apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts`

## Acceptance Criteria

1. Remove private declarations of: `LOOKAHEAD_LINES`, `extractNumber`, `detectUnitMultiplier`.
2. Add import at top of file:
   ```typescript
   import { LOOKAHEAD_LINES, extractNumber, detectUnitMultiplier } from "./extractorHelpers.js";
   ```
3. All existing call sites within the file continue to compile and behave identically.
4. `bun tsc --noEmit` passes with zero errors.
5. `bun test` >= 8519 (no regressions). Balance sheet specific tests must all pass.

## Dependencies

- Requires: JANITOR-014a complete and merged

## Branch

`task/JANITOR-014b-balance-sheet-migrate`

## Estimated effort

~30min
