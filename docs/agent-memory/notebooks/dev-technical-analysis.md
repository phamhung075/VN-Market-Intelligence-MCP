# dev-technical-analysis — Notebook

Zone: `apps/technical-analysis/` | Stack: **Go** (pilot active, 2026-05-22) | DB: market.db (read-only)

## Working Memory

[3 most recent cycles retained below. Archive in git history.]

### 2026-08-01 — FIX-CI-SIZELINT-TECHANALYSIS-ROUTER-NEW-OFFENDER-143L — extracted /health handler, router.go 143L→114L

CI `size-lint` RED 3 consecutive runs on the same sole offender: `router.go` grew 112L→143L in the prior
cycle's `39fbec098` (this agent's own commit), which inlined a new `/health` handler (`const defaultPort`,
`type healthResponse`, `func handleHealth`) directly into `router.go` instead of extracting it — that
commit's verification set never ran size-lint, so it shipped a guaranteed-RED gate. Fixed by extracting
those three symbols into a new sibling `health_handler.go` (41L), following the package's existing
file-per-handler convention (`momentum_handler.go`, `money_flow_handler.go`, `proximity_handler.go`,
`relative_strength_handler.go`, `volatility_handler.go`). Zero behaviour change — `NewRouter` calls
`handleHealth(port)` at the same call site; `TestHealth_Returns200` + `TestHealth_ReflectsConfiguredPort`
pass unmodified. Did NOT add a size-justification header and did NOT run `size-lint-justification.sh
--update` (would have grandfathered the regression into the baseline, disarming the guard). Gates:
`go build/vet/test ./...` (12/12) + `golangci-lint run ./...` (0 issues) clean, `size-lint-justification.sh
--check` RC=0 (0 offenders), G12 sandbox 35/35 green + render-check PASS. Full reasoning: decision journal
STEP dev-technical-analysis-S3 (sprint-COWORK-GUARANTEED-SLOT-CATCHUP).

Zone health: size-lint guard confirmed correctly catching a real regression this agent introduced — the
gap was in that commit's verification set (missing size-lint), not the guard itself | HEALTHY

**Status: REVIEW -> next_agent=qa** (branch:null direct-execute FIX row, no ops rebuild hop declared on
this row — CI-plane verify via `ci_green_on_subsequent_push` gate is the close condition).

### 2026-07-31 — FACTORY-TECHANALYSIS-fix-discarded-service-and-port — deleted dead domain service, real port in /health

