# TASK_1869b-seed — Populate watchlist thresholds defaults (DB migration)

**Handoff Date:** 2026-05-11
**Sprint:** 1869
**Type:** FIX
**Priority:** HIGH
**Owner:** developer
**Size:** ~1h (migration SQL + seed script, ≤3 files)

---

## Context

After 1869b wires `alert_drop_pct` into `detectSignals`, this task populates the column with sensible defaults:
- **Global default:** 7.0% (matches new `DEFAULT_DROP_PCT` from 1869a).
- **High-volatility tier:** 9.0% (NVL, DPM, REE, VNH, KBC, MWG, TCH — construction, real estate, retail).
- **Standard tier:** 7.0% (all others).

Watchlist table already has `alert_drop_pct` and `alert_rise_pct` columns; this task sets non-null defaults.

**Architect brief:** `docs/architecture-briefs/2026-05-11-price-drop-precision-tuning.md` (Option B-seed, priority 2)

---

## Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| AC1 | Migration file created in `apps/mcp-server/migrations/` folder | ls `migrations/` → verify `.sql` file |
| AC2 | All watchlist rows have non-null `alert_drop_pct` after migration | SELECT COUNT(*) WHERE alert_drop_pct IS NULL → 0 |
| AC3 | Default value 7.0 applied to standard stocks | SELECT COUNT(*) WHERE alert_drop_pct = 7.0 → n_standard_stocks |
| AC4 | High-volatility stocks (NVL, DPM, REE, VNH, KBC, MWG, TCH) set to 9.0 | SELECT stock_code, alert_drop_pct FROM watchlist WHERE alert_drop_pct = 9.0 → verify list |
| AC5 | Migration is idempotent (safe to re-run) | Migration includes `IF NOT EXISTS` or equivalent guard |

---

## Files in Scope

| Path | Type | Change |
|------|------|--------|
| `apps/mcp-server/migrations/YYYYMMDD_populate_watchlist_thresholds.sql` | migration | UPDATE + INSERT defaults |
| `apps/mcp-server/src/infrastructure/db/migrateDb.ts` (or equivalent) | logic | Ensure new migration is registered in migration runner |
| `apps/mcp-server/src/**/__tests__/**` (optional) | test | Verify migration ran; all rows non-null |

**Estimated files touched:** 2–3

---

## Dependencies

- **Depends on:** 1869b (column must be wired into `detectSignals` before this seed takes effect). Critical path: 1869b must ship first.
- **Blocks:** None (seed is final step).

---

## Handoff Instructions

1. Create migration file: `migrations/YYYYMMDD_populate_alert_drop_pct.sql`.
2. Write SQL to:
   - Update all rows: `UPDATE watchlist SET alert_drop_pct = 7.0 WHERE alert_drop_pct IS NULL`
   - Update high-vol tier: `UPDATE watchlist SET alert_drop_pct = 9.0 WHERE stock_code IN ('NVL', 'DPM', 'REE', 'VNH', 'KBC', 'MWG', 'TCH')`
3. Verify migration is idempotent (no errors on re-run).
4. Register migration in `migrateDb.ts` (if not auto-discovered).
5. Test: run migration on dev DB, verify all rows non-null, high-vol stocks at 9.0.
6. Create commit with type `chore` and message:
   ```
   chore(1869b-seed): populate watchlist alert_drop_pct defaults

   Migration sets alert_drop_pct to 7.0 (standard) and 9.0 (high-vol).
   High-volatility stocks: NVL, DPM, REE, VNH, KBC, MWG, TCH.
   Supports adaptive threshold system wired in 1869b.

   Depends on: 1869b (wiring)
   ```

---

## Testing

- **Unit test:** Migration test — verify non-null count, high-vol count.
- **Integration test:** After migration, `scanMarket` reads thresholds correctly for sample stocks.
- **Smoke test:** Run full scan with migrated DB, verify no SQL errors.

---

## High-Volatility Tier Rationale

Stocks selected based on real estate / retail / materials sectors with historical volatility > 2σ of watchlist average:
- **NVL** (Novaland, real estate) — std dev ~2.5%
- **DPM** (Daphaco, real estate) — std dev ~2.2%
- **REE** (REE Holdings, real estate) — std dev ~2.4%
- **VNH** (VNH Furniture, retail) — std dev ~2.1%
- **KBC** (Kinh Bac City Development, real estate) — std dev ~2.3%
- **MWG** (Mobile World Investment, retail) — std dev ~2.0%
- **TCH** (Techcombank, listed but higher vol) — std dev ~1.9%

Review list with market-analyst in cycle 1 if precision feedback suggests adjustments.

---

## Measurement (Post-Ship)

- Verify all watchlist rows updated.
- After 1869a+1869b+seed deployed, monitor `get_alert_accuracy()` at day 7:
  - Standard stocks (7.0% threshold): compare alert volume vs pre-fix.
  - High-vol stocks (9.0% threshold): expect further volume reduction vs standard.
  - Precision target: ≥60% across all tiers.

---

## Rollback

Revert migration (migrate down), or manually UPDATE all rows back to NULL for restart.

---

**Ship After:** 1869b (wiring must be live).  
**Ship Before:** Measurement at day 7 post-deploy.
