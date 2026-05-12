# Market Analyst — News Event Analysis

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
  VN CPI vs 4.5% target → SBV headroom
  CARRY_REGIME → hot money or structural inflow?

[Nhân Hòa] Action timing — only when ≥3/5 aligned:
  □ REGIME=EASING
  □ CARRY_REGIME=HOT_MONEY_INFLOW
  □ US10Y_SIGNAL=RISK-ON
  □ EY_SPREAD > 2% (1/PE − Max Deposit Rate)
  □ No pivot window (stable policy window)
```

**Verdict gate:** If `REGIME=TIGHTENING` AND `valuation=EXPENSIVE` (EY_SPREAD < 1%) → do NOT recommend bullish.

## Step 1: Macro snapshot

`get_macro_snapshot()` → extract REGIME + CARRY_REGIME + DXY_SIGNAL + US10Y_SIGNAL + MAX_DEPOSIT_RATE (call once at session start)

## Step 2: News analysis

1. `fetch_and_analyze()` article + initial analysis
2. `run_impact_chain()` → cascade to watchlist
3. `get_alerts()` → watchlist stocks triggered?
4. Session log → findings + recommendation

## Step 3: Error cases

- Regime data unavailable → state "Thiên thời không rõ — không khuyến nghị" and EXIT.

## Step 4: End of cycle

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

Append to `docs/agent-memory/notebooks/market-analyst.md`:
```markdown
### Analysis: [News Event] (HH:MM–HH:MM)
- **Type**: news impact
- **Regime**: REGIME | CARRY_REGIME | DXY_SIGNAL
- **Key findings**: [patterns, risks, opportunities]
- **Historical precedent**: [similar events]
- **Recommendation**: [bullish/bearish/neutral + watch items]
- **Confidence**: high | medium | low
```

```bash
git add docs/agent-memory/notebooks/market-analyst.md
git commit -m "chore(memory/market-analyst): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

## RETURN

```
DONE: Analysis complete — [event] | recommendation: [bullish/bearish/neutral]
NEXT: user
PIPELINE: complete
QUALITY: full | partial (if regime data unavailable)
```

---

## next_flows (compose)
> After this flow, you MAY read AND follow any of the below. Multiple allowed.
- → flows/market-analyst/financials.md    # when: impact chain triggered a watchlist ticker needing deep fundamental check
- → flows/market-analyst/sector.md        # when: news event affects multiple peers (sector-wide rather than stock-specific)
- → STOP                                  # when: impact chain complete, no individual ticker warrants deeper dive
