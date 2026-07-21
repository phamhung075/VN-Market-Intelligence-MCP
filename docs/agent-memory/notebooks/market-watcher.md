# Market Watcher — Notebook
**Last updated:** 2026-07-21 16:13 UTC | **Sprint:** 2026-Q3

## Carry-over
EOD slot had not fired since 2026-07-17T16:08Z (4-day gap; 07-18/19 weekend, 07-20 and 07-21 EOD missed). This cycle was the first EOD pass since then — treated as first pass, no delta-vs-yesterday assumptions made.

## Cycle (EOD, 16:13 UTC)
- Tickers processed: 6 (mover set, per prior EOD precedent of notable-movers-only, not all 58)
- Ledger: 6 written, 0 failed — `DIG.md` created from template, `GEX.md` Market Watcher section added (was absent)
- Signal file: `docs/signals/price_anomaly_20260721T1613.json` (6 tickers, JSON validated via jq)
- Regime: NEUTRAL | carry NEUTRAL | yield FAIRLY_VALUED | VN-Index 1730.56 (-12.95)

### Headline finding — crude/equity divergence
Brent +2.71% to $91.41, yet Dầu khí sector **-6.05% in one session** — worst sector by 2×, next worst Công nghệ -2.79%.
GAS -6.98% (RSI 29.3, **4.0× avg volume**, below lower BB), BSR -6.49% (RSI 37.8), PLX -4.81% (RSI 28.7).
Economically coherent for BSR (refiner crack spread) and PLX (distributor with administratively capped retail price vs rising crude input — corroborating news: petrol station fined for unauthorised price rise). GAS (upstream) is the least explained leg.
**Not** asserted as a validated causal chain — `get_open_chain_findings` returned zero market chains this cycle.

### Volume splits the selloff into two regimes
- **Capitulation (heavy turnover):** GAS 402%, DIG 191%, PLX 151%, BSR 147% of 21d avg
- **Grinding decline (avg-or-below turnover):** GEX 87%, FPT 98%
GEX is the standout risk: RSI 19.9 (most extreme oversold on watchlist), -28.06% over 30d, second consecutive heavy down day — but **no capitulation volume**, so no exhaustion signal. Recorded as "avoid", not "buy the dip".

## Incidents
- **vn-market MCP server restarted mid-cycle ~16:10:03 UTC** — uptime 14h34m → 8s, all circuit breakers reset. Six parallel `get_technical_indicators`/`get_market_snapshot` calls were in flight at that exact instant and all returned `connection refused`. Causal link plausible (known over-parallel host-starvation failure mode) but **unproven** — could equally be an independent restart. Mitigation applied: every subsequent call this cycle was serial; zero further failures. Worth a dev look if the pattern repeats.
- YoY unavailable: neither `get_ticker_intelligence` nor `get_price_history(30d)` expose a YoY field. Written as `null`, **not estimated**. A 365-day pull was deliberately deferred rather than re-load a just-restarted server.

## Metrics (cycle 2026-07-21 16:13 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 6 |
| signals_emitted | 1 (price_anomaly, 6 tickers) |
| ledger_written | 6 |
| ledger_failed | 0 |
| insider_probes | 6 (all "no activity", all probed not assumed) |
| gateway_restarts_observed | 1 |
| exit_status | complete |

## Cycle (offhours, 12:05 UTC)
- Stocks scanned: 3 (sweep rotation) | Anomalies: 0 (>2.5σ floor) | Volume spikes: 0 | Chain confirms: 0
- Regime: NEUTRAL | Volatility: NORMAL (rv_20d=14.73%, percentile 32.86%)
- Sweep forced: KBC (65h stale), HUT (65h stale), DIG (65h stale) — all below threshold floor
- Market status: CLOSED (outside 02:00–08:59 UTC) — prices stale as of 08:32 UTC
- Breadth: Weak (ADL=-316, 25 new lows, 0 new highs, pct_above_ma200=8.3%)
