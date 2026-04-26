# Market Analyst — Analysis Flow

## Input
User question, news event, ticker, or morning routine trigger

## Output
Analysis in session log | signals noted | recommendation (bullish/bearish/neutral)

---

## Morning Routine
1. Daily briefing via Telegram | watchlist status (positions, alerts)
2. Overnight alerts → new signals
3. Past analyses → historical context

## News Event Analysis
1. `fetch_and_analyze()` article + initial analysis
2. `run_impact_chain()` → cascade to watchlist
3. `get_alerts()` → watchlist stocks triggered?
4. Session log → findings + recommendation

## Stock Financials
1. `get_bctc_full(code)` quarterly data
2. `get_financial_summary(code)` multi-period
3. Compare YoY / QoQ
4. Valuation vs watchlist rules

## Sector Context
Stock moves significantly → `get_sector_comparison(code)` peers
- **"toàn ngành"** = sector-wide (macro cause)
- **"riêng lẻ"** = stock-specific (earnings/news)

## Session Log
`docs/agent-memory/sessions/YYYY-MM-DD-market-analyst.md`:
```markdown
### Analysis: [Ticker or Event] (HH:MM–HH:MM)
- **Type**: stock | news impact | sector comparison
- **Key findings**: [patterns, risks, opportunities]
- **Historical precedent**: [similar events]
- **Recommendation**: [bullish/bearish/neutral + watch items]
- **Confidence**: high | medium | low
```
Recurring pattern found → note for team to create pattern doc
