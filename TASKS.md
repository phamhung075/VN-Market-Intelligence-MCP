# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Sprints 133–162 archived: `docs/archive/sprints-133-162.md`
> Sprints 163–176 archived: `docs/archive/sprints-163-176.md`
> Sprints 177–181 archived: `docs/archive/sprints-177-181.md`
> Sprints 182–189 archived: `docs/archive/sprints-182-189.md`

---

## Sprint 190 — feat(ohlcv-foreign-flow): add foreign buy/sell vol columns to daily_ohlcv — COMPLETE

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1503_a | TDD RED: 5 failing assertions in `1503-ohlcv-foreign-flow.test.ts` | Done | Dev |
| 1503_b | GREEN: schema +4 cols + writeForeignFlowToOhlcv + server wiring + assembleEveningSummary foreignFlowMovers + eveningSummaryJob formatter | Done | Dev |

merge: 9f882cc

---

## Sprint 191 — feat(cascade-outcome): backtesting schema + outcome tracking — COMPLETE

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1504_a | TDD RED: failing assertions — cascade_rule_hits +5 cols, market_messages +3 cols, migration idempotency, cascadeHitStore write/read, MCP outcome query | Todo | Dev |
| 1504_b | GREEN: schema ALTER migrations + cascadeHitStore updateOutcome + marketMessageStore updateImpact + get_cascade_outcomes MCP tool | Review | Dev |

context: `docs/handoffs/TASK_1504_a.md` | `docs/handoffs/TASK_1504_b.md`

---

## Sprint 192 — fix(briefing): BCTC-overdue prefix dedup in unresolvedAlerts — COMPLETE

| ID | Title | Status | Role |
|----|-------|--------|------|
| 211 | fix(briefing): BCTC-overdue prefix dedup — app-level 40-char prefix dedup after SQL fetch | Done | Dev |

context: `docs/handoffs/TASK_211.md`

---

## Backlog

| ID | Title | Priority | Notes |
|----|-------|----------|-------|

---
