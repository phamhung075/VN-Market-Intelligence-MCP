# Task Report: 1339a — RED Phase: Failing Tests for PriceConfirmation Context Fields
date: 2026-04-26
outcome: APPROVED

## Test Results
- Unit tests (1339a file): 0 pass / 10 fail (all failing for the correct reason — RED phase confirmed)
- Full suite: 6586 pass / 225 fail (1339a contributes 0 pass + 10 fail; baseline non-1339a = 6586 pass)
- TypeScript: 10 errors on test file only (pre-sanctioned by Architect — see handoff line 79: "expected and acceptable for RED phase")

## Failure Classification (10 tests)

| Test | Failure reason | Correct? |
|---|---|---|
| 1. schema accepts new optional fields | `result.catalyst_stock_code` is `undefined` (field not in schema) | YES |
| 2. schema shape has new keys | `toHaveProperty("catalyst_stock_code")` fails — key absent from Zod shape | YES |
| 3. schema rejects empty catalyst_stock_code | Parse does NOT throw (field not in schema, ignored) | YES |
| 4. schema rejects invalid catalyst_direction | Parse does NOT throw (field not in schema, ignored) | YES |
| 5. schema rejects negative time_to_price_move | Parse does NOT throw (field not in schema, ignored) | YES |
| 6. builder setCatalystStockCode | `TypeError: builder.setCatalystStockCode is not a function` | YES |
| 7. builder setCatalystDirection | `TypeError: builder.setCatalystDirection is not a function` | YES |
| 8. builder setTimeToPriceMove | `TypeError: builder.setTimeToPriceMove is not a function` | YES |
| 9. builder round-trip with all 8 fields | `TypeError: result5.setCatalystStockCode is not a function` | YES |
| 10. builder backward-compat check | `expect("undefined").toBe("function")` — setter absent | YES |

All 10 tests fail for missing implementation, not import errors or test structural faults.

## TS Errors (test file only)

- Lines 33–35: `TS2339` — schema return type lacks new fields (will resolve when 1339b adds them)
- Lines 71, 77, 83, 88: `TS2532/TS2722` — `Record<string, fn>["key"]` possibly undefined under `noUncheckedIndexedAccess: true` (cast pattern limitation). These TS errors are inherent to the RED-phase cast approach and are pre-sanctioned by Architect specification (handoff line 79).

Note for 1339b: the builder tests (6–9) use `Record<string, fn>["key"]` indexing which will continue to produce TS2532/TS2722 under `noUncheckedIndexedAccess` even after implementation. GREEN phase must either: (a) replace casts with typed interfaces once methods exist, or (b) use non-null assertion (`!`). This is a non-blocking note for the implementation phase.

## Source File Changes
- Files diff between main and task branch: `TASKS.md`, `docs/handoffs/TASK_1339a.md`, `docs/agent-memory/sessions/2026-04-26-developer.md`, `apps/mcp-server/src/__tests__/1339a-price-confirmation-context.test.ts`
- No changes to `signalTypes.ts`, `signalBuilders.ts`, or any production source file. PASS.

## DDD Compliance: PASS
- Imports: `bun:test`, `../domain/signals/signalBuilders.js`, `../domain/signals/signalTypes.js` — all within domain layer
- No infrastructure imports detected

## Security: PASS
- No `process.env` usage
- No hardcoded credentials, secrets, or tokens

## Issues Found
### Blocking
None.

### Non-Blocking
- `apps/mcp-server/src/__tests__/1339a-price-confirmation-context.test.ts:71,77,83,88` — `Record<string, fn>` index cast produces TS2532/TS2722 under `noUncheckedIndexedAccess`. Pre-sanctioned for RED phase. 1339b GREEN phase must replace casts with typed interfaces.

## Merge Status
APPROVED — task/1339a-price-confirmation-context-red merged to main.
