<!-- size-justification: 124L — atomic price-monitoring flow; sigma threshold logic + channel routing rules are operationally coupled step-by-step. -->
# Market Watcher — Cycle Flow

**Tools:** `.claude/tools/package/market-watcher.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
Bootstrap (market context 24h, agent signals) | watchlist prices

## Output
`price_anomaly` signals on bus | WORK status | chain confirmations

> Channel rule: MARKET = EOD summary (eod.md, 16:00 UTC) ONLY. Cycle status → WORK. Errors → BUG. Never route "N stocks monitored / 0 anomalies" to MARKET.

---

**0. Bootstrap** → skill: `.claude/skills/cycle-bootstrap/SKILL.md` (replace `<agent-id>` with `market-watcher`)

**0b. Regime** → skill: `.claude/skills/regime-extraction/SKILL.md`
Variables: REGIME, CARRY_REGIME, US10Y_SIGNAL, DXY_SIGNAL

Set adaptive thresholds (no tool call):
```
TIGHTENING → sigma_threshold=1.5σ | volume_multiplier=1.5x | downside_bias=true
EASING     → sigma_threshold=2.5σ | volume_multiplier=2.5x | downside_bias=false
NEUTRAL    → sigma_threshold=2.0σ | volume_multiplier=2.0x | downside_bias=false
```

Prepost floor (apply after regime block, no tool call):
```
if mode=prepost:
  sigma_threshold    = max(sigma_threshold, 2.5)   # suppress illiquid-hour noise
  volume_multiplier  = max(volume_multiplier, 2.5x) # suppress illiquid-hour noise
