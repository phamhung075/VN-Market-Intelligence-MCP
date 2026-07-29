# technical-analysis — Testing

**Language:** Go (switched 2026-05-22 from TypeScript, Option B verdict)

## Go Test Suite

### Unit Tests — Primitives (P1-B1g..B5g)

| Package | File | Coverage |
|---------|------|----------|
| `pkg/primitive/rsi` | `rsi_test.go` | Wilder RSI, insufficient data, invalid period |
| `pkg/primitive/macd` | `macd_test.go` | MACD golden vector, EMA alignment, insufficient data |
| `pkg/primitive/bollinger_bands` | `bollinger_bands_test.go` | Population stdDev, squeeze, expansion |
| `pkg/primitive/moving_average` | `moving_average_test.go` | SMA, EMA, dispatcher, case-insensitive routing |
| `pkg/primitive/detect_cross` | `detect_cross_test.go` | Bullish/bearish cross, equal-then-cross, parallel lines |

### Unit Tests — Application + Interface/HTTP (FACTORY-TECHANALYSIS-go-livepath-tests, 2026-07-08)

Backstops the live/deployed Go request path — `pkg/application` and `pkg/interface/http`
had zero `*_test.go` files before this task, while the only green test suite covered the
dead `src/` TypeScript shadow service (deleted 2026-07-28 by
`FACTORY-TECHANALYSIS-delete-orphaned-ts-service`, which was blocked on this task).
`apps/technical-analysis/src/` and `__tests__/` no longer exist; the Go
suites above are the sole test suite for this service.

| Package | File | Coverage |
|---------|------|----------|
| `pkg/application` | `usecases_test.go` | `ComputeTAUseCase.Execute` — pure-compute path (closes supplied, DB never consulted), DB-backed path (fake `PriceRepo` returns candles, `GetCandles(symbol, 60)` args asserted, closes extracted in order), `period<=0` defaults to 14 (table: zero + negative), empty-closes+empty-symbol → `"closes or symbol required"` error (no I/O), `PriceRepo` error wrapped+propagated (`GetCandles(%s): %w`), calculator error propagated as-is |
| `pkg/interface/http` | `router_test.go` | `httptest.NewServer(NewRouter(...))` — `GET /health` (200, `status=ok`/`service=technical-analysis`), `POST /ta/indicators` happy path (200, response DTO decoded), invalid-JSON body (400), missing closes+symbol (400, exact error message), useCase error via calculator failure (500), useCase error via DB-backed `PriceRepo` failure (500) |

Both files use local fakes (`fakeCalculator`, `fakePriceRepo`) satisfying the
`application.TACalculator` / `application.PriceRepo` ports — no `infrastructure`
package import, no SQLite, no DB credentials. Pattern mirrors the established
`httptest.NewServer(NewRouter(...))` harness already proven in
`cmd/sandbox/service_adapters.go` (`newTestServer`) and `apps/stock-price/pkg/interface/http/router_test.go`.

Purely additive — no production code changed. `go test ./...` (12 packages) and
sandbox 35/35 scenarios green after this change (same as before; the task adds
coverage, not new behavior).

### Unit Tests — Module (P1-C1g)

| Package | File | Coverage |
|---------|------|----------|
| `pkg/module` | `technical_analysis_test.go` | Multi-primitive composition, non-fatal policy, RSI+MACD+BB+MA+DetectCross |

### Unit Tests — Sandbox Runner (P1-E2)

| Package | File | Coverage |
|---------|------|----------|
| `cmd/sandbox` | `sandbox_test.go` | floatEq, diffFloat, diffLen, generateFromPattern (3 patterns), generateDeclineRally, safeIdx, RSI runner golden, RSI runner honest RED, RSI failure (error expected = GREEN), BB golden first window, DetectCross golden, forbiddenEnvPrefixes list |

**File layout (FACTORY-TECHANALYSIS-split-sandbox, 2026-07-09):** `cmd/sandbox/main.go` was a
1859L god-file; split into ~29 single-responsibility files (all `package main`, same directory —
`doc.go`, `types.go`, `audit.go`, `diff.go`, `closes_gen.go`, `pattern_gen.go`, `scenario_path.go`,
`runner_map.go` + per-primitive `runner_*.go`/`*_types.go`/`*_diffs.go`, `service_*.go`,
`runner_service.go`, `utils.go`, `main.go`), each ≤120L. `runPrimitive`'s switch was replaced by a
`map[string]Runner` (`runner_map.go`). The dead `parseCloses` shim (zero real callers, fully
superseded by `generateFromPattern`/`generateRamp`) was deleted. `sandbox_test.go` needed no
changes — same package, same directory, all package-local identifiers stay visible. Oracle
verdicts confirmed byte-identical before/after (35/35 scenarios green, `dashboard/build.sh`
render-check PASS).

