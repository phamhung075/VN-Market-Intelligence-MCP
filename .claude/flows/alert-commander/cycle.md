# Alert Commander — Cycle Flow

## Input
Bootstrap signals, price alerts, legal/crisis data, `docs/data/project-stats.json`

## Output
MARKET alerts (user-facing) | WORK cycle status | BUG on error

**0. Bootstrap**
`get_cycle_bootstrap(agent_name="alert-commander")`
- `analysis_mode=value_investor` → skip trader alerts (→ Value Investor Mode)
- `error` → fail-loud, STOP

**1. Context**
`get_market_context(hours_back=6)` | `get_alerts(type="price")`

**2. Legal + Crisis**
`get_legal_risk_signals()` hit → mark CRITICAL
`get_crisis_early_warning()` threshold exceeded → mark CRITICAL

**3. Signal Matrix**

| Signal | Condition | Action |
|--------|-----------|--------|
| `verified_chain` | conviction ≥ 0.8 | CRITICAL |
| `urgent_news` | conviction ≥ 0.6 | MARKET |
| `price_anomaly` | confirmed via `get_alerts` | CRITICAL |
| `legal_risk` | any | CRITICAL now |
| `crisis_velocity` | any | CRITICAL now |

**4a. MARKET channel**
Pre-send: `get_market_snapshot()` — divergence > 5% → discard, max 2 attempts
- > 3 pending → `send_alert_digest(alerts=[], channel="market")`
- ≤ 3 → `send_telegram(channel="market")` per alert
Format: `.claude/knowledge/alert-message-format.md` (Vietnamese, full diacritics)
After: `mark_alert_read()` + `record_signal_outcome(..., "fired")`

**4b. WORK channel** (every cycle)
```
[Alert Commander] HH:MM UTC — N signals
Fired: X | Suppressed: Y | Next: TIME
```

**4c. BUG channel** (errors only)
```
[Alert Commander] ⚠️ SEVERITY
Issue: ... | Impact: ... | Status: Retrying/Blocking
```

**5. Session log**
`log_agent_work(...)` + append `docs/agent-memory/sessions/YYYY-MM-DD-alert-commander.md`:
```
### Alert Cycle (HH:MM–HH:MM UTC)
- Signals: [count by type]
- Fired: N | Suppressed: M | MARKET: X
```

---

## Firing Rules

**position-danger** (all 3): `stopLossHit=true` + `singleDayDrop>5%` + `newsSentiment<-0.5`
**watchlist-opportunity** (all 4): `kinhDichConfidence≥70` + `kinhDichSignal=BUY` + `newsSentiment≥0.3` + `agentsMajority=BUY`
**CRITICAL always**: `verified_chain` | `legal_risk` | `crisis_velocity`

## Value Investor Mode

`analysis_mode=value_investor` → skip trader alerts → route to WORK.
Always MARKET regardless: earnings release | gov policy change | large insider (>$5M or >5% stake) | supply chain disruption | sector rotation reversal (foreign flow >10%/week) | Kinh Dich shift
