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
> Sprints 240–240 archived: `docs/archive/sprints-240-240.md`

---

## Sprint 1269 — Macro Direction Label Hardcoding Bug Fix

| ID | Title | Status | Type | Notes |
|----|----|--------|------|-------|
| 1269a | RED: Test suite for direction-aware labels (failing assertions) | Done | Test | 6 pass / 0 fail — merged to main |
| 1269b | GREEN: Refactor classifyDeviation() with direction-aware labels | Done | Fix | Merged (3469439); TASK_REPORT_1269b.md approved |

**Problem:** Line 72 in macroThresholds.ts hardcodes "cao hơn TB" (above) in LEVEL_VI dict. When zScore=-1.65σ (BEARISH/below), label still says "cao hơn TB" — contradicts data direction.

**Solution:**
1. (1269a) Write 6 RED tests: elevated/high/extreme × above/below; TC-2,4,6 expose bug
2. (1269b) Line 158: `levelVi = direction === "below" ? LEVEL_VI_BELOW[level] : LEVEL_VI[level]`

**Files changed:** macroThresholds.ts (1 line) | **Tests:** +6 in 1269-macro-direction-label.test.ts

---

## Sprint 1275 — Push Foreign Flow UNIQUE Constraint Error

| ID | Title | Status | Type | Notes |
|----|----|--------|------|-------|
| 1275a | RED: Duplicate insert test cases for vnstock_trading_stats | Done | Test | 6 pass / 0 fail — merged to main |
| 1275b | GREEN: Add idempotent UNIQUE constraint + upsert fix | Done | Fix | Merged (529ac8a); TASK_REPORT_1275b.md approved |

**Problem:** Foreign flow fetch job fails with UNIQUE constraint violation on vnstock_trading_stats when inserting duplicate (code, date) pairs. Root cause: either the UNIQUE(code, date) constraint migration failed in production, or the ON CONFLICT clause can't find the constraint to match against.

**Solution:**
1. (1275a) Write 6 RED tests: verify constraint exists, test duplicate insert scenarios, validate migration
2. (1275b) Strengthen runVnstockMigrations() to validate constraint + throw on failure; add guard check in upsertForeignFlow() before attempting ON CONFLICT; improve diagnostic logging

**Files changed:** vnstockStore.ts (migrations + guard check), schema-financial-reports.ts (verify DDL) | **Tests:** +6 in 1275-foreign-flow-duplicate-constraint.test.ts

---

## Sprint 1276 — Macro Alert Cooldown 30-min Window Fix

| ID | Title | Status | Type | Notes |
|----|----|--------|------|-------|
| 1276a | RED: Macro cooldown bypass test (failing assertions) | Done | Test | 4 pass / 0 fail — merged to main |
| 1276b | GREEN: Fix cooldown + add logging | Done | Fix | Merged (9da9bd9); TASK_REPORT_1276b.md approved |

**Problem:** USD/VND macro alerts fired 5x in 65 min (every ~13min) despite 30-min cooldown. Root cause: lines 869–872 in intelligenceCycleJob.ts downgrade critical MACRO alerts to severity="high", bypassing the CRITICAL check in shouldSuppressAlert(), allowing every alert through.

**Solution:**
1. (1276a) Write 4 failing tests asserting macro cooldown suppression
2. (1276b) Remove severity downgrade, add MACRO exemption to CRITICAL bypass in alertCooldown.ts, add logging

**Files changed:** intelligenceCycleJob.ts, alertCooldown.ts | **Tests:** +4 in 1276-macro-cooldown-bypass.test.ts

---

## Sprint 1277 — Ops Agent Integration + OHLCV Guard Checks Formalization

| ID | Title | Status | Type | Notes |
|----|----|--------|------|-------|
| 1277a | RED: OHLCV guard checks test cases (6 TCs) | Done | Test | 3 pass / 3 fail (RED phase) — merged to main |
| 1277b | GREEN: Guard checks validation + Ops integration | Todo | Test | Verify 6 tests pass, Ops agent ready, update stats |

**Goal:** Formalize Ops Agent (already deployed) + OHLCV guard checks with comprehensive test coverage.

**Scope:**
- Ops agent docs: `.claude/agents/ops.md` ✓ (already merged, commit fb27186)
- OHLCV guard checks: `src/scheduler/market-data/ohlcvDailyAggregatorJob.ts:103–112` ✓ (already merged, commit ff55779)
- **New:** Test suite `src/__tests__/1277-ohlcv-guard-checks.test.ts` (6 test cases, TC-1 to TC-6)

**Acceptance Criteria:** All 6 tests pass, zero regressions, test baseline 6165 → 6171+, Ops agent verified

---

## Backlog

| ID | Title | Priority | Notes |
|----|-------|----------|-------|

---
