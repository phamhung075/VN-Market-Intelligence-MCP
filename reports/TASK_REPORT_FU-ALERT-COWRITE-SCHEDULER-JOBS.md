## Task Report FU-ALERT-COWRITE-SCHEDULER-JOBS
date: 2026-06-19
outcome: CHANGES_REQUESTED

## Test Results
- 1307-ta-alert-scan-job.test.ts: 17 pass / 0 fail
- 1309-bb-alert-scan-job.test.ts: 19 pass / 0 fail
- 1133-foreign-flow-alert-job.test.ts: 17 pass / 0 fail
- FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS.test.ts: 2 pass / 5 fail
- Full suite: 13255 pass / 65 fail (1112 files) | exit code 0 (Bun post-run JIT panic known class)
- TypeScript: 0 errors (router-confirmed)

## DDD Compliance: PASS
No application/ or interface/ imports in scheduler files.
Domain services (signalDetector, alertGenerator, legalRiskDetector) have zero infrastructure imports.

## Security: PASS
No process.env, no hardcoded secrets. All SQL uses parameterized queries.

## Issues Found

### Blocking
1. `src/__tests__/FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS.test.ts:65–77` — `buildTestDb()` alerts DDL missing `sent_by TEXT NOT NULL DEFAULT 'server'`, `notified_telegram INTEGER NOT NULL DEFAULT 0`, `confidence_score REAL`, `validated_at TEXT`. `storeAlerts` 13-column INSERT throws `table alerts has no column named sent_by`. AC-1, AC-2, AC-3, AC-4, AC-6 all fail (5 regressions introduced by this commit).

2. `src/__tests__/FIX-CASCADE-MACRO-CARD-REAL-DETAIL.test.ts` alerts DDL — missing `fingerprint TEXT` after `b3ea96fa` added it to `storeAlerts` INSERT. Was green before this fix. Throws `table alerts has no column named fingerprint`. AC-14a through AC-14e fail (5 regressions).

3. `src/__tests__/103-job-market-scan.test.ts:75–91` — alerts DDL missing `fingerprint TEXT`. `storeAlerts` INSERT throws `table alerts has no column named fingerprint`. 1 regression.

4. `src/__tests__/1050-alert-dispatch-fixes.test.ts` — alerts DDL missing `fingerprint TEXT`. 1 regression.

5. `src/__tests__/1076-market-scan-noise-retirement.test.ts` — alerts DDL missing `fingerprint TEXT`. 1 regression.

### Sweep required (not individually run but identified by grep)
- `src/__tests__/064-alert-generator.test.ts` — missing `fingerprint` in DDL
- `src/__tests__/086-tool-alerts.test.ts` — missing `fingerprint` in DDL
- `src/__tests__/1526-push-prices-market-hours-guard.test.ts` — missing `fingerprint` in DDL
- `src/__tests__/153-ssc-scan-dedup.test.ts` — missing `fingerprint` in DDL
- `src/__tests__/290-check-ssc-quarter-derive.test.ts` — missing `fingerprint` in DDL

### Non-Blocking (pre-existing, disjoint from this fix)
- `FIX-ALERT-ENGINE-RSI-SINGLEDIGIT.test.ts` AC-4..AC-7: missing `sent_by` in DDL since `d79314bb` — pre-existing.
- `1391-bb-stale-candle-skip.test.ts` AC-2: same pre-existing gap.
- Network timeouts (~5000ms): Task 1146, Task 083, FIX-B-2, Task 251, Task 1518 — live MCP, not CI.
- VPS proxy / vps_push_log failures: pre-existing schema drift.
- 1302 deprecated tests: pre-existing.

## Merge Status
BLOCKED — fixer must add `fingerprint TEXT` (and missing columns in the new test file) to all alerts DDLs in the affected test files before re-QA.
