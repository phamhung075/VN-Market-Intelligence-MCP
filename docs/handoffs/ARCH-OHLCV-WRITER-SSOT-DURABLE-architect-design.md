---
<!-- size-justification: 200L — P0 recurring-class (4th recurrence); root-cause matrix, schema constraint resolution, two-strategy design, SQL shape, DDD layer assignments, and writer-bypass lint gate are all load-bearing for PM atomization + dev implementation. -->

id: ARCH-OHLCV-WRITER-SSOT-DURABLE-architect-design
version: "2026-06-17"
authored_by: architect
status: READY_FOR_PM
zone: apps/mcp-server/
task_ref: ARCH-OHLCV-WRITER-SSOT-DURABLE
build_standard: not-applicable
---

# [Architect] Brownfield Findings + Technical Design
# ARCH-OHLCV-WRITER-SSOT-DURABLE

---

## Zone

`apps/mcp-server/` — single zone. All changes (store, SSOT service, SQL, lint) stay here.
BUILD-STANDARD: not-applicable (bug-fix / hardening, no new service / primitive / port).

---

## Verified Paths (recon)

| File | Role | Key finding |
|---|---|---|
| `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts` | Writer G (bypassing) | L57-69: raw `INSERT INTO daily_ohlcv ... VALUES (?,?,0,0,0,0,0,...)` — inserts all-zero OHLCV stub to satisfy NOT NULL; only caller is `foreignFlowFetcher.ts` (dynamic import) + `pushForeignFlowHandler.ts` (direct import). Foreign-flow columns: `foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol, foreign_buy_value, foreign_sell_value`. |
| `apps/mcp-server/src/infrastructure/db/schema-market-data.ts` | Schema SSOT | L90-107: `daily_ohlcv` DDL — `open/high/low NOT NULL DEFAULT 0`, `close REAL NOT NULL` (no default), `volume REAL NOT NULL DEFAULT 0`. Foreign flow columns (`foreign_buy_vol` etc.) added via `migrateForeignFlowColumns()` with no NOT NULL — they are nullable REAL. |
| `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts` | SSOT chokepoint | Pipeline: C=0 reject → FR-S1 seed-bar skip → normalizeOhlcvToVnd → detectAndNormalize → validateOhlcvUnit → SQL upsert. Two strategies: `backfill` (overwrite) / `intraday` (accumulate-high). Does NOT write foreign-flow columns — the ON CONFLICT clause lists only `open/high/low/close/volume/updated_at`. |
| `apps/mcp-server/src/infrastructure/fetchers/foreignFlowFetcher.ts` | Caller A | L136-137 (path 1) + L219-220 (path 2): dynamic import + call to `writeForeignFlowToOhlcv`. No direct DB handle passed — store uses `getDb()` internally. |
| `apps/mcp-server/src/interface/mcp/routes/pushForeignFlowHandler.ts` | Caller B | L319: direct import + call to `writeForeignFlowToOhlcv`. Receives db from handler context. |
| `apps/mcp-server/src/interface/mcp/server.ts` | Secondary OHLCV path | L1243-1256: `push-ohlcv-history` endpoint — `ON CONFLICT DO UPDATE SET` (R-1 fixed). Does NOT write foreign-flow columns. Already has `open <= 0 || close <= 0 → continue` guard at L1264. No change needed here. |
| `apps/mcp-server/src/infrastructure/fetchers/ohlcvBackfill.ts` | Writer E | `INSERT OR IGNORE`; already has FR-S1 flat-seed skip + validateOhlcvUnit. Fully migrated from SSOT perspective — uses its own inline INSERT OR IGNORE (historical backfill, safe). |
| `apps/mcp-server/src/domain/services/priceBackfillService.ts` | Domain service | `INSERT OR IGNORE`, historical backfill only. Not a live-market writer — scope: not affected. |

---

## 1. Schema Constraint Analysis

`close REAL NOT NULL` — no DEFAULT.
`open/high/low REAL NOT NULL DEFAULT 0` — default exists but semantically wrong for a foreign-flow-only row.
`volume REAL NOT NULL DEFAULT 0`.

The existing stub INSERT sets `open=0, high=0, low=0, close=0, volume=0` to satisfy these constraints. The core problem: `close=0` satisfies NOT NULL but is a lie — it claims there is a close price of zero, which is physically impossible on VN market and poisons every TA consumer.

**Constraint resolution options:**

