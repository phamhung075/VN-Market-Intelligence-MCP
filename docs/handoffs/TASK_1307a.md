# TASK 1307a — Macro alert thresholds: cooldown bypass + briefing direction label

## TLDR

**Branch**: main (direct)
**Change**: 1 line fix in intelligenceCycleJob.ts + 8 new tests
**Status**: Ready for QA

---

## Root Cause Summary

| Bug | File | Line | Issue |
|-----|------|------|-------|
| Cooldown bypass | `intelligenceCycleJob.ts` | 630 | `AND notified_telegram=1` caused level-drift rows (extreme→high, new id, notified=0) to bypass dedup → 5 alerts/hour |
| Direction label | `macroThresholds.ts` | 158 | Already fixed (LEVEL_VI_BELOW used correctly). Tests 1269/1326 pass. |
| Briefing template | `morningBriefingJob.ts` | 144-149 | Already correct — renders `m.status` from `dev.summary`, not hardcoded string |
| Min abs deviation | `macroThresholds.ts` | 137 | Already present (10 VND guard). Existing tests 1270 pass. |

Only the cooldown bypass required a code change.

---

## [Developer] Implementation Record

files_actually_modified:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/news-analysis/intelligenceCycleJob.ts`
  - Line 630: removed `AND notified_telegram = 1` from alreadySentToday query
  - Comment updated: "already SENT today" → "already STORED today" + explains rationale

tests_written:
- `src/__tests__/1307a-macro-thresholds.test.ts` — 8 assertions, all GREEN

tests_skipped: []

tsc_clean: true
full_suite_pass: true (15 pre-existing failures unchanged, 0 new)

---

## Verification

```
bun test src/__tests__/1307a-macro-thresholds.test.ts
# 8 pass, 0 fail

bun tsc --noEmit
# 0 errors
```
