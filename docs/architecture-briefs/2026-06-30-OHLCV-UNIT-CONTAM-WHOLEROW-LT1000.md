# Architecture Brief — OHLCV-UNIT-CONTAM-WHOLEROW-LT1000

**Task:** FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM
**Sprint:** OHLCV-UNIT-CONTAM-WHOLEROW-LT1000
**Author:** architect
**Date:** 2026-06-30
**Build-Standard:** not-applicable (bug-fix + durable writer hardening; no new microservice)
**Zone:** `apps/mcp-server/` (writer + sanity job) + `scripts/migrations/` (repair script)

---

## 1. Root Cause: Why CONTAM-6 Is Structurally Blind

CONTAM-6 WHERE predicate (`repair-ohlcv-unit-contamination.ts` lines 92–98):
```
(open < 100 OR low < 100) AND close >= 1000
```

This targets the **partial contamination** class: some fields in thousands-VND, some in full-VND. The requirement `close >= 1000` means close must already be in full-VND scale; only open/low are contaminated.

The current class is **whole-row** contamination where ALL four OHLC fields are stored in thousands-VND:
- FPT real price ~110,000–140,000 VND → stored as 110–140. close ≈ 130 → `close >= 1000` is FALSE → CONTAM-6 never fires.
- DHG real price ~63,000–92,000 VND → stored as 63–92. `close >= 1000` FALSE.
- VHM real price ~40,000–50,000 VND → stored as 40–50. `close >= 1000` FALSE.

CONTAM-6 UPDATE fixes only `open` and `low` per the predicate; even if the predicate matched, the UPDATE clause `CASE WHEN open < 100 THEN open * 1000` would leave `close` and `high` at the thousands scale.

**Gap in `normalizeOhlcvToVnd`** (`ohlcvUnitGuard.ts` lines 196–203):
```ts
const mag = Math.max(v.open, v.high, v.low, v.close);
if (mag < STOCK_MIN_VND) {  // STOCK_MIN_VND = 100
  return { whole row * 1000 }
}
```
For a stock at 110–140 in thousands scale, `mag ≈ 140 >= 100` → function returns unchanged. Only stocks whose thousands-format price is < 100 VND (real price < 100,000 VND) are caught.

**Gap in `detectAndNormalizeScaleFromPrevClose`**: it fetches `prevClose` from the DB via `fetchPrevCloseMap`. If all historical rows for a ticker are already at the contaminated scale (e.g., all FPT rows at ~130), then `prevClose ≈ 130` and `current.close ≈ 130` → ratio ≈ 1 → no detection. The bootstrap condition breaks the guard.

---

## 2. Deliverable A — Repair Migration

### File
`scripts/migrations/repair-ohlcv-unit-contamination-wholerow-lt1000.ts`

Pattern mirrors `repair-ohlcv-unit-contamination.ts` exactly (exported `runRepair()`, dry-run/live CLI, human-confirm gate, BEGIN IMMEDIATE transaction, post-verify count). Pointer added to `docs/policies/dev-standards.md` § Script Persistence (CANONICAL block, same style as CONTAM-6).

### Predicate Algorithm: Per-Ticker Anchor, NOT Blind Close<1000

The PO confirmed "recent bars CLEAN" — the contamination is bounded in the PAST. This allows using the ticker's own recent clean bars as the reference scale.

**Step 1 — Anchor close per ticker** (single batched CTE, non-N+1):
```sql
WITH anchor AS (
  SELECT code,
         close AS anchor_close
  FROM (
    SELECT code, close,
           ROW_NUMBER() OVER (PARTITION BY code ORDER BY date DESC) AS rn
    FROM daily_ohlcv
    WHERE close >= 1000
      AND volume > 0
      AND date >= date('now', '-180 days')
      AND code NOT IN ('VNINDEX','VN30','HNXINDEX','HNX30','UPCOMINDEX')
  ) ranked
  WHERE rn = 1
)
```

