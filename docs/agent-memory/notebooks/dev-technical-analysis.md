# dev-technical-analysis — Notebook

Zone: `apps/technical-analysis/` | Stack: **Go** (pilot active, 2026-05-22) | DB: market.db (read-only)

## Working Memory

### 2026-05-23 — Dashboard TS Migration + Sandbox Fix (task #14)

**Task:** Migrate `dashboard/app.js` + `dashboard/rerun-handler.js` → TypeScript with esbuild build. Fix Bug 2 `resolveScenarioPath`. Sandbox re-run 30/30 green.

**Status:** DONE — commits 492061ba (TS migration refactor), 39dbf32b (sandbox fix)

**What was done:**
- Created `dashboard/app.ts` — full TS port of app.js. Types: ScenarioData, PrimitiveConfig, ScenarioStatus, ScenarioCategory. No `any`. Window globals declared for cross-file access pattern.
- Created `dashboard/rerun-handler.ts` — full TS port of rerun-handler.js. SandboxResult + RerunEditorPayload interfaces. Typed debounce. `import type` from app.ts (stripped at build time).
- Created `dashboard/build.sh` — esbuild compiles .ts → `dashboard/dist/*.js` (IIFE, ES2020, browser platform, zero runtime deps). Run: `./dashboard/build.sh`.
- Created `dashboard/tsconfig.dashboard.json` — browser-targeted config (lib: ES2020,DOM), strict, noEmit for type-check only. Zero tsc errors.
- Updated `index.html` script tags: `dist/app.js` + `dist/rerun-handler.js`.
- Added `esbuild@0.28.0` as devDependency; `build:dashboard` npm script.
- **Bug 1 (primitives 30→25):** NOT a bug in current state — `__PRIMITIVES_DATA__` already has exactly 25 primitive entries, no module entries accidentally appended. Audit confirmed clean.
- **Bug 2 (resolveScenarioPath doubles path):** Fixed in `cmd/sandbox/main.go` — added `filepath.IsAbs()` guard at top of function, returns absolute path as-is. Added 2 unit tests: TestResolveScenarioPath_AbsolutePath + TestResolveScenarioPath_RelativePath. 17/17 sandbox tests pass.
- **Sandbox re-run:** 30/30 GREEN (25 primitive + 5 module).
- **Bun test suite:** 24/24 pass, 0 fail.
- **Type-check:** `bun tsc --project dashboard/tsconfig.dashboard.json --noEmit` → 0 errors.

**Key decisions:**
- esbuild `--bundle=false` preserves loose IIFE (no module bundling needed; both files load independently as global-scope IIFEs communicating via window).
- Cross-file access (app.ts vars accessed by rerun-handler.ts): via window globals (renderPrimitivesPanel, openModal, currentScenario, showRerunPane). This is the correct pattern for non-bundled multi-file browser JS.
- Build output: `dashboard/dist/` — keep source .ts and compiled .js separate.

### 2026-05-22 — TASK_P1-E2 (Phase 1 Go — Sandbox runner + rerun-handler, Phase 1 COMPLETE)

**Task:** P1-E2 — Dashboard edit-rerun + honest red/green. Go sandbox binary + rerun-handler.js wired.

**Status:** DONE — commit f0958a97

