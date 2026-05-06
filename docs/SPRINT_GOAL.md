## Sprint 1847 — BACKLOG (PO Approved)

**Status:** APPROVED | **Scheduled:** 2026-05-06

## Goal

Add Tran Ngoc Bau (Strategy Quality Supervisor) agent — audit-only phase. Validate all 8 cowork analysis agents for strategy adherence (Thiên Thời / Địa Lợi / Nhân Hòa framework), enforce confidence gates, detect dedup candidates, and report findings daily to WORK channel.

## Scope

IN:
- New agent: `.claude/agents/tran-ngoc-bau.md` + full YAML metadata
- New flows: `.claude/flows/tran-ngoc-bau/main.md` (8-step audit workflow) + `audit-checklist.md` (validation rules)
- New knowledge: `.claude/knowledge/alert-message-format.md` (SSOT for Vietnamese message templates, regime caveats, diacritics)
- New tools package: `.claude/tools/package/tran-ngoc-bau.md`
- New Cowork entry: `cowork-workspace-team-claude-desktop/08-tran-ngoc-bau.md`
- Integration: Update cron-jobs.md (schedule), agent-roster.md (team table), CLAUDE.md (agent routing)
- Testing: Integration test verifies 8-step cycle, session log creation, WORK message sent

OUT: Auto-corrections (Phase 3), per-agent performance metrics, historical MARKET cleanup, new MCP tools

## Success Metric

- Agent deploys to Cowork + Cron schedule
- Daily cycle runs: bootstrap → audit → report (Steps 1–6 complete)
- Session log + notebook populated
- WORK message sent with quality summary
- Identify ≥5 quality issues (confidence gates, format, dedup candidates, bypass exceptions)
- Baseline metrics established for Phases 2–3
- 0 integration test failures

---

## Sprint 1846 — DONE

**Status:** DONE | **Closed:** 2026-05-06

## Goal

Backtest lifecycle completeness — delete, export, compare. Three missing MCP tools close the CRUD gap in the backtesting feature: `delete_backtest_run` (#123), `export_backtest_run_csv` (#124), `compare_backtest_runs` (#125). Plus sprint clean and UPGRADE_PLAN forward extension.

## Scope

IN:
- Clean: commit orphan session/report files accumulated since Sprint 1845
- Feature: delete_backtest_run MCP tool (#123) — purge stale runs by ID; adds deleteRun() to IBacktestResultRepository + SQLite adapter
- Feature: export_backtest_run_csv MCP tool (#124) — convert trades[] from a stored run into CSV text for tabular analysis
- Feature: compare_backtest_runs MCP tool (#125) — side-by-side metric delta for 2–3 run IDs (return, drawdown, Sharpe, winRate, tradeCount)
- Docs: UPGRADE_PLAN.md Tier 4 section — backtest expansion roadmap + U-5 gate status

OUT: U-5 prediction calibration (gated 2026-05-10), new strategies, schema changes, UI changes

## Success Metric

- 3 new MCP tools registered and tested (toolCount = 128)
- deleteRun() in IBacktestResultRepository interface + SqliteBacktestResultRepository
- export returns valid CSV with header row + one row per trade
- compare accepts 2–3 run IDs and returns structured delta object
- 0 orphan untracked files after clean task
- test baseline >= 8804 pass / <= 1 fail

---

## Sprint 1845 — DONE

**Status:** DONE | **Closed:** 2026-05-03

## Goal

Sprint 1844 clean + worktree test isolation fix + tool-registry SSOT sync. Eliminate the 106-test failure gap that hits every worktree, commit orphan files accumulated since Sprint 1844, and sync tool-registry.json to the true toolCount of 125.

## Scope

IN:
- Clean: commit 5 orphan untracked files + 8 modified files from Sprint 1844 cycle
- Fix: `apps/mcp-server/data/` dir absent in worktrees → 106 test ENOENT failures; add `mkdir -p` in test setup so tests self-create the dir
- Sync: tool-registry.json missing `get_backtest_runs` (#121) + `get_backtest_run` (#122); update to toolCount=125
- DRY: `benchmarkReturnPct` computation duplicated in `backtestEngine.ts` (QA flag from 1844a review)

OUT: U-5 prediction calibration (gated until 2026-05-10), new MCP tools, schema changes, new strategies.

## Success Metric

- 0 orphan untracked files after clean task
- Worktree full-suite run shows same pass count as main (no ENOENT failures)
- tool-registry.json toolCount = 125, both new tools registered
- benchmarkReturnPct computed in one place only
- test baseline >= 8804 pass / <= 1 fail (1331a intentional only)

---

## Sprint 1844 — DONE

**Status:** DONE | **Closed:** 2026-05-04

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
