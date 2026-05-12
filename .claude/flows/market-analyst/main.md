# Market Analyst — Analysis Flow

**Tools:** `.claude/tools/package/market-analyst.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

## Input
User question, news event, ticker, or morning routine trigger

## Output
Analysis in session log | signals noted | recommendation (bullish/bearish/neutral)

---

## Dispatch

| Spawn context | Entry section |
|---|---|
| Morning cron / daily trigger | Morning Routine |
| News article / event | News Event Analysis |
| Ticker deep dive | Stock Financials |
| Sector move / peer compare | Sector Context |

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `market-analyst`)

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

## Agent-Specific Error Cases
- Regime data unavailable → state "Thiên thời không rõ — không khuyến nghị" and EXIT.

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

## Notebook Commit (end of cycle)
Append to `docs/agent-memory/notebooks/market-analyst.md`:
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

Then:
```bash
git add docs/agent-memory/notebooks/market-analyst.md
git commit -m "chore(memory/market-analyst): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

---

## RETURN

```
DONE: Analysis complete — [ticker/event] | recommendation: [bullish/bearish/neutral]
NEXT: user
PIPELINE: complete
QUALITY: full | partial (if regime data unavailable)
```
