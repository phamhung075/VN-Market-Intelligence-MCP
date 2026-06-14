## Task Report T3-ARCH-CRON-WATCHDOG

changed:
- apps/mcp-server/src/scheduler/system/schedulerWatchdogJob.ts (new file — 55ea2ccf orig; 9a7e1aef key fix)
- apps/mcp-server/src/__tests__/ARCH-CRON-watchdog.test.ts (9a7e1aef WD-10; 153f2e82 WD-11)

tests: 18 pass / 0 fail (bun test ./src/__tests__/ARCH-CRON-watchdog.test.ts --no-cache, 220ms) | tsc: 0 errors (bunx tsc --noEmit, exit 0) | ddd: PASS | security: PASS
live: 3-job freshness CONFIRMED under corrected keys | never-ran alert string: EMPTY (decisive proof)
verdict: APPROVED

### QA cycle-269 · 2026-06-14 · T3-ARCH-CRON-WATCHDOG

**Commit chain:** 55ea2ccf (orig) → 9a7e1aef (A: 3 manifest keys) → 153f2e82 (B: WD-11 source-derived guard)

#### G1 — CODE: 3 manifest keys match call-site literals (INDEPENDENT RAW READ)

- `'ohlcv-daily-aggregator'` → startScheduler.ts:631 `jobRunRepo.wrapRun('ohlcv-daily-aggregator', ...)`. MATCH.
- `'foreignFlowAlertJob'` → market-data/foreignFlowAlertJob.ts:314 `recordJobRun(database, "foreignFlowAlertJob", ...)`. MATCH.
- `'ta-ohlcv-backfill'` → startScheduler.ts:664 `jobRunRepo.wrapRun('ta-ohlcv-backfill', ...)`. MATCH.

#### G2 — WD-11 mechanism (153f2e82): NOT a tautology

WD-11 reads real registration source files via `readFileSync` (startScheduler.ts, startupHelpers.ts, summaryJobs.ts, foreignFlowAlertJob.ts, insiderCheckJob.ts, calibrationReportJob.ts, vnstockFundamentalsJob.ts), extracts wrapRun/recordJobRun string-literal args with regex, resolves 2 indirections (JOB_NAME_FUNDAMENTALS const; summaryJob:daily template), then asserts every WATCHDOG_MANIFEST key is in the derived set. B3 fail-loud proof documented in commit: flip wrapRun literal at call site → WD-11 RED; WD-10 stays GREEN confirming WD-10 tautology is sealed by WD-11.

#### G3 — TSC

`cd apps/mcp-server && bunx tsc --noEmit` → exit 0, 0 errors. GREEN.

#### G4 — TEST SUITE

`bun test ./src/__tests__/ARCH-CRON-watchdog.test.ts --no-cache` → 18 pass / 0 fail / 45 expect() / 220ms. All 18 tests including WD-11. GREEN.

Note: test file is at `apps/mcp-server/src/__tests__/ARCH-CRON-watchdog.test.ts` (not `src/scheduler/system/__tests__/` as in task spec; path in spec is off but file exists and passes correctly).

#### G5 — LIVE: freshness (keinos/sqlite3 sidecar vs named volume /app/data/market.db)

Container: 5c163c6b3e78 (Up 10 minutes, healthy)

```
foreignFlowAlertJob|2026-06-12 08:13:00
ohlcv-daily-aggregator|2026-06-14 14:30:01
ta-ohlcv-backfill|2026-06-14 14:30:10
```

All 3 return rows under corrected keys. PASS.

#### G6 — DECISIVE: never-ran alert string absent

`docker logs --since 1h <CID> | grep "has never run — scheduler registration may be missing"` → EMPTY (zero output). False never-ran class eliminated. PASS.

#### G7 — PEERS / STARTUP

- 13 peers Up/healthy (11 project services + headroom-proxy + mcp-gateway). PASS.
- Startup 14:25:49Z: `82 cron keys in CRONS map ... scheduler-watchdog active`. PASS.
- `docker logs | grep "Cannot convert a symbol"` → EMPTY. No Bun-JIT corruption. PASS.
- Watchdog first fire: `[2026-06-14T14:30:16.310Z] checked=16 alerted=8 healed=2`. PASS.

#### G8 — DDD PASS

schedulerWatchdogJob.ts: only `bun:sqlite` type + deferred runtime dynamic imports (infrastructure). No domain imports. System/ subfolder pattern correct.

#### G9 — SECURITY PASS

No process.env, no secrets, SQL parameterized (`prepare<>([string]).get(jobName)`), no shell injection.

#### G10 — Genuine stale alerts enumerated (for PO spin-out — NOT T3 regressions)

From watchdog at 14:30:16Z (all 3 target jobs confirmed absent from alert path):

| job_name | last_run | genuine stale reason |
|---|---|---|
| `baseRateComputationJob` | 2026-05-24 | ~20.8d > 9.1d threshold — KNOWN-REAL (cited in task spec) |
| `morningBriefingJob` | 2026-06-12 | ~61.5h > 36h — weekday-only job; architect TODO flagged in manifest |
| `franceSummaryJob` | 2026-06-12 | ~56.5h > 36h — weekday-only job; architect TODO flagged |
| `eveningSummaryJob` | 2026-06-12 | ~45.6h > 36h — weekday-only job; architect TODO flagged |
| `foreignFlowAlertJob` | 2026-06-12 | ~54.3h > 36h — weekend market-closed gap (correct alert) |

Additional alerted/healed entries (healed=2 = ohlcv-daily-aggregator + ta-ohlcv-backfill self-heal on first-boot; 3 further alerts likely first-boot never-ran for reputationComputeJob/evidenceAccumulatorJob/other self-heal jobs before their initial run completed within the same tick). None are regressions.

PO spin-out: baseRateComputationJob (P2 task), weekday-aware threshold for 3 summary/briefing jobs (architect brief §weekday-TODO already documented in manifest source).
