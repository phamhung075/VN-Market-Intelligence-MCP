# Recon — vneconomy-article-body

**Date:** 2026-06-01 08:50 UTC
**Agent:** ops-vps-fetch
**Source URL:** https://vneconomy.vn/ (RSS + article pages)
**Trigger:** new_source_needed (sprint VPS-NEWS-CAFEF-VNECO — "info pages" / article body)

---

## OVERLAP VERDICT — READ THIS FIRST

**The existing pipeline ALREADY covers vneconomy RSS.** `/root/fetch-vn-news.sh` running under
`vn-news-fetch.service` fetches two vneconomy feeds every 15 minutes:
- `https://vneconomy.vn/chung-khoan.rss` (stocks, 60 items — currently healthy, 20 items/cycle)
- `https://vneconomy.vn/tai-chinh.rss` (finance, 60 items — currently healthy, 20 items/cycle)

These feeds are working correctly in every cycle. No false-positive block issue affects vneconomy
at the time of this recon (the is_blocked() "robot" false-positive only triggered for vneconomy
occasionally when "robot" appeared in its feed content, but was not blocking it in today's cycles).

**Both vneconomy RSS feeds: 200 OK / no geo-block / no Cloudflare** from both VPS and France.
Article pages: 200 OK, gzip-encoded, no anti-bot.

---

## Q1 — DIRECT-PATH HEALTH (from France / non-VN IP)

| Feed | Status | Server | Latency | Anti-bot |
|------|--------|--------|---------|---------|
| `https://vneconomy.vn/chung-khoan.rss` | **200 OK** | Microsoft-IIS/10.0 | 1.88s | none |
| `https://vneconomy.vn/tai-chinh.rss` | **200 OK** | Microsoft-IIS/10.0 | ~1.8s | none |
| Article page (probe) | **200 OK** | Microsoft-IIS/10.0 | 0.12s (VPS) | none |

**Conclusion:** No geo-block. The direct France path is fully accessible. VPS routing not needed
for RSS. No Cloudflare or managed challenge — vneconomy runs on IIS with Redis caching.

---

## Q2 — EXISTING VPS PIPELINE OVERLAP

vneconomy is covered by the same `vn-news-fetch.service` pipeline as cafef (see cafef recon).
Script: `/root/fetch-vn-news.sh`

**vneconomy feeds in script:**
```bash
VNECON1_JSON=$(fetch_rss  "vneconomy"  "https://vneconomy.vn/chung-khoan.rss")
VNECON2_JSON=$(fetch_rss  "vneconomy"  "https://vneconomy.vn/tai-chinh.rss")
```

**End-to-end status (2026-06-01 08:36 UTC run):**
- vneconomy-stocks: **20 items** (healthy)
- vneconomy-finance: **20 items** (healthy)
- No block detected for vneconomy in recent cycles

**Note on is_blocked() risk:** vneconomy articles CAN contain "robot" in content, which would
trigger the same false-positive as cafef. This is latent — not firing today but will fire
intermittently depending on article topics. Same fix applies.

---

## Q3 — ARTICLE BODY FEASIBILITY

### vneconomy.vn article pages

**Working request recipe (HTTP-only, no browser):**
```bash
curl -s --compressed \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' \
  -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' \
  -H 'Accept-Language: vi-VN,vi;q=0.9,en-US;q=0.8' \
  -H 'Referer: https://vneconomy.vn/chung-khoan.htm' \
  -L \
  "https://vneconomy.vn/<article-slug>.htm"
```

**IMPORTANT:** vneconomy sends gzip-encoded responses. Must use `--compressed` flag (curl)
or `Accept-Encoding: gzip` with manual decompression. Without `--compressed`, raw binary is
returned. The `-H 'Accept-Encoding: gzip'` is auto-set by curl `--compressed`.

**HTTP probe results:**
- Status: 200 OK
- Server: Microsoft-IIS/10.0
- Content-Encoding: gzip
- Cache: `x-cache: HIT-DESKTOP-REDIS` (Redis-cached at edge)
- Latency: 0.12s from VPS, ~1.9s from France
- Anti-bot: none — no challenge, no JS gating, no cookie requirements

**Article body DOM structure:**
```
div.main-detail-page
  └── h1.name-detail[data-field="title"]  → article headline
      span.date-detail                    → publish datetime (dd/MM/yyyy, HH:mm)
  └── div.text-justify                    → article body paragraphs (CLEAN TEXT)
  └── span.name-detail (author)          → author name
```

Primary CSS selectors for article text extraction:
- `div.text-justify` → clean article body (confirmed clean Vietnamese text, no ads)
- `h1.name-detail` → article headline
- `span.date-detail` or `meta[name="publish_date"]` → publish datetime
- `meta[name="author"]` → author name
- `meta[name="description"]` → summary/lead paragraph

**Sample extracted text (from vneconomy.vn/ngan-hang-nha-nuoc-va-bo-tai-chinh-my... ):**
```
Các nội dung chính bao gồm: Hai bên tái khẳng định cam kết về việc tránh thao túng tỷ giá
hoặc hệ thống tiền tệ quốc tế nhằm ngăn cản việc điều chỉnh cán cân thanh toán hiệu quả
hoặc để giành lợi thế cạnh tranh không công bằng...
```

**Pagination / listing URLs:**
- Stocks listing: `https://vneconomy.vn/chung-khoan.htm`
- Finance listing: `https://vneconomy.vn/tai-chinh.htm`
- Article URL pattern: `https://vneconomy.vn/<slug>.htm`
- No AJAX/JSON API found for article listing — RSS is the cleanest listing source

---

## Working Request Recipe — article body extraction

```bash
# From VPS or France — both work
ARTICLE_URL="https://vneconomy.vn/ngan-hang-nha-nuoc-va-bo-tai-chinh-my-ra-tuyen-bo-chung-co-phieu-bat-dong-san-khu-cong-nghiep-duoc-chu-y.htm"

curl -s --compressed \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' \
  -H 'Accept: text/html,*/*' \
  -H 'Accept-Language: vi-VN,vi;q=0.9' \
  -H 'Referer: https://vneconomy.vn/chung-khoan.htm' \
  -L "$ARTICLE_URL" | python3 -c "
import sys, re
html = sys.stdin.read()
# Extract article body
idx = html.find('text-justify')
if idx < 0:
    idx = html.find('main-detail-page')
chunk = html[idx:idx+20000]
text = re.sub(r'<[^>]+>', ' ', chunk)
text = re.sub(r'\s+', ' ', text).strip()
print(text[:3000])
"
```

---

## Notes

- vneconomy uses Redis edge caching (`x-cache: HIT-DESKTOP-REDIS`) — responses are fast
  and consistent. No session or cookie required.
- The `div.text-justify` selector reliably isolates the clean article body. Tested on a
  confirmed Vietnamese financial policy article with accurate text extraction.
- No CF, no Akamai, no bot challenge of any kind. Plain IIS + Redis stack, very scraper-friendly.
- VPS latency advantage: 0.12s vs France 1.9s — ~15x faster. If article body scraping
  is implemented, routing through VPS is beneficial for speed (not required for access).
- **RECOMMENDATION:** vneconomy RSS is already fully covered by the existing pipeline.
  Article body scraping is only needed if richer content than RSS description is required.
  The `div.text-justify` selector is stable and HTTP-only — implementation would be trivial.
