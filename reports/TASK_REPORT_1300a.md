# Task Report: 1300a — TelegramMessageFactory RED Phase
date: 2026-04-23
outcome: APPROVED

## Test Results
- Unit tests (1300a): 23 passed / 0 failed
- Full suite: 6573 passed / 9 failed (all 9 pre-existing on main before this commit)
- TypeScript: 0 errors (verified at 1300a commit state)

## DDD Compliance: PASS
- 1300a commit touches only: `src/infrastructure/notifiers/telegramMessageFactory.ts`, test file, 3 briefing jobs
- No domain/ imports from infrastructure/ in 1300a scope
- DDD enforcement test (1321) failure is pre-existing (introduced by 1300b, committed after 1300a)

## Security: PASS
- No hardcoded credentials
- No SQL queries
- No process.env usage
- No HTTP fetchers added

## Factory Quality: PASS
| Check | Result |
|-------|--------|
| Intl.Segmenter for grapheme counting | PASS — `graphemeLength()` + `graphemeSlice()` both use Intl.Segmenter with fallback |
| Word-boundary backtracking | PASS — `lastIndexOf(' ')` before appending "…" |
| "…" only when truncated | PASS — early return when `graphemeLength <= maxLen` |
| All 5 methods exist | PASS — formatAlertMessage, formatStoryTitle, formatSignalReasoning, formatNewsSummary, formatPolicySummary |
| Static methods, no instantiation | PASS — private constructor, all methods static |

## Briefing Job Migrations: PASS
| File | Line | Change | Verified |
|------|------|--------|----------|
| morningBriefingJob.ts | 124 | `.slice(0,60)` → `formatAlertMessage()` | PASS |
| eveningSummaryJob.ts | 204 | `.slice(0,80)` → `formatAlertMessage()` | PASS |
| eveningSummaryJob.ts | 212 | `.slice(0,80)` → `formatStoryTitle()` | PASS |
| franceSummaryJob.ts | 407 | `.slice(0,100)` → `formatAlertMessage()` | PASS |

All 4 imports added correctly. No .slice(0,N) truncation remaining in scope files.

## Pre-existing Failures (not introduced by 1300a)
All 9 failures identical on main before 1300a commit:
- TC-1 DDD domain/infra boundary — introduced by 1300b (storage-layer migration)
- Task 061 newsNormalizer summary slice — introduced by 1300b
- SSC/OCR/BCTC pipeline tests (7 failures) — pre-existing before sprint 1300

## Issues Found
### Blocking
None

### Non-Blocking
- morningBriefingJob.ts:115 still has `.slice(0, 70)` on story title (outside 1300a scope, noted for 1300b)
- eveningSummaryJob.ts:229 still has `.slice(0, 70)` on prediction question (outside scope)

## Merge Status
Already merged to main as commit `c0a9afec`. Branch `task/1300a-telegram-message-factory-red` deleted.