**Step 2 — Candidate rows** (join anchor, apply ratio + value guard):
```sql
, candidates AS (
  SELECT d.code, d.date, d.open, d.high, d.low, d.close,
         a.anchor_close,
         CAST(a.anchor_close AS REAL) / d.close AS ratio
  FROM daily_ohlcv d
  INNER JOIN anchor a ON a.code = d.code
  WHERE d.close > 0 AND d.close < 1000
    AND d.open  > 0
    AND d.high  > 0
    AND d.low   > 0
    AND CAST(a.anchor_close AS REAL) / d.close >= 100
    AND d.code NOT IN ('VNINDEX','VN30','HNXINDEX','HNX30','UPCOMINDEX')
    AND NOT (d.open = 0 AND d.low = 0 AND d.high = 0 AND d.close = 0)
)
```

**Why `ratio >= 100` (not 1000)**: the 1000x step is the expected contamination; using 100 as the threshold gives headroom for stocks that have had large price moves while still being far from the legitimate scale. A stock cannot legitimately move 100x vs its own price 180 days ago without a stock split that would be reflected in adjusted prices.

**Step 3 — Dry-run report** (printed per ticker: code, date_range_first..date_range_last, row_count, anchor_close, sample before/after projection).

**Step 4 — Human confirm**: prompt with full count + top-3 per-ticker sample, identical to CONTAM-6 confirm pattern.

**Step 5 — UPDATE in transaction** (whole-row ×1000):
```sql
UPDATE daily_ohlcv
SET open  = open  * 1000,
    high  = high  * 1000,
    low   = low   * 1000,
    close = close * 1000
WHERE (code, date) IN (SELECT code, date FROM candidates)
```
`data_env` preserved (RF-5 — not touched). `updated_at` refreshed to `datetime('now')`.

**Step 6 — Post-verify**: re-run candidates CTE, expect count = 0. If non-zero, log WARNING (do not abort — partial repair is still progress). Emit count per ticker.

### Index-Ticker Exclusion

Use the same constant as `ohlcvSanityCheckJob.ts`:
```ts
const INDEX_TICKERS = new Set(["VNINDEX", "VN30", "HNXINDEX", "HNX30", "UPCOMINDEX"]);
```
Applied in BOTH the anchor CTE `WHERE` clause (index tickers cannot provide anchor) AND the candidates `WHERE` clause (index tickers cannot be contamination targets). RC3 is NOT an index ticker — it falls under per-ticker logic naturally.

### RC3 Safety

RC3 just backfilled 253 bars (noted in PO caution). Two scenarios:
- RC3 recent bars have `close >= 1000` (legitimate mid-price stock): anchor found → per-ticker ratio logic applies correctly.
- RC3 has no recent bars with `close >= 1000` (legitimately cheap < 1000 VND): no anchor → SKIP → logged as `[skip] RC3: no clean anchor in last 180 days`.

In both cases no false mutation occurs.

### DB-Corruption Risk Mitigations

- **R1 — Dry-run mandatory first pass**: script defaults to `--dry-run`; `--live` is an explicit flag.
- **R2 — Human confirm at N>0**: prompt aborts (exit 2) if user answers anything other than "yes".
- **R3 — BEGIN IMMEDIATE transaction**: if any row fails, ROLLBACK restores all rows.
- **R4 — Post-verify count**: script reports remaining contaminated rows after UPDATE; non-zero triggers WARNING log.
- **R5 — Off-hours guidance**: doc comment recommends running outside 02:00–09:00 UTC (VN trading hours), same as CONTAM-6 RF-3.
- **R6 — Per-ticker report in dry-run**: developer can audit each ticker's date range before confirming, catching any unexpected tickers in the candidate set.

---

## 3. Deliverable B — Reflow Derived Columns

### Determination: Computed-On-Read, No Reflow Needed

All three relevant indicator tools are confirmed computed-on-read by the Go TA microservice (source_tier: 3, derived from daily_ohlcv Tier 2 prices):

