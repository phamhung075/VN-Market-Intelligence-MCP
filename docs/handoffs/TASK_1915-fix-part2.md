---
sprint: 1915
branch: main
size: S
zone: apps/mcp-server/
depends_on: [1915-fix-part1]
blocks: []
---

## TLDR

Fix the incomplete branch in `scanDiskForStrandedPdfs()`: when `codes.find()` returns undefined (ticker not in watchlist), fall through to `tickerFromFilename()` instead of hard `continue`. Ensures VEA, VNM, and any other ticker absent from the watchlist but present on disk are picked up.

## [PM] Planning Context

- **Root cause:** `scanDiskForStrandedPdfs()` else-branch had `if (!matched) continue` with no fallback. Production has 38 watchlist entries but VEA and VNM are PDFs on disk NOT in the watchlist — silently dropped on every cycle.
- **Fix scope:** Single block in `bctcReparseJob.ts` lines 481-488 (ticker resolution).
- **AC:**
  - [x] DSE-09: watchlist `["HPG","VCB"]` + `VNM_Q4_2025.pdf` → VNM picked up via filename fallback
  - [x] DSE-01..08 GREEN
  - [x] 1416c GREEN (regression guard test updated to reflect new correct behavior)
  - [x] tsc 0 errors

## [Developer] Implementation Record

- **Outcome:** Fix implemented. Single block replacement in `scanDiskForStrandedPdfs()`.
- **Files modified:**
  - `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts` — replaced `if (!matched) continue; ticker = matched.toUpperCase()` with `if (matched) { ticker = matched.toUpperCase(); } else { tickerFromFilename fallback }`
  - `apps/mcp-server/src/__tests__/1915-scan-disk-empty-watchlist.test.ts` — added DSE-09; updated DSE-06 to reflect new behavior (VEA now returned via fallback)
  - `apps/mcp-server/src/__tests__/1416c-hpg-bctc-disk-scan.test.ts` — updated regression guard test (was: HPG skipped when not in watchlist; now: HPG picked up via filename fallback)
- **Tests written:** DSE-09 GREEN + DSE-01..08 GREEN + 1416c (6 tests) GREEN — 15 tests total, 0 fail
- **tsc status:** clean (0 errors)
- **Notes on test updates:** DSE-06 and 1416c "regression guard" tested the OLD buggy behavior (non-watchlist PDFs silently dropped). Both updated to document the new correct behavior. The fix intentionally makes ALL non-watchlist PDFs discoverable via filename fallback.
