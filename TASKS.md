# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 144 — COMPLETE (2026-04-18)

> Spec: `docs/REQ_1408.md` | Tech: `docs/TECH_1408.md` (APPROVED_BY_ARCHITECT)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1408 | test(tool-diacritics): RED test — kinhDichTools + technicalIndicatorTools + supplyChainTools diacritics | Done | Dev |
| 1409 | fix(tool-diacritics): extract helpers + replace unaccented strings in three files | Done | Dev |

---

## Backlog

| ID | Title | Priority | Notes |
|----|-------|----------|-------|

---

## Task Details

### 1408 — test(tool-diacritics): RED test

context: docs/handoffs/TASK_1408.md

**Branch:** `task/1408-tool-diacritics-red-test`
**Layer:** test
**Depends on:** nothing

**Acceptance Criteria:**

**Given** `src/__tests__/1408-tool-diacritics.test.ts` written before 1409 exports exist
**When** `bun test src/__tests__/1408-tool-diacritics.test.ts` runs
**Then**
- All 5 cases FAIL (RED) — missing exports cause compile/import failure or string assertions fail
- `bun tsc --noEmit` clean (use `// @ts-expect-error` above missing-export imports if needed)
- No regressions from this file in full suite

---

### 1409 — fix(tool-diacritics): extract helpers + string fixes

context: docs/handoffs/TASK_1409.md

**Branch:** `task/1409-tool-diacritics-fix`
**Layer:** interface
**Depends on:** 1408 must be RED first

**Files to modify:**
- MODIFY: `src/interface/mcp/tools/kinhDichTools.ts` — extract + export `formatKinhDichTradingContext`; replace inline block lines 1031-1040
- MODIFY: `src/interface/mcp/tools/technicalIndicatorTools.ts` — 4 string fixes + add `export const formatTaIndicatorReport = formatReport`
- MODIFY: `src/interface/mcp/tools/supplyChainTools.ts` — 4 string fixes (lines 106, 115, 117, 119)

**Acceptance Criteria:**

**Given** 1408 RED test committed on its branch
**When** all three file edits applied and `bun test src/__tests__/1408-tool-diacritics.test.ts` runs
**Then**
- All 5 test cases GREEN
- `bun tsc --noEmit` 0 errors
- `bun test` full suite 5055+ pass, 0 fail

---
