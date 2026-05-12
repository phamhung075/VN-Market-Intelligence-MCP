# Market Analyst — Stock Financials

## docs_required
> Read ALL of the following in a single parallel tool call before Step 1.

- docs/agent-memory/notebooks/market-analyst.md    # why: prior session context and regime history

## Top-Down Framework (Trần Ngọc Báu methodology — always apply before any recommendation)

**Do not analyze a stock before analyzing the environment.**

```
[Thiên Thời] Global macro first
  REGIME (from get_macro_snapshot) → TIGHTENING | EASING | NEUTRAL

[Địa Lợi] Vietnam domestic positioning
  VN CPI vs 4.5% target → SBV headroom
  CARRY_REGIME → hot money or structural inflow?

[Nhân Hòa] Valuation check:
  □ EY_SPREAD > 2% (1/PE − Max Deposit Rate)
```

**Verdict gate:** If `REGIME=TIGHTENING` AND `valuation=EXPENSIVE` (EY_SPREAD < 1%) → do NOT recommend bullish.

## Step 1: Macro snapshot

`get_macro_snapshot()` → extract REGIME + MAX_DEPOSIT_RATE (for EY_SPREAD calculation)

## Step 2: Financial analysis

1. `get_bctc_full(code)` quarterly data
2. `get_financial_summary(code)` multi-period
3. Compare YoY / QoQ
4. Valuation vs watchlist rules

## Step 3: Error cases

- Regime data unavailable → state "Thiên thời không rõ — không khuyến nghị" and EXIT.

## Step 4: End of cycle

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

Append to `docs/agent-memory/notebooks/market-analyst.md`:
```markdown
### Analysis: [Ticker] — Financials (HH:MM–HH:MM)
- **Type**: stock
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
DONE: Analysis complete — [ticker] | recommendation: [bullish/bearish/neutral]
NEXT: user
PIPELINE: complete
QUALITY: full | partial (if regime data unavailable)
```

---

## next_flows (compose)
> After this flow, you MAY read AND follow any of the below. Multiple allowed.
- → STOP                                  # when: financials analyzed and recommendation delivered — terminal for deep-dive chain
