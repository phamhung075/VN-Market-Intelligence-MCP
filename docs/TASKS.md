# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Historical sprint details: see [docs/TASKS_ARCHIVE.md](docs/TASKS_ARCHIVE.md)

---

## Backlog

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| 1833c | FIX: bctcQueueEnricherJob silent 0-item runs — VPS healthy, root cause is URL discovery returning 0 results per ticker with no warning. Add WARNING log when URL count=0 per ticker per run; verify enricher scraping against congbao.chinhphu.vn for new quarterly filings. | P1-CRITICAL | BUG | developer | 2026-05-02 | Done |
| 1833k | FIX: Trading Economics Chromium scraper — 114 consecutive failures. Investigate Playwright executable path config (/usr/bin/chromium) + anti-bot detection mitigation. | P3-MEDIUM | BUG | developer | — | — |
| 1833f | FIX: vn-news-fetch stale heartbeat — service reports unhealthy despite 90 pushes/24h. Fix heartbeat timestamp update so monitoring reflects reality. | P4-LOW | BUG | ops | 2026-05-02 | Done |
| 1833l | FIX: Yahoo Finance 404 on unknown symbol — identify delisted/renamed ticker, add graceful 404 handling to prevent log noise. | P4-LOW | BUG | developer | 2026-05-03 | Done |
| 1833b | FIX: semble-search notebook missing + devAgentCount drift in project-stats.json | LOW | FIX | developer | — | — |

---

## Todo

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| 1833g | FIX: te-chromium CB hour-window reset + exponential backoff + disable Reuters RSS / Trading Economics legacy in resolvedFetchers + seedKnownSources. 4 files, ~118 lines, 8 ACs. | P1-CRITICAL | BUG | qa | [TASK_1833g.md](tasks/TASK_1833g.md) | Done |
| 1833h | FIX: freshnessSlaMonitorJob — isVnMarketHours blindness to weekends/holidays. Add isVnTradingDay(). 3 files, ~116 lines, 15 ACs. | P2-HIGH | BUG | developer | [TASK_1833h.md](tasks/TASK_1833h.md) | — |
| 1833i | FIX: vnstock global rate limiter + officers NOT NULL alert — sliding-window 50 RPM limiter in vnstockBridge.ts; null-code filter in storeOfficers(); NOT NULL catch + de-duped WORK Telegram in syncVnstockData.ts. Closes 1833e. 3 files + 2 test files, ~68 lines net added. 8 ACs. | P2-HIGH | BUG | developer | [TASK_1833i.md](tasks/TASK_1833i.md) | — |
---

---

## In Progress

| Task ID | Title | Priority | Type | Owner | Handoff | Started |
|---------|-------|----------|------|-------|---------|---------|

---

## Review

| Task ID | Title | Priority | Type | Owner | Handoff |
|---------|-------|----------|------|-------|---------|

---

## Done

