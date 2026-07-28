> Parent: [./cycle.md](./cycle.md)

# News Scout — Stage 2: Sentiment + Impact Scoring

## Step 0-sweep — load coverage state + build sweep list

```
WATCHLIST = call_tool(server="vn-market", tool="get_watchlist", arguments={})
  (reuse this call for Step 2 cross-referencing — do not call twice)

STALE_TICKERS = scripts/agents-flow/coverage-stamp.sh --agent news-scout --list-stale
  --watchlist <WATCHLIST.active codes, comma-joined>
  → JSON array, ≤ sweep_config.sweep_batch_size (default 3) entries, oldest/never-covered
    first. Script owns the 48h-staleness filter (sweep_config.max_staleness_hours, default
    48) — do NOT hand-derive this list; that non-determinism is what made the sweep dead
    (FIX-COVERAGE-SWEEP-BLANKET-STAMP-DEAD-TRIGGER). Fail-silent if coverage-state.json is
    missing (same as before: every ticker treated as never-covered).
  ⚠ TRANSPORT GAP (open 2026-07-25 — see task note on the board row): this agent holds no
    Bash (.claude/agents/news-scout.md:5) and cannot invoke the script directly yet. Until a
    Bash-capable caller wires this in, fall back to the equivalent hand-filter (prior
    behaviour: null OR >48h vs COVERAGE_STATE.tickers[t].last_covered_news_scout, sorted
    oldest-first, take ≤3) for THIS read-only sub-step — bounded risk (filter, not a
    document rewrite). Do NOT apply this fallback to the Step 7 write in stage-log-notify.md.

For each ticker in STALE_TICKERS that is NOT already in the article-impacted set:
  → explicitly include it in sentiment/impact analysis this cycle even if impact_score < threshold
  → set coverage_sweep_forced=true on the ticker context (used in Step 4 log)
```

**2. Sentiment + impact**

Market sentiment context (run at start of sentiment analysis):
```
call_tool(server="vn-market", tool="get_market_sentiment_index", arguments={})
call_tool(server="vn-market", tool="get_insider_sentiment", arguments={})
```
If successful: extract `news_sentiment_z` (or `sentiment_z_60d`), `sentiment_ema_5d`, and ratio fields `bull_ratio_5d` / `bear_ratio_5d` / `neutral_ratio_5d` from get_market_sentiment_index. Use to contextualize individual article sentiment (e.g., if news_sentiment_z is already -2.0, a single bearish article has less marginal impact). Extract aggregate insider net sentiment score (net_sentiment_score) from get_insider_sentiment. Use to assess whether insider activity aligns or contradicts article sentiment (e.g., bearish article during insider buying concentration may signal insider confidence vs market pessimism). If either tool returns NULL or error: log `[SKIP] <tool_name> unavailable` and continue with article-level sentiment only (no market context).

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

**Authoritative score note:** when `newsText` is a manually-composed headline/summary (not the raw article body), `run_impact_chain`'s own root-entry `impact`/`confidence` is frequently lower than the original `fetch_and_analyze` per-article `impactScore` (the recompute loses source-text signal). Treat `run_impact_chain` as the tool for **cascade discovery** (which watchlist tickers + sectors are affected, and in which direction) — the `impactScore` from `fetch_and_analyze` remains authoritative for `urgent_news`/`chain_catalyst` threshold decisions unless `run_impact_chain` scores *higher*.

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

**Evidence Fragment Recording** (TASK-EVIDENCE-HOP2-AGENTS FR-2.1 — feeds the prediction-engine LR pipeline; PMI/commodity/Brent-Gold triggers above are already computed by this point):

For each scored article (Step 2 above) that maps to a specific watchlist ticker:
```
call_tool(server="vn-market", tool="record_evidence_fragment", arguments={
  "stock": "<TICKER>",
  "evidence_type": "news_sentiment_stock",
  "direction": "bullish if score > 0.15, bearish if score < -0.15, else neutral",
  "magnitude": "min(1.0, abs(score))",
  "confidence": "clamp(impact_score / 10, 0.3, 0.95) if impact_score available, else 0.5",
  "source_agent": "news-scout",
  "ttl_days": 7
})
```

For macro-wide articles (no specific watchlist ticker — PMI print, commodity-chain, Brent/Gold triggers above):
```
call_tool(server="vn-market", tool="record_evidence_fragment", arguments={
  "stock": "MARKET",
  "evidence_type": "news_sentiment_macro",
  "direction": "bullish if score > 0.15, bearish if score < -0.15, else neutral",
  "magnitude": "min(1.0, abs(score))",
  "confidence": "clamp(impact_score / 10, 0.3, 0.95) if impact_score available, else 0.5",
  "source_agent": "news-scout",
  "ttl_days": 7
})
```
`news_sentiment_stock` and `news_sentiment_macro` are the ACTUAL seeded `evidence_type` strings in `evidence_likelihood_ratios` (verify against `docs/architecture-briefs/2026-07-01-BA-PREDICTION-EVIDENCE-REVIVAL.md` §0-C3 — do not invent new type names). `stock="MARKET"` mirrors the existing market-wide-ticker convention already used in the codebase (`kinhDichWrapper.ts` "MARKET"→VNINDEX mapping — live-verified, not guessed). `news_sentiment_stock` already carries a `bullish/n=16` frozen row near the n≥10 trust threshold — this is the single highest-value wiring for the evidence monoculture fix.
