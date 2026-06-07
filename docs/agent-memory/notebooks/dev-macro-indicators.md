# dev-macro-indicators — Notebook

Zone: `apps/macro-indicators/` | Stack: Go (pilot) | DB: none (reads market.db read-only)

## Archived sessions (detail → git log)

- P1-E1 (41a7d866) — dashboard stub HTML, G12 streak #3, 20/20 GREEN
- P2-X1 (61c3dce4) — 5 remaining primitives, carry/yield/oil/gold/usdvnd, 20/20 GREEN
- P2-X3 (88adeb70) — snapshot/carry/yield handlers, 501 resolved, G3 DI wiring
- P2-X4 (535e7bdc) — dashboard 6/6 primitives data sync, G9 unblocked
- Category chip relabeling (f0a8760c) — Valid Input/Edge Case/Bad Input labels
- MACRO-SEED-WIRING (a148db3d) — MarketIndexPort added, VNIndex reads market.db
- MACRO-VNINDEX-DATA-GAP — two-tier query (market_prices PRIMARY + macro_indicators SECONDARY)
- Docker crash-loop fix (f85ad1d9) — Dockerfile TS→Go multi-stage, router_test assertions

## Working Memory — Sprint DATA-PIPELINE-INTEGRITY

### Session 2026-05-30 — DPI-1+DPI-2: SBV canonical FX + live computedAt

**DPI-1:** `SBVRateSQLiteAdapter` reads `sbv_rates.usd_vnd_official WHERE source='sbv'` (6h staleBound, RFC3339Nano). Wired in Execute() after `resolveMarketPrices()` — replaces usdVnd if >0, OIL/GOLD unaffected. `cmd/server/main.go` switched from `NewSBVRateRepository()` to `NewSBVRateSQLiteAdapter()`. 4 new infra tests + 4 new application tests (DPI-1 AC-3/AC-5 + DPI-2 AC-2). Commit: 86f702bf.

**DPI-2:** Deleted `const fixtureComputedAt = "2026-05-23T00:00:00Z"`. `computedAt := time.Now().UTC().Format(time.RFC3339)` at top of Execute(). Both carry and yield ComputedAt now reflect actual call time.

**BLOCKER surfaced to PO:** frozen fixture inputs (4.7/5.33/8.2) = carry/yield regime never changes → split to DPI-2b.

Status: REVIEW — ops REBUILD required (after mcp-server).

### Session 2026-05-30 — DPI-2b: wire live carry/yield inputs from market.db

**Why:** DPI-2 computedAt-only fix = cosmetic. frozen Fed 5.33 > frozen VND 4.7 → carry permanently FII_OUTFLOW_RISK regardless of computedAt.

**Port added (`pkg/domain/ports.go`):** `CarryYieldInputsPort` — 3 methods: `GetVNDDepositRate` / `GetFedFundsRate` / `GetEarningYield`. All return (0, nil) on absent/stale (safe-degrade).

**Adapter added (`pkg/infrastructure/repositories.go`):** `CarryYieldInputsSQLiteAdapter`:
- `fetchVNDDepositRateFromDB`: `sbv_rates.max_deposit_rate_pct WHERE source='sbv'`, 26h staleBound
- `fetchFedFundsRateFromDB`: `fred_series_daily WHERE series='EFFR' ORDER BY date DESC`, 96h staleBound — date column = DateOnly (YYYY-MM-DD), not RFC3339Nano
- `fetchEarningYieldFromDB`: `tracked_indicators WHERE indicator='market_earning_yield' ORDER BY extracted_at DESC`, 26h staleBound

**Resolver pattern (`pkg/application/usecases.go`):** `resolveVNDDepositRate` / `resolveFedFundsRate` / `resolveEarningYield` — port>0 ? port : fixture const. Execute() uses resolved values for CarryTradeInput + YieldSpreadInput. Fixture consts kept (safe-degrade fallback, not deleted).

**Composition root (`cmd/server/main.go`):** `NewCarryYieldInputsSQLiteAdapter()` injected as 4th arg to `NewComputeMacroUseCase`.

