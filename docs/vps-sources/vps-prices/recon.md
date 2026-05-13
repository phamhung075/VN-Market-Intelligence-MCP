# Recon — vps-prices

**Date:** 2026-05-13 04:43 UTC
**Agent:** ops-vps-fetch
**Source URL:** `https://bgapidatafeed.vps.com.vn/getliststockdata/<CODES>`
**Trigger:** new_source_needed (bootstrap inventory)

## Working Request Recipe

```bash
curl -s \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
  -H 'Accept: application/json,*/*;q=0.8' \
  -H 'Accept-Language: vi-VN,vi;q=0.9,en-US;q=0.8' \
  -L \
  "https://bgapidatafeed.vps.com.vn/getliststockdata/VNM,VIC,HPG"
```

## HTTP Probe Results

- **Status:** 200 OK
- **Final URL:** `https://bgapidatafeed.vps.com.vn/getliststockdata/VNM,VIC,HPG`
- **Content-Type:** application/json; charset=utf-8
- **Response time:** 169ms
- **Redirect chain:** none (direct 200)
- **CORS:** `Access-Control-Allow-Origin: *` — no auth required

## Anti-Bot Assessment

- **Type:** none
- **Evidence:** Clean 200 with no Cloudflare headers, no `cf-ray`, no `set-cookie` challenge. Headers are standard security hardening (Helmet.js pattern: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`). `Access-Control-Allow-Origin: *` confirms open API.
- **Recommendation:** n/a — plain curl works. No bypass needed.

## Page Structure

### JSON Paths (API source)

The endpoint returns a JSON array. Each element is a quote object:

- `[].sym` → ticker symbol (e.g. `"VNM"`)
- `[].symCode` → ISIN code (e.g. `"VN000000VNM8"`)
- `[].lastPrice` → last trade price (numeric, in thousands VND — divide by 1000 for VND)
- `[].changePc` → percent change string (e.g. `"1.66"`)
- `[].highPrice` → session high
- `[].lowPrice` → session low
- `[].lot` → total volume (lots)
- `[].avePrice` → VWAP string
- `[].g1`..`[].g7` → bid/ask price|volume|flag pipe-delimited strings (g1-g3 = bids, g4-g7 = asks)
- `[].fBVol` → foreign buy volume (string)
- `[].fBValue` → foreign buy value (string, scientific notation)
- `[].fSVolume` → foreign sell volume (string)
- `[].fSValue` → foreign sell value (string, scientific notation)
- `[].fRoom` → foreign ownership room remaining (string)
- `[].openPrice` → open price
- `[].closePrice` → previous close (string, in full VND e.g. `"60100.0"`)
- `[].boardId` → market board (`"G1"` = HOSE, `"G2"` = HNX)
- `[].marketId` → market identifier (`"STO"`)
- `[].side` → last trade side (`"B"` buy / `"S"` sell)
- `[].sType` → security type (`"S"` = stock, `"E"` = ETF, `"W"` = warrant)

### URL Pattern

- Single or comma-delimited tickers: `/getliststockdata/VNM,VIC,HPG`
- No pagination — pass all desired codes at once

## Sample Response Excerpt

```json
[{"id":2100,"boardId":"G1","marketId":"STO","sym":"VNM","symCode":"VN000000VNM8",
"lastPrice":59.1,"lastVolume":10,"lot":491960,"changePc":"1.66","avePrice":"59.24",
"highPrice":"60.1","lowPrice":"58.7","g1":"59.0|5850|d","g4":"59.1|4960|d",
"fBVol":"22040","fBValue":"1.30593679E7","fSVolume":"89790","fSValue":"5.328819E7",
"fRoom":"106771823.10","openPrice":"60.1","closePrice":"60100.0","side":"B","sType":"S"}]
```

## Notes

- This same endpoint is used by BOTH `vn-price-fetch` AND `vn-foreign-flow` services — foreign flow fields (`fBVol`, `fSVolume`, `fRoom`) are embedded in every quote object.
- `closePrice` is in full VND (e.g. 60100.0), while `lastPrice` / `highPrice` / `lowPrice` appear to be in thousands VND (59.1 = 59,100 VND). Watch unit mismatch.
- Price-fetch service: upstream fetch is healthy. MCP push is failing (38 consecutive failures as of 2026-05-13 04:40 UTC — `cannot reach MCP server`). This is an MCP-side issue, NOT an upstream issue.
- No rate limit observed at probe-time. Deployed scraper fetches every 60s with no throttling concerns.
