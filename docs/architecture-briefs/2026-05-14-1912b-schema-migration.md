# 1912b Schema Migration — Architecture Brief

**Date:** 2026-05-14 | **Cycle:** c108-tick3-blocker | **Author:** architect
**Scope:** apps/alert-engine — SQLite DDL ordering fix

---

## 1. Blocker Summary

Container crashloop on Go cutover. Error: `init alert tables: no such column: outcome`.

## 2. Root Cause (Confirmed)

`InitAlertTables` DDL block (sqlite.go:34-62) runs as a single `db.Exec(ddl)` string containing:

1. `CREATE TABLE IF NOT EXISTS alert_engine_records` — skipped (table exists from TS era)
2. `CREATE INDEX IF NOT EXISTS idx_alerts_outcome_pending ON alert_engine_records(outcome) WHERE outcome IS NULL` — **fails** because `outcome` column does not exist in the TS-era table

The `ALTER TABLE ADD COLUMN` block (sqlite.go:66-88) never runs because step 2 errors first.

Confirmed via: `docker run --rm -v ... alpine sqlite3 /data/alert_engine.db 'CREATE INDEX ... WHERE outcome IS NULL'` → `Error: no such column: outcome`.

**DB state:** 0 rows in `alert_engine_records`, 0 rows in `alert_mutes`. Zero data loss risk.

## 3. Decision — Option 1 (Auto-migrate at init)

Fix the DDL ordering in `InitAlertTables`. No data to protect, no wipe needed.
Option 1 chosen over option 2 (one-off SQL) because it scales to future TS→Go schema deltas
and keeps init self-healing on any deployment.

## 4. Fix Spec

**File:** `apps/alert-engine/pkg/infrastructure/sqlite.go` — function `InitAlertTables` only.

**Change:** Split single DDL string into three ordered phases:

```
Phase 1 — Base DDL (no outcome references):
  CREATE TABLE IF NOT EXISTS alert_engine_records (id, stocks, signal_types,
    message, fingerprint, severity, triggered_at, sent_telegram)
  CREATE INDEX IF NOT EXISTS idx_alert_engine_stocks
  CREATE INDEX IF NOT EXISTS idx_alert_engine_fingerprint
  CREATE TABLE IF NOT EXISTS alert_mutes

Phase 2 — ALTER TABLE (existing loop, unchanged):
  ALTER TABLE alert_engine_records ADD COLUMN outcome TEXT
  ALTER TABLE alert_engine_records ADD COLUMN outcome_at TEXT
  ALTER TABLE alert_engine_records ADD COLUMN outcome_detail TEXT
  (ignore "duplicate column name" errors — idempotent)

Phase 3 — Outcome index (after column guaranteed present):
  CREATE INDEX IF NOT EXISTS idx_alerts_outcome_pending
    ON alert_engine_records(outcome) WHERE outcome IS NULL
  (ignore "already exists" — idempotent)
```

Each phase is a separate `db.Exec` call. Phases 2 and 3 may produce benign errors
on fresh DBs (where Phase 1 created the table WITH the full schema) — both must be
ignored via the existing `sqliteIsDuplicateColumn` helper + a new `sqliteIndexExists` helper.

## 5. Test Requirement

**New test in** `apps/alert-engine/pkg/infrastructure/sqlite_test.go`:

`TestInitAlertTables_PreMigrationDB`:
1. Open `:memory:` DB
2. Manually exec TS-era DDL (table WITHOUT outcome columns, without outcome index)
3. Call `InitAlertTables(db)` — must return `nil`
4. Assert `PRAGMA table_info(alert_engine_records)` shows `outcome`, `outcome_at`, `outcome_detail`
5. Assert `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_alerts_outcome_pending'` returns 1 row

## 6. Rollback Plan

Each `ALTER TABLE` statement is atomic in SQLite. If any phase errors:
- `os.Exit(1)` fires (existing code) — no partial state persisted in-use
- Ops redeploys prior TS image tag via `docker-compose up -d --no-deps alert-engine`
- DB untouched (named volume persists)
- Zero rows means zero history loss regardless

## 7. Future-proofing

Any future Go version adding new columns must follow the same 3-phase pattern:
Phase1 = base schema, Phase2 = ALTER TABLE per new column, Phase3 = indexes on new columns.
This becomes the standard migration pattern for this service.
