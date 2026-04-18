# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 148 — IN PROGRESS

> Spec: `docs/REQ_1416.md` | Tech: `docs/TECH_1416.md` (APPROVED_BY_ARCHITECT) | Goal: fix(diacritics-wave5): 12 interface/mcp/tools + 1 domain/services

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1416 | test(diacritics-wave5): RED test — 12 interface tools + 1 domain service | Review | Dev |
| 1417 | fix(diacritics-wave5): replace 118 unaccented strings + update 5 legacy test files | Review | Dev |

---

## Backlog

| ID | Title | Priority | Notes |
|----|-------|----------|-------|

---

## Task Details

### 1416 — test(diacritics-wave5): RED test

context: docs/handoffs/TASK_1416.md

**Branch:** `task/1416-diacritics-wave5-red-test`
**Layer:** test
**Depends on:** nothing
**Blocks:** 1417 must wait for this to be RED + merged

**Acceptance Criteria:**
- Given `src/__tests__/1416-diacritics-wave5.test.ts` written before 1417 fixes applied
- When `bun test src/__tests__/1416-diacritics-wave5.test.ts` runs
- Then: Group A direct-call cases fail (unaccented return values); Group B source-scan cases fail (no accented strings found); `bun tsc --noEmit` clean; Sprint 144–147 regression cases PASS

---

### 1417 — fix(diacritics-wave5): 118 string replacements + 5 legacy test updates

context: docs/handoffs/TASK_1417.md

**Branch:** `task/1417-diacritics-wave5-fix`
**Layer:** interface, domain
**Depends on:** 1416 RED + merged

**Files to modify:** 12 `src/interface/mcp/tools/` files + `src/domain/services/stockSearch.ts` (see TECH_1416.md DDD Layer Plan)
**Legacy tests to update:** `185-data-freshness.test.ts`, `1208-price-freshness-vps-push.test.ts`, `1293-data-freshness-label.test.ts`, `210-source-health.test.ts`, `1302-technical-indicators.test.ts`

**Acceptance Criteria:**
- All 1416 test cases GREEN
- 5 legacy test files updated (unaccented assertions replaced with accented)
- `bun tsc --noEmit` 0 errors
- `bun test` full suite passes, 0 fail
