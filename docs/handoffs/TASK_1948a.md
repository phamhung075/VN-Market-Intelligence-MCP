# TASK_1948a — `improve_check_log` Schema + `improveCheckStore.ts`

**Sprint:** 1948 Phase 1 (Shadow-Mode Orchestrator)  
**Branch:** `task/1948a-improve-check-log-schema`  
**Size:** S (~2h)  
**Zone:** `apps/mcp-server/`  
**Owner:** dev-mcp-server  
**Dependency:** None (first in sequence)  
**Blocked by:** post-1945-verdict-resolution-scored-pct gate (2026-05-20T07:22Z)

---

## Context

Sprint 1948 implements Phase 1 of the closed-loop auto-improvement orchestrator (SPIKE-1947). The orchestrator detects signal accuracy degradation, generates hypotheses, and logs them for human review (shadow-mode only in Phase 1).

This task creates the foundational DB layer: the `improve_check_log` schema migration and the store functions that the orchestrator job (1948c) will call to snapshot baselines and track dispatch outcomes.

**Architecture references:**
- `docs/spikes/SPIKE_1947-auto-improve-loop.md` § 8 — `improve_check_log` schema
- `docs/architecture-briefs/2026-05-18-closed-loop-auto-improvement.md` — DDD layer assignment and risk flags
- DDD layer: `infrastructure/db` (schema + store functions)

---

## Acceptance Criteria

