# Fetch Systems Status Report
**Generated:** 2026-04-30 19:17 UTC
**Market:** CLOSED (outside 02:00–08:59 UTC Mon–Fri)

---

## VPS Services (Vinahost — 125.212.251.27)

| Service | Status | Description | Data Source | Note |
|---------|--------|-------------|-------------|------|
| `vn-bctc-fetch` | ✅ Healthy | BCTC PDF discovery & queue | SSC portal (geo-blocked) | Uptime OK |
| `vn-sbv-fetch` | ✅ Healthy | FX rates + SBV circulars | Vietcombank XML + SBV | Uptime OK |
| `vn-price-fetch` | ⏸ Idle | Stock prices HOSE/HNX/UPCOM | VnDirect finfo-api | Market closed (expected) |
| `vn-foreign-flow` | ⏸ Idle | Foreign investor buy/sell | HOSE foreign flow API | Market closed (expected) |
| `vn-news-fetch` | ❌ Unhealthy | VN news RSS (10 sources) | CafeF, VnExpress, etc. | 41m uptime — likely restarted |

---

## Data Sources (Circuit Breaker / SLA)

| Source | Status | Location | Description | Data | Note |
|--------|--------|----------|-------------|------|------|
| CafeF RSS | ✅ OK | Server | Vietnamese finance news | News articles | Last success: 11 min ago |
| VnExpress RSS | ✅ OK | Server | General business news | News articles | Last success: 11 min ago |
| VnEconomy RSS | ✅ OK | Server | Economy news | News articles | Last success: 11 min ago |
| nhandan | ✅ OK | Server | State newspaper | News articles | Last success: 11 min ago |
| tuoitre | ✅ OK | Server | General news | News articles | Last success: 11 min ago |
| vietnambiz | ✅ OK | Server | Business news | News articles | Last success: 11 min ago |
| vietstock | ✅ OK | Server | Stock market news | News + prices | Last success: 11 min ago |
| vnbusiness | ✅ OK | Server | Business news | News articles | Last success: 11 min ago |
| nld | ✅ OK | Server | General news | News articles | Last success: 11 min ago |
| HOSE (VnDirect) | ✅ OK | Server | Stock prices | Price + volume | 0 failures |
| HNX | ✅ OK | Server | HNX prices | Price + volume | 0 failures |
| SSC | ✅ OK | Server | Company disclosures | Insider trades, filings | 0 failures |
| Yahoo Finance | ✅ OK | Server | Commodities | Gold, Brent, WTI | 0 failures |
| SBV / Vietcombank | ✅ OK | Server | FX rate | USD/VND | 0 failures |
| Polymarket | ✅ OK | Server | Prediction markets | Probability, volume | 0 failures |
| Congbao | ✅ OK | Server | Gov circulars | Policy signals | 0 failures |
| Reuters RSS | ❌ Down | Server | International news | Global market news | 8 consecutive failures |
| NewsAPI | ❌ Down | Server | Global news | Business/stock news | 8 failures — never succeeded |
| Trading Economics | ❌ Down | Server | Macro indicators | GDP, inflation, global data | 8 failures — never succeeded |
| vnstock (D2D) | ⚠ Rate-limited | Server | Financial statements | Balance sheet, cash flow | Max retries exhausted |
| vnstock (VCB) | ⚠ Rate-limited | Server | Financial statements | Balance sheet, cash flow | Max retries exhausted |
| vnstock (CTG) | ⚠ Rate-limited | Server | Financial statements | Cash flow | Max retries exhausted |

---

## SLA Freshness

| Signal | Age | SLA Threshold | Status | Severity |
|--------|-----|---------------|--------|----------|
| BCTC | 99 min | 360 min | ✅ OK | — |
| SBV FX | 17 min | 30 min | ✅ OK | — |
| Price | 17 min | 10 min | ❌ Breached | CRITICAL |
| News | 43 min | 30 min | ❌ Breached | HIGH |
| Foreign Flow | 257 min | 10 min | ❌ Breached | CRITICAL |

> **Note:** Price + Foreign Flow SLA breaches are **expected** — market is closed. Auto-resolve at next market open (Mon 02:00 UTC).

---

## Cron Jobs (Server — all 34 jobs, last 24h)

