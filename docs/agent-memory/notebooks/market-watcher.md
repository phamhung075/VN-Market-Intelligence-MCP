# Market Watcher — Notebook
**Last updated:** 2026-07-04 16:05 UTC | **Sprint:** eod-2026-07-04

## Cycle (16:05 UTC EOD, tick 2026-07-04T16:00Z)
- Market: CLOSED (outside 02:00–08:59 UTC, Fri 04-Jul)
- Trading window: Last close 2026-07-03 08:59 UTC (31h prior, STALE)
- Watchlist: 41 tickers | Tickers processed: 10 | Price anomalies: 1
- Signals emitted: 1 | Signals suppressed: 0 | Ledger entries: 5

## Key Findings
**HVN anomaly — Overbought surge:**
- +6.53% daily move from 2026-07-02 close
- RSI 70.9 (danger zone, overbought)
- BB breakout 105% above 20d midline (22,763)
- 3/4 technical indicators bullish; MACD histogram strong (+222)
- Volume elevated 363% of 30d average (3.22M)
- Risk: Pullback to MA20 support at 22,763 likely
- Action: HOLD, monitor pullback zone

**Macro context:**
- Brent crude: $72.13 (stable)
- Gold: $4,187.3 (stable)
- USD/VND: 26,103 (stable, firm dollar)
- Regime: NEUTRAL (no volatility spike, normal breadth weakness)
- Breadth: Weak (104 advances / 199 declines, ADL -80)

## Metrics (cycle 2026-07-04 16:05 UTC)
| Field | Value |
|---|---|
| tickers_processed | 10 |
| price_anomalies_detected | 1 |
| signals_emitted | 1 |
| signals_suppressed | 0 |
| ledger_entries_written | 5 |
| signal_file_path | docs/signals/price_anomaly_20260704T1605.json |
| exit_status | complete |

## Regime & Thresholds
- Macro regime: NEUTRAL
- Sigma threshold (EOD): 2.0σ
- Volume multiplier (EOD): 2.0x
- Anomaly detection: Price >2σ move + volume spike

## Ledger Updates
1. HVN.md — added 2026-07-04 entry with overbought alert
2. VCB.md — added 2026-07-04 entry, neutral trend
3. VNM.md — added 2026-07-04 entry, weak consolidation
4. FPT.md — added 2026-07-04 entry, downtrend from peak
5. Coverage-state: NOT updated (EOD cycle does not sweep)

## Signal File
Generated: docs/signals/price_anomaly_20260704T1605.json
- Schema: price_anomaly_v1
- Tickers: 10 major holdings (stale EOD prices 2026-07-03 08:59)
- Anomalies: HVN overbought +6.53% | RSI 70.9 | BB 105% breakout
- Regime flag: NEUTRAL across all entries
- Insider activity: No activity detected (HVN, VCB checked)

## Rationale
Market closed; EOD snapshot of stale prices (31h old) from 2026-07-03 close. HVN shows classic overbought reversal setup: RSI 70.9, BB breakout, strong MACD. Single price_anomaly signal warranted on momentum extremes. VCB/VNM/FPT neutral consolidation patterns. All ledgers updated with snapshots. No coverage sweep (not applicable to EOD cycle).

## Provenance
Cowork slot: market-watcher-offhours (16:00Z EOD mode) | Dispatcher: 5e735616-452d-42a2-a615-8c4fb6eb1146
