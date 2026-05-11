# TASK 1804d-E — Unit tests: confidence boost + store query + schema validation

## Wave
Wave 4 — depends on 1804d-A + 1804d-B + 1804d-C

## Scope
- `apps/mcp-server/src/__tests__/1804-price-validation-override.test.ts` (new file)

## What to build

10 unit tests covering all three components. Use `bun:test`. DB tests use `:memory:` (set via `Bun.env.DB_PATH` in setup.ts preload — do not re-set it).

### Test groups

#### Group A — computeConfidenceBoost (4 tests)
1. `|sigma| < 1.5` → no boost (baseConfidence returned unchanged)
2. `1.5 <= |sigma| < 2.0` → +0.05 boost
3. `2.0 <= |sigma| < 3.0` → +0.10 boost
4. `|sigma| >= 3.0` → +0.20 boost, clamped to 1.0 max
   - Use negative sigma in at least one test to verify abs() behaviour

#### Group B — PriceAnomalyFindingDataSchema (3 tests)
5. Valid object passes parse without error
6. Missing `move_sigma` field → Zod throws / returns error
7. `window_days` as float (e.g. 1.5) → Zod rejects (must be int)

#### Group C — getPriceAnomalySignals (3 tests)
8. Returns empty array when no rows exist for ticker
9. Returns only `price_anomaly` rows for the requested ticker (not other finding_types)
10. `finding_data` returned as parsed object (not raw JSON string)

For Group C, seed an in-memory DB directly in the test using the same schema as `agentSignalStore.ts`.

## Acceptance criteria
- Exactly 10 tests, all passing
- No `any` types
- No network or file I/O
- `bun test` exits 0
- File follows template in dev-standards.md

## Commit format
```
task(1804d-E): 10 unit tests — confidence boost + store query + schema validation
```
