<!-- size-justification: 90L — FX canonical-source adapter + DI wiring; pattern reuse from SQLiteCommodityRepository; acceptance criteria × 2 zones (macro-indicators request + bootstrap comparison) -->

# DPI-1 — FX Canonical Source: SBV Official (macro-indicators)

**Sprint:** DATA-PIPELINE-INTEGRITY | **Zone:** `apps/macro-indicators/` | **Author:** pm | **Date:** 2026-05-30

---

## Context

`get_macro_snapshot` returns USDVND=26255 (Yahoo Finance via `CommodityFetcherPort`), but `get_cycle_bootstrap` returns USDVND=26115 (SBV official). DPI-1 makes both surfaces read SBV canonical source.

**Architecture brief:** `docs/handoffs/DPI-ARCH.md` § DPI-1 (Option A canonical SBV FX).

---

## Specification

### Files to modify

1. **`apps/macro-indicators/pkg/infrastructure/repositories.go`** — add `SBVRateSQLiteAdapter` struct (new adapter, same file as existing `SBVRateRepository` fixture).
2. **`apps/macro-indicators/pkg/application/usecases.go`** — patch `Execute()` to call `SBVRatePort.GetRate()` and replace `usdVnd` if result is positive.
3. **`apps/macro-indicators/cmd/server/main.go:51`** — change DI wiring from `infrastructure.NewSBVRateRepository()` to `infrastructure.NewSBVRateSQLiteAdapter()`.

### Implementation Approach

#### A. SBVRateSQLiteAdapter (repositories.go)

New struct in `repositories.go` that follows the exact pattern of `SQLiteCommodityRepository` (already present at L195-315):
- Constructor: `NewSBVRateSQLiteAdapter() SBVRatePort`
- Read DB_PATH from env, open read-only
- Implement `GetRate(ctx, from, to) (float64, error)` — reads `sbv_rates.usd_vnd_official` where `source=<canonical>`
- Staleness guard: return 0 if row timestamp is >6h old (SBV refresh every 4h + 2h tolerance)
- Safe-degrade: if row absent or value is 0, return `(0, nil)` (not error)
- Internal helper: `fetchSBVRateFromDB(ctx, db, staleBound)` for testability

**Pattern reference:** see `SQLiteCommodityRepository.FetchPrices()` (L207-234) and `fetchCommodityPricesFromDB(db, staleBound)` (L236-270).

**Staleness logic pseudocode:**
```go
if row.updated_at.Before(time.Now().Add(-6 * time.Hour)) {
    return 0, nil  // Safe degrade
}
```

#### B. usecases.go Execute() patch

After `resolveMarketPrices()` populates `usdVnd`, add ~4 lines:
```go
if uc.sbvRate != nil {
    if r, err := uc.sbvRate.GetRate(ctx, "USD", "VND"); err == nil && r > 0 {
        usdVnd = r
    }
}
```

This gives SBV priority while preserving OIL/GOLD from the commodity path.

#### C. main.go DI wiring

Line 51: replace `infrastructure.NewSBVRateRepository()` with `infrastructure.NewSBVRateSQLiteAdapter()`.

---

## Acceptance Criteria

1. **AC-1: SBVRateSQLiteAdapter constructor** — exists, signature `func NewSBVRateSQLiteAdapter() SBVRatePort`, reads DB_PATH env, opens read-only without panic.

2. **AC-2: GetRate staleness guard** — returns `(0, nil)` if `sbv_rates` row timestamp >6h old; returns `(0, nil)` if row absent; returns `(rate, nil)` if fresh and rate>0.

3. **AC-3: usecases.go Execute() patch** — calls `uc.sbvRate.GetRate(ctx, "USD", "VND")` after `resolveMarketPrices()`; replaces `usdVnd` if result is positive; preserves `usdVnd` if result is 0 or error.

4. **AC-4: main.go DI wiring** — line 51 wires `NewSBVRateSQLiteAdapter()` (not fixture); `sbvRate` field injected into usecase struct.

5. **AC-5: Safe-degrade under staleness** — if `sbv_rates` table is empty or all rows are >6h old, `get_macro_snapshot` returns Yahoo USDVND (26255) without error; no panic.

6. **AC-6: Live snapshot gate** — `get_macro_snapshot` USDVND ≡ `get_cycle_bootstrap` USDVND (both read SBV canonical source); verified on same network tick.

---

## Testing

- Unit test: `SBVRateSQLiteAdapter.GetRate()` with in-memory `:memory:` DB + injected schema + timestamps (fresh/stale/absent).
- Unit test: `Execute()` calls adapter, respects result priority.
- Integration: after rebuild, live `get_macro_snapshot` vs live `get_cycle_bootstrap` USDVND comparison.

**No test assertion on hardcoded value exists** (per architect scan of `usecases_test.go`). Safe to patch.

---

## Risk Flags

- **R-3 (LOW) — SBV staleness window:** If `sbv_rates` row is 0 (fresh schema, SBV cron not yet run post-rebuild), `GetRate` returns 0 → fallback to Yahoo. Correct safe-degrade; first post-rebuild probe may show Yahoo value. Document in code comment.

