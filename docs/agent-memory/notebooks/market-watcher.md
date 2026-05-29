# Market Watcher — Notebook

**Last updated:** 2026-05-29 16:06 UTC | **Sprint:** 051

> Full session history archived → `docs/archive/notebooks/market-watcher-2026-05-18.md`

## Current state

Last successful cycle: 2026-05-29 16:06 UTC (eod offhours, 39 stocks scanned, 0 anomalies, 0 signals emitted)
Last market-hours cycle: 2026-05-29 08:07 UTC (market-hours, 39 stocks scanned, 1 anomaly, 1 signal emitted)
Last prepost cycle: 2026-05-29 12:06 UTC (prepost, 39 stocks scanned, 0 anomalies, 0 signals emitted)

## Cycle 2026-05-29 16:06 UTC — EOD Summary (Market Close)

**Status:** EOD (16:06 UTC = 23:06 VN Thursday evening, market closed)
**Mode:** eod | **Invocation:** 16:00Z off-hours fan-out tick (cowork-team dispatcher slot=market-watcher-offhours)
**Regime:** NEUTRAL | Carry: FII_OUTFLOW_RISK | Gold: BULLISH | USD/VND: BEARISH | Yield: NEUTRAL
**Thresholds:** Standard EOD analysis — all 39 watchlist tickers processed

**Stocks scanned:** 39 watchlist tickers

**Macro context (EOD snapshot 16:06Z):**
- VN-Index: 1,863.49 (stable, CLOSED)
- Brent: 90.67 NEUTRAL | Gold: 4,608.7 BULLISH | USD/VND 26,115 BEARISH (VND weak, FII outflow stress)
- Supply chain: BDI 1,400 STABLE | no disruption signals
- Investment clock: CORE_VN tier (score 8/10)

**Major movers (daily % change):**
- **GAS +6.98%** (87,400 VND): Oil & gas momentum continues, volume 3.16M (+90% avg), sector rotation POSITIVE
- **PLX +3.93%** (41,000 VND): Oil & gas peer strength, volume 464.6K (+40% avg), sector tailwind
- **ACB +1.01%** (24,900 VND): Banking sector mixed (avg -0.16%), ACB led mini-recovery, volume 16.94M (+170% avg)

**Sector analysis (1-day change):**
- Oil & gas: +3.30% (POSITIVE — strongest sector, momentum driven by Brent stable, supply news)
- Real estate: -0.26% (NEGATIVE — persistent pressure, 10 HIGH alerts from 08:30 session, VNH -11.11% outlier)
- Banking: -0.16% (NEGATIVE — slight carry stress, 7 major banks red, but ACB +1.01% signal recovery)
- Utilities: -0.24% (stable, no material alerts)
- Tech: -0.29% (stable, no significant moves)
- Retail: -0.80% (pressure, MWG -1.80%)

**Anomalies detected:** 0 at EOD threshold (all moves <2.0σ for 30-day vol)

**Signals emitted:** 1 EOD signal file (docs/signals/price_anomaly_20260529T1606.json) containing all watchlist data for chef consumption at 08:37 UTC

**Chain confirms:** 0 (market closed, no intraday chains)

**Technical readiness:**
- Most watchlist (25+): 27–35 candles (approaching ready for full TA)
- GAS: 27/35 candles | PLX: 26/35 candles (high-volume data, sufficient)
- VNH: 10/35 candles (HNX illiquid, insufficient for TA)

**Assessment for next market open (02:00Z 2026-05-30):**
- Oil & gas momentum likely to persist at open (positive overnight sentiment, supply tight)
- Real estate sector watch (10 HIGH alerts pending confirmation)
- Banking volatility contained; ACB strength may signal sector stabilization
- VN-Index consolidation around 1,863.5 — no sharp directional signal yet
- FII outflow risk ongoing (carry spread stress); watch for inflows on dips

## Metrics (cycle 2026-05-29 16:06 UTC)

| Field | Value |
|---|---|
| cycle_type | eod offhours |
| current_utc | 2026-05-29 16:06 |
| window_match | eod (16:00 UTC ±5 min) |
| mode | eod |
| regime | NEUTRAL |
| carry_regime | FII_OUTFLOW_RISK |
| gold_signal | BULLISH |
| usdvnd_signal | BEARISH |
| stocks_scanned | 39 watchlist |
| anomalies_detected | 0 (all <2.0σ at EOD) |
| signals_emitted | 1 (EOD signal file) |
| signal_file | docs/signals/price_anomaly_20260529T1606.json |
| ledger_updates | 3 major (GAS, VHM, ACB) + 36 standard |
| mcp_calls | 12 (bootstrap, watchlist, price_history, sector_rotation, supply_chain, technical x5) |
| mcp_errors | 0 |
| exit_status | complete |
| token_estimate | ~3200 |