| Option | Approach | Assessment |
|---|---|---|
| A. NULL close | `ALTER TABLE daily_ohlcv ALTER COLUMN close DROP NOT NULL` (unsupported in SQLite) | BLOCKED — SQLite does not support DROP NOT NULL without a full table rebuild |
| B. NULL via table rebuild | Recreate `daily_ohlcv` with `close REAL` (nullable) + migration | HIGH RISK — named-volume live DB with 1200+ tickers/years of data; rebuild window = downtime; all readers must be audited for NULL handling; overkill for this scope |
| C. No INSERT on absent OHLCV | Do NOT insert a daily_ohlcv row at all when the OHLCV bar has not yet arrived; persist foreign-flow data in a **separate staging table** until the OHLCV bar lands, then merge | COMPLEX — adds a new table + merge job; correct but large scope for P0 |
| D. Foreign-flow-only INSERT with sentinel close | Insert with `close = NULL` impossible (NOT NULL); use a recognizable sentinel like `-1` | DANGEROUS — sentinel would still corrupt RSI (close=-1 in window) |
| E. UPSERT-only, no INSERT on absent row | Change the SQL from INSERT … ON CONFLICT to UPDATE-only when the row is absent: skip the INSERT path, only UPDATE existing rows | LOSES foreign-flow data for tickers that arrive before OHLCV — breaks /goal#1 foreign-flow data preservation |
| F. Separate `daily_foreign_flow` table (CANONICAL) | Persist foreign-flow columns in a dedicated table keyed `(code, date)`; remove the daily_ohlcv stub INSERT entirely; join at read time | CLEAN, DURABLE, /goal#2 generic — but schema migration + reader audit = SPRINT-L scope, not P0 |
| **G. INSERT-only-on-conflict (merge-only posture)** | Replace INSERT…ON CONFLICT with two SQL operations: (1) `UPDATE daily_ohlcv SET foreign_cols WHERE code=? AND date=?` for existing rows; (2) skip entirely when no row yet exists (no stub INSERT). Accept that foreign-flow data for a ticker NOT yet in daily_ohlcv is **dropped** until the OHLCV bar arrives (within 2–3 hours). | ACCEPTABLE for P0 IF the foreign-flow arrival window is understood — see §2 |

**Selected approach: G (merge-only) for P0 + F (separate table) queued as follow-on.**

Rationale: At market open (02:00Z), the foreign-flow fetch fires. The real OHLCV bar arrives at 02:30–03:00Z via VPS push (pushPricesHandler). For the 30 watchlist tickers, the OHLCV bar is always populated by ~04:30Z at the latest (confirmed by self-heal window). The 2–3 hour gap where foreign-flow data is dropped (because no row exists yet) is acceptable under /goal#1 — an honest gap (no row) is better than a fake C=0 stub. The foreign-flow fetch for EXISTING rows (yesterday's, prior days') is not affected — UPDATE works when the row exists. Only today's new row (the first one for a trading day) loses foreign-flow during the gap window.

---

## 2. Design — Two Concrete Changes

### Change 1: Rewrite `writeForeignFlowToOhlcv` — merge-only (no stub INSERT)

**File:** `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts`

Replace the current INSERT … ON CONFLICT with **two separate SQL statements**:

**SQL-1 — UPDATE existing row** (row already has OHLCV data):
```sql
UPDATE daily_ohlcv
SET
  foreign_buy_vol   = ?,
  foreign_sell_vol  = ?,
  foreign_net_vol   = ?,
  put_through_vol   = ?,
  foreign_buy_value  = COALESCE(?, foreign_buy_value),
  foreign_sell_value = COALESCE(?, foreign_sell_value),
  updated_at = ?
WHERE code = ? AND date = ?
```

**SQL-2 — INSERT foreign-flow-only row** (no OHLCV row yet — BUT only if OHLCV columns can be NULL):

Since `close REAL NOT NULL` has no default, SQL-2 cannot be a pure INSERT without OHLCV. Therefore: **SQL-2 does not exist.** When the UPDATE returns `changes = 0`, the function logs at debug level (`[ohlcvForeignFlowStore] no OHLCV row yet for {code} {date} — foreign-flow deferred`) and continues to the next row. No stub is created.

**Return value:** `{ changes: number }` — reflects UPDATE hits only (rows that already had OHLCV). The caller treats 0 as a deferred write, not an error.

**Ordering invariant note:** The real OHLCV bar (pushPricesHandler, Writer A) inserts the row. If foreign-flow fires after pushPrices, the UPDATE immediately populates the columns. If it fires before, the data is deferred. This is the documented 02:00Z–04:30Z window gap. The follow-on F (separate table) eliminates this gap for future sprints.

### Change 2: Add a writer-bypass lint guard to `writeOhlcvBatch` SSOT

**File:** `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts`

