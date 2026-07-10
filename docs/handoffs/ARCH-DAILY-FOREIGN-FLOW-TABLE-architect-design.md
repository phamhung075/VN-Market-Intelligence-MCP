---
id: ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design
version: "2026-07-10"
authored_by: architect
status: READY_FOR_PM
zone: apps/mcp-server/
task_ref: ARCH-DAILY-FOREIGN-FLOW-TABLE
parent_task: ARCH-OHLCV-WRITER-SSOT-DURABLE
build_standard: not-applicable
---

# [Architect] Brownfield Findings + Technical Design
# ARCH-DAILY-FOREIGN-FLOW-TABLE — separate staging table, eliminate R-1

---

## Zone

`apps/mcp-server/` — single zone. Schema, writer, and all read-site changes stay here.
BUILD-STANDARD: not-applicable (durable hardening / schema addition, existing service, no new primitive/port).

---

## Context — what "R-1" is

Parent design `docs/handoffs/ARCH-OHLCV-WRITER-SSOT-DURABLE-architect-design.md` §1/§4 selected
**Option G (merge-only UPDATE)** for P0 and explicitly queued **Option F (separate table)** as this
follow-on. R-1 = *"Foreign-flow data lost for tickers with no OHLCV row at fetch time"* (MEDIUM,
accepted for P0). Root cause: `daily_ohlcv.close REAL NOT NULL` (no DEFAULT) makes it schema-illegal
to persist a foreign-flow-only row before the real OHLCV bar exists, so the merge-only writer
(shipped `SUBTASK-OHLCV-WRITER-1-FOREIGN-FLOW-MERGE`, commit `41b4344c`) intentionally **drops** the
write (`changes=0`, debug log) whenever `UPDATE ... WHERE code=? AND date=?` matches zero rows.

