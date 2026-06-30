---
<!-- size-justification: 210L — P0 recurring-class data-corruption incident; 5 explicit decisions, DDD layer map, guard gap root-cause analysis, repair strategy and LIVE acceptance criteria all must be atomic for architect handoff -->

id: FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0-BA-spec
version: "2026-06-16"
authored_by: ba
status: READY_FOR_ARCHITECT
zone: apps/mcp-server/
task_ref: FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0
evidence_source: docs/handoffs/FIX-ALERT-ENGINE-RSI-SINGLEDIGIT-gate-probe-2026-06-16.md
recurring_class: true
prior_fixes: [FIX-STOCK-PRICE-SCALE-CORRUPT, OHLCV-UNIT-CONTAM, CONTAM-5, CONTAM-7]
---

# BA Spec — FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0

## 0. Incident Summary (do not re-verify — taken from router RAW evidence)

On 2026-06-16 at ~01:35Z, `daily_ohlcv` in the named-volume DB contained:
- **1203 synthetic rows** for date `2026-06-16`: flat `O=H=L=C`, `volume=0`, `data_env=NULL` — a whole-universe "seed today's candle" write.
- **77 of those 1203** are unit-mis-scaled by a clean ×1000 / ÷1000 factor:
  - ÷1000 (price collapsed): VHM 136.1, VIC 192.6, VJC 141.3 → single-digit RSI (8.8, 6.5, …).
  - ×1000 (price inflated): AAA 7,260,000, ADS 9,220,000, +74 others → RSI pegs 100.0.
- Downstream impact: `get_technical_indicators` poisoned; `MA5=113,247` for VHM (price 136,100) corroborates the corrupt bar dragging the mean; "giá 0 dưới BB — bứt phá giảm" false breakout alerts flooding the live MARKET channel daily.

---

## 1. Decision 1 — WRITER: Where the Unit Mismatch Enters

### 1.1 Write-path inventory for `daily_ohlcv`

| Writer ID | File | Unit handling | data_env written? | volume when no ticks |
|---|---|---|---|---|
| A — pushPricesHandler | `src/interface/mcp/routes/pushPricesHandler.ts` | Multiplies `p.price * 1000` for stocks (VPS sends thousands); runs `validateOhlcvUnit` guard before upsert | NULL | `p.volume ?? 0` |
| B — server.ts push-ohlcv-history | `src/interface/mcp/server.ts` line 1245 | Direct insert; guard applied at handler | NULL | explicit |
| C — ohlcvDailyAggregatorJob | `src/scheduler/market-data/ohlcvDailyAggregatorJob.ts` | No unit guard; reads raw `price` from `market_prices_history`; skips ticker when count=0 | NULL | MAX(volume) |
| D — taOhlcvBackfillJob | `src/scheduler/market-data/taOhlcvBackfillJob.ts` | `normalizeOhlcvToVnd` + `detectAndNormalizeScaleFromPrevClose` + `validateOhlcvUnit` | NULL | `nmVolume ?? 0` |
| E — ohlcvBackfill (infrastructure) | `src/infrastructure/fetchers/ohlcvBackfill.js` | `normalizeOhlcvToVnd` + guard | NULL | explicit |
| F — priceBackfillService | `src/domain/services/priceBackfillService.ts` | INSERT OR IGNORE | NULL | explicit |
| G — ohlcvForeignFlowStore | `src/infrastructure/db/ohlcvForeignFlowStore.ts` | stub rows (foreign flow data only; prices not set) | depends on caller | 0 |

### 1.2 Root-cause identification

The corrupt rows carry: `O=H=L=C` flat, `volume=0`, `data_env=NULL`. The fingerprint eliminates:
- Writer C (aggregator): skips tickers with count=0 ticks — cannot produce 1203 rows at 01:35Z (before market open, `market_prices_history` is empty for the day).
- Writer G: only writes foreign-flow columns, not full OHLCV flat bars.
- Writers B, E, F: INSERT OR IGNORE / manual push patterns — no whole-universe automatic write.

