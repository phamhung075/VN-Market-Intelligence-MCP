> Parent: [./cycle.md](./cycle.md)

# News Scout — Stage 2: Sentiment + Impact Scoring

## Step 0-sweep — load coverage state + build sweep list

```
COVERAGE_STATE = read docs/data/coverage-state.json
  (fail-silent: if missing → treat all tickers as last_covered_news_scout=null)

WATCHLIST = call_tool(server="vn-market", tool="get_watchlist", arguments={})
  (reuse this call for Step 2 cross-referencing — do not call twice)

now = current UTC timestamp

STALE_TICKERS = [t for t in WATCHLIST.active where
  COVERAGE_STATE.tickers[t].last_covered_news_scout == null OR
  (now - COVERAGE_STATE.tickers[t].last_covered_news_scout) > 48h
]
→ sorted by last_covered_news_scout ascending (null = oldest first)
→ take ≤3 tickers (sweep_config.sweep_batch_size)

For each ticker in STALE_TICKERS that is NOT already in the article-impacted set:
  → explicitly include it in sentiment/impact analysis this cycle even if impact_score < threshold
  → set coverage_sweep_forced=true on the ticker context (used in Step 4 log)
```

**2. Sentiment + impact**

Score each article: -1.0 (bearish) to +1.0 (bullish).

For watchlist hits, trace impact chain:
```
call_tool(server="vn-market", tool="run_impact_chain", arguments={
  "newsText": "<headline summary — Vietnamese or English>",
  "includeWatchlist": true
})
```

Get watchlist for cross-referencing tickers:
```
call_tool(server="vn-market", tool="get_watchlist", arguments={})
```

**PMI leading indicator detection:**
- Extract Vietnam Manufacturing PMI value from news (S&P Global, published 2nd–3rd of each month)
- If PMI < 50 AND previous month PMI also < 50 → set `gdp_warning_signal=true` in signal `finding_data`
  → Post `chain_catalyst` with `event_type="macro"`, `direction="bearish"`, note: "PMI < 50 hai tháng liên tiếp — cảnh báo GDP quý tới (lead: 6-8 tuần)"
- If PMI > 52 after prior < 50 → set `gdp_recovery_signal=true`, post bullish `chain_catalyst`
- Store last PMI value in session log for next cycle comparison

**Commodity → CPI → Policy chain:**
- Brent crude: if price up >5% vs prior month → append to `chain_catalyst`: `"Dầu tăng mạnh → áp lực CPI → SBV có thể thắt chặt"`, set `cpi_pressure_risk=true`
- Gold spike >3% in week → append `"Vàng tăng — tín hiệu dân cư tìm nơi trú ẩn, thoát VND asset"` to `urgent_news` for banking/BVH watchlist stocks

**Apply regime multiplier to `impact_score` before posting:**
- `TIGHTENING + bearish` → score × 1.3 | `TIGHTENING + bullish` → score × 0.7
- `EASING + bullish` → score × 1.2 | `EASING + bearish` → score × 0.8
- `NEUTRAL` → no change
- `CARRY_REGIME=HOT_MONEY_INFLOW` + carry spread parsed > 3% → set `hot_money_risk=true` for FII-related news