```
Rationale: pre/post-market liquidity is thin; regime thresholds as low as 1.5σ/1.5x would over-fire on unchanged EOD prices. The floor lifts both parameters to the EASING-equivalent level regardless of regime. Off-hours duplicate guard (Step 4, AutoCure 2026-05-14 TNB c47) continues to suppress same-closing-price re-emissions independently.

**1. Price analysis** (stocks with moves > adaptive sigma_threshold):
`get_price_history(code)` 30d | `get_sector_comparison(code)` stock vs sector? | `get_patterns(stockCode, eventKeyword)` | `get_technical_indicators(code)` RSI/BB/MACD | `get_ticker_intelligence(code)` growth/quality

Per stock: apply sector flags before emitting signal:
- `DXY_SIGNAL=USD STRENGTHENING` + sector in (banking, realty) → `fx_pressure=true`
- `US10Y_SIGNAL=RISK-OFF` + large-cap with high FII exposure → `pe_compression_risk=true`

**2. Macro + supply chain**
`get_sector_rotation()` | `get_supply_chain_exposure()` BDI/rates | `get_climate_risk_signals()` typhoon/El Niño | `get_energy_grid_signals()` hydro levels

`get_sector_rotation()` post-processing:
- `CARRY_REGIME=HOT_MONEY_INFLOW`: identify top 3 sectors by FII net buy → flag `hot_money_concentration=true` for those sectors. Include in session log.

**3. Enrich chains**
`get_open_chain_findings(minutes_back=15)` → post price confirmation signals

**4. Signal anomalies**
Move > adaptive sigma_threshold | volume spike > volume_multiplier | VaR breach → post signal:

> **[AutoCure 2026-05-14 TNB c47] Off-hours duplicate guard:** Before posting any `price_anomaly` signal in an off-hours cycle (market CLOSED), check: has the same `stock_code` + same `move_pct` (i.e. unchanged closing price) already generated a signal in this calendar session (since last market open)? If yes → **SKIP signal, log as SUPPRESSED: "off-hours duplicate — same closing price, signal already emitted this session (id=XXXX)"**. Rationale: off-hours crons re-scan unchanged EOD prices every N hours; re-emitting is noise not signal. Only emit a NEW signal if `move_pct` has changed (intraday pre-market move) or if 24h+ have elapsed since the original signal.

```
call_tool(server="vn-market", tool="post_agent_signal", arguments={
  "from_agent": "market-watcher",
  "to_agent": "alert-commander",
  "signal_type": "price_anomaly",
  "stock_code": "<TICKER>",
  "payload": { "title": "<TICKER> +X.XX% (Yσ)", "detail": "<summary of anomaly>" },
  "finding_data": { ... see schema below ... },
  "ttl_minutes": 120,
  "chain_depth": 0
})
```
`downside_bias=true` (TIGHTENING): negative moves escalate priority one level (MEDIUM→HIGH, LOW→MEDIUM) before routing.
```json
{
  "finding_data": {
    "move_pct": "<price_change_pct>",
    "move_sigma": "<abs(price_change_pct) / (dailyStdDev * 100)>",
    "price_change_pct": "<price_change_pct>",
    "regime": "<TIGHTENING|EASING|NEUTRAL>",
    "adjusted_threshold": "1.5σ",
    "fx_pressure": false,
    "pe_compression_risk": false
  }
}
```
Schema: `PriceAnomalyFindingDataSchema` in `apps/mcp-server/src/domain/signals/signalTypes.ts`.
- **Required:** `move_pct` (number), `move_sigma` (number)
- **Optional:** `ref_price` (number), `window_days` (int >= 1), `price_change_pct` (number), `regime` (string), `adjusted_threshold` (string), `fx_pressure` (boolean), `pe_compression_risk` (boolean)
- Extra fields are accepted (passthrough).

Note: `move_sigma = abs(price_change_pct) / (dailyStdDev * 100)` where `dailyStdDev` is the rolling 30-day standard deviation of daily returns (fraction, e.g. 0.015 for 1.5%) already computed in step 1 via `get_price_history`. Both `move_pct` and `price_change_pct` carry the same signed percentage value; `move_pct` is the canonical field consumed by downstream agents (financial-analyst, alert-commander), and `price_change_pct` is kept for legacy compatibility.

**5. Notebook commit** — Write (full overwrite) `docs/agent-memory/notebooks/market-watcher.md` per skill: `.claude/skills/notebook-write/SKILL.md`. Read existing notebook first to recover any `## Carry-over` items, then overwrite with fresh cycle body (target ≤50L, hard cap 80L):

> Invariant: timestamp = current UTC, never future, never speculative. (UTC guard — Sprint 1865a pattern)

### Notebook timestamp guard
- Use ONLY the actual current UTC time when stamping notebook entries
- NEVER write entries for cycles that have not fired yet (no "02:38 UTC" entry if current UTC is 14:40)
- If unsure of current time: call `get_cycle_bootstrap` to refresh time anchor before writing

### Notebook header (include in overwrite body, line 3)
```
**Last updated:** $(date -u +"%Y-%m-%d %H:%M UTC") | **Sprint:** <current_sprint>
```
Use `date -u` exclusively — same UTC source as the session log guard (1865a).
```
### Cycle (HH:MM–HH:MM)
- Stocks: N | Anomalies: M (>Xσ) | Volume spikes: K | Chain confirms: L
- Regime: REGIME | DXY: DXY_SIGNAL | US10Y: US10Y_SIGNAL | fx_pressure: [tickers] | pe_risk: [tickers]

## Metrics (cycle YYYY-MM-DD HH:MM UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | N |
| signals_emitted | N |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete\|blocked\|empty |
| token_estimate | N |
```
```bash
git add docs/agent-memory/notebooks/market-watcher.md
git commit -m "chore(memory/market-watcher): notebook YYYY-MM-DD"
```

**5b. WORK** — `send_telegram(channel="work", message=...)`:
```
[Market Watcher] HH:MM UTC — N stocks monitored
  Anomalies: X | Volume spikes: Y (>Xx avg) | Chain confirms: Z | Next: TIME
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`
