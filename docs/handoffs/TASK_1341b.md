# TASK 1341b — Add catalyst context fields to UrgentNews signal type

## Task Spec

- **Branch:** `task/1341b-urgent-news-context`
- **Baseline:** 6669 tests passing (after 1341a merge)
- **Goal:** Apply the same catalyst context field pattern from PriceConfirmationFindingData (Sprint 1339) and ChainCatalystFindingData (Sprint 1341a) to UrgentNewsFindingData for cascade enrichment traceability.

## Fields added

Three optional fields on `UrgentNewsFindingData` + Zod schema:

| Field | Type | Constraint |
|---|---|---|
| `catalyst_stock_code` | `string \| undefined` | `z.string().min(2).optional()` |
| `catalyst_direction` | `"bullish" \| "bearish" \| "neutral" \| undefined` | `z.enum([...]).optional()` |
| `time_to_price_move` | `number \| undefined` | `z.number().min(0).optional()` |

Note: `catalyst_direction` uses `bullish/bearish/neutral` (same as ChainCatalyst) — not `BUY/SELL/NEUTRAL` used in PriceConfirmation's `catalyst_direction`. Consistent with UrgentNews event vocabulary.

## [Developer] Implementation Record

- **Files modified:**
  - `apps/mcp-server/src/domain/signals/signalTypes.ts:184-199` — added 3 optional fields to `UrgentNewsFindingData` interface (with `| undefined` for `exactOptionalPropertyTypes` compat), added 3 Zod validators to `UrgentNewsFindingDataSchema`
  - `apps/mcp-server/src/domain/signals/signalBuilders.ts:248-293` — added 3 setter method declarations to `UrgentNewsBuilder` interface, extended Omit type on `UrgentNewsBuilderImpl.data` to exclude new fields and re-declare them explicitly, added `setCatalystStockCode`, `setCatalystDirection`, `setTimeToPriceMove` impl methods

- **Tests written:**
  - `apps/mcp-server/src/__tests__/1341b-urgent-news-context.test.ts` — 16 assertions, GREEN
  - Schema: backward compat (no fields), each field accepted individually, all 3 together, constraint rejections (min-length, invalid enum, negative number)
  - Builder: each setter, all 3 setters combined, build without context fields (undefined)

- **Tests skipped:** none

- **Git commits:** `20e81eb5 feat(1341b): add catalyst context fields to UrgentNews signal type`

- **tsc status:** clean (0 errors) — required Omit extension in builder data type to satisfy `exactOptionalPropertyTypes`

- **Full suite status:** 6685 pass / 217 fail (217 pre-existing failures unrelated to this task; baseline 6669 + 16 new = 6685)

## [QA] Review Record

- **Verdict:** APPROVED
- **Blocking issues:** none
- **Non-blocking:** none
- **Files verified clean:**
  - `apps/mcp-server/src/domain/signals/signalTypes.ts` — no infrastructure/application imports, no process.env, all 3 new fields `?` optional in interface and `.optional()` in Zod schema
  - `apps/mcp-server/src/domain/signals/signalBuilders.ts` — no infrastructure/application imports, no process.env, all 3 setters present in UrgentNewsBuilder interface + UrgentNewsBuilderImpl
  - `apps/mcp-server/src/__tests__/1341b-urgent-news-context.test.ts` — 16 tests, meaningful assertions, backward compat + constraint rejection covered
- **Test results:** 16 pass / 0 fail (task tests); 6685 pass / 217 fail (full suite, 217 pre-existing)
- **TypeScript:** 0 errors
- **DDD:** PASS (domain files import only from zod and ./signalTypes — no upward layer violations)
- **Security:** PASS (no process.env, no hardcoded secrets, no SQL)
- **Merge commit:** 819d52ba
