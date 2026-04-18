# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 146 — COMPLETE (2026-04-18)

> Spec: `docs/REQ_1412.md` | Tech: `docs/TECH_1412.md` (APPROVED_BY_ARCHITECT) | Goal: fix unaccented Vietnamese in scheduler + domain + application layers (8 files)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1412 | test(diacritics-wave3): RED test — scheduler + domain + application layer diacritics | Done | Dev |
| 1413 | fix(diacritics-wave3): replace all unaccented Vietnamese in 8 files | Done | Dev |

---

## Sprint 145 — COMPLETE (2026-04-18)

> Spec: `docs/REQ_1410.md` | Tech: `docs/TECH_1410.md` (APPROVED_BY_ARCHITECT)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1410 | test(tool-diacritics-sweep): RED test — assert accented output from 24 tool files | Done | Dev |
| 1411 | fix(tool-diacritics-sweep): replace all unaccented Vietnamese strings in 24 files | Done | Dev |

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

### 1412 — test(diacritics-wave3): RED test — 28 files scheduler + domain + application

**Branch:** `task/1412-diacritics-wave3-red-test`
**Layer:** test
**Depends on:** nothing
**Blocks:** 1413 must wait for this to be RED + merged

**Files with unaccented Vietnamese to cover (28 total):**
- `src/scheduler/predictionMarketJob.ts:251,255` — "Loai tin hieu", "Phan tich"
- `src/scheduler/calibrationReportJob.ts:353` — "Xu huong"
- `src/application/usecases/getCrisisEarlyWarning.ts:133,149,154` — "Khong co tin hieu", "co phieu", "xu huong"
- `src/domain/services/sentimentTrend.ts:179-202` — "xu huong", "cam tinh", "on dinh"
- `src/domain/services/kinhDich/kinhDichFormatter.ts` — check for unaccented strings
- `src/domain/services/kinhDich/kinhDichReading.ts` — ASCII variant keys (intentional — skip lookup keys, fix display strings only)
- `src/domain/services/kinhDich/nguHanhClassifier.ts`
- `src/domain/services/decisionNoteSynthesizer.ts`
- 20 `src/interface/mcp/tools/` files: `alertAccuracy.ts`, `alertMuteTools.ts`, `changelogTools.ts`, `climateTools.ts`, `compareTools.ts`, `correlationTools.ts`, `creditFlowTools.ts`, `dataFreshnessTools.ts`, `earningsCalendarTools.ts`, `energyTools.ts`, `kinhDichTools.ts`, `leadershipTools.ts`, `performanceTools.ts`, `pharmaTools.ts`, `portfolioTools.ts`, `sentimentTrendTools.ts`, `supplyChainTools.ts`, `telegramReportTools.ts`, `targetAllocationTools.ts`, `watchlist.ts`

**Acceptance Criteria:**
- 28+ cases FAIL (RED) — string assertions fail on unaccented text
- `bun tsc --noEmit` clean
- Sprint 144+145 regression cases PASS

---

### 1413 — fix(diacritics-wave3): 28 files string fix

**Branch:** `task/1413-diacritics-wave3-fix`
**Layer:** scheduler, application, domain, interface
**Depends on:** 1412 RED + merged

**Files to modify:** 28 files listed in task 1412 details above

**Acceptance Criteria:**
- All 1412 test cases GREEN
- `bun tsc --noEmit` 0 errors
- `bun test` full suite 5090+ pass, 0 fail

---

### 1410 — test(tool-diacritics-sweep): RED test 24 files

context: docs/handoffs/TASK_1410.md

**Branch:** `task/1410-tool-diacritics-sweep-red-test`
**Layer:** test
**Depends on:** nothing
**Blocks:** 1411 must wait for this to be RED + merged

**Files to create:**
- NEW: `src/__tests__/1410-tool-diacritics-sweep.test.ts` — 24 RED test cases + 3 Sprint 144 regression

**Acceptance Criteria:**

**Given** test file written before task 1411 exports exist
**When** `bun test src/__tests__/1410-tool-diacritics-sweep.test.ts` runs
**Then**
- 24 cases FAIL (RED) — missing exports or failing string assertions
- 3 Sprint 144 regression cases PASS (GREEN)
- `bun tsc --noEmit` clean (use `@ts-expect-error` above not-yet-exported imports)

---

### 1411 — fix(tool-diacritics-sweep): 24 files string fix + export additions

context: docs/handoffs/TASK_1411.md

**Branch:** `task/1411-tool-diacritics-sweep-fix`
**Layer:** interface
**Depends on:** 1410 RED + merged first

**Files to modify:** 24 files in `src/interface/mcp/tools/` (see TECH_1410.md DDD Layer Plan)

**Acceptance Criteria:**

**Given** 1410 RED test merged; all 24 source files fixed per REQ-1410 inventory
**When** `bun test src/__tests__/1410-tool-diacritics-sweep.test.ts` runs
**Then**
- All 27 cases GREEN (24 new + 3 regression)
- `bun tsc --noEmit` 0 errors
- `bun test` full suite 5063+ pass, 0 fail

---

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
