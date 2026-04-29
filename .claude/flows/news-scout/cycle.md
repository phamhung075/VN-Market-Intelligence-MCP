# News Scout — Cycle Flow

## Input
Bootstrap (market context 24h, system status, agent signals)

## Output
`urgent_news` + `chain_catalyst` signals on bus | WORK status | ledger entries (05:00 UTC)

---

**0. Bootstrap** `get_cycle_bootstrap(agent_name="news-scout")`
- Check: `cross_validate` | `suppress` | `chain_catalyst`
- `market_context` error → fail-loud, STOP immediately
- `agent_signals` error only → log warning to WORK, continue with zero signals
- Any other error → fail-loud, STOP

**1. Fetch** `fetch_and_analyze(source_urls, query)` — 226 items/15min via VPS proxy
Filter duplicates → extract title/source/published_date/content

**2. Sentiment + impact**
- Score: -1.0 (bearish) to +1.0 (bullish)
- `run_impact_chain(news_item, catalyst_type)` — global → country → sector → watchlist
- `get_watchlist()` — cross-ref extracted tickers

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
    "severity": "<low|medium|high|critical>"
  }
}
```

Crisis / macro catalyst (triggers enrichment chain) → `post_agent_signal`:
```json
{
  "from_agent": "news-scout",
  "to_agent": "all",
  "signal_type": "chain_catalyst",
  "stock_code": "<TICKER or omit>",
  "payload": { "title": "<headline>", "detail": "<summary>", "impact_score": 9 },
  "ttl_minutes": 120,
  "chain_depth": 0,
  "finding_data": {
    "event_type": "<credit_policy|trade_war|earnings|macro|legal|crisis|sector_event>",
    "direction": "<bullish|bearish|neutral>",
    "confidence": 0.8,
    "affected_stocks": ["<TICKER1>", "<TICKER2>"],
    "affected_sectors": ["<sector1>"],
    "headline": "<news headline text>",
    "source": "<cafef|vnexpress|reuters|...>"
  }
}
```

**4. Session log** `docs/agent-memory/sessions/YYYY-MM-DD-news-scout.md`:
```
### Cycle (HH:MM–HH:MM)
- Items: N | Impacts: M | Signals: [types]
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
