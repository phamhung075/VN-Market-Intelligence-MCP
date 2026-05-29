<!-- size-justification: 118L — 3 live-input wirings (deposit/fed/earningYield) each = new port method + SQLite adapter + composition-root inject + Execute() resolve + safe-degrade fallback + DV test; per-input source SSOT table + AC matrix are load-bearing to prevent a re-hardcode false-green. -->

# DPI-2b — Carry/Yield LIVE Inputs: Wire Live Sources, Retire Frozen Fixtures

**Sprint:** DATA-PIPELINE-INTEGRITY | **Zone:** `apps/macro-indicators/` | **Owner:** dev-macro-indicators | **Author:** po (decision) | **Date:** 2026-05-29

---

## Why this exists (PO decision)

DPI-2 fixed only the `computedAt` TIMESTAMP. The carry/yield regime INPUTS are still frozen fixture constants in `usecases.go`:
- `fixtureVNDDepositRate = 4.7`
- `fixtureFedFundsRate = 5.33`
- `fixtureEarningYield = 8.2`

A fresh timestamp on frozen inputs is **cosmetic** — the regime never changes. carry is permanently `FII_OUTFLOW_RISK` purely because the frozen Fed 5.33 > frozen VND 4.7. This does NOT satisfy the user GOAL "carry & yield … NOT RECOMPUTING" and is a textbook false-green (`feedback_fence_false_green`). DPI-2b is required for the sprint DoD to be honest.

## Feasibility verdict — LIVE source exists for ALL THREE inputs (PO-verified in mcp-server)

