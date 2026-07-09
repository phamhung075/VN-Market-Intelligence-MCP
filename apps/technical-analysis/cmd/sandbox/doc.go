// cmd/sandbox — credential-free scenario runner for the TA pilot dashboard.
//
// Usage:
//
//	go run ./cmd/sandbox -tier=primitive -scenario=rsi/rsi-mid-range.json
//	go run ./cmd/sandbox -tier=module    -scenario=rsi-macd-crossover.json
//	go run ./cmd/sandbox -tier=service   -scenario=health-ok.json
//	go run ./cmd/sandbox -audit                    # env audit gate only
//
// Emits one JSON result block to stdout.
// Exits 0 on GREEN, 1 on RED.
//
// Security contract:
//   - Zero DB access. Zero network calls. Zero API keys.
//   - Reads scenario JSON from docs/scenarios/technical-analysis/ only.
//   - All computation via pkg/primitive/* and pkg/module/* (pure functions).
//   - Service tier uses httptest.NewServer (in-process, no port binding, no creds).
//
// File layout: this package is split across single-responsibility files
// (audit.go, diff.go, closes_gen.go, pattern_gen.go, scenario_path.go,
// runner_map.go, runner_<primitive>.go, service_*.go, main.go) each kept
// at or near the 120-LOC cap. All files share package main deliberately —
// cmd/sandbox is a leaf binary, not a reusable library, so an internal/
// sub-package would only add an import boundary with no consumer on the
// other side of it.
//
// P1-E2 — feat(ta-sandbox): credential-free scenario runner
package main