Add a **JSDoc annotation** at the top of the file that explicitly documents the exhaustive writer set and mandates all raw `INSERT INTO daily_ohlcv` must route through this function. This is the documentation-level choke-point.

Additionally, add a **`eslint-disable` comment sentinel** mechanism: create a `/* OHLCV-WRITE-BYPASS-ALLOWED */` pattern that must be present on any intentional raw INSERT. Without it, a new developer writing a raw INSERT will get a custom ESLint rule violation.

**Custom ESLint rule** (optional for this sprint — queue as follow-on LINT-OHLCV-WRITE-BYPASS):
- Rule: in `apps/mcp-server/src/`, any `INSERT INTO daily_ohlcv` literal in a `.ts` file that is NOT `ohlcvWriteService.ts` and does NOT have the `/* OHLCV-WRITE-BYPASS-ALLOWED */` sentinel on the prior line → error.
- Covers: `ohlcvForeignFlowStore.ts` (now removed), `server.ts` push-ohlcv-history path, `ohlcvBackfill.ts`, `priceBackfillService.ts`. All legitimate bypasses get the sentinel + a comment explaining why.
- DDD note: This rule is in `infrastructure/fetchers` and `interface/mcp` — the choke-point enforcer lives at the file level via ESLint, not a runtime guard.

**For P0 scope:** The JSDoc annotation is mandatory. The ESLint rule is a follow-on (LINT-OHLCV-WRITE-BYPASS).

---

## 3. DDD Layer Assignments

| Change | Layer | Rationale |
|---|---|---|
| `ohlcvForeignFlowStore.ts` SQL rewrite | infrastructure/db | Correct — DB adapter. No layer change needed. |
| `ohlcvWriteService.ts` SSOT annotation | application/usecases | Correct layer — already the SSOT. |
| `daily_foreign_flow` table (follow-on F) | infrastructure/db (schema) + domain/models (type) | New table = schema-market-data.ts addition; new DTO in domain/models/shared-types.ts. |

No DDD violations introduced. `ohlcvForeignFlowStore.ts` stays in infrastructure/db — it does not import from application/ (correct direction: infrastructure is imported by application, not the reverse).

---

## 4. Risk Flags

| Risk | Severity | Mitigation |
|---|---|---|
| R-1: Foreign-flow data lost for tickers with no OHLCV row at fetch time | MEDIUM | Accepted for P0. Window is 02:00Z–04:30Z max. /goal#1 honest gap beats fake 0. Follow-on F eliminates. |
| R-2: `changes=0` treated as error by callers | LOW | Both callers (`foreignFlowFetcher.ts`, `pushForeignFlowHandler.ts`) currently use `const { changes } = await writeForeignFlowToOhlcv(...)` and log changes. `changes=0` is not an error path — confirm callers do not throw/reject on 0. Dev must verify L319+L329 of pushForeignFlowHandler.ts and L137 of foreignFlowFetcher.ts. |
| R-3: Parallel foreign-flow + OHLCV INSERT race | LOW | If pushPricesHandler and foreignFlowFetcher run concurrently at 02:00Z, the UPDATE in the new writeForeignFlowToOhlcv will land on 0 changes (no OHLCV row yet). Benign — the UPDATE is a no-op. No race condition introduced (was previously: stub INSERT wins, real OHLCV UPSERT repairs later). |
| R-4: `server.ts` push-ohlcv-history path | LOW | Already has `open <= 0 || close <= 0 → continue` guard (L1264). No foreign-flow write path in this handler. No change needed. |
| R-5: ESLint rule missing allows new bypass writers | LOW-MEDIUM | Mitigated by JSDoc annotation. ESLint rule (LINT-OHLCV-WRITE-BYPASS) queued as follow-on. PM creates child task. |

---

## 5. Test Strategy

**Unit tests (in ohlcvForeignFlowStore.test.ts or new file):**

- T-1: `writeForeignFlowToOhlcv` with no existing daily_ohlcv row → returns `{ changes: 0 }`, zero rows inserted into daily_ohlcv, log debug emitted.
- T-2: `writeForeignFlowToOhlcv` with existing daily_ohlcv row → returns `{ changes: 1 }`, foreign-flow columns updated, OHLCV columns (open/high/low/close/volume) UNTOUCHED.
- T-3: After calling `writeForeignFlowToOhlcv` when no row existed + then inserting a real OHLCV row (simulate pushPricesHandler path): foreign-flow columns on the new row are NULL (not populated by the store — dev must then call writeForeignFlowToOhlcv again to populate; this is documented behavior).
- T-4 (regression): after T-1, query `SELECT close FROM daily_ohlcv WHERE code=X AND date=Y` → zero rows (NOT `close=0`). This is the direct regression proof.

