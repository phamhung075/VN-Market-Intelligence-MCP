# TASK_MLP-D2 — Application Tests (T-MLP-4 / T-MLP-5)

**Task:** MLP-D2
**Sprint:** MACRO-LIVE-PRICES
**Owner:** dev-macro-indicators
**Zone:** apps/macro-indicators/
**Depends on:** MLP-D1 (SQLiteCommodityRepository infrastructure tests)
**Blocks:** MLP-D3 (composition root env gate)
**Priority:** HIGH
**Date:** 2026-05-28
**Architect ref:** docs/architecture-briefs/2026-05-28-macro-live-prices.md §6, §11

---

## Overview

Add application-layer tests (T-MLP-4 and T-MLP-5) to verify `resolveMarketPrices()` in `pkg/application/usecases.go` correctly handles live DB values vs fixture fallback.

**Critical note from brief §6:**
- The use case `resolveMarketPrices()` is ALREADY CORRECT (no logic changes needed)
- This task adds tests ONLY to verify it handles both live + fixture paths correctly
- Both tests use mocked/injected `CommodityFetcherPort` (not real DB or HTTP)

---

## Acceptance Criteria

### AC-1: T-MLP-4 — Application test: resolveMarketPrices with live port values
**Status:** TODO  
**Evidence:** go test output (usecases_test.go T-MLP-4)

Test that `resolveMarketPrices()` correctly passes through live values from the CommodityFetcherPort.

**Setup:**
- Mock/inject a `CommodityFetcherPort` that returns live values: `{"OIL": 96.0, "GOLD": 4480.0, "USDVND": 26150.0}`
- These values DIFFER from fixture constants (82.5/2350.0/24500.0) so the test proves the port was read, not the constants (per brief §6 QA-GATE-1 note)

**Execute:**
- Call `resolveMarketPrices(ctx, mockPort)`
- Verify the snapshot response contains: `oilPrice=96.0`, `goldPrice=4480.0`, `usdVnd=26150.0`
- Verify NO fixture fallback fired (live values returned as-is)

**Acceptance:** Test passes, snapshot response contains injected port values (NOT fixture constants).

---

### AC-2: T-MLP-5 — Application test: resolveMarketPrices with empty port (fixture fallback)
**Status:** TODO  
**Evidence:** go test output (usecases_test.go T-MLP-5)

Test that `resolveMarketPrices()` falls back to fixture constants when the CommodityFetcherPort returns empty map (stale or missing data).

**Setup:**
- Mock/inject a `CommodityFetcherPort` that returns empty map: `{}`
- This simulates the SQLiteCommodityRepository returning empty (stale row, missing table, or no 'yahoo' source)

**Execute:**
- Call `resolveMarketPrices(ctx, mockPort)`
- Verify the snapshot response contains fixture constants: `oilPrice=82.5`, `goldPrice=2350.0`, `usdVnd=24500.0`

**Acceptance:** Test passes, snapshot response contains fixture constants (fallback fired).

---

### AC-3: T-MLP-6 / T-MLP-7 / T-MLP-8 — Existing tests still pass
**Status:** TODO  
**Evidence:** go test ./pkg/application/... exit 0

All existing application-layer tests must remain green. No changes to `resolveMarketPrices()` logic means existing tests (if any) remain valid.

**Execute:**
```bash
cd apps/macro-indicators && go test ./pkg/application/...
```

**Acceptance:** Exit code 0, zero new test failures.

---

## Implementation Notes

### File modifications
- **Add to `apps/macro-indicators/pkg/application/usecases_test.go`:**
  - T-MLP-4 test (live port values pass through)
  - T-MLP-5 test (empty port → fixture fallback)
  - Mock CommodityFetcherPort implementation (simple struct with FetchPrices returning injected map)
  - ~50 lines of test code (per brief §10)

### Mock CommodityFetcherPort pattern
Minimal example (adjust to actual code structure):
```go
type mockCommodityFetcher struct {
    prices map[string]float64  // injected by test
}

func (m *mockCommodityFetcher) FetchPrices(ctx context.Context, symbols []string) (map[string]float64, error) {
    return m.prices, nil
}
```

### Key test values (brief §6 QA-GATE-1)
- **Live injected:** oil=96.0, gold=4480.0, usdVnd=26150.0 (DIFFERENT from fixtures)
- **Fixture constants:** oil=82.5, gold=2350.0, usdVnd=24500.0 (from existing code)

The DIFFERENCE in values proves the test uses the port, not constants.

### No changes to resolveMarketPrices() logic
- The use case is ALREADY CORRECT per brief §6
- Tests verify its correct behavior, but no code changes to the use case itself
- If existing tests already cover resolveMarketPrices, this task adds the LIVE + FIXTURE cases if missing

---

## Success Metrics

1. All 3 ACs above verified PASS (T-MLP-4, T-MLP-5, existing tests green)
2. go test ./pkg/application/... exits 0
3. T-MLP-4 test proves live port values are passed through
4. T-MLP-5 test proves fixture fallback fires when port returns empty
5. Fixture-mode tests (T-MLP-6..8, per brief §6 test matrix) still green

---

## Rollback / Revert Plan

If this task fails:
1. `git checkout -- apps/macro-indicators/pkg/application/usecases_test.go` (revert test additions)
2. Application logic remains untouched
3. MLP-D1 infrastructure tests still valid

---

## Notes

- **Test-only task:** No production code changes. Tests only.
- **Fixture-mode backward compatibility:** Tests verify the USE CASE, not the specific adapter. When MLP-D3 wires HTTPCommodityFetcher (fixture mode), the same logic applies.
- **Mock isolation:** Tests do NOT use real DB, real HTTP, or real mcp-server cron. Fully deterministic.
- **Zone isolation:** All work stays in apps/macro-indicators/pkg/application/. No changes to other files.

---

## Next Step

After this task DONE:
- Main terminal commits: `test(macro-indicators): MLP-D2 — application tests T-MLP-4/5 (live + fixture)`
- Dispatch MLP-D3 (composition root env gate wiring in cmd/server/main.go)
