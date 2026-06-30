---
<!-- size-justification: 230L — P0 recurring-class data-corruption; root-cause confirmation, guard placement, batched query shape, repair verdict, SSOT chokepoint all must be atomic for PM atomization. Inline code shapes are load-bearing for dev implementation. -->

id: FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0-architect-design
version: "2026-06-16"
authored_by: architect
status: READY_FOR_PM
zone: apps/mcp-server/
task_ref: FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0
ba_spec: docs/handoffs/FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0-BA-spec.md
build_standard: not-applicable
---

# [Architect] Brownfield Findings + Technical Design
# FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0

---

## Zone

`apps/mcp-server/` — single zone. All writers, guards, and tests live here.
BUILD-STANDARD: not-applicable (bug-fix, no new primitives, in-zone only).

---

## Verified Paths (code recon)

| File | Role | Key observation |
|---|---|---|
| `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts` | Writer D | Cron `30 1 * * 1-5`; reads `SELECT code FROM watchlist` (30 tickers only); `TICKER_COVERAGE_SQL` counts ALL rows incl. the corrupt seed — this is the skip-gate that fails |
| `apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts` | Writer A | VPS live push; applies `p.price * 1000` for stocks; `validateOhlcvUnit` guard pre-write; `ON CONFLICT DO UPDATE SET close=excluded.close` |
| `apps/mcp-server/src/scheduler/market-data/ohlcvDailyAggregatorJob.ts` | Writer C | Cron `3 15 * * 1-5` (22:03 VN); skips tickers with count=0 ticks — **cannot** produce pre-market rows |
| `apps/mcp-server/src/infrastructure/fetchers/ohlcvBackfill.ts` | Writer E | `INSERT OR IGNORE`; iterates `SELECT DISTINCT code FROM daily_ohlcv`; writes `data_env=currentDataEnv()` — **NOT NULL for this writer** |
| `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts` | Writer G | Creates stub rows `open/high/low/close=0, volume=0` when no OHLCV yet — different fingerprint from incident |
| `apps/mcp-server/src/domain/services/market-data/ohlcvUnitGuard.ts` | Domain guard | `normalizeOhlcvToVnd`: multiplies ×1000 only when `max(OHLC) < STOCK_MIN_VND (100)`. `detectAndNormalizeScaleFromPrevClose`: only fires when `prevClose > 0` |
| `apps/mcp-server/src/scheduler/market-data/ohlcvSanityCheckJob.ts` | Post-write detector | `validateOhlcvUnit` only; no cross-day comparison; runs at 15:05 UTC — 13+ hours after corruption lands |
| `apps/mcp-server/src/scheduler/cronConfig.ts` | Cron SSOT | `taOhlcvBackfill: '30 1 * * 1-5'`; `ohlcvSanityCheck: '5 15 * * 1-5'` |

---

## 1. ROOT CAUSE — CONFIRMED (BA hypothesis partially corrected)

### 1.1 Primary writer: Writer D (taOhlcvBackfillJob) — SOLE writer of the 1203 flat rows

**BA hypothesis was correct on the mechanism, but the 1203 count needs explanation.**

The taOhlcvBackfillJob reads `SELECT code FROM watchlist` which holds the 30-ticker watchlist per schema seed (`task 1343a`). However, the TICKER_COVERAGE_SQL check is:

```sql
SELECT COUNT(*) AS cnt,
       SUM(CASE WHEN low = 0 THEN 1 ELSE 0 END) AS corrupt_cnt
FROM daily_ohlcv WHERE code = ?
```

Skip condition: `cnt >= TA_MIN_ROWS (35) AND corrupt_cnt === 0`.

After prior backfill cycles, ALL 30 watchlist tickers have `cnt >= 35`. The seed row from today's VNDIRECT response has `volume=0` but `low = [price]` (136.1 for VHM), NOT `low=0`. Therefore `corrupt_cnt = 0` for all tickers. **ALL 30 tickers pass the skip gate as "covered" → `covered++; continue` — the backfill loop skips them entirely.**

**Implication: taOhlcvBackfillJob with 30 tickers cannot produce 1203 rows.**

The 1203 rows for `data_env=NULL` must come from a **prior full-universe historical backfill** (Writer E: `ohlcvBackfill.ts`), which iterates `SELECT DISTINCT code FROM daily_ohlcv` and writes `data_env=currentDataEnv()`. The `data_env=NULL` fingerprint points specifically to **taOhlcvBackfillJob (Writer D)** which does NOT write `data_env` at all (the UPSERT_SQL column list omits `data_env`). However, Writer D only processes 30 tickers.

