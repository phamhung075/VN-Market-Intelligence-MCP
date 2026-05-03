## Sprint 1844 — IN PROGRESS

**Status:** IN_PROGRESS | **Started:** 2026-05-04

## Goal

Backtest result retrieval + clean. Expose historical backtest runs via MCP tools so the user can compare strategy performance across time, and commit all orphan files accumulated since Sprint 1843.

## Scope

IN:
- `get_backtest_runs` MCP tool (#124) — list all stored runs for a strategy (wraps `IBacktestResultRepository.getRunsByStrategy()`)
- `get_backtest_run` MCP tool (#125) — retrieve a single run by ID (wraps a new `getRunById()` repo method)
- Clean: commit all orphan files + update project-stats.json to Sprint 1844 baseline

OUT: U-5 prediction calibration (gated until 2026-05-10), new strategies, schema changes, health-dashboard backtest widget (deferred — retrieval tools must land first).

## Success Metric

- `get_backtest_runs("combined-high-confidence")` returns structured list of all saved runs
- `get_backtest_run(<id>)` returns the full report for a single run
- tsc clean, DDD golden rule satisfied
- 0 orphan untracked files after clean task
- test baseline >= 8804 pass / <= 1 fail (1331a intentional only)

---

## Sprint 1843 — DONE

**Status:** DONE | **Closed:** 2026-05-03

## Goals

Backtest strategy completeness + test baseline hardening.

## Done

- 1843a — combined-high-confidence real strategy: taComputation.ts (EMA/RSI), buildCombinedHighConfidenceStrategy factory, computeTADirectionMap helper, 24 tests pass.
- 1843b — Fix 4 pre-existing test failures (265 x3 stale-date + 1332 x1 pollNews mock injection) + benchmarkReturnPct DRY.
- 1843c — Restore apps/mcp-server/docs symlink to git tracking.

---

## Sprint 1842 — DONE

**Status:** DONE | **Closed:** 2026-05-03

## Goals

U-8 Portfolio Backtesting Engine — full stack.

## Done

- 1842b — OHLCV backfill + 3 repository interfaces + SQLite implementations.
- 1842c — VNSignalAdapter: VI→EN signal normalizer wired into Kinh Dich write path.
- 1842d — BacktestEngine domain service + run_backtest MCP tool #120.
- 1842e — Phase 3: Sharpe ratio, VNI benchmark, confidence-weighted sizing, result persistence, combined-high-confidence stub.

---

## Sprint 1841 — DONE

**Status:** DONE | **Closed:** 2026-05-03

## Goals

U-9 health dashboard in api-gateway + U-10 BCTC batch sweep.

## Done

- 1841a — U-9: GET /health-dashboard, self-contained HTML, auto-refresh 60s, 8 services, health_checker.ts bug fix. 13 tests pass.
- 1841b — U-10: bctcBatchSweepJob cron + run_bctc_batch_sweep MCP tool, isEarningsSeason(), max 5 concurrent, failure isolation. 19 tests pass.

---

## Closed Sprints

> Full history: docs/TASKS_ARCHIVE.md

| Sprint | Result |
|--------|--------|
| 1840 — U-6 RAG wiring — pollNews→insertAnalysis + news-scout/financial-analyst flows wired with search_similar_context | DONE — 2026-05-03. 8703 pass / 3 pre-existing fail. totalTasksDone=504 |
| 1834 — TE Chromium anti-bot hardening — stealth args, randomised viewport, route interception, human-like nav delay | DONE — 2026-05-03. 8763 pass / 0 fail. totalTasksDone=495 |
| 1833 — Pipeline reliability: te-chromium CB, vnstock rate limiter, freshness SLA market-hours, officers NOT NULL guard, DRY marketContextTools | DONE — 2026-05-03. 8763 pass / 0 fail. totalTasksDone=494 |
| 1832 — Integrate semble semantic code search — add semble-search agent + skill, wire lazy_load into 6 agents, update dev-standards | DONE — 2026-05-02. 8608 pass / 0 fail. totalTasksDone=486 |
| 1831 — CLEAN: commit orphans, close Sprint 1830, advance to Sprint 1832 | DONE — 2026-05-02. 8602 pass / 0 fail. totalTasksDone=484 |
| 1830 — JANITOR-023: extract CLAUDE_BIN to agentConstants.ts | DONE — 2026-05-02. 8602 pass / 0 fail. totalTasksDone=483 |
| 1829 — te-chromium CB counter persisted to file + Sprint 1829 advance | DONE — 2026-05-02. 8602 pass / 0 fail. totalTasksDone=481 |
| 1828 — Reuters RSS + tradingEconomics consecutive-error observability (WORK alert at >=10 errors) + knowledgeFileCount sync | DONE — 2026-05-02. 8582 pass / 0 fail. totalTasksDone=479 |
| 1827 — Sync project-stats.json knowledgeFileCount + tool-registry.json toolCount + create missing agent notebooks | DONE — 2026-05-02. 8582 pass / 0 fail. totalTasksDone=474 |