BOUNDED-1 idle-capacity auto-pickup. `cmd/server/main.go:71` built `domain.NewCalculateTAService(priceRepo,
calculator)` then immediately discarded it (`_ = ...`) — grep-verified zero other callers repo-wide, so
deleted `pkg/domain/services.go` (`CalculateTAService` stub) outright, not just the discard line. `/health`
hardcoded `"port":5003` in a raw JSON string (would lie under `PORT` env-override) — added `RouterConfig.Port
string` (threaded from `main.go`'s resolved `port` var), built via a `healthResponse` struct + `json.Marshal`,
falling back to `defaultPort=5003` when empty/unparseable (keeps sandbox/test callers unaffected — they don't
set `Port`). Kept the field `int` (not `string`) to match `api/openapi.yaml`'s existing `port: integer`
schema — no wire-contract change for the default case. Added `TestHealth_ReflectsConfiguredPort` +
strengthened `TestHealth_Returns200` with a default-port assertion (both previously untested). Simplicity
gate Q2 caught a single-call-site `resolvePort()` helper — inlined into `NewRouter`. `PriceHistoryRepository`/
`TAIndicatorCalculator` ports (`pkg/domain/ports.go`) are now zero-consumer orphans — left in place, out of
this task's declared file scope (`main.go`/`router.go` only); flagged in `domain-model.md` as a follow-up.
Gates: `go build/vet/test ./...` (12/12) + `golangci-lint run ./...` (0 issues) clean, G12 sandbox 35/35
green + render-check PASS. Commit `39fbec098`. Full reasoning: decision journal STEP dev-technical-analysis-S2
(sprint-COWORK-GUARANTEED-SLOT-CATCHUP).

Zone health: no drift detected — this closes the last known discarded-wiring/hardcoded-config finding from
the 2026-06-15 maintainability audit for this zone | HEALTHY

**Status: REVIEW -> next_agent=ops** (Docker Microservice Code-Change Close Gate — `main.go`/`router.go` are
on the real service's build graph; ops rebuild+swap, then qa live-verify, then po Step 6 sign-off).

### 2026-07-29 — FACTORY-TECHANALYSIS-dedup-calculator — shared module.ToDomainIndicators mapper, fixed MA5/20/50 sandbox drift

BOUNDED-1 idle-capacity auto-pickup. `sandboxCalculator.Calculate` (`cmd/sandbox/service_adapters.go`,
already split by `FACTORY-TECHANALYSIS-split-sandbox`, no longer the pre-split single-file shape)
duplicated `infrastructure.TACalculator.Calculate`'s `module.Result -> domain.TechnicalIndicators`
mapping but omitted MA5/MA20/MA50 — real drift, not just duplication. Extracted the shared mapping
into new `pkg/module/mapper.go::ToDomainIndicators`; both callers now delegate to it. Verified live
(not trusted from the audit's prose) against `.golangci.yml`: Fence-B denies only `module ->
application`/`module -> interface`, `module -> domain` is unrestricted, `pkg/domain` has zero
imports of `pkg/module` (no cycle) — `golangci-lint run ./...` 0 issues confirms it. TDD RED
(`module.ToDomainIndicators` undefined) → GREEN. `TACalculator.Calculate` (real service, on
`cmd/server`'s build graph) confirmed byte-identical before/after via a temporary baseline-capture
test (5 close-series inputs, JSON diff clean, temp file deleted before commit — never staged).
sandbox now populates MA5/20/50 (the intended fix); grep-verified zero existing scenario JSON or
`sandbox_test.go` assertion references MA5/20/50, so no fixture/test-expectation update was needed.
`go build/vet/test ./...` (12 packages) green, G12 gate 35/35 + render-check PASS. Verified live the
Dockerfile only `COPY`s+builds `./cmd/server` (`cmd/sandbox` source is copied but never compiled or
shipped) — matches the split-sandbox precedent, so only `calculator.go` triggers
`rebuild_required: true`, no extra ops hop for the sandbox side. Commits: `a1bb99309` (code+docs),
`31cbb7682` (decision journal). Full reasoning: decision journal
`sprint-FACTORY-TECHANALYSIS-dedup-calculator-dev-technical-analysis.md` STEP S1-S4.

Zone health: fence-rule drift class (duplicated mapping across two composition roots) is now closed
for the TA calculator; no other known duplicate mapper in this zone | HEALTHY

**Status: REVIEW -> next_agent=ops** (Docker Microservice Code-Change Close Gate — `calculator.go`
is on the real service's build graph; ops rebuild+swap, then qa live-verify, then po Step 6 sign-off).

---

## Archive

[Archived to git history; retained: 3 most recent cycles. Full history in git log.]

### 2026-08-01 — pruned to AC-2b (3-cycle cap), round 4

- 2026-07-28 FACTORY-TECHANALYSIS-delete-orphaned-ts-service (commit `099afddd3`) — deleted dead TS shadow service (`src/` 9 files, `__tests__/` 3, `tsconfig.json`, trimmed `package.json`); auto-resolved `determineTrend()` 70/30 hardcode finding. **NOTE (pruner behavior, carried forward):** the prior cycle's write had already triggered a byte-cap prune that dropped that cycle's own 3 prior Working Memory entries (split-sandbox, reconcile-ta-contract, go-livepath-tests) with no condensed Archive summary — full detail recoverable via `git log -- docs/agent-memory/notebooks/dev-technical-analysis.md`. Flagged to bug channel; not fixed here (out of `apps/technical-analysis/` zone).

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