| Task ID | Title | Merged | Reports |
|---------|-------|--------|---------|
| 1833e | CLOSED by 1833i — null-code guard + NOT NULL alert for vnstock_officers.code absorbed into 1833i scope. | 2026-05-02 | — |
| 1833a | DRY: marketContextTools.ts — delegate 4 section builders to marketContextBuilder.ts. -397 lines (502→105). 8718 pass / 1 pre-existing fail. | 2026-05-03 | — |
| 1833d | CLOSED (false alarm): foreign-flow 2026-05-01 gap — Vietnam Labor Day, market closed. 31h gap is expected (holiday + weekend). VPS service correctly idle. Note: SLA monitor market-hours blindness tracked as 1833h. | 2026-05-02 | — |
| 1833j | CLOSED (false alarm): ohlcv-daily-aggregator missing run 2026-05-02 — Saturday, market closed, job correctly skipped. Last run 2026-05-01 15:00 UTC correct. 7 rows / 31 tickers consistent with trading calendar. TA readiness resumes Monday 2026-05-05. | 2026-05-02 | — |
| 1832b | FIX: pollNews zero-check excludes CB-open/disabled sources — suppresses BUG 2727+2728 false alarms. 5 new AC pass. 8608 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1832b.md |
| 1832a | CLEAN: commit orphans, close Sprint 1831, advance to Sprint 1832 | 2026-05-02 | — |
| 1831a | CLEAN: close Sprint 1830, advance to 1831, commit orphans, prune remote branches | 2026-05-02 | — |
| 1830a (JANITOR-023) | DRY: extract CLAUDE_BIN to agentConstants.ts, import in smartCompactSpawner + qaResponderSpawner. tsc clean, 2 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1830a.md |
| 1830-clean | CLEAN: advance to Sprint 1830, update project-stats.json (currentSprint=1830, totalTasksDone=481). | 2026-05-02 | — |
| 1829b | FIX: te-chromium CB counter persisted to /app/data/te-chromium-cb-state.json — survives Docker restarts. 4 new AC pass. 8602 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1829b.md |
| 1829a | CLEAN: close Sprint 1828, advance to Sprint 1829, update project-stats.json (currentSprint=1829, totalTasksDone=479). | 2026-05-02 | — |
| 1828c | SPRINT-S: Reuters RSS + tradingEconomics consecutive-error observability; WORK alert at ≥10 failures; AC-R-1..6 + AC-TE-1..6. 12 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1828c.md |
| 1828d | DOCS: trim docs/SPRINT_GOAL.md to ≤30 lines (keep last 5 closed sprints). | 2026-05-02 | — |
| 1828b | FIX: sync project-stats.json knowledgeFileCount to actual count. | 2026-05-02 | — |
| 1828a | CLEAN: commit orphans, close Sprint 1827, advance to Sprint 1828. | 2026-05-02 | — |
| 1827c | DOCS: scaffold 19 missing agent notebooks in docs/agent-memory/notebooks/. | 2026-05-02 | — |
| 1827b | FIX: sync project-stats.json knowledgeFileCount + tool-registry.json toolCount. | 2026-05-02 | — |
| 1827a | CLEAN: commit orphan files, close Sprint 1826, advance SPRINT_GOAL.md to Sprint 1827. | 2026-05-02 | — |
| 1826b | FIX: GSO HTML parser observability — Variant 1/2 regex + console.error on parse fail; AC-12a/b/c. 15 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1826b.md |
| 1826a | CLEAN: commit orphan files, close Sprint 1825, advance SPRINT_GOAL.md to Sprint 1826. | 2026-05-02 | — |
| 1825b | FIX: GSO HTML parser — parseGsoHtml regex extractor replaces JSON.parse(HTML); AC-11a/11b. 12 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1825b.md |
| 1825a | CLEAN: commit orphan files (agent-memory fixtures, briefing output, notebook, flows). Advance sprint to 1825. totalTasksDone=469. | 2026-05-02 | — |
| 1824f | CLEAN: commit orphan untracked files + delete stale remote branch task/1824a-deploy-market-hours-guard. tsc clean. | 2026-05-02 | — |
| 1824e | FIX: GSO macro — remove VPS_ENDPOINT skip guard, Source 3 fetch attempted natively with graceful fallback. 11 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1824e.md |
| 1823d | FIX: te-chromium crash-loop circuit breaker — 3-strike limit on "Target closed", WORK alert fires once at threshold, auto-recovery on success. 5 new AC tests. 8582 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1823d.md |
| 1822g | CLEAN: delete stale task/1822a-news-fetcher-fixes branch; commit orphan session/handoff/report files. | 2026-05-02 | — |
| 1821b | Wire smartCompactSpawner as MCP tool `smart_compact` (tool #118). tsc clean, 8565 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1821b.md |
| 1815d | FIX: docker-compose.yml mcp-server healthcheck — replace curl with bun fetch. 8647 pass / 19 fail (all pre-existing). | 2026-05-02 | reports/TASK_REPORT_1815d.md |
| 1815c | FIX: tradingEconomicsChromium.ts — retry-on-Target-closed Playwright crash. 8646 pass / 19 fail (all pre-existing). | 2026-05-02 | reports/TASK_REPORT_1815c.md |
| 1810a | FIX: BCTC income statement — sci-notation guard in vnNumberParser, GUARD_MAX 500T→2T, multi-field magnitude sentinel. 33 tests pass. | 2026-05-01 | reports/TASK_REPORT_1810a.md |
| 1777–1824 | Sprints 1777–1824 archived — see docs/TASKS_ARCHIVE.md | 2026-05-02 | — |

---
