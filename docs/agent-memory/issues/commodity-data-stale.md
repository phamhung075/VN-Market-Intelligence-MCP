---
agents: news-scout, developer
trigger: commodity, stale-data, macro
---

# Commodity price data 4 days stale

## Status

**Staleness**: 103.4 hours (4 days old)
**Last Update**: ~2026-04-20
**Impact Score**: MEDIUM — affects macro macro analysis (oil/gold signals)

## Detection

`get_system_status()` reports:
- gold_usd_oz: 4879.6 (859 points) — last fetch 4 days ago
- brent_crude_usd: 90.38 (825 points) — last fetch 4 days ago

## Root Cause

- Yahoo Finance circuit breaker has 2 failures but is marked OK
- Commodity fetch may be scheduled but not executing
- Or commodity source (Yahoo/IEX) is returning stale cached values

## Impact

- Macro signals for oil/gold sectors are unreliable
- GAS/REE/PC1 signals depend on oil/commodity thresholds
- Alerts on commodity volatility cannot fire

## Action Required

1. Check `src/scheduler/intelligenceCycleJob.ts` — is commodity fetch enabled?
2. Verify Yahoo Finance endpoint health (recent 404 errors on symbol lookup)
3. Consider fallback commodity source (IEX Cloud, Quandl)
4. If using VPS: add commodity fetcher to `vps-scripts/` (Vinahost is geo-located)
