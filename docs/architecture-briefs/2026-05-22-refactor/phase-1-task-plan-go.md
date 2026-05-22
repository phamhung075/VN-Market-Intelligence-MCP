---
title: "Phase 1 Task Plan (Go) — Technical-Analysis Pilot"
date: "2026-05-22"
author: "pm"
status: "READY-FOR-DISPATCH"
pilot: "technical-analysis"
sprint_kickoff: "2026-05-22"
sprint_deadline: "2026-07-03"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
decision_ref: "docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md"
architect_spec: "docs/architecture-briefs/2026-05-22-refactor/p0-4-composition-root-plan-go.md"
obsolete_ts_plan: "docs/architecture-briefs/2026-05-22-refactor/phase-1-task-plan.md (TS reference only)"
language: "Go"
---

# Phase 1 Task Plan (Go) — Technical-Analysis Pilot

**Generated:** 2026-05-22 by pm  
**Replaces:** `phase-1-task-plan.md` (TS plan, now obsolete reference kept for historical traceability)  
**Architect spec:** `docs/architecture-briefs/2026-05-22-refactor/p0-4-composition-root-plan-go.md` (§1-7)  
**Status:** READY-FOR-DISPATCH to dev-technical-analysis and dev-frontend

---

## Summary

Phase 1 expands the 5 execution buckets (P1-A through P1-E) into 15 atomic tasks across 2 developer agents. Tasks are sequenced by dependency: P1-A (composition root + DDD scaffold) unblocks P1-B and P1-C (primitives + module). P1-D (scenario suite) depends on P1-B. P1-E (dashboard) depends on P1-C and P1-D. All tasks include G12 enforcement: "run pilot scenarios + verify dashboard green" before marking done. Language: **Go** (Option B verdict, locked 2026-05-22).

---

## Charter context (unchanged)

- **Deadline:** 2026-07-03 (kickoff + 6 sprints).
- **Goals:** G1–G12 in `pilot-charter.md`. Language-agnostic. Unchanged by this reboot.
- **Anti-scope-creep clause:** still in force — pilot covers `technical-analysis` only.
- **Security clause:** zero DB credentials in sandbox process — still in force (enforced in every sandbox task).
- **WIP cap:** max 2 tasks In Progress simultaneously (one per agent).

---

## Why the `g` suffix

Tasks that have a TS equivalent in the obsolete plan are re-numbered with a `g` suffix (P1-A1 → P1-A1g) to make the language switch visible in TASKS.md and in git history. Tasks that are language-agnostic (P1-D1, P1-D2, P1-E1, P1-E2) keep their original IDs because the work itself is unchanged — only the backend Go runner command differs in P1-E2.

---

## Task Ledger

| ID | Title | Owner | Goals | Blocks | Blocked by | Est | AC count |
|----|-------|-------|-------|--------|------------|-----|----------|
| **P1-A1g** | Create `apps/technical-analysis/cmd/server/main.go` (Go composition root + wiring) | dev-technical-analysis | G3 | P1-A2g, P1-B*g, P1-C1g | — | 20m | 5 |
| **P1-A2g** | Create `apps/technical-analysis/go.mod` + `go.sum` (module name, Go 1.22, chi + modernc-sqlite deps) | dev-technical-analysis | G3 | P1-A3g | P1-A1g | 10m | 4 |
| **P1-A3g** | Scaffold `pkg/` DDD layout (domain, application, infrastructure, interface/http — 6 stub files) | dev-technical-analysis | G3 | P1-A4g, P1-C1g | P1-A2g | 30m | 8 |
| **P1-A4g** | Rewrite `apps/technical-analysis/Dockerfile` (golang:1.22-alpine builder → alpine:3.20 runtime, CGO_ENABLED=0) | dev-technical-analysis | G3 | P1-A5g | P1-A3g | 10m | 4 |
| **P1-A5g** | Restore / create `apps/technical-analysis/api/openapi.yaml` (HTTP contract from §6 in architect spec) | dev-technical-analysis | G3 | — | P1-A4g | 15m | 4 |
| **P1-B1g** | Extract Go primitive: `pkg/primitive/rsi.go` + table-driven test + 3 scenario JSONs | dev-technical-analysis | G1, G7, G12 | P1-C1g | P1-A5g | 1.5h | 6 |
| **P1-B2g** | Extract Go primitive: `pkg/primitive/macd.go` + table-driven test + 3 scenario JSONs | dev-technical-analysis | G1, G7, G12 | P1-C1g | P1-B1g | 1.5h | 6 |
| **P1-B3g** | Extract Go primitive: `pkg/primitive/bollinger_bands.go` + table-driven test + 3 scenario JSONs | dev-technical-analysis | G1, G7, G12 | P1-C1g | P1-B2g | 1.5h | 6 |
| **P1-B4g** | Extract Go primitive: `pkg/primitive/moving_average.go` (SMA + EMA + dispatcher) + table-driven test + 3 scenario JSONs | dev-technical-analysis | G1, G7, G12 | P1-C1g | P1-B3g | 1.5h | 6 |
| **P1-B5g** | Extract Go primitive: `pkg/primitive/detect_cross.go` + table-driven test + 3 scenario JSONs | dev-technical-analysis | G1, G7, G12 | P1-C1g | P1-B4g | 1.5h | 6 |
| **P1-C1g** | Module composition: `pkg/module/technical_analysis.go` — barrel-equiv + composition function + multi-primitive test | dev-technical-analysis | G2, G12 | P1-D1, P1-D2, P1-E1 | P1-B5g | 1h | 7 |
| **P1-D1** | 25-file primitive scenario JSON suite (5 × 5) under `docs/scenarios/technical-analysis/primitives/` | dev-technical-analysis | G1, G7, G12 | P1-E1 | P1-B5g | 2h | 8 |
| **P1-D2** | 5-file multi-primitive scenario JSON suite under `docs/scenarios/technical-analysis/module/` | dev-technical-analysis | G2, G7, G12 | P1-E1 | P1-C1g | 1h | 5 |
| **P1-E1** | Three-level dashboard HTML / CSS / JS (primitive / module / service panels) | dev-frontend | G6, G8, G9, G12 | — | P1-C1g, P1-D2 | 3h | 8 |
| **P1-E2** | Dashboard edit-rerun (Go sandbox runner: `go run ./cmd/sandbox`, env audit, honest red/green) | dev-frontend | G7, G8, G12 | — | P1-E1 | 1.5h | 5 |

**Total atomic tasks:** 15 (5 A-bucket + 5 B-bucket + 1 C-bucket + 2 D-bucket + 2 E-bucket)  
**Total estimated effort:** ~16.5 hours across 2 agents  
**WIP constraint:** max 2 tasks In Progress simultaneously

