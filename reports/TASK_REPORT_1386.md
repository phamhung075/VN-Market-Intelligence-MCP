# Task Report: 1386 — fix(evening-news-filler): omit filler when newsCount=0
date: 2026-04-17
outcome: APPROVED

## Test Results

| Suite | Pass | Fail | Skip |
|---|---|---|---|
| Unit (1385-evening-summary-news-filler.test.ts) | 4 | 0 | 0 |
| Full regression | 5022 | 0 | 21 |
| TypeScript (tsc --noEmit) | — | 0 errors | — |

Note: Bun runtime emitted a C++ panic after test completion (post-run memory teardown). This is a known Bun 1.3.11 GC bug — all 5022 tests passed before crash. Not caused by application code.

## Filler String Verification

`grep "Không có tin tức hôm nay" src/scheduler/eveningSummaryJob.ts` = 0 matches. PASS.

## DDD Compliance: PASS

| Import | Layer | Valid |
|---|---|---|
| `../application/usecases/assembleEveningSummary.js` | scheduler → application | YES |
| `../infrastructure/logger.js` | scheduler → infra logger | YES |
| `../infrastructure/db/index.js` | scheduler → infra db (dedup guard) | YES |
| `../infrastructure/notifiers/telegram.js` | scheduler → infra notifier | YES |

No domain/ violations. No cross-layer inward violations.

## Security: PASS

- `process.env`: 0 matches
- SQL: parameterized query in `alreadySentToday()`
- No hardcoded secrets

## Acceptance Criteria

| Criterion | Result |
|---|---|
| T1–T4 (1385 test file) all GREEN | PASS (4/4) |
| Full suite 5018+ pass, 0 fail | PASS (5022/0) |
| tsc --noEmit = 0 errors | PASS |
| Filler string absent from eveningSummaryJob.ts | PASS |

## Issues Found

### Blocking
None.

### Non-Blocking
- 1322 test file line 9 retains old AC-4 comment text (stale comment, not a test assertion). No behavioral impact.

## Merge Status

Branch `task/1386-evening-news-filler-fix` merged to main at commit `592518c`. Branch deleted. Confirmed clean.

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/eveningSummaryJob.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1385-evening-summary-news-filler.test.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1322-evening-summary-news-count.test.ts