**What was done:**
- Created `cmd/sandbox/main.go` — Go binary accepting `-tier=primitive|module` + `-scenario=<file>`. Dispatches to all 5 primitives and module. Emits JSON result block to stdout. Exits 0 (green) or 1 (red). `-audit` flag prints audited_env_keys + forbidden_matches for ENV AUDIT GATE.
- Created `cmd/sandbox/sandbox_test.go` — 11 unit tests: floatEq, diffFloat, diffLen, generateFromPattern (3 patterns), generateDeclineRally, safeIdx, RSI runner golden/RED/failure, BB golden, DetectCross golden, forbiddenEnvPrefixes.
- Created `dashboard/rerun-handler.js` — static paste-back bridge pattern: Edit & Rerun button opens editor textarea (pre-filled JSON), displays exact go run command, paste-back textarea flips card RED/GREEN within 5s of paste. Justification: no proxy/server needed (preserves G6 file:// constraint).
- Modified `dashboard/app.js` — rerun-btn click handler delegates to showRerunPane() (rerun-handler.js).
- Modified `dashboard/index.html` — added script tag for rerun-handler.js + id="modal-body" for DOM injection.

**ENV AUDIT GATE (verbatim):**
```
audited_env_keys: HOME,PATH
forbidden_matches:
```
PASS — empty forbidden_matches. Zero DB credentials.

**Test A (honest RED):** rsi-mid-range-CORRUPTED.json (rsi[0]=50.0) → status=red, diff="rsi[0]: got 66.666667, want 50.000000 (tol 0.001)"
**Test B (honest GREEN):** rsi-mid-range.json → status=green, diffs=null, runMs=0

**All 30 scenarios GREEN:** 25 primitive + 5 module before marking DONE (G12 enforced).
**go test ./...:** 7 packages ok, go vet clean, go build clean.

**Phase 1 COMPLETE.** completedTaskList=[P1-E1, P1-E2], phase1.status=COMPLETE, G7=YES, G8=YES.

**Scenario format lessons learned:**
- Multi-case success (cross-edge.json): detected via exp.Cases array presence; hasExpCases mode.
- Multi-case failure (cross-failure.json): detected via exp.Cases empty; error-expectation mode.
- MACD patterns: prices_pattern field (not closes_pattern); no closes_count; count inferred from outputLength.
- Module RSI_last_approx tolerance: approx field = use 2.0 RSI points (not 0.01) since closes generated from description not exact array.
- Empty maType in dispatcher: must NOT default to SMA; empty string routes to ErrUnknownMAType.

### 2026-05-22 — TASK_P1-D2 (Phase 1 Go — 5-file module scenario JSON suite, D-bucket CLOSED)

**Task:** Author 4 missing module scenario JSON files to reach 5 total in `docs/scenarios/technical-analysis/module/`.

**Status:** DONE — commit 457bbb3d

**What was done:**
- Existing: `multi-primitive-bullish-cross.json` (C1g, full basket / golden) — identified as Scenario 4 story ("all 5 primitives on same series").
- Created `rsi-macd-crossover.json` — Scenario 1: 50-price dip-and-rally; RSI rises from 0→89.33; MACD bullish; golden.
- Created `bb-ma-compression.json` — Scenario 2: 40 nearly-flat prices (step +0.01); BB bandwidth ≈ 0.23; SMA=EMA (zero spread); golden.
- Created `ema-crossover-detect-cross.json` — Scenario 3: 50 prices decline then rally; fast EMA(5) crosses slow EMA(20) at aligned index 3 (bullish); DetectCross fires; golden.
- Created `edge-insufficient-candles.json` — Scenario 5: 10 prices; all 5 primitives nil; module returns (Result{}, nil); non-fatal policy confirmed; edge.

**Schema:** Matched existing file schema exactly — `module`, `primitives[]`, `input.closes_length + description + params`, `expectedOutput` (property-based assertions), `description`, `category`. Added `spot_check` block (extension, continuity preserved).

**AC Verification:**
1. 5 files total in module/: PASS (`find ... | wc -l` = 5)
2. 5 mandated stories covered: PASS (RSI+MACD cross, BB+MA compression, EMA cross+detect, full basket [existing], edge)
3. All 5 valid JSON (jq sweep): PASS
4. ≥2 scenarios spot-checked against module.Compute: PASS (scenarios 1+2+3+5 all verified)
5. Existing multi-primitive-bullish-cross.json byte-identical: PASS (git diff = 0)
6. go test ./...: 100 PASS (no Go code touched)
7. Commit references G2, G7, G12: PASS

**Spot-check results:**
- Scenario 1 (rsi-macd): RSI[0]=0.0000, RSI[last]=89.3334, MACD len=17, last=4.1853 — within 1e-3 tolerance PASS
- Scenario 2 (bb-ma): BB[0] upper=100.2103, mid=100.0950, lower=99.9797, bandwidth=0.2307; SMA[0]=EMA[0]=100.0950 (spread=0) PASS
- Scenario 3 (ema cross): alignedFast[2]=85.0267 < slow[2]=85.0893; alignedFast[3]=87.3512 > slow[3]=85.7474 → bullish cross idx=3 PASS
- Scenario 5 (edge): all 9 fields nil, err=nil confirmed PASS

**Schema continuity report:**
- Matched existing schema verbatim: `module`, `primitives[]`, `input.{closes_length, description, params}`, `expectedOutput`, `description`, `category`.
- Plan spec shows `input.closes[]` (raw array) but existing file uses `closes_length` + `description`. Followed existing file (continuity). Drift flagged.
- Plan spec does not include `spot_check` block; added as extension for traceability. No existing fields modified.

**D-BUCKET STATUS: CLOSED.** P1-D1 (25-file primitives, c6af6839) + P1-D2 (5-file module, 457bbb3d) — both done.

**Next:** P1-E1 (three-level dashboard HTML/CSS/JS) — owner: dev-frontend. Unblocked by C1g + D2 per dependency graph.

---

### 2026-05-22 — TASK_P1-C1g (Phase 1 Go — Module composition, C-bucket CLOSED)

**Task:** Module composition — `pkg/module/technical_analysis.go` + test + calculator refactor.

**Status:** DONE — commit cdc911ab

**What was done:**
- Created `pkg/module/technical_analysis.go` (120L) — package `module`. Exports `ComputeParams` struct (RSIPeriod, MACDFast, MACDSlow, MACDSignal, BBPeriod, BBMultiplier, MAPeriod, MAType), `Result` struct (9 output fields + CrossSignals []dc.CrossEvent), and `Compute(closes []float64, p ComputeParams) (Result, error)`. Non-fatal policy: each primitive error leaves its fields nil. Cross signal pair decision (MACD line vs signal line) moved from calculator to module. Zero defaults func for param zero-value substitution.
- Created `pkg/module/technical_analysis_test.go` — 8 table-driven sub-tests + 1 RSI range test = 9 tests: happy path (100 prices all populated), BB nil + RSI populated (15 prices), all nil (5 prices), RSIPeriod invalid, BBMultiplier negative, unknown MAType, zero-params→defaults, cross signal pair verification.
- Refactored `pkg/infrastructure/calculator.go` (94L → 50L) — removed all 5 `pkg/primitive/*` imports. Now imports only `pkg/module` and `pkg/domain`. Delegates to `module.Compute`, maps `Result` → `domain.TechnicalIndicators`. Thin mapper pattern complete.
- Created `docs/scenarios/technical-analysis/module/multi-primitive-bullish-cross.json` — golden scenario: all 5 indicators on 100-price linear series.

**AC Verification:**
1. Package `module` exports Compute function: PASS
2. Imports all 5 primitives from pkg/primitive/<name>: PASS (via module layer)
3. Zero cross-module imports outside primitives: PASS
4. Composition orchestrates ≥2 primitives in sequence: PASS (5 primitives)
5. Multi-primitive test with ≥2 primitives together: PASS (9 sub-tests)
6. Test verifies output shape: PASS
7. ≥1 multi-primitive scenario JSON: PASS (multi-primitive-bullish-cross.json)
8. go test ./...: 100 PASS
9. go vet ./...: PASS
10. Commit references G2, G12: PASS

**Smoke gates:**
- `go test ./pkg/module/...`: 9 PASS, 0 FAIL
- `go test ./...`: 100 PASS (6 packages: module + 5 primitives)
- `go vet ./...`: exit 0 PASS
- `go build ./...`: exit 0 PASS
- `grep 'pkg/primitive' calculator.go`: 0 (PASS)
- JSON parse: 17 scenario files valid (jq . exit 0)

**B→C layering shift:**
- BEFORE: calculator owned non-fatal policy for all 5 primitives + cross-pair decision.
- AFTER: module owns all non-fatal policy + cross-pair decision. Calculator is a thin mapper only (50L).

**G12 status:** sandbox runner (cmd/sandbox) not yet authored. G12 deferred to P1-E2 per plan spec.

**C-BUCKET STATUS: CLOSED.** P1-C1g shipped.

**Next:** P1-D1 (25-file primitive scenario suite) or P1-D2 (5-file module scenario suite after C1g).

---

### 2026-05-22 — TASK_P1-B5g (Phase 1 Go — Detect Cross primitive, B-bucket CLOSED)

**Task:** Extract Go detect_cross primitive: `pkg/primitive/detect_cross/detect_cross.go` + table-driven test + 3 scenario JSONs + wire into calculator.

**Status:** DONE — commit cb0a16b8

**What was done:**
- Created `pkg/primitive/detect_cross/detect_cross.go` (69L) — `DetectCross(fastLine, slowLine []float64) ([]CrossEvent, error)`. CrossEvent{Index int, Direction string}. Bullish: prevDiff<=0 && currDiff>0; Bearish: prevDiff>=0 && currDiff<0. NaN + mismatch + len<2 validated. Zero imports outside stdlib.
- Created `pkg/primitive/detect_cross/detect_cross_test.go` (202L) — 15 table-driven cases: mismatch, empty, single-element, NaN-fast, NaN-slow, parallel-equal, parallel-above, parallel-below, single-bullish, single-bearish, multi-alternating (4 crosses), equal-then-bullish, equal-then-bearish, min-2-bullish, min-2-no-cross.
- Modified `pkg/domain/models.go` — added CrossSignal struct + CrossSignals []CrossSignal to TechnicalIndicators.
- Modified `pkg/infrastructure/calculator.go` — imports detect_cross as `dc`; after MACD, calls DetectCross(macdLine, signalLine) non-fatally (skipped if len<2); maps to domain.CrossSignal slice; populates CrossSignals field.
- Created `docs/scenarios/technical-analysis/primitives/cross-golden.json` — 2-cross canonical scenario (bullish@2, bearish@5).
- Created `docs/scenarios/technical-analysis/primitives/cross-edge.json` — 3 edge cases: parallel-no-cross, equal-then-bullish, min-2-element.
- Created `docs/scenarios/technical-analysis/primitives/cross-failure.json` — 3 failure cases: mismatch, empty, NaN.

**AC Verification:**
1. Signature `DetectCross(fastLine, slowLine []float64) ([]CrossEvent, error)`: PASS
2. Detection: sign-change of (fast[i]-slow[i]) vs prev: PASS
3. Zero imports from other modules: PASS (only errors + math)
4. 15 table-driven test cases: PASS
5. 3 scenario JSONs (golden + edge + failure): PASS — all parse via jq
6. `go test ./pkg/primitive/detect_cross/...`: 15/15 PASS
7. `go test ./...`: all 5 packages PASS
8. `go vet ./...`: 0 warnings PASS
9. `go build ./...`: PASS
10. Calculator wiring: MACD line vs signal line → CrossSignals in TechnicalIndicators: PASS

**Smoke gates:**
- `go test ./pkg/primitive/detect_cross/...`: 15 PASS, 0 FAIL
- `go test ./...`: ok (5 packages: bollinger_bands, detect_cross, macd, moving_average, rsi)
- `go vet ./...`: exit 0 PASS
- `go build ./...`: exit 0 PASS
- JSON parse: all scenario JSONs valid (jq . exit 0)

**G12 status:** sandbox runner (cmd/sandbox) not yet authored. G12 deferred to P1-E2 per plan spec.

**B-BUCKET STATUS: CLOSED.** B1g RSI + B2g MACD + B3g BB + B4g MA + B5g DetectCross — all 5 primitives committed.

**Next:** P1-C1g (module composition — `pkg/module/technical_analysis.go`) — NOW UNBLOCKED.

---

### 2026-05-22 — TASK_P1-B1g (Phase 1 Go — RSI primitive, Wilder smoothing)

**Task:** Extract Go RSI primitive: `pkg/primitive/rsi/rsi.go` + table-driven test + 4 scenario JSONs.

**Status:** DONE — commit 888ec325

**What was done:**
- Created `pkg/primitive/rsi/rsi.go` (72L) — pure Wilder RSI. Sentinel errors (ErrInvalidPeriod, ErrInsufficientData, ErrInvalidPrice). SMA seed + Wilder smoothing. Output range [0,100]. Zero imports outside stdlib.
- Created `pkg/primitive/rsi/rsi_test.go` (214L) — 11 table-driven test cases: period<2, period=0, insufficient data (len==period), empty slice, NaN price, negative price, all-gains→100, all-losses→0, min-valid (period+1 closes), 100-candle mixed Wilder smoothing, Investopedia reference vector (62.55 ±1).
- Modified `pkg/infrastructure/calculator.go` (26L) — wires rsi.Calculate; removes stub error. Returns TechnicalIndicators{RSI: rsiValues}.
- Created `docs/scenarios/technical-analysis/primitives/rsi-golden.json` — 20-candle reference series, 6 output values, tolerance ±1.
- Created `docs/scenarios/technical-analysis/primitives/rsi-oversold-bounce.json` — pure-loss seed → RSI=0, recovery.
- Created `docs/scenarios/technical-analysis/primitives/rsi-overbought-pullback.json` — pure-gain seed → RSI=100, pullback.
- Created `docs/scenarios/technical-analysis/primitives/rsi-insufficient-data.json` — 3 error cases.

**AC Verification:**
1. Signature `Calculate(closes []float64, period int) ([]float64, error)`: PASS
2. Wilder smoothing (not SMA throughout): PASS (SMA seed + Wilder smoothing loop)
3. Zero imports from other modules: PASS (only errors + math)
4. 11 table-driven test cases covering all AC scenarios: PASS
5. Reference vector verified: 62.55 ±1 for Investopedia 14-period data: PASS
6. 4 scenario JSON files (golden + oversold + overbought + failure): PASS
7. go test ./...: 11/11 PASS
8. go vet ./...: 0 warnings PASS
9. go build ./...: PASS

**Smoke gates:**
- `go test ./pkg/primitive/rsi/...`: 11 PASS, 0 FAIL
- `go test ./...`: ok (all packages)
- `go vet ./...`: exit 0 PASS
- `go build ./...`: exit 0 PASS
- JSON parse: 4 files valid (python3 json.load exit 0)

**G12 status:** sandbox runner (cmd/sandbox) not yet authored. G12 deferred to P1-E2 per plan spec.

**Wiring drift note:** calculator.go imports `pkg/primitive/rsi` directly (infrastructure layer). Not a DDD violation — primitive/ is pure math, not a domain package.

**Next:** P1-B2g (MACD primitive) — unblocked by this commit.

---

### 2026-05-22 — TASK_P1-A3g (Phase 1 Go — pkg/ DDD scaffold, compile milestone)

**Task:** Scaffold 8 compilable stub files under `apps/technical-analysis/pkg/` per architect spec §6 Step 3.

**Status:** DONE — commit 4e9c6a95

**What was done:**
- Created `pkg/domain/models.go` (28L) — CandleStick + TechnicalIndicators structs.
- Created `pkg/domain/ports.go` (15L) — PriceHistoryRepository + TAIndicatorCalculator interfaces.
- Created `pkg/domain/services.go` (20L) — CalculateTAService + NewCalculateTAService(repo, calc) constructor.
- Created `pkg/application/dtos.go` (23L) — ComputeTARequest + ComputeTAResponse DTOs.
- Created `pkg/application/usecases.go` (29L) — ComputeTAUseCase + NewComputeTAUseCase(service) + Execute() stub returns zero value.
- Created `pkg/infrastructure/calculator.go` (23L) — TACalculator + NewTACalculator() stub; Calculate returns errors.New("not implemented yet").
- Created `pkg/infrastructure/repositories.go` (32L) — SQLitePriceRepository + NewSQLitePriceRepository() NO-ARG (OQ-2 locked); reads DB_PATH from os.Getenv, default "./data/market.db".
- Created `pkg/interface/http/router.go` (40L) — NewRouter(useCase, logger) chi v5.2.1; GET /health returns 200 JSON; POST /ta/indicators returns 501.

**Compile milestone achieved:** `go build ./...` PASS for the first time (all packages compile clean).

**AC Verification:**
1. All 8 files created as minimal compilable stubs: PASS
2. models.go: CandleStick + TechnicalIndicators: PASS
3. ports.go: PriceHistoryRepository + TAIndicatorCalculator (with methods): PASS
4. services.go: CalculateTAService + NewCalculateTAService constructor: PASS
5. dtos.go: ComputeTARequest + ComputeTAResponse: PASS
6. usecases.go: ComputeTAUseCase + NewComputeTAUseCase + Execute stub: PASS
7. calculator.go: TACalculator + NewTACalculator: PASS
8. repositories.go: SQLitePriceRepository + NewSQLitePriceRepository() NO-ARG: PASS (OQ-2 locked)
9. router.go: NewRouter(useCase, logger) chi router with /health + /ta/indicators: PASS
10. go build ./...: PASS (COMPILE MILESTONE)
11. go vet ./...: PASS
12. go test ./...: [no test files] 0 failures
13. staticcheck: not installed — skipped

**G12 status:** sandbox runner not yet authored (expected at P1-A3g scaffold stage). G12 deferred to P1-B1g.
**graphify:** unavailable — skipped.

**Next:** P1-A4g (Dockerfile rewrite — multi-stage Go, CGO_ENABLED=0).

---

### 2026-05-22 — TASK_P1-A2g (Phase 1 Go — go.mod + go.sum)

**Task:** Create `apps/technical-analysis/go.mod` + `apps/technical-analysis/go.sum` per architect spec p0-4-composition-root-plan-go.md §5.

**Status:** DONE — commit f818ed60

**What was done:**
- Created `go.mod` with module path `github.com/vn-market-intelligence/technical-analysis`, go 1.22, toolchain go1.22.0, 2 direct deps: chi v5.2.1 + modernc.org/sqlite v1.29.9.
- Generated `go.sum` via `go mod tidy` (51 lines, 13 indirect transitive deps).
- `go mod verify`: all modules verified (exit 0).
- Approach: created minimal stub packages (domain/application/infrastructure/interface/http) with blank-identifier imports so `go mod tidy` could resolve transitive deps; removed stubs before commit (only go.mod + go.sum committed).
- go.mod tidy added 13 indirect deps (modernc.org/libc, modernc.org/gc/v3, modernc.org/mathutil, modernc.org/memory, modernc.org/strutil, modernc.org/token, golang.org/x/sys, github.com/dustin/go-humanize, github.com/google/uuid, github.com/hashicorp/golang-lru/v2, github.com/mattn/go-isatty, github.com/ncruces/go-strftime, github.com/remyoudompheng/bigfft).

**AC Verification:**
1. go.mod exact content per spec §5: PASS (module path, go 1.22, toolchain, chi v5.2.1, sqlite v1.29.9)
2. go mod verify: PASS (exit 0, all modules verified)
3. go.sum non-empty: PASS (51 lines)
4. Commit references G3 + spec §5 + dep rationale: PASS

**Smoke gates:**
- go mod tidy: exit 0 (PASS)
- go mod verify: exit 0, all modules verified (PASS)
- go build ./cmd/...: EXPECTED FAIL — "undefined: infrastructure.NewTACalculator" etc. (pkg/ not created yet — unblocks at P1-A3g)
- go vet ./cmd/...: EXPECTED FAIL — same reason

**G12 Exemption:** P1-A2g is module declaration only. No pilot scenarios exist yet. G12 does not apply.

**graphify:** unavailable in dev env — skipped per standing rule.

**Next:** P1-A3g (pkg/ DDD scaffold — 8 stub files) — now unblocked.

---

### 2026-05-22 — TASK_P1-A1g (Phase 1 Go — Create cmd/server/main.go)

**Task:** Create `apps/technical-analysis/cmd/server/main.go` per architect spec p0-4-composition-root-plan-go.md §3.

**Status:** DONE — commit cde0de45

**What was done:**
- Created `apps/technical-analysis/cmd/server/main.go` (79 lines, ≤80L AC satisfied).
- Wiring: NewTACalculator + NewSQLitePriceRepository → NewCalculateTAService → NewComputeTAUseCase → NewRouter → http.Server + graceful shutdown goroutine.
- Import alias: `httpinterface` for `pkg/interface/http` (avoids stdlib collision).
- Removed decorative section-separator comments from verbatim to satisfy ≤80L AC (spec miscounts 74L; verbatim §3 = 90L wc-l; 79L version is functionally identical).
- G3 QA grep check: returns 0 (no business logic).
- go build/vet: expected fail (no go.mod or pkg/ yet — pre-scaffold per §6 Step 1).
- staticcheck: not installed in dev env — skipped.

**AC Verification:**
1. File created: PASS
2. Zero business logic: PASS (grep = 0)
3. Line count ≤80: PASS (79 lines wc-l)
4. Import paths match spec §3: PASS (all 4 pkg/ paths present)
5. G3 QA grep = 0: PASS
6. pkg/ not yet created — go vet expected to fail: CONFIRMED (error: no module)
7. Commit references G3 + spec §3: PASS

**Spec inconsistency noted:**
- Spec §3 says "74 lines" but verbatim content with decorative comments produces 90 `wc -l` lines. AC threshold ≤80 satisfied by removing section-separator comment lines (content and wiring unchanged).

**G12 Exemption:** P1-A1g is composition root creation only. No pilot scenarios exist yet. G12 does not apply.

**Next:** P1-A2g (go.mod + go.sum) — unblocked by this commit.

---

### 2026-05-22 — TASK_P1-A1 (Phase 1 — Create composition-root.ts)

**Task:** Create `apps/technical-analysis/composition-root.ts` per P0-4 plan §5.2 (verbatim).

**Status:** DONE

**What was done:**
- Created `apps/technical-analysis/composition-root.ts` with verbatim content from P0-4 §5.2.
- Import paths use `./src/` prefix (file lives at app root, not inside `src/`).
- File wires: Database → TACalculatorImpl → SQLitePriceRepository → CalculateTAService → ComputeTAUseCase → createRouter → Bun server export.
- `bun tsc --noEmit` passes: 0 errors.

**AC Verification results:**
1. File exists: PASS
2. Zero business logic (calculateRSI, calculateMACD, for, while): PASS
3. `bun tsc --noEmit` exits 0: PASS
4. `grep -c "^import"` = 6 (spec AC says 11, but §5.2 verbatim has 6 actual import lines; spec error — 11 counts section comment lines + import lines together). File uses §5.2 VERBATIM as instructed.
5. `wc -l` = 42 (spec AC says 21-25; §5.2 verbatim with section comments produces 42 lines; "23 lines" in spec counted only functional code lines, not comments/blanks). File is §5.2 VERBATIM as instructed.
6. Commit references P1-A1 + G3: DONE

**Spec inconsistencies noted for PM/QA:**
- AC4: `grep -c "^import"` expected 11 but §5.2 verbatim has 6 import statements. The "11" appears to count section comment lines + imports together. Filed as spec discrepancy — file is verbatim-correct.
- AC5: `wc -l` expected 21-25 but §5.2 verbatim with section headers produces 42 lines. "23 lines" in spec counted only functional code units. Filed as spec discrepancy — file is verbatim-correct.

**G12 Exemption:** P1-A1 is pure file creation. No runtime path, no pilot scenarios exist yet. G12 ("run pilot scenarios + verify dashboard green") does NOT apply to P1-A1.

**Key constraint for next tasks (P1-A2, P1-A3):**
- `package.json` must change `"module"` + `"scripts"."start"` to reference `composition-root.ts`.
- `Dockerfile` must change CMD + add COPY line for `composition-root.ts`.
- `src/index.ts` delete (P1-A5) must wait until package.json + Dockerfile are updated AND tests pass.

### 2026-05-22 — TASKS P1-A2, P1-A3, P1-A4, P1-A5 (Phase 1 — composition-root bucket complete)

**Status:** ALL DONE — commits a22acdf3, 3f522dc3, 241631af, 20ed83d5

**What was done:**
- P1-A2 (a22acdf3): package.json `"module"` + `"scripts"."start"` changed to `composition-root.ts`. tsc: 0 errors.
- P1-A3 (3f522dc3): Dockerfile CMD changed to `["bun","run","composition-root.ts"]`, added `COPY --from=builder /app/composition-root.ts ./` to runtime stage. tsc: 0 errors.
- P1-A4 (241631af): Created `src/interface/openapi.yaml` (OpenAPI 3.0.3) — GET /health + POST /ta/indicators, full request/response schemas matching ComputeTARequest/ComputeTAResponse DTOs. YAML validated via python3 yaml.safe_load. tsc: 0 errors.
- P1-A5 (20ed83d5): Deleted `src/index.ts`. grep --exclude-dir=node_modules: 0 remaining references. bun test: 24 pass, 0 fail. tsc: 0 errors.

**Spec discrepancy flagged:**
- P1-A5 AC2: spec says "21 pass" but actual suite has 24 pass. Discrepancy filed in commit body. All 24 pass — DoD satisfied.

**G12 Exemption:** P1-A bucket is wiring/config only. No pilot scenarios exist yet. G12 does not apply.

**G3 gate state (post P1-A5):**
1. `test -f apps/technical-analysis/composition-root.ts` → PASS
2. `grep -c "if|for|while|calculateRSI..." composition-root.ts` → 0 (PASS)
3. `test -f apps/technical-analysis/src/interface/openapi.yaml` → PASS
4. `test ! -f apps/technical-analysis/src/index.ts` → PASS
5. `bun test` → 24 pass, 0 fail (PASS)
6. `bun tsc --noEmit` → 0 errors (PASS)

**Next:** P1-B1 (extract primitive: RSI) — starts the primitives bucket. Blocked by P1-A5 (now unblocked).

Zone health: DDD layers clean, composition-root bucket DONE, src/index.ts deleted, openapi.yaml created, 24 tests green, tsc clean. | HEALTHY

### 2026-05-22 — TASK_P0-4 (Phase 0 audit + composition-root plan)

**Task:** Read-only audit of `apps/technical-analysis/` + produce composition-root migration plan.

**Findings:**
- 9 source files confirmed under `apps/technical-analysis/src/` across 4 DDD layers.
- DDD layer adherence: CLEAN across all 8 non-entry-point files. Zero violations found.
- `src/index.ts` is the de facto composition root (31 lines, pure wiring). Content already satisfies G3 requirements — issue is path/name only.
- Architect requires `apps/technical-analysis/composition-root.ts` (app root, not inside `src/`).
- Migration is low-risk: 1 delete, 2 creates, 2 modifies, 8 files untouched.
- No test breakage expected (tests don't import `src/index.ts`).

**Output file:** `docs/architecture-briefs/2026-05-22-refactor/p0-4-composition-root-plan.md`

**G3 gates documented:** 6 verifiable shell checks ready for QA.

Zone health: DDD layers clean, 9 files / 385 lines, 21 tests (11 unit TA calc + 6 unit service + 4 integration), composition-root.ts created (P1-A1 DONE), remaining: P1-A2..A5. | HEALTHY
