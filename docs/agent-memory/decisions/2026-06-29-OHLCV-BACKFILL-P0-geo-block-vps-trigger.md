# DJ-GATE-1 — OHLCV-BACKFILL-P0: Geo-block Discovery → VPS Trigger Architecture

**Date:** 2026-06-29  
**Task:** OHLCV-BACKFILL-P0 (Sprint MARKET-INDICATOR-DEPTH-P0)  
**Agent:** dev-mcp-server (session d3292ca4)

---

## Decision

`ohlcvHistoryBackfillJob.ts` production `defaultFetchFn` is a **no-op** that delegates data fetching to the VPS-mediated queue trigger. Direct external API calls from Docker/France are geo-blocked.

---

## Context

The handoff specified "VPS VnDirect dchart endpoint" as the data source. Two direct API sources were probed from Docker (France):

| Endpoint | Result |
|----------|--------|
| `api-finfo.vndirect.com.vn/v4/stock_prices?code=ACB` | Geo-blocked — returns all-market snapshot (today's ~750 tickers), ignores `?code` filter |
| `apipubaws.tcbs.com.vn/stock-insight/v2/stock/bars-long-term` | HTTP 404 "Service not found" from Docker |

Both are accessible from VPS (Vietnam) but blocked from France/Docker. The VPS `fetch-ohlcv-backfill.sh` uses TCBS and works correctly (confirmed: 47-48 bars per ticker in DB from prior 60-day VPS run).

---

## Rejected Alternatives

1. **Direct TCBS fetch from France** — HTTP 404, geo-blocked. Produces no data.
2. **Direct VnDirect from France** — Returns all-market snapshot regardless of ticker param. Writing it would contaminate DB with 750 today-dated rows per ticker request.
3. **VPS proxy endpoint** — Would require adding a new HTTP endpoint on VPS to proxy-fetch TCBS by ticker. Out of scope for this sprint.

---

## Chosen Architecture

```
ohlcvHistoryBackfillJob cron (01:40 UTC)
  → Check daily_ohlcv depth per ticker
  → If any ticker < 500 bars: INSERT ohlcv_backfill_queue (done=0)
  
VPS poll (cron, every N min)
  → GET /api/ohlcv-backfill-queue → {pending: true}
  → Run fetch-ohlcv-backfill.sh DAYS=730
  → For each ticker: TCBS fetch → POST /api/push-ohlcv-history
  → POST /api/ohlcv-backfill-done → done=1
```

Test path uses injectable `fetchFn` to exercise the full `writeOhlcvBatch` SSOT pipeline (unit guard, normalizer, idempotent upsert). Production relies on VPS push via `/api/push-ohlcv-history`.

---

## Change Evidence

- `vps-scripts/fetch-ohlcv-backfill.sh` DAYS default: 60 → 730
- Queue trigger inserted: id=451 done=0 at 2026-06-29 21:44:27
- Tests: 10/10 GREEN (22 expect() calls)
- TSC: clean (exit 0)
- toolCount=166, schedulerCount=80
