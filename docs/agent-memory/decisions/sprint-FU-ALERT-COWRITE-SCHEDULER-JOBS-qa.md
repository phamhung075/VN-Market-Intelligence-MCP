# Decision Journal — FU-ALERT-COWRITE-SCHEDULER-JOBS

**task-id:** FU-ALERT-COWRITE-SCHEDULER-JOBS
**date:** 2026-06-19
**agent:** qa
**verdict:** CHANGES_REQUESTED

## What was considered

Production code (3 scheduler jobs + alertStore.ts + domain services):
- All 3 scheduler jobs (taAlertScanJob, bbAlertScanJob, foreignFlowAlertJob) correctly route through `storeAlerts([alert], database)` — no raw INSERT INTO alerts remains in any scheduler file.
- `storeAlerts` in `b3ea96fa` added `fingerprint` to the INSERT column list (13 columns total), correctly carrying `alert.fingerprint ?? null`.
- The fingerprint migration in `schema-alerts.ts:61` is sound: plain `ADD COLUMN TEXT` + partial UNIQUE INDEX WHERE fingerprint IS NOT NULL — deployable on named-volume DB (consistent with SQLite ADD COLUMN UNIQUE lesson).
- DDD: no imports from application/ or interface/ in scheduler files. Domain services (signalDetector, alertGenerator, legalRiskDetector) have zero infrastructure imports. PASS.
- Security: no process.env, no hardcoded secrets in modified files. SQL is parameterized. PASS.
- tsc: router confirmed exit 0. PASS.

1307-ta-alert-scan-job.test.ts: 17 pass / 0 fail. GREEN.
1309-bb-alert-scan-job.test.ts: 19 pass / 0 fail. GREEN.
1133-foreign-flow-alert-job.test.ts: 17 pass / 0 fail. GREEN.

Full suite: 13255 pass / 65 fail (1112 files, 13362 tests).

## Why CHANGES_REQUESTED

The fix correctly adds `fingerprint` to the `storeAlerts` INSERT. However, the fix commit `b3ea96fa` updated only `FIX-ALERT-ORPHAN-CORRELATION.test.ts` (via `f0ada9f4`) but **missed adding `fingerprint TEXT` to the DDL in multiple other test files** that call `storeAlerts`. All failures in this category produce `SQLiteError: table alerts has no column named fingerprint`.

Blocking regressions introduced by this fix:

1. `FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS.test.ts` — the new test file shipped with this fix. Its `buildTestDb()` creates a 9-column alerts table missing `sent_by`, `notified_telegram`, `confidence_score`, `validated_at`. When `storeAlerts` runs its 13-column INSERT, it throws `table alerts has no column named sent_by`. AC-1 through AC-6 all fail (5 failures; AC-5 and AC-7 pass because they don't call storeAlerts).

2. `FIX-CASCADE-MACRO-CARD-REAL-DETAIL.test.ts` — was green before `b3ea96fa`. Its DDL had `sent_by`/`notified_telegram` but no `fingerprint`. After the fix adds `fingerprint` to the INSERT, AC-14a through AC-14e fail with `table alerts has no column named fingerprint` (5 failures).

3. `103-job-market-scan.test.ts` — same pattern. DDL has `sent_by` but no `fingerprint`. 1 failure.

4. `1050-alert-dispatch-fixes.test.ts` — DDL has `sent_by` but no `fingerprint` in the correct location (fingerprint appears in comments, not DDL). 1 failure.

5. `1076-market-scan-noise-retirement.test.ts` — missing `fingerprint`. 1 failure.

Additional files likely affected (not individually run but flagged by grep): `064-alert-generator.test.ts`, `086-tool-alerts.test.ts`, `1526-push-prices-market-hours-guard.test.ts`, `153-ssc-scan-dedup.test.ts`, `290-check-ssc-quarter-derive.test.ts`.

## Pre-existing failures (NOT caused by this fix)

- `FIX-ALERT-ENGINE-RSI-SINGLEDIGIT.test.ts` AC-4 through AC-7: DDL missing `sent_by` since commit `d79314bb` (before this fix). Same root class but existed before.
- `1391-bb-stale-candle-skip.test.ts` AC-2: same pre-existing `sent_by` gap.
- Network-timeout failures (Task 1146, Task 083, FIX-B-2, Task 251, Task 1518 ~5000ms): live MCP connection, not present in CI.
- VPS proxy / logVpsPush failures: pre-existing schema drift unrelated to this fix.
- 1302-technical-indicators deprecated tests: pre-existing.

## Minimum fix required

Add `fingerprint TEXT` (no UNIQUE — the UNIQUE is on the index, not the column, per the pattern in `schema-alerts.ts`) to the alerts DDL in:

1. `src/__tests__/FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS.test.ts` — `buildTestDb()` alerts table must also add the full `storeAlerts` columns: `sent_by TEXT NOT NULL DEFAULT 'server'`, `notified_telegram INTEGER NOT NULL DEFAULT 0`, `confidence_score REAL`, `validated_at TEXT`. Without these, AC-1 through AC-6 cannot even reach the fingerprint dedup path.

2. `src/__tests__/FIX-CASCADE-MACRO-CARD-REAL-DETAIL.test.ts` — add `fingerprint TEXT` to alerts DDL.

3. `src/__tests__/103-job-market-scan.test.ts` — add `fingerprint TEXT` to alerts DDL.

4. `src/__tests__/1050-alert-dispatch-fixes.test.ts` — add `fingerprint TEXT` to alerts DDL (correct location in the CREATE TABLE block).

5. `src/__tests__/1076-market-scan-noise-retirement.test.ts` — add `fingerprint TEXT` to alerts DDL.

Sweep remaining storeAlerts test files for the same gap: `064-alert-generator.test.ts`, `086-tool-alerts.test.ts`, `1526-push-prices-market-hours-guard.test.ts`, `153-ssc-scan-dedup.test.ts`, `290-check-ssc-quarter-derive.test.ts`.
