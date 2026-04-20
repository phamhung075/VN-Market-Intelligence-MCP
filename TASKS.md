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

## Sprint 193 — fix(test-isolation): 1526 mock.module poison — 47 failures — COMPLETE

| ID | Title | Status | Role |
|----|-------|--------|------|
| 219 | fix(test-isolation): remove mock.module from 1526; inject detectSignalsFn via DI param | Done | Dev |

context: `docs/handoffs/TASK_219.md`
merge: 26eba37

---

## Sprint 209 — feat(schema): modular monolith phase 1 — schema decomposition

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1527_a | TDD RED: failing tests for schema slice files existence + daily_ohlcv merge | In Progress | Dev |
| 1527_b | GREEN: create schema slice files, update schema.ts to import slices | Todo | Dev |
| 1528 | schema-market-data.ts: prices, OHLCV, foreign flow tables | Todo | Dev |
| 1529 | schema-financial-reports.ts: BCTC + PDF tables | Todo | Dev |
| 1530 | schema-news.ts: news, market messages, cascade | Todo | Dev |
| 1531 | schema-alerts.ts: alerts, mutes, custom rules | Todo | Dev |
| 1532 | schema-portfolio.ts: positions, P&L, targets | Todo | Dev |
| 1533 | schema-briefings.ts: briefing_log, market_summaries | Todo | Dev |
| 1534 | schema-macro.ts: macro stats, commodities, SBV, predictions | Todo | Dev |
| 1535 | schema-system.ts: cron runs, agent logs, evidence, system tables | Todo | Dev |
| 1536 | schema.ts refactor: import all slices, remove inline DDL, verify tsc + full test pass | Todo | Dev |

---

## Backlog

| ID | Title | Priority | Notes |
|----|-------|----------|-------|

---