| Tool | File | Route | Storage |
|------|------|-------|---------|
| `get_relative_strength` | `relativeStrengthTools.ts` | `computeRelativeStrength()` → Go POST /ta/relative-strength | none (computed each call) |
| `get_roc_momentum` | `rocMomentumTools.ts` | `computeROCMomentum()` → Go POST /ta/roc-momentum | none |
| `get_52w_proximity` | `52wProximityTools.ts` | `compute52WProximity()` → Go POST /ta/52w-proximity | none |

`daily_ohlcv` schema (verified in `schema-market-data.ts` lines 88–105) contains only: code, date, open, high, low, close, volume, updated_at, foreign flow columns, data_env. No materialized RS, ROC, percentile, or 52w columns exist.

### Action Required (Post-Repair Only)

After repair, the developer MUST run a raw-probe via gateway to confirm the serving layer self-heals:
```
mcp__gateway__call_tool("vn-market", "get_relative_strength", { watchlist_tickers: ["FPT","DHG","VHM","VIC"] })
mcp__gateway__call_tool("vn-market", "get_roc_momentum", { watchlist_tickers: ["FPT","DHG","VHM","VIC"] })
mcp__gateway__call_tool("vn-market", "get_52w_proximity", { watchlist_tickers: ["FPT","DHG","VHM","VIC"] })
```
Expected: FPT rs h252 ≈ plausible range (not 594x), roc not 606x, VHM rs not -1.35. Any anomaly = repair incomplete or Go TA svc caching stale data (restart TA svc if needed).

No migration script for B. No code change for B.

---

## 4. Deliverable C — Durable Writer Guard + Sanity Job Extension

### C.1 — Writer Fix: `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts`

**Root cause in writer pipeline**:
- Step 2 (`normalizeOhlcvToVnd`): fires only for `max(OHLC) < 100`. Cannot be extended to `< 1000` without breaking legitimately cheap stocks.
- Step 3 (`detectAndNormalizeScaleFromPrevClose`): uses `prevCloseMap` populated by `fetchPrevCloseMap(db, codes, vnToday)` — queries the most recent close with `date < vnToday AND volume > 0`. If that prevClose is itself contaminated (whole-series contamination), ratio ≈ 1 → blind.

**Fix**: add `fetchCleanReferenceCloseMap` (new private function in `ohlcvWriteService.ts`):

```ts
/**
 * Fetches the most recent CLEAN close per code — defined as close >= CLEAN_CLOSE_FLOOR
 * (1000 VND) and volume > 0, searching the FULL history (no date cutoff).
 *
 * Used as a supplemental scale anchor when the standard prevClose from
 * fetchPrevCloseMap is < CLEAN_CLOSE_FLOOR (possibly itself contaminated).
 *
 * Returns Map<code, cleanRefClose>. Codes with no clean close are absent.
 *
 * DDD layer: application/usecases (infrastructure access allowed here).
 */
const CLEAN_CLOSE_FLOOR = 1000;

function fetchCleanReferenceCloseMap(db: Database, codes: string[]): Map<string, number> {
  // Single batched query — no N+1
  // Find the most recent close >= 1000 AND volume > 0 for each code across all history
}
```

**Integration in `writeOhlcvBatch` Stage 1**:
```ts
const prevCloseMap = fetchPrevCloseMap(db, uniqueCodes, vnToday);
const cleanRefMap  = fetchCleanReferenceCloseMap(db, uniqueCodes);  // NEW

// Per-row in Stage 3:
const prevClose = prevCloseMap.get(row.code) ?? 0;
const cleanRef  = cleanRefMap.get(row.code)  ?? 0;
// If standard prevClose is < CLEAN_CLOSE_FLOOR (possibly contaminated itself),
// and a clean reference exists, use cleanRef instead.
const effectivePrevClose =
  (prevClose < CLEAN_CLOSE_FLOOR && cleanRef >= CLEAN_CLOSE_FLOOR) ? cleanRef : prevClose;
const scaleResult = detectAndNormalizeScaleFromPrevClose(type, ohlcv, effectivePrevClose);
```