**Test additions:**
- `repositories_test.go`: extended `newInMemoryDB` (added `max_deposit_rate_pct` col to sbv_rates, added `fred_series_daily` + `tracked_indicators`); 9 new adapter tests (fresh/stale/absent per input).
- `usecases_test.go`: 8 existing calls updated (nil 4th arg); `stubCarryYieldInputs` added; 6 new DPI-2b tests (AC-1..4 + AC-4-nil + AC-6 regime-flip).

**AC-6 REGIME-FLIP DV (deposit=6.0, fed=4.0 → spread=2.00 NEUTRAL vs frozen −0.63 FII_OUTFLOW_RISK):**
```
DPI-2b AC-6 REGIME-FLIP PROVEN: carrySpread 2.00, regime NEUTRAL (was FII_OUTFLOW_RISK)
```

**Build:** `go build ./...` CLEAN | `go vet ./...` CLEAN | `go test ./...` ALL PASS (12 packages).

**Commit:** 56f39ec2 (9 files: ports.go, repositories.go, repositories_test.go, usecases.go, usecases_test.go, main.go, handlers_snapshot_contract_test.go, DPI-2b.md, TASKS.md).

**Status:** REVIEW — ops must REBUILD macro-indicators (after DPI-1/2 same container) → QA AC-7 live re-probe.

**AC-7 QA verification query (post-rebuild):**
```sql
SELECT max_deposit_rate_pct, fetched_at FROM sbv_rates WHERE source='sbv';
SELECT value, date FROM fred_series_daily WHERE series='EFFR' ORDER BY date DESC LIMIT 1;
SELECT value, extracted_at FROM tracked_indicators WHERE indicator='market_earning_yield' ORDER BY extracted_at DESC LIMIT 1;
```
Cross-check vs `get_macro_snapshot` carry.vndDepositRate / carry.fedFundsRate / yield.earningYield. Fixture fallback (4.7/5.33/8.2) is CORRECT if rows absent/stale — not a bug.

Zone health: DPI-2b impl DONE; AC-6 PROVEN; ops REBUILD required; QA AC-7 pending | HEALTHY

## Session 2026-06-04 — DSI-INV-1: suppress fixture carry regime, extend dataSource liveness gate

**Bug confirmed live:** `get_macro_snapshot` returned `carry.fedFundsRate=5.33` (fixture) with `dataSource="live"`.

**FRED port diagnosis:**
- Port IS wired: `CarryYieldInputsSQLiteAdapter.GetFedFundsRate` → `fetchFedFundsRateFromDB`.
- DB HAS EFFR data: `value=3.62, date=2026-05-28`. BUT date is 187.5h ago > 96h `effrStaleBound` → staleness gate returns (0, nil) → fixture 5.33 used.
- `earnYield` similarly stale: `tracked_indicators` row is 58h old > 26h bound → fixture 8.2 used.
- `vndDeposit` IS live: `sbv_rates.max_deposit_rate_pct=5` fresh today.
- **Root cause:** `allLive` only checked commodity inputs (oil/gold/usdVnd) — not fedFunds/vndDeposit. Fixture fedFunds stamped as "live".

**DSI-INV-1 fix (commit 09e93d76):**

1. Resolvers now return `(float64, isLive bool)`: `resolveVNDDepositRate` / `resolveFedFundsRate` / `resolveEarningYield`.
2. Carry suppression gate: `carryInputsLive = fedFundsLive && vndDepositLive`. When false → `CarrySignalDTO{regime="UNKNOWN", carrySpread=nil, is_estimate=true, source_tier=4}`.
3. dataSource extended: `"live"` only when `allCommodityLive && carryInputsLive`.
4. `GetFedFundsSourceDate` added to `CarryYieldInputsPort` + infra: returns FRED `MAX(date)` regardless of staleness for `fetched_at_source` on carry DTO. Never `time.Now()` on fallback path.
5. `CarrySignalDTO` / `YieldSignalDTO` DTOs added to `dtos.go` with `IsEstimate`, `SourceTier`, `FetchedAtSource`.

