# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 072 — BCTC Pipeline Fix + test hygiene

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| REQ-072 | Requirements: BCTC financial_reports empty bug | BA | docs | — | — | Done |
| 1181 | TDD red: failing test for financial_reports persistence | Dev | test | — | — | Done |
| 1182 | Fix storeReport error propagation + WAL checkpoint | Dev | application | 1181 ✓ | task/1182-bctc-pipeline-fix | Review |
| 1183 | Fix 308-tool-registry.test.ts count 57 → 59 | Dev | test | — | — | Done |
| 1184 | project-stats.json sprint 72 advance + QA smoke | Dev | docs | 1182, 1183 | — | Backlog |

**WIP:** 0 In Progress. 1 Review.

---

## Task Details (active tasks only — Done tasks archived)

### 1181 — TDD red: failing test for financial_reports persistence

**Status:** In Progress | **Branch:** task/1181-bctc-persist-test | **Layer:** test
**Spec:** docs/TECH_072.md § Integration Test Design

Files to create: `src/__tests__/1181-financial-reports-persist.test.ts`
Files to read first: `src/application/usecases/parseBctcReport.ts`, `src/infrastructure/db/schema.ts`

**Given** a clean `:memory:` DB with `initDatabase()` run inside the test body
**When** `fetchParseAndStoreBctc({ actionCode:"VNM", year:2025, quarter:"Q4", pdfTextOverride: MINIMAL_FIXTURE })` is called
**Then**
- `result` is not null
- `SELECT COUNT(*) FROM financial_reports WHERE action_code='VNM'` returns 1
- Test fails RED on current codebase (before task 1182 is applied)
- `closeDb()` called in `afterEach`; `DB_PATH` restored in `afterAll`

MINIMAL_FIXTURE must contain: `Tổng tài sản`, `Doanh thu`, `Lưu chuyển tiền thuần`, `1.234.567`

### 1182 — Fix storeReport error propagation + WAL checkpoint

**Status:** Todo (unblocked after 1181 merges) | **Branch:** task/1182-bctc-persist-fix | **Layer:** application
**Spec:** docs/TECH_072.md § Modified behaviour in parseBctcReport — Step 7

Files to modify: `src/application/usecases/parseBctcReport.ts` (lines 441-443)
Files to read first: `src/infrastructure/db/schema.ts` (getDb, closeDb exports), `src/infrastructure/db/checkpoint.ts`

**Given** `parseBctcReport.ts` lines 441-443 contain the bare `storeReport` call
**When** the hardened replacement from TECH_072.md is applied
**Then**
- `storeReport` errors propagate as `"storeReport failed: <msg>"` instead of being swallowed
- `db.exec("PRAGMA wal_checkpoint(PASSIVE)")` runs after successful store, guarded by `dbPath !== ':memory:'`
- `import { logger } from "../../infrastructure/logger.js"` added to the file
- Task 1181 test turns GREEN
- `bun test && bun tsc --noEmit` pass with 0 errors

### 1183 — Fix 308-tool-registry.test.ts count 57 → 59

**Status:** In Progress | **Branch:** task/1183-registry-count-fix | **Layer:** test
**Spec:** docs/TECH_072.md § 308 Tool Registry Fix Design

File to modify: `src/__tests__/308-tool-registry.test.ts`

**Given** lines 48 and 61 reference count 57
**When** the file is updated per TECH_072 exact changes
**Then**
- Line 48 description reads "59 entries"
- Line 61 asserts `.toBe(59)`
- Comment chain ends with: `57 + registerMarketMessageTools (task 1166) = 58` / `58 + registerTickerIntelligenceTools (task 1180) = 59`
- `bun test 308-tool-registry.test.ts` passes GREEN

### 1184 — project-stats.json sprint 72 advance + QA smoke

**Status:** Backlog (blocked on 1182+1183) | **Layer:** docs/data
Verify `currentSprint=72`, `toolCount=96`. Run `bun test && bun tsc --noEmit`. Write `reports/TASK_REPORT_072.md`.
