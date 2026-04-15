# Task Report: 1282 — Sector Classification Dedup Fix
date: 2026-04-15
outcome: APPROVED

## Test Results

| Suite | Passed | Failed |
|---|---|---|
| 1282 unit tests (`1282-sector-classification-dedup.test.ts`) | 7 | 0 |
| 1252 regression (`1252-reference-stocks-sync.test.ts`) | 20 | 0 |
| Key integration batch (082, 089, 1132, 1168, 1202) | 78 | 0 |
| TypeScript `bun tsc --noEmit` | 0 errors | — |

Note: `bun test` (full suite, all ~200 files) crashes with a Bun v1.3.11 C++ exception after ~8 min / 2.3 GB RSS peak. This is a pre-existing Bun runtime instability unrelated to task 1282 — all targeted and regression tests pass in smaller batches.

## DDD Compliance: PASS

- Zero runtime imports (`import ...` non-type) from `infrastructure/` or `application/` in `src/domain/`.
- Pre-existing `import type` from infrastructure in `intradayAnalyzer.ts`, `supplyChainAnalyzer.ts`, etc. are type-only (erased at compile time) and not introduced by this branch.

## Security: PASS

- No `process.env` introduced by this branch.
- Pre-existing `process.env["DB_PATH"]` in `src/infrastructure/db/schema.ts` is not touched by this branch.
- No hardcoded credentials. No SQL interpolation.

## Changes Reviewed

### Branch commits (2)

| Commit | Summary |
|---|---|
| `a90412f` | Remove `pharma` key from `mcp.config.json` referenceStocks; consolidate into `pharmaceutical`; add `DMC` to `SECTOR_PEERS.pharmaceutical` |
| `8080645` | Move task 1282 to Review in TASKS.md |

### `mcp.config.json`

- `pharma` key deleted (was: `["DHG", "IMP", "DMC", "TRA", "DBD"]`).
- `pharmaceutical` now contains all 7 tickers: `["DHG", "IMP", "DMC", "DBD", "PME", "TRA", "OPC"]`.
- No other referenceStocks keys changed.

### `src/domain/services/sectorPeers.ts`

- `DMC` (Domesco Medical) added to `SECTOR_PEERS.pharmaceutical`.
- `pharma` entry retained (5 tickers, no `PME`/`OPC`). This is intentional — `pharma` and `pharmaceutical` are both valid `DomainType` values in the schema; `pharma` is the shorter legacy alias, `pharmaceutical` the expanded canonical one. Both are needed for `DomainType` completeness.

## Acceptance Criteria Verification

| AC | Test | Result |
|---|---|---|
| No `pharma` + `pharmaceutical` dual keys in referenceStocks | `"does not contain both 'pharma' and 'pharmaceutical' keys"` | PASS |
| No conflicting sector assignment between referenceStocks and SECTOR_PEERS | `"no ticker has conflicting sector assignment"` | PASS |
| Every referenceStocks ticker exists in SECTOR_PEERS under same sector | `"every ticker in referenceStocks exists in SECTOR_PEERS"` | PASS |
| `construction` sector still present (1252 constraint) | `"still has construction sector"` | PASS |
| `energy` sector still present (1252 constraint) | `"still has energy sector"` | PASS |
| `pharmaceutical` sector still present (1252 constraint) | `"still has pharmaceutical sector"` | PASS |
| `gold_mining` sector still present (1252 constraint) | `"still has gold_mining sector"` | PASS |

## Issues Found

### Blocking
None.

### Non-Blocking
- Bun v1.3.11 full-suite crash (C++ exception, OOM-like, 2.3 GB peak RSS) is pre-existing and tracked separately.
- `process.env["DB_PATH"]` usage in `src/infrastructure/db/schema.ts` (should be `Bun.env`) is pre-existing, not introduced by this branch.

## Merge Status
APPROVED — ready to merge to main.
