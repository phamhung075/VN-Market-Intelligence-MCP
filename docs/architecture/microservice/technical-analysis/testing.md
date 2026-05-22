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
