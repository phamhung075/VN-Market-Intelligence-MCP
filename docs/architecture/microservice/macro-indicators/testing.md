# macro-indicators — Testing

**Runtime:** Go `testing` package + `net/http/httptest`. No external mocking framework.
**Total:** 33 `_test.go` files across 11 packages (6 primitive + domain + application +
infrastructure + interface/http + module) — 288 top-level tests, 543 total test cases
(incl. table-driven subtests) — all pass, 0 fail (2026-07-08 baseline, `go test ./...`;
QA re-verified 2026-07-08, corrected package count from an initial miscount of 8).

> History note: this service originally shipped a parallel TypeScript/Bun test suite
> (`src/__tests__/`, `__tests__/`) covering scraper adapters and a `_deprecated` domain
> layer. Neither was ever wired into CI (the `bun test` CI job is scoped to
> `apps/mcp-server` only — see `.github/workflows/ci.yml`; macro-indicators CI runs
> `golangci-lint` only) nor into the shipped Docker image (`Dockerfile` builds
> `cmd/server` from `cmd/`, `pkg/`, `api/` only — no `src/`). The TS tree was deleted
> 2026-07-08 (`FACTORY-MACRO-delete-dead-ts-tree`); Go `pkg/**/*_test.go` was always the
> real coverage for the deployed service. History preserved at git tag `macro-pre-delete`.

## Primitive Tests (Fence-A: stdlib-only)

| Package | File | What it verifies |
|---|---|---|
| `pkg/primitive/macro_oil_impact_classifier` | `macro_oil_impact_classifier_test.go` | Brent/WTI price → BEARISH/BULLISH/NEUTRAL tier thresholds ($100, $60) |
| `pkg/primitive/macro_gold_direction_classifier` | `macro_gold_direction_classifier_test.go` | XAU/USD price → BULLISH/BEARISH/NEUTRAL thresholds ($2200) |
| `pkg/primitive/macro_usdvnd_direction_classifier` | `macro_usdvnd_direction_classifier_test.go` | USDVND rate → BEARISH/BULLISH/NEUTRAL threshold (25000) |
| `pkg/primitive/macro_investment_clock` | `macro_investment_clock_test.go` | Indicator name → deterministic investment-clock tier/phase (fixed-score lookup, no `Math.random()` — R-1 risk resolved) |
| `pkg/primitive/macro_carry_trade_signal` | `macro_carry_trade_signal_test.go` | Carry-trade signal from rate-differential inputs |
| `pkg/primitive/macro_yield_spread_signal` | `macro_yield_spread_signal_test.go` | Yield-spread signal (deposit vs. earnings rate → EXPENSIVE/CHEAP/UNKNOWN) |

## Domain Tests (VMT — Vietnam Macro Tracker)

**Files:** `pkg/domain/services_vmt_{bop,cpi,liquidity,macro,omo,trade}_test.go` — 6 files

Covers domain-layer scoring/classification logic for balance-of-payments, CPI,
liquidity, general macro, open-market-operations, and trade indicators.

## Application Tests

**Files:** `pkg/application/{usecases,usecases_vmt_bop,usecases_vmt_failclose,usecases_vmt_liquidity,usecases_vmt_trade,fetch_deadline}_test.go` — 6 files

| Test area | What it verifies |
|---|---|
| Use-case DTO mapping | Snapshot/response shape correctness |
| Fail-close behavior | Source failure → safe default, no crash |
| Per-source deadline | Timeout budget respected, slow source doesn't block others |

## Infrastructure Tests (VMT parsers, cache, VPS fetch)

**Files (11):** `parsers_vmt_{bop,cpi,gso_indicators,sbv_interbank_omo,sbv_interbank_omo_p03,trade}_test.go`,
`cache_vmt_nso_{deadline,selector}_test.go`, `repositories_test.go`, `repository_vmt_omo_daily_test.go`, `vpsFetch_test.go`

| Test area | What it verifies |
|---|---|
| GSO/SBV/NSO HTML/table parsers | Real-source parsing → structured indicator values |
| NSO cache (deadline + selector) | Cache freshness/selection logic under time pressure |
| `vpsFetch` | VPS-proxied fetch for VN-geo-blocked sources (project_bctc_vps_proxy pattern) |
| SQLite readonly repositories | `market.db` readonly access, no owned tables |

## Interface / HTTP Tests

**Files:** `pkg/interface/http/{router,handlers_snapshot_contract,handlers_vmt_failclose}_test.go` — 3 files

| Test area | What it verifies |
|---|---|
| `router_test.go` | Route wiring, health check |
| `handlers_snapshot_contract_test.go` | Snapshot response contract shape |
| `handlers_vmt_failclose_test.go` | HTTP-layer fail-close on source failure |

## Module Tests

**File:** `pkg/module/macro_signals/macro_signals_test.go` — signal aggregation across primitives.

## Fence Compliance (checked every commit — see flow/main.md § Fence Rules)

- Fence-A: `grep -rn "application\|interface\|module" pkg/primitive/` → 0
- Fence-B: `grep -rn "infrastructure" pkg/module/` → 0
- Fence-C: `grep -rn "infrastructure" pkg/domain/ pkg/application/ pkg/primitive/ pkg/module/ pkg/interface/` → 0

## Run Commands

```bash
cd apps/macro-indicators && go test ./... -count=1        # all 33 files, 288 tests
cd apps/macro-indicators && go vet ./...                  # static analysis
cd apps/macro-indicators && go build ./cmd/...            # compile check
cd apps/macro-indicators && golangci-lint run             # depguard Fence-A/B/C (CI-enforced, .github/workflows/ci.yml)
```

## G12 DoD Gate — Sandbox (separate from unit tests, both mandatory)

```bash
cd apps/macro-indicators
go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all
go run ./cmd/sandbox -tier=module -module=macro-indicators -scenario=all
```

Scenario fixtures: `docs/scenarios/macro-indicators/{primitives,module}/`. Both commands
must exit 0 with all scenarios GREEN before any task is declared DONE — see
`docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md` §G12.