**Calculator dedup (FACTORY-TECHANALYSIS-dedup-calculator, 2026-07-29):** `service_adapters.go`'s
`sandboxCalculator.Calculate` used to carry its own copy of the `module.Result ->
domain.TechnicalIndicators` mapping, duplicated from `pkg/infrastructure.TACalculator.Calculate`
and drifted from it — the sandbox copy omitted `MA5`/`MA20`/`MA50`. Both callers now delegate to
a single `module.ToDomainIndicators(res)` (`pkg/module/mapper.go`); the sandbox oracle now
populates MA5/20/50 like the real service does (behavior change, intended — see
`docs/architecture/microservice/technical-analysis/infrastructure.md` § TACalculator). No existing
scenario JSON asserts MA5/20/50 presence, so the 35/35 sandbox suite required no fixture changes.
`TACalculator.Calculate` output confirmed byte-identical before/after via a temporary baseline-capture
test (5 representative close-series inputs, JSON diff clean).

## Scenario Suite (P1-D1 + P1-D2)

30 scenario JSON files under `docs/scenarios/technical-analysis/`:
- `primitives/` — 25 files (5 per primitive × 5 scenarios: golden + edge × 3 + failure)
- `module/` — 5 files (multi-primitive composition stories)

All 30 scenarios pass through `go run ./cmd/sandbox`:
```sh
cd apps/technical-analysis
go run ./cmd/sandbox -tier=primitive -scenario=rsi/rsi-golden.json    # status: green
go run ./cmd/sandbox -tier=module    -scenario=rsi-macd-crossover.json # status: green
```

## Run Commands

```bash
# All Go tests
cd apps/technical-analysis && go test ./...

# Static analysis
cd apps/technical-analysis && go vet ./...

# Build all binaries
cd apps/technical-analysis && go build ./...

# Sandbox runner (all primitive scenarios)
cd apps/technical-analysis
for f in /path/to/docs/scenarios/technical-analysis/primitives/*.json; do
  name=$(basename "$f")
  go run ./cmd/sandbox -tier=primitive -scenario="$name"
done

# ENV audit gate (security clause — must return empty forbidden_matches)
env -i HOME=$HOME PATH=$PATH go run ./cmd/sandbox -audit
# Expected output:
# audited_env_keys: HOME,PATH
# forbidden_matches:
```

## Test Counts (baseline 2026-05-22)

| Package | Tests | Status |
|---------|-------|--------|
| cmd/sandbox | 11 | ok |
| pkg/module | (integration) | ok |
| pkg/primitive/bollinger_bands | (table-driven) | ok |
| pkg/primitive/detect_cross | (table-driven) | ok |
| pkg/primitive/macd | (table-driven) | ok |
| pkg/primitive/moving_average | (table-driven) | ok |
| pkg/primitive/rsi | (table-driven) | ok |
| **Total** | **7 packages** | **all ok** |

## Dashboard Trust Layer (G12)

Per pilot charter G12 rule: no task is DONE until `go test ./...` is green AND all 30 scenarios pass the sandbox runner. The `cmd/sandbox` binary is the mechanised DoD gate.

## MONEY-RADAR-P0-T1-OSCILLATORS (2026-07-01)

`pkg/domain/money_flow_service_test.go` — 6 pure table-driven tests (no DB):
insufficient-history (`<2` bars), insufficient-window (`>=2` but `<21` bars, OBV
still real), sufficient-data all-4-fields-populated + plausibility (VWAP within
close range, ratio `>0`), known-value z-score, zero-down-volume → nil (not
`+Inf`), C1 regression guard (H/L=0 does not block the calc).

`pkg/infrastructure/multi_ticker_ohlcv_repository_test.go` — 2 new tests:
`TestGetMultiTickerCandles_VolumePopulated` (volume column scanned correctly),
`TestGetMultiTickerCandles_NullVolumeDefaultsToZero` (NULL-safe scan, same
pattern as open/high/low).

**Note:** this feature is NOT wired into `cmd/sandbox` primitive/module tiers —
same precedent as the P0-1 volatility and IND-P1 momentum/relative-strength/52w-
proximity features, none of which added sandbox scenario coverage either (the
sandbox harness is scoped to the original 5 primitives: RSI/MACD/BB/MA/Cross).
Verification is via `go test ./...` (domain + infrastructure) plus a live
RAW-probe against a rebuilt+restarted container (image ID confirmed changed;
`docs/protocols/docker-deployment-runbook.md` § stale-image mitigation).

Live probe (2026-07-01, post-rebuild, image `14cc6c62f857`):
```
POST /ta/money-flow-oscillators {"tickers":["VCB"]}
→ {"code":"VCB","obv":17926690,"rel_vol_z_20":-2.100230853390725,
   "up_down_vol_ratio":1.39130139275766,"degraded_vwap":61654.54866462252,
   "is_proxy":true,"bars_used":100}
```
No `mfi`/`cmf`/`chaikin`/`ad_line` field present anywhere in the response
(grep-verified) — C1 field-constraint honored.