This is not purely theoretical — it is the exact live symptom in
`feedback_foreign_flow_deferred_write_race_ohlcv_row.md` ("dòng vốn ngoại chi tiết phiên này chưa
trả số từng mã"): early-session per-ticker foreign-flow reads 0/empty because `writeForeignFlowToOhlcv`
had nothing to `UPDATE`. It self-heals only because `foreignFlowFetcherJob` retries every 60s
(`startupHelpers.ts:219` / `startScheduler.ts:840`) until `pushPricesHandler` (Writer A) inserts the
OHLCV row. For a ticker whose OHLCV bar never lands that day (halt, delist, VPS price-push outage),
every intermediate foreign-flow snapshot before the eventual write (or before market close, if it
never lands) is **permanently discarded** — not delayed, dropped — because the writer only ever
overwrites, never accumulates.

---

## Verified Paths (recon, 2026-07-10 — supersedes/confirms parent doc's 2026-06-17 recon)

| File | Role | Key finding |
|---|---|---|
| `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts` | Writer G, shipped merge-only | L72-83: `UPDATE daily_ohlcv SET foreign_* WHERE code=? AND date=?`; L101-108: `changes===0` → debug log `"no OHLCV row yet ... foreign-flow deferred"`, **no write happens**. Confirmed live as of this cycle — unchanged since 06-17 ship. |
| `apps/mcp-server/src/infrastructure/db/schema-market-data.ts` | Schema SSOT | L88-105: `daily_ohlcv` DDL, `close REAL NOT NULL` (no default) — unchanged, still blocks any INSERT that omits close. Foreign columns `foreign_buy_vol/foreign_sell_vol/foreign_net_vol/put_through_vol` are plain nullable `REAL` (L97-100). |
| `apps/mcp-server/src/infrastructure/db/schema.ts` | Legacy migration | L278-300 `migrateForeignFlowColumns()`: idempotent `ALTER TABLE ADD COLUMN IF NOT EXISTS` pattern for `foreign_buy_value`/`foreign_sell_value` (REAL, nullable) — reusable pattern for the new table's own migration. |
| `apps/mcp-server/src/domain/models/shared-types.ts` | Domain shape | L161-171 `WriteForeignFlowItem` — `{code, date, foreignBuyVol, foreignSellVol, putThroughVol, foreignBuyValue?, foreignSellValue?}`. Reusable as-is for the new table's row shape — no change needed. |
| `apps/mcp-server/src/infrastructure/fetchers/foreignFlowFetcher.ts` | Caller A | L136-137, L219-220: `const { changes } = await writeForeignFlowToOhlcv(...)` — non-error on `changes=0` (confirmed, unchanged since parent fix). |
| `apps/mcp-server/src/interface/mcp/routes/pushForeignFlowHandler.ts` | Caller B | L314-329: `writeForeignFlowToOhlcv(ohlcvItems)` inside try/catch, `changes=0` logged not thrown. |
| **Read sites — 9 files query `daily_ohlcv.foreign_*` columns directly** (new — full inventory below) | | |

### Read-site inventory (new recon — not covered by parent doc, load-bearing for this design)

**Class A — "value readers"** (need actual buy/sell/net numbers, join with OHLCV context):
| File | SQL shape |
|---|---|
| `apps/mcp-server/src/interface/mcp/tools/market-data/marketWideForeignFlowTool.ts` | L86-138: `SUM(foreign_buy_vol/sell_vol/net_vol) FROM daily_ohlcv WHERE foreign_net_vol IS NOT NULL`; per-ticker top/bottom-N `SELECT code,date,foreign_* FROM daily_ohlcv WHERE date=? AND foreign_net_vol IS NOT NULL ORDER BY foreign_net_vol` |
| `apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts` | L55-58, L283-286: `SELECT date, foreign_* FROM daily_ohlcv` (per-ticker history), `SELECT code, foreign_net_vol FROM daily_ohlcv` |
| `apps/mcp-server/src/scheduler/market-data/foreignFlowAlertJob.ts` | L100-114: `SELECT code,date,COALESCE(foreign_net_vol,0) FROM daily_ohlcv WHERE code=? ORDER BY date DESC LIMIT ?` — cumulative-sum evidence builder (`getForeignFlowHistoryFromDb`) |
| `apps/mcp-server/src/application/usecases/assembleEveningSummary.ts` | L559-575: default `getForeignFlowMoversFn` queries `daily_ohlcv` `foreign_net_vol` for top movers when no DI override is injected |
| `apps/mcp-server/src/scheduler/briefings/franceSummaryJob.ts` | L107-208: default `getForeignFlowMoversFn` — same shape as above, separate default impl |

**Class B — "freshness/health probes"** (only need `IS NOT NULL` / `MAX(updated_at)`, no values):
| File | SQL shape |
|---|---|
| `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts` | L111: `MAX(updated_at) FROM daily_ohlcv WHERE foreign_buy_vol IS NOT NULL` |
| `apps/mcp-server/src/interface/mcp/tools/system/slaStatusTools.ts` | L71: same shape, tool-surface twin of the above |
| `apps/mcp-server/src/scheduler/vpsProxyWatchdogJob.ts` | L137: `MAX(updated_at) FROM daily_ohlcv WHERE foreign_buy_vol IS NOT NULL` |
| `apps/mcp-server/src/domain/services/vpsHealthPoller.ts` | L187: `latestTimestampSql: SELECT MAX(updated_at) ... WHERE foreign_buy_vol IS NOT NULL` (VPS health-check registry entry) |

Not affected (consume tool/summary output, no direct SQL on foreign columns):
`recapRenderer.ts`, `eveningSummaryJob.ts` (calls `assembleEveningSummary`), `foreignFlowValidator.ts`
(validates payload shape, not DB reads).

**Test surface:** ~15 existing test files reference `daily_ohlcv` foreign columns directly
(`2026-ohlcv-foreign-flow-merge.test.ts`, `1503-ohlcv-foreign-flow.test.ts`,
`1517-foreign-flow-alert-ohlcv-source.test.ts`, `DPI-4-foreign-flow-upsert.test.ts`, etc.) —
this is why the design below is additive-with-a-compatibility-view rather than a rip-and-replace.

---

## 1. Design — Additive Table + Compatibility View (not a rip-and-replace)

### Why not just move the columns wholesale in one PR
9 read sites + ~15 tests are coupled to `daily_ohlcv.foreign_*` column names today. A big-bang
column removal is unnecessary risk on a live named-volume DB for a P1/non-blocking task. The design
below makes the new table authoritative for all **future** writes while giving every read site a
one-line, drop-in migration path (`FROM daily_ohlcv` → `FROM daily_ohlcv_with_flow`), so PM can
sequence/parallelize the 9 read-site subtasks independently without a shared blocking window.

### Change 1 — New table `daily_foreign_flow` (infrastructure/db/schema-market-data.ts)

```sql
CREATE TABLE IF NOT EXISTS daily_foreign_flow (
  code               TEXT NOT NULL,
  date               TEXT NOT NULL,
  foreign_buy_vol    REAL,
  foreign_sell_vol   REAL,
  foreign_net_vol    REAL,
  put_through_vol    REAL,
  foreign_buy_value  REAL,
  foreign_sell_value REAL,
  updated_at         TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (code, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_foreign_flow_code_date
  ON daily_foreign_flow(code, date DESC);
```

**Key property that eliminates R-1 (not just shrinks it):** none of this table's columns are tied
to price data, so there is **no NOT NULL constraint that requires an OHLCV row to exist first**.
The write is unconditional — R-1 does not shrink, it structurally cannot occur.

### Change 2 — Unconditional writer (rewrite `writeForeignFlowToOhlcv`)

Replace the merge-only `UPDATE ... WHERE code=? AND date=?` (which can hit `changes=0`) with an
unconditional upsert against the new table:

```sql
INSERT INTO daily_foreign_flow
  (code, date, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol,
   foreign_buy_value, foreign_sell_value, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(code, date) DO UPDATE SET
  foreign_buy_vol    = excluded.foreign_buy_vol,
  foreign_sell_vol   = excluded.foreign_sell_vol,
  foreign_net_vol    = excluded.foreign_net_vol,
  put_through_vol    = excluded.put_through_vol,
  foreign_buy_value  = COALESCE(excluded.foreign_buy_value,  foreign_buy_value),
  foreign_sell_value = COALESCE(excluded.foreign_sell_value, foreign_sell_value),
  updated_at         = excluded.updated_at
```

`writeForeignFlowToOhlcv` **stops writing `daily_ohlcv.foreign_*` entirely** — those columns are
frozen (historical-only) from cutover onward. Return shape stays `{ changes: number }` for caller
compatibility (both existing callers already treat any number as non-error); `changes` is now
**always > 0** for a valid row (never a deferred/dropped write) — this is the direct behavioral
proof R-1 is closed, not merely shortened. Keep a debug log line (renamed, since nothing is deferred
any more) noting whether a matching `daily_ohlcv` row existed yet, for operational visibility only.

This function is Writer G's replacement — same call sites (`foreignFlowFetcher.ts`,
`pushForeignFlowHandler.ts`), zero signature change, so Callers A/B need no code change (only the
implementation swaps under them). Function/file rename (e.g. `foreignFlowStore.ts`, dropping the
`ohlcv` prefix now that it no longer touches `daily_ohlcv`) is a **nice-to-have, not required** —
flag as optional low-priority follow-on to avoid unnecessary import-churn risk on a live P1 task.

