<!-- size-justification: 100L — prev-close lookup + delta computation helper + updated SQL statements + transaction call-sites; infrastructure write seam; pattern mirrors existing commodity fetcher -->

# DPI-3 — Brent/Gold Delta: Prev-Close Lookup Inside Transaction

**Sprint:** DATA-PIPELINE-INTEGRITY | **Zone:** `apps/mcp-server/` | **Author:** pm | **Date:** 2026-05-30

---

## Context

`market_prices` table stores BRENT and GOLD with `change_amt=0, change_pct=0` hardcoded (L405-415 `upsertMacroPrice` prepared statement). DPI-3 computes deltas from previous tick's price, enabling non-zero directional change-% in live surfaces.

**Architecture brief:** `docs/handoffs/DPI-ARCH.md` § DPI-3 (prev-close lookup + delta computation).

---

## Specification

### Files to modify

1. **`apps/mcp-server/src/infrastructure/fetchers/yahooFinance.ts`** — modify `storeCommoditySnapshot()` function only.

### Implementation Approach

#### A. Pre-transaction prev-close lookup

Before `runTransaction()`, add two separate read queries to fetch previous BRENT and GOLD prices:

```typescript
// Read prev-close for each commodity BEFORE the transaction.
// Use the most recent history row BEFORE the current snapshot's fetched_at.
const prevBrent: number | null = db.prepare(`
  SELECT brent_crude_usd FROM commodity_prices_history
  WHERE source = 'yahoo' AND fetched_at < ?
  ORDER BY fetched_at DESC LIMIT 1
`).get(snapshot.fetchedAt)?.brent_crude_usd ?? null;

const prevGold: number | null = db.prepare(`
  SELECT gold_usd_per_oz FROM commodity_prices_history
  WHERE source = 'yahoo' AND fetched_at < ?
  ORDER BY fetched_at DESC LIMIT 1
`).get(snapshot.fetchedAt)?.gold_usd_per_oz ?? null;
```

**Why separate reads before transaction:** Avoids holding write lock during SELECT; cleaner DDD readability (transaction body is write-only).

**Staleness handling:** If history table has <2 rows, queries return null (tolerated per FR-DPI-3c). First-run deltas will be 0; next daily tick (06:00 UTC) produces non-zero delta.

#### B. Delta computation helper function

Add module-private function (not exported):

```typescript
function computeDelta(current: number | null, prev: number | null): { amt: number; pct: number } {
  if (current == null || prev == null || prev === 0) return { amt: 0, pct: 0 };
  const amt = current - prev;
  const pct = (amt / prev) * 100;
  return { amt, pct };
}
```

Call before `runTransaction()`:
```typescript
const brentDelta = computeDelta(snapshot.brentCrudeUSD, prevBrent);
const goldDelta  = computeDelta(snapshot.goldUSDPerOz, prevGold);
```

#### C. Updated upsertMacroPrice statement

Replace L409-415 prepared statement with:

```typescript
const upsertMacroPrice = db.prepare(`
  INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at)
  VALUES (?, ?, ?, ?, 0, ?)
  ON CONFLICT(code) DO UPDATE SET
    price      = excluded.price,
    change_amt = excluded.change_amt,
    change_pct = excluded.change_pct,
    updated_at = excluded.updated_at
`);
```

**Change:** ON CONFLICT branch now explicitly updates `change_amt` and `change_pct` (previously hardcoded to 0 and not updated).

#### D. Transaction call sites

Replace L469-473 (current BRENT/GOLD upsert calls):

```typescript
if (snapshot.brentCrudeUSD != null) {
  upsertMacroPrice.run("BRENT", snapshot.brentCrudeUSD, brentDelta.amt, brentDelta.pct, snapshot.fetchedAt);
}
if (snapshot.goldUSDPerOz != null) {
  upsertMacroPrice.run("GOLD", snapshot.goldUSDPerOz, goldDelta.amt, goldDelta.pct, snapshot.fetchedAt);
}
```

**Before (current):**
```typescript
if (snapshot.brentCrudeUSD != null) {
  upsertMacroPrice.run("BRENT", snapshot.brentCrudeUSD, 0, 0, snapshot.fetchedAt);
}
```

---

## Acceptance Criteria

1. **AC-1: Pre-transaction queries** — `prevBrent` and `prevGold` fetched from `commodity_prices_history` using separate `db.prepare(...).get()` calls BEFORE `runTransaction()`.