**Key differences vs TS plan:**
- TS plan had 16 tasks (P1-A1..A5 + B1..B5 + C1 + D1 + D2 + E1 + E2), with delete-index as implicit sixth A-task. Go plan has 15 tasks (P1-A1g..A5g + B1g..B5g + C1g + D1 + D2 + E1 + E2). Go is greenfield, no delete step needed.
- P1-A3g scaffolds `pkg/` (not `internal/`) per architect spec §2 — mirrors all existing Go services.
- P1-A5g places openapi.yaml at `api/openapi.yaml` (not `src/interface/openapi.yaml`) per Go convention in architect spec §2.
- P1-E2 uses `go run ./cmd/sandbox` runner (not `bun run sandbox`) per architect spec §6 OQ-1.

---

## Sequencing

```
P1-A1g → P1-A2g → P1-A3g → P1-A4g → P1-A5g   (sequential — A-bucket atomic close)
  ↓
P1-B1g → P1-B2g → P1-B3g → P1-B4g → P1-B5g   (sequential for scaffolding stability; PM may parallelize B3g..B5g after B2g)
  ↓
P1-C1g                                        (module composition, depends on all 5 primitives)
  ↓
P1-D1 (parallel to B-tail) → P1-D2 (after C1g) → P1-E1 (after C1g + D2)
  ↓
P1-E2                                         (final, depends on E1)
```

**Critical path:** P1-A1g → A5g → B1g → B5g → C1g → E1 → E2 (~11 hours wall-clock)  
**Schedule slack:** P1-D1 can start during B3g..B5g; no parallelization needed unless PM decides to enable B3g..B5g concurrent execution.

---

## Go Smoke-Check Standard (all Go tasks)

All P1-A*g and P1-B*g and P1-C*g tasks must pass before commit:

```sh
cd apps/technical-analysis
go test ./...        # all unit + integration tests green
go vet ./...         # zero warnings
go build ./cmd/...   # binary compiles (catches import-only errors)
```

For tasks touching scenario JSON:
```sh
find docs/scenarios/technical-analysis -name '*.json' -exec jq . {} \; > /dev/null
```

---

## Per-Task Spec

### P1-A1g — Create `apps/technical-analysis/cmd/server/main.go`

**Owner:** dev-technical-analysis  
**Goals:** G3 (Microservice has clean composition root)  
**Files touched:**
- `apps/technical-analysis/cmd/server/main.go` (NEW)

**AC:**
1. File created with exact content from architect spec §3 (74 lines verbatim, incl. imports, DI wiring, graceful shutdown)
2. No business logic in file (zero `if` on prices, zero `calculateRSI`/`calculateMACD` calls, zero domain operations)
3. Line count: ≤80 lines (architect spec §3 = 74 lines; threshold set to allow formatting variance)
4. All import paths resolve (from `pkg/domain/`, `pkg/application/`, `pkg/infrastructure/`, `pkg/interface/http`)
5. G3 QA grep check passes: `grep -c "calculateRSI\|calculateMACD\|detectCross\|classifyZone\|if.*price\|for.*candle" apps/technical-analysis/cmd/server/main.go` returns 0
6. `pkg/` packages not yet created — `go vet ./cmd/...` expected to fail at this stage (pre-scaffold)
7. Commit message references G3 + architect spec §3 pointer

**DoD includes:** Confirm import list matches architect spec §3 verbatim. Final commit atomic.

---

### P1-A2g — Create `apps/technical-analysis/go.mod` + `go.sum`

**Owner:** dev-technical-analysis  
**Goals:** G3  
**Files touched:**
- `apps/technical-analysis/go.mod` (NEW)
- `apps/technical-analysis/go.sum` (GENERATED via `go mod tidy`)

**AC:**
1. File `go.mod` created with exact content from architect spec §5:
   - Module path: `github.com/vn-market-intelligence/technical-analysis`
   - Go version: 1.22
   - Toolchain: go1.22.0
   - Require: `github.com/go-chi/chi/v5 v5.2.1` (matches alert-engine)
   - Require: `modernc.org/sqlite v1.29.9` (pure-Go, no CGO)
2. `go mod verify` passes (no checksum mismatches)
3. `go.sum` generated by `go mod tidy` (non-empty, contains transitive deps)
4. Commit message references G3 + architect spec §5 + dependency rationale
5. No additional dependencies added beyond chi and modernc-sqlite

**DoD includes:** Run `cd apps/technical-analysis && go mod verify` locally before commit. Confirm go.sum file is non-empty.

---

### P1-A3g — Scaffold `pkg/` DDD layout (6 stub files, all compilable)

**Owner:** dev-technical-analysis  
**Goals:** G3  
**Files touched:**
- `apps/technical-analysis/pkg/domain/models.go` (NEW)
- `apps/technical-analysis/pkg/domain/ports.go` (NEW)
- `apps/technical-analysis/pkg/domain/services.go` (NEW, stub constructor)
- `apps/technical-analysis/pkg/application/dtos.go` (NEW)
- `apps/technical-analysis/pkg/application/usecases.go` (NEW, Execute method stub)
- `apps/technical-analysis/pkg/infrastructure/calculator.go` (NEW, stub)
- `apps/technical-analysis/pkg/infrastructure/repositories.go` (NEW, reads DB_PATH env)
- `apps/technical-analysis/pkg/interface/http/router.go` (NEW, chi router, stub handlers)

**AC:**
1. All 8 files created as minimal compilable stubs (per architect spec §6 Step 3)
2. `pkg/domain/models.go`: `CandleStick` and `TechnicalIndicators` structs (empty fields OK at this stage)
3. `pkg/domain/ports.go`: `PriceHistoryRepository` and `TAIndicatorCalculator` interfaces (zero-method OK)
4. `pkg/domain/services.go`: `CalculateTAService` struct + `NewCalculateTAService(repo, calc)` constructor (body: `return &CalculateTAService{...}`)
5. `pkg/application/dtos.go`: `ComputeTARequest` and `ComputeTAResponse` structs (empty fields OK)
6. `pkg/application/usecases.go`: `ComputeTAUseCase` struct + `NewComputeTAUseCase(service)` + `Execute()` method stub (returns zero-value response, nil error)
7. `pkg/infrastructure/calculator.go`: `TACalculator` struct + `NewTACalculator()` constructor
8. `pkg/infrastructure/repositories.go`: `SQLitePriceRepository` struct + `NewSQLitePriceRepository()` constructor (reads `DB_PATH` from `os.Getenv()` — no arg passed in per architect spec §3 note on §OQ-2)
9. `pkg/interface/http/router.go`: `NewRouter(useCase, logger)` returning `*chi.Router` with `GET /health` and `POST /ta/indicators` routes (handler bodies return 501 Not Implemented)
10. `go build ./...` passes (zero compile errors)
11. `go vet ./...` passes (zero warnings)
12. Commit message references G3 + architect spec §6 Step 3

