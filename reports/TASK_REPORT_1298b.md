# Task Report 1298b — compact (GREEN phase: IMF Fetcher/Poller infra tests)
date: 2026-04-24
outcome: APPROVED

changed:
- src/__tests__/1298b-imf-infra.test.ts (NEW, 221 lines, 11 assertions)
- docs/data/cron-registry.json:47 (imf_indicator_poller entry added)

bun test (task): 11 pass / 0 fail
bun test (full suite): 6621 pass / 14 fail (14 pre-existing; main baseline 6594/14 — branch net +27 pass)
tsc: 0 errors
ddd: PASS (test file imports application+infrastructure as expected for infra-layer tests)
security: PASS (no process.env, no string-interpolated SQL in imfDataFetcher.ts)

## Coverage map

| AC | Test | Status |
|----|------|--------|
| AC-4 DB roundtrip | store+retrieve correct value | PASS |
| AC-4 upsert | second write overwrites | PASS |
| AC-4 shape | field types + source enum | PASS |
| AC-4 confidence penalty | factor 0.8: 0.90→0.72 | PASS |
| AC-4 CB fallback | fetchLatestImfIndicators never throws | PASS |
| AC-4 SQL injection | no template-literal or concat SQL | PASS |
| AC-5 cron wiring | jobs.ts CRONS map: imfIndicatorPoller + "0 */6 * * *" | PASS |
| AC-5 registry JSON | id, schedule, timeoutMs=30000, enabled=true | PASS |
| AC-5 poller shape | returns {success, indicator_count} | PASS |
| AC-5 success path | indicator_count >= 0 + sentiment defined | PASS |
| AC-5 failure path | {success:false, error:string, indicator_count:0} | PASS |

## Notes

- Brownfield correction in test: handoff referenced `src/scheduler/cron-registry.ts` (does not exist).
  Developer adapted AC-5 to read `src/scheduler/jobs.ts` (CRONS map) + `docs/data/cron-registry.json`. Correct.
- 14 suite failures pre-existing (identical count on main).
- Live network test: poller ran 3x, succeeded ("5 indicators stored"). CB fallback path exercised via "no-throw" assertion.

## Previous TASK_REPORT_1298b content (earlier review cycle)

See git history for prior report content (allStale guard review, 2026-04-23).

verdict: APPROVED