**Files changed:** `pkg/domain/ports.go` | `pkg/infrastructure/repositories.go` | `pkg/application/dtos.go` | `pkg/application/usecases.go` | `pkg/application/usecases_test.go`

**Test results:** `go test ./...` ALL PASS (12 packages) | `golangci-lint run`: 0 issues | sandbox: primitive 18/18, module 2/2 GREEN.

**Expected post-rebuild behavior:** carry will show `regime="UNKNOWN", is_estimate=true, source_tier=4, fetched_at_source="2026-05-28"` until FRED EFFR data is refreshed in `fred_series_daily` (a separate data pipeline issue).

**Ops action required:** REBUILD macro-indicators container. QA verify `get_macro_snapshot` shows `carry.regime="UNKNOWN"` and `dataSource="estimate"` (not "live").

Zone health: DSI-INV-1 SHIPPED 09e93d76; ops REBUILD required | HEALTHY

## Session 2026-06-05 — FDA-2 + FDA-3: per-field provenance on price fields + honest /external

**Sprint:** FAKE-DATA-AUDIT — same contamination class as DSI-INV-1 (carry/yield), now applied to vnIndex/oil/gold/usdVnd top-level price fields.

**FDA-2 fix (dtos.go + usecases.go):**
- Added `VNIndexIsEstimate/VNIndexSourceTier`, `OilIsEstimate/OilSourceTier`, `GoldIsEstimate/GoldSourceTier`, `USDVndIsEstimate/USDVndSourceTier` to `MacroSnapshotResponse`.
- `resolveVNIndex` now returns `(float64, bool)` — fixture path → `isLive=false`.
- `resolveMarketPrices` now returns 6 values: `(oilPrice, goldPrice, usdVnd, oilLive, goldLive, usdVndLive)` — per-field liveness.
- `Execute()` populates per-field provenance: fixture fallback → `is_estimate=true + source_tier=4`; live port → `source_tier=1` (exchange-direct for commodities).

**FDA-3 fix (usecases.go + handlers_external.go):**
- `FetchedAt` in `MacroSnapshotResponse` is zero (`time.Time{}`) on all-fixture path — `time.Now()` only when `anyLive=true`. Prevents fresh-stamping fixture data.
- `handleExternal`: derives per-source status from field provenance instead of hardcoding `"ok"`. `summary.failed` counts degraded sources. On fixture fallback, sources report `"estimate"` and `summary.failed>0`.

**Live path verification:** `cmd/server/main.go` wires `SQLiteMarketIndexRepository`, `SBVRateSQLiteAdapter`, `CarryYieldInputsSQLiteAdapter` unconditionally. Commodity: `SQLiteCommodityRepository` gated on `COMMODITY_LIVE_MODE=true`; `HTTPCommodityFetcher` (fixture) is default when unset — per-field provenance covers both paths correctly.

**Test results:** 11 new tests (8 application + 3 HTTP). RED→GREEN confirmed. `go test ./...` 78 tests PASS / 0 FAIL. `go build ./...` CLEAN. `go vet ./...` CLEAN. Sandbox: primitive 18/18 + module 2/2 GREEN.

**Commit:** 0712c3a7 — 5 files (dtos.go, usecases.go, usecases_test.go, handlers_external.go, handlers_snapshot_contract_test.go)

**Ops action required:** REBUILD macro-indicators container. QA: verify `get_macro_snapshot` shows per-field provenance on price fields; verify `/external` reports `summary.failed>0` when carry inputs are fixture (current live state with stale EFFR).

---

## 2026-06-06 — FETCH-OPS-PAGE-TRUTH F-2: remove fake latency field

**Task:** F-2 (XS) — DELETE `totalLatencyMs:0` from summary map in `handlers_external.go:161`.

**D-3 applied:** Handler reads SQLite only (no live HTTP); fake-zero latency removed. No per-source `latencyMs` fields existed. Frontend `optional` guard ensures latency span disappears cleanly.

