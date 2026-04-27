# Digest & Predict — Monthly/Quarterly Flow (1st of month)

## Input
BCTC full data | macro snapshot | portfolio risk | quarterly ledger entries

## Output
Monthly digest to MARKET | Quarterly synthesis in `docs/analysis-briefs/` | WORK notified

---

## Monthly
`get_bctc_full(code)` per stock | `get_macro_snapshot()` | investment thesis + risk assessment
`get_portfolio_risk()` VaR + drawdown | `get_rebalancing_signals()` drift | `get_performance_attribution()` P&L | `get_prediction_accuracy(days=30)`
`send_telegram(channel="market")`

## Quarterly (Mar 31 / Jun 30 / Sep 30 / Dec 31)

**1. Collect ledger** — per ticker `get_watchlist()`:
Read `docs/analysis-briefs/{TICKER}.md` → extract [News Scout] | [Report Analyzer] | [Market Watcher] | [Unified Agent]

**2. Conviction score**:
```
conviction_score = (news_sentiment_avg * 0.20) + (fundamental_score * 0.35) +
                   (price_momentum_score * 0.25) + (insider_score * 0.20)
# -1.0 to +1.0
# ≥0.5=Buy | 0.2–0.5=Hold | -0.2–0.2=Neutral | ≤-0.2=Reduce/Sell
```

**3. Ledger entry** — if `docs/analysis-briefs/{TICKER}.md` does not exist → create it first:
```markdown
# {TICKER} — Analysis Ledger {YEAR}

## [Report Analyzer] Fundamentals & Valuation

## [News Scout] Headlines & Sentiment

## [Market Watcher] Price, Volume, Technicals

## [Unified Agent] Quarterly Syntheses
```
Append `docs/analysis-briefs/{TICKER}.md` [Unified Agent] Quarterly Syntheses:
```markdown
### Q{N} {YEAR} Synthesis — YYYY-MM-DD

**Conviction Score**: {score} → {Buy/Hold/Neutral/Reduce/Sell}

**Evidence Summary**:
- News (20%): {avg_sentiment} — {1-line}
- Fundamentals (35%): {score} — {1-line}
- Price Momentum (25%): {score} — {1-line}
- Insider (20%): {score} — {summary}

**Ensemble Verdict**: {1-2 sentence thesis}

**Action Plan**:
- Dip to {support}: Add {X}% position
- Stop-loss: {level} (per portfolio-schema.md)
- TP ladder: {tp1} / {tp2} / {tp3}
- Review trigger: next earnings or price > {threshold}%
```

WORK summary:
```
[Unified] Q{N} {YEAR} synthesis — {N} tickers
Strong Buy: {list} | Buy: {list} | Neutral: {list} | Reduce: {list}
```
`send_telegram(channel="work")`
