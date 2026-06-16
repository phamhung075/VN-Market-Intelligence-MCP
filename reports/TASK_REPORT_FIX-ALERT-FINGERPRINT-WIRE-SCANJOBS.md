## Task Report FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS
date: 2026-06-16
outcome: APPROVE-CODE (code + test quality scope only)

changed:
  - apps/mcp-server/src/infrastructure/db/schema-alerts.ts (fingerprint migration block ~lines 52-76 + CREATE TABLE line 32)
  - apps/mcp-server/src/__tests__/FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS.test.ts (new, AC-1..AC-7)

## Test Results (per-file isolation)

- FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS.test.ts: 7 pass / 0 fail (30 expect() calls)
- 1307-ta-alert-scan-job.test.ts: 9 pass / 0 fail
- 1309-bb-alert-scan-job.test.ts: 10 pass / 0 fail
- 1309c-alert-scan-parallel-job.test.ts + 002-db-schema.test.ts + 1378-composite-alert-dedup.test.ts: 34 pass / 0 fail
- Full CI per-file isolation: background run launched at report time — in progress

## TypeScript: 0 errors (bun tsc --noEmit exit 0)

## Schema file checks

- grep -c "TEXT UNIQUE" schema-alerts.ts: 0 (no illegal DDL left)
- Partial unique index: `CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_fingerprint ON alerts(fingerprint) WHERE fingerprint IS NOT NULL`
  - Placed OUTSIDE the try/catch loop (top-level of initAlertsTables) — will surface real failures
  - Predicate: generic (WHERE fingerprint IS NOT NULL), no per-ticker, no date-literal, no allowlist
- Fresh-DB CREATE TABLE includes `fingerprint TEXT` (no UNIQUE): correct

## DDD Compliance: PASS
- schema-alerts.ts is infrastructure — no golden-rule violation
- Test file imports from infrastructure layers: legitimate for test scope

## Security: PASS
- No process.env, no hardcoded credentials in production file
- SQL in migration uses parameterized/literal DDL (schema init — no user input)
- mock-guard: EXIT 0

## Self-confirming test check: PASS (non-blocking qualification below)

AC-7 (lines 323-418 of test file): NON-self-confirming for migration path.
  - Builds legacy 18-col alerts table with NO fingerprint column
  - Seeds 2 NULL-fp rows
  - Asserts fingerprint absent pre-migration (PRAGMA table_info)
  - Calls initAlertsTables() — the actual migration path
  - Asserts post-migration: (a) column present, (b) idx_alerts_fingerprint index present,
    (c) same-fingerprint INSERT OR IGNORE yields 1 row, (d) 2 NULL-fp legacy rows survive (total=3)

AC-1..AC-6: use buildTestDb() which pre-creates `fingerprint TEXT UNIQUE` and do NOT call
initAlertsTables(). These tests are self-confirming with respect to migration, but their declared
scope is scan-job INSERT dedup behavior — NOT the migration path. AC-7 is the dedicated migration
regression that closes the actual self-confirming gap.

## Non-blocking concern

AC-7 lines 388-394: string-interpolated fingerprint value in SQL (`'${fp}'`).
Test-only code, not production. Non-blocking per QA policy.

## Scope constraint

done_verified gate is the live market-open dedup drain (assert <=1 row per
(ticker,kind,fingerprint) per dedup window after a REAL scan ~02:00 UTC).
This verdict covers CODE + TEST QUALITY ONLY. Task stays in review lane.
Board flip is the router's responsibility after RAW-verifying this verdict.

## verdict: APPROVE-CODE
