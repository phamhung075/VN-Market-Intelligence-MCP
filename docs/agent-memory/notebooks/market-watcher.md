# Market Watcher — Notebook

**Last updated:** 2026-05-06 18:46 UTC | **Sprint:** 1846

## Current state

Last successful cycle: 2026-05-06 18:45–18:46 UTC (post-market analysis)
- 26 stocks analyzed, 2 price anomalies (POW 4.5σ, HCM 5.6σ), 2 volume spikes, 4 chain confirmations
- Regime: NEUTRAL | Carry: FII_OUTFLOW_RISK

## Last session summary

- POW: +6.69%, 38.45M shares (7.7x avg volume), utilities sector leader
- HCM: +8.38%, 26.25M shares (6.2x avg volume), securities sector leader
- Oil (Brent): -3σ below mean → CRITICAL alert
- Schema validation error on `post_agent_signal` blocked 3 price_anomaly signals (HCM, POW, VRE)

## Known patterns / preferences

- EOD cycle scheduled for 16:00 UTC
- Requires: `get_watchlist()`, `get_price_history()`, `get_technical_indicators()`, `get_insider_signals()`
- Outputs: Ledger entries, Telegram MARKET channel summary
- post_agent_signal schema issue: price_anomaly payload missing required field `root` (linked to TASK-1365)
