# Task Report 1524 — compact
changed:
- src/application/usecases/assembleBriefing.ts (Step 19: commodity_prices query + globalSnapshot in return)
- src/scheduler/morningBriefingJob.ts:55-61 (VIX/DXY toFixed(2), S&P500/HangSeng Math.round)
- src/__tests__/1511-morning-briefing-global-snapshot.test.ts (setupDb expanded, AC-1 rewritten)

bun test (1511): 5 pass / 0 fail
bun test (1513): 10 pass / 0 fail
bun test (full): 5771 pass / 1 fail (pre-existing: 125-e2e briefing.alerts empty-DB assertion — unrelated)
baseline: 5767 → 5771 (+4 pre-existing failures now GREEN: 1511 AC-1/AC-2/AC-3 + 1513 AC-3)
tsc: 0 errors
ddd: PASS (application importing infrastructure = correct direction)
security: PASS (no process.env, parameterized queries)
merge_commit: 48ee4a7

verdict: APPROVED
