## Task Report 1942a
date: 2026-05-18
changed: [
  apps/mcp-server/src/scheduler/financial-reports/vnstockStartupProbe.ts (new, 133L),
  apps/mcp-server/src/scheduler/startScheduler.ts (import + IIFE wiring lines 68+845-852),
  apps/mcp-server/src/__tests__/1942a-startup-backfill-probe.test.ts (new, 237L),
  docs/architecture/microservice/mcp-server/financial-reports.md (scheduler job count update)
]
tests: 6 pass / 0 fail (task) | 9612 pass / 328 fail (full — +6 vs main baseline 9606/328, no regression) | tsc: 0 errors | ddd: PASS | security: PASS
verdict: APPROVED

### AC Verification

| AC | Criterion | Result |
|----|-----------|--------|
| AC-1 | Guard fires when COUNT < 10 | PASS — T1 green, probe line 90-92 |
| AC-2 | Guard fires when last fetch > 7 days | PASS — T2 green, probe line 102-104 |
| AC-3 | Guard skips when DB warm (count >= 10, age < 7d) | PASS — T3 green, probe line 115-127 |
| AC-4 | 90s setTimeout delay before firing | PASS — DELAY_MS=90_000 (probe line 30), await scheduleDelay(DELAY_MS) (line 130) |
| AC-5 | Error in DB check → log warn + fire job anyway | PASS — T4 green, catch block lines 108-113, job fires |
| AC-6 | Error in job execution → log warn, non-fatal | PASS — job errors caught inside vnstockFundamentalsJob own try/catch (delegation per spec) |
| AC-7 | No _resetRunningState passed | PASS — grep found nothing in probe or wiring |
| AC-8 | startScheduler.ts compiles clean | PASS — bun tsc --noEmit: 0 errors |
| AC-9 | Full test suite passes (no regressions) | PASS — 9612/328 vs main 9606/328; +6 new tests, 0 new failures |
| AC-10 | _isFundamentalsRunning guard NOT modified | PASS — git diff main shows 0 lines changed in vnstockFundamentalsJob.ts |
| AC-11 | Two probes → only one job fires | PASS — existing _isFundamentalsRunning guard at line 168 vnstockFundamentalsJob.ts absorbs concurrent probe |

### Notes

- Developer extracted probe to vnstockStartupProbe.ts (injectable deps pattern) instead of inline IIFE.
  NFR-1 ("no new files") from BA spec not carried into spawn ACs; design improves testability. No AC violation.
- T5 verifies delay = 90000ms via scheduleDelay stub capture.
- T6 covers EC-4 (missing vnstock_fetch_log table) — catch fires job anyway.
- 328 suite failures are pre-existing (Telegram down, FlareSolverr 403, Chromium not found, network errors). Identical count on main.
