# TASK 1341a — Add catalyst context fields to ChainCatalyst signal type

## Task Spec

- **Branch:** `task/1341a-chain-catalyst-context`
- **Baseline:** 6653 tests passing
- **Goal:** Apply the same catalyst context field pattern from PriceConfirmationFindingData (Sprint 1339) to ChainCatalystFindingData for cascade enrichment traceability.

## Fields added

Three optional fields on `ChainCatalystFindingData` + Zod schema:

| Field | Type | Constraint |
|---|---|---|
| `catalyst_stock_code` | `string \| undefined` | `z.string().min(2).optional()` |
| `catalyst_direction` | `"bullish" \| "bearish" \| "neutral" \| undefined` | `z.enum([...]).optional()` |
| `time_to_price_move` | `number \| undefined` | `z.number().min(0).optional()` |

Note: `catalyst_direction` uses `bullish/bearish/neutral` (same as ChainCatalyst direction) — not `BUY/SELL/NEUTRAL` used in PriceConfirmation's `catalyst_direction`. This is intentional per task spec.

## [Developer] Implementation Record

- **Files modified:**
  - `apps/mcp-server/src/domain/signals/signalTypes.ts:79-88` — added 3 optional fields to `ChainCatalystFindingData` interface (with `| undefined` for `exactOptionalPropertyTypes` compat), added 3 Zod validators to `ChainCatalystFindingDataSchema`
  - `apps/mcp-server/src/domain/signals/signalBuilders.ts:58-64,69-72,144-162` — added 3 setter method declarations to `ChainCatalystBuilder` interface, extended Omit type on `ChainCatalystBuilderImpl.data` to exclude new fields and re-declare them explicitly, added `setCatalystStockCode`, `setCatalystDirection`, `setTimeToPriceMove` impl methods

- **Tests written:**
  - `apps/mcp-server/src/__tests__/1341a-chain-catalyst-context.test.ts` — 16 assertions, GREEN
  - Schema: backward compat (no fields), each field accepted individually, all 3 together, constraint rejections (min-length, invalid enum, negative number)
  - Builder: each setter, all 3 setters combined, build without context fields (undefined)

- **Tests skipped:** none

- **Git commits:** `628e2f3d feat(1341a): add catalyst context fields to ChainCatalyst signal type`

- **tsc status:** clean (0 errors) — required Omit extension in builder data type to satisfy `exactOptionalPropertyTypes`

- **Full suite status:** 6669 pass / 217 fail (217 pre-existing failures unrelated to this task; baseline 6653 + 16 new = 6669)

## [QA] Review Record

- **Verdict:** APPROVED
- **Blocking issues:** none
- **Non-blocking:** none
- **Files verified clean:**
  - `apps/mcp-server/src/domain/signals/signalTypes.ts` — no infrastructure/application imports, no process.env, all 3 new fields `?` optional
  - `apps/mcp-server/src/domain/signals/signalBuilders.ts` — no infrastructure/application imports, no process.env, all 3 setters present in interface + impl
  - `apps/mcp-server/src/__tests__/1341a-chain-catalyst-context.test.ts` — 16 tests, meaningful assertions, backward compat + constraint rejection covered
- **Test results:** 16 pass / 0 fail (task tests); 6669 pass / 217 fail (full suite, 217 pre-existing)
- **TypeScript:** 0 errors
- **DDD:** PASS (domain files import only from zod and ./signalTypes — no upward layer violations)
- **Security:** PASS (no process.env, no hardcoded secrets, no SQL)
- **Merge commit:** 628e2f3d
