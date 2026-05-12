# Market Analyst — Sector Context

## docs_required
> Read ALL of the following in a single parallel tool call before Step 1.

- docs/agent-memory/notebooks/market-analyst.md    # why: prior session context and regime history

## Top-Down Framework (Trần Ngọc Báu methodology — always apply before any recommendation)

**Do not analyze a stock before analyzing the environment.**

```
[Thiên Thời] Global macro first
  REGIME (from get_macro_snapshot) → TIGHTENING | EASING | NEUTRAL

[Địa Lợi] Vietnam domestic positioning
  CARRY_REGIME → hot money or structural inflow?
```

**Verdict gate:** If `REGIME=TIGHTENING` → sector-wide moves are macro-driven; be cautious on individual recommendations.

## Step 1: Macro snapshot

`get_macro_snapshot()` → extract REGIME + CARRY_REGIME

## Step 2: Sector comparison

Stock moves significantly → `get_sector_comparison(code)` peers

Classify:
- **"toàn ngành"** = sector-wide (macro cause) → regime explains move, no individual action
- **"riêng lẻ"** = stock-specific (earnings/news) → deeper analysis warranted

## Step 3: Error cases

- Regime data unavailable → state "Thiên thời không rõ — không khuyến nghị" and EXIT.

## Step 4: End of cycle

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

Append to `docs/agent-memory/notebooks/market-analyst.md`:
```markdown
### Analysis: [Ticker] — Sector (HH:MM–HH:MM)
- **Type**: sector comparison
- **Regime**: REGIME | CARRY_REGIME | DXY_SIGNAL
- **Key findings**: [toàn ngành vs riêng lẻ classification, risks, opportunities]
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
DONE: Analysis complete — [ticker] sector | recommendation: [bullish/bearish/neutral]
NEXT: user
PIPELINE: complete
QUALITY: full | partial (if regime data unavailable)
```

---

## next_flows (compose)
> After this flow, you MAY read AND follow any of the below. Multiple allowed.
- → STOP                                  # when: sector classification complete (toàn ngành vs riêng lẻ) — terminal for sector chain
