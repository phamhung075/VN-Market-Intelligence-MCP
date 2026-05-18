## Task Report 1943a
date: 2026-05-18
outcome: APPROVED

changed:
- apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts:494-519 (resetQ1UrlNotFound + call in initFinancialReportsTables:296)
- apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts:122-156 (COMBINED_SQL grace-period arm)
- apps/mcp-server/src/scheduler/financial-reports/bctcBatchSweepJob.ts:316-342 (diagnostic log + JSDoc root-cause doc)
- apps/mcp-server/src/__tests__/BCTC-1943-queue-reset-and-retry.test.ts (new, 16 tests)

tests: 16 pass / 0 fail (targeted) | full suite: 9219 pass / 275 fail / 8 errors (zero regression vs parent commit baseline 9219/275/8) | tsc: 0 errors | ddd: PASS | security: PASS
verdict: APPROVED

### AC Verification

AC-1: PASS — resetQ1UrlNotFound(db) at schema-financial-reports.ts:494 uses WHERE status='url_not_found' AND period_year=2026 AND period_quarter='Q1', returns changes (0 on repeat call = idempotent). 4 tests cover: 5-row reset, idempotent second call, period-scope guard, pending/done rows untouched.

AC-2: PASS — Scope strictly limited to period_year=2026 AND period_quarter='Q1'. Test at line 107 confirms Q4-2025 url_not_found rows are untouched after reset call.

AC-3: PASS — console.log at bctcBatchSweepJob.ts:320 documents entry diagnostic. JSDoc at lines 313-314 documents root cause: wrapRun key 'bctcBatchSweepJob' in startScheduler.ts:282 is correct; zero-run on 2026-04-25 attributed to container likely down at 09:00 UTC. Next fire: 2026-07-25.

AC-4: PASS — bctcQueueEnricherJob.ts COMBINED_SQL Arm 2 (lines 149-153): status='url_not_found' AND last_attempt IS NOT NULL AND last_attempt < datetime('now', '-7 days') AND attempts < 6. All 3 conditions present. 5 tests cover: eligible row selected, recent row skipped, NULL last_attempt skipped, failed retry re-marked url_not_found, attempts=6 cap not selected.

### Dangerous Flags Check
- _resetRunningState: NOT present in any TASK-1943a file (pre-existing only in vnstockFundamentalsJob.ts, not modified)
- process.env: NOT present in any modified file (uses Bun.env only)
- Hardcoded secrets: NONE

### Merge Status
Already on main as commit 3a3a5d61. No branch to clean (direct commit, not feature branch merged).
