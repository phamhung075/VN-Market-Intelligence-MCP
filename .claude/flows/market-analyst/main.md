# Market Analyst — Analysis Flow

## Input
User question, news event, ticker, or morning routine trigger

## Output
Analysis in session log | signals noted | recommendation (bullish/bearish/neutral)

---

**Step 0b — Read notebook**
Read `docs/agent-memory/notebooks/market-analyst.md`. Note any carry-over observations, calibration patterns, or unresolved questions from previous sessions. Do NOT act on them yet — just load them as context.

## Top-Down Framework (Trần Ngọc Báu methodology — always apply before any recommendation)

**Do not analyze a stock before analyzing the environment.**

```
[Thiên Thời] Global macro first
  REGIME (from get_macro_snapshot) → TIGHTENING | EASING | NEUTRAL
  DXY trend | US10Y level (RISK-OFF / RISK-ON) | Fed cycle position

[Địa Lợi] Vietnam domestic positioning
  VN CPI vs 4.5% target → SBV headroom (from macro snapshot)
  CARRY_REGIME → hot money or structural inflow?
  SBV policy priority: Growth (cắt lãi suất/bơm OMO) vs FX Stability (giữ/tăng lãi suất/hút OMO)

[Nhân Hòa] Action timing — only when ≥3/5 aligned:
  □ REGIME=EASING
  □ CARRY_REGIME=HOT_MONEY_INFLOW
  □ US10Y_SIGNAL=RISK-ON
  □ EY_SPREAD > 2% (1/PE − Max Deposit Rate)
  □ No pivot window (stable policy window)
```

**Verdict gate:** If `REGIME=TIGHTENING` AND `valuation=EXPENSIVE` (EY_SPREAD < 1%) → do NOT recommend bullish. State: "Thiên thời bất lợi — chờ điều kiện thuận".

Extract from `get_macro_snapshot()` (call once at session start):
- `REGIME`, `CARRY_REGIME`, `DXY_SIGNAL`, `US10Y_SIGNAL`, `MAX_DEPOSIT_RATE`

---

## Morning Routine
1. `get_macro_snapshot()` → extract REGIME + CARRY_REGIME (top-down lens for the day)
2. Daily briefing via Telegram | watchlist status (positions, alerts)
3. Overnight alerts → new signals
4. Past analyses → historical context

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

## End-of-cycle notebook write
Overwrite `docs/agent-memory/notebooks/market-analyst.md` with:
- Last updated date + current sprint number
- Summary of this session (1-3 sentences: what was done, what was found)
- Any patterns noticed (recurring bugs, recurring architecture violations, calibration observations)
- Any carry-over items for next session (unresolved questions, blocked tasks)
Keep it under 50 lines. Overwrite the entire file — do not append.

## Session Log
`docs/agent-memory/sessions/YYYY-MM-DD-market-analyst.md`:
```markdown
### Analysis: [Ticker or Event] (HH:MM–HH:MM)
- **Type**: stock | news impact | sector comparison
- **Regime**: REGIME | CARRY_REGIME | DXY_SIGNAL
- **Key findings**: [patterns, risks, opportunities]
- **Historical precedent**: [similar events]
- **Recommendation**: [bullish/bearish/neutral + watch items]
- **Confidence**: high | medium | low
```
Recurring pattern found → note for team to create pattern doc