---

## DoD (Definition of Done) — OPS + QA Gate

After dev commit and ops REBUILD:
- **QA GATE:** `get_macro_snapshot` and `get_cycle_bootstrap` both return identical USDVND value (both reading SBV canonical).
- **Verification:** live MCP tool probe on same network tick.

---

## Related documents

- Architect brief: `docs/handoffs/DPI-ARCH.md`
- BA spec: `docs/REQ_DATA-PIPELINE-INTEGRITY.md`
- Reference: `apps/macro-indicators/pkg/infrastructure/repositories.go:195-315` (SQLiteCommodityRepository pattern)

---

## [Developer] Implementation — 2026-05-30

**Status:** DONE (zone tests GREEN, awaiting ops REBUILD + QA live probe)

### Files changed

1. `apps/macro-indicators/pkg/infrastructure/repositories.go`
   - Added `SBVRateSQLiteAdapter` struct + `NewSBVRateSQLiteAdapter()` constructor (reads DB_PATH env, opens read-only, follows SQLiteCommodityRepository pattern exactly).
   - Added `fetchSBVRateFromDB(ctx, db, staleBound)` inner helper for testability (mirrors `fetchCommodityPricesFromDB` pattern).
   - `sbvStaleBound = 6 * time.Hour` constant.
   - `GetRate()` supports only USD→VND; unsupported pairs return (0, nil).
   - Staleness guard uses `time.RFC3339Nano` for TypeScript-written `new Date().toISOString()` format (same R-2 fix as commodity adapter).
   - Safe-degrade: absent table, no row, zero value, stale row → all return (0, nil), no error, no panic.

2. `apps/macro-indicators/pkg/application/usecases.go`
   - Added ~6 lines after `resolveMarketPrices()`: nil-guard on `uc.sbvRate`, calls `GetRate(ctx, "USD", "VND")`, replaces `usdVnd` only if result > 0.
   - OIL and GOLD are unaffected (commodity path unchanged).

3. `apps/macro-indicators/cmd/server/main.go` (line 51)
   - Changed `infrastructure.NewSBVRateRepository()` → `infrastructure.NewSBVRateSQLiteAdapter()`.

4. `apps/macro-indicators/pkg/infrastructure/repositories_test.go`
   - Added `sbv_rates` table to `newInMemoryDB()` schema.
   - Added 4 new tests: `TestFetchSBVRateFromDB_FreshRow`, `TestFetchSBVRateFromDB_StaleRow`, `TestFetchSBVRateFromDB_AbsentRow`, `TestFetchSBVRateFromDB_ZeroValue` (cover AC-2: fresh/stale/absent/zero-value paths).

5. `apps/macro-indicators/pkg/application/usecases_test.go`
   - Added `stubSBVRateLive` stub (configurable positive rate).
   - Added `TestSBVRateOverridesUSDVnd` (AC-3: SBV priority fires).
   - Added `TestSBVRateZeroKeepsCommodityUSDVnd` (AC-5: safe-degrade).
   - Added `TestSBVRateDoesNotAffectOilGold` (OIL/GOLD unaffected).

### Build/test result

```
go test ./... — ALL PASS (12 packages)
go vet ./...  — CLEAN
go build ./cmd/... — CLEAN
```

### Risk R-3 (LOW) confirmed

First post-rebuild probe may show Yahoo USDVND (26255) if SBV cron has not yet fired. `GetRate` returns (0, nil) → `r > 0` guard keeps Yahoo value. Correct safe-degrade. Next SBV cron (~4h cadence) fills the row.

### NEXT: ops REBUILD (macro-indicators, AFTER mcp-server) → qa live probe (AC-6)

---

## [QA] Review Record — 2026-05-30T00:21Z

**Verdict: PASS**

### Live Probe Method
- `get_macro_snapshot` → direct POST to macro-indicators Go service (port 5004/snapshot), confirmed via api-gateway (/macro/snapshot).
- `get_cycle_bootstrap` (market_context USDVND) → direct market.db query in mcp-server container (same row read by `buildMarketContextText`).

### Values Read

| Surface | Tool / Source | USDVND |
|---|---|---|
| `get_macro_snapshot` | POST /macro/snapshot live response | **26115** |
| `get_cycle_bootstrap` market_context | `sbv_rates.usd_vnd_official` (same DB row, direct query) | **26115** |

Both match. Old Yahoo value (26255) is gone.

### AC-6 GATE PASS
- `get_macro_snapshot` USDVND = 26115
- `get_cycle_bootstrap` market_context USDVND = 26115 (reads same `sbv_rates.usd_vnd_official` row)
- Identical value confirmed — NOT the old Yahoo 26255.

### Container state
- macro-indicators: Up 5 minutes (healthy) — post-rebuild confirmed.
- mcp-server: Up 18 minutes (healthy).
- `sbv_rates` row: `usd_vnd_official=26115`, `fetched_at=2026-05-29T23:15:03.227Z` (fresh within 6h staleness guard).
