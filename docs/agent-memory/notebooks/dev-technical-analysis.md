# dev-technical-analysis — Notebook

Zone: `apps/technical-analysis/` | Stack: **Go** (pilot active, 2026-05-22) | DB: market.db (read-only)

## Working Memory

[3 most recent cycles retained below. Archive in git history.]

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