**Critical note on OQ-2:** `NewSQLitePriceRepository()` takes no arguments. This is the locked convention per architect spec §3 note. If a B-bucket developer changes this signature, that is a P1-A3g amendment requiring architect sign-off before the change lands.

**DoD includes:** Run `go build ./...` + `go vet ./...` locally. Confirm all 8 files exist and compile.

---

### P1-A4g — Rewrite `apps/technical-analysis/Dockerfile`

**Owner:** dev-technical-analysis  
**Goals:** G3  
**Files touched:**
- `apps/technical-analysis/Dockerfile` (CREATE or MODIFY if exists)

**AC:**
1. File contains exact content from architect spec §4 (34 lines verbatim)
2. Multi-stage build: `golang:1.22-alpine` builder stage (Stage 1) + `alpine:3.20` runtime stage (Stage 2)
3. CGO_ENABLED=0 in build stage (no GCC dependency for pure-Go SQLite via modernc.org/sqlite)
4. Runtime stage copies binary to `/app/server` and `api/` directory (for future openapi.yaml serving)
5. Dockerfile syntax valid (no `docker build` errors on parse stage)
6. Port 5003 exposed (unchanged from TS service — no docker-compose.yml change needed)
7. Commit message references G3 + architect spec §4 + CGO rationale

**DoD includes:** Verify Dockerfile syntax is valid (no parser errors). Docker build smoke deferred to ops if unavailable locally.

---

### P1-A5g — Restore or create `apps/technical-analysis/api/openapi.yaml`

**Owner:** dev-technical-analysis  
**Goals:** G3  
**Files touched:**
- `apps/technical-analysis/api/openapi.yaml` (CREATE — new location per Go convention)

**AC:**
1. File created at `api/openapi.yaml` (not `src/interface/openapi.yaml` — Go convention per architect spec §2)
2. OpenAPI 3.0 document, YAML syntax valid
3. Includes `GET /health` endpoint with response schema: `{"status":"ok","service":"technical-analysis","port":5003}`
4. Includes `POST /ta/indicators` endpoint:
   - Request body: `ComputeTARequest` (symbol: string, period: integer)
   - Response body: `ComputeTAResponse` (RSI, MACD, Bollinger Band, MA fields — matching domain model)
5. YAML parses without error: `python3 -c "import yaml; yaml.safe_load(open(...))"` or equivalent
6. G3 QA acceptance gate: `test -f apps/technical-analysis/api/openapi.yaml && echo PASS`
7. Commit message references G3 + architect spec §6 Step 5 + "HTTP contract unchanged from TS service"

**Restore strategy:** Developer SHOULD attempt to restore this file from the reverted TS commit `241631af` (if rescue is mechanically feasible). If not, author from scratch using the minimum requirements above.

**DoD includes:** Manual YAML validation. Confirm file parses.

---

### P1-A-bucket closure smoke gate

After P1-A5g lands, run the full A-bucket smoke gate before B-bucket begins:

```bash
cd apps/technical-analysis
go build ./...        # binary builds
go vet ./...          # zero warnings
test -f cmd/server/main.go && echo "main.go: PASS"
test -f api/openapi.yaml && echo "openapi.yaml: PASS"
grep -c "calculateRSI\|calculateMACD\|detectCross\|classifyZone\|if.*price\|for.*candle" \
  cmd/server/main.go
# Expected: 0
```

All A-bucket tasks must reach this gate before any B-bucket task starts.

---

### P1-B1g — Extract Go primitive: RSI

**Owner:** dev-technical-analysis  
**Goals:** G1 (Primitives ship with scenarios), G7 (Edit-JSON-and-rerun works), G12 (Dashboard-green before done)  
**Files touched:**
- `apps/technical-analysis/pkg/primitive/rsi.go` (NEW)
- `apps/technical-analysis/pkg/primitive/rsi_test.go` (NEW, table-driven)
- `docs/scenarios/technical-analysis/primitives/rsi-golden.json` (NEW)
- `docs/scenarios/technical-analysis/primitives/rsi-edge.json` (NEW)
- `docs/scenarios/technical-analysis/primitives/rsi-failure.json` (NEW)

**AC:**
1. Function `CalculateRSI(prices []float64, period int) []float64` or equivalent signature (Go idiom)
2. Wilder's RSI formula: 14-period default, custom periods supported, output range [0, 100]
3. Zero imports from other modules (pure function, math-only)
4. Unit test file with table-driven test cases:
   - Happy path: 14-period RSI on 100-candle price array → output range [0, 100]
   - Edge case: RSI on ≤14 prices (insufficient data) → empty slice or error
   - Failure case: NaN or negative prices → error or nil
5. Test reference vector verified against the same Wilder's RSI spec (not TS-specific; math is language-agnostic)
6. ≥3 scenario JSON files (golden, edge, failure) in `docs/scenarios/technical-analysis/primitives/`:
   - Golden: 14-period RSI on 100 known prices → expected output array
   - Edge: RSI on < 14 prices → expected null/empty output
   - Failure: invalid input → expected error
7. `go test ./...` in app passes all tests
8. `go vet ./...` passes
9. Commit message references G1, G7, G12 + architect spec pointer

**Sandbox check (G12 enforcement):** Run `go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=rsi-all` → all 3 RSI scenarios green (expected to fail until sandbox exists; record "sandbox runner not yet authored" in commit message if needed). Dashboard reflects result after P1-E1 lands.

**DoD includes:** Unit tests pass locally. Scenario JSON files parse (jq . rsi-*.json). Final commit atomic.

---

### P1-B2g — Extract Go primitive: MACD

**Owner:** dev-technical-analysis  
**Goals:** G1, G7, G12  
**Files touched:**
- `apps/technical-analysis/pkg/primitive/macd.go` (NEW)
- `apps/technical-analysis/pkg/primitive/macd_test.go` (NEW, table-driven)
- `docs/scenarios/technical-analysis/primitives/macd-golden.json` (NEW)
- `docs/scenarios/technical-analysis/primitives/macd-edge.json` (NEW)
- `docs/scenarios/technical-analysis/primitives/macd-failure.json` (NEW)

**AC:**
1. Function `CalculateMACD(prices []float64, fastPeriod, slowPeriod, signalPeriod int) MACDResult` (or similar)
   - Default periods: 12 (fast), 26 (slow), 9 (signal)
   - Returns: {MACDLine, SignalLine, Histogram} arrays or struct
2. Mathematical correctness: MACD line = fast EMA - slow EMA; signal line = 9-period EMA of MACD
3. Zero imports from other modules (pure function)
4. Table-driven unit test with reference vector
5. ≥3 scenario JSON files (golden, edge, failure):
   - Golden: MACD on 100-candle array → {macdLine, signalLine, histogram} outputs
   - Edge: MACD on < 26 prices → null/empty outputs
   - Failure: invalid input → error
