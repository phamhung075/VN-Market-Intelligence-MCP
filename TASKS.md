# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Sprints 133–162 archived: `docs/archive/sprints-133-162.md`

---

## Sprint 175 — feat(ohlcv-staleness): daily OHLCV staleness check cron

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1465_a | test(ohlcv-staleness): TDD RED — 5 failing assertions for runOhlcvStalenessCheck | Done | Dev |
| 1465_b | feat(ohlcv-staleness): GREEN — implement ohlcvStalenessCheckJob + wire into jobs.ts CRONS | Review | Dev |

---

## Sprint 172 — fix(evening-summary): market_prices freshness guard on watchlistMovers query

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1462 | fix(evening-summary): add updated_at freshness guard to market_prices JOIN in watchlistMovers query | Done | Dev |

> Report: `reports/TASK_REPORT_1462.md`

---

## Sprint 169 — fix(evening-summary): watchlistMovers always empty — date('now') vs MAX(date)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1456 | fix(evening-summary): ohlcv_change CTE uses MAX(date) not date('now') | Done | Dev |

> Report: `reports/TASK_REPORT_1456.md`
> Handoff: `docs/handoffs/TASK_1456.md`

---

## Sprint 171 — fix(checkpoint): RESTART → TRUNCATE + recordJobRun wrapper

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1458 | fix(checkpoint): RESTART → TRUNCATE + recordJobRun wrapper for walCheckpointJob | Done | Dev |

> Report: `reports/TASK_REPORT_1458.md`

---

## Sprint 170 — fix(schema): move scheduler_locks DDL to schema.ts

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1457 | fix(schema): scheduler_locks DDL inline in schedulerLockStore → schema.ts | Done | Dev |

> Report: `reports/TASK_REPORT_1457.md`

---

## Sprint 163 — fix(checkpoint): PASSIVE → RESTART mode

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1447 | fix(checkpoint): PASSIVE → RESTART mode | Done | Dev |

> Report: `reports/TASK_REPORT_1447.md`
> Handoff: `docs/handoffs/TASK_1447.md`

---

## Sprint 164 — fix(evening-summary): hasContent ignores vnIndex

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1449 | fix(evening-summary): add vnIndex != null to hasContent OR-chain | Done | Dev |

> Report: `reports/TASK_REPORT_1449.md`

---

## Sprint 165 — feat(france-summary): VN-Index snapshot in morning digest

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1450_a | test(france-summary): TDD RED — vnIndex block assertions | Done | Dev |
| 1450_b | feat(france-summary): add fetchVnIndexFn + Section 0 VN-Index block GREEN | Done | Dev |

> Reports: `reports/TASK_REPORT_1450a.md`, `reports/TASK_REPORT_1450b.md`

---

## Sprint 166 — fix(france-summary): market_prices fetched_at → updated_at

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1451 | fix(france-summary): market_prices column fetched_at → updated_at | Done | Dev |

> Report: `reports/TASK_REPORT_1451.md`

---

## Sprint 167 — fix(assembleBriefing): stale market_prices freshness guard

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1452 | fix(assembleBriefing): add 3-day freshness guard to market_prices subqueries | Done | Dev |

> Report: `reports/TASK_REPORT_1452.md`

---

## Sprint 168 — fix(france-summary): market_prices freshness guard

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1455 | fix(france-summary): market_prices freshness guard — VNINDEX + portfolio P&L queries | Done | Dev |

> Report: `reports/TASK_REPORT_1455.md`
> Handoff: `docs/handoffs/TASK_1455.md`

---

## Backlog

| ID | Title | Priority | Notes |
|----|-------|----------|-------|

---

