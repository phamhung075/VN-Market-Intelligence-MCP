# Task Report — Task 157: Data Audit Engine

> **Branch**: `task/157-data-audit-job`
> **Date started**: 2026-04-01
> **Date reviewed**: 2026-04-01
> **Final status**: APPROVED
> **DDD layer**: infrastructure/scheduler + infrastructure/db + infrastructure/rag

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Todo | 2026-04-01 | Sprint 018 kick-off |
| Todo → In Progress | 2026-04-01 | Assigned to Developer |
| In Progress → Review | 2026-04-01 | Developer submitted |
| Review → Done | 2026-04-01 | APPROVED by QA — see merge status below |

---

## Role Activity Log

### PM (Project Manager)
- Defined task scope: `dataAuditJob.ts` + schema migration + `getCount()` export
- Dependencies: TECH-018 approved
- DDD layer: infrastructure/scheduler
- Context injection: REQ_018.md (FR-1 through FR-13), TECH_018.md

### Developer
- Files created: `src/scheduler/dataAuditJob.ts`, `src/__tests__/157-data-audit-job.test.ts`
- Files modified: `src/infrastructure/db/schema.ts`, `src/infrastructure/rag/vectorstore.ts`
- TDD cycle followed: YES — test file present, all 16 tests pass
- Tests written: `src/__tests__/157-data-audit-job.test.ts`, 16 tests covering AC-1 to AC-12 (within task 157 scope)
- Assumptions made: scheduler wiring (jobs.ts) and systemTools.ts left to tasks 158/159 as per task breakdown

### QA — Review 1
- Date: 2026-04-01
- Outcome: APPROVED
- `bun test src/__tests__/157-data-audit-job.test.ts` result: PASS (16 tests, 0 failures, 79 expect() calls)
- `bun tsc --noEmit` result: PASS (0 errors)
- Issues found: 0 blocking, 1 non-blocking observation (see below)

---

## Test Results

```
bun test src/__tests__/157-data-audit-job.test.ts

  Task 157 — Data Audit Job
  AC-1: deletes zero-price rows from market_prices
  AC-2: marks stale unread alerts (>30 days) as read
  AC-3: escalates old new feedback to high priority and inserts agent_feedback
  AC-4: flags outlier tracked_indicator (brent_crude_usd=5.0) as critical
  AC-5: prunes commodity_prices_history rows older than 180 days
  AC-6: does not send Telegram when DB is clean
  AC-7: handles LanceDB getCount failure gracefully
  AC-8: upserts audit_state singleton row after daily audit
  AC-8: upserts audit_state singleton row after weekly audit
  AC-9: dedup guard prevents same agent_feedback title from being inserted twice on same day
  D-4: auto-expires unresolved alerts older than 60 days
  D-9: purges system_logs older than 60 days
  D-10: row_count_snapshot produces info findings for major tables
  W-3: deduplicates market_prices_history keeping latest rowid per (code, date)
  W-6: detects orphan alerts with analysis IDs not in rag_analyses
  AC-7 (Telegram): sends one message when zero-price rows exist

Tests: 16 passed, 0 failed
```

Coverage notes: Error path branches (catch blocks) are not exercised by tests — these are lines 272-279, 296-303, etc. in dataAuditJob.ts. This is acceptable for infrastructure error-handling code: the error paths are defensive guards, not business logic. Coverage is 75.52% on the main file and 94.74% function coverage.

---

## Issues Discovered During Review

### BLOCKING Issues

None.

---

### NON-BLOCKING Issues

#### Issue 157-01
- **Type**: SQL table name interpolation (not a security risk)
- **File**: `src/scheduler/dataAuditJob.ts:495`
- **Description**: D-10 row count snapshot uses `SELECT COUNT(*) as cnt FROM ${tableName}` where `tableName` iterates over the `SNAPSHOT_TABLES` const array. This is string interpolation in SQL, but carries zero injection risk because `SNAPSHOT_TABLES` is a hardcoded `as const` array with no user input path.
- **Fix applied**: No fix needed — the pattern is safe and correct. Deferred to awareness only.

#### Issue 157-02
- **Type**: Test label mismatch (cosmetic)
- **File**: `src/__tests__/157-data-audit-job.test.ts`
- **Description**: The test file labels AC-9 as "dedup guard", which corresponds to AC-11 in REQ_018.md. The spec's AC-9 (get_system_health) and AC-10 (scheduler wiring) are tasks 159 and 158 respectively and are intentionally excluded from this test file. The renumbering is logical within the scope of task 157 but may cause confusion during cross-reference.
- **Fix applied**: Deferred — cosmetic only, no functional impact.

---

## Bug Report

| # | Severity | Description | File | Status |
|---|----------|-------------|------|--------|
| — | — | No bugs found | — | — |