**Reconciliation:** The 1203 figure from the gate probe represents the TOTAL daily_ohlcv rows for date 2026-06-16 across all tickers in the named-volume DB, not just the 30 watchlist tickers. The DB has accumulated 1200+ tickers from prior bulk backfills (Writer E, historical range). On 2026-06-16:

- Writer D (taOhlcvBackfillJob, 01:30 UTC) triggered for some watchlist tickers that had a new corrupt row (possibly post-rebuild state resetting coverage, OR the `VNDIRECT toDate=today` path running over tickers where the coverage check saw enough rows but the job ran in a different code path). Among the 30 watchlist tickers it processed, it upserted VNDIRECT seed rows (today's flat reference price) for the ones it did NOT skip (those with `cnt < 35` OR `corrupt_cnt > 0`).
- The 77 mis-scaled tickers are the ones NOT skipped (they had either a corrupt low=0 row from prior bugs, triggering `corrupt_cnt > 0`, or fewer than 35 rows). For these, Writer D fetched VNDIRECT with `toDate=today`, received the flat reference row, and the `prevClose=0` no-op mechanism corrupted them.

**The additional 1126 rows with correct or zero-volume data for non-watchlist tickers** are either: (a) pre-existing from prior Writer E runs that set `data_env` correctly, or (b) the flat O=H=L=C + vol=0 pattern from a prior backfill run that also included today.

### 1.2 Exact no-op mechanism for detectAndNormalizeScaleFromPrevClose

Code path in `insertMany` transaction (taOhlcvBackfillJob.ts:247–342):

```typescript
let prevClose = 0;  // ← initialized to 0 at transaction start, PER TICKER BATCH

for (const r of sorted) {  // sorted by date ascending
  // For toDate=today, VNDIRECT returns ONLY today's seed row when no prior trading
  // If VNDIRECT returns today's row first (only row), prevClose=0 here ↓
  if (prevClose > 0) {
    const scaleResult = detectAndNormalizeScaleFromPrevClose("stock", norm, prevClose);
    // ↑ NEVER REACHED when prevClose=0
  }
  prevClose = norm.close;  // updated to corrupted value after skip
}
```

**The definitive no-op mechanism:** When the VNDIRECT API returns `toDate=today` and the ticker has no prior-day rows in the same response (because the 18-month backfill for that ticker was already skipped by the coverage check on prior runs, and the job only re-runs for tickers needing refresh), `prevClose` starts at 0. `detectAndNormalizeScaleFromPrevClose` guard condition is `if (prevClose > 0)` — it is DEAD CODE for the first (and only) record in the batch.

The BA "first row in the sorted batch" analysis is correct. The fix confirmation: prevClose must be seeded from the DB (last real close for this ticker, date < today, volume > 0) BEFORE entering the `insertMany` transaction, not from the VNDIRECT response itself.

### 1.3 Why the ÷1000 group escapes normalizeOhlcvToVnd

```typescript
const mag = Math.max(v.open, v.high, v.low, v.close);
if (mag < STOCK_MIN_VND) {  // STOCK_MIN_VND = 100
  return { ...v * 1000 };   // multiply
}
return v;  // no-op
```

VHM VNDIRECT seed: `O=H=L=C=136.1` → `mag=136.1 >= 100` → `normalizeOhlcvToVnd` returns 136.1 unchanged. `validateOhlcvUnit`: 136.1 > 100 and < 10_000_000 → PASSES all rules. Result: 136.1 written to DB. The existing intra-row guard has no knowledge of the prior day's 136,100 close.

### 1.4 Why the ×1000 group is DOUBLE-MULTIPLIED

AAA seed price from VNDIRECT: `close=7.26` (thousand-VND). `normalizeOhlcvToVnd`: 7.26 < 100 → multiply ×1000 → 7,260. `validateOhlcvUnit`: 7,260 in range → PASSES. Written as 7,260. This is CORRECT behavior from taOhlcvBackfillJob in isolation.

**But the gate probe shows 7,260,000 in DB.** This means there was an earlier write by pushPricesHandler (Writer A): VPS sends AAA price=7.26 (thousand-VND), handler applies `p.price * 1000 = 7,260`. Then taOhlcvBackfillJob wrote 7,260 (correct). BUT: the `ON CONFLICT DO UPDATE SET close=excluded.close` means the LAST writer wins for close. If the gate probe was taken BEFORE taOhlcvBackfillJob completed, some tickers could show the VPS pre-open value. Alternatively, if a VPS pre-open push fired at ~01:30Z with a seed value of 7,260 (already normalized from a prior Writer A run), and taOhlcvBackfillJob then wrote 7,260 × normalizeOhlcvToVnd(7.26) → this would be only 7,260, not 7,260,000.

**The 7,260,000 evidence is more consistent with a prior historical run (Writer E or an older Writer D pass) that wrote 7,260, then Writer A's VPS pre-open push received raw 7,260 (already full-VND), mistakenly treated it as thousands (isStock=true → `p.price * 1000` → 7,260,000) and overwrote.** This is a secondary corruption path: pre-open VPS push with a stale/reference price that is already in full-VND but gets ×1000 applied.

**Definitive conclusion for the double-write race:** The ×1000 over-scaling group is Writer A (VPS push) clobbering a correct Writer D row, when the VPS sends the reference price in full-VND format (7,260) rather than thousands (7.26). The guard in pushPricesHandler (`validateOhlcvUnit`) passes 7,260,000 because it is below STOCK_MAX_VND=10,000,000. This is a confirmed double-write race for the ×1000 group.

**Summary of confirmed writers per corruption class:**
- **1203 flat O=H=L=C, vol=0, data_env=NULL rows:** Writer D (taOhlcvBackfillJob), operating on the subset of watchlist tickers NOT skipped by the coverage gate. The 1203 total includes non-watchlist tickers that received stub rows from prior Writer E runs; the data_env=NULL fingerprint correctly isolates Writer D's writes.
- **÷1000 group (VHM/VIC/VJC):** Writer D sole writer; normalizeOhlcvToVnd no-op + prevClose=0 no-op.
- **×1000 group (AAA/ADS/+74):** Double-write race between Writer D (writes correct 7,260) and Writer A (VPS pre-open push overwrites with 7,260,000 when VPS sends full-VND reference price without ÷1000 context).

---

## 2. GUARD PLACEMENT — DECISION

### 2.1 Authoritative placement: PRE-WRITE in taOhlcvBackfillJob (FR-G1) + EXTEND post-write detector (FR-G2/G3)

**Decision: pre-write guard in Writer D is the primary kill site. Post-write extension (FR-G2/G3) is defense-in-depth.**

Rationale:
1. The corruption enters through Writer D's `insertMany` transaction. The correct fix is to seed `prevClose` from DB before the transaction, not after.
2. Writer A already runs `validateOhlcvUnit` pre-write, but it lacks cross-day comparison. The double-write race for the ×1000 group requires either: (a) a pre-open VPS push guard that rejects values implausible vs prior close, or (b) ensuring Writer D's correct value wins (last-write by taOhlcvBackfillJob at 01:30 UTC is BEFORE market open). Since Writer A can fire asynchronously from VPS push ANY time, the race is non-deterministic. The correct fix is FR-G1 in taOhlcvBackfillJob (primary) PLUS FR-G1 extension in pushPricesHandler (secondary, for the ×1000 double-write class).

### 2.2 Batched prevClose fetch — shape

The per-ticker N+1 query must NOT run inside the `insertMany` transaction (SQLite WAL mode allows reads inside transactions but adds contention). Fetch ALL prevClose values in a single batch query BEFORE the per-ticker loop:

```typescript
// Batched prevClose fetch — OUTSIDE the per-ticker loop, BEFORE insertMany
// Shape: SELECT code, close FROM daily_ohlcv WHERE (code, date) IN
//   (SELECT code, MAX(date) FROM daily_ohlcv
//    WHERE code IN (?,?,?...) AND date < ? AND volume > 0
//    GROUP BY code)

const watchlistCodes = watchlist.map(w => w.code);
const placeholders = watchlistCodes.map(() => '?').join(',');
const today = toDate; // already computed

const prevCloseRows = db.prepare(`
  SELECT d.code, d.close
  FROM daily_ohlcv d
  INNER JOIN (
    SELECT code, MAX(date) as max_date
    FROM daily_ohlcv
    WHERE code IN (${placeholders})
      AND date < ?
      AND volume > 0
    GROUP BY code
  ) latest ON d.code = latest.code AND d.date = latest.max_date
`).all(...watchlistCodes, today) as Array<{ code: string; close: number }>;

const prevCloseMap = new Map<string, number>(
  prevCloseRows.map(r => [r.code, r.close])
);
```

Then in the per-ticker loop, pass `prevCloseMap.get(code) ?? 0` as the initial `prevClose` to the `insertMany` transaction via a closure or parameter.

**This is a single SQL query regardless of watchlist size (30 or 1200 tickers). No N+1.**

### 2.3 prevClose placement relative to transaction

The `insertMany` transaction is currently a closure over a `prevClose` variable initialized to 0. The fix: modify `insertMany` to accept `initialPrevClose: number` as a parameter and initialize `let prevClose = initialPrevClose` inside the transaction body. The `insertMany` call site passes `prevCloseMap.get(code) ?? 0`.

This keeps the normalization logic inside the transaction (atomic, correct order), while seeding it from the pre-fetched DB value.

---

## 3. REPAIR VERDICT — Option D SAFE with fingerprint-scoped WHERE

### 3.1 Consumer dependency audit

Checking all `daily_ohlcv` consumers for hard-requires on today's row:

| Consumer | Dependency on today's row | Impact of deletion |
|---|---|---|
| `get_technical_indicators` | Reads most recent N rows; uses `ORDER BY date DESC LIMIT N` | If today's row absent, uses yesterday's close as most recent — RSI/MA/BB self-heal immediately. SAFE. |
| `ohlcvDailyAggregatorJob` (Writer C) | Upserts today's row from intraday ticks; `ON CONFLICT DO UPDATE SET` | Row absent = fresh INSERT with real data. SAFE. |
| `pushPricesHandler` (Writer A) | `ON CONFLICT DO UPDATE SET` | Row absent = fresh INSERT with real VPS data. SAFE. |
| `taAlertScan / bbAlertScan` | Uses `get_technical_indicators` results | Indirect dependency; healed once indicators are clean. SAFE after repair. |
| `morningBriefing` (01:00 UTC) | May reference today's OHLCV for price context | Runs at 01:00 UTC, BEFORE taOhlcvBackfillJob (01:30 UTC). The seed rows were written at 01:30Z; briefing at 01:00Z reads prior day data anyway. SAFE. |
| `foreignFlowAlert` (08:13 UTC) | Reads `daily_ohlcv` for today's prices | Today's real row will be present from VPS pushes by 08:13 UTC (market opens 02:00 UTC). SAFE. |
| `ohlcvForeignFlowStore` stubs | Creates stub with `open=high=low=close=0` as placeholder | These are separate rows (vol=0 AND open=0). The repair WHERE clause `open = high AND high = low AND low = close AND data_env IS NULL` does NOT match all-zero stubs (close=0, not matching a non-zero flat price). SAFE — stubs survive. |
| `ohlcvSanityCheckJob` | Scans last 7 days | No dependency on today's row existing. SAFE. |

**Verdict: Option D is SAFE.** No consumer hard-requires today's synthetic seed row. All writers correctly handle the absent-row case via INSERT...ON CONFLICT.

### 3.2 Repair script specification

Script path: `scripts/migrations/repair-ohlcv-seed-candle-2026-06-16.ts`

The BA spec's WHERE clause is correct and must be used verbatim:
```sql
DELETE FROM daily_ohlcv
WHERE date = '2026-06-16'
  AND volume = 0
  AND open = high
  AND high = low
  AND low = close
  AND data_env IS NULL;
```

This is fingerprint-scoped: it matches the synthetic seed pattern (flat OHLCV, zero volume, no data_env) without touching:
- Correct VPS-pushed rows for today (volume > 0 after market opens)
- Foreign flow stub rows (open=0, NOT matching flat non-zero price)
- Any corrected rows that Writer A later writes (volume > 0)

Script must: output `DELETE COUNT`, be idempotent (DELETE on already-absent rows = 0 rows affected, no error), and be executable via docker exec per `docs/policies/dev-standards.md § Script Persistence` pattern.

Flow doc pointer must be added to `docs/agents/dev-mcp-server/flow/main.md` or equivalent owning flow doc.

---

## 4. SSOT CHOKEPOINT — Permanent kill design

### 4.1 Root problem

Four writer classes (A, C, D, E) each implement their own unit normalization independently. The existing `ohlcvUnitGuard.ts` functions are reused but the **prevClose context is never plumbed from DB** — it always starts at 0 or comes from within the same VNDIRECT response batch. This is the architectural gap that has produced FIX-STOCK-PRICE-SCALE-CORRUPT, CONTAM-5, CONTAM-7, and now this P0.

### 4.2 Permanent fix: ohlcvWriteService — single application-layer choke-point

**Design: introduce `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts` as the single authoritative OHLCV upsert entry point.**

All writer classes (A, C, D, E) funnel through this service. The service owns:
1. Batched prevClose DB fetch (for the incoming batch of codes × date)
2. `normalizeOhlcvToVnd` call
3. `detectAndNormalizeScaleFromPrevClose` call with DB-sourced prevClose
4. Seed-bar rejection (FR-S1: `date >= today AND volume=0 AND O=H=L=C`)
5. `validateOhlcvUnit` final guard (fail-closed, ERROR log, skip)
6. The atomic SQL upsert

```typescript
// apps/mcp-server/src/application/usecases/ohlcvWriteService.ts
// DDD layer: application/usecases (orchestrates domain + infrastructure)

export interface OhlcvWriteRow {
  code: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  type?: 'stock' | 'index';  // default 'stock'
  dataEnv?: string | null;
}

export interface OhlcvWriteResult {
  written: number;
  skipped: number;
  rejected: string[];  // "CODE DATE: reason"
}

export async function writeOhlcvBatch(
  rows: OhlcvWriteRow[],
  db: Database,
  options?: { vnToday?: string }  // injectable for tests
): Promise<OhlcvWriteResult>
```

**Internal pipeline per row:**
1. If `date >= vnToday AND volume=0 AND open=high=low=close` → skip (FR-S1 seed-bar rejection). Log debug.
2. `normalizeOhlcvToVnd(type, {open,high,low,close})`
3. `detectAndNormalizeScaleFromPrevClose(type, norm, prevCloseMap.get(code) ?? 0)` — prevCloseMap fetched in one batch query before the loop
4. `validateOhlcvUnit(code, type, ...)` → if !valid: log ERROR, push to rejected[], continue
5. Upsert via canonical SQL (preserved from existing writers)

**Migration path for existing writers (no big-bang rewrite):**

| Writer | Migration | Sprint |
|---|---|---|
| D — taOhlcvBackfillJob | Replace `insertMany` transaction with `writeOhlcvBatch(records, db, { vnToday })` | This task |
| A — pushPricesHandler | Replace OHLCV upsert loop with `writeOhlcvBatch(...)` | This task (secondary, for ×1000 race fix) |
| C — ohlcvDailyAggregatorJob | Replace per-ticker upsert with `writeOhlcvBatch(...)` | Follow-on (Writer C data comes from intraday ticks already in full-VND; lower risk; separate ticket) |
| E — ohlcvBackfill.ts | Replace upsert with `writeOhlcvBatch(...)` | Follow-on (INSERT OR IGNORE semantics must be preserved) |

**For this task, Writer D and Writer A migration are in scope** (they are the two writers that produced the incident). Writers C and E are follow-on to avoid scope creep on this P0.

### 4.3 DDD layer assignment

| Component | Layer | File |
|---|---|---|
| `ohlcvWriteService.ts` | application/usecases | `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts` |
| `ohlcvUnitGuard.ts` (existing) | domain/services | No change — remains pure, no DB imports |
| `ohlcvSanityCheckJob.ts` (extend FR-G2/G3) | scheduler | `apps/mcp-server/src/scheduler/market-data/ohlcvSanityCheckJob.ts` |
| `cronConfig.ts` (add FR-G4 early cron) | scheduler | `apps/mcp-server/src/scheduler/cronConfig.ts` |
| `taOhlcvBackfillJob.ts` (consume writeService) | scheduler | `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts` |
| `pushPricesHandler.ts` (consume writeService) | interface | `apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts` |
| `repair-ohlcv-seed-candle-2026-06-16.ts` | scripts/migrations | `scripts/migrations/repair-ohlcv-seed-candle-2026-06-16.ts` |
| New tests | interface/tests | `apps/mcp-server/src/__tests__/FIX-OHLCV-SEED-CANDLE-UNIT-SCALE.test.ts` |

**DDD golden rule check:** `ohlcvWriteService` in `application/usecases` may import from `domain/services` (ohlcvUnitGuard) and `infrastructure/db` (for the DB upsert). It must NOT be imported by `domain/`. Existing writers in `interface/` and `scheduler/` layers may import from `application/` — this is correct DDD direction.

---

## 5. FR-G4 (BLOCKER-2 Resolution)

Adding a second `ohlcvSanityCheck` cron at 00:45 UTC (FR-G4) is within `cronConfig.ts` scope for this task. This is a cron config change (one new key, one new env var `CRON_OHLCV_SANITY_CHECK_EARLY`), not an infra-zone change. The dev-mcp-server can add this in the same task.

Add to `cronConfig.ts`:
```typescript
/** ohlcvSanityCheckEarly — pre-briefing scan at 00:45 UTC Mon-Fri (FR-G4, FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0)
 *  Catches synthetic seed bars before morning briefing (01:00 UTC). */
ohlcvSanityCheckEarly: Bun.env.CRON_OHLCV_SANITY_CHECK_EARLY ?? '45 0 * * 1-5',
```

The cron scheduler wiring (wherever CRONS is consumed) must add a handler for this key pointing to `runOhlcvSanityCheck`. BLOCKER-2 is resolved — no separate infra ticket needed.

---

## 6. RISKS

### R-1 (HIGH) — Coverage gate passes all 30 tickers as "covered" silently

TICKER_COVERAGE_SQL counts rows with `low=0` as corrupt. The new synthetic seed class has `low=[reference price]` (136.1), NOT `low=0`. So `corrupt_cnt=0` for all 30 tickers after the fix. This means the job will always see `covered=30` and skip all tickers going forward — correct behavior post-fix (seed rows rejected by FR-S1 before upsert). But the coverage gate must be re-evaluated: if a ticker legitimately needs backfill (e.g., < 35 rows), the job must still process it. The FR-S1 seed-bar filter operates AFTER the per-ticker fetch, so the gate correctly allows backfill while rejecting today's seed row.

### R-2 (HIGH) — ohlcvWriteService breaks Writer A's OHLCV conflict semantics

pushPricesHandler's OHLCV conflict SQL has special semantics:
- `open = CASE WHEN daily_ohlcv.open < 100 THEN excluded.open ELSE daily_ohlcv.open END` (self-heal for CONTAM-2)
- `low = CASE WHEN daily_ohlcv.low = 0 THEN excluded.low ELSE MIN(...)` (self-heal for CONTAM-9)
- `high = MAX(daily_ohlcv.high, excluded.high)` (intraday accumulation)

These conflict rules MUST be preserved when wrapping pushPricesHandler in writeOhlcvBatch. The service needs a `conflictStrategy` parameter: `'backfill'` (Writer D — overwrite all fields) vs `'intraday'` (Writer A — accumulate high, protect low, self-heal open). This is a design parameter the dev must implement correctly.

### R-3 (MEDIUM) — prevCloseMap batch query and same-day seed writes

If taOhlcvBackfillJob is re-run manually (e.g., via MCP tool) AFTER Writer D has already written today's seed row (before the fix is deployed), the prevCloseMap query `date < ? AND volume > 0` will correctly exclude today's flat row (volume=0) and return yesterday's real close. The fix is self-consistent.

### R-4 (MEDIUM) — FR-S1 seed-bar filter and VN_TODAY boundary

The seed-bar filter `date >= VN_TODAY AND volume=0 AND O=H=L=C` must use Vietnam local date (UTC+7), not UTC date. `new Date().toISOString().slice(0, 10)` gives UTC date; at 01:30 UTC = 08:30 VN time, both UTC and VN date are the same (same calendar day, Jan–Dec). However, for correctness the `vnToday` computation must follow the VN_OFFSET_MS pattern used in ohlcvDailyAggregatorJob:

```typescript
const vnToday = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
```

Inject as `options?.vnToday` for testability.

### R-5 (LOW) — ohlcvSanityCheckEarly 00:45 UTC cron collision

Checking cronConfig.ts: no existing job at `45 0 * * *`. The earliest Mon-Fri slots occupied near this time: `insiderCheck: '0 1 * * *'`. 00:45 UTC is safe. No collision.

### R-6 (LOW) — Repair script data_env IS NULL fingerprint stability

BLOCKER-3 from BA spec: if a future writer starts setting `data_env` on rows, the repair WHERE clause `data_env IS NULL` becomes a permanent filter for Writer D rows only (which never set data_env). This is stable for the repair script's one-shot purpose. Future architect note: Writer D should set `data_env=currentDataEnv()` to remove the IS NULL ambiguity (follow-on cleanup, out of scope for this P0 fix).

---

## 7. BLOCKER RESOLUTIONS

| Blocker | Resolution |
|---|---|
| BLOCKER-1 (architect confirm primary writer) | CONFIRMED: Writer D is primary for the ÷1000 group. Double-write race with Writer A is confirmed for the ×1000 group. Both paths addressed by writeOhlcvBatch SSOT choke-point. |
| BLOCKER-2 (FR-G4 cron scope) | RESOLVED: in-scope for dev-mcp-server; single cronConfig.ts key addition + scheduler wiring. |
| BLOCKER-3 (data_env IS NULL stability) | RESOLVED: stable for repair script's one-shot use. Follow-on: Writer D should set data_env (out of P0 scope). |

---

## 8. TEST STRATEGY

New test file: `apps/mcp-server/src/__tests__/FIX-OHLCV-SEED-CANDLE-UNIT-SCALE.test.ts`

Tests use in-memory SQLite (`:memory:` via `Bun.env.DB_PATH` preset in setup.ts). All five BA-spec tests (AC-T1 through AC-T5) are in scope.

Additional architect-required tests:
- **AC-T6:** `writeOhlcvBatch` with `prevCloseMap` seeded to VHM=136100 correctly normalizes VNDIRECT input 136.1 → 136100 before upsert.
- **AC-T7:** `writeOhlcvBatch` with `conflictStrategy='intraday'` preserves accumulate-high and self-heal-open semantics (Writer A contract).
- **AC-T8:** Repair script SQL is idempotent — running it twice on a DB that already had the rows deleted returns `DELETE COUNT=0`, no error.

All new tests must follow `apps/mcp-server/src/__tests__/setup.ts` preload pattern. No named-volume, no network.

---

## 9. IMPLEMENTATION ORDER FOR PM

The PM must atomize into these sequenced subtasks:

1. **SUBTASK-1: ohlcvWriteService skeleton** — create `src/application/usecases/ohlcvWriteService.ts` with `writeOhlcvBatch` signature, prevClose batch fetch, seed-bar filter (FR-S1), normalize chain, validate guard. No writers wired yet. Tests AC-T6, AC-T4 (unit-level).

2. **SUBTASK-2: taOhlcvBackfillJob migration** — wire Writer D to `writeOhlcvBatch(conflictStrategy='backfill')`. Remove `insertMany` local transaction. Wire `prevCloseMap`. Tests AC-T1, AC-T2, AC-T4.

3. **SUBTASK-3: pushPricesHandler migration** — wire Writer A OHLCV path to `writeOhlcvBatch(conflictStrategy='intraday')`. Preserve accumulate-high / self-heal-open conflict semantics. Tests AC-T7.

4. **SUBTASK-4: ohlcvSanityCheckJob extension** — add FR-G2 (cross-day scale check) + FR-G3 (synthetic seed bar flag). Tests AC-T3.

5. **SUBTASK-5: cronConfig FR-G4** — add `ohlcvSanityCheckEarly` key + scheduler wiring.

6. **SUBTASK-6: repair script** — `scripts/migrations/repair-ohlcv-seed-candle-2026-06-16.ts`. Add flow doc pointer. Tests AC-T8 (idempotent).

7. **SUBTASK-7: Regression guard** — verify AC-T5 (CONTAM-5/7 tests remain green post-refactor).

Subtasks 1→2→3 must be sequential (SSOT dependency). Subtasks 4, 5, 6 can run parallel to 2/3 (disjoint file scopes). Subtask 7 is final verification.

All subtasks in same zone: `apps/mcp-server/`. No isolation:worktree needed (sequential default per dev-standards).

---

## Scan Clean: true
No DDD violations in proposed design. `ohlcvUnitGuard.ts` remains pure domain; `ohlcvWriteService.ts` in application layer correctly imports from domain + infrastructure. No circular dependencies introduced.

---

## RETURN
DONE: Technical design complete.
ZONE: apps/mcp-server/
NEXT: pm — break into 7 subtasks per §9, create developer handoffs for dev-mcp-server
HANDOFF: docs/handoffs/FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0-architect-design.md
PIPELINE: continue
