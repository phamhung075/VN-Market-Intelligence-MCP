# Market Watcher — Cycle Flow
> Thresholds → `watch_thresholds` in YAML.

## Input
Bootstrap (market context 24h, agent signals) | watchlist prices

## Output
`price_anomaly` signals on bus | WORK status | chain confirmations

---

**0. Bootstrap** `get_cycle_bootstrap(agent_name="market-watcher")`
- Check: `urgent_news` | `cross_validate` | `suppress`
- `market_context` error → fail-loud, STOP immediately
- `agent_signals` error only → log warning to WORK, continue with zero signals
- Any other error → fail-loud, STOP

**1. Price analysis** (stocks with >2% moves):
`get_price_history(code)` 30d | `get_sector_comparison(code)` stock vs sector? | `get_patterns(stockCode, eventKeyword)` | `get_technical_indicators(code)` RSI/BB/MACD | `get_ticker_intelligence(code)` growth/quality

**2. Macro + supply chain**
`get_sector_rotation()` | `get_supply_chain_exposure()` BDI/rates | `get_climate_risk_signals()` typhoon/El Niño | `get_energy_grid_signals()` hydro levels

**3. Enrich chains**
`get_open_chain_findings(minutes_back=15)` → post price confirmation signals

**4. Signal anomalies**
>2σ move | volume spike | VaR breach → `post_agent_signal(type="price_anomaly", ticker=..., detail=...)`

**5. Session log** `docs/agent-memory/sessions/YYYY-MM-DD-market-watcher.md`:
```
### Cycle (HH:MM–HH:MM)
- Stocks: N | Anomalies: M (>2σ) | Volume spikes: K | Chain confirms: L
```

**5b. WORK**:
```
[Market Watcher] HH:MM UTC — N stocks monitored
  Anomalies: X | Volume spikes: Y (>2x avg) | Chain confirms: Z | Next: TIME
```

**5c. BUG on error**:
Before sending: `get_recent_fixes(limit=20)` — if same module/issue in recent fixes → **skip, do not re-report**.
```
[Market Watcher] ⚠️ SEVERITY
  Issue: ... | Impact: ... | Status: Retrying/Blocked
```