### Change 3 — Backward-compatible read view `daily_ohlcv_with_flow`

```sql
CREATE VIEW IF NOT EXISTS daily_ohlcv_with_flow AS
SELECT
  o.code, o.date, o.open, o.high, o.low, o.close, o.volume, o.updated_at, o.data_env,
  COALESCE(f.foreign_buy_vol,   o.foreign_buy_vol)   AS foreign_buy_vol,
  COALESCE(f.foreign_sell_vol,  o.foreign_sell_vol)  AS foreign_sell_vol,
  COALESCE(f.foreign_net_vol,   o.foreign_net_vol)   AS foreign_net_vol,
  COALESCE(f.put_through_vol,   o.put_through_vol)   AS put_through_vol,
  COALESCE(f.foreign_buy_value, o.foreign_buy_value) AS foreign_buy_value,
  COALESCE(f.foreign_sell_value,o.foreign_sell_value) AS foreign_sell_value
FROM daily_ohlcv o
LEFT JOIN daily_foreign_flow f ON f.code = o.code AND f.date = o.date;
```

Same column names as today's `daily_ohlcv` foreign columns → every Class-A read site (§ inventory
above) migrates via a **one-line rename** (`FROM daily_ohlcv` → `FROM daily_ohlcv_with_flow`), no
query-shape change, existing tests stay green. `COALESCE` prefers the new table (post-cutover truth)
but falls back to the frozen legacy column for any `(code,date)` never re-written into the new
table — this is what makes the migration safe without a synchronized flag-day cutover across all 9
files. Both PK-indexed on `(code,date)` → join cost is a single indexed lookup per row, negligible
at this table's scale (per-ticker daily rows, not tick-level).

