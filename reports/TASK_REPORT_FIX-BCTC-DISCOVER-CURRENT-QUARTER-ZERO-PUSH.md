## Task Report FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH
date: 2026-06-18 (cycle-294)
changed: [apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts:692-706, apps/mcp-server/src/__tests__/FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH.test.ts:298-336, apps/mcp-server/src/__tests__/BCTC-1943-queue-reset-and-retry.test.ts:3-5]
tests: 13190 pass / 42 skip / 6 fail (per-file isolation) | baseline: 13179/42/17 | net: +11 pass, -11 fail | tsc: 0 errors | ddd: PASS | security: PASS
verdict: APPROVED

### Production Fix (ea5dc0eb)
Removed `resetQ1UrlNotFound(db)` call from `initFinancialReportsTables()` in schema-financial-reports.ts.
Function kept exported and marked `@deprecated`; Arm-2 grace-period query in COMBINED_SQL provides generic bounded retry (attempts < 6, 7-day window).

### TERM-8 Regression Guard (new test)
FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH.test.ts: seeds url_not_found rows (attempts=6) → re-runs initDatabase() → asserts rows remain url_not_found/attempts=6 post-init. 9/0 pass.

### Full CI Results (per-file isolation, P=8)
Baseline (pre-fix): 13179 pass / 42 skip / 17 fail
With fix (ea5dc0eb): 13190 pass / 42 skip / 6 fail
Net: +11 pass / -11 fail — no new failures introduced.
Failing files (5 files, 6 total): 083-tool-analysis, 102-job-news-poll, 1227-source-health-empty-result, 1324-push-news-all-sources, TASK17-PAGE13 — ZERO overlap with 3 changed files; all present in baseline.

### Live DB Verification (named volume vn-market-intelligence-mcp_market_data)
All 8 genuinely-absent Q1-2026 rows: status=url_not_found, attempts=7 (BDI, DAG, DLC, JSH, SIS, VDC, VEA, VNH)
65 total done rows across all periods: UNTOUCHED.
zero_url_consecutive_cycles=243, last_updated=2026-06-18 00:00:56 UTC: STOPPED CLIMBING.
Idle-queue path fires when all 8 rows excluded from Arm-2 (attempts>=6 > cap of 5).

### Container Verification
/app/src/infrastructure/db/schema-financial-reports.ts line 695: "startup reset REMOVED" — fix confirmed live.
Developer workflow: write→build image (23:17Z)→commit (23:41Z); image .Created precedes commit by 24min; fix content is present.

### Genericity (/goal#2)
COMBINED_SQL Arm-2: `attempts < 6 AND status='url_not_found' AND last_attempt < datetime('now', '-7 days')` — numeric cap only, no ticker allowlist, no date literal. Any genuinely-absent ticker at any period terminates generically.

### Deferred
NODE-CRON DOUBLE-FIRE: explicitly out of scope per DoD — tracked in ARCH-CRON-SCHEDULER-RELIABILITY.

### Merge Status
APPROVED — router to perform final live RAW-verify before done_verified flip.
