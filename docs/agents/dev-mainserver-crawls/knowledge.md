> Parent: [../../../.claude/agents/dev-mainserver-crawls.md](../../../.claude/agents/dev-mainserver-crawls.md)

# Dev Main Server Crawls — Knowledge

## Microservice Wiring Pattern

Scrapers wire into the existing microservice architecture (Docker-based). Use zone-detect skill to identify the correct service zone.

```
Main Server Microservices
  ├── apps/macro-indicators/   ← international macro data (IMF, World Bank, ADB, TradingEconomics)
  ├── apps/stock-price/        ← international price feeds (Yahoo Finance, Bloomberg public)
  └── apps/news-fetch/ (TBD)   ← international news (Reuters, Bloomberg news)

Scraper placement pattern (DDD layers):
  apps/<service>/src/infrastructure/scrapers/<source-name>.py   ← scraper module
  apps/<service>/src/application/usecases/fetch<Source>.ts      ← use-case wrapper
  apps/<service>/src/interface/scheduler/<source-name>Job.ts    ← cron pull job
```

**RAM note:** Each headless browser instance (Playwright Chromium) requires ~250-500MB. Document actual measured footprint in technique doc. Flag ops if total container headless load exceeds 80% of container memory limit.

---

## Anti-Bot Decision Tree (with Headless Escalation)

```
Recon anti_bot_type
  ├── none              → requests.get() with standard headers (~5MB RAM)
  ├── cloudflare_js     → curl_cffi with browser impersonation (chrome124) (~15MB RAM)
  ├── cloudflare_managed → cloudscraper session + cf_clearance warmup (~25MB RAM)
  ├── datadome          → playwright-stealth + realistic timing + fingerprint spoof (~350MB RAM)
  ├── perimeterx        → playwright-stealth + sensor data replay OR hrequests (~300MB RAM)
  ├── akamai_bot        → Botasaurus OR playwright with human simulation (~400MB RAM)
  ├── ip_block          → header rotation + User-Agent pool + retry backoff (~5MB RAM)
  ├── captcha           → 2captcha API integration OR headless CAPTCHA-solver (~25MB RAM)
  ├── login_required    → cookie warmup (login once, persist session) (~10MB RAM)
  └── js_mini           → execjs or node -e for challenge computation (~20MB RAM)

Escalation rule:
  1. Try lightweight (requests/httpx/curl_cffi) first — if it works, stop.
  2. Try cloudscraper for CF challenges — if it works, stop.
  3. Escalate to playwright-stealth or equivalent headless — document RAM cost.
  4. If headless fails: document dead-end → signal ops-mainserver-fetch for updated recon.
```

Full technique docs: `docs/mainserver-crawl-techniques/<technique-name>.md`

---

## Technique Catalog Index

| Technique name | File | Anti-bot target | Key library | RAM est. |
|---------------|------|----------------|------------|---------|
| cloudflare-js-bypass | `docs/mainserver-crawl-techniques/cloudflare-js-bypass.md` | CF JS challenge | curl_cffi | ~15MB |
| cloudflare-managed-bypass | `docs/mainserver-crawl-techniques/cloudflare-managed-bypass.md` | CF managed challenge | cloudscraper | ~25MB |
| tls-fingerprint-spoof | `docs/mainserver-crawl-techniques/tls-fingerprint-spoof.md` | JA3/JA4 fingerprint | curl_cffi | ~15MB |
| header-rotation | `docs/mainserver-crawl-techniques/header-rotation.md` | UA/IP heuristics | requests | ~5MB |
| cookie-warmup | `docs/mainserver-crawl-techniques/cookie-warmup.md` | Session / login wall | requests.Session | ~10MB |
| js-mini-challenge | `docs/mainserver-crawl-techniques/js-mini-challenge.md` | Non-CF JS cookie | execjs / node | ~20MB |
| captcha-workaround | `docs/mainserver-crawl-techniques/captcha-workaround.md` | CAPTCHA gates | 2captcha API | ~25MB |
| playwright-stealth | `docs/mainserver-crawl-techniques/playwright-stealth.md` | DataDome / PX / complex CF | playwright + playwright-stealth | ~350MB |
| botasaurus-human-sim | `docs/mainserver-crawl-techniques/botasaurus-human-sim.md` | Akamai Bot / advanced fingerprint | Botasaurus | ~400MB |
| hrequests-browser | `docs/mainserver-crawl-techniques/hrequests-browser.md` | PerimeterX / JS-rendered | hrequests | ~300MB |

