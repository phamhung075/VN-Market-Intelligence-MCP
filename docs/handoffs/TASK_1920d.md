# TASK 1920d — Broker Sanctions Quarterly Sweep Scheduler Job

**Sprint:** 1920 | **Tier:** 3 | **Type:** FEATURE | **Zone:** apps/mcp-server/ | **Size:** S
**DDD Layer:** application + infrastructure | **Owner:** dev-mcp-server
**Status:** Todo (sequenced after 1920a/b/c merge)

---

## [PM] Planning Context

**Developer assigned:** dev-mcp-server
**ZONE:** apps/mcp-server/
**Sequencing:** CRITICAL PRE-CONDITION (R-3): Schema migration adding `UNIQUE(broker_name, sanction_start)` + `INSERT OR IGNORE` update to `brokerSanctionStore.ts` MUST ship in SAME PR as job code. This task is sequenced last — wait for 1920a/b/c PR merge before starting 1920d.
**Duration estimate:** ~2h (includes schema migration + job code + tests)
**Blockers:** 1920a/b/c merge (schema must not conflict with concurrent job development)
**Handoff:** This file is the SSOT. Accept when: schema migration file created, store function updated, job file created, cronConfig key added, startScheduler wiring complete, all acceptance criteria tests pass (AC-0 through AC-8).

---

## Context

`brokerSanctionStore.ts` (`infrastructure/db/brokerSanctionStore.ts`) provides `insertBrokerSanction()` but uses a plain INSERT — the `broker_sanctions` table has no UNIQUE constraint on `(broker_name, sanction_start)`. A quarterly job running twice (Docker restart mid-window) would insert duplicate rows.

**CRITICAL PRE-CONDITION (R-3):** Before the scheduler job can be deployed safely, a schema migration must add `UNIQUE(broker_name, sanction_start)` to `broker_sanctions` AND the store function must be updated to use `INSERT OR IGNORE`. This migration MUST ship in the same PR as the job file. The job is unsafe to deploy without this constraint.

Source: SSC enforcement page (`congbothongtin.ssc.gov.vn`). ARCH-1920 confirms this source is geo-accessible from France — no VPS required. The existing `sscCheckerJob.ts` in the same `news-analysis/` scheduler zone already uses SSC as a source, confirming the connectivity pattern.

---

## Requirements

### FR-1 — SCHEMA MIGRATION (pre-condition, same PR)
**DDD layer:** infrastructure

Before any job code is written, the PR must include:
1. A SQLite migration that adds `UNIQUE(broker_name, sanction_start)` to `broker_sanctions`. Use `ALTER TABLE broker_sanctions ADD CONSTRAINT ...` or recreate-and-rename pattern if SQLite UNIQUE addition requires table recreation.
2. Update `insertBrokerSanction()` in `brokerSanctionStore.ts` to use `INSERT OR IGNORE INTO broker_sanctions ...` (replacing the current plain INSERT).

The migration must be idempotent (no-op if constraint already exists). Follow the migration pattern used by other schema files in `infrastructure/db/`.

### FR-2 — Quarterly broker sanctions sweep
**DDD layer:** application

Register a monthly cron (`brokerSanctionsSweep`, last Friday of each month 08:00 UTC) with a quarter-guard in the job body:

```
if (![3, 6, 9, 12].includes(new Date().getMonth() + 1)) {
  // skip non-quarter-end months — log skip to cron_job_runs
  return;
}
```

When the guard passes (March / June / September / December), fetch SSC broker sanctions list and call `insertBrokerSanction()` for each new sanction record.

Cron expression: `0 8 25-31 * 5` (Fri between the 25th–31st of each month, 08:00 UTC). Note: standard node-cron does not support `L` (last weekday); this expression approximates "last Friday".

### FR-3 — Fail-loud on WORK channel
**DDD layer:** infrastructure

If the SSC fetch throws or returns zero records in a quarter-end month, send `send_telegram(channel="work")` with job name + error or zero-result summary. Quarterly cadence means a silent skip is a 3-month data gap.

### FR-4 — recordJobRun observability
**DDD layer:** infrastructure

Wrap the job body in `recordJobRun(db, jobName, fn)`. For skipped non-quarter months, record `status='skipped'` and `rows_written=0`. For active runs, record normal status.

### FR-5 — cronConfig.ts addition
**DDD layer:** infrastructure

Append to the `CRONS` export:

```
brokerSanctionsSweep: Bun.env.CRON_BROKER_SANCTIONS ?? '0 8 25-31 * 5'
```

Override via `CRON_BROKER_SANCTIONS` env var. No side-effects at module load.

### FR-6 — startScheduler.ts wiring
**DDD layer:** infrastructure

Import and register the cron function from `brokerSanctionsJob.ts` in `startScheduler.ts`. Zone: `news-analysis/` (same zone as `sscCheckerJob.ts`).

### NFR-1 — Idempotency (requires FR-1 pre-condition)
After the schema migration, `INSERT OR IGNORE` ensures a second run in the same quarter window does not duplicate rows. A Docker restart between the 25th–31st Friday of a quarter-end month is safe.