**Integration test (behavioral gate):**
- Seed DB with zero daily_ohlcv rows for ticker X date D.
- Call `writeForeignFlowToOhlcv([{code:X, date:D, ...}])`.
- Assert: `SELECT COUNT(*) FROM daily_ohlcv WHERE code=X AND date=D` = 0.
- Insert a real OHLCV row for X/D (simulating pushPricesHandler at 03:00Z).
- Call `writeForeignFlowToOhlcv([{code:X, date:D, ...}])` again.
- Assert: `SELECT foreign_buy_vol FROM daily_ohlcv WHERE code=X AND date=D` = expected value.
- Assert: `SELECT close FROM daily_ohlcv WHERE code=X AND date=D` = real close (not 0).

---

## 6. PM Task Atomization

| Subtask | Owner | Scope | Depends |
|---|---|---|---|
| SUBTASK-1: Rewrite `writeForeignFlowToOhlcv` — merge-only SQL (no stub INSERT) | dev-mcp-server | `ohlcvForeignFlowStore.ts` L57-69 replace; verify `changes=0` non-error in both callers | none |
| SUBTASK-2: Add SSOT annotation to `ohlcvWriteService.ts` | dev-mcp-server | JSDoc update; comment sentinel pattern | none (parallel with SUBTASK-1) |
| SUBTASK-3: Unit tests T-1 through T-4 | dev-mcp-server | `ohlcvForeignFlowStore.test.ts` | SUBTASK-1 |
| SUBTASK-4 (follow-on, not P0): LINT-OHLCV-WRITE-BYPASS ESLint rule | dev-mcp-server | Custom ESLint rule for raw INSERT guard | SUBTASK-1 done |
| SUBTASK-5 (follow-on, not P0): `daily_foreign_flow` staging table | architect (design) + dev-mcp-server | Separate table to eliminate R-1 data-loss window | new ARCH task |

**P0 scope = SUBTASK-1 + SUBTASK-2 + SUBTASK-3.**

---

## [Architect] Brownfield Findings

- **Zone:** `apps/mcp-server/`
- **Verified paths:**
  - `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts:57-69` — bypassing INSERT with all-zero OHLCV stub
  - `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts` — SSOT chokepoint (C=0 reject guard already present)
  - `apps/mcp-server/src/infrastructure/db/schema-market-data.ts:96` — `close REAL NOT NULL` (no default); blocks NULL-close INSERT
  - `apps/mcp-server/src/infrastructure/fetchers/foreignFlowFetcher.ts:136-137,219-220` — two call sites for writeForeignFlowToOhlcv
  - `apps/mcp-server/src/interface/mcp/routes/pushForeignFlowHandler.ts:319` — third call site
  - `apps/mcp-server/src/interface/mcp/server.ts:1264` — push-ohlcv-history guard already present (no change)
- **Reuse patterns:**
  - `writeOhlcvBatch` pipeline (C=0 guard, FR-S1, normalizeOhlcvToVnd, validateOhlcvUnit) is not invoked by writeForeignFlowToOhlcv. The foreign-flow writer does NOT write OHLCV values — it writes foreign-flow columns only. Routing through writeOhlcvBatch would require fabricating OHLCV values (wrong). The correct path is: stop the stub INSERT, use UPDATE-only for existing rows.
- **Design decisions:**
  - Layer: infrastructure/db — no layer change.
  - Approach: merge-only UPDATE (no INSERT when OHLCV absent); deferred gap for new rows.
  - Schema constraint: `close NOT NULL` blocks NULL-close INSERT; table rebuild rejected (HIGH RISK on live named-volume DB); separate table is the durable follow-on.
  - Writer-bypass guard: JSDoc + ESLint rule follow-on (LINT-OHLCV-WRITE-BYPASS).
- **Scan clean:** true
- **BUILD-STANDARD:** not-applicable (bug-fix/hardening, in-zone, no new primitives)

---

## Shared Verification Gate

As specified in the task: NEXT VN market open **2026-06-18** — morning briefing 01:00Z + first TA scan 02:15Z must show:
- RSI matching canonical within 0.1pt, no single-digit/no 100.0 for any of 30 tickers
- No "giá 0 / ÷1000 dưới BB" MARKET messages
- Live `daily_ohlcv` probe 02:00–03:30Z: ZERO rows with `close=0` on the latest bar for any watchlist ticker
- RAW `get_unreviewed_market_messages` confirms no spam

Verify at 02:15Z, NOT at 04:30Z (self-heal masks stubs after real OHLCV lands).
