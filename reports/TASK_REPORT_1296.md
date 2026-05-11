# Task Report: 1296 — Prediction tool schema drift fix
date: 2026-04-15
outcome: APPROVED

## Test Results

| Suite | Pass | Fail |
|---|---|---|
| `1124-evidence-tools-phase-bc.test.ts` (target) | 12 | 0 |
| `1194-agent08-tools.test.ts` (regression guard) | 9 | 0 |
| Full suite (`bun test`) | 4716 | 7 (all pre-existing) |
| TypeScript (`bun tsc --noEmit`) | 0 errors | — |

### Pre-existing failures (present on main, not introduced by this task)
| Test | Confirmed pre-existing |
|---|---|
| `313-vps-proxy-watchdog` — sends alert when market_prices stale | yes |
| `137-fix-alert-pipeline` — Step E skipped outside market hours | yes |
| `1190-pipeline-watchdog` — schedulerFileCount === 28 | yes |
| `296-ocr-pipeline-e2e` — OCR PDF smoke test (Bun C++ crash) | yes |
| `297-foreign-flow-fix` — uses most recent row | isolated pass |
| `1192-evening-summary-empty-fallback` | isolated pass |
| `1282-sector-dedup` | isolated pass |

The 3 "isolated pass" failures are test-order interference in the full suite; each passes when run alone on both main and the task branch.

## Changed Files

| File | Expected | Actual |
|---|---|---|
| `src/interface/mcp/tools/evidenceTools.ts` | yes | yes |
| `TASKS.md` | yes | yes |

No other `src/` files modified. Constraint satisfied.

## Schema Fix Verification

`create_prediction_claim` Zod schema:
- `direction`: was `z.enum(["bullish","bearish"])` (required) → now `.optional()`
- `expected_move_pct`: was `z.number().min(0.001).max(0.5)` (required) → now `.optional()`

## Null-safety Verification

| Risk | Fix applied |
|---|---|
| `.toFixed()` on undefined `expected_move_pct` | guarded: `expected_move_pct != null ? ... : ""` (line 418) |
| `.toFixed()` on undefined `direction` | guarded: `direction ?` conditional (line 417) |
| `null` passed to NOT NULL `direction` DB column | defaulted: `(direction ?? "neutral") as ClaimDirection` (line 388) |
| `creationPrice` null when both fields absent | guarded: price lookup only when both non-null (line 349) |
| `targetPrice` null when either field absent | ternary returns null, `insertPredictionClaim` accepts `null` (line 371) |

## DDD Compliance: PASS

`src/domain/` has no new imports from `infrastructure/`. Changed file is in `src/interface/` — correct layer for MCP tool registration.

## Security: PASS

No `process.env` in changed file. All SQL uses parameterized bindings. No hardcoded credentials.

## Issues Found
### Blocking
None.
### Non-Blocking
None.

## Merge Status
Merged `task/1296-prediction-schema-optional` → `main` via `--no-ff`.
Local and remote branch deleted.
Post-merge: 21/21 tests pass, `tsc --noEmit` = 0 errors.
