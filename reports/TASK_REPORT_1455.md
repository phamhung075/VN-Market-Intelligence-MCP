# Task Report 1455 — compact

changed:
- src/scheduler/franceSummaryJob.ts:465 — VNINDEX WHERE + freshness guard
- src/scheduler/franceSummaryJob.ts:507 — portfolio price WHERE + freshness guard
- src/__tests__/1455-france-summary-market-prices-freshness.test.ts — 4 new assertions

bun test: 5536 pass / 0 fail (baseline 5532 + 4 new)
tsc: 0 errors
ddd: PASS — scheduler imports infrastructure + application (permitted inward)
freshness guards: CONFIRMED at lines 465 + 507
stale VNINDEX (>3d) → vnIndex null: CONFIRMED by test 1455(a)
merge_commit: dd17f9c

verdict: APPROVED
