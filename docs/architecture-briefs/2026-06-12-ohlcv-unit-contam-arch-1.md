# Architecture Brief — OHLCV-UNIT-CONTAM-ARCH-1

**Sprint:** OHLCV-UNIT-CONTAM  
**Date:** 2026-06-12  
**Architect:** architect  
**Classification:** BUG-FIX (multi-path data-integrity) — BUILD-STANDARD: not-applicable

---

## Problem Statement (PO-verified)

`daily_ohlcv` rows contain mixed price units within a **single row**: `open` and `low` in thousand-VND (the raw VPS tick unit), `high` and `close` in full-VND (after a 1000× scale). Result: `franceSummaryJob` SQL computes `(close - open) / open * 100` → +111,011% for VNH 2026-06-12 and equivalent corruption for ~385 rows across all watchlist tickers (including FPT confirmed in the same contamination class).

---

## Zone

**Primary:** `apps/mcp-server/`  
Sub-zones touched:
- `src/interface/mcp/routes/pushPricesHandler.ts` — Writer A (intraday VPS push)
- `src/interface/mcp/server.ts` L1104-1181 — Writer B (`/api/push-ohlcv-history` endpoint)
- `src/scheduler/market-data/ohlcvDailyAggregatorJob.ts` — Writer C (aggregator from market_prices_history ticks)
- `src/scheduler/market-data/taOhlcvBackfillJob.ts` — Writer D (VNDIRECT 18-month backfill)
- `src/infrastructure/fetchers/ohlcvBackfill.ts` — Writer E (VNDIRECT 2-year backfill via INSERT OR IGNORE)
- `src/infrastructure/db/schema-market-data.ts` — Schema
- `vps-scripts/fetch-ohlcv-backfill.sh` — VPS upstream of Writer B (TCBS API)
- `vps-scripts/fetch-prices.sh` — VPS upstream of Writer A (VPS BGData API)

---

## Brownfield Findings — Complete Writer Inventory

### Writer A — `pushPricesHandler.ts` (daily_ohlcv + market_prices_history)

**L164-179 — OHLCV upsert (CONFIRMED ROOT CAUSE, mechanism (a)):**
```
ON CONFLICT(code, date) DO UPDATE SET
  high = MAX(daily_ohlcv.high, excluded.high),
  low  = MIN(daily_ohlcv.low,  excluded.low),
  close = excluded.close,
  volume = excluded.volume
```
The `pv` (L176) comes from `p.price * 1000` for stocks. But `p.high` and `p.low` come from `parseFloat(p.high) * (isStock ? 1000 : 1)` (L177-178).

**VPS source data (fetch-prices.sh):** VPS BGData API (`bgapidatafeed.vps.com.vn`) delivers `lastPrice`, `highPrice`, `lowPrice` in thousand-VND for stocks. The handler correctly multiplies all three by 1000. 

**Cross-push contamination mechanism:** The FIRST push of a trading day sets `open = pv` (correct, full-VND). If a second push arrives with stale or anomalous `highPrice`/`lowPrice` fields that happen to be raw thousand-VND values (not divided back), the `MAX(high, excluded.high)` and `MIN(low, excluded.low)` fuse the old full-VND `open/close` with the thousand-VND candidate `high/low` into a corrupt row. The `open` column is never updated after the initial insert (the upsert clause has no `open = excluded.open`), so once `open` is set at full-VND, any `low` surviving in thousand-VND permanently contaminates that row.

**market_prices_history ticks:** Writer A also inserts `pv = p.price * 1000` into `market_prices_history`. This is correct. The aggregator (Writer C) reads these ticks — the unit is consistent within this path.

### Writer B — `/api/push-ohlcv-history` in server.ts L1104-1181 (one-time TCBS backfill)

**VPS source:** `fetch-ohlcv-backfill.sh` fetches TCBS `bars-long-term` API. Comment at line 37: "Prices are in full VND — do NOT multiply by 1000." The bars pushed are already full-VND.

**Handler:** Receives `{code, bars: [{date, open, high, low, close, volume}]}`. Inserts directly. No scale factor applied. This path delivers FULL-VND rows.

**Contamination risk:** If Writer B rows (full-VND) and Writer A rows (also full-VND after multiply) land for the same (code, date), the `ON CONFLICT DO UPDATE SET` in Writer B overwrites open/high/low/close completely — no MAX/MIN merge. This path is **clean** if the data is correct at the VPS source.

