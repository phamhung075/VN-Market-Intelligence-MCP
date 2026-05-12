# Market Analyst — Morning Routine

## docs_required
> Read ALL of the following in a single parallel tool call before Step 1.

- docs/agent-memory/notebooks/market-analyst.md    # why: prior session context and regime history

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

## Step 1: Morning briefing

1. `get_macro_snapshot()` → extract REGIME + CARRY_REGIME + DXY_SIGNAL + US10Y_SIGNAL + MAX_DEPOSIT_RATE (top-down lens for the day)
2. Daily briefing via Telegram | watchlist status (positions, alerts)
3. Overnight alerts → new signals
4. Past analyses → historical context

## Step 2: Agent-Specific Error Cases

- Regime data unavailable → state "Thiên thời không rõ — không khuyến nghị" and EXIT.

## Step 3: End of cycle

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

Append to `docs/agent-memory/notebooks/market-analyst.md`:
```markdown
### Analysis: Morning Routine (HH:MM–HH:MM)
- **Type**: morning
- **Regime**: REGIME | CARRY_REGIME | DXY_SIGNAL
- **Key findings**: [patterns, risks, opportunities]
- **Recommendation**: [market stance for the day]
- **Confidence**: high | medium | low
```

```bash
git add docs/agent-memory/notebooks/market-analyst.md
git commit -m "chore(memory/market-analyst): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

## RETURN

```
DONE: Morning routine complete | recommendation: [bullish/bearish/neutral]
NEXT: user
PIPELINE: complete
QUALITY: full | partial (if regime data unavailable)
```

---

## next_flows (compose)
> After this flow, you MAY read AND follow any of the below. Multiple allowed.
- → flows/market-analyst/news-event.md    # when: overnight alerts include fresh news items requiring impact analysis
- → flows/market-analyst/sector.md        # when: a sector-wide signal or significant index move was flagged in briefing
- → STOP                                  # when: regime captured, briefing clean, no actionable signals detected
