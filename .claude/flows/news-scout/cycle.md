# News Scout — Cycle Flow

## Input
Bootstrap (market context 24h, system status, agent signals)

## Output
`urgent_news` + `chain_catalyst` signals on bus | WORK status | ledger entries (05:00 UTC)

---

**0. Bootstrap** → skill: `.claude/skills/cycle-bootstrap/SKILL.md` (replace `<agent-id>` with `news-scout`)

**0b. Regime extraction** (from bootstrap `market_context`, zero extra tool calls)
Parse `get_macro_snapshot` text block already in bootstrap:
```
REGIME      = "Global Liquidity: X"       → TIGHTENING | EASING | NEUTRAL
CARRY_REGIME = "VND Carry Spread" line    → HOT_MONEY_INFLOW | NEUTRAL | FII_OUTFLOW_RISK
```
If `get_macro_snapshot` not in bootstrap context → call it once now.

**1. Fetch** `fetch_and_analyze(source_urls, query)` — 226 items/15min via VPS proxy
Filter duplicates → extract title/source/published_date/content

**1b. Historical context** `search_similar_context(query=<main_news_theme>, k=3)`
- Call once per high-impact item (impactScore ≥ 6) before scoring
- Use the article title or main theme as query (e.g. "VCB lợi nhuận quý 1")
- If results returned: prepend to analysis context — "N similar past events: <title> (<date>), ..."
- If no results (LanceDB empty): skip, continue without historical context
- Non-fatal: if tool errors, log and continue

**2. Sentiment + impact**
- Score: -1.0 (bearish) to +1.0 (bullish)
- `run_impact_chain(news_item, catalyst_type)` — global → country → sector → watchlist
- `get_watchlist()` — cross-ref extracted tickers

PMI leading indicator detection:
- Extract Vietnam Manufacturing PMI value from news (S&P Global, published 2nd–3rd of each month)
- If PMI < 50 AND previous month PMI also < 50 → set `gdp_warning_signal=true` in signal `finding_data`
  → Post `chain_catalyst` with `event_type="macro"`, `direction="bearish"`, note: "PMI < 50 hai tháng liên tiếp — cảnh báo GDP quý tới (lead: 6-8 tuần)"
- If PMI > 52 after prior < 50 → set `gdp_recovery_signal=true`, post bullish `chain_catalyst`
- Store last PMI value in session log for next cycle comparison

Commodity → CPI → Policy chain:
- Brent crude: if price up >5% vs prior month → append to `chain_catalyst`: `"Dầu tăng mạnh → áp lực CPI → SBV có thể thắt chặt"`, set `cpi_pressure_risk=true`
- Gold spike >3% in week → append `"Vàng tăng — tín hiệu dân cư tìm nơi trú ẩn, thoát VND asset"` to `urgent_news` for banking/BVH watchlist stocks

Apply regime multiplier to `impact_score` before posting:
- `TIGHTENING + bearish` → score × 1.3 | `TIGHTENING + bullish` → score × 0.7
- `EASING + bullish` → score × 1.2 | `EASING + bearish` → score × 0.8
- `NEUTRAL` → no change
- `CARRY_REGIME=HOT_MONEY_INFLOW` + carry spread parsed > 3% → set `hot_money_risk=true` for FII-related news

**3. Signals**

Watchlist hit (breaking news) → `post_agent_signal`:
```json
{
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
}
```

Crisis / macro catalyst (triggers enrichment chain) → `post_agent_signal`:
<!-- regime is read from bootstrap macro snapshot by alert-commander, not from signal finding_data.
     ChainCatalystFindingDataSchema is strict (no .passthrough()) — extra fields are silently stripped.
     Include regime context in payload.detail instead. -->
```json
{
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
}
```

**4. Session log** `docs/agent-memory/sessions/YYYY-MM-DD-news-scout.md`:
```
### Cycle (HH:MM–HH:MM)
- Items: N | Impacts: M | Signals: [types] | Regime: REGIME | Carry: CARRY_REGIME
```

**5. WORK**:
```
[News Scout] HH:MM UTC — N signals analyzed
  Fired: X (catalysts) | Suppressed: Y | Next: TIME
```

**6. BUG on error**:
Before sending to BUG channel: `get_recent_fixes(limit=20)` — if issue already fixed (matching title/module in recent fixes) → **skip, do not re-report**.
```
[News Scout] ⚠️ SEVERITY
  Issue: ... | Impact: ... | Status: Retrying/Blocked
```

## Batch 2 Sentiment Log (05:00 UTC daily)
Per ticker `get_watchlist()` → if `docs/analysis-briefs/{TICKER}.md` does not exist → create it first:
```markdown
# {TICKER} — Analysis Ledger {YEAR}
**Sector**: {domain} | **Exchange**: {exchange}

## [Report Analyzer] Fundamentals & Valuation

## [News Scout] Headlines & Sentiment

## [Market Watcher] Price, Volume, Technicals

## [Unified Agent] Quarterly Syntheses
```
Then append to `docs/analysis-briefs/{TICKER}.md` [News Scout]:
```
YYYY-MM-DD | {sentiment description} | YoY: {comparison or "no prior data"}
```
Only when `|sentiment_score| ≥ 0.1` OR neutral (document absence) | one line | skip weekends/holidays
