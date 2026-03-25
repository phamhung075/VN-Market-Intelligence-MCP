# Task Report 002 — SQLite schema + migrations

**Branch**: `task/002-db-schema`
**Merged to main**: 2026-03-25
**Reviewer**: Claude (Reviewer agent)

---

## Summary

Implements the SQLite database layer using Bun's built-in `bun:sqlite`. Creates all application tables (watchlist, market_prices, alerts, rag_analyses, financial_reports) with appropriate indexes and views. The `initDatabase()` function is idempotent via `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`. Financial reports DDL is imported from the existing `bctc-schema.ts`.

Key design decisions:
- Singleton pattern for DB connection via `getDb()` with lazy initialization
- WAL journal mode and foreign keys enabled via PRAGMA
- DB path configurable via `DB_PATH` env var (supports `:memory:` for tests)
- `closeDb()` exposed for test teardown

---

## Test Results

```
bun test src/__tests__/002-db-schema.test.ts

 24 pass
  0 fail
 58 expect() calls
Ran 24 tests across 1 files. [63.00ms]
```

Tests cover:
- Idempotency (calling `initDatabase()` 3 times)
- Table existence (5 tables)
- Column checks (4 tables)
- Index existence (3 indexes)
- Insert + query roundtrip (4 tables)
- UNIQUE constraint enforcement on financial_reports
- View existence (v_chart_timeseries, v_yoy_comparison)
- WAL journal mode and foreign keys pragma

---

## Type Check

```
bun tsc --noEmit
```

Only pre-existing errors in `src/infrastructure/rag/vectorstore.ts` (BctcRagEntry type mismatch with LanceDB's `Record<string, unknown>`) -- not related to this task.

---

## Files Changed

| File | Change |
|------|--------|
| `src/infrastructure/db/schema.ts` | NEW -- Database init, table DDL, singleton accessor |
| `src/infrastructure/db/index.ts` | NEW -- Barrel re-export |
| `src/infrastructure/index.ts` | MODIFIED -- Added db exports |
| `src/__tests__/002-db-schema.test.ts` | NEW -- 24 tests |

---

## Review Checklist

- [x] Tests pass (24/24)
- [x] Type check passes (0 new errors)
- [x] DDD compliance: domain/ has no imports from infrastructure/
- [x] SQL injection: No risk -- all DDL is static strings, no user input interpolation
- [x] Idempotent initialization verified
- [x] WAL mode and foreign keys enabled
- [x] Test uses `:memory:` DB for isolation
- [x] Barrel export added to `src/infrastructure/index.ts`

---

## Verdict: PASS

No blocking issues. Merged to main via `--no-ff`.
