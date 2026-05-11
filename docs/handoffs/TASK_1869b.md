# TASK_1869b — Wire per-watchlist thresholds into scanMarket

**Handoff Date:** 2026-05-11
**Sprint:** 1869
**Type:** SPRINT-S
**Priority:** HIGH
**Owner:** developer
**Size:** ~1.5h (30 lines, ≤5 files)

---

## Context

Adaptive threshold system exists but is dead-wired:
- `volatilityCalculator.ts` computes per-stock adaptive thresholds (2σ of daily log returns).
- `signalDetector.ts` accepts `SignalContext.volatility` and `SignalContext.watchlistThresholds`.
- **Critical gap:** `scanMarket.ts` line 283 calls `detectSignals(snapshot)` with NO context.
- Per-watchlist columns `alert_drop_pct` and `alert_rise_pct` exist in SQLite `watchlist` table but are never passed into `detectSignals`.

**Architect brief:** `docs/architecture-briefs/2026-05-11-price-drop-precision-tuning.md` (Option B, priority 2)

---

## Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| AC1 | `scanMarket.ts` line 283 reads `watchlistThresholds` from DB (watchlist table) | grep -A5 `detectSignals.*context` → verify `watchlistThresholds` param |
| AC2 | Context object passed to `detectSignals(snapshot, { watchlistThresholds: {...} })` | unit test: mock threshold override passes custom value |
| AC3 | `signalDetector.ts` uses `context.watchlistThresholds.dropPct` if present, falls back to `DEFAULT_DROP_PCT` | test: custom 9% overrides default -7% |
| AC4 | All existing tests pass (no regression) | test suite runs 8804 baseline |

---

## Files in Scope

| Path | Type | Change |
|------|------|--------|
| `apps/mcp-server/src/application/usecases/scanMarket.ts` | logic | Fetch `watchlist` rows, build context, pass to `detectSignals` |
| `apps/mcp-server/src/domain/services/signalDetector.ts` | logic | Use `context.watchlistThresholds?.dropPct ?? DEFAULT_DROP_PCT` |
| `apps/mcp-server/src/**/__tests__/**` | tests | Mock watchlist context in 2–3 test files |

**Estimated files touched:** 3–5

---

## Dependencies

- **Depends on:** 1869a (conceptually — 1869a raises DEFAULT; this task wires adaptive). Can be shipped in parallel but sequenced after 1869a for clarity.
- **Blocks:** 1869b-seed (seed task depends on this wiring being live).

---

## Handoff Instructions

1. Read `scanMarket.ts` around line 283 where `detectSignals(snapshot)` is called.
2. Fetch `watchlist` table, extract `alert_drop_pct` for the stock being scanned.
3. Build `context: SignalContext = { watchlistThresholds: { dropPct: alert_drop_pct || DEFAULT_DROP_PCT } }`.
4. Pass context as second argument: `detectSignals(snapshot, context)`.
5. In `signalDetector.ts`, update logic to prefer `context.watchlistThresholds?.dropPct` over `DEFAULT_DROP_PCT`.
6. Test with custom threshold (e.g., 9% for high-vol stock, 3% for bank stock). Verify override works.
7. Create commit with type `feat` and message:
   ```
   feat(1869b): wire watchlist thresholds into detectSignals

   scanMarket now passes per-stock alert_drop_pct from watchlist table
   to signalDetector. signalDetector uses context threshold if present,
   falls back to DEFAULT_DROP_PCT. Enables adaptive precision tuning.

   Depends on: 1869a (constant raise)
   ```

---

## Testing

- Unit test: `test('detectSignals uses custom threshold from context')` 
  - Given `context.watchlistThresholds.dropPct = 9`, verify -9% triggers, -8.9% does not.
- Fixture test: High-volatility stock (e.g., NVL) gets 9% threshold, bank stock (e.g., VCB) gets 3%.
- Regression: baseline (8804) unchanged.

---

## Implementation Notes

**DB Query Pattern:**
```sql
SELECT alert_drop_pct, alert_rise_pct 
FROM watchlist 
WHERE stock_code = ?
LIMIT 1
```

If no row or `alert_drop_pct IS NULL`, use `DEFAULT_DROP_PCT` (currently -7 from 1869a).

**Type Definition (already exists in schema):**
```typescript
interface SignalContext {
  watchlistThresholds?: {
    dropPct?: number;
    risePct?: number;
  };
  // existing fields...
}
```

---

## Measurement (Post-Ship)

- Verify unit test passes: custom thresholds override defaults.
- After 1869b-seed populates defaults, monitor alert volume per stock tier.
- Expected: banking stocks (VCB, BID, SHB) alert more frequently; materials/real-estate (VHM, NVL, DPM) alert less.

---

## Rollback

Revert `scanMarket.ts` line 283 to call without context; remove `watchlistThresholds` from `signalDetector` logic.

---

**Ship After:** 1869a (for clarity).  
**Ship Before:** 1869b-seed.
