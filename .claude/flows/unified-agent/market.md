# Unified Agent — Market Cycle Flow

## Input
Bootstrap (market context 24h, system status, agent signals)

## Output
Conviction shifts posted | issues filed | WORK heartbeat | `docs/analysis-briefs/` updated on event

---

**0. Bootstrap** `get_cycle_bootstrap(agent_name="unified-agent")`
- Check: `urgent_news` | `cross_validate` | `suppress`
- `market_context` error → fail-loud, STOP immediately
- `agent_signals` error only → log warning to WORK, continue with zero signals
- Any other error → fail-loud, STOP

**0b. Regime extraction** (from bootstrap, zero extra tool calls)
Parse `get_macro_snapshot` text block already in bootstrap:
```
REGIME      = "Global Liquidity: X"    → TIGHTENING | EASING | NEUTRAL
US10Y_SIGNAL = "US 10Y Yield" line     → RISK-OFF | RISK-ON | NEUTRAL
DXY_SIGNAL  = "DXY" line              → USD STRENGTHENING | USD WEAKENING | USD STABLE
```
If `get_macro_snapshot` not in bootstrap context → call it once now.
Load previous session log to check REGIME at last session end.

**1. System health**
`get_system_status()` | `get_rate_limit_status()` | `get_recent_fixes(days=2)` + `read_telegram_reports(status="new", limit=50, unclaimed_only=false)`
Stale reports: unclaimed >4h (critical) | >24h (medium) | >48h (low) → escalate to WORK

**2. Market intelligence**
`get_market_context(hours_back=24)` | `get_prediction_markets()` | `get_sentiment_trend()` | `get_legal_risk_signals()` | `get_crisis_early_warning()`

**3. Portfolio**
`get_positions()` | `get_portfolio_conviction()` | `get_portfolio_risk()` VaR 95% | `get_rebalancing_signals()` | `get_target_allocation()`

After `get_rebalancing_signals()`, apply sector regime fit:
```
TIGHTENING tailwind: utilities | healthcare | consumer_staples | export_manufacturing | tech_export
TIGHTENING headwind: realty | construction | consumer_finance | banking_growth
EASING: swap the two lists
```
Per BUY signal: sector in HEADWIND → downgrade conviction × 0.7, set `regime_headwind=true`
Per BUY signal: sector in TAILWIND + `REGIME=EASING` → boost conviction × 1.1, set `regime_tailwind=true`

Compute `ALIGNMENT_SCORE = TAILWIND_weight / total_portfolio_weight`
If `ALIGNMENT_SCORE < 0.5` AND `REGIME=TIGHTENING`:
→ post WORK: `"Portfolio misaligned với Thiên Thời: {HEADWIND_weight:.0%} trong headwind sectors"`

**4. Domain**
`get_supply_chain_exposure()` | `get_climate_risk_signals()` | `get_energy_grid_signals()` | `get_insider_signals()`

FII capital type classification (Pillar 2 — Tốt Gỗ vs Tốt Nước Sơn):
From `get_foreign_flow()` data + CARRY_REGIME + hot_money_risk signals from news-scout:
- `HOT_MONEY` profile: FII inflow spike correlates with carry spread widening + concentrated in large-cap liquid stocks + `CARRY_REGIME=HOT_MONEY_INFLOW`
  → flag: `fii_type=HOT_MONEY` — post WORK: "⚠️ Dòng FII hiện tại có dấu hiệu tiền nóng — rủi ro đảo chiều cao nếu carry thu hẹp"
- `STRUCTURAL` profile: steady inflow + correlates with BCTC beat/positive fundamentals + not carry-driven
  → flag: `fii_type=STRUCTURAL` — stable signal, no special warning
- Default if unclear → `fii_type=UNKNOWN`

**5. Quality**
`get_alert_accuracy()` precision < 60% = bug | `get_signal_effectiveness()` chains vs standalone | `get_unreviewed_market_messages(limit=50)` spam audit

Check if REGIME changed since last session log → if changed:
- Log `REGIME_TRANSITION` event to WORK: `"[Unified] REGIME_TRANSITION: {old} → {new} (HH:MM UTC)"`

**6. WORK**
Issues → `submit_feedback(agent="unified-agent", ...)`
Clean:
```
unified-agent loop clean (HH:MM UTC): all green.
```

## Special Event Triggers (6)

| Trigger | Detection |
|---------|-----------|
| Earnings | `get_earnings_calendar()` new entry |
| Policy change | `get_legal_risk_signals()` + news spike |
| Large insider >500M VND | `get_insider_signals()` threshold |
| Supply disruption | `get_supply_chain_exposure()` + BDI spike |
| Sector rotation | `get_sector_rotation()` reversal |
| Kinh Dich shift | `get_kinhdich_reading()` major change |

On trigger: full analysis → recalculate conviction (+0.1 additive boost, cap at 1.0) →
Apply regime multiplier AFTER additive boost: HEADWIND ×0.7 | TAILWIND+EASING ×1.1 | cap final at 1.0
If `docs/analysis-briefs/{TICKER}.md` does not exist → create it first:
```markdown
# {TICKER} — Analysis Ledger {YEAR}
**Sector**: {domain} | **Exchange**: {exchange}

## [Report Analyzer] Fundamentals & Valuation

## [News Scout] Headlines & Sentiment

## [Market Watcher] Price, Volume, Technicals

## [Unified Agent] Quarterly Syntheses
```
Append:
```
docs/analysis-briefs/{TICKER}.md:
YYYY-MM-DD HH:MM | EVENT: {type} | {1-line} | Conviction: {old} → {new}
```
Shift ≥ 0.3 → WORK:
```
[Unified] CONVICTION SHIFT — {TICKER}
Trigger: {event_type} | Score: {old} → {new} ({direction}) | Action: {brief}
```
Entry/exit → `post_agent_signal(type="conviction_change", ...)`:
```json
{
  "finding_data": {
    "regime": "<TIGHTENING|EASING|NEUTRAL>",
    "sector_regime_fit": "<TAILWIND|HEADWIND|NEUTRAL>",
    "alignment_score": 0.65,
    "fii_type": "<HOT_MONEY|STRUCTURAL|UNKNOWN>"
  }
}
```

## Session Log
`docs/agent-memory/sessions/YYYY-MM-DD-unified-agent.md`:
```
### Coordination Cycle (HH:MM–HH:MM)
- Mode: MARKET | System: [health] | Alerts: N | Quality issues: N | Bugs: [list]
- Regime: REGIME | Alignment: ALIGNMENT_SCORE | Headwind exposure: HEADWIND_weight%
```