Class-B (freshness/health) probes should **not** go through the view — they should query
`daily_foreign_flow` directly (`MAX(updated_at) FROM daily_foreign_flow` /
`MAX(updated_at) FROM daily_foreign_flow WHERE foreign_buy_vol IS NOT NULL`). This is a genuine
improvement, not just a rename: today's `WHERE foreign_buy_vol IS NOT NULL FROM daily_ohlcv`
conflates "is the foreign-flow VPS pipeline healthy" with "has the OHLCV pipeline also written a
row" — a stalled OHLCV writer with a perfectly healthy foreign-flow feed currently reads as STALE.
Post-migration, `daily_foreign_flow.updated_at` is a direct, undiluted freshness signal for that one
pipeline.

### Change 4 — One-time backfill (must land before Change 2 goes live)

```sql
INSERT OR IGNORE INTO daily_foreign_flow
  (code, date, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol,
   foreign_buy_value, foreign_sell_value, updated_at)
SELECT code, date, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol,
       foreign_buy_value, foreign_sell_value, updated_at
FROM daily_ohlcv
WHERE foreign_buy_vol IS NOT NULL OR foreign_sell_vol IS NOT NULL;
```

Idempotent (`INSERT OR IGNORE`, safe to run on every boot like `migrateForeignFlowColumns`).
**Mandatory ordering: this backfill MUST run and complete before Change 2's writer cutover ships**,
otherwise the multi-day depth the new table starts with is a strict subset of history, directly
worsening the already-open `get_foreign_accum_rank` residual noted in
`feedback_foreign_flow_deferred_write_race_ohlcv_row.md` (needs multi-day foreign-column depth).

---

## 2. DDD Layer Assignments