**Why this is safe**:
- If the DB is clean (post-repair), `prevClose` is already >= 1000 for mid-price stocks → `effectivePrevClose = prevClose` (no change from current behaviour).
- If a backfill writes contaminated rows when prevClose is dirty, `cleanRef` (sourced from any historical bar with `close >= 1000`) provides the correct scale anchor → `detectAndNormalizeScaleFromPrevClose` detects the ÷1000 step and applies the ×1000 correction.
- For legitimately cheap stocks (all-history close < 1000), `cleanRef` is absent → `effectivePrevClose = prevClose` → no change from current behaviour.

**DDD layer**: `fetchCleanReferenceCloseMap` is a private helper inside `application/usecases/ohlcvWriteService.ts`, which already has DB access. This is the correct layer for infrastructure queries coordinated by the application use-case. The domain function `normalizeOhlcvToVnd` stays pure and unchanged.

**`normalizeOhlcvToVnd` domain function**: NO change. The function's invariant (`mag < 100 → ×1000`) is intentionally conservative to avoid false-positive scaling of cheap stocks. The application layer now handles the bootstrap gap.

### C.2 — Sanity Job Extension: Pass 4

**File**: `apps/mcp-server/src/scheduler/market-data/ohlcvSanityCheckJob.ts`

Add **Pass 4 — whole-row close<1000 anchor divergence scan** after the existing three passes.

Scope: FULL daily_ohlcv (not just 7-day window), per watchlist ticker.

Algorithm:
1. Before the main scan loop, run a single batched query to build `anchorCloseMap` per ticker: most recent `close >= 1000 AND volume > 0` across all history, excluding index tickers.
2. In Pass 4, for each row in the existing scan: if `anchorClose >= 1000 AND row.close > 0 AND row.close < 1000 AND anchorClose / row.close >= 100` → flag as `whole_row_lt1000_scale: ratio=Nx anchor=A row.close=C`.
3. Index tickers excluded (same `INDEX_TICKERS` constant).
4. Hits joined into the existing `hits[]` array → same BUG Telegram path, message suffix: "Action: run repair-ohlcv-unit-contamination-wholerow-lt1000.ts --dry-run to assess".
5. Note: Pass 4 is more expensive than Passes 1–3 (full-table anchor query). Acceptable because the sanity job runs once-per-day off-hours (CONTAM-5 cadence). The anchor query is one batched JOIN query, not N+1.

**Scan window concern**: the existing scan fetches rows `WHERE date >= cutoff (7 days ago)`. Pass 4 only flags contaminated rows in that 7-day window, not historical ones. This is INTENTIONAL for the ongoing monitor: the repair migration (A) handles the backlog; Pass 4 prevents NEW contamination from silently accumulating. If contaminated rows older than 7 days are reintroduced by a re-backfill, the anchor divergence will show in the 7-day window at the start of the contaminated segment.

To detect historical residue (for post-repair verification), the anchor query used in Pass 4 CAN be extended to scan ALL rows (not just the 7-day window), but this is a one-time check the repair migration already covers. Do not make the daily monitor run a full-table row-by-row scan.

### C.3 — No Changes to Writers E/F/H

The OHLCV-WRITE-BYPASS-ALLOWED sentinel pattern (documented in `ohlcvWriteService.ts` lines 55–79) already requires these writers to call `validateOhlcvUnit`. No architectural change needed. The sentinel audit remains the enforcement mechanism.

---

## 5. Files to Create / Modify