### NFR-2 — SSC geo-access
SSC enforcement page (`congbothongtin.ssc.gov.vn`) is reachable from France without VPS proxy. No VPS configuration needed. Pattern confirmed by `sscCheckerJob.ts` in the same zone.

---

## Acceptance Criteria

- AC-0 (SCHEMA MIGRATION — MUST ship in same PR): `UNIQUE(broker_name, sanction_start)` constraint exists on `broker_sanctions`. `insertBrokerSanction()` uses `INSERT OR IGNORE`. Migration is idempotent.
- AC-1 (cadence): `brokerSanctionsSweep` cron fires on Fridays between 25th–31st at 08:00 UTC. Verifiable in `cron_job_runs`.
- AC-2 (quarter-guard — skip): Unit test — when `getMonth() + 1` = 1 (January), job returns after recording `status='skipped'` without calling SSC fetcher.
- AC-3 (quarter-guard — active): Unit test — when `getMonth() + 1` = 3 (March), job calls SSC fetcher.
- AC-4 (idempotency): Integration test — running the job twice in the same quarter with the same sanction data: `SELECT COUNT(*) FROM broker_sanctions WHERE broker_name='X'` = 1 (not 2).
- AC-5 (zero-result alert): Unit test — when SSC fetcher returns empty list in a quarter-end month, `sendWorkFn` spy called with zero-result warning.
- AC-6 (fetch error): Unit test — when SSC fetcher throws, `sendWorkFn` spy called with error; job does not rethrow.
- AC-7 (coverage): After first successful quarterly run, `SELECT COUNT(*) FROM broker_sanctions` >= 5 (historical seed + new entries).
- AC-8 (recordJobRun): `cron_job_runs` row inserted per run with `status` ('skipped' or 'completed') and `rows_written`.

---

## Edge Cases

- Duplicate sanction record: same broker sanctioned twice in same quarter (amendment). `INSERT OR IGNORE` skips the second insert if `(broker_name, sanction_start)` already exists. This is correct — dedup on logical key, not DB rowid.
- Sanction with null `sanction_start`: if SSC data omits start date, the UNIQUE constraint cannot protect against duplicates. The parser should reject null `sanction_start` and log a warning rather than inserting with null — null is not a valid dedup key.
- Non-quarter Friday (e.g., last Friday of January): quarter-guard skips. `cron_job_runs` records `status='skipped'`. No WORK alert sent for non-quarter skips.
- SSC page HTML structure change: SSC enforcement page uses `congbothongtin.ssc.gov.vn` portal. Parser may need to be updated if SSC changes HTML. This is an operational concern, not a 1920d blocker.
- VN locale: broker names on SSC page are in Vietnamese (e.g., "Công ty Cổ phần Chứng khoán..."). Store as-is in UTF-8 — no transliteration.

---

## Files Changed (expected)

- `apps/mcp-server/src/infrastructure/db/schema-alerts.ts` (or equivalent migration file) — ADD `UNIQUE(broker_name, sanction_start)` to `broker_sanctions` DDL
- `apps/mcp-server/src/infrastructure/db/brokerSanctionStore.ts` — change plain INSERT to `INSERT OR IGNORE`
- `apps/mcp-server/src/scheduler/news-analysis/brokerSanctionsJob.ts` — NEW file
- `apps/mcp-server/src/scheduler/cronConfig.ts` — append `brokerSanctionsSweep` key
- `apps/mcp-server/src/scheduler/startScheduler.ts` — import + register cron function
- `apps/mcp-server/src/__tests__/1920d-broker-sanctions-job.test.ts` — NEW test file

---

## Blockers

None (no PO questions). All design decisions are encoded in ARCH-1920. The schema migration (FR-1 / AC-0) is a developer implementation pre-condition, not a PO decision.

---

## Test Criteria Summary

| AC | Test type | Pass condition |
|----|-----------|----------------|
| AC-0 | Schema inspection | `UNIQUE(broker_name, sanction_start)` in DDL; `INSERT OR IGNORE` in store |
| AC-1 | Unit (cron expression) | `CRONS.brokerSanctionsSweep === '0 8 25-31 * 5'` |
| AC-2 | Unit | Month=1 → fetcher spy NOT called; `recordJobRunSpy` receives status='skipped' |
| AC-3 | Unit | Month=3 → fetcher spy called |
| AC-4 | Integration | Two runs same data → `SELECT COUNT(*) FROM broker_sanctions WHERE broker_name='X'` = 1 |
| AC-5 | Unit | Empty SSC result in quarter month → `sendWorkFn` spy called with zero-result warning |
| AC-6 | Unit | Fetcher throws → `sendWorkFn` spy called; no rethrow |
| AC-7 | Integration | After first quarter run → `SELECT COUNT(*) FROM broker_sanctions` >= 5 |
| AC-8 | Unit | `recordJobRunSpy` receives status + rows_written per run |