| Change | Layer | Rationale |
|---|---|---|
| `daily_foreign_flow` DDL + index + view + backfill | infrastructure/db (`schema-market-data.ts` / `schema.ts`) | Same layer as `daily_ohlcv` DDL — schema definitions live here. No layer change. |
| Writer rewrite (`ohlcvForeignFlowStore.ts`) | infrastructure/db | Correct — DB adapter, no layer change. Optional rename discussed above stays in-layer. |
| 5 Class-A read-site renames | infrastructure/fetchers, interface/mcp/tools, scheduler/*, application/usecases (existing layers, unchanged) | Each file's existing layer is already correct per the codebase's established pattern of direct SQL in tool/scheduler/usecase files (matches `marketWideForeignFlowTool.ts`, `foreignFlowAlertJob.ts`, etc. as they exist today) — this task does not introduce a repository-abstraction layer that doesn't already exist elsewhere in this codebase. |
| 4 Class-B freshness-probe rewires | scheduler/system, interface/mcp/tools/system, scheduler/*, domain/services | Same layers, no change — `vpsHealthPoller.ts` stays in domain/services (it is a health-check registry, not infra I/O itself; the SQL string is a config value it holds). |

No DDD violations introduced. `daily_foreign_flow` stays in infrastructure/db; no application/
or domain/ layer imports infrastructure directly (unchanged posture from the parent design).

---

## 3. Risk Flags

| Risk | Severity | Mitigation |
|---|---|---|
| R-1 (parent): foreign-flow write dropped when no OHLCV row exists | **CLOSED by this design** | Unconditional write to a table with zero price-coupled constraints — structurally cannot occur, not merely windowed. |
| R-6 (new): backfill omitted/out-of-order → multi-day depth regression on cutover day | MEDIUM | Change 4 MUST ship and complete before Change 2 (writer cutover) — explicit subtask dependency, not parallel. Worsens the known `get_foreign_accum_rank` residual if skipped. |
| R-7 (new): a future writer reintroduces a raw write to `daily_ohlcv.foreign_*` after freeze, causing dual-source drift | LOW-MEDIUM | Add the same SSOT-annotation sentinel pattern used for `ohlcvWriteService.ts` (parent design §Writer-Bypass Class Closure) to the new writer's JSDoc: any `daily_ohlcv.foreign_*` write outside this frozen-column note is a violation. No new ESLint rule required for this task — annotation-level guard is sufficient (same posture as parent's P0 scope decision). |
| R-8 (new): view JOIN read-path performance | LOW | Both tables PK-indexed on `(code, date)` — single indexed nested-loop join per row. Read patterns observed (single-ticker history LIMIT N, single-date market-wide scan) are all small result sets; no aggregate full-table scan pattern found that would amplify join cost. |
| R-9 (new): Class-B freshness probes silently reading stale legacy semantics if migration is skipped/deferred | LOW | Not a regression — if Class-B subtask is deferred, probes keep working exactly as today (reading `daily_ohlcv.foreign_buy_vol IS NOT NULL`, which stays valid on frozen historical rows already backfilled by Change 4 and on freshly-written pre-cutover rows). Only the false-negative-decoupling improvement is deferred, not correctness. |
| R-2/R-3/R-4/R-5 (parent, `changes=0`-as-non-error, parallel-write race, `push-ohlcv-history` path, ESLint follow-on) | Superseded/moot | `changes=0` can no longer happen for a valid row under Change 2 (was the whole point of R-2's caller-verification); R-3's "benign no-op UPDATE" race no longer applies (write is now an unconditional upsert, no dependency on `daily_ohlcv` row timing at all); R-4/R-5 unaffected, still valid from parent doc. |

---

## 4. Test Strategy

**Unit (new file, e.g. `daily-foreign-flow-table.test.ts`):**
- T-1 (direct R-1-elimination proof): call `writeForeignFlowToOhlcv([...])` for a `(code,date)` with
  **zero** `daily_ohlcv` rows → assert `changes=1` (not 0), assert
  `SELECT * FROM daily_foreign_flow WHERE code=? AND date=?` returns the row with correct values.
- T-2: same call with an existing `daily_ohlcv` row (no `daily_foreign_flow` row yet) → `daily_foreign_flow`
  row created via the `ON CONFLICT` path's INSERT branch, `daily_ohlcv.foreign_*` columns UNTOUCHED
  (still whatever they were pre-cutover, or NULL for a fresh row).
- T-3: view correctness — insert only into `daily_foreign_flow` (no legacy columns populated) →
  `SELECT foreign_buy_vol FROM daily_ohlcv_with_flow WHERE code=? AND date=?` returns the new-table
  value.
- T-4 (regression proof, direct descendant of parent's T-4): after T-1,
  `SELECT close FROM daily_ohlcv WHERE code=? AND date=?` returns **zero rows** — confirms this
  design does NOT reintroduce the original close=0 stub bug while closing R-1.
- T-5: backfill idempotency — run the Change-4 `INSERT OR IGNORE ... SELECT` twice against a DB
  seeded with legacy `daily_ohlcv.foreign_*` rows → second run is a no-op, no duplicate/error, row
  count in `daily_foreign_flow` unchanged after the 2nd run.

**Integration (behavioral gate, direct enactment of the memory-note symptom):**
- Seed zero `daily_ohlcv` rows for ticker X / date D.
- Call `writeForeignFlowToOhlcv([{code:X, date:D, ...}])` — simulates foreign-flow fetch firing
  before the OHLCV bar.
- Assert `daily_ohlcv_with_flow` (the view every Class-A reader now queries) returns the correct
  `foreign_buy_vol`/`foreign_sell_vol`/`foreign_net_vol` for X/D **even though `daily_ohlcv` itself
  has no row for X/D yet** — this is the literal falsification of the "chưa trả số từng mã" (no
  per-ticker numbers) symptom from `feedback_foreign_flow_deferred_write_race_ohlcv_row.md`.
- Insert the real OHLCV row for X/D afterward (simulate `pushPricesHandler`) → assert the view still
  returns the correct foreign values via the JOIN, and `daily_ohlcv.close` is the real price (not 0).

**Regression:** the ~15 existing foreign-flow test files must stay green after the 5 Class-A
read-site renames (same query shape via the view — no assertion changes expected).

---

## 5. PM Task Atomization

| Subtask | Owner | Scope | Depends |
|---|---|---|---|
| SUBTASK-DAILY-FF-1: `daily_foreign_flow` DDL + index + `daily_ohlcv_with_flow` view (schema-market-data.ts), additive only | dev-mcp-server | New table/view creation, idempotent `CREATE ... IF NOT EXISTS` | none |
| SUBTASK-DAILY-FF-2: one-time backfill (Change 4) | dev-mcp-server | `INSERT OR IGNORE ... SELECT` from legacy `daily_ohlcv.foreign_*`, wired into boot sequence (same pattern as `migrateForeignFlowColumns`) | SUBTASK-DAILY-FF-1 |
| SUBTASK-DAILY-FF-3: writer cutover — `writeForeignFlowToOhlcv` unconditional upsert into `daily_foreign_flow`, stop writing `daily_ohlcv.foreign_*`; unit tests T-1/T-2/T-4/T-5 | dev-mcp-server | `ohlcvForeignFlowStore.ts` rewrite; SSOT-freeze annotation (R-7 mitigation) | SUBTASK-DAILY-FF-2 (backfill MUST land first — R-6) |
| SUBTASK-DAILY-FF-4: migrate 5 Class-A read sites to `daily_ohlcv_with_flow` view (one-line rename each) | dev-mcp-server | `marketWideForeignFlowTool.ts`, `foreignFlowTools.ts`, `foreignFlowAlertJob.ts`, `assembleEveningSummary.ts`, `franceSummaryJob.ts` | SUBTASK-DAILY-FF-1 only (safe in parallel with -2/-3, view COALESCEs both sources throughout transition) |
| SUBTASK-DAILY-FF-5: migrate 4 Class-B freshness/health probes to query `daily_foreign_flow` directly | dev-mcp-server | `freshnessSlaMonitorJob.ts`, `slaStatusTools.ts`, `vpsProxyWatchdogJob.ts`, `vpsHealthPoller.ts` | SUBTASK-DAILY-FF-1 only (parallel-safe with -3/-4) |
| SUBTASK-DAILY-FF-6: integration test T-3 + behavioral gate (view-correctness + R-1-elimination proof) | dev-mcp-server | New integration test per §4 | SUBTASK-DAILY-FF-3 + SUBTASK-DAILY-FF-4 |
| SUBTASK-DAILY-FF-7 (follow-on, not required this sprint): legacy `daily_ohlcv.foreign_*` column deprecation comment / eventual removal | dev-mcp-server | Schema-comment-only update marking columns frozen/historical; NOT a `DROP COLUMN` (same "table rebuild HIGH RISK on live named-volume DB" posture as parent doc §Root Cause) | SUBTASK-DAILY-FF-3 |

**Suggested execution order:** -1 → -2 → -3 (strict, R-6). -4 and -5 can run any time after -1,
in parallel with -2/-3 or with each other. -6 needs -3 and -4 both landed. -7 is optional backlog.

---

## [Architect] Brownfield Findings

- **Zone:** `apps/mcp-server/`
- **Verified paths:**
  - `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts:53-114` — shipped merge-only UPDATE (Writer G post-parent-fix); confirmed unchanged since 06-17, still drops writes on `changes=0`
  - `apps/mcp-server/src/infrastructure/db/schema-market-data.ts:88-105` — `daily_ohlcv` DDL, `close REAL NOT NULL` still blocks foreign-flow-only INSERT (unchanged)
  - `apps/mcp-server/src/infrastructure/db/schema.ts:278-300` — `migrateForeignFlowColumns()`, reusable idempotent ALTER-COLUMN pattern
  - `apps/mcp-server/src/domain/models/shared-types.ts:161-171` — `WriteForeignFlowItem`, reusable row shape as-is
  - 9 read-site files (full table in § Read-site inventory above) — new recon this cycle, not covered by parent doc
- **Reuse patterns:**
  - `WriteForeignFlowItem` domain type reused unchanged for the new table's row shape — no new DTO needed.
  - `migrateForeignFlowColumns()`'s idempotent ALTER-TABLE pattern is the template for the backfill's idempotent `INSERT OR IGNORE` migration.
  - Compatibility VIEW pattern (not used elsewhere in this codebase yet) chosen specifically to avoid a big-bang rip-and-replace across 9 read sites + ~15 tests coupled to `daily_ohlcv.foreign_*` column names.
- **Design decisions:**
  - Layer: infrastructure/db for schema+writer (no layer change); read sites keep their existing layers (this codebase does not have a repository-abstraction layer for this data, consistent with existing direct-SQL pattern).
  - Approach: additive new table (Option F from parent doc) + read-compatibility view, NOT a column migration/removal in this sprint.
  - Ordering invariant: backfill (Change 4) before writer cutover (Change 2) — R-6.
  - Freshness probes (Class B) get a genuine decoupling improvement, not just a rename — closes a latent false-negative (OHLCV-stall masquerading as foreign-flow-pipeline-stale).
- **Scan clean:** true
- **BUILD-STANDARD:** not-applicable (schema addition + hardening, in-zone, no new service/primitive)

---

## Shared Verification Gate

Non-blocking P1 — no forced next-market-open gate. Recommended verification once SUBTASK-DAILY-FF-1
through -6 ship + rebuild:
- Live RAW probe `get_market_foreign_flow(days=1)` per-ticker during the 02:00–04:30Z gap window
  (before that ticker's OHLCV bar has landed) returns populated (non-zero/non-empty) values — directly
  falsifies the "chưa trả số từng mã" symptom.
- Live `daily_ohlcv` probe: zero rows with `close=0` (T-4 regression proof holds live — this design
  must never reopen the original stub-INSERT bug while closing R-1).
- `get_foreign_accum_rank` residual (noted in `feedback_foreign_flow_deferred_write_race_ohlcv_row.md`)
  re-probed post-backfill — expected: multi-day depth preserved (not reset to zero), residual may
  persist for other reasons but must not be made WORSE by this migration.
