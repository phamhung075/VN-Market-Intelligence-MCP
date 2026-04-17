# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 122 — COMPLETE (2026-04-17)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1358 | test(ohlcv-aggregator): TDD 1358-ohlcv-daily-aggregator.test.ts — written FIRST | Done | QA |
| 1359 | feat(ohlcv-aggregator): ohlcvDailyAggregatorJob + wire jobs.ts | Done | Dev |

> Req spec: `docs/REQ_122.md` | Tech design: `docs/TECH_122.md` | PO sign-off: 2026-04-17

---

## Sprint 123 — Active

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1360 | test(ohlcv-backfill-queue): TDD — written FIRST, must be RED | Review | Dev |
| 1361 | feat(ohlcv-backfill-queue): backfill queue endpoint + VPS poll script | Todo | Dev |

> Req spec: `docs/REQ_123.md` | Tech design: `docs/TECH_123.md`
> Goal: Auto-trigger OHLCV backfill via VPS pull pattern — seed daily_ohlcv with 60 days of history so taSummary activates within hours, not 15 trading days

---

## Task Details (active tasks only)

### Task 1360 — test(ohlcv-backfill-queue): TDD tests (written FIRST, must be RED)

**Branch**: `task/1360-ohlcv-backfill-queue-tdd`
**Layer**: test
**Depends on**: none

**Context**: `daily_ohlcv` is sparse because the VPS backfill script (`vps-scripts/fetch-ohlcv-backfill.sh`) has never been run automatically. The startup probe alerts devs but requires manual action. This sprint adds a queue-based mechanism: startup probe writes a `pending` record to `ohlcv_backfill_queue`; VPS polls `GET /api/ohlcv-backfill-queue` and runs the backfill automatically; VPS confirms via `POST /api/ohlcv-backfill-done`.

**Files to read first**
- `src/scheduler/ohlcvStartupProbe.ts` (existing probe pattern)
- `src/interface/mcp/server.ts` (BCTC queue endpoint pattern: `/api/bctc-fetch-queue`, `/api/push-bctc-pdf`)
- `src/infrastructure/db/schema.ts` (table DDL patterns)
- `src/__tests__/1358-ohlcv-aggregator.test.ts` (in-memory DB pattern)

**Files to create**
- CREATE: `src/__tests__/1360-ohlcv-backfill-queue.test.ts`

Line 1: `process.env["DB_PATH"] = ":memory:";`
DDL: `ohlcv_backfill_queue` table (id INTEGER PK, status TEXT DEFAULT 'pending', requested_at TEXT, completed_at TEXT)

**Acceptance Criteria** (all RED before 1361, all GREEN after)
- AC-1: `GET /api/ohlcv-backfill-queue` with valid API key → 200 `{pending: true}` when queue has pending row, `{pending: false}` when empty
- AC-2: `GET /api/ohlcv-backfill-queue` with missing/wrong API key → 401
- AC-3: `POST /api/ohlcv-backfill-done` with valid key → 200 `{ok: true}`, row status updated to `done`, `completed_at` set
- AC-4: startup probe with sparse tickers + queue empty → inserts pending row into `ohlcv_backfill_queue`; probe with queue already pending → no duplicate insert
- `bun tsc --noEmit` 0 errors

---

### Task 1361 — feat(ohlcv-backfill-queue): endpoint + VPS poll script

**Branch**: `task/1361-ohlcv-backfill-queue-impl`
**Layer**: interface/scheduler + vps-scripts
**Depends on**: 1360 (TDD tests RED)

**Files to read first**
- `src/__tests__/1360-ohlcv-backfill-queue.test.ts` (AC definitions)
- `src/interface/mcp/server.ts` (BCTC queue pattern)
- `src/scheduler/ohlcvStartupProbe.ts` (probe to modify)
- `vps-scripts/fetch-ohlcv-backfill.sh` (existing backfill script to integrate)

**Files to create**
- CREATE: `vps-scripts/ohlcv-backfill-poll.sh` — VPS-side poller: `GET /api/ohlcv-backfill-queue` every 30 min; if `pending=true`, run `fetch-ohlcv-backfill.sh`, then `POST /api/ohlcv-backfill-done`

**Files to modify**
- MODIFY: `src/interface/mcp/server.ts` — add `GET /api/ohlcv-backfill-queue` + `POST /api/ohlcv-backfill-done` handlers
- MODIFY: `src/infrastructure/db/schema.ts` — add `ohlcv_backfill_queue` table DDL
- MODIFY: `src/scheduler/ohlcvStartupProbe.ts` — after sparse tickers detected, insert pending row into `ohlcv_backfill_queue` if no pending row exists

**Acceptance Criteria**
- All 4 AC tests from 1360 pass
- VPS script: polls queue, runs backfill on pending, posts done — idempotent (second run with `pending=false` → skips)
- Schema: `ohlcv_backfill_queue(id, status, requested_at, completed_at)` with `CREATE TABLE IF NOT EXISTS`
- Startup probe: inserts at most 1 pending row (guard against duplicates)
- `bun tsc --noEmit` 0 errors
- Full suite 0 new failures
