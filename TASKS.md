# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Sprints 133–162 archived: `docs/archive/sprints-133-162.md`
> Sprints 163–176 archived: `docs/archive/sprints-163-176.md`
> Sprints 177–181 archived: `docs/archive/sprints-177-181.md`
> Sprints 182–189 archived: `docs/archive/sprints-182-189.md`
> Sprints 190–220 archived: `docs/archive/sprints-190-220.md`

---

## Sprint 223 — fix(pipelineWatchdog): also alert MARKET channel when news pipeline goes stale — COMPLETE 2026-04-20

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1551 | Add notifyUser? + sendTelegramMarket to pipelineWatchdogJob; human-friendly MARKET message, best-effort | Done | Dev |

---

## Sprint 222 — fix(watchdog): also alert MARKET channel when VPS data pipeline goes stale — COMPLETE 2026-04-21

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1550_a | TDD RED: `1550-watchdog-market-alert.test.ts` — 3 failing assertions: MARKET alert sent when stale, skipped in cooldown, WORK still fires | Done | Dev |
| 1550_b | GREEN: add `notifyUser?` to options + `sendTelegramMarket` import; send user-friendly MARKET alert after WORK alert succeeds | Done | Dev |

---

## Sprint 221 — fix(watchdog): extend VPS staleness coverage to news + OHLCV — COMPLETE 2026-04-21

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1549_a | TDD RED: `1549-watchdog-news-staleness.test.ts` — 6 failing assertions for news + OHLCV staleness checks | Done | Dev |
| 1549_b | GREEN: extend runVpsProxyWatchdog to check rag_analyses + daily_ohlcv freshness; off-hours guard unchanged | Done | Dev |

---

## Backlog

| ID | Title | Priority | Notes |
|----|-------|----------|-------|

---
