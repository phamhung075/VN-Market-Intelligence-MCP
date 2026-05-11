# Task Report 1470 — compact
date: 2026-04-19
outcome: APPROVED

changed:
- src/__tests__/1322-evening-summary-news-count.test.ts:178, 195 — getPnlFn: async () => null added
- src/__tests__/1370-france-watchlist-movers.test.ts:161, 195, 233, 281 — getPnlFn: async () => null added

bun test (targeted 1322+1370): 8 pass / 0 fail
bun test (full suite): 5519 pass / 29 fail (29 pre-existing, same count on parent commit ef5e121)
tsc: 0 errors
ddd: PASS (test files, not domain layer)
security: process.env usage pre-existing test-isolation pattern, not introduced by task
no-such-table warn: absent from 1322 + 1370 test output — suppression confirmed

verdict: APPROVED
merge_commit: 38eda25
