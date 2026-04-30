# Fetch Systems Status Report
**Generated:** 2026-05-01 (post-fix)
**Previous report:** fetch-systems-status-2026-04-30.md

---

## Fixes Applied This Session

| Task | Issue | Fix | Status |
|------|-------|-----|--------|
| ops | `vn-news-fetch` OOM restart loop | Added `timeout 600` wrapper + RAM guard (skip Playwright if free RAM < 400 MB) | ✅ Deployed to VPS |
| ops | `vn-reuters-fetch` dead URLs | Decommissioned service (`systemctl disable`) — MCP fetches Google News directly | ✅ Deployed to VPS |
| dev | vnstock concurrent rate-limits (D2D, VCB, CTG) | Replaced `Promise.all` (7 concurrent) with sequential awaits in `fetchVnstockSnapshot` | ✅ Merged |
| dev | Disabled sources counted as failures | `SourceHealthTracker` gains `"disabled"` status; unconfigured sources no longer increment failure counter | ✅ Merged |
| dev | Trading Economics deploy placeholder `__TE_API_KEY__` | `deploy-vinahost.sh` now substitutes key via sed; script guards exit 0 on empty key | ✅ Merged |
| dev | NewsAPI 90 req/day smart limit | `newsapiRateLimit.ts` — 90/day cap + 30-min interval → max ~48 calls/day | ✅ Merged |
| dev | Trading Economics Chromium scraper | `tradingEconomicsChromium.ts` — Puppeteer scraper for indicators (6h cache) + news feed (30m cache) | ✅ Merged |
| ops | Chromium missing from Docker image | Dockerfile: `apt-get install chromium chromium-common fonts-liberation libxss1` on Debian trixie | ✅ Merged + Pushed |

---

## VPS Services (Vinahost — 125.212.251.27)

| Service | Status | Description | Data Source | Note |
|---------|--------|-------------|-------------|------|
| `vn-bctc-fetch` | ✅ Healthy | BCTC PDF discovery & queue | SSC portal (geo-blocked) | — |
| `vn-sbv-fetch` | ✅ Healthy | FX rates + SBV circulars | Vietcombank XML + SBV | — |
| `vn-price-fetch` | ⏸ Idle | Stock prices HOSE/HNX/UPCOM | VnDirect finfo-api | Market closed (expected) |
| `vn-foreign-flow` | ⏸ Idle | Foreign investor buy/sell | HOSE foreign flow API | Market closed (expected) |
| `vn-news-fetch` | ✅ Fixed | VN news RSS (10 sources) | CafeF, VnExpress, etc. | OOM fix applied — timeout 600 + RAM guard |
| `vn-reuters-fetch` | 🗑 Decommissioned | Reuters news | feeds.reuters.com (dead) | MCP fetches Google News directly |

---

## Data Sources

| Source | Status | Location | Description | Data | Note |
|--------|--------|----------|-------------|------|------|
| CafeF RSS | ✅ OK | Server | Vietnamese finance news | News articles | — |
| VnExpress RSS | ✅ OK | Server | General business news | News articles | — |
| VnEconomy RSS | ✅ OK | Server | Economy news | News articles | — |
| nhandan | ✅ OK | Server | State newspaper | News articles | — |
| tuoitre | ✅ OK | Server | General news | News articles | — |
| vietnambiz | ✅ OK | Server | Business news | News articles | — |
| vietstock | ✅ OK | Server | Stock market news | News + prices | — |
| vnbusiness | ✅ OK | Server | Business news | News articles | — |
| nld | ✅ OK | Server | General news | News articles | — |
| HOSE (VnDirect) | ✅ OK | Server | Stock prices | Price + volume | — |
| HNX | ✅ OK | Server | HNX prices | Price + volume | — |
| SSC | ✅ OK | Server | Company disclosures | Insider trades, filings | — |
| Yahoo Finance | ✅ OK | Server | Commodities | Gold, Brent, WTI | — |
| SBV / Vietcombank | ✅ OK | Server | FX rate | USD/VND | — |
| Polymarket | ✅ OK | Server | Prediction markets | Probability, volume | — |
| Congbao | ✅ OK | Server | Gov circulars | Policy signals | — |
| **Trading Economics** | ✅ Fixed | Server | VN macro indicators + news feed | GDP 8.02%, CPI 4.65%, Rate 4.5% | Chromium scraper (puppeteer-core), 6h indicator cache, 30m news cache |
| **NewsAPI** | ✅ Fixed | Server | Global news | Business/stock news | 90 req/day cap + 30-min interval. Needs `NEWSAPI_API_KEY` in `.env` |
| Reuters RSS | ✅ OK | Server | International news | Google News RSS | Fetched directly by MCP (VPS service decommissioned) |
| vnstock (D2D/VCB/CTG) | ✅ Fixed | Server | Financial statements | Balance sheet, cash flow | Sequential fetches, no more concurrent flood |

---

## SLA Freshness (at time of check — market closed)

| Signal | SLA | Note |
|--------|-----|------|
| BCTC | 360 min | OK |
| SBV FX | 30 min | OK |
| Price | 10 min | CRITICAL breach expected (market closed) |
| News | 30 min | HIGH breach — fixed by `vn-news-fetch` stabilization |
| Foreign Flow | 10 min | CRITICAL breach expected (market closed) |

---

## Remaining Action Items

| Item | Priority | Notes |
|------|----------|-------|
| Add `NEWSAPI_API_KEY` to `.env` | Medium | User has key — needs to add to env file |
| Add `TRADING_ECONOMICS_API_KEY` to `.env` | Low | Only needed if paid API path desired; Chromium scraper works without it |
| Trading Economics news SPA OOM on container | Low | `fetchTradingEconomicsNews()` returns `[]` when container under memory pressure; indicators scraper works fine. Monitor in production. |
| Add `vn-reuters-fetch` removal to `deploy-vinahost.sh` cleanup | Low | Service is disabled on VPS but deploy script may try to re-enable on next deploy |