The mcp-server **already derives all three live** from the SHARED `market.db` (same DB the Go service reads read-only via DPI-1's adapter). The fixtures (4.7/5.33/8.2) are literally the documented mcp-server fallbacks. No new HTTP fetcher needed — read existing rows.

| Input | DECISION | Live source (market.db) | Producer | Fallback when absent/stale |
|---|---|---|---|---|
| VND deposit rate | **LIVE-WIRE** | `sbv_rates.max_deposit_rate_pct` WHERE source='sbv' | SBV cron (`mcp-server fetchers/sbv.ts`) | `fixtureVNDDepositRate=4.7` (safe-degrade, keep) |
| Fed funds rate | **LIVE-WIRE** | `fred_series_daily` WHERE series='EFFR' ORDER BY date DESC LIMIT 1 | `fetchFredEffrIorb` (FRED EFFR) | `fixtureFedFundsRate=5.33` (safe-degrade, keep) |
| Earnings yield | **LIVE-WIRE** | `tracked_indicators` WHERE indicator='market_earning_yield' ORDER BY extracted_at DESC LIMIT 1 | `marketEarningYieldJob` | `fixtureEarningYield=8.2` (safe-degrade, keep) |

ZERO documented-gap inputs — all three are live-wirable. The fixtures are **retained ONLY as the safe-degrade fallback** (returns when DB row absent/zero/stale), NOT as the primary value. This mirrors the established VN-Index / commodity / SBV-FX pattern exactly — the architect's DPI-1 design already proves it.

## Specification (mirror the DPI-1 SBVRateSQLiteAdapter pattern)

### 1. `apps/macro-indicators/pkg/domain/ports.go` — add one port

```go
// CarryYieldInputsPort supplies the live regime INPUTS for the carry-trade and
// yield-spread primitives, read from the shared market.db. All methods return
// (0, nil) on absent/zero/stale rows (safe-degrade — caller keeps fixture).
type CarryYieldInputsPort interface {
    GetVNDDepositRate(ctx context.Context) (float64, error)   // sbv_rates.max_deposit_rate_pct
    GetFedFundsRate(ctx context.Context) (float64, error)     // fred_series_daily series='EFFR' latest
    GetEarningYield(ctx context.Context) (float64, error)     // tracked_indicators 'market_earning_yield' latest
}
```
(One port, three methods — or three single-method ports if cleaner; dev's call. Keep Fence-A: zero imports from app/infra/interface.)

### 2. `apps/macro-indicators/pkg/infrastructure/repositories.go` — add adapter

`CarryYieldInputsSQLiteAdapter` implementing the port, read-only `file:<DB_PATH>?mode=ro`, mirroring `SBVRateSQLiteAdapter` exactly (same constructor env pattern, same `time.Parse(time.RFC3339Nano, …)` staleness handling — **R-2 critical: ms-precision TS timestamps; RFC3339Nano not RFC3339**). Extract pure `fetch…FromDB(ctx, db)` helpers so tests inject `:memory:`.

Staleness bounds (per-source cadence + drift):
- deposit rate: 26h (SBV daily) — reuse `commodityStaleBound` magnitude
- EFFR: 96h (FRED business-day lag over weekends) — define `effrStaleBound = 96 * time.Hour`
- earning yield: 26h (job daily)

**Safe-degrade contract (per method):** return `(0, nil)` — never an error — on missing DB, no row, NULL/zero value, unparseable or stale `fetched_at`/`extracted_at`. (NOT a silent hardcode — fixture fallback happens explicitly in Execute(), see step 4.)

### 3. `apps/macro-indicators/cmd/server/main.go` — wire composition root

```go
carryYieldRepo := infrastructure.NewCarryYieldInputsSQLiteAdapter()
useCase := application.NewComputeMacroUseCase(commodityFetcher, sbvRateRepo, marketIndexRepo, carryYieldRepo)
```
Add the field to `ComputeMacroUseCase` struct + `NewComputeMacroUseCase` signature (Fence-C: only main.go imports infrastructure — preserved).

### 4. `apps/macro-indicators/pkg/application/usecases.go` — resolve live, fixture-fallback

Add a resolver helper (mirror `resolveVNIndex`) for each input: call the port; if `>0` use it, else fall back to the `fixture*` const. Then populate `CarryTradeInput`/`YieldSpreadInput` from the resolved values:

```go
vndDeposit := resolveVNDDepositRate(ctx, uc)   // port>0 ? port : fixtureVNDDepositRate
fedFunds   := resolveFedFundsRate(ctx, uc)     // port>0 ? port : fixtureFedFundsRate
earnYield  := resolveEarningYield(ctx, uc)     // port>0 ? port : fixtureEarningYield
...
CarryTrade: carry.CarryTradeInput{VNDDepositRate: vndDeposit, FedFundsRate: fedFunds, ComputedAt: computedAt},
YieldSpread: yld.YieldSpreadInput{EarningYield: earnYield, DepositRate: vndDeposit, ComputedAt: computedAt},
```

**Keep the three `fixture*` consts** — they are now the documented safe-degrade fallback, not the primary path. Update the file doc-comment: fixtures are fallback-only; live inputs read from market.db via CarryYieldInputsPort. (Do NOT delete them — deleting + inlining a literal would re-create the hardcode.)

## Acceptance Criteria (DV — must go RED before, GREEN after)

- **AC-1 (deposit live):** with a fresh `sbv_rates` row (max_deposit_rate_pct=X, source='sbv', recent fetched_at) in an injected `:memory:` DB, Execute() carry uses X, not 4.7.
- **AC-2 (fed live):** with a fresh `fred_series_daily` EFFR row (value=Y), Execute() carry uses Y, not 5.33.
- **AC-3 (earning live):** with a fresh `tracked_indicators` market_earning_yield row (value=Z), Execute() yield uses Z, not 8.2.
- **AC-4 (safe-degrade):** with an EMPTY DB, Execute() falls back to 4.7/5.33/8.2 AND does not error/panic (preserves DPI-1 safe-degrade behaviour).
- **AC-5 (stale-degrade):** with a row older than its staleBound, fixture fallback applies.
- **AC-6 (regime flips):** a DV test where live inputs make `carrySpread = vndDeposit − fedFunds` cross a threshold proves the regime is NOT frozen (e.g. live deposit 6.0 vs fed 4.0 → spread flips sign vs the frozen 4.7−5.33). This is the anti-false-green proof.
- **AC-7 (live re-probe — DoD):** after ops REBUILD (`docker compose build` + `up -d --no-deps --force-recreate macro-indicators`), `get_macro_snapshot` carry/yield reflect values derived from the live DB rows AND a fresh `computedAt`. QA verifies via direct market.db read of the three source rows vs the snapshot output (not the unit test alone — `feedback_silent_swallow_serial_bugs`).

## Constraints
- R-1: no randomness; `time.Now()` only for computedAt label (unchanged from DPI-2).
- Fence-A/B/C preserved (domain no app/infra imports; module imports only primitives; only main.go imports infrastructure).
- Read-only DB open (`mode=ro`), respects DB_READONLY=true.
- REBUILD not restart (`feedback_rebuild_after_dev_change`) — sequence AFTER DPI-1/DPI-2 in the macro-indicators rebuild (same container).

## Owner chain
dev-macro-indicators (impl + DV tests RED→GREEN) → ops (rebuild macro-indicators, after DPI-1/2) → qa (live re-probe + direct-DB cross-check AC-7) → po (fold into DPI-EXIT).

---

## [Developer] — impl complete 2026-05-30

**Status:** REVIEW. All ACs 1–6 GREEN. AC-7 (live re-probe) pending ops REBUILD.

### Files changed

| File | Change |
|---|---|
| `pkg/domain/ports.go` | Added `CarryYieldInputsPort` (3 methods: GetVNDDepositRate / GetFedFundsRate / GetEarningYield) |
| `pkg/infrastructure/repositories.go` | Added `CarryYieldInputsSQLiteAdapter` + `effrStaleBound` (96h) + `depositYieldStaleBound` (26h) + 3 pure query helpers: `fetchVNDDepositRateFromDB` / `fetchFedFundsRateFromDB` / `fetchEarningYieldFromDB` |
| `pkg/application/usecases.go` | Added `carryYieldInputs` field to struct; updated `NewComputeMacroUseCase` signature (4th arg); added `resolveVNDDepositRate` / `resolveFedFundsRate` / `resolveEarningYield` helpers; Execute() now calls resolvers (not inline fixture consts); fixture consts kept as safe-degrade fallback with updated doc-comment |
| `cmd/server/main.go` | Injected `infrastructure.NewCarryYieldInputsSQLiteAdapter()` as 4th arg to `NewComputeMacroUseCase` |
| `pkg/infrastructure/repositories_test.go` | Extended `newInMemoryDB` with `sbv_rates.max_deposit_rate_pct` column + `fred_series_daily` + `tracked_indicators` tables; added 9 DPI-2b adapter tests (fresh/stale/absent for all three inputs) |
| `pkg/application/usecases_test.go` | Updated all 8 existing `NewComputeMacroUseCase` calls (nil 4th arg); added `stubCarryYieldInputs` stub; added 6 DPI-2b tests (AC-1..4 + AC-4-nil + AC-6 regime-flip) |
| `pkg/interface/http/handlers_snapshot_contract_test.go` | Updated `NewComputeMacroUseCase` call (nil 4th arg) |

### Build / test results

```
go build ./...   → CLEAN (0 errors)
go vet ./...     → CLEAN (0 warnings)
go test ./...    → ALL PASS
  pkg/application        ok  (8 existing + 6 new DPI-2b tests)
  pkg/infrastructure     ok  (existing + 9 new DPI-2b adapter tests)
  pkg/interface/http     ok
  all primitive/module   ok
```

### AC-6 REGIME-FLIP DV outcome (anti-false-green proof)

Test: `TestDPI2b_RegimeFlip_LiveInputs` — live deposit=6.0%, fed=4.0%, earnYield=7.0%

```
DPI-2b AC-6 REGIME-FLIP PROVEN:
  carrySpread 2.00  (was frozen −0.63 from 4.7−5.33)
  regime NEUTRAL    (was frozen FII_OUTFLOW_RISK)
```

With live inputs `carrySpread = 6.0 − 4.0 = +2.00` (NEUTRAL), vs frozen fixture spread `4.7 − 5.33 = −0.63` (FII_OUTFLOW_RISK). Regime changed sign and label — regime is NOT frozen. DPI-2b is not a false-green.

### Safe-degrade confirmed

`TestDPI2b_SafeDegrade_NilPort`: nil port → resolvers return fixtures → carrySpread = −0.63 (FII_OUTFLOW_RISK). Confirms fixture fallback activates exactly when live inputs unavailable — no panic, no zero-value emission.

### AC-7 QA verification query (leave for QA)

After `docker compose build macro-indicators && docker compose up -d --no-deps --force-recreate macro-indicators`:

1. Call `get_macro_snapshot` via gateway; note carry.carrySpread, carry.regime, carry.vndDepositRate, carry.fedFundsRate, yield.spread, yield.label.

2. Cross-check against direct DB reads:

```sql
-- VND deposit rate (should match carry.vndDepositRate when fresh)
SELECT max_deposit_rate_pct, fetched_at
FROM sbv_rates WHERE source='sbv';

-- Fed funds rate (should match carry.fedFundsRate when fresh)
SELECT value, date
FROM fred_series_daily WHERE series='EFFR'
ORDER BY date DESC LIMIT 1;

-- Earnings yield (should match yield.earningYield when fresh)
SELECT value, extracted_at
FROM tracked_indicators WHERE indicator='market_earning_yield'
ORDER BY extracted_at DESC LIMIT 1;
```

3. Verify: snapshot values match DB rows (not fixture 4.7/5.33/8.2), and `carry.computedAt` reflects today (not 2026-05-23).

4. If any DB row is absent/stale (staleness guard fires): verify snapshot falls back to fixture constants (4.7/5.33/8.2) — that is correct safe-degrade, not a bug.

### REBUILD note (per feedback_rebuild_after_dev_change)

OPS MUST `docker compose build macro-indicators && docker compose up -d --no-deps --force-recreate macro-indicators` — a plain `restart` relaunches the stale image and will NOT pick up this code change.

---

## [QA] Review Record — 2026-05-30T00:21Z (AC-7 live re-probe)

**Verdict: PASS (with documented acceptable safe-degrades)**

### Method
1. Snapshot values read from live POST /macro/snapshot (api-gateway → macro-indicators Go service).
2. DB rows verified directly in mcp-server container via `bun -e` (no sqlite3 — correct per spec).

### Cross-check table

| Input | Snapshot value | DB row value | Source query | Match / Verdict |
|---|---|---|---|---|
| `carry.vndDepositRate` | **5.0** | `max_deposit_rate_pct=5, fetched_at=2026-05-29T23:15:03Z` | `sbv_rates WHERE source='sbv'` | **MATCH — LIVE** |
| `carry.fedFundsRate` | **5.33** (fixture) | `value=3.63, date=2026-05-14` | `fred_series_daily WHERE series='EFFR' ORDER BY date DESC LIMIT 1` | **SAFE-DEGRADE — ACCEPTABLE** (see note) |
| `yield.earningYield` | **8.2** (fixture) | no row | `tracked_indicators WHERE indicator='market_earning_yield'` | **SAFE-DEGRADE — ACCEPTABLE** (see note) |

### Safe-degrade documentation

**EFFR (fedFundsRate):** DB row date = 2026-05-14. Staleness bound = 96h. 96h cutoff = 2026-05-25T23:21Z. The row is 15 days old — staleness guard fires correctly, fixture fallback `5.33` applies. This is NOT a false-green: the adapter's guard is working as designed; the underlying FRED fetch job has not produced a fresh row. DB row is genuinely stale.

**market_earning_yield:** `tracked_indicators` has zero rows for this indicator. Safe-degrade to `8.2` is correct. DB is genuinely empty.

**VND deposit rate:** LIVE — adapter reads `max_deposit_rate_pct=5` from fresh sbv_rates row (fetched 2026-05-29T23:15:03Z, within 26h staleness bound). Snapshot matches DB exactly.

### Anti-false-green confirmation
- `carry.computedAt = 2026-05-29T23:20:58Z` — NOT frozen 2026-05-23 (DPI-2 confirmed).
- `carry.vndDepositRate = 5` — NOT fixture 4.7 (live DB value wired correctly via CarryYieldInputsSQLiteAdapter).
- Regime = `FII_OUTFLOW_RISK` with `carrySpread = -0.33` (5.0 − 5.33 = −0.33) — spread uses LIVE deposit rate (5.0 not 4.7); fed rate is fixture due to stale DB (documented above).
- The adapter's staleness machinery is PROVEN working: deposit rate was LIVE (fresh row wired through), EFFR fell back to fixture only because DB row is genuinely stale (date=2026-05-14 >> 96h ago).

### Container state
- macro-indicators: Up 5 minutes (healthy) — post-rebuild confirmed.
- DPI-2b code deployed: `CarryYieldInputsSQLiteAdapter` in binary confirmed (vndDepositRate live value 5 ≠ fixture 4.7 proves adapter runs).

### AC-7 STATUS: PASS (LIVE inputs wired; safe-degrades legitimate and documented)