> Create a new row when a new technique is documented. Always include RAM estimate.

---

## Headless Technique Doc Template

Each technique file MUST contain a RAM cost section (additional requirement vs VPS pair):

```markdown
# Technique — <technique-name>

**Problem:** <what anti-bot mechanism this bypasses>
**Anti-bot type:** <cloudflare_js | cloudflare_managed | datadome | perimeterx | akamai_bot | captcha | login_required | js_mini>
**Date documented:** YYYY-MM-DD
**RAM cost:** <measured MB — e.g. "~350MB per Chromium instance">

## Solution Approach
<1-paragraph description of the bypass strategy>

## Libraries Required
- <library> == <version> (install: pip install <library>)

## Code Snippet
```python
# <minimal working example>
```

## RAM Profiling
```bash
# How to measure during scraper run:
/usr/bin/time -v python scraper.py 2>&1 | grep "Maximum resident"
```

## Known Limits
- <limit 1>
- <limit 2>

## References
- <URL 1>
```

---

## Container RAM Budget Rule

When adding a headless scraper:
1. Measure actual RSS: `/usr/bin/time -v python <scraper>.py 2>&1 | grep "Maximum resident"`
2. Document in technique doc under `## RAM Profiling`.
3. If current container headless total + new scraper RAM > 80% of container limit → send_telegram(work) with flag for ops to adjust compose memory limits.
4. NEVER modify `docker-compose.yml` directly — that is ops's job.

---

## Signal Payload Spec — dev-mainserver-crawls → qa

File: `docs/data/orch/orch-state.json .task_board` task status updated (standard dev chain: atomic write per §2.3) + caveman to work channel.

```
SCRAPER OPERATIONAL
source: <source-name>
microservice: apps/<service>/
technique: <technique-name>
technique_doc: docs/mainserver-crawl-techniques/<technique>.md
recon_doc: docs/mainserver-sources/<source-name>/recon.md
ram_cost: ~<N>MB (headless: <yes|no>)
verified: local run → <status> → <sample>
next: qa validation
```

---

## Signal Payload Spec — dev-mainserver-crawls → ops-mainserver-fetch (recon insufficient)

File: `docs/signals/ops-mainserver-fetch-<ISO-timestamp>.json`

```json
{
  "from": "dev-mainserver-crawls",
  "to": "ops-mainserver-fetch",
  "type": "recon-insufficient",
  "payload": {
    "source_name": "<source-name>",
    "recon_doc": "docs/mainserver-sources/<source-name>/recon.md",
    "issue": "<what is missing — e.g. need cookie values, anti-bot type misidentified>",
    "suggested_probe": "<what to add to the probe — e.g. add Accept-Language header, check for DataDome cookie>"
  },
  "priority": "normal",
  "createdAt": "<ISO-8601>"
}
```

---

## Lazy Load Table

```yaml
lazy_load:
  - path: docs/agents/dev-mainserver-crawls/knowledge.md
    trigger: implementation_or_technique_selection_or_microservice_wiring
  - path: docs/mainserver-crawl-techniques/README.md
    trigger: technique_selection_or_new_technique_authoring
  - path: docs/mainserver-sources/README.md
    trigger: recon_doc_reading
  - path: .claude/skills/zone-detect/SKILL.md
    trigger: microservice_routing_decision
  - path: .claude/skills/semble-search/SKILL.md
    trigger: code_search
```
