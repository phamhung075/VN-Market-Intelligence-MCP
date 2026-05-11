# Task Report 1522 — compact

changed:
- src/scheduler/franceSummaryJob.ts:166-174 (COALESCE subquery replacing MAX(date))
- src/__tests__/1370-france-watchlist-movers.test.ts:285-335 (AC-5 added)

bun test: 5764 pass / 5 fail (5 pre-existing, unrelated to this task; baseline was 5763/5)
tsc: 0 errors
ddd: PASS (scheduler layer — infrastructure + application imports permitted)
security: PASS (no process.env)

verdict: APPROVED
merge_commit: 31337ed