| File | Action | DDD Layer | Owner |
|------|---------|-----------|-------|
| `scripts/migrations/repair-ohlcv-unit-contamination-wholerow-lt1000.ts` | CREATE | n/a (migration script) | developer |
| `docs/policies/dev-standards.md` | MODIFY — add CANONICAL pointer block for new migration | n/a | developer (same commit) |
| `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts` | MODIFY — add `fetchCleanReferenceCloseMap` + `CLEAN_CLOSE_FLOOR` + `effectivePrevClose` logic in Stage 1+3 | application | developer |
| `apps/mcp-server/src/scheduler/market-data/ohlcvSanityCheckJob.ts` | MODIFY — add Pass 4 whole-row close<1000 anchor divergence scan + anchorCloseMap build | scheduler | developer |
| `apps/mcp-server/src/__tests__/OHLCV-WHOLEROW-LT1000-*.test.ts` | CREATE — unit tests for new migration predicate + writer guard + sanity Pass 4 | test | developer |
| `docs/handoffs/FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM.md` | CREATE (handoff) | n/a | this brief |

---

## 6. Risk Flags

| Risk | Severity | Mitigation |
|------|----------|-----------|
| RISK-1: Anchor-close query picks contaminated "clean" bar if 180-day window contains only contaminated recent bars | HIGH | Dry-run report shows anchor_close per ticker. Human reviewer verifies anchor values make sense (should be 50,000–200,000 range for VN mid-caps). If anchor looks wrong, extend window or skip ticker. |
| RISK-2: Stocks legitimately trading 100–999 VND full-VND scale incorrectly identified | HIGH | Per-ticker anchor required (`anchor >= 1000` filters these out — no anchor → skip). Only tickers with a clean high-VND reference are touched. |
| RISK-3: Concurrent writer during repair | MEDIUM | BEGIN IMMEDIATE lock prevents concurrent writes during the UPDATE transaction. Run off-hours (RF-3). |
| RISK-4: `fetchCleanReferenceCloseMap` performance overhead on large daily_ohlcv | MEDIUM | One batched JOIN query using existing `idx_daily_ohlcv_code_date` index. Comparable cost to existing `fetchPrevCloseMap`. No N+1. |
| RISK-5: CONTAM-5 Pass 4 anchor query expensive on full table | LOW | Anchor query: one batched query (INNER JOIN + ROW_NUMBER), not per-row. Same index coverage. Acceptable for off-hours cron. |
| RISK-6: RC3 or other recently-backfilled ticker with partial data incorrectly anchored | LOW | No anchor → skip. The 180-day window is conservative; a ticker that's been backfilling for 2 weeks won't have an anchor → safe skip until enough history accumulates. |

---

## 7. Test Strategy

### Migration (A)
- Unit tests against SQLite `:memory:`: insert synthetic contaminated + legitimate rows for test tickers; verify runRepair() with dry-run counts correctly and live UPDATE produces ×1000 values; verify index tickers are excluded; verify legitimately-cheap stocks (all-history close < 1000) are skipped.
- File: `apps/mcp-server/src/__tests__/OHLCV-WHOLEROW-LT1000-migration.test.ts`

### Writer Guard (C.1)
- Unit test: mock `fetchPrevCloseMap` returning contaminated prevClose (< 1000) for a code; mock `fetchCleanReferenceCloseMap` returning clean reference (e.g., 130000); verify `detectAndNormalizeScaleFromPrevClose` receives `effectivePrevClose = 130000` and applies ×1000 correction to a row with close=130.
- Edge case: legitimately cheap stock — `fetchCleanReferenceCloseMap` returns absent → `effectivePrevClose = prevClose` → no correction (correct).
- File: `apps/mcp-server/src/__tests__/OHLCV-WHOLEROW-LT1000-writer-guard.test.ts`

### Sanity Job Pass 4 (C.2)
- Unit test: insert rows for two tickers in `:memory:` — one with contaminated old bar (close=130, anchor=130000, ratio=1000) and one legitimately cheap (close=500, no anchor >= 1000). Verify Pass 4 flags only the contaminated row. Verify index tickers are excluded.
- File: `apps/mcp-server/src/__tests__/OHLCV-WHOLEROW-LT1000-sanity-pass4.test.ts`

---

## 8. BUILD-STANDARD Classification

