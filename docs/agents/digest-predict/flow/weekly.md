# Digest & Predict — Weekly Digest Flow (Sunday 13:47 UTC)

**Tools:** `docs/agents/tools/package/digest-predict.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
Weekly market data | agent signals | prediction accuracy | system feedback

## Output
Weekly digest to MARKET | WORK status

---

**0b. Regime** → skill: `.claude/skills/regime-extraction/SKILL.md`
Variables: REGIME, CARRY_REGIME, US10Y_SIGNAL, DXY_SIGNAL

**0c. Macro health** → skill: `.claude/skills/macro-health-read/SKILL.md`
Store as MACRO_HEALTH. Used in weekly synthesis and FX thesis sections.

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
  - Macro health: `MACRO_HEALTH.macro_regime_note` (6-track summary from macro-health-read)
- **[T-23 / Bank-survey consensus cross-check]** Report VIRA/VARA survey consensus for CPI / IRS / interbank rate / FX alongside the system's own forecast. Flag when system forecast diverges from survey mean by > 0.5pp or > 1σ dispersion. Call `get_policy_signals()` and extract any VIRA/VARA survey fields; if absent, note data gap.
- **[T-42 / Trade-cycle duration prior]** FX thesis must apply the ~1-year cycle prior: do NOT forecast deficit mean-reversion inside 2–3 months. Source: TRADE_FX.cycle_stage from `trade-fx-pressure-decomp` (invoke if not already run this cycle; degraded mode ok). Model 6–12 month FX-pressure scenarios based on cycle_stage (EARLY → rising pressure, MID → sustained, LATE → mean-reversion window opening).
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

`send_telegram(channel="market", message=<weekly_digest_text>)`
`send_telegram(channel="work", message="[Digest & Predict] HH:MM UTC — WEEKLY sent. Next: TIME")`

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

**Skills available to this agent (lazy-load — load only when the task requires it):**
- Word document (docx) deliverable → skill: `.claude/skills/docx/SKILL.md` (trigger: user asks for a weekly digest report formatted as a .docx file)
