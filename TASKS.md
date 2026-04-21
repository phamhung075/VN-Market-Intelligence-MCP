# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Sprints 133–162 archived: `docs/archive/sprints-133-162.md`
> Sprints 163–176 archived: `docs/archive/sprints-163-176.md`
> Sprints 177–181 archived: `docs/archive/sprints-177-181.md`
> Sprints 182–189 archived: `docs/archive/sprints-182-189.md`
> Sprints 190–220 archived: `docs/archive/sprints-190-220.md`
> Sprints 221–230 archived: `docs/archive/sprints-221-230.md`
> Sprints 231–239 archived: `docs/archive/sprints-231-239.md`

---

## Sprint 240 — Price Pipeline Recovery + Data Freshness Enforcement (2026-04-21)

**CRITICAL:** market_prices stale 25 days. Backfill 500+ rows, watchdog SSH escalation, freshness gates in briefing/evening.

**Ref:** REQ-240, TECH-240 | **Goal:** Restore price data, prevent future 25-day silence | **Status:** ACTIVE

| ID | Title | Status | Role | Blocker |
|----|-------|--------|------|---------|
| 240a | TDD RED — price pipeline recovery test suite | Done | Dev | — |
| 240b | GREEN — backfill service + watchdog escalation + freshness gates | Done | Dev | — |
| 240c | Integration — recordJobRun wrapper + schema UNIQUE constraint | Done | Dev | — |
| 240e | QA Smoke test — live price flow + briefing freshness | Blocked | QA | **VPS INFRA DOWN** (all 5 geo-blocked services unreachable since 17:30 UTC 2026-04-21; market_prices 25 days stale; price fetch job offline) |

### Task Details

**240a:** Depends: none | Context: `docs/handoffs/TASK_240a.md` | Create `src/__tests__/240-price-pipeline-recovery.test.ts` (12+ RED assertions)

**240b:** Depends: 240a | Context: `docs/handoffs/TASK_240b.md` | CREATE priceBackfillService.ts | MODIFY watchdog + briefing gates

**240c:** Depends: 240b | Context: `docs/handoffs/TASK_240c.md` | Wrap watchdog in recordJobRun + add UNIQUE(ticker, date, source)

**240e:** Depends: 240c | Context: `docs/handoffs/TASK_240e.md` | QA manual smoke test + report

---

## Backlog

| ID | Title | Priority | Notes |
|----|-------|----------|-------|

---
