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
