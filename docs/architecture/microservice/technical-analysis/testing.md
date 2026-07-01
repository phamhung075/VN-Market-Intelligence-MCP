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

### Unit Tests — Module (P1-C1g)

| Package | File | Coverage |
|---------|------|----------|
| `pkg/module` | `technical_analysis_test.go` | Multi-primitive composition, non-fatal policy, RSI+MACD+BB+MA+DetectCross |

### Unit Tests — Sandbox Runner (P1-E2)

| Package | File | Coverage |
|---------|------|----------|
| `cmd/sandbox` | `sandbox_test.go` | floatEq, diffFloat, diffLen, generateFromPattern (3 patterns), generateDeclineRally, safeIdx, RSI runner golden, RSI runner honest RED, RSI failure (error expected = GREEN), BB golden first window, DetectCross golden, forbiddenEnvPrefixes list |

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
