# Task Report: 1404 — test(alert-diacritics): RED test

date: 2026-04-18
outcome: APPROVED (Task 1404 scope only)

## Scope Clarification

User requested review of "tasks 1404 and 1405". Task 1405 (fix) is still **Todo** — not implemented on this branch. This report covers Task 1404 only. Verification items (2)(3)(4) from the review request require 1405 to be complete and are blocked pending that work.

## Test Results

| Check | Result |
|-------|--------|
| `src/__tests__/1404-alert-diacritics-conviction.test.ts` exists | PASS |
| 4 assertions RED (expected — diacritics bug not yet fixed) | PASS (intentional RED) |
| No regressions in rest of suite | PASS |
| Full suite: 5048 pass / 4 fail | PASS (4 fails = task 1404 RED tests only) |
| TypeScript `bun tsc --noEmit` | PASS — 0 errors |

## Acceptance Criteria Status

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `src/__tests__/1404-alert-diacritics-conviction.test.ts` exists + 4 assertions | PASS |
| 2 | `convictionScorer.ts` LEVEL_VI labels use proper diacritics | BLOCKED (task 1405 not done) |
| 3 | `convictionScorer.ts` summary template phrases are accented | BLOCKED (task 1405 not done) |
| 4 | `technicalIndicatorTools.ts:235` phrase fully accented | BLOCKED (task 1405 not done) |
| 5 | `bun tsc --noEmit` clean | PASS |
| 6 | Full `bun test` passes with 0 new failures | PASS (4 known RED from 1404) |

## Current State (convictionScorer.ts)

`LEVEL_VI` at lines 126-131: UNACCENTED (bug, intentionally unfixed until 1405):
- `conviction: "XAC TIN CAO"` — should be `"Xác tín cao"`
- `strong: "Kha chac chan"` — should be `"Khá chắc chắn"`
- `moderate: "Hon hop"` — should be `"Hỗn hợp"`
- `weak: "Tin hieu yeu/mau thuan"` — should be `"Tín hiệu yếu/mâu thuẫn"`

Summary template lines 334-338: UNACCENTED (same bug).

`technicalIndicatorTools.ts:235` phrase `"can than — co the xem xet chot loi hoac cho them xac nhan"` — should be accented (1405 scope).

## DDD Compliance: PASS

`src/domain/services/convictionScorer.ts` — zero imports from `infrastructure/` or `application/`.
`src/interface/mcp/tools/technicalIndicatorTools.ts` — imports `infrastructure/logger.js` (valid: interface layer).

## Security: PASS

No `process.env` usage in modified files. No hardcoded credentials.

## Issues Found

### Blocking (for overall 1404+1405 sign-off)

- `convictionScorer.ts:127-130` — LEVEL_VI uses unaccented strings. Fix in task 1405.
- `convictionScorer.ts:334-338` — summary template unaccented. Fix in task 1405.
- `technicalIndicatorTools.ts:235` — phrase unaccented. Fix in task 1405.

### Non-Blocking

None.

## Task 1404 Verdict

Task 1404 (RED test creation) is **complete and correct**:
- Test file exists at correct path.
- 4 tests are meaningfully RED — they assert the accented forms that the current buggy code cannot produce.
- Level assertions (`expect(result.level).toBe(...)`) all pass — scoring logic unaffected.
- No regressions introduced (0 new failures outside 1404 suite).
- TSC clean.

## Merge Status

Task 1404 branch should NOT merge to main yet — wait for Task 1405 (fix) to be implemented on this same branch, then re-run QA for final APPROVED+merge.

---

### Fix — 2026-04-18
- **Issue**: 1404-01 — LEVEL_VI unaccented labels
- **Root cause**: `LEVEL_VI` map at convictionScorer.ts:127-130 used bare ASCII; summary template lines 334-338 also unaccented; technicalIndicatorTools.ts:235 phrase unaccented
- **Fix**:
  - `convictionScorer.ts:127-130` — `"XAC TIN CAO"` → `"Xác tín cao"`, `"Kha chac chan"` → `"Khá chắc chắn"`, `"Hon hop"` → `"Hỗn hợp"`, `"Tin hieu yeu/mau thuan"` → `"Tín hiệu yếu/mâu thuẫn"`
  - `convictionScorer.ts:334-338` — summary template phrases accented
  - `technicalIndicatorTools.ts:235` — verdict/phrase strings fully accented
- **Tests added**: None (existing 1404 suite now GREEN)
- **Verified**: `bun test src/__tests__/1404-alert-diacritics-conviction.test.ts` → 4/4 PASS | `bun tsc --noEmit` → 0 errors

---

## [QA] Re-Review Record — 2026-04-18 (post-fixer pass)

verdict: CHANGES_REQUESTED

| Check | Result |
|-------|--------|
| (1) `1404-alert-diacritics-conviction.test.ts` — 4/4 GREEN | PASS |
| (2) `convictionScorer.ts` LEVEL_VI accented | PASS — lines 127-130 confirmed |
| (3) `convictionScorer.ts` summary template accented | PASS — lines 335-338 confirmed |
| (4) `technicalIndicatorTools.ts:235` phrase accented | PASS — `"cẩn thận — có thể xem xét chốt lời hoặc chờ thêm xác nhận"` |
| (5) `bun tsc --noEmit` | PASS — 0 errors |
| (6) Full `bun test` 0 new failures vs main | FAIL — 1 regression |

blocking_issues:
- `src/__tests__/1302-technical-indicators.test.ts:421` — asserts `"Ket luan:"` (unaccented) but source now outputs `"Kết luận:"` after fixer accented `technicalIndicatorTools.ts:241`. Fixer updated the source but did not update the 1302 test to match.

non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1404-alert-diacritics-conviction.test.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/convictionScorer.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/technicalIndicatorTools.ts

merge_commit: TBD (fill after merge)

---

## [QA] Final Review — 2026-04-18 (all checks GREEN)

verdict: APPROVED

| Check | Result |
|-------|--------|
| (1) `1404-alert-diacritics-conviction.test.ts` — 4/4 GREEN | PASS |
| (2) `1302-technical-indicators.test.ts:421` expects `"Kết luận:"` | PASS |
| (3) Full `bun test` — 5052 pass, 0 fail, 21 skip | PASS |
| (4) `bun tsc --noEmit` | PASS — 0 errors |

blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1404-alert-diacritics-conviction.test.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1302-technical-indicators.test.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/convictionScorer.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/technicalIndicatorTools.ts

merge_commit: TBD (fill after merge)
