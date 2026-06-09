# DJ-GATE-1 — BATCH5-BS-REGRESSION-IMPL — dev-mcp-server

**Date:** 2026-06-09
**Agent:** dev-mcp-server
**Task:** BATCH5-BS-REGRESSION-IMPL
**File:** apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts

## Decision

Implemented the architect's spike-verified prescription from docs/handoffs/BATCH5-BS-REGRESSION-arch-spike.md § PRESCRIPTION as a REPLACEMENT for the cb03b761 Phase-B blanket-guard change.

### Change 1 — magnitude path (~L991)
Removed the Phase B `sbMap === null` gate. Removed the `else if (sbMap !== null && ...)` branch entirely.
Raised `RAW_VND_THRESHOLD` from `1_000_000_000` to `1_000_000_000_000`.
Rationale: VCB Q1 bank split-block maxField ~2.1e9 < 1e12 → stays un-normalized. True raw-VND statements (PPC/1120/LIAB-PRIOR/1908c) have maxField ≥5.5e12 → correctly divided.

### Change 2 — path B-SB (~L960 appended)
Kept existing `if (sbMap === null && ...)` path B unchanged.
Appended new `else if (sbMap !== null && totalSourcesSideFwd > 0 && ...)` branch with corroboration gate:
- consensus = sources-side(440) ≈ identity(liab+equity) within 2%
- override triggered only when consensus true AND totalAssets diverges from identityDerived by >5%
Rationale: PPC split-block code-270 zip binds prior-year value (5,533,688) vs real total (5,246,604). 1416b-VNM is safe: sources-side(30M) ≠ identity(130M) → no consensus → no override.

### Change 3 — path A (~L831)
NOT touched. Phase B `sbMap === null` guard left as-is.

## Verification

All 6 fixtures GREEN (65 pass / 0 fail):
- 1416b-fpt-page-window: 6/0
- hotfix-vcb-parser: 20/0
- FIX-BCTC-MAGNITUDE-NORMALIZE (PPC): 15/0
- 1120-split-block-balance-sheet: 11/0
- 1908c-totalassets-plausibility-override: 8/0
- FIX-BCTC-LIAB-PRIOR-PERIOD: 5/0
- `bun tsc --noEmit`: CLEAN

## Mutex

Acquired: 2026-06-09 (dev-mcp-server-bs-impl / BATCH5-BS-REGRESSION-IMPL)
Released: same session, 2nd commit.
