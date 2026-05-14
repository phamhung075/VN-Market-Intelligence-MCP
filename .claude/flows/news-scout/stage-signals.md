> Parent: [./cycle.md](./cycle.md)

# News Scout — Stage 3: Post Signals

## Inter-cycle dedup gate (Auto-cure TNB c51 — 2026-05-14)

Before posting any `chain_catalyst` or `urgent_news`, check the last 3 hours of signals on the bus:

```
recent = call_tool(server="vn-market", tool="get_agent_signals", arguments={
  "signal_type": "chain_catalyst",   # repeat for "urgent_news" if applicable
  "limit": 20
})
```

For each candidate signal:
1. Extract the primary `event_type` + `affected_sectors` or `stock_code` from the candidate.
2. Check `recent` for any entry where **both** match (same event_type AND overlapping affected_sectors or same stock_code) **AND** `created_at` is within the last 180 minutes.
3. If match found → **SUPPRESS** with log: `"[DEDUP] {signal_type} suppressed — same theme already on bus as #{prior_id} ({N} min ago). Skipping post."`
4. If no match → proceed to post.

**Threshold:** 180 minutes (3 hours). Covers intra-session recurring macro events (CPI/oil, FII-outflow, sector ATH rallies).

**Exception:** If the candidate has a materially different `direction` (e.g., prior=bearish, candidate=bullish on new data) → override suppression. Log the override explicitly.

---

**3. Signals**

Watchlist hit (breaking news) → post `urgent_news`:
```
call_tool(server="vn-market", tool="post_agent_signal", arguments={
  "from_agent": "news-scout",
  "to_agent": "alert-commander",
  "signal_type": "urgent_news",
  "stock_code": "<TICKER>",
  "payload": { "title": "<headline>", "detail": "<summary>", "impact_score": 7 },
  "ttl_minutes": 120,
  "chain_depth": 0,
  "finding_data": {
    "headline": "<news headline text>",
    "source": "<cafef|vnexpress|reuters|...>",
    "severity": "<low|medium|high|critical>",
    "regime": "<TIGHTENING|EASING|NEUTRAL>",
    "regime_adjusted_score": 7.0,
    "hot_money_risk": false,
    "cpi_pressure_risk": false
  }
})
```

Crisis / macro catalyst → post `chain_catalyst`:
<!-- regime is read from bootstrap macro snapshot by alert-commander, not from signal finding_data.
     ChainCatalystFindingDataSchema is strict (no .passthrough()) — extra fields are silently stripped.
     Include regime context in payload.detail instead. -->
```
call_tool(server="vn-market", tool="post_agent_signal", arguments={
  "from_agent": "news-scout",
  "to_agent": "all",
  "signal_type": "chain_catalyst",
  "stock_code": "<TICKER or omit>",
  "payload": { "title": "<headline>", "detail": "<summary> | regime=<REGIME> regime_adj_score=<N>", "impact_score": 9 },
  "ttl_minutes": 120,
  "chain_depth": 0,
  "finding_data": {
    "event_type": "<credit_policy|trade_war|earnings|macro|legal|crisis|sector_event>",
    "direction": "<bullish|bearish|neutral>",
    "confidence": 0.8,
    "affected_stocks": ["<TICKER1>", "<TICKER2>"],
    "affected_sectors": ["<sector1>"],
    "headline": "<news headline text>",
    "source": "<cafef|vnexpress|reuters|...>",
    "hot_money_risk": false,
    "gdp_warning_signal": false
  }
})
```
