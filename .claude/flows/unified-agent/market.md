# Unified Agent — Market Cycle Flow

## Input
Bootstrap (market context 24h, system status, agent signals)

## Output
Conviction shifts posted | issues filed | WORK heartbeat | `docs/analysis-briefs/` updated on event

---

**0. Bootstrap** `get_cycle_bootstrap(agent_name="unified-agent")`
- Check: `urgent_news` | `cross_validate` | `suppress`
- `error` → fail-loud, STOP

**1. System health**
`get_system_status()` | `get_rate_limit_status()` | `get_recent_fixes(days=2)` + `read_telegram_reports(status="new")`
Stale reports: unclaimed >4h (critical) | >24h (medium) | >48h (low) → escalate to WORK

**2. Market intelligence**
`get_market_context(hours_back=24)` | `get_prediction_markets()` | `get_sentiment_trend()` | `get_legal_risk_signals()` | `get_crisis_early_warning()`

**3. Portfolio**
`get_positions()` | `get_portfolio_conviction()` | `get_portfolio_risk()` VaR 95% | `get_rebalancing_signals()` | `get_target_allocation()`

**4. Domain**
`get_supply_chain_exposure()` | `get_climate_risk_signals()` | `get_energy_grid_signals()` | `get_insider_signals()`

**5. Quality**
`get_alert_accuracy()` precision < 60% = bug | `get_signal_effectiveness()` chains vs standalone | `get_unreviewed_market_messages(limit=50)` spam audit

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

On trigger: full analysis → recalculate conviction (+0.1 boost) →
```
docs/analysis-briefs/{TICKER}.md:
YYYY-MM-DD HH:MM | EVENT: {type} | {1-line} | Conviction: {old} → {new}
```
Shift ≥ 0.3 → WORK:
```
[Unified] CONVICTION SHIFT — {TICKER}
Trigger: {event_type} | Score: {old} → {new} ({direction}) | Action: {brief}
```
Entry/exit → `post_agent_signal(type="conviction_change", ...)`

## Session Log
`docs/agent-memory/sessions/YYYY-MM-DD-unified-agent.md`:
```
### Coordination Cycle (HH:MM–HH:MM)
- Mode: MARKET | System: [health] | Alerts: N | Quality issues: N | Bugs: [list]
```