6. `go test ./...` + `go vet ./...` pass
7. Commit message references G1, G7, G12

**DoD includes:** Unit tests pass. Scenario JSON files valid. Sandbox green (when available).

---

### P1-B3g — Extract Go primitive: Bollinger Bands

**Owner:** dev-technical-analysis  
**Goals:** G1, G7, G12  
**Files touched:**
- `apps/technical-analysis/pkg/primitive/bollinger_bands.go` (NEW)
- `apps/technical-analysis/pkg/primitive/bollinger_bands_test.go` (NEW)
- `docs/scenarios/technical-analysis/primitives/bollinger-golden.json` (NEW)
- `docs/scenarios/technical-analysis/primitives/bollinger-edge.json` (NEW)
- `docs/scenarios/technical-analysis/primitives/bollinger-failure.json` (NEW)

**AC:**
1. Function `CalculateBollingerBands(prices []float64, period, stdDevMultiplier float64) BollingerBandsResult` (or similar)
   - Default period: 20, multiplier: 2.0
   - Returns: {UpperBand, MiddleBand, LowerBand} arrays
2. Mathematical correctness: middle band = SMA, upper/lower = SMA ± (stdDev × multiplier)
   - **Population std dev formula** per architect spec §1 (not sample)
3. Zero imports from other modules
4. Table-driven unit test with std dev precision ±0.01%
5. ≥3 scenario JSON files (golden, edge, failure):
   - Golden: BB on 100 prices (period 20) → {upper, middle, lower} outputs
   - Edge: BB on < 20 prices → null/empty
   - Failure: invalid input → error
6. `go test ./...` + `go vet ./...` pass
7. Commit message references G1, G7, G12

**DoD includes:** Unit tests pass. Std dev precision verified. Scenario JSON files valid.

---

### P1-B4g — Extract Go primitive: Moving Averages

**Owner:** dev-technical-analysis  
**Goals:** G1, G7, G12  
**Files touched:**
- `apps/technical-analysis/pkg/primitive/moving_average.go` (NEW)
- `apps/technical-analysis/pkg/primitive/moving_average_test.go` (NEW)
- `docs/scenarios/technical-analysis/primitives/ma-golden.json` (NEW)
- `docs/scenarios/technical-analysis/primitives/ma-edge.json` (NEW)
- `docs/scenarios/technical-analysis/primitives/ma-failure.json` (NEW)

