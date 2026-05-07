# Alert Commander — 2026-05-06 Session Log

## Cycle (21:38–21:50 UTC)
**Status:** COMPLETED | Market: CLOSED (off-hours)

---

## Bootstrap
- 3 agent signals received
- Market context loaded
- System status: OK (10 open alerts)

## Macro Regime
- **Regime:** NEUTRAL (Global Liquidity)
- **Carry:** FII_OUTFLOW_RISK (VND spread: -0.33%)
- **Pivot window:** false (next: June 2026)
- **FOMC:** 2026-05-07 (not pivot window event)

Thresholds (NEUTRAL): urgent_news >= 0.60 | verified_chain >= 0.80 | chain_catalyst >= 0.75

## Signal Matrix

| ID | Type | Ticker | Confidence | Threshold | Decision |
|----|------|--------|------------|-----------|----------|
| 2430 | urgent_news | ACB | 0.50 | 0.60 | SUPPRESSED |
| 2431 | urgent_news | HCM | 0.50 | 0.60 | SUPPRESSED |
| 2433 | urgent_news | KDH | 0.50 | 0.60 | SUPPRESSED |

- Price-validation override: not triggered (no matching price_anomaly from market-watcher)
- chain_catalyst: none in bootstrap

## Dispatch
- **MARKET:** no alerts fired
- **WORK:** sent cycle summary (3 signals, 0 fired, 3 suppressed)
- **BUG:** no errors

## Context Notes (not firing)
- Brent $101.78 (-3σ below 20d avg $110.57) — watch GAS/POW/HVN
- HCM +6.95% price_surge (FTSE inclusion catalyst) — conviction too low (0.50 < 0.60)
- KDH: VinaCapital selling (impact_score=9) — bearish institutional, below threshold
- Gold $4,703/oz: risk-off elevated

## Next Cycle
- Schedule: ~23:00 UTC
