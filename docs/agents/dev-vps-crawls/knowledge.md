> Parent: [../../../.claude/agents/dev-vps-crawls.md](../../../.claude/agents/dev-vps-crawls.md)

# Dev VPS Crawls — Knowledge

## VPS Service Architecture

Scrapers wire into the existing PULL-based pipeline. Pattern from `docs/references/vps-setup-services.md`:

```
Vinahost VPS (:8765)
  ├── /stock-prices/          ← vn-price-fetch.service (Python)
  ├── /bctc-files/            ← vn-bctc-fetch.service (Python)
  ├── /news-feed/             ← vn-news-fetch.service (Python)
  ├── /sbv-data/              ← vn-sbv-fetch.service (Python)
  └── /foreign-flow/          ← vn-foreign-flow.service (Python)

Local MCP Server (PULL)
  └── Periodically GET VPS:8765/<endpoint> → store → SQLite
```

**Service template** (per new source):
- Scraper script: `/root/scrapers/<source-name>.py`
- Systemd unit: `/etc/systemd/system/vn-<source-name>.service`
- Endpoint served by existing Flask/FastAPI router on VPS port 8765
- Wire endpoint in router: `/root/vps-router.py` (or equivalent)

---

## Anti-Bot Decision Tree

```
Recon anti_bot_type
  ├── none              → requests.get() with standard headers
  ├── cloudflare_js     → curl_cffi with browser impersonation (chrome110)
  ├── cloudflare_managed → cloudscraper session + cf_clearance warmup
  ├── ip_block          → header rotation + User-Agent pool + retry backoff
  ├── captcha           → captcha workaround (2captcha API or manual seed)
  ├── login_required    → cookie warmup (login once, persist session)
  └── js_mini           → execjs or node -e for challenge computation
```

Full technique docs: `docs/vps-crawl-techniques/<technique-name>.md`

---

## Technique Catalog Index

| Technique name | File | Anti-bot target | Key library |
|---------------|------|----------------|------------|
| aspnet-csrf-double-submit | `docs/vps-crawl-techniques/aspnet-csrf-double-submit.md` | ASP.NET anti-forgery CSRF | urllib stdlib |
| cloudflare-js-bypass | `docs/vps-crawl-techniques/cloudflare-js-bypass.md` | CF JS challenge | curl_cffi |
| cloudflare-managed-bypass | `docs/vps-crawl-techniques/cloudflare-managed-bypass.md` | CF managed challenge | cloudscraper |
| tls-fingerprint-spoof | `docs/vps-crawl-techniques/tls-fingerprint-spoof.md` | JA3/JA4 fingerprint | curl_cffi |
| header-rotation | `docs/vps-crawl-techniques/header-rotation.md` | UA/IP heuristics | requests |
| cookie-warmup | `docs/vps-crawl-techniques/cookie-warmup.md` | Session / login wall | requests.Session |
| js-mini-challenge | `docs/vps-crawl-techniques/js-mini-challenge.md` | Non-CF JS cookie | execjs / node |
| captcha-workaround | `docs/vps-crawl-techniques/captcha-workaround.md` | CAPTCHA gates | 2captcha API / skip |

> Create a new row when a new technique is documented.

---

## Forbidden Libraries

NEVER install on VPS:
- `playwright`, `puppeteer`, `selenium`, `pyppeteer`, `chromium`, `geckodriver`
- Reason: VPS RAM limit (~1GB). Browser engines cause OOM kills.

---

## Signal Payload Spec — dev-vps-crawls → qa

File: `docs/data/orch/orch-state.json .task_board` task status updated (standard dev chain: atomic write per §2.3) + caveman to work channel.

```
SCRAPER OPERATIONAL
source: <source-name>
endpoint: VPS:8765/<endpoint-path>
technique: <technique-name>
technique_doc: docs/vps-crawl-techniques/<technique>.md
recon_doc: docs/vps-sources/<source-name>/recon.md
verified: curl VPS:8765/<endpoint> → <status> → <sample>
next: qa validation
```

---

## Signal Payload Spec — dev-vps-crawls → ops-vps-fetch (recon insufficient)

File: `docs/signals/ops-vps-fetch-<ISO-timestamp>.json`

```json
{
  "from": "dev-vps-crawls",
  "to": "ops-vps-fetch",
  "type": "recon-insufficient",
  "payload": {
    "source_name": "<source-name>",
    "recon_doc": "docs/vps-sources/<source-name>/recon.md",
    "issue": "<what is missing — e.g. need cookie values, need JS challenge token>",
    "suggested_probe": "<what to add to the curl command>"
  },
  "priority": "normal",
  "createdAt": "<ISO-8601>"
}
```

---

## Lazy Load Table

```yaml
lazy_load:
  - path: docs/references/vps-setup.md
    trigger: vps_connection_or_service_architecture_reference
  - path: docs/references/vps-setup-services.md
    trigger: vps_service_wiring_reference
  - path: docs/vps-crawl-techniques/README.md
    trigger: technique_selection_or_new_technique_authoring
  - path: docs/vps-sources/README.md
    trigger: recon_doc_reading
  - path: .claude/skills/semble-search/SKILL.md
    trigger: code_search
```
