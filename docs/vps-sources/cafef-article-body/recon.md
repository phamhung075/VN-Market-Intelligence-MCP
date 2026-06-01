# Recon — cafef-article-body

**Date:** 2026-06-01 08:50 UTC
**Agent:** ops-vps-fetch
**Source URL:** https://cafef.vn/ (RSS + article pages)
**Trigger:** new_source_needed (sprint VPS-NEWS-CAFEF-VNECO — "info pages" / article body)

---

## OVERLAP VERDICT — READ THIS FIRST

**The existing pipeline ALREADY covers cafef RSS.** `/root/fetch-vn-news.sh` running under
`vn-news-fetch.service` fetches two cafef RSS feeds every 15 minutes:
- `https://cafef.vn/thi-truong-chung-khoan.rss` (market, 50 items)
- `https://cafef.vn/doanh-nghiep.rss` (business, 50 items)

**CRITICAL BUG FOUND:** The script's `is_blocked()` function matches `robot` as a keyword
for anti-bot detection. Vietnamese tech articles regularly contain "robot" in their titles
(e.g., "robot hình người" = humanoid robot). When any of the 50 RSS items contains the word
"robot" in its title or description, the **entire cafef feed is dropped silently** —
`cafef-market: 0 items` and `cafef-biz: 0 items` result. This false-positive has been
occurring since at least 2026-04-22 (earliest log entry showing the pattern).

**Both cafef RSS feeds: 200 OK / no geo-block / no real Cloudflare challenge** from both
VPS (Vietnam) and France host. The mcp-server `apps/mcp-server/src/infrastructure/fetchers/cafef.ts`
direct axios path is also unblocked from France. NO VPS routing needed for RSS.

**Article body is NOT in scope of the current pipeline** — RSS delivers title + 500-char
description excerpt only. Full article body requires a separate HTTP fetch to the article URL.

---

## Q1 — DIRECT-PATH HEALTH (from France / non-VN IP)

| Feed | Status | Server | Latency | Anti-bot |
|------|--------|--------|---------|---------|
| `https://cafef.vn/thi-truong-chung-khoan.rss` | **200 OK** | cf-rp (Cloudflare RP) | 1.67s | none — clean RSS XML |
| `https://cafef.vn/doanh-nghiep.rss` | **200 OK** | cf-rp | ~1.6s | none |
| Article page (probe) | **200 OK** | cf-rp | 0.24s (VPS) | none |

**Conclusion:** The direct France→cafef.vn path is NOT geo-blocked. RSS and article pages
both return 200 clean HTML/XML from any IP. No managed CF challenge activated.
Moving cafef RSS to VPS is NOT required for availability.

---

## Q2 — EXISTING VPS PIPELINE OVERLAP

Script: `/root/fetch-vn-news.sh`
Loop wrapper: `/root/fetch-vn-news-loop.sh`
Service: `vn-news-fetch.service` (systemd, enabled, `active running` since 2026-05-13)
Schedule: **every 15 minutes** via `sleep 900` in the loop wrapper (no cron, no timer)

**cafef feeds in script:**
```bash
CAFEF_JSON=$(fetch_rss  "cafef"  "https://cafef.vn/thi-truong-chung-khoan.rss")
CAFEF_BIZ=$(fetch_rss   "cafef"  "https://cafef.vn/doanh-nghiep.rss")
```

**Full feed list (14 feeds + 1 placeholder):**
1. cafef — thi-truong-chung-khoan.rss
2. cafef — doanh-nghiep.rss
3. vnexpress — rss/kinh-doanh.rss
4. vneconomy — chung-khoan.rss
5. vneconomy — tai-chinh.rss
6. vietstock — co-phieu.rss
7. vietstock — giao-dich-noi-bo.rss
8. vietstock — vi-mo.rss
9. vietnambiz — chung-khoan.rss
10. vnbusiness — rss/chung-khoan.rss
11. baodautu — (skipped, AJAX-only, no RSS)
12. tuoitre — rss/kinh-doanh.rss
13. nhandan — rss/kinhte-1185.rss
14. nhandan — rss/chungkhoan-1191.rss
15. nld — rss/kinh-te/tai-chinh-chung-khoan.rss

**End-to-end status (2026-06-01 08:36 UTC run):**
- cafef-market: **0 items** (false-positive block — see BUG below)
- cafef-biz: **0 items** (false-positive block)
- vneconomy-stocks: 20 items (healthy)
- vneconomy-finance: 20 items (healthy)
- Total merged push: 145 items → `/api/push-news` http=200

