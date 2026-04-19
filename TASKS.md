# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Sprints 133–162 archived: `docs/archive/sprints-133-162.md`
> Sprints 163–176 archived: `docs/archive/sprints-163-176.md`
> Sprints 177–181 archived: `docs/archive/sprints-177-181.md`

---

## Sprint 187 — fix(db-cleanup): remove test fixture rows leaked into production market.db — ACTIVE

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1486 | CLEANUP: delete test VCB fixture rows from production market_prices + market_prices_history | Done | Dev |

---

## Sprint 186 — fix(test-isolation): 034+1254+1163+vnstock — 047 mock.module still poisons full suite — ACTIVE

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1485_a | TDD RED: write 1485-telegram-mock-isolation.test.ts — simulate 047 stub, assert victims receive wrong type | Review | Dev |
| 1485_b | GREEN: add mock.module override in 034+1254+1163; fix vnstock-3statement closeDb() in beforeEach | Review | Dev |

---

## Sprint 185 — fix(test-isolation): 047 mock wrong return type — COMPLETE (2026-04-19)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1484 | fix(isolation): 047-bctc-orchestrator mock.module returns CoreSendResult instead of boolean — poisons telegram.js cache for 034+1163 | Done | Dev |

> Report: `reports/TASK_REPORT_1484.md`

---

## Sprint 184 — fix(test-isolation): 1480 inverted assertion + 1163 missing Bun.env — COMPLETE (2026-04-19)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1483_a | test(isolation): TDD RED — assert 1480 condition checks banned process.env not correct Bun.env | Done | Dev |
| 1483_b | fix(isolation): GREEN — fix 1480 condition + add Bun.env line to 1163 | Done | Dev |

> Report: `reports/TASK_REPORT_1483.md`

---

## Sprint 183 — fix(qa-spawner): spawnQaResponder DB injection + 1073 assertion drift — COMPLETE (2026-04-19)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1482_a | test(qa-spawner): TDD RED — assert spawnQaResponder uses injected db, not getDb() | Done | Dev |
| 1482_b | fix(qa-spawner): GREEN — add db? param to spawnQaResponder + pass conn + fix 1073 assertion | Done | Dev |

> Report: `reports/TASK_REPORT_1482.md`

---

## Sprint 182 — fix(test-isolation): batch6 — COMPLETE (2026-04-19)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1481_a | test(isolation): TDD RED — 1481-db-isolation-batch6.test.ts full-file scan | Done | Dev |
| 1481_b | fix(isolation): GREEN — bulk replace process.env → Bun.env everywhere in __tests__ | Done | Dev |

> Report: `reports/TASK_REPORT_1481.md`

---

## Backlog

| ID | Title | Priority | Notes |
|----|-------|----------|-------|

---