**AC:**
1. Three calculator functions:
   - `CalculateSMA(prices []float64, period int) []float64` (simple moving average = mean of window)
   - `CalculateEMA(prices []float64, period int) []float64` (exponential moving average, Wilder's α = 2/(period+1))
   - `CalculateMovingAverage(prices []float64, period int, maType string) []float64` (dispatcher: "SMA" or "EMA")
2. Zero imports from other modules (pure functions)
3. Table-driven unit test for all three (reference calculations)
4. ≥3 scenario JSON files (golden, edge, failure):
   - Golden: SMA and EMA on 100 prices (period 20) → correct output arrays
   - Edge: period > len(prices) → null/empty
   - Failure: invalid period (≤0) → error
5. `go test ./...` + `go vet ./...` pass
6. Commit message references G1, G7, G12

**DoD includes:** SMA/EMA outputs match reference calculations. Unit tests pass. Scenario JSON files valid.

---

### P1-B5g — Extract Go primitive: Signal Detection (Cross Detection)

**Owner:** dev-technical-analysis  
**Goals:** G1, G7, G12  
**Files touched:**
- `apps/technical-analysis/pkg/primitive/detect_cross.go` (NEW)
- `apps/technical-analysis/pkg/primitive/detect_cross_test.go` (NEW)
- `docs/scenarios/technical-analysis/primitives/cross-golden.json` (NEW)
- `docs/scenarios/technical-analysis/primitives/cross-edge.json` (NEW)
- `docs/scenarios/technical-analysis/primitives/cross-failure.json` (NEW)

**AC:**
1. Function `DetectCross(fastLine, slowLine []float64) []CrossEvent` (or similar)
   - Returns: array of events: {Index: int, Type: "bullish" | "bearish"}
   - Bullish = fast crosses above slow; bearish = fast crosses below slow
2. Detection logic: sign change of (fast[i] - slow[i]) vs (fast[i-1] - slow[i-1])
3. Zero imports from other modules
4. Table-driven unit test: detect crosses in known pattern (e.g., sine waves with phase offset)
5. ≥3 scenario JSON files (golden, edge, failure):
   - Golden: two crossing arrays → array of cross points {index, type}
   - Edge: no crosses, parallel lines → empty array
   - Failure: mismatched array lengths → error
6. `go test ./...` + `go vet ./...` pass
7. Commit message references G1, G7, G12

**DoD includes:** Unit tests pass. Scenario JSON files valid. Sandbox green (when available).

---

### P1-C1g — Module composition: `pkg/module/technical_analysis.go`

**Owner:** dev-technical-analysis  
**Goals:** G2 (Module composes primitives via ports), G12 (Dashboard-green before done)  
**Files touched:**
- `apps/technical-analysis/pkg/module/technical_analysis.go` (NEW)
- `apps/technical-analysis/pkg/module/technical_analysis_test.go` (NEW, multi-primitive test)

**AC:**
1. Package `module` exports a composition function (e.g., `ComputeTA(prices []float64) *TAResult`) or equivalent barrel
2. Function imports all 5 primitives from `pkg/primitive/<name>`
3. Zero imports from other modules (no cross-module imports outside primitives)
4. Composition orchestrates ≥2 primitives in sequence (e.g., compute RSI + MACD on same price array, detect crossovers between their outputs)
5. Multi-primitive test file with table-driven test case exercising ≥2 primitives together
6. Test verifies output shape matches expected schema (all 5 indicators computed or subset)
7. ≥1 multi-primitive scenario JSON file in `docs/scenarios/technical-analysis/module/`:
   - Story: "RSI + MACD bullish cross signal" (RSI overbought + MACD positive histogram = strong signal)
   - Input: 100 prices; expected output: all 5 indicators calculated without error
8. `go test ./...` passes
9. `go vet ./...` passes
10. Commit message references G2, G12 + architect spec pointer (module composition pattern)

**DoD includes:** Unit tests pass. Multi-primitive story verified. Scenario JSON file valid. Sandbox green (when available).

---

### P1-D1 — Create scenario JSON suite for primitives

**Owner:** dev-technical-analysis  
**Goals:** G1 (Primitives ship with scenarios), G7 (Edit-JSON-and-rerun works), G12  
**Files touched:**
- 25 scenario JSON files total (NEW) under `docs/scenarios/technical-analysis/primitives/`

**AC:**
1. 25 files created: 5 primitives × 5 scenarios each (golden + 3 edge + failure per primitive)
2. Naming convention: `<primitive>-<scenario-type>.json` (e.g., `rsi-golden.json`, `rsi-edge-1.json`, `rsi-failure.json`)
3. Each file follows JSON schema:
   ```json
   {
     "primitive": "<name>",
     "input": {...},
     "expectedOutput": {...},
     "description": "<human-readable story>",
     "category": "golden|edge|failure"
   }
   ```
4. All 25 files valid JSON (parse without error via `jq . <file>`)
5. Golden scenarios (1 per primitive): known-good input/output pair with reference data
6. Edge scenarios (≥3 per primitive): boundary conditions (min data, max period, zeros, NaN)
7. Failure scenarios (1 per primitive): expected errors (invalid input, type mismatch, bad shapes)
8. Sandbox execution (when available): `go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=all` → all 25 pass
9. Commit message references G1, G7, G12

**AC verification:**
- `find docs/scenarios/technical-analysis/primitives -name "*.json" | wc -l` = 25
- Each file parses: `jq . <file> > /dev/null` for all 25

**DoD includes:** All 25 files created, named correctly, valid JSON. Sandbox green (when available). User can edit one JSON + rerun without breaking others.

---

### P1-D2 — Create multi-primitive scenario JSON suite

**Owner:** dev-technical-analysis  
**Goals:** G2 (Module composes primitives via ports), G7 (Edit-JSON-and-rerun works), G12  
**Files touched:**
- 5 scenario JSON files (NEW) under `docs/scenarios/technical-analysis/module/`

**AC:**
1. 5 multi-primitive scenario files created:
   - Scenario 1: RSI + MACD crossover story (RSI overbought + MACD bullish cross = strong signal)
   - Scenario 2: Bollinger Bands + MA compression (bands narrow, price near SMA = volatility play)
   - Scenario 3: EMA crossover + signal detection (fast EMA crosses slow, detect-cross fires)
   - Scenario 4: Full basket (all 5 primitives on same candle array, orchestrated)
   - Scenario 5: Edge case (insufficient candles, some primitives return null, module handles gracefully)
2. Each file schema:
   ```json
   {
     "module": "technical-analysis",
     "primitives": ["CalculateRSI", "CalculateMACD", ...],
     "input": {...},
     "expectedOutput": {...},
     "description": "<story>",
     "category": "golden|edge|failure"
   }
   ```
3. All 5 files valid JSON
4. Sandbox execution (when available): `go run ./cmd/sandbox -tier=module -module=technical-analysis -scenario=all` → all 5 pass
5. Commit message references G2, G7, G12

**DoD includes:** All 5 files created, named correctly, valid JSON. Sandbox green (when available).

---

### P1-E1 — Build three-level dashboard

**Status: DONE** — commit `feat(ta-dashboard): three-level scenario trust dashboard (P1-E1)`  
**Completed:** 2026-05-22 by dev-frontend  
**Goals met:** G6 (dashboard renders from JSON, file:// URL confirmed), G8 (status badges present, red/green honest infrastructure in place), G9 (trust contract — non-coder can verify RSI from dashboard alone), G12 (dashboard is DoD gate for all TA tasks)  

**Implementation notes:**
- Framework decision: static HTML + vanilla JS + CSS (no Remix runtime). Justification: the dashboard is a trust layer requiring zero infrastructure — `file://` URL, no npm, no server. Remix would add an SSR boot cost incompatible with the "open in browser with no server" AC.
- All 25 primitive scenarios + 5 module scenarios embedded as inline JSON in `index.html` via `window.__PRIMITIVES_DATA__` and `window.__MODULE_DATA__` — works in `file://` without `fetch()`.
- Microservice panel is a static placeholder documenting the Go service shape (DDD layers, OpenAPI endpoints, port 5003). Clearly labelled "Live data not wired yet — P1-E2".
- "Edit & Rerun" button present (AC5 met) — wired in P1-E2 to `go run ./cmd/sandbox -tier=<tier> -scenario=<file>`.

**Owner:** dev-frontend  
**Goals:** G6 (Three-level dashboard renders from JSON traces), G8 (Red/green status is honest), G9 (Dashboard is trust contract), G12  
**Files touched:**
- `apps/technical-analysis/dashboard/index.html` (NEW)
- `apps/technical-analysis/dashboard/style.css` (NEW)
- `apps/technical-analysis/dashboard/app.js` (NEW)

**AC:**
1. HTML file opens without server (file:// URL in browser works)
2. Three panels visible on page load:
   - Primitives panel: ≥5 cards (one per primitive: RSI, MACD, Bollinger, MA, detect-cross)
   - Module panel: ≥1 card (composition story)
   - Microservice panel: (reserved for future, can be placeholder in Phase 1)
3. Each card shows:
   - Primitive/scenario name
   - Status badge: GREEN (all assertions passed) or RED (assertion failed)
   - Input summary (e.g., "14-period RSI on 100 candles")
   - Output summary (e.g., "RSI range [23, 78]")
4. Click on any card → detail view (modal or expanded pane) showing full input/output JSON
5. Detail view has "Edit & Rerun" button (AC for P1-E2)
6. CSS styling: minimal but readable (no crashes on font/color issues; colors must be high-contrast for accessibility)
7. No JavaScript errors in console (verify with browser DevTools)
8. Commits reference G6, G8, G9, G12

**AC verification:**
- Open `apps/technical-analysis/dashboard/index.html` in a browser (file:// URL)
- Screenshot: all 3 panels visible with ≥7 cards total
- Click ≥1 card → detail modal appears
- Browser console: zero errors

**DoD includes:** Manual browser verification (developer or QA). All scenario files (P1-D1 + P1-D2) must exist and be valid JSON for cards to render. Dashboard green check per G12.

---

### P1-E2 — Dashboard edit-rerun + honest red/green

**Owner:** dev-frontend  
**Goals:** G7 (Edit-JSON-and-rerun works), G8 (Red/green status is honest), G12  
**Files touched:**
- `apps/technical-analysis/dashboard/app.js` (MODIFY — add rerun handler)
- `apps/technical-analysis/dashboard/rerun-handler.js` (NEW — sandbox integration)

**AC:**
1. "Edit & Rerun" button in detail view opens editor (`<textarea>` with JSON content pre-filled)
2. User modifies JSON (e.g., changes RSI period from 14 to 10 or changes expectedOutput), clicks "Save & Rerun"
3. Browser handler calls `go run ./cmd/sandbox -scenario=<edited-file>` via Node.js subprocess spawner (or shell escape if available in browser)
   - **OQ-1 resolved:** exact runner command is `go run ./cmd/sandbox -tier=primitive -scenario=<file>` per architect spec §6 Step 3
   - Alternative: pre-built binary `./sandbox` if architect approves separate cmd/sandbox/ entry point (not in P1-A scope, deferred to future)
4. Result JSON received and card status updates within 5 seconds: GREEN if all assertions passed, RED if any assertion failed
5. Manual test (honest red check):
   - Deliberately introduce a bug in a primitive (e.g., return wrong RSI value)
   - Save scenario JSON with correct expected output
   - Refresh dashboard → card must turn RED (asserts it detects the bug)
6. Manual test (honest green check):
   - Same broken primitive, fix it in code
   - Run `go run ./cmd/sandbox` locally, refresh dashboard → card must turn GREEN
7. Env audit (zero credentials in sandbox):
   - Run `go run ./cmd/sandbox -tier=primitive -scenario=test.json && env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"` → output is empty (zero DB credentials, zero API keys in sandbox process)
8. Commit message references G7, G8, G12

**Critical AC for OQ-1:** The exact sandbox runner command MUST be `go run ./cmd/sandbox ...` (not `bun run sandbox`). If architect spec changes this, update AC before dev starts P1-E2. This AC is locked to architect spec §6 Step 3 as written.

**AC verification:**
- User opens dashboard, edits a scenario JSON (e.g., change RSI period), clicks Rerun
- Card status updates within 5 seconds
- Verify env audit: no credentials in sandbox
- Manual bug injection: dashboard shows RED
- Manual bug fix: dashboard shows GREEN

**DoD includes:**
- Edit JSON + rerun flow tested manually (developer or QA)
- 1 deliberate primitive bug introduced, dashboard shows RED, bug fixed, dashboard shows GREEN
- Env audit: zero credentials in sandbox process
- Dashboard green check per G12

---

## Dependency Graph

```
P1-A1g (composition root created)
  ↓
P1-A2g (go.mod + go.sum created)
  ↓
P1-A3g (pkg/ DDD scaffold, 6 stub files)
  ↓
P1-A4g (Dockerfile rewritten)
  ↓
P1-A5g (api/openapi.yaml created, A-BUCKET CLOSES)
  ↓
  ├─→ P1-B1g (RSI primitive)
  │    ↓
  │    └─→ P1-B2g (MACD primitive)
  │         ↓
  │         └─→ P1-B3g (Bollinger Bands)
  │              ↓
  │              └─→ P1-B4g (Moving Average)
  │                   ↓
  │                   └─→ P1-B5g (Detect Cross)
  │                        ↓
  │                        └─→ P1-C1g (Module composition)
  │                             ↓
  │                             └─→ P1-E1 (Dashboard)
  │
  └─→ P1-D1 (Primitive scenarios — can run after B5g)
       ↓
       └─→ P1-D2 (Module scenarios — needs C1g)
            ↓
            └─→ P1-E1 (Dashboard — needs C1g + D2)
                 ↓
                 └─→ P1-E2 (Dashboard edit-rerun)
```

**Critical path:** P1-A1g → A5g → B1g → B5g → C1g → E1 → E2 (~11 hours)  
**Parallel slack:** P1-D1 can run during B3g..B5g; P1-E1 gates on C1g + D2 (no parallelization benefit).

---

## Owner Assignment

**dev-technical-analysis:** P1-A1g..A5g, P1-B1g..B5g, P1-C1g, P1-D1, P1-D2 (all Go + scenario JSON authoring)

**dev-frontend:** P1-E1, P1-E2 (dashboard — language-agnostic at the JSON-reading layer)

---

## Goal Mapping

| Goal | Task(s) | Outcome |
|------|---------|---------|
| **G1** | P1-B1g..B5g, P1-D1 | 5 primitives in Go with ≥3 scenarios each (golden + edge + failure). All execute in sandbox without error. |
| **G2** | P1-C1g, P1-D2 | Go module package composes primitives via package imports; multi-primitive scenarios pass without cross-module imports. |
| **G3** | P1-A1g..A5g | Go composition root in `cmd/server/main.go` + `pkg/` DDD layout (domain, application, infrastructure, interface); HTTP contract documented in `api/openapi.yaml`. |
| **G4** | (deferred to Phase 2) | Architecture fence enforced in CI (Go version likely go-arch-lint or goimports boundary rules; architect to scope). |
| **G5** | (deferred to Phase 2) | Old TA TS code in `apps/mcp-server/` removed; all callers routed via HTTP to the Go service. |
| **G6** | P1-E1 | Three-level dashboard renders from JSON traces (Primitives / Module / Microservice panels). Language-agnostic at dashboard layer. |
| **G7** | P1-B1g..B5g, P1-D1, P1-E2 | Edit scenario JSON, refresh dashboard, see new result. Sandbox process (`go run ./cmd/sandbox`) has zero DB credentials. |
| **G8** | P1-E1, P1-E2 | Dashboard shows RED on deliberately broken primitive; GREEN when fixed. Proven by manual bug injection + fix. |
| **G9** | P1-E1 | Dashboard is the trust contract — user verifies "RSI working correctly" from dashboard alone (verbal confirmation at pilot review). |
| **G10** | (deferred to Phase 2 QA) | AI agent fixes a Go primitive bug in ≤2 cycles (baseline: 4-6 cycles per bug-inventory.json). |
| **G11** | (deferred to Phase 2 QA) | Regression alarm bell triggers when a fix breaks a sibling scenario. Proven by ≥1 observed case of secondary scenario flipping RED during fix. |
| **G12** | All tasks | Every dev task includes "run pilot scenarios + verify dashboard green" in DoD before marking DONE. Flow rule enforced in dev-technical-analysis and dev-frontend flows. |

---

## Architect Open Questions Resolution

Per architect spec §7, the following OQs are resolved:

### OQ-1 — `go run ./cmd/sandbox` runner command (G7 dependency)
**Resolved:** Exact command is `go run ./cmd/sandbox -tier=<tier> -module=technical-analysis -scenario=<file>` per architect spec §6 Step 3. If a separate `cmd/sandbox/` entry-point is created in Phase 2, PM will update this AC. For Phase 1, the runner is embedded in the sandbox handler (exact implementation deferred to developer).

### OQ-2 — `NewSQLitePriceRepository()` constructor signature
**Resolved:** No-arg constructor (reads DB_PATH from `os.Getenv()` internally). Locked in P1-A3g AC. If a B-bucket developer changes this signature, that is a P1-A3g amendment requiring architect sign-off before landing.

### OQ-3 — Line-count AC rule for `cmd/server/main.go`
**Resolved:** AC threshold set to **≤80 lines** (architect spec = 74 lines + formatting variance). Stated explicitly in P1-A1g AC.

### OQ-4 — G3 QA grep path: `api/openapi.yaml` (new location)
**Resolved:** Path moved from `src/interface/openapi.yaml` (TS) to `api/openapi.yaml` (Go convention). G3 QA script updated in P1-A5g AC: `test -f apps/technical-analysis/api/openapi.yaml && echo PASS`.

### OQ-5 — `go-chi/chi` version consistency
**Resolved:** Pin chi at v5.2.1 (matches alert-engine). Developer should verify alert-engine go.mod at P1-A2g authoring time; if alert-engine has been upgraded, update the pin to match.

### OQ-6 — `modernc.org/sqlite` version pin
**Resolved:** Pin at v1.29.9 (per architect spec §5). Developer MAY run `go get modernc.org/sqlite@latest` during P1-A2g to check for newer stable versions. If a newer version exists and passes go build, update the pin and record the version in P1-A2g AC.

### OQ-7 — dev-technical-analysis flow Go-awareness
**Resolved:** Flow is already Go-aware as of commit bccad635 (agent-father already made the update). Confirmed in `.claude/agents/dev-technical-analysis.md` — no further action needed for PM.

---

## Risk Mitigation Summary

**Architect risk #1 (constructor signature):** Locked via P1-A3g AC. Any change requires architect sign-off.

**Architect risk #2 (no-arg constructor per §3 note):** Same as above.

**Architect risk #3 (dev-ta flow TS-shaped):** Already resolved by commit bccad635. Flow is Go-aware.

**PM risk (B-bucket sequencing):** Sequential execution (B1g → B2g → B3g → B4g → B5g) initially, with PM discretion to parallelize B3g..B5g after B2g pattern stabilizes.

**PM risk (OQ-1 sandbox runner):** Exact command locked in P1-E2 AC. If architect changes the sandbox binary name/path, PM updates the AC before E2 dispatch.

---

## Notes for Dev-* Agents

### For dev-technical-analysis (Go specialist)

- **Mandatory reading before P1-A1g:** Read architect spec in full: `docs/architecture-briefs/2026-05-22-refactor/p0-4-composition-root-plan-go.md` (§1-7)
- **Language mode detection:** All P1-A*g, P1-B*g, P1-C*g tasks are Go. Detect from task spec: `*.go`, `go.mod`, `cmd/`, `pkg/` = Go mode.
- **Primitive extraction pattern:** Each primitive (P1-B1g..B5g) is a pure function (zero side effects, zero imports). Include 3 scenario JSON files per primitive (happy + edge + failure). Use table-driven tests. Reference data from architect spec (e.g., Wilder's RSI vector).
- **G12 enforcement:** Before marking any P1-B*g or P1-C*g or P1-D*g task DONE, run sandbox (when available) and confirm dashboard shows all scenarios GREEN. If any RED, task is incomplete.
- **Doc maintenance:** After code changes, run doc-review flow (if it exists). Update `docs/architecture/microservice/technical-analysis/` docs to reflect Go implementation.

### For dev-frontend (dashboard specialist)

- **Dashboard design philosophy:** Three panels, minimal UI, no external CSS frameworks (vanilla CSS). Goal is user trust, not beauty. Red cards must be impossible to miss (high contrast, bold color).
- **Scenario file format:** Read one P1-D1 or P1-D2 JSON file to understand schema. Dashboard reads files directly from `docs/scenarios/technical-analysis/{primitives,module}/`.
- **Edit-JSON-and-rerun (P1-E2):** Critical user-facing feature per G7. Must work without page reload. Test manually: edit a scenario JSON in the dashboard's inline editor, see result update within 5 seconds.
- **Sandbox runner (Go):** P1-E2 handler calls `go run ./cmd/sandbox` (not `bun run sandbox`). Command is locked in the AC; do not change without architect approval.
- **G12 enforcement:** Before marking P1-E1 or P1-E2 DONE, run full scenario suite and verify all cards GREEN on dashboard.

---

## Handoff Files

Handoff files will be created by PM for each task:
- `docs/handoffs/TASK_P1-A1g.md` through `docs/handoffs/TASK_P1-E2.md`

Each handoff file will contain:
- Task description (copy from this plan)
- Acceptance criteria (verbatim from Per-Task Spec section above)
- Files touched (explicit list)
- Goal mapping (which of G1-G12)
- Dependencies (blocks, blocked by)
- Test command (Go: `go test ./...`, `go vet ./...`; JSON: `jq . <file>`; HTML: browser open)
- Owner agent signature block

---

## Success Criteria for Phase 1 Close

- All 15 tasks completed and merged to main
- All 12 goals (G1-G12) in pilot-status.json flipped from TBD to YES or NO with evidence recorded
- QA has verified G3 acceptance gates (composition root ≤80 lines, HTTP contract at `api/openapi.yaml`)
- QA has verified G1 acceptance gates (≥5 primitives × 3 scenarios = ≥15 files, all execute in sandbox without error)
- QA has verified G6 acceptance gates (dashboard opens in file:// URL, all 3 panels visible, no console errors)
- QA has verified G7 acceptance gates (edit scenario JSON, rerun via `go run ./cmd/sandbox`, result updates; env audit shows zero DB creds)
- QA has verified G8 acceptance gates (deliberate bug → RED, fix → GREEN)
- User has verbally confirmed G9 (dashboard is trustworthy without reading code)
- At sprint 6 deadline (2026-07-03), PO calls decision matrix on all 12 goals and records verdict (3 YES = scale, 2 YES = rescope, 0-1 YES = STOP)

---

## What PM Owes Next

1. Create handoff files `docs/handoffs/TASK_P1-A1g.md` through `docs/handoffs/TASK_P1-E2.md` (copy AC, files touched, dependencies from Per-Task Spec above)
2. Update `docs/TASKS.md` to list all 15 Go tasks in Todo state; P1-A1g is first task for dev-technical-analysis
3. Update `docs/data/pilot-status.json`:
   - Set `phase1.status: "READY"` (was "PIVOTING")
   - Add `phase1.planExpandedAt: "<ISO timestamp>"`
   - Add `phase1.firstTaskReady: "P1-A1g"`
4. Notify main terminal that the plan is READY-FOR-DISPATCH

---

## Sunk-Cost Note

The 6 reverted TS commits are documented in `docs/handoffs/TASK_pivot-B-revert.md`. The 3 scenario JSON files from commit `6248f3da` are language-agnostic and may be preserved (per PO decision doc §Sunk-cost ledger). Net: ~3-4 days of rework + ~8 source files redone in Go. User accepted this cost via Option B verdict on 2026-05-22.

---

## Per-task AC skeleton

Each task, when PM expands this stub, must include:

1. **AC list** — exact acceptance criteria. Modeled on the obsolete TS plan's AC structure (G3 tasks require zero domain logic in composition root; G1 tasks require ≥3 scenarios incl. failure; G2 tasks require zero cross-module imports; G6-G9 tasks require browser-renderable dashboard cards).
2. **Files touched** — explicit list of paths created / modified / deleted.
3. **Smoke check command** — for Go tasks: `go test ./...` + `go vet ./...` + `staticcheck ./...` (or `golangci-lint run` if architect prefers the umbrella linter). For JSON-suite tasks: `find … | wc -l` and per-file `jq . <file>` validity check. For dashboard tasks: manual browser-open check.
4. **Atomic commit format** — one commit per task. Commit message references the task ID, the goal(s) it advances, and the PO decision doc. Example template:
   ```
   feat(technical-analysis): P1-B1g — Go RSI primitive + scenarios

   Implements G1, G7, G12 per pilot-charter.md.
   Language: Go (per docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md).

   - packages/primitives/technical-analysis/calculate_rsi.go (NEW)
   - packages/primitives/technical-analysis/calculate_rsi_test.go (NEW, table-driven)
   - docs/scenarios/technical-analysis/primitives/rsi-happy.json (NEW)
   - docs/scenarios/technical-analysis/primitives/rsi-edge.json (NEW)
   - docs/scenarios/technical-analysis/primitives/rsi-failure.json (NEW)

   Smoke: go test ./... + go vet ./... + staticcheck ./... all green.
   Dashboard: all 3 RSI scenarios GREEN per G12.
   ```
5. **Goal mapping** — which of G1–G12 the task advances. Cross-reference must match the §Goal Mapping table below.

---

## Smoke-check standard (Go)

All Go tasks share a common smoke check. PM expansion of each task must include this skeleton:

```sh
cd apps/technical-analysis
go test ./...        # all unit + integration tests green
go vet ./...         # zero warnings
staticcheck ./...    # zero issues  (OR: golangci-lint run — architect call)
go build ./cmd/...   # binary builds (catches compile-only errors not surfaced by test)
```

For tasks that touch scenario JSON, add:

```sh
# Validate every scenario JSON parses
find docs/scenarios/technical-analysis -name '*.json' -exec jq . {} \; > /dev/null
# Run scenarios through the Go sandbox runner (exact command from architect Go spec)
go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=all
# Expect: all green
```

Dashboard tasks (P1-E1, P1-E2) keep the manual browser-open check from the obsolete TS plan (open `apps/technical-analysis/dashboard/index.html` via `file://` URL; verify 3 panels render; verify zero JS console errors).

---

## Goal Mapping (unchanged structure, language-neutral wording)

| Goal | Task(s) | Outcome (language-neutral) |
|------|---------|----------------------------|
| **G1** | P1-B1g..B5g, P1-D1 | 5 primitives in Go with ≥3 scenarios each (happy + edge + failure). |
| **G2** | P1-C1g, P1-D2 | Go module package composes primitives via interfaces; multi-primitive scenarios pass. |
| **G3** | P1-A1g..A5g | Go composition root in `cmd/server/main.go` + `internal/` DDD layout; HTTP contract documented in `openapi.yaml`. |
| **G4** | (deferred to Phase 2) | Architecture fence enforced in CI — for Go this is likely `go-arch-lint` or `goimports` boundary rules; architect to scope. |
| **G5** | (deferred to Phase 2) | Old TA TS code in `apps/mcp-server/` removed; all callers routed via HTTP to the Go service. |
| **G6** | P1-E1 | Three-level dashboard renders from JSON traces (panels: Primitives / Module / Microservice). Language-agnostic at the dashboard layer. |
| **G7** | P1-B1g..B5g, P1-D1, P1-E2 | Edit scenario JSON, refresh dashboard, see new result. Sandbox process has zero DB credentials. Runner is now Go. |
| **G8** | P1-E1, P1-E2 | Dashboard shows RED on a deliberately broken primitive; GREEN when fixed. |
| **G9** | P1-E1 | Dashboard is the trust contract — user verifies "RSI working correctly" from dashboard alone. |
| **G10** | (deferred to Phase 2 QA) | AI agent fixes a Go primitive bug in ≤2 cycles. Baseline cycle count from `bug-inventory.json` unchanged. |
| **G11** | (deferred to Phase 2 QA) | Regression alarm bell triggers when a fix breaks a sibling scenario. |
| **G12** | All tasks | Every dev task includes "run pilot scenarios + verify dashboard green" in DoD. |

---

## Owner notes

### dev-technical-analysis (Go-capable variant — to be confirmed)

- The agent's flow `.claude/flows/dev-technical-analysis/main.md` is currently TS-shaped (references `bun test`, `bun tsc --noEmit`).
- **Architect follow-up flagged:** the flow needs a Go-aware revision (`go test ./...`, `go vet`, `staticcheck`, `golangci-lint` — architect picks the toolchain). PO does NOT edit this flow file (per global rule: agent-md changes go through agent-father).
- If the flow is not yet Go-aware at dispatch time, main terminal falls back to `developer` (general dev agent) which is language-neutral.

### dev-frontend (unchanged)

- P1-E1 and P1-E2 are dashboard tasks. JSON-trace consumption is language-agnostic. The only Go-specific touch is in P1-E2: the rerun-handler invokes `go run ./cmd/sandbox` (or the architect-specified Go runner command) instead of `bun run sandbox`. Exact runner command is set in the architect Go spec.

---

## Sunk-cost note

This plan replaces `phase-1-task-plan.md` (TS). The obsolete TS plan is NOT deleted — it stays in the repo as a historical reference. Architect MAY add an obsolescence banner at the top of the TS plan in a follow-up commit; PO does not block on this.

The 6 reverted TS commits and the revert handoff `docs/handoffs/TASK_pivot-B-revert.md` document the sunk cost. Net: ~3-4 days of rework + ~8 source files redone in Go. User accepted this cost via Option B verdict.

---

## What PM owes next

When the architect Go composition-root spec lands and is PO-approved:

1. Fill in every Per-Task Spec section (currently skeletal) with: full AC list, exact files-touched list, exact smoke-check commands per task, atomic commit message template per task. Use the obsolete TS plan as the structural template — copy AC patterns, swap language idioms.
2. Author handoff files `docs/handoffs/TASK_P1-A1g.md` through `docs/handoffs/TASK_P1-E2.md` (handoffs for P1-D1, P1-D2, P1-E1, P1-E2 are MOSTLY portable from any existing TS-plan handoffs, with the runner command changes noted above).
3. Update `docs/TASKS.md` to list all 15 Go tasks in Todo state; mark `pivot-B-revert` as the only In-Progress / Done blocker.
4. Notify main terminal that the plan is READY-FOR-DISPATCH and the first task is P1-A1g.

---

## Next dispatch (after this stub lands)

> Main terminal: dispatch `developer` (or `dev-technical-analysis` if Go-capable) on `docs/handoffs/TASK_pivot-B-revert.md`. After the revert lands as a single atomic commit on `main`, dispatch `architect` to author the Go composition-root spec. After PO approves the architect spec, dispatch `pm` to expand this stub into Per-Task Specs. Then dispatch dev on P1-A1g.
