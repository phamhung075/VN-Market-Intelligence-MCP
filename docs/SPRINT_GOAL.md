## Sprint 1833 — Active

**Status:** IN PROGRESS | **Opened:** 2026-05-02

## Goals

Restore pipeline reliability across three active data feed failures (BCTC queue starvation, news Chromium crash loop, vnstock rate-limit). Close two false alarms (foreign-flow holiday gap, ohlcv Saturday skip). Add observability and circuit protection to prevent silent failures recurring. Two carry-over DRY/hygiene tasks in parallel.

## Scope

IN:
- 1833c — bctcQueueEnricherJob silent 0-item runs: add WARNING log on 0 URLs found, verify congbao scraping [P1]
- 1833g — te-chromium-news Playwright crash loop: circuit breaker on VPS + disable dead sources (Reuters RSS, TE legacy) [P1]
- 1833h — Make freshnessSlaMonitorJob market-hours-aware (TASK-1407) [P2]
- 1833i — vnstock global rate limiter across all concurrent ticker+endpoint combos; surface officers NOT NULL as data quality alert [P2]
- 1833e — Null-check guard for vnstock_officers.code before INSERT [P3]
- 1833k — Fix Trading Economics Chromium path config + anti-bot mitigation [P3]
- 1833f — Fix vn-news-fetch heartbeat timestamp so monitoring reflects reality [P4]
- 1833l — Graceful 404 handling for Yahoo Finance unknown symbol [P4]
- 1833a — DRY: marketContextTools.ts delegate to marketContextBuilder.ts (carry-over)
- 1833b — semble-search notebook + devAgentCount sync (carry-over)
- 1833d — CLOSED: false alarm (Vietnam Labor Day 2026-05-01, foreign flow gap expected)
- 1833j — CLOSED: false alarm (Saturday 2026-05-02, ohlcv skip correct)

OUT: New features, new data sources, architecture changes

## Success Criteria

- bctcQueueEnricherJob logs URL count per ticker per run; 0-result runs produce WARNING not silent pass
- te-chromium-news crash loop stopped by circuit breaker (max restarts/hour enforced on VPS)
- Reuters RSS + Trading Economics legacy sources disabled (58+ consecutive failures, never succeeded)
- freshnessSlaMonitorJob does not alert on non-trading days/hours
- vnstock global rate limiter prevents ACV/VDC/ACB/VCI concurrent fetches from tripping API cap
- `NOT NULL constraint failed: vnstock_officers.code` surfaced as data quality WORK alert with ticker identified
- Trading Economics Chromium failures drop from 114 to 0
- vn-news-fetch health endpoint returns healthy when push rate > 0
- Yahoo Finance 404 handled gracefully without log noise
- All existing tests pass (baseline: 8608)

---

## Closed Sprints

> Full history: docs/TASKS_ARCHIVE.md

| Sprint | Result |
|--------|--------|
| 1832 — Integrate semble semantic code search — add semble-search agent + skill, wire lazy_load into 6 agents, update dev-standards | DONE — 2026-05-02. 8608 pass / 0 fail. totalTasksDone=486 |
| 1831 — CLEAN: commit orphans, close Sprint 1830, advance to Sprint 1832 | DONE — 2026-05-02. 8602 pass / 0 fail. totalTasksDone=484 |
| 1830 — JANITOR-023: extract CLAUDE_BIN to agentConstants.ts | DONE — 2026-05-02. 8602 pass / 0 fail. totalTasksDone=483 |
| 1829 — te-chromium CB counter persisted to file + Sprint 1829 advance | DONE — 2026-05-02. 8602 pass / 0 fail. totalTasksDone=481 |
| 1828 — Reuters RSS + tradingEconomics consecutive-error observability (WORK alert at >=10 errors) + knowledgeFileCount sync | DONE — 2026-05-02. 8582 pass / 0 fail. totalTasksDone=479 |
| 1827 — Sync project-stats.json knowledgeFileCount + tool-registry.json toolCount + create missing agent notebooks | DONE — 2026-05-02. 8582 pass / 0 fail. totalTasksDone=474 |