**Changes:**
- `handlers_external.go:161`: `"summary": map[string]interface{}{"ok": okCount, "failed": failedCount}` (removed `"totalLatencyMs": 0`)
- `handlers_snapshot_contract_test.go`: `TestExternalBodyContract` now asserts ABSENCE of `totalLatencyMs`; new `TestHandlersExternalLatencyRemoved` (AC-3 explicit).

**Tests:** 11/11 PASS (`pkg/interface/http`). Full suite 13/13 packages PASS. `go vet` clean.

**Status:** F-2 TODO→REVIEW. Pending: ops REBUILD macro-indicators + QA verify `GET :5004/external` has no `totalLatencyMs`.

Zone health: FDA-2+FDA-3 SHIPPED 0712c3a7; ops REBUILD required | HEALTHY

## Session 2026-06-07 — U4 direction+delta sweep (sprint TOOL-SURFACE-UPGRADE)

**Task:** TSU-DEV-U4 — add `prev_session_delta` + `direction` to all 4 headline values in `get_macro_snapshot`.

**Design:** Extended `MarketIndexPort` with `FetchPrevSessionVnIndex()` (second-most-recent `daily_ohlcv` close, OFFSET 1). Added `computeDelta(current, prev)` pure helper (nil prev → nil/"unknown"; flat threshold 0.1% of current). Oil/gold/usdVnd: single-row tables, no history → always (nil, "unknown"), never fabricated.

**Files changed:**
- `pkg/domain/ports.go` — `MarketIndexPort.FetchPrevSessionVnIndex` added
- `pkg/application/dtos.go` — 8 new fields on `MacroSnapshotResponse` (VNIndexDelta/Direction + OilUSDDelta/Direction + GoldUSDDelta/Direction + USDVndDelta/Direction)
- `pkg/application/usecases.go` — `resolvePrevSessionVnIndex`, `computeDelta`, `Execute()` updated
- `pkg/application/usecases_test.go` — `stubMarketIndex.FetchPrevSessionVnIndex` + 8 new tests (T-U4-1..7)
- `pkg/infrastructure/repositories.go` — `FetchPrevSessionVnIndex`, `fetchPrevSessionVnIndexFromDB` added
- `pkg/infrastructure/repositories_test.go` — `daily_ohlcv` table in `newInMemoryDB` + 4 new tests (T-U4-5)
- `pkg/interface/http/handlers_snapshot_contract_test.go` — stubs updated for new port method

**Tests:** `go test ./...` ALL PASS (12 packages). Sandbox: primitive 18/18 GREEN, module 2/2 GREEN. `go vet ./...` CLEAN.

**Status:** REVIEW — ops REBUILD macro-indicators required. QA: verify `get_macro_snapshot` JSON includes `vnIndexDelta` (number or null) + `vnIndexDirection` + `oilUsdDelta` (null) + `oilUsdDirection` ("unknown") etc.

---

## Session 2026-06-08 — FIX-MACRO-GO-FIXTURE-FALLBACK

**Root cause:** `effrStaleBound=96h` rejected FRED EFFR rows from mid-week (e.g. Tuesday) when queried on Sunday (120h > 96h) → fixture 5.33 served every weekend.

**Fix:** `effrStaleBound` extended from 96h to 168h (7 days) in `repositories.go`. FRED publishes business days only; 168h covers any single-week gap including 4-day holiday weekends. Fallback chain now: DB row within 168h (tier 2) → fixture 5.33 only when table empty (tier 4).

**Files changed:**
- `pkg/infrastructure/repositories.go` — `effrStaleBound` 96h → 168h + updated comment
- `pkg/infrastructure/repositories_test.go` — stale bound comment updated (8d not 5d); `TestFetchFedFundsRateFromDB_WeekendSim` added (5-day row passes 168h gate)
- `pkg/application/usecases_test.go` — `TestWeekendSim_BridgedDBValueServed` (AC-1) + `TestWeekendSim_FixtureOnlyWhenBothFail` (AC-2)

**Live verification:** POST /snapshot → `fedFundsRate=3.62, source_tier=2, is_estimate=false, regime=NEUTRAL`. Commit: e03b3ca3.

**Tests:** `go test ./...` ALL PASS (12 packages). Zero new failures.