BUG-FIX / MAINTENANCE — `apps/mcp-server/` exists, no new microservice.
```
BUILD-STANDARD: not-applicable
```

---

## 9. Proposed PM Task Decomposition

PM should create these atomic tasks under sprint OHLCV-UNIT-CONTAM-WHOLEROW-LT1000:

| Task ID (proposed) | Title | Zone | Serialize? | Depends |
|--------------------|-------|------|-----------|---------|
| CONTAM-10-MIGRATION | Write + test repair migration (A) | `scripts/migrations/` + `apps/mcp-server/src/__tests__/` | — | none |
| CONTAM-10-WRITER | Writer guard fix (C.1) in ohlcvWriteService.ts + test | `apps/mcp-server/src/application/` | — | none |
| CONTAM-10-SANITY | Sanity job Pass 4 extension (C.2) + test | `apps/mcp-server/src/scheduler/` | — | none |
| CONTAM-10-EXEC | Human dry-run review → live run → serving-layer probe (B) | live-DB / gateway | SEQUENTIAL after CONTAM-10-MIGRATION | CONTAM-10-MIGRATION |
| CONTAM-10-DEVSTD | Update dev-standards.md CANONICAL pointer | `docs/policies/` | in same commit as MIGRATION | CONTAM-10-MIGRATION |

**Parallel dispatch**: CONTAM-10-MIGRATION, CONTAM-10-WRITER, CONTAM-10-SANITY have disjoint file scopes → can be dispatched in parallel (worktree isolation — each touches different files, no shared SSOT).

**Sequential gate**: CONTAM-10-EXEC (the live DB mutation) blocks on CONTAM-10-MIGRATION passing QA. Do NOT run the live migration until the migration script is QA-verified in `:memory:` tests.

**Writer guard (CONTAM-10-WRITER) does NOT block the live exec**: the writer fix prevents future contamination; the repair migration cleans existing residue. They can land in any order.

**SSOT note**: `ohlcvWriteService.ts` and `ohlcvSanityCheckJob.ts` are in different folders → CONTAM-10-WRITER and CONTAM-10-SANITY are parallel-safe. If worktree isolation is used, they must each commit their own zone only.

---

## 10. Addendum — Round 2 (2026-07-08): Writer H was never migrated, still actively leaking

CONTAM-10-MIGRATION/WRITER/SANITY (§9) shipped 2026-06-30 and are live in the deployed image
(built 2026-07-04). CONTAM-10-EXEC (the live repair) was never run — a fresh dry-run on
2026-07-08 shows contamination GREW to 6,533 rows / 27 tickers (from the original 10-row/7-day
alert), because **`handlePushOhlcvHistory`** (`apps/mcp-server/src/interface/mcp/routes/ohlcvBackfillHandler.ts`,
route `POST /api/push-ohlcv-history`, fired every ~15–30 min by `vps-scripts/fetch-ohlcv-backfill.sh`
via the `ohlcv_backfill_queue` poll loop — confirmed live, not one-time) was **never migrated to
`writeOhlcvBatch`**. It does a raw `INSERT … ON CONFLICT DO UPDATE` guarded by `validateOhlcvUnit`
only (intra-row) — the exact structural blind spot §1 already diagnosed for `normalizeOhlcvToVnd`,
now reproduced because this writer never gained the CONTAM-10-WRITER cross-day `cleanRef` check.
Live evidence (VHM/VIC + 22 other tickers, ~750 rows each, one `updated_at=2026-07-07T19:10:48Z`
batch) confirms this route is the active leak, still writing contaminated whole-row bars up to the
day before this brief was written. Full root-cause chain, PO-hazard investigation (flat
cold-start seed bars ARE picked up as anchors but are numerically safe, confirmed live), and
updated PM task table (`CONTAM-10-WRITER-H`, gated `CONTAM-10-EXEC-2`) → `[Architect] Brownfield
Findings — Round 2` in `docs/handoffs/FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM.md`.
