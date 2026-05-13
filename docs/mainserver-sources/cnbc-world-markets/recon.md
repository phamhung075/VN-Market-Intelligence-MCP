# Recon — cnbc-world-markets

**Date:** 2026-05-13 05:00 UTC
**Agent:** ops-mainserver-fetch
**Source URL:** https://www.cnbc.com/world-markets/
**Trigger:** new_source_needed
**Probe origin:** main-server (direct, no VPS proxy)

## Working Request Recipe

```bash
# Web page: 200 OK with clean delivery, no bot challenge
curl -s \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' \
  -H 'Accept: text/html,application/xhtml+xml,*/*' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  --compressed \
  -L \
  "https://www.cnbc.com/world-markets/"

# Quote API: clean JSON, no auth needed
curl -s \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' \
  -H 'Accept: application/json' \
  -H 'Referer: https://www.cnbc.com/' \
  "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=<SYMBOL>&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1"
```

## HTTP Probe Results

- **Status:** 200 OK
- **Final URL:** https://www.cnbc.com/world-markets/
- **Content-Type:** text/html; charset=utf-8
- **Redirect chain:** none (direct 200)
- **Response headers of note:**
  - `akamai-grn: 0.94cbd517.1778648373.2d727028` — Akamai GRN (passive, not blocking)
  - `set-cookie: AWSALB=...` — AWS ALB sticky session
  - `set-cookie: AWSALBCORS=...` — CORS-enabled ALB cookie
  - `set-cookie: region=WORLD` — geo region set to WORLD (France IP → global content)
  - `content-length: 112474` — full page delivered (not truncated)
  - `x-ttl: 30.000` — 30-second Varnish cache TTL
  - `x-varnish` — Varnish cache layer
  - No `datadome`, `_pxhd`, `__cf_bm`, `_abck` cookies

## Anti-Bot Assessment

- **Type:** none (clean delivery — Akamai passive only)
- **Evidence:**
  - HTTP 200 with `content-length: 112474` — full HTML page delivered
  - `akamai-grn` header present but passive (no `_abck` cookie challenge, no redirect to Akamai challenge)
  - No DataDome, PerimeterX, or Cloudflare challenge signals
  - Quote API (`quote.cnbc.com`) → 200 with JSON data, no authentication
  - `region=WORLD` cookie confirms France IP receives global content
- **Geo-blocked from main server:** no
- **Recommendation:** Straightforward curl/requests for both HTML page and quote API. Quote API is the cleanest path for structured data. Technique: none (`header-rotation.md` for politeness).

## Page Structure

### Quote API JSON Paths

- Endpoint: `https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=<SYMBOL>&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1`
- `$.FormattedQuoteResult.FormattedQuote[0].symbol` → ticker
- `$.FormattedQuoteResult.FormattedQuote[0].code` → status code (1=found, 3=not found)
- `$.FormattedQuoteResult.FormattedQuote[0].last` → last price
- `$.FormattedQuoteResult.FormattedQuote[0].change` → price change
- `$.FormattedQuoteResult.FormattedQuote[0].change_pct` → % change
- `$.FormattedQuoteResult.FormattedQuote[0].volume` → trading volume
- `$.FormattedQuoteResult.FormattedQuote[0].open` → opening price

### CNBC Symbol examples

- `SP500` → S&P 500
- `DJ30` → Dow Jones
- `NASDAQ` → NASDAQ Composite
- `FTSE100` → FTSE 100
- `NIKKEI225` → Nikkei 225
- `HK.HSI` → Hang Seng
- `MXAP` → MSCI Asia Pacific (note: returned `code:1` but no price data — may need different symbol)
- Note: VN Index not in CNBC symbol universe — use Yahoo Finance v8 for VN

### DOM Selectors (HTML page — world-markets)

- `<meta property="og:title" content="World Markets"/>` — page title
- `article[class*="Card"]` → news article cards
- `div[class*="QuoteHeader"]` → index quote headers (JS-rendered)
- `a[href*="/markets/"]` → market news links

## Sample Response Excerpt

```json
{"FormattedQuoteResult":{"FormattedQuote":[{"symbol":"MXAP","code":1}]}}
```
(MXAP symbol found but no price fields in response — may need different symbol format or extended parameters)

## Notes

- CNBC quote API is the most accessible structured API found in this probe set — open, no auth, JSON output.
- The HTML page (world-markets) delivers content cleanly but data is partially JS-rendered; headline text is in SSR HTML.
- For live index data from CNBC, the quote API with the correct symbol is reliable.
- VN-specific data is not in CNBC's symbol universe; CNBC is useful for US/global market indices and news text.
- CNBC page og:description: "The latest news on global stock markets, worldwide indices, and new trends in international investing." — confirms scope.
- Akamai is used for CDN/static assets only (passive GRN header) — not Bot Manager challenge mode.
- Rate limit: not enforced for low-frequency polling; observe reasonable intervals.
