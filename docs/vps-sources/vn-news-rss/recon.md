# Recon — vn-news-rss

**Date:** 2026-05-13 04:43 UTC
**Agent:** ops-vps-fetch
**Source URL:** multiple RSS endpoints (see list below)
**Trigger:** new_source_needed (bootstrap inventory)

## Working Request Recipe

```bash
curl -s \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
  -H 'Accept: application/rss+xml,application/xml,text/xml,*/*;q=0.8' \
  -H 'Accept-Language: vi-VN,vi;q=0.9,en-US;q=0.8' \
  -H 'Referer: https://www.google.com/' \
  -L \
  "<RSS_URL>"
```

## HTTP Probe Results — Per Source

| Source | URL | Status | Server | Notes |
|--------|-----|--------|--------|-------|
| cafef-market | `https://cafef.vn/thi-truong-chung-khoan.rss` | 200 | cf-rp (Cloudflare RP) | Session cookie set (laravel_session), RSS returned cleanly |
| cafef-biz | `https://cafef.vn/doanh-nghiep.rss` | 200 (inferred) | cf-rp | Same domain/pattern as cafef-market |
| vnexpress | `https://vnexpress.net/rss/kinh-doanh.rss` | 200 | vne-vn-fe-lv1-other-1 | device_env cookie set, clean RSS |
| vneconomy-stocks | `https://vneconomy.vn/chung-khoan.rss` | 200 | Microsoft-IIS/10.0 | Clean XML, no anti-bot |
| vneconomy-finance | `https://vneconomy.vn/tai-chinh.rss` | 200 | Microsoft-IIS/10.0 | Same pattern |
| vietstock-stocks | `https://vietstock.vn/830/chung-khoan/co-phieu.rss` | 200 | nginx | ASP.NET_SessionId cookie, clean RSS |
| vietstock-insider | `https://vietstock.vn/739/chung-khoan/giao-dich-noi-bo.rss` | 200 (inferred) | nginx | Same pattern |
| vietstock-macro | `https://vietstock.vn/761/kinh-te/vi-mo.rss` | 200 (inferred) | nginx | Same pattern |
| vietnambiz | `https://vietnambiz.vn/chung-khoan.rss` | 200 | Microsoft-IIS/10.0 | Clean RSS |
| vnbusiness | `https://vnbusiness.vn/rss/chung-khoan.rss` | 200 | Microsoft-IIS/10.0 | Clean RSS |
| tuoitre | `https://tuoitre.vn/rss/kinh-doanh.rss` | 200 | openresty | Clean RSS |
| nhandan-economy | `https://nhandan.vn/rss/kinhte-1185.rss` | 200 | (not captured) | Clean per service log |
| nhandan-stocks | `https://nhandan.vn/rss/chungkhoan-1191.rss` | 200 | (not captured) | Clean per service log |
| nld | `https://nld.com.vn/rss/kinh-te/tai-chinh-chung-khoan.rss` | 200 | (not captured) | Clean per service log |

**Confirmed via live service log** (2026-05-13 04:32 UTC): all 14 RSS feeds returning 200 with item counts (20 items each for most sources, 10 for some). Total merged: 245 unique items per cycle.

## Anti-Bot Assessment

- **Type:** none (all sources)
- **Evidence:** All 14 RSS endpoints return 200 with valid XML. CafeF sets a `laravel_session` cookie and sits behind Cloudflare RP (`server: cf-rp`) but the RSS feed itself is delivered without challenge. VietStock sets `ASP.NET_SessionId` cookie but no JS challenge. VnExpress sets a `device_env` cookie.
- **Recommendation:** n/a — current multi-UA rotation with 3-attempt retry logic in `fetch-vn-news.sh` is working. No bypass upgrade needed.

## Page Structure

### XML Paths (RSS 2.0 format)

All sources use standard RSS 2.0:

- `rss/channel/item/title` → article headline
- `rss/channel/item/link` → article URL
- `rss/channel/item/pubDate` → publish timestamp (RFC 822 format)
- `rss/channel/item/description` → summary/excerpt (may contain HTML)
- `rss/channel/item/content:encoded` (optional) → full content (cafef, some others)
- `rss/channel/item/media:content` (optional) → thumbnail URL

## Sample Response Excerpt

```xml
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Thị trường chứng khoán | cafef</title>
    <link>https://cafef.vn/thi-truong-chung-khoan.chn</link>
    <item>
      <title>...</title><link>https://cafef.vn/...</link>
      <pubDate>Wed, 13 May 2026 11:...</pubDate>
    </item>
```

## Notes

- **MCP push endpoint was returning 404** as of 2026-05-13: `PUSH 245 items → /api/push-news http=404`.
  - **Root cause diagnosed 2026-05-13:** Cloudflare tunnel had no ingress rule for `/api/*`. All `/api/push-news` requests hit the catch-all `http_status:404` before reaching mcp-server. The route and handler ARE correctly implemented.
  - **Fix applied:** Added `path: ^/api/` ingress rule in `~/.cloudflared/config.yml`. Tunnel restart required via `ops` agent.
  - **Contract confirmed:** VPS body shape `{ title, url, publishedAt, content, source }` matches handler schema exactly. Heartbeat sentinel `[{"title":"__heartbeat__","url":"","source":"heartbeat",...}]` accepted (handler treats it as a no-op). Verified by `1892b-vps-contract-push.test.ts`.
- CafeF `server: cf-rp` means Cloudflare is in the chain for the main domain but not blocking RSS. If Cloudflare activates managed challenge in future, `cafef.vn` RSS would break first.
- `fetch-vn-news.sh` uses a rotating User-Agent array and 3-attempt retry — this is appropriate for the current source set.
- VietStock RSS sits on a separate nginx server (not the Cloudflare-protected `finance.vietstock.vn`).