2. **AC-2: Delta helper function** — `computeDelta()` function exists, module-private (not exported), returns `{amt, pct}` object; guards against null/0 prev values.

3. **AC-3: Updated prepared statement** — `upsertMacroPrice` ON CONFLICT branch includes `change_amt = excluded.change_amt, change_pct = excluded.change_pct` (not hardcoded to 0).

4. **AC-4: Transaction call-site updates** — L469-473 calls `upsertMacroPrice.run()` with computed deltas (brentDelta.amt, brentDelta.pct) for BRENT and goldDelta.amt, goldDelta.pct for GOLD.

5. **AC-5: First-run tolerance** — if `commodity_prices_history` has <2 rows, deltas are 0 (return guard); no error thrown; next daily tick produces non-zero delta.

6. **AC-6: Live delta gate** — `get_market_snapshot` BRENT and GOLD change_pct are non-zero and directionally plausible (sign matches price movement direction).

---

## Testing

- Unit test: `computeDelta()` with various (current, prev) pairs: (100, 80)→{amt:20, pct:25}, (100, 100)→{amt:0, pct:0}, (null, 100)→{amt:0, pct:0}, (100, 0)→{amt:0, pct:0}.
- Unit test: prev-close query with mock history table (fresh, stale, absent scenarios).
- Unit test: UPSERT statement with conflict scenario (existing BRENT row, delta updates columns).
- Integration: after rebuild, live `get_market_snapshot` BRENT/GOLD change_pct non-zero on a tick >1h from schema creation.

---

## Risk Flags

- **R-2 (MEDIUM) — First-run prev-close missing:** If rebuild occurs and commodity_prices_history has <2 rows, first snapshot writes delta=0. This is per-spec acceptable. Next daily tick (06:00 UTC) will produce non-zero delta. Document in code comment above prev-close queries.

---

## DoD (Definition of Done) — OPS + QA Gate

After dev commit and ops REBUILD:
- **QA GATE:** `get_market_snapshot` BRENT change_pct is non-zero and matches direction of BRENT movement since previous tick.
- **QA GATE:** `get_market_snapshot` GOLD change_pct is non-zero and matches direction of GOLD movement since previous tick.
- **Verification:** live MCP tool probe on two consecutive ticks >1h apart.

---

## Related documents

- Architect brief: `docs/handoffs/DPI-ARCH.md`
- BA spec: `docs/REQ_DATA-PIPELINE-INTEGRITY.md`
- Reference: `apps/mcp-server/src/infrastructure/fetchers/yahooFinance.ts:195-315` (existing commodity fetch pattern)

---

## [Developer] Implementation — 2026-05-30

**Status: Review**

**Files changed:**
- `apps/mcp-server/src/infrastructure/fetchers/yahooFinance.ts` — added `computeDelta()` private helper; pre-transaction prev-close reads for BRENT and GOLD from `commodity_prices_history`; updated `upsertMacroPrice` ON CONFLICT branch to include `change_amt = excluded.change_amt, change_pct = excluded.change_pct`; updated transaction call-sites to pass computed deltas.
- `apps/mcp-server/src/__tests__/DPI-3-commodity-delta.test.ts` — 5 unit tests (first-run tolerance, price-up 25%, price-unchanged 0%, ON CONFLICT round-trip, multi-tick direction flip).

**Build/test:** `bun tsc --noEmit` clean. `bun test DPI-3-commodity-delta.test.ts` → 5/5 pass.

**AC coverage:**
- AC-1: pre-transaction `db.prepare(...).get()` calls before `runTransaction()` — confirmed.
- AC-2: `computeDelta()` module-private, guards null/0 prev — confirmed.
- AC-3: ON CONFLICT branch updates `change_amt` and `change_pct` — confirmed.
- AC-4: call-sites pass `brentDelta.amt, brentDelta.pct` and `goldDelta.amt, goldDelta.pct` — confirmed.
- AC-5: empty history → delta=0, no throw — tested.
- AC-6: live gate — requires ops REBUILD before QA probe.

**USDVND exclusion:** USDVND is NOT mirrored via `upsertMacroPrice` (per FR-DPI-3d) — unchanged from prior code.

**OPS NOTE:** Ops must REBUILD the mcp-server container BEFORE running QA verification (per feedback_rebuild_after_dev_change). Restart alone relaunches stale image.

**QA verification (direct DB — not push echo):**
```sql
SELECT code, change_amt, change_pct FROM market_prices WHERE code IN ('BRENT','GOLD');
```
Expected: `change_pct != 0` after two commodity cron ticks.
