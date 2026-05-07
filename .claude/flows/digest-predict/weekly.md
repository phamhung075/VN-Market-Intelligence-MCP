# Digest & Predict — Weekly Digest Flow (Sunday 16:00 UTC)

**Tools:** `.claude/tools/package/digest-predict.md`

> **MCP call pattern:** Every tool in this flow → `call_tool(server="vn-market", tool="<name>", arguments={...})` via `mcp__claude_ai_gateway__call_tool`.

## Anti-Hallucination Guard

**You have `mcp__claude_ai_gateway__call_tool`. CALL IT. Do not claim unavailability without trying.**
Blocked = one-line BUG telegram + EXIT. No incident files, no docker commands, no "Next Steps" sections.

## Error Boundary

If ANY tool call fails after 1 retry → `send_telegram(channel="bug", message="[digest-predict] Weekly step N failed: {error}")` → EXIT immediately. Do NOT investigate or write incident docs.

---

## Input
Weekly market data | agent signals | prediction accuracy | system feedback

## Output
Weekly digest to MARKET | WORK status

---

**0b. Regime + Calendar** (before all else)
Parse `get_macro_snapshot` from bootstrap context (or call once):
```
REGIME       = "Global Liquidity: X"   → TIGHTENING | EASING | NEUTRAL
CARRY_REGIME = "VND Carry Spread" line → HOT_MONEY_INFLOW | NEUTRAL | FII_OUTFLOW_RISK
US10Y_SIGNAL = "US 10Y Yield" line     → RISK-OFF | RISK-ON | NEUTRAL
DXY_SIGNAL   = "DXY" line             → USD STRENGTHENING | USD WEAKENING | USD STABLE
```
`get_macro_calendar(days=14)` → `upcoming_events`, `pivot_window_active`

`generate_market_summary(period="weekly")`

Include:
- **[Thiên Thời tuần tới]** `{REGIME}` | DXY: `{DXY_SIGNAL}` | US10Y: `{US10Y_SIGNAL}` | Carry: `{CARRY_REGIME}`
  - Upcoming macro events (next 14 days): `{upcoming_events}` | Pivot window: `{pivot_window_active}`
- Week performance + sector trends
- `get_sector_comparison(code)` per stock — PE/PB/ROE vs median, PREMIUM/DISCOUNT/NGANG BẰNG, foreign flow
- Position review (hold/accumulate/reduce + reasoning):
  - `REGIME=TIGHTENING` → accumulate only for CHEAP (EY_SPREAD > 3%) + non-rate-sensitive sectors; append caveat to any "accumulate" in headwind sectors
  - `REGIME=EASING` → accumulate in TAILWIND sectors supported
- `get_correlation_matrix()` diversification score
- `get_alert_accuracy()` accurate vs noisy
- `get_signal_effectiveness(days=7)` precision < 60% = flag
- `get_cascade_metrics(days=7)` high-activity or dead rules
- `run_hexagram_backtest(days=7)` prediction accuracy
- `get_transition_probabilities(hexagram_number)` key stocks
- `get_prediction_accuracy(days=7)` claim resolution rate
- Calibration: skip — already sent by server `calibrationReportJob` (Sun 13:00 UTC → MARKET + WORK)
- All domain tools: legal/policy/bond/contracts/credit/insider/supply chain/climate/energy/crisis/pharma

## System Improvement (every Sunday)
`read_telegram_reports(status="all")` | `get_recent_fixes(20)` → group by category/agent:
```
Cải thiện hệ thống tuần này:
1. {highest priority}
2. {second}
3. {third}
Tổng feedback: {N} từ {agents}
```

`send_telegram(channel="market")`
`send_telegram(channel="work", "[Digest & Predict] HH:MM UTC — WEEKLY sent. Next: TIME")`

**Notebook write** → `docs/agent-memory/notebooks/digest-predict.md`

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`