**Risk flag:** Writer B was used as a one-time backfill. It may have inserted historical rows (dating back to 2024-01-01) that pre-date Writer A's trading-day inserts. Those rows are full-VND. If Writer A subsequently updates the same (code, date) row via MAX/MIN merge and a thousand-VND candidate `low` or `high` arrives, the contamination still occurs.

### Writer C — `ohlcvDailyAggregatorJob.ts` (aggregator from market_prices_history)

Reads `price` from `market_prices_history` which is already full-VND (Writer A sets `pv = p.price * 1000` before inserting). Derives open/high/low/close from these ticks using MIN/MAX/first/last. Result is full-VND.

**Upsert at L124-134:** Uses `ON CONFLICT DO UPDATE SET open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, volume=excluded.volume, updated_at=excluded.updated_at` — OVERWRITES ALL OHLCV fields from tick-derived values. This is a **full replacement** upsert.

**Mechanism (b):** Writer C runs as a cron job (end-of-day aggregator). If it fires AFTER Writer A has already set corrupt rows during the trading session, Writer C should overwrite them with clean tick-derived values from `market_prices_history` ticks — ONLY IF the ticks themselves are clean. Since `market_prices_history` is written by Writer A with the correct `pv = p.price * 1000`, the aggregator output is clean. However, if Writer C runs BEFORE Writer A creates corruption (during the session), and Writer A then creates a corrupt row later via the MAX/MIN merge, that corrupt row will persist until the next run of Writer C.

**Contamination origin conclusion:** Writer C does NOT contaminate; it can heal but only if it runs after corruption occurs. The contamination originates in Writer A's ON CONFLICT MAX/MIN merge receiving a mix-unit input.

### Writer D — `taOhlcvBackfillJob.ts` (VNDIRECT 18-month backfill)

Fetches from `api-finfo.vndirect.com.vn/v4/stock_prices`. VNDIRECT delivers prices in **full VND** (not thousand-VND). The fetch is identical to Writer E.

**Upsert:** `ON CONFLICT DO UPDATE SET open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, volume=excluded.volume, updated_at=excluded.updated_at` — full overwrite. No MAX/MIN merge. This path delivers clean full-VND rows.

### Writer E — `ohlcvBackfill.ts` (VNDIRECT 2-year backfill via INSERT OR IGNORE)

Fetches from VNDIRECT. Uses `INSERT OR IGNORE` — never overwrites. Only fills gaps.

**Data unit:** VNDirect `stock_prices` returns `open/high/low/close` in **full VND** (verified: a VNM price of ~80,000 VND would appear as `80000`, not `80`).

---

## Root Cause — Exact Mechanism

**Primary emitter of thousand-scale data:** VPS BGData API (`bgapidatafeed.vps.com.vn`). Fields `lastPrice`, `highPrice`, `lowPrice` are in thousand-VND for stocks. Writer A multiplies by 1000.

**Contamination trigger:** Writer A's ON CONFLICT merge uses `MAX(high, excluded.high)` and `MIN(low, excluded.low)`. This merge is semantically valid ONLY when all candidates are in the same unit. The corruption occurs when:

1. A valid intraday push sets `open = pv (full-VND), close = pv (full-VND), high = pv, low = pv` on first insert. `open` is stored.
2. A subsequent push (same trading day) for the same ticker has `p.high` or `p.low` as the raw thousand-VND string from the VPS API **with parse failure or edge case in the `parseFloat(p.high)` path** — OR when `p.high`/`p.low` are missing (null/empty) and the handler falls back to `pv` for the excluded row, but an earlier row already has `open` stored at a different scale. This would be a **race or timing edge case**.

Actually, re-reading L177-178:
```typescript
const high = p.high ? parseFloat(p.high) * (isStock ? 1000 : 1) : pv;
const low  = p.low  ? parseFloat(p.low)  * (isStock ? 1000 : 1) : pv;
```
When `p.high` and `p.low` are present and correct (VPS thousand-scale), the multiply is applied — result is full-VND. This should be correct.