| Job | Status | Runs | Avg Duration | Last Run (UTC) |
|-----|--------|------|--------------|----------------|
| `intelligenceCycleJob` | ✅ 100% | 87 | 69.5s | 19:15 |
| `pollNewsJob` | ✅ 100% | 89 | 3.2s | 19:05 |
| `bctcQueueEnricherJob` | ✅ 100% | 79 | 73.6s | 19:15 |
| `askQueueCheckJob` | ✅ 100% | 113 | ~0ms | 19:12 |
| `vpsServiceHealthJob` | ✅ 100% | 271 | 14ms | 19:15 |
| `walCheckpointJob` | ✅ 100% | 41 | 66ms | 19:00 |
| `predictionMarketPollJob` | ✅ 100% | 42 | 1.0s | 19:00 |
| `foreignFlowFetcherJob` | ✅ 100% | 402 | 395ms | 08:59 |
| `vnIndexRefreshJob` | ✅ 100% | 73 | 1.5s | 08:55 |
| `vpsProxyWatchdogJob` | ✅ 100% | 38 | 131ms | 08:50 |
| `price-update-watchdog` | ✅ 100% | 37 | 1ms | 08:50 |
| `alertScanParallelJob` | ✅ 100% | 24 | 514ms | 08:45 |
| `taAlertNotifierJob` | ✅ 100% | 22 | 3ms | 08:45 |
| `ohlcv-staleness-check` | ✅ 100% | 1 | 7ms | 08:15 |
| `marketScanJob:close` | ✅ 100% | 1 | 15.6s | 08:30 |
| `franceSummaryJob` | ✅ 100% | 5 | 59ms | 08:30 |
| `marketScanJob:open` | ✅ 100% | 1 | 18.2s | 02:00 |
| `bctcOverdueCheckJob` | ✅ 100% | 1 | 34ms | 02:00 |
| `morningBriefingJob` | ✅ 100% | 1 | 21.7s | 01:00 |
| `insiderCheckJob` | ✅ 100% | 1 | 678ms | 01:00 |
| `cronHealthAlertJob` | ✅ 100% | 1 | 359ms | 00:00 |
| `imfIndicatorPollerJob` | ✅ 100% | 1 | 345ms | 00:00 |
| `freshnessSlaMonitorJob` | ✅ 100% | 37 | 120ms | 18:30 |
| `pipelineWatchdogJob` | ✅ 100% | 38 | 21ms | 18:30 |
| `bctcPdfPullJob` | ✅ 100% | 35 | 2ms | 18:30 |
| `weatherCheckJob` | ✅ 100% | 3 | 7.0s | 17:00 |
| `bctcReparseJob` | ✅ 100% | 2 | 1ms | 17:38 |
| `summaryJob:monthly` | ✅ 100% | 1 | 48ms | 17:30 |
| `pollNews_all_sources_dark` | ✅ 100% | 9 | ~0ms | 17:30 |
| `trackSessionToolUsageJob` | ✅ 100% | 3 | 18ms | 16:00 |
| `dataAuditJob:daily` | ✅ 100% | 1 | 1.0s | 16:00 |
| `eveningSummaryJob` | ✅ 100% | 1 | 735ms | 15:30 |
| `summaryJob:daily` | ✅ 100% | 1 | 32ms | 15:30 |
| `ohlcv-daily-aggregator` | ✅ 100% | 1 | 260ms | 15:00 |
| `alertDigestJob` | ✅ 100% | 1 | 1.0s | 14:00 |
| `foreignFlowAlertJob` | ✅ 100% | 1 | 172ms | 09:30 |

---

## DB Status

| Metric | Value |
|--------|-------|
| Path | `/app/data/market.db` |
| Size | 66.68 MB |
| WAL | 6.52 MB |
| Uptime | 1h 40m |
| Open circuits | 0 |
| Unresolved errors | 10 (all vnstock rate-limits) |
| Alerts last 24h | 28 total / 16 HIGH+CRITICAL |
| Last alert → Telegram | 17:13 UTC |
| Pending feedback | 21 items |

---

## Summary

| Category | Healthy | Total | Issues |
|----------|---------|-------|--------|
| VPS services | 2 | 5 | `vn-news-fetch` unhealthy; 2 idle (market closed) |
| Data sources | 13 | 16 | Reuters, NewsAPI, TradingEconomics — never succeeded |
| SLA signals | 2 | 5 | Price + ForeignFlow CRITICAL (market closed — expected) |
| Cron jobs | 34 | 34 | All 100% success rate |
| vnstock tickers | — | 3 | D2D, VCB, CTG rate-limited |

### Action Items
1. **Reuters RSS** — 8 consecutive failures, needs endpoint/auth check
2. **NewsAPI** — never succeeded, missing API key or wrong endpoint
3. **Trading Economics** — never succeeded, missing API key or wrong endpoint
4. **vn-news-fetch VPS service** — unhealthy (only 41m uptime), investigate systemd restart loop
5. **vnstock rate-limiting** — D2D, VCB, CTG hitting rate limits; consider adding delay between financial statement fetches
