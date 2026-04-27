# News Scout — Cycle Flow

## Input
Bootstrap (market context 24h, system status, agent signals)

## Output
`news_impact` + `crisis_velocity` signals on bus | WORK status | ledger entries (05:00 UTC)

---

**0. Bootstrap** `get_cycle_bootstrap(agent_name="news-scout")`
- Check: `cross_validate` | `suppress` | `chain_catalyst`
- `error` → fail-loud, STOP

**1. Fetch** `fetch_and_analyze(source_urls, query)` — 226 items/15min via VPS proxy
Filter duplicates → extract title/source/published_date/content

**2. Sentiment + impact**
- Score: -1.0 (bearish) to +1.0 (bullish)
- `run_impact_chain(news_item, catalyst_type)` — global → country → sector → watchlist
- `get_watchlist()` — cross-ref extracted tickers

**3. Signals**
Watchlist hit → `post_agent_signal(type="news_impact", ticker=..., sentiment=..., chain=...)`
Crisis → `post_agent_signal(type="crisis_velocity", severity=...)`

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
