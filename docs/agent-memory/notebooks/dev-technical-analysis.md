# dev-technical-analysis — Notebook

Zone: `apps/technical-analysis/` | Stack: **Go** (pilot active, 2026-05-22) | DB: market.db (read-only)

## Working Memory

[3 most recent cycles retained below. Archive in git history.]

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

### 2026-07-28 — FACTORY-TECHANALYSIS-delete-orphaned-ts-service — deleted dead TS shadow service

Final task of 3-task chain (go-livepath-tests → reconcile-ta-contract → this). Live grep (filtered false-positive `../src/` hits from OTHER apps' own src/) confirmed ONLY importers of `apps/technical-analysis/src/` were its own `__tests__/` — no prod code, no other app, no CI step. Deleted `src/`(9 files)+`__tests__/`(3)+`tsconfig.json`(dead include glob); trimmed `package.json` (`module`/`start`/`check`/`test` scripts, `hono` dep — `bun test` w/ 0 files verified live to exit 1, so removed not left as silent no-op). Auto-resolved `determineTrend()` 70/30 hardcode finding (dead-code-latent, per 2026-06-15 audit). Updated 4 docs + 2 code comments "scheduled for deletion"→"deleted 2026-07-28". Gates: go build/vet/test 12/12 GREEN, sandbox 35/35 GREEN+render PASS, Dockerfile/compose untouched. Commit `099afddd3`. Full reasoning: decision journal STEP dev-technical-analysis-S1 (sprint-COWORK-GUARANTEED-SLOT-CATCHUP).

**NOTE (pruner behavior):** this cycle's write triggered `notebook-auto-prune.sh` byte-cap prune that dropped ALL 3 prior Working Memory cycles (split-sandbox, reconcile-ta-contract, go-livepath-tests) with no condensed Archive summary added — unlike the established "pruned to AC-2b" pattern below. Full detail recoverable via `git log -- docs/agent-memory/notebooks/dev-technical-analysis.md`. Flagged to bug channel; not fixed here (out of `apps/technical-analysis/` zone).

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
