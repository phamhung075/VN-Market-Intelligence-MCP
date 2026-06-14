# Handoff — FIX-FE-CHART-PRICE-DOMAIN

**From:** po (S52 triage) · **To:** dev-frontend · **Created:** 2026-06-14T07:20:00Z
**Depends on:** ALLZERO-OHLCV-FETCH (data fix — must land first)
**Zone:** apps/frontend/ · **Size:** S · **Generic across ALL tickers — no per-ticker hardcode**

## Bug
"Giá & Phân Tích Kỹ Thuật" candlestick chart: price min/max range too wide, candles compressed to slivers, values unreadable. Header "Biên độ: 0 — 77.900" starts at 0; y-grid 0→120000; real band ~68k–80k = thin strip. Bollinger fans to ±~35k (BB+ ~105k / BB- ~38k) on the right third.

## Confirmed root cause (PO live-probe + code read)
`apps/frontend/app/components/charts/StockChart.tsx` feeds raw `closes` straight into `candle.setData` (~L81) and `computeBB(closes)` (~L118) with **no outlier sanitation**. The served series carries a non-trading-day poison row `2026-05-30 close=0, volume=0` on EVERY ticker (verified FPT/SHB/VCB), plus a residual 1000x outlier on VCB (`2026-06-01 close=62.2`).
- lightweight-charts default autoScale spans the full data incl. the `0` → domain zero-anchored.
- `computeBB` over the 20-window containing `0` → stdev explodes → the ±35k fan.

## Fix (two parts)
1. **Sanitize before plotting** (defense-in-depth behind upstream ALLZERO fix): drop/forward-fill `close===0 && volume===0` rows and clamp obvious 1000x-scale outliers in the loader/series prep, before `setData`/`computeMA`/`computeBB`.
2. **Data-driven Y-domain**: compute price-pane domain from the visible band = min/max over (candle high/low ∪ MA20 ∪ MA50 ∪ BB+ ∪ BB-); set `[min*(1-pad), max*(1+pad)]`, pad ~0.05–0.08, **never forced to 0**. Apply via priceScale `autoscaleInfoProvider` or explicit min/max on the candle series.

## Acceptance (prove on the spread, not one ticker)
SHB ~13.8k · VCB ~61.6k · FPT ~73.5k:
1. Y-domain NOT zero-anchored — "Biên độ" starts near data min, not 0.
2. Candles fill ≥ ~50% of pane height (no sliver).
3. Over CLEAN data (post-ALLZERO) BB band width well under ±15% (not ±47%).
4. No candle/MA/BB plotted from a `close=0` or 1000x-scale row.

## Files
- `apps/frontend/app/components/charts/StockChart.tsx`
- `apps/frontend/app/components/charts/indicators.ts`
- `apps/frontend/app/routes/api.price-history.$ticker.tsx`
- `apps/frontend/app/routes/dashboard.technical.tsx`

## Baseline
`pnpm --filter frontend check` + typecheck green before handoff.
