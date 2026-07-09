# dev-technical-analysis — Notebook

Zone: `apps/technical-analysis/` | Stack: **Go** (pilot active, 2026-05-22) | DB: market.db (read-only)

## Working Memory

[3 most recent cycles retained below. Archive in git history.]

### 2026-07-09 — FACTORY-TECHANALYSIS-split-sandbox — god-file split (1859L → 29 files ≤120L)

**Task:** FACTORY-MAINTAINABILITY-2026-06 factory task (BOUNDED-1 idle-capacity pickup). Split `cmd/sandbox/main.go` (1859L, the pilot's verification oracle) into single-responsibility files, replace `runPrimitive` switch with a `Runner` map, drop the dead `parseCloses` shim.

**Split approach:** kept `package main`, same directory (no `internal/` sub-package) — mirrors the sibling `FACTORY-MACRO-split-sandbox` pattern already landed for macro-indicators' `cmd/sandbox` (same audit brief). Avoids the brief's own CAVEAT (export/test-relocation churn): `sandbox_test.go` (package main) needed ZERO changes — all package-local identifiers (floatEq, generateFromPattern, runRSI, etc.) stay visible across files in the same package/directory. 28 new files: `doc.go`/`types.go`/`audit.go`/`diff.go`/`closes_gen.go`/`pattern_gen.go`/`scenario_path.go`, `runner_map.go` (`Runner` type + map replacing the switch), per-primitive `runner_rsi.go`, `macd_types/runner_macd/runner_macd_diffs.go`, `ma_types/runner_ma/runner_ma_multicase/runner_ma_cases.go`, `runner_bb.go`, `cross_types/runner_cross/runner_cross_multicase.go`, `module_types/runner_module/runner_module_diffs.go`, `service_types/service_adapters/service_request/service_diffs.go` + `runner_service.go`, `utils.go`; `main.go` trimmed to 118L (flags + tier dispatch only). Oversize runner functions (runMACD 150L, runModuleScenario 165L, runMAMultiCase 121L, runServiceScenario 163L) split by extracting their assertion/case-handling blocks into sibling helper functions — pure code-move, no logic changed.

**Dead code:** `parseCloses` (40L) had ZERO real callers anywhere in the repo (grep-confirmed) — only the `var _ = parseCloses` compile-shim referenced it. Deleted both; its logic was already fully duplicated by `generateFromPattern`/`generateRamp`, which `runMACD`/`runModuleScenario` actually use.

**Verification:** baseline-captured all 35 scenario oracle outputs before touching code, re-ran after the split — diff shows ONLY `runMs` timing jitter, zero verdict/actual/diffs changes. `go build/vet/test ./...` 12 packages GREEN. `golangci-lint run` 0 issues. `dashboard/build.sh` 35/35 GREEN + headless render-check PASS. All 29 non-test files ≤118L. `sandbox_test.go` left untouched (347L, pre-existing, out of this task's scope).

**Close-gate note:** `Dockerfile` builds only `./cmd/server` — `cmd/sandbox` is never `COPY`'d into the image, so this change cannot affect the deployed container; the ops rebuild + qa live-RAW-verify hops of the Microservice Code-Change Close Gate don't apply. Moved straight to DONE_VERIFIED on router's explicit instruction, full self-verification evidence in decision journal STEP dev-technical-analysis-S5.

**Gates:** `go build/vet/test ./...` 12 packages GREEN. `golangci-lint run` 0 issues. Sandbox 35/35 scenarios GREEN, headless render-check PASS.

Zone health: no drift detected — cmd/sandbox now reviewable in single-sitting files; no behavior change to the deployed `cmd/server` path.

---

### 2026-07-08 — FACTORY-TECHANALYSIS-reconcile-ta-contract — single /ta/indicators contract

**Task:** Make `api/openapi.yaml` the single authoritative `/ta/indicators` contract; conform the Go service. depends_on go-livepath-tests (DONE_VERIFIED); gates the sibling deletion task `FACTORY-TECHANALYSIS-delete-orphaned-ts-service`.

**Trend-port-or-drop decision (full reasoning: decision journal STEP dev-technical-analysis-S2):** investigated every candidate live caller of the dead TS `{code,days}->scalar+trend` shape / `determineTrend()`. Found NONE: (a) TS `src/` is never started (Dockerfile builds only `cmd/server`), (b) `packages/shared-types`'s TS-shaped twin type has zero importers, (c) mcp-server's own local `ComputeTAResponse.trend` is hardcoded `'NEUTRAL'` unconditionally (cosmetic report line only, no alert/decision logic reads it), (d) frontend's `fetchTASnapshot` already 404s today against the live Go service — traced the actual gateway routing (`PreservePath=true` forwards `/ta/ta/indicators` verbatim; Go only registers `/ta/indicators`) — a pre-existing, unrelated double-`/ta` frontend bug, out of zone, not fixed here. The audit brief itself independently calls this "latent in dead code." **Verdict: DROP, do not port.** `api/openapi.yaml` intentionally has no `trend` field, with an explicit note recording why.

**Spec fixes (openapi.yaml was already Go-shaped but incomplete/wrong):** `required:[symbol,period]` wrongly forbade the closes-only path → removed; `closes` request field was undocumented → added; `ma5/ma20/ma50` response fields were missing → added; RSI description hardcoded "14-period" → fixed to "window = request `period`, default 14"; `ema` field mislabeled "Wilder's smoothing factor" → fixed to "standard EMA α=2/(period+1), NOT Wilder's" (source: `pkg/primitive/moving_average/moving_average.go` explicitly says "NOT Wilder"); stale `501 not yet implemented` response removed (P1-B landed long ago).

**Go code:** zero functional changes — `dtos.go`/`router.go` doc-comments only (removed stale "Stubs: P1-B" comment, documented the authoritative contract + period's true semantics + why no trend field).

**Golden diff (live probe, running container, before vs after commit):** 3 representative `/ta/indicators` calls (symbol+period DB-backed; closes-only pure-compute; missing-both 400) — **byte-identical** before/after (expected: openapi.yaml isn't read at runtime by the binary, confirmed via grep; Go comment-only diff).

**Docs:** rewrote 3 zone docs that still described the dead TS `/ta/indicators` shape as canonical — `api-reference.md` (full `/ta/indicators` section replacement with live Go example), `usecases.md` (`ComputeTAUseCase` section: TS → real Go `Execute` flow), `domain-model.md` (`TechnicalIndicators` struct fields, "Trend field — dropped" section replacing "Trend Determination Logic", Indicator Formulas table period-accuracy fixes).

**Discovered signal (out of scope, not fixed):** a SECOND, Go-native dead-code path — `pkg/domain/services.go` `CalculateTAService.Compute()` is a stub hardcoded to return a zero-value struct; `cmd/server/main.go:71` constructs-then-discards it (`_ = domain.NewCalculateTAService(...) // unused HTTP path`). Flagged in `domain-model.md`; recommend a small dedicated follow-up cleanup task (touches composition root, outside this task's 3-file scope).

**Gates:** `go build/vet/test ./...` 12 packages GREEN, unchanged. `golangci-lint run` 0 issues. Sandbox 35/35 scenarios GREEN, headless render-check PASS.

Zone health: no drift detected — TA docs now the single accurate source (previously 3 zone docs described a never-deployed contract).

---

### 2026-07-08 — FACTORY-TECHANALYSIS-go-livepath-tests — Go tests for the live request path

**Task:** FACTORY-TECHANALYSIS-go-livepath-tests (epic FACTORY-MAINTAINABILITY-2026-06). Backstops deletion of the dead `src/` TS shadow service (FACTORY-TECHANALYSIS-delete-orphaned-ts-service, blocked on this task).

**Added (purely additive — no production code changed):**
- `pkg/application/usecases_test.go` — table tests for `ComputeTAUseCase.Execute`: pure-compute path (closes given, DB never consulted), DB-backed path (fake `PriceRepo`, asserts `GetCandles(symbol,60)` args + closes-in-order forwarding), `period<=0` defaults to 14 (zero + negative), empty-closes+empty-symbol → `"closes or symbol required"` (no I/O), `PriceRepo`/calculator error propagation.
- `pkg/interface/http/router_test.go` — `httptest.NewServer(NewRouter(...))` per the established pattern in `cmd/sandbox/main.go` and `apps/stock-price`: `GET /health`, `POST /ta/indicators` happy path, invalid-JSON 400, missing closes+symbol 400, useCase-error 500 (calculator- and repo-triggered).

**Coverage before:** `pkg/application` + `pkg/interface/http` had 0 `*_test.go` files. Now covered.

**Gates:** `go test ./...` 12 packages GREEN. `go vet` clean. `golangci-lint run` 0 issues. Sandbox 35/35 scenarios GREEN (`dashboard/build.sh`). No bugs found in the deployed path while writing tests.

---

## Archive

[Archived to git history; retained: 3 most recent cycles. Full history in git log.]

### 2026-07-09 — pruned to AC-2b (3-cycle cap), round 3

- 2026-06-30 TASK-VNINDEX-RS-C / FIX-TA-VNINDEX-BENCHMARK-ABSENT-RS § Zone C (commits 5c1ab331, 341d2879) — `WATCHLIST_TICKERS` env absent from docker-compose → `readWatchlistFromDB(dbPath)` fallback added to `cmd/server/main.go`; 41-ticker DB watchlist restored `/ta/roc-momentum` output (0→35 non-null ROC). No hardcoded tickers.

### 2026-07-08 — pruned to AC-2b (3-cycle cap)

Moved out of Working Memory (full detail in git log, `git log -- docs/agent-memory/notebooks/dev-technical-analysis.md`):
- 2026-06-15 FIX-TA-GOSVC-MA5-PRECISION (commit d32f0a17) — MA5 N/A regression + RSI drift fix (MA5/MA20/MA50 propagated end-to-end).
- 2026-06-15 FIX-TA-GOSVC-NA-DESPITE-DEPTH (commit 33e7a094) — Go DB-backed `GetCandles` implemented (was a stub).
- 2026-06-29 P0-1-VOLATILITY-INDICATORS (commit 1cd4a7722) — `POST /ta/volatility-indicators`: RV/GK/ATR%/regime/drawdown, REVIEW status.
- 2026-06-30 IND-P1-TECHNICAL-ANALYSIS-SUITE (commit a61496548 / 4842fd6f) — ROC momentum + relative-strength + 52w-proximity tools, REVIEW status.

### 2026-07-08 — pruned to AC-2b (3-cycle cap), round 2

- 2026-06-30 FIX-TA-SVC-STALE-SPLIT-DATA-SOURCE (commit b6055728) — 3 compounding bugs: `GetCandles`/`GetOHLCV` `ORDER BY date ASC LIMIT N` returned OLDEST bars not newest (fixed via `DESC LIMIT` subquery); `GetMultiTickerCandles` global LIMIT starved later-alphabet tickers (fixed via per-code subqueries); `maxCalendarGap=5` rejected the ~10-day Tết closure (raised to 14). VCB MA5 88,120→61,480, ROC null→0.088, 8/8 tickers restored. Pre-existing FPT/VHM thousands-vs-VND DB contamination noted, not fixed (separate migration).

### 2026-05-24 — Multiple TA dashboard improvements

Archived entries (dashboard/dash-check.mjs, category relabel, service tier, render gate, bake-verdicts). See git log for full details.
