> Parent: [./main.md](./main.md)

# dev-mainserver-crawls — Technique Research Sub-Flow (Step 3b)

Invoked from `main.md` Step 3 when no existing technique doc is found for the required anti-bot approach.
Produces `docs/mainserver-crawl-techniques/<technique-name>.md`.

---

## Step 3b — Research (if new technique)

1. WebSearch: `"<anti_bot_type> python bypass 2025 <library>"` — PoC code, library docs, GitHub issues.
2. WebFetch: Read 2-3 highest-signal results.
3. Synthesize approach: library + code pattern + known limits + RAM cost.
4. Write `docs/mainserver-crawl-techniques/<technique-name>.md` using template below.

**Always include RAM cost estimate** in the technique doc — mandatory for all techniques, especially headless.

---

## Technique Doc Template

```markdown
# <technique-name> — Mainserver Crawl Technique

**Anti-bot type:** <datadome | perimeterx | cloudflare_managed | akamai_bot | ...>
**Library:** <library-name>==<version>
**RAM cost estimate:** ~<N>MB peak
**Headless:** <yes | no>
**Last verified:** <YYYY-MM-DD>

## Installation

pip install <library>==<version>
# For Playwright (first time):
playwright install chromium

## Code Pattern

### Lightweight (no headless)

Use requests / httpx / curl_cffi / cloudscraper as appropriate:

​```python
# requests / httpx / curl_cffi / cloudscraper as appropriate
​```

### Headless (playwright-stealth example)

​```python
from playwright.sync_api import sync_playwright
from playwright_stealth import stealth_sync

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(...)
    page = context.new_page()
    stealth_sync(page)
    page.goto(url, wait_until="networkidle")
    data = page.evaluate("() => window.__NEXT_DATA__")  # or page.content()
    browser.close()  # always close — RAM release
​```

## Install Dependencies

​```bash
pip install <library>==<version>
# For Playwright (first time):
playwright install chromium
​```

## Known Limits

- <limit 1>
- <limit 2>

## RAM Profiling (headless only)

​```bash
/usr/bin/time -v python apps/<service>/src/infrastructure/scrapers/<source-name>.py 2>&1 | grep "Maximum resident"
​```

Record peak RSS here: ~<N>MB. Container budget rule → `docs/agents/dev-mainserver-crawls/knowledge.md § RAM Budget`.
```

---

## RETURN

After technique doc is written, return to `main.md` Step 4 with:
```
TECHNIQUE_DOC: docs/mainserver-crawl-techniques/<technique-name>.md
LIBRARY: <library-name>
HEADLESS: <yes|no>
RAM_ESTIMATE: ~<N>MB
```
