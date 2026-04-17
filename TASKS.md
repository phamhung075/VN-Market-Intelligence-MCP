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

## Sprint 123 — COMPLETE (2026-04-17)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1360 | test(ohlcv-backfill-queue): TDD — written FIRST, must be RED | Done | QA |
| 1361 | feat(ohlcv-backfill-queue): backfill queue endpoint + VPS poll script | Done | Dev |

> Req spec: `docs/REQ_123.md` | Tech design: `docs/TECH_123.md` | PO sign-off: 2026-04-17

---

## Sprint 124 — Active

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1362 | test(vps-deploy-backfill): TDD — deploy script wires ohlcv-backfill-poll.sh | Review | QA |
| 1363 | feat(vps-deploy-backfill): deploy-vinahost.sh — add backfill poller as 6th service | Review | Dev |

> Goal: Wire ohlcv-backfill-poll.sh into deploy-vinahost.sh so the VPS poller is installed automatically — without this, the Sprint 123 queue mechanism is dead (VPS never polls it)
> Tech design: `docs/TECH_124.md`

---

## Task Details (active tasks only)

### Task 1362 — test(vps-deploy-backfill): TDD tests for deploy script + systemd units

**Branch**: `task/1362-vps-deploy-backfill-tdd`
**Layer**: test
**Depends on**: none

**Context**: Sprint 123 shipped `ohlcv-backfill-poll.sh` but did NOT wire it into `deploy-vinahost.sh`. Without deployment, the queue mechanism is inert — the VPS never polls and never triggers the backfill. Sprint 124 adds a 6th section to `deploy-vinahost.sh` that installs the poller as a systemd timer on the VPS. Tests verify the deploy script and unit files have the required content (no actual SSH needed — static analysis of file content).

**Files to read first**
- `deploy-vinahost.sh` (pattern for existing 5 sections)
- `vps-scripts/ohlcv-backfill-poll.sh` (script to be deployed)

**Files to create**
- CREATE: `src/__tests__/1362-vps-deploy-backfill.test.ts`

Line 1: `process.env["DB_PATH"] = ":memory:";`
Tests are static file-content checks (no SSH, no runtime).

**Acceptance Criteria** (all RED before 1363, all GREEN after)
- AC-1: `deploy-vinahost.sh` contains string `ohlcv-backfill-poll.sh` (section 6 reference)
- AC-2: `vps-scripts/vn-ohlcv-backfill.service` exists and contains `ExecStart` pointing to `/root/ohlcv-backfill-poll.sh`
- AC-3: `vps-scripts/vn-ohlcv-backfill.timer` exists and contains `OnCalendar=*:0/30` (every 30 min)
- AC-4: `deploy-vinahost.sh` contains `vn-ohlcv-backfill.timer` (timer enable step)
- `bun tsc --noEmit` 0 errors

---

### Task 1363 — feat(vps-deploy-backfill): wire poller into deploy-vinahost.sh

**Branch**: `task/1363-vps-deploy-backfill-impl`
**Layer**: vps-scripts + deploy
**Depends on**: 1362 (TDD tests RED)

**Files to read first**
- `src/__tests__/1362-vps-deploy-backfill.test.ts` (AC definitions)
- `deploy-vinahost.sh` (pattern to follow)
- `vps-scripts/ohlcv-backfill-poll.sh` (script being deployed)

**Files to create**
- CREATE: `vps-scripts/vn-ohlcv-backfill.service` — systemd service unit (Type=oneshot, ExecStart=/root/ohlcv-backfill-poll.sh)
- CREATE: `vps-scripts/vn-ohlcv-backfill.timer` — systemd timer unit (OnCalendar=*:0/30, Persistent=true)

**Files to modify**
- MODIFY: `deploy-vinahost.sh` — add section 6: sed-substitute env vars into `ohlcv-backfill-poll.sh`, scp script + service + timer to VPS, enable + start timer

**Acceptance Criteria**
- All 4 AC tests from 1362 pass
- Deploy script section 6 follows same pattern as sections 1-5 (sed substitution, scp, systemctl enable + start)
- Service unit: `Type=oneshot`, `EnvironmentFile` or inline env vars for `MCP_BASE` + `API_KEY`
- Timer unit: `OnCalendar=*:0/30`, `Persistent=true` (catches up if VPS was offline)
- `bun tsc --noEmit` 0 errors
- Full suite 0 new failures

---

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
