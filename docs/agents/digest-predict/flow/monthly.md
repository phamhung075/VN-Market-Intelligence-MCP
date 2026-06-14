# Digest & Predict — Monthly/Quarterly Flow (1st of month)

**Tools:** `docs/agents/tools/package/digest-predict.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
BCTC full data | macro snapshot | portfolio risk | quarterly ledger entries

## Output
Monthly digest to MARKET | Quarterly synthesis in `docs/analysis-briefs/` | WORK notified

---

## Monthly
`get_macro_snapshot()` first → extract REGIME + CARRY_REGIME + US10Y_SIGNAL + DXY_SIGNAL (same parse as other flows)
`get_bctc_full(code)` per stock | investment thesis structured as:
- **[Thiên Thời]** `{REGIME}` | Carry: `{CARRY_REGIME}` | US10Y: `{US10Y_SIGNAL}` | DXY: `{DXY_SIGNAL}`
- **[Địa Lợi]** sector fit + VN domestic policy mode:
  - Sector: TAILWIND / HEADWIND / NEUTRAL under current REGIME
  - VN policy priority (from macro snapshot + SBV signals): `GROWTH_PRIORITY` (cắt lãi suất/bơm OMO) | `FX_STABILITY` (giữ/tăng lãi suất/hút OMO)
  - `GROWTH_PRIORITY` → positive for equities/realty; `FX_STABILITY` → positive for VND bonds, negative for equity valuation
- **[Nhân Hòa]** month-level score: pivot_window + regime + carry + EY_spread + macro_calendar
`get_portfolio_risk()` VaR + drawdown | `get_rebalancing_signals()` drift | `get_performance_attribution()` P&L | `get_prediction_accuracy(days=30)`
`send_telegram(channel="market", message=<monthly_digest_text>)`

## Quarterly (Mar 31 / Jun 30 / Sep 30 / Dec 31)

**1. Collect ledger** — per ticker `get_watchlist()`:
Read `docs/analysis-briefs/{TICKER}.md` → extract [News Scout] | [Report Analyzer] | [Market Watcher] | [Unified Agent]

**2. Conviction score** (regime-adjusted weights):
```
TIGHTENING weights: news×0.15 | fundamental×0.45 | momentum×0.15 | insider×0.25
NEUTRAL weights:    news×0.20 | fundamental×0.35 | momentum×0.25 | insider×0.20
EASING weights:     news×0.20 | fundamental×0.30 | momentum×0.35 | insider×0.15

conviction_score = sum(component × weight)  # -1.0 to +1.0
```
Rationale: TIGHTENING → fundamentals + insider matter more (momentum is noise); EASING → momentum and liquidity matter more.
`# ≥0.5=Buy | 0.2–0.5=Hold | -0.2–0.2=Neutral | ≤-0.2=Reduce/Sell`
Final cap: TIGHTENING + verdict=Buy + sector=HEADWIND → downgrade to Hold.

**3. Ledger entry** — if `docs/analysis-briefs/{TICKER}.md` does not exist → create it first:
```markdown
# {TICKER} — Analysis Ledger {YEAR}
**Exchange**: {exchange}

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
- News (15/20%): {avg_sentiment} — {1-line}
- Fundamentals (45/35%): {score} — {1-line}
- Price Momentum (15/25%): {score} — {1-line}
- Insider (25/20%): {score} — {summary}
(weights shown as TIGHTENING/NEUTRAL — EASING uses 20/30/35/15)

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
`send_telegram(channel="work", message="[Unified] Q{N} {YEAR} synthesis — {N} tickers | Strong Buy: {list} | Buy: {list} | Neutral: {list} | Reduce: {list}")`

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`
