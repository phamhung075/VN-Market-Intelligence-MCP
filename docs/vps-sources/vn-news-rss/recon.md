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

## Incident — FIX-NEWS-VPS-CRASH-LOOP (2026-06-09)

### Crash signature

**False-UNHEALTHY + real news blackout.** Not a service crash.

Two independent bugs both contributed to the recurring "vn-news-fetch UNHEALTHY" reports:

**Bug A — Timestamp format mismatch in `vpsHealthPoller.ts` (dev-zone fix required)**

`DEFAULT_FRESHNESS_CONFIGS` for `vn-news-fetch` uses this SQL to compute freshness:
```sql
SELECT MAX(latest_at) AS latest_at FROM (
  SELECT MAX(pushed_at) AS latest_at FROM vps_push_log WHERE service='news' AND status='ok'
  UNION ALL
  SELECT MAX(created_at) AS latest_at FROM rag_analyses
)
```
`vps_push_log.pushed_at` format: `2026-06-09 01:44:42` (space-separated, no TZ suffix)
`rag_analyses.created_at` format: `2026-06-09T01:28:43.297Z` (ISO 8601 with `T` and `Z`)

SQLite MAX() does lexicographic string comparison. ASCII `T` (84) > ASCII ` ` (32), so `2026-06-09T01:28:43.297Z` always sorts AFTER `2026-06-09 01:44:42` regardless of which is chronologically later.

**Effect:** The health query always returns the most-recent `rag_analyses` timestamp, ignoring more-recent heartbeat pushes in `vps_push_log`. When the VPS sends heartbeat sentinels (no new articles = no `rag_analyses` rows created), the health check ages from the last `rag_analyses` entry, not from the last push. This causes false-UNHEALTHY after 30 minutes of no new articles — which happens every early morning (03:00–09:00 VN).

**Evidence:** At 2026-06-09T02:05Z, vps_service_health showed `last_successful_run=2026-06-09T01:28:43.297Z` (rag_analyses). But vps_push_log had entries at 01:44:42 and 02:00:49 (heartbeats). The broken MAX returned 01:28:43 (rag_analyses, 2177s stale = UNHEALTHY), not 02:00:49 (push_log, 264s stale = HEALTHY).

**Fix (dev-zone — apps/mcp-server/src/domain/services/vpsHealthPoller.ts):**
Replace string MAX with epoch-based comparison:
```sql
SELECT datetime(MAX(unixepoch(latest_at)), 'unixepoch') AS latest_at FROM (
  SELECT MAX(pushed_at) AS latest_at FROM vps_push_log WHERE service='news' AND status='ok'
  UNION ALL
  SELECT MAX(created_at) AS latest_at FROM rag_analyses
)
```
Verified correct in SQLite: `MAX(unixepoch())` picks vps_push_log 03:05:09 over rag_analyses 01:28:43.

---

**Bug B — Cursor jump from future-dated pubDate (VPS-side fix APPLIED)**

Some RSS sources (confirmed: vietstock-macro, vneconomy) publish articles with `pubDate` in VN local time (+07:00) but without the `+0700` TZ offset. Example: `pubDate: Mon, 08 Jun 2026 09:09:00` — a Python parser reads this as `09:09:00 UTC` (actually `02:09:00 UTC`). The cursor advances to `09:09 UTC`, skipping all articles published between `02:09 UTC` and `09:09 UTC` (7 hours of news).

**Effect:** Recurring cursor jumps of 3-10 hours, 1-3 times per day. Causes genuine news gaps of 2-6 hours. The service runs but pushes 0 real items (only heartbeats). When combined with Bug A, the health check sees the stale `rag_analyses` epoch and flips to UNHEALTHY.

**Cursor jump frequency (Jun 01-09):** 23 confirmed jumps >3h. Worst: +494,536h jump on Jun 01 from a malformed epoch timestamp.

**VPS fix APPLIED 2026-06-09T03:30Z:** Added future-date guard in `/root/fetch-vn-news.sh` (lines 372-381):
```bash
NOW_EPOCH=$(date -u +%s)
MAX_ALLOWED_CURSOR=$(( NOW_EPOCH + 1800 ))
if [[ "$NEW_CURSOR" =~ ^[0-9]+$ ]] && [ "$NEW_CURSOR" -gt "$MAX_ALLOWED_CURSOR" ]; then
  echo "$(TS) [NEWS  ] WARN  cursor capped..." >> "$LOG"
  NEW_CURSOR="$MAX_ALLOWED_CURSOR"
fi
```
Cap: cursor cannot advance more than 30 min into the future. This blocks the +7h TZ confusion while allowing legitimate publish-ahead scheduling.

Backup: `/root/fetch-vn-news.sh.bak-20260609`

**AC:** service HEALTHY >6h with no cursor jumps >30min, no false-UNHEALTHY.

---

## Notes

- **MCP push endpoint was returning 404** as of 2026-05-13: `PUSH 245 items → /api/push-news http=404`.
  - **Root cause diagnosed 2026-05-13:** Cloudflare tunnel had no ingress rule for `/api/*`. All `/api/push-news` requests hit the catch-all `http_status:404` before reaching mcp-server. The route and handler ARE correctly implemented.
  - **Fix applied:** Added `path: ^/api/` ingress rule in `~/.cloudflared/config.yml`. Tunnel restart required via `ops` agent.
  - **Contract confirmed:** VPS body shape `{ title, url, publishedAt, content, source }` matches handler schema exactly. Heartbeat sentinel `[{"title":"__heartbeat__","url":"","source":"heartbeat",...}]` accepted (handler treats it as a no-op). Verified by `1892b-vps-contract-push.test.ts`.
- CafeF `server: cf-rp` means Cloudflare is in the chain for the main domain but not blocking RSS. If Cloudflare activates managed challenge in future, `cafef.vn` RSS would break first.
- `fetch-vn-news.sh` uses a rotating User-Agent array and 3-attempt retry — this is appropriate for the current source set.
- VietStock RSS sits on a separate nginx server (not the Cloudflare-protected `finance.vietstock.vn`).