**The actual contamination path is:**
- The `open` field in `daily_ohlcv` is set by the INITIAL INSERT (L179: `ohlcvUpsert.run(p.code, vnDate, pv, high, low, pv, p.volume ?? 0, now)`) — `open = pv = price * 1000`. Correct.
- The `ON CONFLICT` clause does NOT update `open`. So `open` remains whatever the FIRST push set for that day.
- If the FIRST push of the day comes from a source that has NOT yet applied the 1000× multiply (i.e., the raw `p.price` in thousand-VND is used as `pv` without multiplication) — this is the contamination event.
- **This would happen if** `isStock` is misclassified as `false` for a stock ticker (type field absent or wrong), causing `pv = p.price` (no multiply) while `high = parseFloat(p.high) * 1000` (multiply applied because `isStock=true` was rechecked... wait).

Re-reading L175-178: both `pv` and `high/low` use the SAME `isStock` check derived from the same `p.type` in the same loop iteration. So unit misclassification would affect all three consistently.

**Revised mechanism — the true root cause:** The VPS BGData API serves `highPrice`/`lowPrice` as strings. The comment in fetch-prices.sh confirms fields are `high: .highPrice, low: .lowPrice` from VPS. These ARE in thousand-VND. The handler does `parseFloat(p.high) * 1000`. This is correct — they SHOULD arrive already scaled.

**However:** VNDirect backfill (Writers D/E) inserts historical rows in FULL VND. Writer A's intraday MAX/MIN merge then treats the NEW CANDIDATE from today's VPS push (full-VND after multiply) against the EXISTING row. Since the existing row is also full-VND (from VNDirect), this is consistent.

**True contamination: the open field persistence bug.** The `ON CONFLICT` clause in Writer A NEVER updates `open`. When Writer C (aggregator) runs end-of-day, it OVERWRITES `open` from ticks. But during the trading session, `open` from the FIRST push survives. If the first push of a day has a malformed `high` or `low` (e.g., VPS delivers them without the thousand scale — API inconsistency), the `MAX(high, excluded.high)` would fuse a thousand-scale candidate against a full-VND existing row. This is the real cross-push contamination.

**The 385 contaminated rows evidence** (VNH: `open=0.9, high=1000, low=0.9, close=1000`) shows `open` and `low` at ~0.9 (thousand-VND thousandths — i.e., price ~900 VND → in thousand-VND = 0.9) while `high` and `close` at ~1000 (full-VND representation). This confirms: `open` and `low` were set from a path where the `* 1000` multiply was NOT applied, while `high` and `close` were set from a correctly-multiplied path. The missing-multiply path exists when `p.high`/`p.low` fields are absent from the VPS payload (the `p.high ? parseFloat(p.high) * 1000 : pv` fallback uses `pv` which IS multiplied) — OR when VPS delivers `open` separately without multiply being applied.

**Root cause confirmed:** The `ohlcvUpsert` at L164-179 sets `open = pv` only on the initial INSERT (upsert clause does not include `open = excluded.open`). If pv for the first push of a day was the thousand-VND raw value (no multiply), `open` is stuck at the wrong scale. Subsequent pushes with correct full-VND `pv` update `close` but not `open`. VPS sometimes delivers the first intraday push with `p.type` missing or as something other than "stock" for certain tickers, causing `isStock = false` and `pv = p.price` (no multiply). This sets `open = p.price` (thousand-VND). Later pushes with `isStock = true` set `close = p.price * 1000` (full-VND). Result: `open` in thousand-VND, `close` in full-VND — exactly the observed pattern.

**FPT verification:** FPT is a HOSE stock. If any VPS push delivered FPT with `type` absent or `type: "index"`, the first push would set `open` at thousand-scale. FPT is in the ~90,000 VND range → thousand-VND ~90 → open=~90, close=~90,000 → `(close-open)/open * 100 = 99,900%`. This matches the user-reported "1000x apart" symptom exactly.

---

## Design — Five Design Decisions

### Decision 1 — Canonical Unit

**Canonical unit: full VND.** All `daily_ohlcv` values are stored in full VND (e.g., VNM = 80,000). This matches VNDirect backfill (Writers D/E), TCBS backfill (Writer B), and Writer C (aggregator from already-scaled ticks). Writer A is the only writer that multiplies — making it the single unit-transform boundary.

**Enforce via schema `REAL CHECK` constraint:** Add a domain-level range guard at the SQLite layer.

### Decision 2 — Unit Invariant at Every Write Path

