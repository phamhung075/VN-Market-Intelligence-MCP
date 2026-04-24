---
agents: news-scout, market-watcher
trigger: source_quality, data_freshness, stale_news
---

# Reuters + Trading Economics RSS Down (4h+ stale)

## Issue

Reuters RSS + Trading Economics RSS both stale as of 2026-04-24T05:36 UTC.
- Last successful fetch: 2026-04-24T01:36 (4h ago)
- Consecutive failures: 33 each
- Status: Circuit breaker may transition to OPEN if failures continue

## Impact

- Global macro signals (Fed, oil, trade policy) may be missed
- 15-min news cycle incomplete in market hours
- VPS vn-news-fetch service (Vinahost) still active; assume Reuters/Trading are geo-blocked from VPS as well

## Action

1. Check vn-news-fetch.service logs on Vinahost (`ssh root@$VINAHOST_IP`)
2. If Reuters/Trading services are down: escalate to VPS provider
3. If geo-block persists: consider fallback aggregators (Bloomberg, MarketWatch)
4. Next check: 2026-04-24T09:00 UTC (after market close)