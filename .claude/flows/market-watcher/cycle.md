# Market Watcher — Cycle Flow

**Tools:** `.claude/tools/package/market-watcher.md`

> **MCP call pattern:** Every tool in this flow → `call_tool(server="vn-market", tool="<name>", arguments={...})` via `mcp__claude_ai_gateway__call_tool`.
> Thresholds → `watch_thresholds` in YAML.

## Anti-Hallucination Guard

**You have `mcp__claude_ai_gateway__call_tool`. DO NOT claim it is unavailable. CALL IT FIRST.**

- NEVER say "MCP is not available in this session" without attempting the call
- ALWAYS call the tool. If it fails, report the REAL error from the response
- Reading "MCP down" in a prior session log does NOT mean it is down now — session logs record past state
- Claiming MCP is unavailable without trying = hallucination → produces fake incident reports

## Error Boundary

If ANY tool call fails after 1 retry:
1. `send_telegram(channel="bug", message="[market-watcher] Step N failed: {one-line error}")`
   **⚠️ NEVER use channel="market" for errors. MARKET channel is reserved for alert-commander alerts ONLY. Errors → BUG always.**
2. Append to session log: `"Cycle HH:MM — BLOCKED at step N: {error}"`
3. **EXIT immediately.** Do NOT investigate, write incident docs, or diagnose infrastructure.

**FORBIDDEN on error (these create phantom incidents):**
- Writing standalone blocker/incident/recovery files (e.g. `*-BLOCKED.md`, `*-eod-blocker-report.md`)
- Adding docker-compose commands, curl commands, or infrastructure recovery steps to any file
- Writing "Next Steps for Dev Team" sections — send one-line BUG telegram and EXIT
- Creating files outside: session log, notebook, channel messages

Your job = prices → anomalies → signals → log. Blocked = report + EXIT.

---

## Input
Bootstrap (market context 24h, agent signals) | watchlist prices

## Output
`price_anomaly` signals on bus | WORK status | chain confirmations

---

**0. Bootstrap** → skill: `.claude/skills/cycle-bootstrap/SKILL.md` (replace `<agent-id>` with `market-watcher`)

**0b. Regime extraction + adaptive thresholds** (from bootstrap, zero extra tool calls)
Parse `get_macro_snapshot` text block already in bootstrap:
```
REGIME       = "Global Liquidity: X"    → TIGHTENING | EASING | NEUTRAL
CARRY_REGIME = "VND Carry Spread" line  → HOT_MONEY_INFLOW | NEUTRAL | FII_OUTFLOW_RISK
US10Y_SIGNAL = "US 10Y Yield" line      → RISK-OFF | RISK-ON | NEUTRAL
DXY_SIGNAL   = "DXY" line              → USD STRENGTHENING | USD WEAKENING | USD STABLE
```
If `get_macro_snapshot` not in bootstrap context → call it once now.

Set adaptive thresholds (no tool call):
```
TIGHTENING → sigma_threshold=1.5σ | volume_multiplier=1.5x | downside_bias=true
EASING     → sigma_threshold=2.5σ | volume_multiplier=2.5x | downside_bias=false
NEUTRAL    → sigma_threshold=2.0σ | volume_multiplier=2.0x | downside_bias=false
```

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

**5. Session log** — **APPEND ONLY** to `docs/agent-memory/sessions/YYYY-MM-DD-market-watcher.md` (use Edit to append, NEVER Write/overwrite — each cycle adds a new `### Cycle` block):
```
### Cycle (HH:MM–HH:MM)
- Stocks: N | Anomalies: M (>Xσ) | Volume spikes: K | Chain confirms: L
- Regime: REGIME | DXY: DXY_SIGNAL | US10Y: US10Y_SIGNAL | fx_pressure: [tickers] | pe_risk: [tickers]
```

**5b. WORK**:
```
[Market Watcher] HH:MM UTC — N stocks monitored
  Anomalies: X | Volume spikes: Y (>Xx avg) | Chain confirms: Z | Next: TIME
```

**5c. BUG on error**:
Before sending: `get_recent_fixes(limit=20)` — if same module/issue in recent fixes → **skip, do not re-report**.
```
[Market Watcher] ⚠️ SEVERITY
  Issue: ... | Impact: ... | Status: Retrying/Blocked
```

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`