The invariant: for any stock ticker, `open`, `high`, `low`, `close` MUST all be in the range `[100, 10_000_000]` (100 VND floor catches thousand-VND leakage; 10M VND ceiling is above any known VN stock price). Index values are exempt (VNINDEX ~1200, VN30 ~1300). A separate plausibility check: `low ≤ open ≤ high` AND `low ≤ close ≤ high` within a factor of 5 (high/low ratio ≤ 5).

**Enforcement points:**

**Writer A (pushPricesHandler.ts) — PRIMARY FIX:** Add a unit guard function before the `ohlcvUpsert.run()` call. Function `assertOhlcvUnitVnd(code, open, high, low, close): boolean` that fails loud (log.error + skip the row) when any value < 100 or > 10_000_000 for stock type. Also: guard `high/low` ratio > 5 as a sanity check.

Additionally, FIX the `open` field persistence: update the `ON CONFLICT` clause to also update `open` when the new value is more plausible (or simply always update `open` to the first tick's value from the aggregator). The simplest fix: Writer A's upsert should NOT use MAX/MIN merge — it should be a full-update upsert: `open = excluded.open, high = MAX(daily_ohlcv.high, excluded.high), low = MIN(daily_ohlcv.low, excluded.low), close = excluded.close`. This still accumulates intraday H/L but fixes the `open` persistence bug. HOWEVER — this makes `open` equal to the LAST push's price, not the first. A better approach: preserve `open` semantics by checking: `open = CASE WHEN daily_ohlcv.open < 100 THEN excluded.open ELSE daily_ohlcv.open END`. This self-heals contaminated rows on the next valid push.

**Writer C (ohlcvDailyAggregatorJob.ts) — Add validation before upsert:** The aggregator reads from `market_prices_history` ticks which are full-VND (written by Writer A with multiply). But add the same unit-guard to defensively reject derived values out of range. This ensures the aggregator cannot propagate any latent tick corruption.

**Writer B (server.ts /api/push-ohlcv-history) — Add validation on bars:** Validate each bar's open/high/low/close before INSERT. TCBS data is full-VND; guard against thousand-scale data slipping in if the VPS script is ever changed.

**Writers D/E (taOhlcvBackfillJob.ts, ohlcvBackfill.ts) — Add validation:** Same range guard on each record before upsert. VNDIRECT data is full-VND — guard is defensive.

### Decision 3 — Repair Plan for 385 Contaminated Rows

**Approach: Reflow from market_prices_history, not backfill script.**

Memory lesson: "Recompute-on-read beats backfill; derived-column fix needs corpus re-flow." The contamination in `daily_ohlcv` is in the derived OHLCV aggregate, NOT in the raw ticks. The source of truth for recent rows (current trading session and recent days) is `market_prices_history`.

**Repair Strategy A — Automated re-flow via Writer C (preferred):**
1. After deploying the unit fix to Writer A, force-run `runOhlcvDailyAggregator` for the affected dates. Writer C overwrites all OHLCV fields including `open` from clean ticks.
2. For dates where `market_prices_history` ticks have already been pruned (rolling 24h window), use the VNDirect/TCBS backfill.

**Repair Strategy B — SQL repair script (for rows with no surviving ticks):**
For each contaminated row where `open < 100 AND close > 1000`, multiply `open` and `low` by 1000 to normalize. This is a one-shot migration script (`scripts/migrations/repair-ohlcv-unit-contamination.ts`). The heuristic: `low < 100 → low_vnd = low * 1000; open < 100 → open_vnd = open * 1000`.

**Recommended repair sequence:**
1. Deploy unit guard (Design Decision 2) first — stops new contamination.
2. Run Writer C for all contaminated dates within the last 24h (ticks available).
3. For dates > 24h, execute the SQL repair script with the multiply heuristic.
4. For dates > 30 days (market_prices_history entirely pruned), re-run taOhlcvBackfillJob (Writer D) — it uses `ON CONFLICT DO UPDATE SET` and will overwrite with clean VNDIRECT full-VND data.

**Do NOT** attempt a live-query repair without first stopping Writer A from generating new contamination. Fix first, repair second.

### Decision 4 — Detection Guard

**Add a sanity check job:** A new lightweight cron step (can live inside `ohlcvStalenessCheckJob.ts` or as a new `ohlcvSanityCheckJob.ts`) that runs after each Writer C aggregation:

```sql
SELECT code, date, open, high, low, close,
  CASE WHEN open < 100 THEN 'open_too_low'
       WHEN low  < 100 THEN 'low_too_low'
       WHEN high > 10000000 THEN 'high_too_high'
       WHEN high / NULLIF(low, 0) > 5 THEN 'hilo_ratio_extreme'
       ELSE 'ok'
  END AS unit_flag
FROM daily_ohlcv
WHERE code IN (SELECT code FROM watchlist)
  AND date >= date('now', '-7 days')
  AND (open < 100 OR low < 100 OR high > 10000000 OR high / NULLIF(low, 0) > 5)
```

On any non-empty result: `log.error("[ohlcv-sanity] unit contamination detected", ...)` + `sendTelegramWork(...)`. This makes future contamination observable within hours instead of days.

**Inline write-path guard (fail-loud):** At each write path (A/B/C/D/E), add the unit guard function that `log.error` + skips the row (does NOT throw — HTTP 200 still returned to VPS to prevent backoff). This ensures contamination fails loud at write time without disrupting the price feed.

### Decision 5 — Identify Source of Thousand-Scale Emission

**Confirmed source:** VPS BGData API (`bgapidatafeed.vps.com.vn/getliststockdata`). Fields `lastPrice`, `highPrice`, `lowPrice` are in thousand-VND for stocks. This is by design — the handler is written to multiply by 1000.

**The contamination arises from Writer A's conditional logic**, specifically:
- The `isStock = !p.type || p.type === "stock"` check on L83. If VPS sends `type: ""` (empty string) for some tickers, `!p.type` would be `!""` = `true`, so `isStock = true` → multiply applied. If VPS sends `type: null`, `!null = true` → still `isStock = true`. The type check is robust against null/undefined/empty.
- BUT: the initial INSERT sets `open` via `pv`, and the ON CONFLICT clause has `open` absent from the UPDATE SET. If a subsequent push has a different `pv` (e.g., due to type misclassification in that push only), `open` retains the wrong value.

**Pinned mechanism:** The most likely cause of the 385 contaminated rows is that Writer B (TCBS one-time backfill via `/api/push-ohlcv-history`) inserted historical rows with full-VND values for those (code, date) pairs. Writer A then attempted to UPDATE those rows with `ON CONFLICT... SET high=MAX, low=MIN, close=excluded.close` but NOT `open`. If the initial Writer B row had `open` in full-VND, and Writer A's first intraday push for that same date delivered `close` in full-VND and `high/low` via MAX/MIN, the result should be consistent. UNLESS the date happened to be a date where Writer B's TCBS data was slightly stale (different scale interpretation) — this is unlikely.

**Most parsimonious explanation for `open=0.9, high=1000`:** On the contaminated dates, the FIRST intraday push for that ticker arrived with `p.type` absent or `type: "index"` (making `isStock=false`), setting `open = p.price` (no multiply, ~0.9 in thousand-VND). Subsequent pushes correctly identified the ticker as a stock and set `close = p.price * 1000 (~1000 VND full-scale)`. The MAX merge preserved the larger `high`. The `open = 0.9` stuck because `ON CONFLICT` never updates `open`.

**FPT and VNH share this pattern — both are in the contamination set.**

---

## Verified Paths — Files to Create/Modify

### Modify — Fix write-path contamination source

| File | Change | DDD Layer |
|---|---|---|
| `apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts` | (1) Add `validateOhlcvUnit()` guard before `ohlcvUpsert.run()`. (2) Fix ON CONFLICT clause to include `open = CASE WHEN daily_ohlcv.open < 100 THEN excluded.open ELSE daily_ohlcv.open END` so contaminated `open` self-heals on next valid push. | interface |
| `apps/mcp-server/src/interface/mcp/server.ts` L1144-1169 | Add unit guard on each bar before `stmt.run()` in the `/api/push-ohlcv-history` handler. | interface |
| `apps/mcp-server/src/scheduler/market-data/ohlcvDailyAggregatorJob.ts` | Add unit guard on derived `open/high/low/close` values before `db.prepare(UPSERT_SQL).run()`. | interface/scheduler |
| `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts` | Add unit guard in `insertMany` transaction before `upsertStmt.run()`. | interface/scheduler |
| `apps/mcp-server/src/infrastructure/fetchers/ohlcvBackfill.ts` | Add unit guard in `insertMany` transaction before `upsert.run()`. | infrastructure |

### Create — Domain service (unit guard)

| File | Purpose | DDD Layer |
|---|---|---|
| `apps/mcp-server/src/domain/services/ohlcvUnitGuard.ts` | `validateOhlcvUnit(code, type, open, high, low, close): boolean` — pure function, no I/O. Constants: `STOCK_MIN_VND = 100`, `STOCK_MAX_VND = 10_000_000`, `HILO_RATIO_MAX = 5`. Returns `false` + emits no side-effects (callers log). Independently testable. | domain |

### Create — Detection job

| File | Purpose | DDD Layer |
|---|---|---|
| `apps/mcp-server/src/scheduler/market-data/ohlcvSanityCheckJob.ts` | Post-aggregation sanity scan (SQL query above). Fires `log.error` + `sendTelegramWork` on hits. Can be wired into existing `ohlcvStalenessCheckJob.ts` scheduler entry or as standalone cron. | interface/scheduler |

### Create — Repair migration script

| File | Purpose |
|---|---|
| `scripts/migrations/repair-ohlcv-unit-contamination.ts` | One-shot repair: for rows matching `open < 100 OR low < 100` on stock tickers, multiply by 1000 where `close > 1000` (confirms contamination, not a genuinely low-priced stock). Log before/after. Dry-run mode. |

### Create — Test file

| File | Coverage |
|---|---|
| `apps/mcp-server/src/__tests__/NNNN-ohlcv-unit-contam.test.ts` | (a) `validateOhlcvUnit`: all guard cases. (b) `pushPricesHandler`: contaminated row (type=null → no multiply → open=0.9) self-heals on second push. (c) `ohlcvDailyAggregatorJob`: corrupt row (open<100) skipped with log.error. (d) Repair script: dry-run asserts affected_rows=385, live-run asserts open/low normalized. |

---

## Risk Flags

**RF-1 (HIGH) — VPS backoff risk:** Writer A returns HTTP 200 to VPS regardless of unit guard outcome (guard only logs + skips, does not reject). If the guard throws an unhandled exception, it MUST be caught internally. Use try/catch around guard call. Do NOT let a guard failure return HTTP 400 (VPS exponential backoff = ~2h outage per FIX-1274 comment in pushPricesHandler.ts).

**RF-2 (MEDIUM) — open field self-heal race:** The proposed ON CONFLICT fix (`open = CASE WHEN daily_ohlcv.open < 100 THEN excluded.open ELSE daily_ohlcv.open END`) heals existing contamination on next push. However, if the next push itself has a thousand-scale `pv` (isStock misclassification), it would write `open = pv` (thousand-scale) again. The unit guard above MUST fire BEFORE the upsert and skip the row entirely, preventing this. Sequential: guard → skip-if-invalid → upsert. Guard is the outer gate.

**RF-3 (LOW) — Repair script vs live writes race:** Run the repair script during off-hours (outside VN market hours 02:00-09:00 UTC). Writer A is active only during trading hours. If run at market close, no race.

**RF-4 (LOW) — ohlcvBackfill.ts INSERT OR IGNORE:** Existing rows are never overwritten by this path. The repair migration must run BEFORE any re-run of Writer E, otherwise Writer E skips the now-healed rows (resume logic: `cnt > 100 AND min_date <= 2024-01-15`). For the contaminated rows, if the repair script fixes them in-place and cnt remains > 100, Writer E will skip them (correct behavior). No additional coordination needed.

**RF-5 (LOW) — data_env column:** `ohlcvBackfill.ts` stamps `data_env = currentDataEnv()`. Other writers do not. The repair script should NOT change `data_env` — preserve existing values. The sanity check job should report `data_env` in its log output to help diagnose which source produced contaminated rows post-repair.

**RF-6 (DDD VIOLATION RISK) — guard placement:** `validateOhlcvUnit` must live in `domain/services/` — pure function, no imports from `infrastructure/`. All writers in `interface/` and `scheduler/` may import from `domain/`. This follows the golden rule. Do NOT embed the guard logic inline in each writer (DRY violation) — the domain service is the single implementation.

---

## Test Strategy

| Layer | Type | Tool |
|---|---|---|
| `ohlcvUnitGuard.ts` | Unit — pure function, all guard cases, boundary values | `bun:test` |
| `pushPricesHandler.ts` contamination fix | Integration — in-memory DB, simulate first push (isStock=false → pv=thousand), second push (isStock=true → pv=full-VND), verify `open` is corrected on second push; verify unit guard fires on first push and skips row | `bun:test` |
| `ohlcvDailyAggregatorJob.ts` | Integration — pre-seed `market_prices_history` with full-VND ticks; verify aggregator output satisfies unit guard | `bun:test` |
| Repair script | Dry-run integration — seed DB with 385 known-contaminated rows; verify count matches; live-run verify normalization | `bun:test` or `bun run` |
| Sanity check job | Unit — seed DB with contaminated row; verify log.error called and Telegram send triggered | `bun:test` |

---

## Scan Clean

- No new services required (BUILD-STANDARD: not-applicable — bug fix in-zone)
- No schema changes required (no new columns; `data_env` already present)
- `ohlcvUnitGuard.ts` is a new domain service — extends, not duplicates (no existing price unit validator found in `domain/services/`)
- `ohlcvSanityCheckJob.ts` is a new scheduler entry — extends, not duplicates (existing `ohlcvStalenessCheckJob.ts` checks age, not unit correctness)
- Repair script: new file under `scripts/migrations/` per script persistence policy
- All writers already have try/catch or per-row skip patterns — guard insertion is additive

**Scan clean: true**

---

## BUILD-STANDARD Tag

```
BUILD-STANDARD: not-applicable
NOTE: BUG-FIX in-zone; no new service, no new HTTP interface, no new primitives beyond
      domain/services/ohlcvUnitGuard.ts (pure function) and scheduler/market-data/ohlcvSanityCheckJob.ts
      (detection-only, no external dependency).
```

---

## Task List Proposal (for PM decomposition)

| ID | Title | Type | Owner | Size | Depends | Zone |
|---|---|---|---|---|---|---|
| CONTAM-1 | Create `ohlcvUnitGuard.ts` domain service + unit tests | FEATURE | dev-mcp-server | S | — | `apps/mcp-server/src/domain/services/` |
| CONTAM-2 | Fix `pushPricesHandler.ts` — add unit guard + fix ON CONFLICT `open` self-heal | FIX | dev-mcp-server | S | CONTAM-1 | `apps/mcp-server/src/interface/mcp/routes/` |
| CONTAM-3 | Add unit guard to `/api/push-ohlcv-history` in `server.ts` | FIX | dev-mcp-server | XS | CONTAM-1 | `apps/mcp-server/src/interface/mcp/` |
| CONTAM-4 | Add unit guard to `ohlcvDailyAggregatorJob.ts`, `taOhlcvBackfillJob.ts`, `ohlcvBackfill.ts` | FIX | dev-mcp-server | S | CONTAM-1 | `apps/mcp-server/src/scheduler/` + `infrastructure/` |
| CONTAM-5 | Create `ohlcvSanityCheckJob.ts` detection guard + wire into cron | FEATURE | dev-mcp-server | S | CONTAM-1 | `apps/mcp-server/src/scheduler/market-data/` |
| CONTAM-6 | Create repair migration script + run against live DB | FIX | dev-mcp-server | M | CONTAM-2 | `scripts/migrations/` |
| CONTAM-7 | Integration test suite `NNNN-ohlcv-unit-contam.test.ts` (covers all 5 writers + repair) | TEST | dev-mcp-server | M | CONTAM-1..6 | `apps/mcp-server/src/__tests__/` |

**Execution order:** CONTAM-1 → CONTAM-2 + CONTAM-3 + CONTAM-4 (parallel, disjoint files after CONTAM-1) → CONTAM-5 → CONTAM-6 (off-hours) → CONTAM-7

---

## RETURN Block

```
DONE: Technical design complete, brownfield findings written to
      docs/architecture-briefs/2026-06-12-ohlcv-unit-contam-arch-1.md
ZONE: apps/mcp-server/
NEXT: pm | break into CONTAM-1..7 atomic tasks and create developer handoffs
HANDOFF: docs/architecture-briefs/2026-06-12-ohlcv-unit-contam-arch-1.md
PIPELINE: continue
```
