# Market Watcher — EOD Flow (16:00 UTC)

## Input
`get_watchlist()` | EOD prices + RSI + volume

## Output
Ledger entries in `docs/analysis-briefs/{TICKER}.md` | MARKET EOD summary

---

**A. Ledger** — per ticker, if `docs/analysis-briefs/{TICKER}.md` does not exist → create it first:
```markdown
# {TICKER} — Analysis Ledger {YEAR}

## [Report Analyzer] Fundamentals & Valuation

## [News Scout] Headlines & Sentiment

## [Market Watcher] Price, Volume, Technicals

## [Unified Agent] Quarterly Syntheses
```
Then append `docs/analysis-briefs/{TICKER}.md` [Market Watcher]:
```
YYYY-MM-DD 16:00 | Close: {price} VND | RSI: {rsi} | Vol: {volume} ({vs_avg_pct}% avg) | YoY: {yoy_change}%
```
Write fails → `send_telegram(channel="bug")` immediately, still proceed to B.

**B. MARKET EOD** — per ticker:
```
{TICKER} — EOD YYYY-MM-DD
Price: {price} VND ({daily_change}, YoY {yoy_change}) | Vol: {volume} | RSI: {rsi}
Sentiment: {sentiment} | Insider: {insider_activity}
→ Action: {brief_action}
📖 docs/analysis-briefs/{TICKER}.md
```
`send_telegram(channel="market")`

Rules:
- `{brief_action}` max 10 words: Hold / Buy on dip / Reduce / Watch
- `{sentiment}` = last [News Scout] entry
- `{insider_activity}` = `get_insider_signals()` or "no activity"
- Skip weekends + market holidays
