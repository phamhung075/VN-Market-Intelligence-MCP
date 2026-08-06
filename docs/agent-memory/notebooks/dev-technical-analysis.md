# dev-technical-analysis — Notebook

Zone: `apps/technical-analysis/` | Stack: **Go** (pilot active, 2026-05-22) | DB: market.db (read-only)

## Working Memory

[3 most recent cycles retained below. Archive in git history.]

### 2026-08-06 — TASK-503 (FIX-DIGEST-RSI-DUAL-ENGINE-DIVERGE) — contract doc, discovered as prior art, no new code

Router dispatched TASK-503: write `docs/standards/ta-engine-contract.md` (Go RSI engine pure-compute
contract, Wilder params, 35-candle gate) to unblock TASK-504 (dev-mcp-server digest RSI rewire).
Before writing, read the file — it already existed, committed 2026-06-21 (`60891f75c`, task
`TASK-RSIFIX-1`) from the *original* run of this same architect brief
(`docs/architecture-briefs/2026-06-21-digest-rsi-dual-engine-diverge.md`). Its downstream consumer
(`TASK-RSIFIX-2`, commit `3e5a5a5a6`) was also already shipped the same day — verified live in
`apps/mcp-server/src/application/usecases/briefing/defaultComputeTa.ts`: it already calls
`computeTAIndicators` (Go engine), already gates on 35 candles, already drops the
`market_prices_history` fallback. Sprint `FIX-DIGEST-RSI-DUAL-ENGINE-DIVERGE` (opened 2026-08-06,
tasks 503/504) re-minted work that had already fully landed in June — a prior-art-check gap upstream
of this agent (mint time, not dispatch time). Re-verified every numeric constant in the existing doc
against current Go source (rsi.go, usecases.go, dtos.go, router.go, technical_analysis.go) — zero
drift found. Added value rather than a no-op: new §10 documents the TS caller wrapper
(`computeTAIndicators` in `clients.ts` — `code`→`symbol` field mapping, array→scalar reduction via
`last()`, throw-on-non-2xx fail-closed contract) since that's the literal function TASK-504 was going
to wire in, plus a §12 prior-art trace for auditability. orch-state: TASK-503 → `DONE` via
`orch-apply.sh` (commit `60891f75c` cited as delivering commit, `status_note` carries the full
prior-art trace). TASK-504 left untouched (`dev-mcp-server` zone, not mine to close) but flagged in
`status_note` + doc §12 as almost-certainly already-satisfied — recommends architect/PM verify via
git log before dispatching fresh implementation. No Go code touched, no rebuild, no G12 gate run
(docs-only, zone unchanged).

Zone health: no code drift found this cycle; the divergence class this brief targeted (dual RSI
engines) already has zero live occurrences in the current tree | HEALTHY

**Status: DONE -> next_agent=architect-or-po** (verify TASK-504 prior-art claim against
`3e5a5a5a6` + current `defaultComputeTa.ts` before dispatching `dev-mcp-server`; if confirmed, close
504 as duplicate rather than re-implementing — this is a mint-time dedup gap, not a code gap).

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

---

## Archive

[Archived to git history; retained: 3 most recent cycles. Full history in git log.]

### 2026-08-06 — pruned to AC-2b (3-cycle cap), round 5

- 2026-07-29 FACTORY-TECHANALYSIS-dedup-calculator (commits `a1bb99309`, `31cbb7682`) — extracted shared `pkg/module/mapper.go::ToDomainIndicators` mapping (was duplicated between `TACalculator.Calculate` and `sandboxCalculator.Calculate`, sandbox copy omitted MA5/MA20/MA50); REVIEW status → ops rebuild+swap.

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
