# Market Watcher — Notebook
**Last updated:** 2026-08-13 16:10 UTC | **Sprint:** 2026-08-13

## Carry-over
(none)

## Cycle (16:05–16:10 UTC, offhours mode)
- Stocks: 3 | Anomalies: 0 (all <2.5σ floor) | Volume spikes: 0 | Chain confirms: 0
- Regime: NEUTRAL(no Global-Liquidity field) | DXY: NEUTRAL(fallback) | US10Y: NEUTRAL(fallback) | fx_pressure: [] | pe_risk: []
- Sweep forced: 3 (DBC -0.90%, DPM -1.79%, KDC -0.58% — all TRUNG TÍNH on technicals, no anomalies)

## Metrics (cycle 2026-08-13 16:10 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 3 |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| sweep_tickers_forced | 3 |
| coverage_state_updated | pending |
| exit_status | complete |

## Analysis
Offhours mode: market closed, all watchlist prices stale (as of 08:59 UTC EOD). Sweep re-scanned same 3 stale tickers (DBC, DPM, KDC; last covered 12:13 UTC this cycle). Price moves all sub-sigma: DBC dailyStdDev ~1%, DPM ~3%, KDC ~1.5% on 7d sample — no new intraday pre-market moves. Vol regime ELEVATED (76th %ile RV20d 22.87%); breadth weak (ADL -278). Macro degraded (OMO, interbank 1w blocked; SJC gap estimate). No anomalies, no signals emitted. Ready for coverage-state update.

## EOD Cycle (16:00–16:10 UTC, EOD dish)
- Tickers processed: 34 (full watchlist)
- Anomalies detected: 13 tickers with alerts (BID, EIB, FPT, VHM, VIC, GEX, SSI, VND, KBC, MSN, HUT, VCI, VIX)
- Volume spikes: 7 tickers (2.0x–3.3x average)
- Price drops: 11 tickers (banking, real estate, tech, utilities sectors)
- Ledger entries written: 6 (VCB, FPT, VHM, BID, EIB, VIC, GEX)
- Signal file written: docs/signals/price_anomaly_202608131600.json (34 tickers)

### Macro Context
- VN-Index: 1765.63 (-27.55 pts, -1.53% daily)
- Brent oil: $86.78 (NEUTRAL, -2.01%)
- Gold: $4442.1 (BULLISH defensive, -0.56%)
- USD/VND: 25870 (BEARISH VND depreciation pressure)
- Regime: NEUTRAL (carry moderate, yield fairly valued)

### Sector Analysis
- Banking (8 tickers): -1.88% avg decline (EIB -3.85%, SHB -0.42%, VCB -0.34%, BID -1.02%, MBB -1.47%, VPB -1.36%, STB -1.35%, ACB -2.42%, TPB -1.70%, HDB -1.84%)
- Real estate (8 tickers): -2.41% avg decline (VIC -3.53%, VHM -2.71%, KDH -2.20%, DIG -2.74%, DXG -2.69%, VRE -3.34%, KBC -1.61%, NVL -1.11%, PDR -1.24%)
- Tech (1 ticker): -2.26% (FPT)
- Utilities (1 ticker): -2.87% (GEX)
- Construction (4 tickers): -1.56% avg (HUT -0.74%, VCG -2.17%, CTD -1.89%, HHV -1.46%)
- Securities (4 tickers): -1.95% avg (SSI -1.19%, VCI -2.04%, VIX -2.80%, VND -1.49%)

### Foreign Flow Signal
Coordinated foreign institutional selling across 3+ sectors (banking, real estate, securities, utilities). Volume spike pattern consistent with rebalancing into FDI-exposed names; risk-off positioning with gold demand (BULLISH gold).

### Exit Status
Complete | Ledger updated | Signal file written | Notebook committed
