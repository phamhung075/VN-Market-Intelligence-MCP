# Market Watcher — Notebook
**Last updated:** 2026-07-03 20:18 UTC | **Sprint:** LIVE

## Cycle Summary (20:00 UTC offhours)
- Market: CLOSED (outside 02:00–08:59 UTC)
- Trading window: Last close 2026-07-03 08:59 UTC
- Watchlist: 41 tickers | Stocks analyzed: 1 | Anomalies detected: 1
- Signals emitted: 0 | Signals suppressed: 1 (duplicate guard)
- Coverage refresh: None required (all current from EOD 16:06 UTC)
- Sweep tickers: 0 (no stale > 48h)

## Key Analysis
**HVN (Vietnam Airlines) — offhours reanalysis**
- Intraday move: +6.53% (25,300 from 23,750)
- Volume: 3.22M (3.6× average) — remains elevated
- Technical: RSI 70.9 (overbought) | MACD positive | 3/4 bullish | BB breakout (105%)
- Move sigma: ~2.4σ — borderline above 2.5σ offhours floor
- **Status: SUPPRESSED** — off-hours duplicate guard (AutoCure c47)
  - Signal already emitted during market hours (HIGH alerts 08:40-08:58 UTC)
  - Price unchanged from close (no new intraday move in offhours)
  - Per cycle.md: prevent re-emission of stale EOD pricing

**GAS (oil & gas)** — EOD close 75,300 (-2.59%)
- Already analyzed in EOD cycle (16:00 UTC, signal id=8404)
- No new price movement (unchanged in offhours)

## Metrics (cycle 2026-07-03 20:18 UTC)
| Field | Value |
|---|---|
| items_fetched | 1 |
| signals_emitted | 0 |
| signals_suppressed | 1 |
| sweep_tickers_forced | 0 |
| coverage_state_updated | no |
| exit_status | complete |

## Regime & Thresholds
- Regime: NEUTRAL (macro backdrop)
- Sigma threshold floor (offhours): 2.5σ
- Duplicate guard: active

## Next cycle
Scheduled: 2026-07-04 02:05 UTC (market hours preopen)