**BUG: `is_blocked()` false-positive on "robot"**
The detection function in `fetch-vn-news.sh` (line ~50):
```bash
is_blocked() {
  ...
  echo "$body" | grep -qi "captcha|robot|cloudflare|access denied|..." && return 0
  ...
}
```
The word "robot" appears in Vietnamese financial news titles (humanoid robot investment stories
are common in 2026). When a cafef RSS item contains "robot" in its title or description,
`is_blocked()` returns true and the entire fetch is retried then abandoned.

The bug has been producing `cafef-market: 0 items` intermittently since at least 2026-04-22.
The same false-positive pattern affects vnexpress and nhandan-economy when "robot" appears.

**Fix required:** Scope the anti-bot grep to the HTTP headers/status line only, or
anchor the pattern to known CF challenge page patterns (not bare word matching on body content).

---

## Q3 — ARTICLE BODY FEASIBILITY

### cafef.vn article pages

**Working request recipe (HTTP-only, no browser):**
```bash
curl -s --compressed \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' \
  -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' \
  -H 'Accept-Language: vi-VN,vi;q=0.9,en-US;q=0.8' \
  -H 'Referer: https://cafef.vn/thi-truong-chung-khoan.chn' \
  -L \
  "https://cafef.vn/<article-slug>.chn"
```

**HTTP probe results:**
- Status: 200 OK
- Server: cf-rp (Cloudflare reverse proxy — not challenging)
- Content-Type: text/html; charset=utf-8
- Latency: 0.24s from VPS, ~1.7s from France
- Anti-bot: none — no CF JS challenge, no managed challenge headers
- Notable: sets `laravel_session` cookie (session-only, not required for subsequent requests)

**Article body DOM structure:**
```
div#mainContent
  └── div.detail-content.afcbc-body[data-role="content"]
        └── p, div — article paragraphs
```

Primary CSS selectors for article text extraction:
- `div.detail-content` or `div[data-role="content"]` → full article body HTML
- `div#mainContent` → article container (includes sidebar tickers)
- `h1.title` or `<title>` tag → article headline
- `meta[property="article:published_time"]` → publish datetime (ISO format)
- `meta[property="article:author"]` or `meta[name="author"]` → author name

**Sample extracted text (from https://cafef.vn/sacombank-chinh-thuc-doi-ten-... ):**
```
Ngân hàng TMCP Sài Gòn Thương Tín (SACOMBANK – mã STB) vừa thông báo đã được Ngân hàng
Nhà nước (NHNN) chấp thuận đổi tên thương mại từ "Sài Gòn Thương Tín" thành "Sài Gòn Tài
Lộc" theo Quyết định số 36/QĐ-QLGS4 ngày 01/6/2026...
```

**Pagination / listing URLs:**
- Market news listing: `https://cafef.vn/thi-truong-chung-khoan.chn`
- Business news listing: `https://cafef.vn/doanh-nghiep.chn`
- Article URL pattern: `https://cafef.vn/<slug>-<numeric-id>.chn`
- No AJAX/JSON pagination API found — listing pages are server-rendered HTML

**Anti-bot challenges:** none. Standard curl with a browser UA is sufficient.

---

## Working Request Recipe — article body extraction

```bash
# From VPS (or France — both work identically)
ARTICLE_URL="https://cafef.vn/sacombank-chinh-thuc-doi-ten-thanh-ngan-hang-sai-gon-tai-loc-188260601151226195.chn"

curl -s --compressed \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' \
  -H 'Accept: text/html,*/*' \
  -H 'Accept-Language: vi-VN,vi;q=0.9' \
  -H 'Referer: https://cafef.vn/thi-truong-chung-khoan.chn' \
  -L "$ARTICLE_URL" | python3 -c "
import sys, re
html = sys.stdin.read()
# Extract article body
idx = html.find('data-role=\"content\"')
if idx < 0: idx = html.find('id=\"mainContent\"')
chunk = html[idx:idx+20000]
text = re.sub(r'<[^>]+>', ' ', chunk)
text = re.sub(r'\s+', ' ', text).strip()
print(text[:3000])
"
```

---

## Notes

- CafeF is behind Cloudflare RP (`server: cf-rp`) but this is a caching/CDN layer only —
  no JS challenge or managed challenge is activated for RSS or article pages.
- The `laravel_session` cookie set on first request is session-scoped and not required for
  article fetching. Stateless curl works.
- RSS `<content:encoded>` field on cafef contains the article lead paragraph (often 200-400
  chars). For short news items this may be sufficient without a full article fetch.
- Latency: VPS 0.24–0.31s vs France 1.67s — VPS gives ~5x lower latency due to regional
  proximity, but both paths are functional.
- **RECOMMENDATION:** Fix the `is_blocked()` false-positive in `fetch-vn-news.sh` FIRST
  (dev-vps-crawls task). The RSS path already exists end-to-end. Full article body scraping
  is only needed if RSS content is insufficient for the use case.
