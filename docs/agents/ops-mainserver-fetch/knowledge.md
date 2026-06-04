> Parent: [../../../.claude/agents/ops-mainserver-fetch.md](../../../.claude/agents/ops-mainserver-fetch.md)

# Ops Main Server Fetch — Knowledge

## Recon Doc Schema

Each source recon doc lives at `docs/mainserver-sources/<source-name>/recon.md`.

```markdown
# Recon — <source-name>

**Date:** YYYY-MM-DD HH:MM UTC
**Agent:** ops-mainserver-fetch
**Source URL:** <full URL probed>
**Trigger:** <fetch_broken | new_source_needed>
**Probe origin:** main-server (direct, no VPS proxy)

## Working Request Recipe
```bash
curl -s \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' \
  -H 'Accept: text/html,application/xhtml+xml,*/*' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  -H 'Referer: https://www.google.com/' \
  -L \
  "<URL>"
```

## HTTP Probe Results
- **Status:** <200 | 403 | 301→302→... | CF challenge | geo-block>
- **Final URL:** <after redirects>
- **Content-Type:** <text/html | application/json | ...>
- **Redirect chain:** <URL1> → <URL2> → ...

## Anti-Bot Assessment
- **Type:** <none | cloudflare_js | cloudflare_managed | datadome | perimeterx | akamai_bot | captcha | ip_block | login_required | js_mini>
- **Evidence:** <cf-ray header | DataDome cookie | PerimeterX script | bot-detection JS patterns>
- **Geo-blocked from main server:** <yes | no>
- **Recommendation:** <technique to try (headless OK) — see docs/mainserver-crawl-techniques/ | re-route to ops-vps-fetch if VN-only>

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
<anything unusual — rate limiting, session requirements, tokens in URL, geo-fence, subscription wall, etc.>
```

---

## Anti-Bot Classification

| Type | Detection signals | Recommended technique doc |
|------|------------------|--------------------------|
| None | 200 OK, clean HTML/JSON | n/a — straightforward curl or requests |
| Cloudflare JS | `cf-ray` header + HTML body contains `cf.challenge` or `Checking your browser` | `docs/mainserver-crawl-techniques/cloudflare-js-bypass.md` |
| Cloudflare Managed | `__cf_bm` cookie set, 403 with `managed_challenge` body | `docs/mainserver-crawl-techniques/cloudflare-managed-bypass.md` |
| DataDome | `datadome` cookie, redirect to `geo.captcha-delivery.com`, 403 with DataDome JS | `docs/mainserver-crawl-techniques/datadome-bypass.md` |
| PerimeterX | `_pxhd` / `_pxvid` cookies, `/_Incapsula_Resource` pattern, PX JS in body | `docs/mainserver-crawl-techniques/perimeterx-bypass.md` |
| Akamai Bot | `_abck` cookie, akamai-bot-manager headers, 403 with sensor data challenge | `docs/mainserver-crawl-techniques/akamai-bot-bypass.md` |
| IP block | 403 with no recognized bot-manager headers | `docs/mainserver-crawl-techniques/ip-rotation-header-spoof.md` |
| Captcha | CAPTCHA iframe, `g-recaptcha` or `h-captcha` in body | `docs/mainserver-crawl-techniques/captcha-workaround.md` |
| Login required | Redirect to /login or HTTP 401 | `docs/mainserver-crawl-techniques/cookie-warmup.md` |
| JS mini | Non-recognized JS that sets a cookie via computation | `docs/mainserver-crawl-techniques/js-mini-challenge.md` |
| Geo-blocked | Redirect to VN-only page, `geo.` subdomain, 451 status | Re-route to ops-vps-fetch |

---

## Geo-Block Detection Protocol

If probe from main server yields any of:
- HTTP 451 (Unavailable For Legal Reasons / geo-fence)
- Redirect to a `geo.` or `region.` subdomain with VN-only message
- Response body contains "available only in Vietnam" / "chỉ dành cho" patterns
- 403 with `X-Country-Block: VN` or similar header

→ Do NOT write a mainserver recon doc. Instead:
1. Log finding in notebook.
2. Drop signal to ops-vps-fetch: `docs/signals/ops-vps-fetch-<ts>.json` (type: `geo-block-reroute`).
3. Notify WORK channel: "Geo-block detected for <source> from main server — re-routed to ops-vps-fetch."
4. EXIT this flow.

---

## Signal Payload Spec — ops-mainserver-fetch → dev-mainserver-crawls

File: `docs/signals/dev-mainserver-crawls-<ISO-timestamp>.json`

```json
{
  "from": "ops-mainserver-fetch",
  "to": "dev-mainserver-crawls",
  "type": "recon-complete",
  "payload": {
    "source_name": "<source-name>",
    "recon_doc": "docs/mainserver-sources/<source-name>/recon.md",
    "anti_bot_type": "<none|cloudflare_js|cloudflare_managed|datadome|perimeterx|akamai_bot|ip_block|captcha|login_required|js_mini>",
    "suggested_technique": "<technique-name or null>",
    "headless_likely_needed": "<true | false>",
    "trigger": "<fetch_broken | new_source_needed>"
  },
  "priority": "normal",
  "createdAt": "<ISO-8601>"
}
```

---

## Signal Payload Spec — ops-mainserver-fetch → ops-vps-fetch (geo-block re-route)

File: `docs/signals/ops-vps-fetch-<ISO-timestamp>.json`

```json
{
  "from": "ops-mainserver-fetch",
  "to": "ops-vps-fetch",
  "type": "geo-block-reroute",
  "payload": {
    "source_name": "<source-name>",
    "source_url": "<URL>",
    "evidence": "<what was detected from main server that confirmed geo-block>",
    "trigger": "<fetch_broken | new_source_needed>"
  },
  "priority": "normal",
  "createdAt": "<ISO-8601>"
}
```

---

## Source Catalog (live)

| Source name | URL pattern | Data type | Anti-bot | Geo-blocked |
|-------------|------------|-----------|---------|------------|
| fred-macro | api.stlouisfed.org/fred/series/observations | macro JSON | login_required (free key) | no |
| fred-effr | fred.stlouisfed.org/graph/fredgraph.csv (BLOCKED) → use api.stlouisfed.org | macro JSON | akamai_bot (web), none (api) | no |

> Update this table when a new source recon doc is written.

---

## Lazy Load Table

```yaml
lazy_load:
  - path: docs/agents/ops-mainserver-fetch/knowledge.md
    trigger: recon_workflow_or_anti_bot_reference_or_geo_block_routing
  - path: docs/mainserver-sources/README.md
    trigger: recon_doc_authoring
```