**Prime suspect: Writer A (`pushPricesHandler`) OR Writer D (`taOhlcvBackfillJob`)**

- taOhlcvBackfillJob runs at 01:30 UTC Mon-Fri (`CRON_TA_OHLCV_BACKFILL = '30 1 * * 1-5'`), which coincides with the 01:35Z detection. It fetches from VNDIRECT `api-finfo.vndirect.com.vn/v4/stock_prices` with `toDate=today`. For the current trading day, VNDIRECT returns a partial/seed bar (flat O=H=L=C from reference price, vol=0). The job covers ALL watchlist tickers (not just the 30-ticker watchlist used by the aggregator — the VNDIRECT universe is ~1200+ tickers if the watchlist table is populated with all tickers).
- The corruption profile (77 tickers mis-scaled) matches the known gap in `detectAndNormalizeScaleFromPrevClose`: VHM at 136.1 (thousands) has prevClose=136100 (full-VND) at the prior real row → ratio=1000, which IS ≥ SCALE_DETECTION_RATIO=50 and should be corrected. But this guard only applies when `prevClose > 0`; if today's row is inserted standalone (e.g., via a separate path), `prevClose` stays at 0 and the guard is a no-op.
- Alternative writer path: **pushPricesHandler (Writer A)** receives VPS push data where `p.price` is in thousands and applies `p.price * 1000`. If a pre-open push fires at ~01:35Z with partial/seed prices (flat from yesterday's reference), and if the VPS proxy for some tickers sends the raw reference price WITHOUT the ÷1000 scaling (i.e., sends VHM as 136.1 already in thousands but WITHOUT the `type: "stock"` flag, or if VPS sends VHM as 136100 full-VND and handler writes it as 136100×1000=136,100,000 — which fails the >10M guard), the pattern does not precisely match.

**Definitive diagnosis (requires architect recon):** The most consistent explanation for data_env=NULL + vol=0 + flat O=H=L=C for ALL 1203 tickers is `taOhlcvBackfillJob` fetching VNDIRECT with `toDate=today` at 01:30 UTC before VN market opens. VNDIRECT returns a "reference" row for the current date (open=close=yesterday's ref price in thousand-VND). The `normalizeOhlcvToVnd` function correctly multiplies by 1000 for values below `STOCK_MIN_VND=100`. However, the 77 mis-scaled tickers split into two groups:

- **÷1000 group (VHM/VIC/VJC):** These are high-price stocks (100,000–200,000 VND). Their thousand-scale VNDIRECT reference price is 100–200, which is ABOVE STOCK_MIN_VND=100 — so `normalizeOhlcvToVnd` treats them as already full-VND and does NOT multiply. But `detectAndNormalizeScaleFromPrevClose` should catch them via prevClose comparison. The failure occurs because today's row is sorted LAST in the transaction (toDate=today → it is the last date), and prevClose at that point holds the correct prior-day close (136100) → ratio=1000 ≥ 50 → should correct. This means `detectAndNormalizeScaleFromPrevClose` is either not running on today's partial row, or there is a separate writer inserting this row before taOhlcvBackfill runs (e.g., a pre-open VPS push via Writer A with the reference price in full-VND format, and the handler incorrectly applies `×1000` again).

- **×1000 group (AAA/ADS/+74):** These are low-price stocks (~7,000–9,000 VND). VNDIRECT reference price = 7.26 (thousand-VND). `normalizeOhlcvToVnd` correctly multiplies → 7,260. The ×1000 in the live data (7,260,000) suggests a DOUBLE multiplication path: the value was already multiplied once (e.g., 7.26 → 7,260 by normalizeOhlcvToVnd) and then multiplied again by `pushPricesHandler` (`p.price * 1000` → 7,260,000).

**Architectural conclusion:** The corruption arises from a **double-write race** where BOTH Writer A (pushPricesHandler, pre-open VPS push) AND Writer D (taOhlcvBackfillJob, 01:30 UTC) write today's seed candle for the same ticker on the same date, with different unit assumptions. The ON CONFLICT DO UPDATE in pushPricesHandler's ohlcvUpsert takes the `excluded.close` (latest write wins for close), so the last writer's value persists. The correct root cause for the architect to confirm via code recon:

1. Pre-open VPS push (Writer A) writes VHM close=136,100 (correctly ×1000 from 136.1) and AAA close=7,260 (correctly ×1000 from 7.26).
2. taOhlcvBackfillJob (Writer D) at 01:30 UTC fetches VNDIRECT which returns VHM=136.1 in 100-999 range (not caught by normalizeOhlcvToVnd since 136.1 > 100) AND prevClose chain FAILS because today's row is being processed as the ONLY row fetched for this date (the sorted batch does not see the prior real day's close in the VNDIRECT response when the response only contains today's partial row, making prevClose=0 at start of the transaction → detectAndNormalizeScaleFromPrevClose is a no-op).
3. Writer D overwrites Writer A's correct close=136,100 with the un-normalized 136.1.

### 1.3 Required fix — WRITER

**FR-W1 (mandatory, generic):** `taOhlcvBackfillJob` must fetch the prior real close for each ticker from `daily_ohlcv` BEFORE processing that ticker's VNDIRECT batch, and use it as the initial `prevClose` seed for the `detectAndNormalizeScaleFromPrevClose` chain. This ensures the scale-detection guard is non-zero even when VNDIRECT returns only a single row for today.

**FR-W2 (mandatory, generic):** The seed/today's row returned by VNDIRECT (identifiable by: `date = today`, `volume = 0`, `O=H=L=C` flat to reference price) must be handled by Decision 3 (see below) — either skipped or marked and excluded from TA computation. The writer must not write a flat vol=0 placeholder into `daily_ohlcv` for a trading day that has not yet closed.

**FR-W3 (no per-ticker hardcode, /goal#2):** All normalization must be generic — no ticker lists, no date literals, no hardcoded price ranges beyond the existing STOCK_MIN_VND/STOCK_MAX_VND constants in `ohlcvUnitGuard.ts`.

---

## 2. Decision 2 — GUARD: Why CONTAM-5/7 Did Not Catch the Synthetic Seed Path

### 2.1 Guard architecture

`ohlcvSanityCheckJob.ts` (CONTAM-5) runs at 15:05 UTC, 5 minutes after `ohlcvDailyAggregatorJob` (15:03 UTC). It scans the last 7 days for contaminated rows and calls `validateOhlcvUnit`.

### 2.2 Why the 77 corrupt rows are NOT caught by the existing guard

`validateOhlcvUnit` for type="stock" applies:
- Rule 1: zero guard — rejects any field = 0. The corrupt rows have close=136.1 (VHM) or close=7,260,000 (AAA) — neither is 0.
- Rule 2: stock range guard — rejects if any field < STOCK_MIN_VND=100 OR > STOCK_MAX_VND=10,000,000. VHM close=136.1 PASSES (136.1 > 100). AAA close=7,260,000 PASSES (7,260,000 < 10,000,000).
- Rule 3: cross-field unit disagreement — flat O=H=L=C means all four fields are identical, so there is no mixed-unit pattern across fields. PASSES.
- Rule 4: H/L ratio — close=high=low → ratio=1.0. PASSES.
- Rule 5: plausibility — flat row: low=open=close=high. PASSES.

**All 5 rules pass for both the ÷1000 and ×1000 corrupt groups.** The existing `validateOhlcvUnit` guard has no cross-day comparison capability — it is a pure intra-row validator. This is the fundamental gap.

CONTAM-5 and CONTAM-7 tests verify the intra-row guard only (values below STOCK_MIN_VND, above STOCK_MAX_VND, bad H/L ratio). They were written and tested against the known contamination class at the time (sub-100 thousand-VND leakage). The ÷1000 class for high-price stocks (100-999 range) is a NEW class the tests do not cover. The ×1000 class (values >10M) IS within scope of validateOhlcvUnit Rule 2 (above_10m), BUT AAA at 7.26M is just below the 10M ceiling — it passes.

Additionally: the guard is a **post-write detector** (runs after the data is already in `daily_ohlcv`), not a pre-write gatekeeper. It sends a BUG Telegram but does not repair or reject the row.

### 2.3 Required fix — GUARD

**FR-G1 (pre-write, fail-closed):** Add a cross-day scale check to the write path of `taOhlcvBackfillJob` (and optionally `pushPricesHandler`): before inserting or updating any `daily_ohlcv` row for a ticker/date, fetch the most recent prior real close for that ticker (`SELECT close FROM daily_ohlcv WHERE code=? AND date<? AND volume>0 ORDER BY date DESC LIMIT 1`) and apply `detectAndNormalizeScaleFromPrevClose`. If the result is still out of range after normalization, REJECT the write (fail-closed) and log a BUG-level alert. This check must cover all tickers generically.

**FR-G2 (post-write detector extension):** Extend `ohlcvSanityCheckJob.ts` to also flag rows via cross-day comparison: for any row in the last 7 days, if `ABS(close / prior_real_close - 1.0) > 0.5` AND `(close / prior_real_close > 500 OR close / prior_real_close < 0.002)`, flag as `scale_mismatch_vs_prior` and send BUG. This catches both the ÷1000 and ×1000 classes even when intra-row validation passes. `prior_real_close` = most recent daily_ohlcv close for that ticker with `date < row.date AND volume > 0`.

**FR-G3 (seed-bar identity gate):** Extend `ohlcvSanityCheckJob.ts` to flag any row where `O=H=L=C AND volume=0 AND date >= VN_TODAY` as a synthetic placeholder. Flag: `synthetic_seed_bar`. This is a separate check from the scale check — it catches the whole-universe seed write regardless of unit scale.

**FR-G4 (timing fix — guard before aggregator):** The ohlcvSanityCheck should also fire BEFORE the morning-briefing (01:00 UTC), not only at 15:05 UTC. Add a second run at ~00:45 UTC or trigger it from taOhlcvBackfillJob completion (via post-run callback) to catch seed-bar contamination before it poisons the morning briefing.

---

## 3. Decision 3 — SEED BAR POLICY: Stop-Emitting vs Mark+Exclude

### 3.1 Context

The whole-universe 06-16 seed write is a "seed today's candle" design pattern: write a placeholder row at market open (or before) so today's date slot exists in `daily_ohlcv`, to be overwritten by real data as intraday ticks arrive. This pattern violates the standing project goal: **no fake/synthetic/placeholder data on any served metric** (MEMORY: No fake data — real fetch only, 2026-06-15).

### 3.2 Decision: STOP-EMITTING (preferred option)

**Do not write today's candle until real confirmed trading data exists.** Specifically:

- `taOhlcvBackfillJob`: exclude any VNDIRECT row where `date = today AND volume = 0 AND open = close = high = low` from the upsert transaction. Log a debug message and skip. Do NOT write a placeholder.
- `pushPricesHandler`: continue writing today's candle from live VPS push data (this data has real prices; volume is non-zero during trading hours). The current VPS push path is the authoritative real-time writer for today.
- No `data_env` flag needed: the exclusion rule is the guard. If the row is not written, it cannot poison TA.

**Rationale over mark+exclude:**
- Mark+exclude adds complexity in every TA consumer (`get_technical_indicators`, alert-engine, morning-briefing) to filter flagged rows.
- Stop-emitting is simpler, aligns with the no-fake-data standing goal, and removes the source of the problem rather than papering over it.
- The existing architecture already has real-data writers for today (Writer A — pushPricesHandler from VPS live feed). A seed placeholder from VNDIRECT for an incomplete trading day is pure redundancy with a corruption risk.

**Exception:** If the taOhlcvBackfillJob runs on a PAST date (date < today), it must continue to write even if volume=0 (some real trading days have zero foreign volume; the criteria must be `date = today` to identify the synthetic case).

**FR-S1 (mandatory):** taOhlcvBackfillJob MUST skip any fetched row where `date >= VN_TODAY AND volume = 0 AND open = high = low = close` (the synthetic seed fingerprint). Implement as a generic filter on the VNDIRECT response, no per-ticker hardcode.

**FR-S2:** Document the decision in code comments at the skip site, referencing this spec and the standing no-fake-data goal.

---

## 4. Decision 4 — REPAIR: Strategy for the 77 Already-Corrupt 2026-06-16 Rows

### 4.1 Options

| Strategy | Mechanism | Risk |
|---|---|---|
| A — Delete and re-fetch | DELETE the 77 bad rows; next taOhlcvBackfill run re-fetches real data | Leaves gap in TA corpus until next backfill run; TA may still be incomplete for one cycle |
| B — Recompute-on-read | The TA tool reads daily_ohlcv; if today's row is absent (after delete), TA uses the prior real close | Cleanest; no backfill needed; gaps handled naturally |
| C — Targeted UPDATE | Update each of the 77 rows with the correct value (prior real close ×1 for close and ×0 for vol, plus keep the prior real O/H/L from the prior row) | Requires knowing the correct value per ticker; per-row manual patch is fragile |
| D — Delete all 2026-06-16 rows | DELETE FROM daily_ohlcv WHERE date = '2026-06-16'; let today's real pushes re-populate | Cleanest sweep; eliminates all 1203 bad rows at once; real data re-arrives from VPS pushes during market hours |

### 4.2 Decision: Option D (delete all 2026-06-16 rows) with Option B semantics

**FR-R1:** Write a one-shot repair script (persistent in `scripts/`, not `/tmp/`) that executes:
```sql
DELETE FROM daily_ohlcv WHERE date = '2026-06-16' AND volume = 0 AND open = high AND high = low AND low = close AND data_env IS NULL;
```
This is the exact fingerprint of the synthetic seed rows (flat O=H=L=C, vol=0, data_env=NULL). It removes exactly the corrupt rows without touching any real intraday-aggregated rows for today (which would have volume > 0 after market opens).

**FR-R2:** After the repair DELETE, the TA tools will naturally use the prior real close row (2026-06-15) as the last known close. RSI/MA/BB self-heal without requiring a backfill, because the indicator computation uses the most recent N rows from `daily_ohlcv` regardless of whether today's row exists.

**FR-R3:** The repair script must be idempotent (safe to re-run) and must log how many rows were deleted.

**FR-R4:** The repair script filename must be added as a pointer in the owning flow doc per `docs/policies/dev-standards.md § Script Persistence`.

**No per-ticker loop, no per-ticker date literals, no hardcode** — the WHERE clause filters generically on the synthetic-seed fingerprint.

---

## 5. Decision 5 — ACCEPTANCE CRITERIA

### 5.1 LIVE gate (mandatory, must pass before done_verified)

All checks via named-volume DB + gateway tools (NOT badges, NOT host ./data/market.db):

**AC-L1 — No synthetic seed rows remain:**
```sql
SELECT COUNT(*) FROM daily_ohlcv WHERE date = '2026-06-16' AND volume = 0 AND open = high AND high = low AND data_env IS NULL;
-- Expected: 0
```

**AC-L2 — Real RSI restored for ÷1000 group:**
`get_technical_indicators(VHM)` → RSI between 20 and 80 (mid-band); BB `Price=` field shows full 6-figure value (136,100, not 136); no single-digit RSI.
`get_technical_indicators(VIC)` → RSI between 20 and 80; BB `Price=` shows 192,600.
`get_technical_indicators(VJC)` → RSI between 20 and 80; not single-digit.

**AC-L3 — Real RSI restored for ×1000 group:**
`get_technical_indicators(AAA)` → RSI NOT pegged at 100.0 (must be between 20 and 80 for a healthy stock).
`get_technical_indicators(ADS)` → same constraint.

**AC-L4 — No false "giá 0 dưới BB" alerts:**
After repair + next morning-briefing (01:00 UTC), no `get_unreviewed_market_messages` returns contain "giá 0 dưới BB" false breakout pattern across the full watchlist.

**AC-L5 — Generic: all 1203 tickers clean:**
```sql
SELECT COUNT(*) FROM daily_ohlcv WHERE date >= '2026-06-16' AND volume = 0 AND open = high AND high = low AND data_env IS NULL;
-- Expected: 0 (no new synthetic seeds for today or any future date)
```

**AC-L6 — Seed-bar policy active (no new seeds written):**
After the fix deploys, run `taOhlcvBackfillJob` manually (or wait for the 01:30 UTC cron). Verify no new rows are inserted for today's date with volume=0 flat O=H=L=C.

### 5.2 Regression tests (CI, must be green)

**AC-T1 — Guard rejects ÷1000 corrupt candle (new test required):**
Seed a `daily_ohlcv` row for VHM: `date=TODAY, open=high=low=close=136.1, volume=0`, with prior real row: `date=YESTERDAY, close=136100, volume=8140900`. Run `taOhlcvBackfillJob` with this row as input. Assert the 136.1 row is NOT written (skipped) OR is corrected to 136,100 before write. Assert guard rejects if written raw.

**AC-T2 — Guard rejects ×1000 corrupt candle (new test required):**
Seed a prior real row for AAA: `date=YESTERDAY, close=7260, volume=1000000`. Provide today's VNDIRECT response: `date=TODAY, open=high=low=close=7.26, volume=0`. Assert `normalizeOhlcvToVnd` normalizes to 7,260 (not 7,260,000), and the seed-bar filter (FR-S1) then skips the row entirely. Assert no row is written for TODAY with volume=0.

**AC-T3 — Sanity check flags cross-day scale mismatch (FR-G2 new test):**
Seed a daily_ohlcv corpus: `VHM YESTERDAY close=136100 volume>0`, `VHM TODAY close=136.1 volume=0`. Run `runOhlcvSanityCheck`. Assert `hitCount >= 1` and `hits[0].flag` contains `scale_mismatch_vs_prior`.

**AC-T4 — taOhlcvBackfillJob skips synthetic seed (FR-S1):**
Provide VNDIRECT mock response for VHM: `[{date: TODAY, open: 136.1, high: 136.1, low: 136.1, close: 136.1, nmVolume: 0}]`. Run `runTaOhlcvBackfill` with this mock. Assert no row exists in daily_ohlcv for `VHM, TODAY`.

**AC-T5 — Existing CONTAM-5/7 tests remain GREEN (regression guard):**
No existing tests broken by the guard additions.

---

## 6. DDD Layer Mapping

| Requirement | Layer | File / Module |
|---|---|---|
| FR-W1: prevClose seed from DB before processing | domain/services | `ohlcvUnitGuard.ts` — add `prevCloseFromDb` lookup helper, or pass prevClose into `insertMany` from the caller in the scheduler layer |
| FR-W2, FR-S1: Skip synthetic seed rows | scheduler | `taOhlcvBackfillJob.ts` — filter before `insertMany` transaction |
| FR-W3: Generic normalization, no hardcode | domain/services | `ohlcvUnitGuard.ts` — existing contract; no changes needed here |
| FR-G1: Pre-write cross-day scale check | scheduler | `taOhlcvBackfillJob.ts` — add prevClose DB lookup per ticker before transaction |
| FR-G2: Cross-day scale check in sanity job | scheduler | `ohlcvSanityCheckJob.ts` — add per-row prevClose lookup in scan loop |
| FR-G3: Synthetic seed bar flag in sanity job | scheduler | `ohlcvSanityCheckJob.ts` — add flat-bar detector rule |
| FR-G4: Earlier sanity check run | infrastructure/scheduler | `cronConfig.ts` — add second ohlcvSanityCheck cron at 00:45 UTC or callback from taOhlcvBackfillJob |
| FR-S2: Decision doc comment | scheduler | `taOhlcvBackfillJob.ts` inline comment |
| FR-R1–R4: Repair script | scripts/ | `scripts/repair-ohlcv-seed-candle-2026-06-16.ts` (or `.jq`) — one-shot idempotent DELETE |
| AC-T1–T5: New regression tests | interface/tests | `src/__tests__/FIX-OHLCV-SEED-CANDLE-UNIT-SCALE.test.ts` |

---

## 7. Blockers for PO

**BLOCKER-1 (architect decision):** The exact primary writer for the 1203 flat rows must be confirmed via code recon on the live container logs (`docker exec mcp-server grep "taOhlcvBackfill\|push-prices\|ohlcv" /data/logs/*.log | grep "2026-06-16 01:3"`). This confirms whether the root is taOhlcvBackfillJob alone or a double-write race with pushPricesHandler. The BA spec covers both paths generically, but the architect must design the guard placement to intercept the correct writer(s).

**BLOCKER-2 (scope):** FR-G4 (add 00:45 UTC cron) requires a cron-config change which is a scheduler infra concern. Confirm whether the dev-mcp-server can add the cron entry in this task or if it needs a separate infra ticket.

**BLOCKER-3 (test fixture):** AC-T1 requires a real named-volume DB sidecar probe to confirm the `data_env IS NULL` fingerprint is stable and not set by any currently active writer. If `data_env` is set by a future writer in a parallel task, the repair DELETE WHERE clause must be revised.

**No blockers prevent architect from starting design** — these are confirmation items, not prerequisite decisions.

---

## 8. Non-Functional Requirements

**NFR-1 (fail-loud, no silent swallow):** Any rejected write (FR-G1) must log at ERROR level, not be silently dropped. Per `docs/protocols/fail-loud-protocol.md`.

**NFR-2 (idempotent repair):** The repair script must be safe to run multiple times. Use `DELETE WHERE ... AND volume = 0 AND open = high AND high = low` — this is a no-op when the rows are already deleted.

**NFR-3 (no per-ticker hardcode):** The entire fix must be generic across all 1203 tickers. No ticker lists, no date literals (except for the one-shot repair WHERE clause targeting the specific corrupt date), no per-ticker price ranges.

**NFR-4 (rebuild required):** All changes to `apps/mcp-server/src/` require a Docker rebuild of the `mcp-server` image followed by `docker compose up -d --force-recreate mcp-server`. Ops must verify image `.Created` timestamp matches post-commit time.

**NFR-5 (test isolation):** New tests must use in-memory SQLite and injectable deps (no named-volume, no network) per existing CONTAM-5/7 pattern.

---

## 9. Out of Scope

- Alert-engine (dev-alert-engine zone): the MIN_CANDLES=35 guard in FIX-ALERT-ENGINE-RSI-SINGLEDIGIT is a symptom mitigation that remains valid but does NOT address the data corruption. It is out of scope for this task.
- `pushPricesHandler` guard extension (FR-G1 secondary target): the pushPricesHandler already has `validateOhlcvUnit` + unit multiplication. If taOhlcvBackfillJob is the sole primary writer (confirmed by BLOCKER-1), no changes to pushPricesHandler are needed. If it is a double-write race, the architect may optionally add prevClose-based validation to pushPricesHandler's OHLCV upsert path. This is left to the architect.
- Historical corpus re-flow beyond 2026-06-16: the repair DELETE targets only the known corrupt date. Any other corrupt dates must be identified separately.

---

## 10. Unblocks

On LIVE gate passing (AC-L1 through AC-L6):
- `FIX-ALERT-ENGINE-RSI-SINGLEDIGIT` → re-evaluate done_verified (symptom gone; MIN_CANDLES=35 guard preserved as defense-in-depth)
- `FIX-ALERT-OPEN-ZERO-PRICE-RACE` → gate RED lifted; PO can unhold
