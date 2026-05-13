# Recon — cafef-index

**Date:** 2026-05-13 04:43 UTC
**Agent:** ops-vps-fetch
**Source URL:** `https://banggia.cafef.vn/stockhandler.ashx?index=true`
**Trigger:** new_source_needed (bootstrap inventory)

## Working Request Recipe

```bash
curl -s \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
  -H 'Accept: application/json,*/*;q=0.8' \
  -H 'Accept-Language: vi-VN,vi;q=0.9,en-US;q=0.8' \
  -H 'Referer: https://cafef.vn/' \
  -L \
  "https://banggia.cafef.vn/stockhandler.ashx?index=true"
```

## HTTP Probe Results

- **Status:** 200 OK
- **Final URL:** `https://banggia.cafef.vn/stockhandler.ashx?index=true`
- **Content-Type:** application/json; charset=utf-8
- **Response time:** 153ms
- **Redirect chain:** none
- **Server:** Microsoft-IIS/10.0 (ASP.NET 4.0.30319)
- **CORS:** `Access-Control-Allow-Origin: *`

## Anti-Bot Assessment

- **Type:** none
- **Evidence:** Direct 200, no Cloudflare, no challenge, no set-cookie. Clean open ASP.NET API endpoint on a CafeF subdomain. No auth headers required.
- **Recommendation:** n/a — plain curl works.

## Page Structure

### JSON Paths (API source)

Returns a JSON array of 5 index objects:

- `[].name` → index name (`"VNINDEX"`, `"HNXINDEX"`, `"HNXUPCOMINDEX"`, `"VN30"`, `"HNX30"`)
- `[].index` → current level as formatted string (e.g. `"1,892.75"`)
- `[].change` → absolute change as string (e.g. `"-8.35"`)
- `[].percent` → percent change as string (e.g. `"-0.44"`)
- `[].volume` → total volume as formatted string (e.g. `"332,396,260"`)
- `[].value` → total value in billions VND as string (e.g. `"10,325.38"`)

### URL Variants

- `?index=true` — returns all 5 major indices
- Likely accepts individual index name params but not confirmed

## Sample Response Excerpt

```json
[{"change":"-8.35","index":"1,892.75","name":"VNINDEX","percent":"-0.44",
"volume":"332,396,260","value":"10,325.38"},
{"change":"2.39","index":"255.67","name":"HNXINDEX","percent":"0.94",
"volume":"40,309,175","value":"721.01"},
{"change":"-0.63","index":"126.58","name":"HNXUPCOMINDEX","percent":"-0.50",
"volume":"32,545,052","value":"718.25"}]
```

## Notes

- This endpoint is used by `fetch-prices.sh` as the index data source (separate from the VPS.com.vn stock API).
- The CafeF RSS feed (`cafef.vn/thi-truong-chung-khoan.rss`) is served behind `server: cf-rp` (Cloudflare Reverse Proxy) but the `banggia.cafef.vn` API subdomain has no Cloudflare layer.
- Payload is small (564 bytes for all 5 indices) — safe to poll frequently.
- Numbers returned as formatted strings with commas — consumers must strip commas before parsing as floats.
