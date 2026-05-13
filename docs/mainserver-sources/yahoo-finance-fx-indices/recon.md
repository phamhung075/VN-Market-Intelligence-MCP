# Recon — yahoo-finance-fx-indices

**Date:** 2026-05-13 05:00 UTC
**Agent:** ops-mainserver-fetch
**Source URL:** https://query2.finance.yahoo.com/v8/finance/chart/EURUSD=X?interval=1d&range=5d
**Trigger:** new_source_needed
**Probe origin:** main-server (direct, no VPS proxy)

## Working Request Recipe

```bash
curl -s \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' \
  -H 'Accept: application/json' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  -H 'Referer: https://finance.yahoo.com/' \
  "https://query2.finance.yahoo.com/v8/finance/chart/<SYMBOL>?interval=1d&range=5d"
```

## HTTP Probe Results

- **Status:** 200 OK (v8 chart API) | 401 Unauthorized (v7 quote API) | 307→302→200 consent gate (web UI)
- **Final URL (API):** https://query2.finance.yahoo.com/v8/finance/chart/EURUSD=X?interval=1d&range=5d
- **Content-Type:** application/json;charset=utf-8
- **Redirect chain (web UI):** finance.yahoo.com → guce.yahoo.com/consent → consent.yahoo.com/v2/collectConsent (GDPR consent gate from France)
- **Response headers of note:**
  - `server: ATS` — Yahoo ATS server
  - No `datadome`, `_pxhd`, `__cf_bm` cookies on API endpoint
  - Web UI: `GUCS` cookie set via consent gate — GDPR-triggered from EU IP

## Anti-Bot Assessment

- **Type:** none for v8 chart API; login_required for v7 quote API; GDPR consent gate for web UI
- **Evidence:**
  - v8 `/v8/finance/chart/<symbol>` → 200 with full JSON response, no anti-bot headers
  - v7 `/v7/finance/quote` → 401 with `"Unauthorized"` — requires session cookies
  - Web UI → GDPR consent redirect from France IP (not a bot block, geographic consent)
  - No `datadome` cookie, no `_pxhd`, no CF challenge on API
- **Geo-blocked from main server:** no (GDPR consent is not a geo-block; API endpoints bypass it)
- **Recommendation:** Use v8 chart API directly — no authentication needed, no bot protection. Avoid web UI scraping. Technique: none needed (plain requests).

## Page Structure

### JSON Paths (v8 chart API)

- `$.chart.result[0].meta.regularMarketPrice` → current price
- `$.chart.result[0].meta.regularMarketTime` → Unix timestamp of last update
- `$.chart.result[0].meta.currency` → currency code
- `$.chart.result[0].meta.symbol` → ticker symbol
- `$.chart.result[0].meta.exchangeName` → exchange (e.g. CCY for FX)
- `$.chart.result[0].meta.fiftyTwoWeekHigh` / `fiftyTwoWeekLow` → 52-week range
- `$.chart.result[0].meta.regularMarketDayHigh` / `regularMarketDayLow` → intraday range
- `$.chart.result[0].timestamp[]` → array of Unix timestamps
- `$.chart.result[0].indicators.quote[0].close[]` → array of close prices

### Symbol patterns

- FX rates: `EURUSD=X`, `USDVND=X`, `USDJPY=X`, `GBPUSD=X`
- Indices: `^GSPC` (S&P 500), `^DJI`, `^IXIC`, `^N225`, `^HSI`, `000001.SS` (Shanghai)
- Interval options: `1m`, `5m`, `15m`, `1h`, `1d`, `1wk`, `1mo`
- Range options: `1d`, `5d`, `1mo`, `3mo`, `6mo`, `1y`, `2y`, `5y`, `10y`, `ytd`, `max`

## Sample Response Excerpt

```json
{"chart":{"result":[{"meta":{"currency":"USD","symbol":"EURUSD=X","exchangeName":"CCY",
"regularMarketTime":1778648482,"regularMarketPrice":1.1738,
"fiftyTwoWeekHigh":1.2024,"fiftyTwoWeekLow":1.1141,
"regularMarketDayHigh":1.1745,"regularMarketDayLow":1.1736,
"regularMarketVolume":0,"longName":"EUR/USD"}}]}}
```

## Notes

- v8 chart API is the cleanest Yahoo Finance endpoint — fully open, no crumb or session needed.
- v7 quote API now requires authentication (401) — do not use.
- Web UI returns GDPR consent gate from France/EU IP — irrelevant since we use API directly.
- VN-specific tickers on Yahoo Finance (HOSE stocks) use `.VN` suffix (e.g. `VCB.VN`) but availability is patchy — verify per ticker.
- `query1` and `query2` are load-balanced mirrors — both work interchangeably.
- No rate limiting observed for low-frequency polling (tested at <10 req/min).