| AC | Criterion |
|---|---|
| AC-1 | `improve_check_log` table added to `apps/mcp-server/src/infrastructure/db/schema-system.ts` via `initSystemTables()`. Schema: 11 columns (id, signal_type, window_7d_rate, window_30d_rate, sample_count_7d, sample_count_30d, hypothesis, dispatch_status, fix_signal_id, checked_at, rechecked_at). Indexes: idx_improve_check_log_signal_type (signal_type, checked_at DESC). |
| AC-2 | Drizzle schema types added to `apps/mcp-server/src/infrastructure/db/schema.ts` for table-safe migrations. Table name = `improve_check_log` (snake_case, matches SQL DDL). |
| AC-3 | `apps/mcp-server/src/infrastructure/db/improveCheckStore.ts` created with 6 functions: (1) `insertImproveCheck(db, row: Omit<ImproveCheckRow, 'id'>): void`, (2) `getPendingRechecks(db, minAgeDays): ImproveCheckRow[]`, (3) `updateImproveCheckStatus(db, id, status, recheckedAt): void`, (4) `getRecentCheckForSignalType(db, signalType, withinDays): ImproveCheckRow | null`, (5) `getImproveChecksByStatus(db, status): ImproveCheckRow[]`, (6) `deleteOldImproveChecks(db, olderThanDays): number` (for Phase 2 pruning). All use Database object from `better-sqlite3` (mcp-server's existing DB handle). |
| AC-4 | `ImproveCheckRow` interface defined in `improveCheckStore.ts` matching schema columns (id, signal_type, window_7d_rate, window_30d_rate, sample_count_7d, sample_count_30d, hypothesis, dispatch_status: "shadow"\|"dispatched"\|"deferred_wip_cap"\|"improvement_confirmed"\|"no_improvement"\|"worsened", fix_signal_id, checked_at, rechecked_at). |
| AC-5 | Unit tests in `apps/mcp-server/__tests__/1948-self-improve-store.test.ts` (4+ test suites, ≥10 assertions). Tests: (1) insertImproveCheck + getPendingRechecks (1w+ old rows returned, <1w rows filtered), (2) updateImproveCheckStatus + timestamp validation (rechecked_at updated), (3) getRecentCheckForSignalType (existing row returned, null when absent, withinDays window respected), (4) deleteOldImproveChecks (older rows deleted, newer rows retained). All tests use `:memory:` SQLite via existing `setup.ts` preload. |
| AC-6 | `improveCheckStore.ts` has NO imports from orchestrator/domain/scheduler layers. Pure infrastructure — database operations only. DDD boundary enforced. |
| AC-7 | All tests GREEN. Zero tsc errors. No linting errors. |
| AC-8 | `.env.example` updated with `CRON_SELF_IMPROVE_ORCHESTRATOR="0 9 * * *"` and `SELF_IMPROVE_AUTO_DISPATCH="false"` (Phase 1 always shadow-mode; Phase 3 will read this var). |

---

## Files to Read First

1. `docs/spikes/SPIKE_1947-auto-improve-loop.md` — full design, esp. § 8 schema
2. `docs/architecture-briefs/2026-05-18-closed-loop-auto-improvement.md` — DDD layer assignment, risk flags R-1, R-8
3. `apps/mcp-server/src/infrastructure/db/schema.ts` — existing Drizzle pattern (review 1-2 existing tables)
4. `apps/mcp-server/src/infrastructure/db/schema-system.ts` — existing `initSystemTables()` function; add schema there
5. `apps/mcp-server/__tests__/setup.ts` — in-memory SQLite setup for tests

---

## Files to Create

- `apps/mcp-server/src/infrastructure/db/improveCheckStore.ts` (~80L)
- `apps/mcp-server/__tests__/1948-self-improve-store.test.ts` (~120L)

---

## Files to Modify

| File | Change | Lines |
|---|---|---|
| `apps/mcp-server/src/infrastructure/db/schema-system.ts` | Add `improve_check_log` table DDL to `initSystemTables()`. Include CREATE TABLE + CREATE INDEX. Idempotent: use `IF NOT EXISTS`. | ~15L insertion |
| `apps/mcp-server/src/infrastructure/db/schema.ts` | Add Drizzle table type (or comment: "improve_check_log is created via raw SQL in schema-system.ts for simplicity"). | 0–5L |
| `.env.example` | Add 2 env vars for scheduler. | 2L |

---

## Key Implementation Notes

1. **Schema location:** `improve_check_log` is created in `schema-system.ts` via raw SQL in `initSystemTables()`, NOT as a Drizzle table. This mirrors the pattern for audit/system tables. Idempotent via `IF NOT EXISTS`.

2. **dispatch_status enum:** Stored as TEXT in SQLite. Allowed values: `"shadow"` (Phase 1), `"dispatched"` (Phase 2+), `"deferred_wip_cap"` (Phase 3), `"improvement_confirmed"`, `"no_improvement"`, `"worsened"`. Store functions do NOT validate — caller (orchestrator job) is responsible.

3. **Timestamps:** Use SQLite `datetime('now')` as column default for `checked_at`. `rechecked_at` is NULL until recheck happens. Stored as ISO 8601 strings (e.g., '2026-05-20 09:00:00').

4. **Integration test skip:** Do NOT write integration tests that call the real scheduler or mcp-server startup. Unit tests only (in-memory DB).

5. **Database handle:** The `Database` type comes from `better-sqlite3`. Existing mcp-server code already has a `db` singleton initialized at startup. Store functions are agnostic — they accept a `Database` object and work with any DB instance (crucial for testability).

6. **Risk R-1 (HIGH):** Insufficient sample volume in early weeks. Phase 1 is safe (shadow-only). This is a monitoring flag — do NOT code for it yet. Phase 2+ will need "insufficient_sample" dispatch status guard.

7. **Risk R-8 (CRITICAL if violated):** Single-writer constraint. Orchestrator MUST run inside mcp-server process. DB schema is appended-to only in Phase 1. Never call `improveCheckStore.ts` from a cross-service HTTP handler.

---

## Sequencing & Dependencies

**Predecessor:** None  
**Successor:** 1948b (domain rules), 1948c (orchestrator job) both wait on 1948a to be merged.

This task is self-contained. Once merged, 1948b and 1948c can be developed in parallel (but must be submitted sequentially per WIP limit).

---

## Test Checklist

- [ ] insertImproveCheck creates row with generated id
- [ ] getPendingRechecks filters by minAgeDays (7d old rows returned, <7d filtered)
- [ ] updateImproveCheckStatus updates dispatch_status and rechecked_at
- [ ] getRecentCheckForSignalType returns most recent row for signal_type within withinDays window
- [ ] getImproveChecksByStatus filters by status
- [ ] deleteOldImproveChecks removes rows older than threshold
- [ ] Schema migration is idempotent (second call to initSystemTables succeeds without error)
- [ ] All tests use `:memory:` SQLite (fast, isolated)
- [ ] 0 tsc errors, 0 linting errors

---

## QA Handoff

When dev-mcp-server submits, QA will verify:

1. Schema migration runs without error on a fresh database
2. 10+ unit tests GREEN
3. tsc clean
4. No regression in existing alert_accuracy, signal_outcomes, or cron_job_runs tests
5. `.env.example` updated

**Report:** `reports/TASK_REPORT_1948a.md`

---

## Notes

- Sprint 1948 is Phase 1 of the closed-loop auto-improvement. Tasks 1948a, 1948b, 1948c are sequential but quick (S, S, M).
- **Pre-condition blocker:** Sprint 1948 does NOT start until post-1945-verdict-resolution-scored-pct gate clears (2026-05-20T07:22Z). If that gate misses, the resolution pipeline fix takes priority, and 1948 tasks are deferred.
- No production signal-bus dispatch happens in Phase 1 — pure shadow-mode logging.