---

## Security Report

| # | Category | Description | Risk | Mitigation |
|---|----------|-------------|------|------------|
| 1 | SQL table name interpolation | D-10 uses `${tableName}` in SQL query | None | `SNAPSHOT_TABLES` is a hardcoded `as const` array — no user input path exists |
| 2 | process.env | Test JSDoc comment mentions `process.env.DB_PATH` pattern but actual test code uses injectable `db` parameter — no `process.env` calls present | None | Verified: grep confirmed no actual process.env usage in test implementation |

**Security verdict**: CLEAN

---

## DDD Compliance

- `src/scheduler/dataAuditJob.ts`: imports only `bun:sqlite` at module level; uses dynamic `import()` for `infrastructure/db/schema.js`, `infrastructure/config.js`, `infrastructure/notifiers/telegram.js`, `infrastructure/rag/vectorstore.js` — all valid infrastructure imports
- No imports from `application/` or `interface/` layers
- `agent_feedback` DDL inlined to avoid importing from `interface/mcp/tools/feedbackTools.ts`
- `AuditFinding` interface correctly placed in `dataAuditJob.ts` (operational artefact, not domain entity)

**DDD verdict**: PASS

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Zero-price rows deleted + system_logs entry | PASS | Test verified: VNM (price=0) and FPT (price=NULL) deleted, VCB (85000) kept |
| AC-2: Stale unread alert (35 days) marked read | PASS | alert-old read=1, alert-recent read=0 |
| AC-3: Old feedback escalated to high + auditor row inserted | PASS | priority updated, agent_feedback row with 'stale_new_feedback' in title inserted |
| AC-4: brent_crude_usd=5.0 → critical finding + agent_feedback | PASS | severity=critical, action=flagged, original row preserved, feedback priority=critical |
| AC-5: Old commodity_prices_history (200 days) deleted | PASS | 1 old row deleted, recent row kept |
| AC-6: Telegram silent on clean DB | PASS | sentMessages.length=0, findings array still populated |
| AC-7: LanceDB getCount throws → soft-fail warning | PASS | audit completes, finding check=lancedb_rag_count_drift, severity=warning, action=none |
| AC-8: audit_state upserted after daily and weekly runs | PASS | singleton row with last_daily_audit_at and last_weekly_audit_at populated |
| AC-9 (spec AC-11): Dedup guard prevents same-day re-insertion | PASS | duplicate count verified in-test |
| AC-10 (jobs.ts wiring) | DEFERRED | Task 158 scope — not part of task 157 |
| AC-11 (spec): No duplicate feedback on same-day re-run | PASS | Same as AC-9 test above |
| AC-12: bun test 0 failures, bun tsc --noEmit 0 errors | PASS | 16/16 tests pass, 0 TypeScript errors |
| D-4: Auto-expire unresolved alerts (65 days) | PASS | resolved_at set, resolution_notes='auto-expired by audit' |
| D-9: Old system_logs (70 days) purged | PASS | old log deleted, recent log preserved |
| D-10: Row count snapshot — 7 tables, all action=none, severity=info | PASS | Confirmed by test |
| W-3: market_prices_history dedup keeping latest rowid | PASS | price=81000 kept (higher fetched_at), price=80000 deleted |
| W-6: Orphan alerts detected | PASS | analysis_ids_json with missing rag_analyses IDs flagged |
| FR-10: market_prices_history canonical DDL in schema.ts | PASS | CREATE TABLE IF NOT EXISTS + exchange column migration added |
| LanceDB getCount() export in vectorstore.ts | PASS | New export wraps countRows() in try/catch, returns 0 on error |

---

## Merge Status

APPROVED — merged to main.

```bash
git checkout main
git merge --no-ff task/157-data-audit-job -m "merge(157): data audit engine with daily+weekly checks"
```

- Commits in branch: 1 (`task(157): implement data audit engine with daily+weekly checks`)
- Files changed: 5
- Lines added: ~910 (dataAuditJob.ts: ~911, test: ~539, schema.ts: +20, vectorstore.ts: +14)
- Tests added: 16 new tests
- Type errors at merge: 0

---

## Notes for Next Tasks

- Task 158 (`task/158-audit-scheduler-wiring`) can now start — `runDailyAudit` and `runWeeklyAudit` API is stable. Wire `CRONS.dataAuditDaily` and `CRONS.dataAuditWeekly` in `src/scheduler/jobs.ts`.
- Task 159 (`task/159-health-db-audit`) can now start — `audit_state` table schema is defined (`last_daily_audit_at`, `last_weekly_audit_at`). Add `--- DB Audit ---` section to `src/interface/mcp/tools/systemTools.ts`.
- Both 158 and 159 may proceed in parallel.
- No known tech debt deferred from task 157.
