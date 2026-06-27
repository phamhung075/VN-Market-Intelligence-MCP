## Task Report FIX-BCTC-Q1-2026-INGEST-DISCOVERY-GAP
date: 2026-06-27
commit: f1998b7c
outcome: CHANGES_REQUESTED

changed:
  - apps/mcp-server/src/interface/mcp/routes/fetchStatusHandler.ts (production)
  - apps/mcp-server/src/__tests__/F-1-fetch-ops-page-truth.test.ts (test)

tests: 13370 pass / 118 fail / 42 skip | tsc: 0 errors | ddd: PASS | security: PASS

### Issues — BLOCKING

- apps/mcp-server/src/__tests__/FIX-BCTC-VPS-QUEUE-STALE-TRIAGE.test.ts:22-58
  makeDb() does not include `financial_reports` table. f1998b7c added
  `SELECT COUNT(*) FROM financial_reports WHERE text_status='COMPLETE' AND refine_status='PENDING'`
  to queryBctcCounts(). When this table is absent, the query throws "no such table: financial_reports",
  the catch block returns HTTP 500, and all 5 AC tests fail with
  "undefined is not an object (evaluating 'result.bctcPipeline.pending')".
  File was passing (0 fail) before f1998b7c — confirmed via parent commit check.
  Fix: add `CREATE TABLE IF NOT EXISTS financial_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, action_code TEXT NOT NULL, text_status TEXT, refine_status TEXT);` to makeDb().

- apps/mcp-server/src/__tests__/CLEAN-DEAD-SOURCE-IDS.test.ts (makeDb function)
  Same root cause — handleFetchStatus called with in-memory DB missing financial_reports table.
  7 tests fail with HTTP 500 instead of expected 200.
  File was passing before f1998b7c — last-touch commit 950cf014 (pre-existing).
  Fix: same financial_reports DDL addition to makeDb().

### Regression count
- New failures from f1998b7c: 12 (5 from FIX-BCTC-VPS-QUEUE-STALE-TRIAGE + 7 from CLEAN-DEAD-SOURCE-IDS)
- Remaining 106 failures: pre-existing, confirmed disjoint from f1998b7c delta
  (1133 foreignFlowAlertJob: SQLite schema from b3ea96fa; 1302-technical-indicators in _deprecated/: from a80f01e5; T11/1837a: live orch-state.json structure tests; other pre-existing network/timeout class)

### Non-blocking

- DDD: interface/fetchStatusHandler.ts imports from infrastructure/db/vpsPushLogStore.js (line 54).
  Pre-existing in parent commit (same import at parent:53). Interface→infra direction is PERMITTED per
  project convention (confirmed in cycles 311, 317, 299). Not introduced by f1998b7c.

### Verified passing

- tsc: EXIT 0 (bun tsc --noEmit)
- Targeted F-1 test: 23/23 pass (58 expect() calls — dev's claim accurate for this file)
- SQL correctness: refine_pending query counts exactly text_status='COMPLETE' AND refine_status='PENDING';
  F-1 test at line 329-346 inserts 4 rows (HPG COMPLETE/PENDING, ACV COMPLETE/PENDING,
  VCB COMPLETE/DONE, MSN PENDING/PENDING) → expects 2 (HPG+ACV only) — correct predicate
- mock-guard: EXIT 0
- Security: no process.env, no hardcoded credentials, SQL parameterized throughout
