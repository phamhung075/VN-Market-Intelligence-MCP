> Parent: [../../../.claude/agents/ops-vps-fetch.md](../../../.claude/agents/ops-vps-fetch.md)

# Ops VPS Fetch — Knowledge

## Recon Doc Schema

Each source recon doc lives at `docs/vps-sources/<source-name>/recon.md`.

```markdown
# Recon — <source-name>

**Date:** YYYY-MM-DD HH:MM UTC
**Agent:** ops-vps-fetch
**Source URL:** <full URL probed>
**Trigger:** <fetch_broken | new_source_needed>

## Working Request Recipe
```bash
curl -s \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...' \
  -H 'Accept: text/html,application/xhtml+xml,*/*' \
  -H 'Accept-Language: vi-VN,vi;q=0.9,en;q=0.8' \
  -H 'Referer: https://finance.vietstock.vn/' \
  -L \
  "<URL>"
```

## HTTP Probe Results
- **Status:** <200 | 403 | 301→302→... | CF challenge>
- **Final URL:** <after redirects>
- **Content-Type:** <text/html | application/json | ...>
- **Redirect chain:** <URL1> → <URL2> → ...

## Anti-Bot Assessment
- **Type:** <none | cloudflare_js | cloudflare_managed | captcha | ip_block | login_required>
- **Evidence:** <cf-ray header | __cf_bm cookie | JS challenge body pattern | CAPTCHA iframe>
- **Recommendation:** <technique to try — see docs/vps-crawl-techniques/>

## Page Structure
### DOM Selectors (HTML sources)
- <css-selector> → <data description>

### JSON Paths (API sources)
- <json.path.key> → <data description>

## Sample Response Excerpt
```
<first 500 chars of response body or representative JSON fragment>
```

## Notes
<anything unusual — rate limiting, session requirements, token in URL, etc.>
```

---

## Anti-Bot Classification

| Type | Detection signals | Recommended technique doc |
|------|------------------|--------------------------|
| None | 200 OK, clean HTML/JSON | n/a — straightforward curl |
| Cloudflare JS | `cf-ray` header + HTML body contains `cf.challenge` or `Checking your browser` | `docs/vps-crawl-techniques/cloudflare-js-bypass.md` |
| Cloudflare Managed | `__cf_bm` cookie set, 403 with `managed_challenge` body | `docs/vps-crawl-techniques/cloudflare-managed-bypass.md` |
| IP block | 403 with no Cloudflare headers, VPS IP may be flagged | `docs/vps-crawl-techniques/ip-rotation-header-spoof.md` |
| Captcha | CAPTCHA iframe or `g-recaptcha` in body | `docs/vps-crawl-techniques/captcha-workaround.md` |
| Login required | Redirect to /login or 401 | `docs/vps-crawl-techniques/cookie-warmup.md` |
| JS challenge mini | Non-Cloudflare JS that sets a cookie via computation | `docs/vps-crawl-techniques/js-mini-challenge.md` |

---

## Signal Payload Spec — ops-vps-fetch → dev-vps-crawls

File: `docs/signals/dev-vps-crawls-<ISO-timestamp>.json`

```json
{
  "from": "ops-vps-fetch",
  "to": "dev-vps-crawls",
  "type": "recon-complete",
  "payload": {
    "source_name": "<source-name>",
    "recon_doc": "docs/vps-sources/<source-name>/recon.md",
    "anti_bot_type": "<none|cloudflare_js|cloudflare_managed|ip_block|captcha|login_required|js_mini>",
    "suggested_technique": "<technique-name or null>",
    "trigger": "<fetch_broken | new_source_needed>"
  },
  "priority": "normal",
  "createdAt": "<ISO-8601>"
}
```

---

## Source Catalog (live)

| Source name | URL pattern | Data type | Anti-bot |
|-------------|------------|-----------|---------|
| vietstock-prices | finance.vietstock.vn | OHLCV quotes | cloudflare_js |
| cafef-news | cafef.vn/chung-khoan/ | Market news | none |
| hsx-bctc | hsx.vn/Modules/Listed/... | BCTC PDFs | none |
| sbv-rates | sbv.gov.vn | FX / macro rates | none |
| vndirect-foreign | vndirect.com.vn | Foreign flow | cloudflare_managed |

> Update this table when a new source recon doc is written.

---

## Lazy Load Table

```yaml
lazy_load:
  - path: docs/references/vps-setup.md
    trigger: vps_connection_or_service_reference
  - path: docs/references/vps-setup-services.md
    trigger: vps_service_architecture_details
  - path: docs/vps-sources/README.md
    trigger: recon_doc_authoring
```
