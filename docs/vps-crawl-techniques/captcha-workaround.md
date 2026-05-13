# Technique — captcha-workaround

**Problem:** Target requires CAPTCHA solving (reCAPTCHA v2/v3, hCaptcha, Cloudflare Turnstile) before serving data. No free automated bypass exists for these without a CAPTCHA solving service or browser.
**Anti-bot type:** captcha
**Date documented:** 2026-05-13

## Solution Approach

Three options, ordered by preference for VPS deployment:

### Option A — Find CAPTCHA-free Endpoint (Preferred)

Most VN financial portals with CAPTCHA on the public HTML page have an underlying API or data endpoint that is NOT CAPTCHA-protected. CAPTCHA is typically on login forms or bulk export. Identify the XHR calls made after the CAPTCHA-gated page loads and call those directly.

**Action:** Use browser DevTools Network tab to capture XHR/Fetch calls after CAPTCHA gate. The actual data endpoint is often CAPTCHA-free.

### Option B — 2captcha API Integration

Use the `2captcha` Python client to send the challenge image/token to a human solving farm. Turnaround: 15–45 seconds. Cost: ~$2–3 per 1000 solves.

**When to use:** Only for sources where Option A is impossible (true CAPTCHA-gated endpoints). Not recommended for high-frequency polling.

### Option C — Manual Bootstrap + Cookie Replay

Solve CAPTCHA manually once in a browser. Export cookies (EditThisCookie extension or browser DevTools). Replay cookies in scraper session. Session lasts until cookie expiry (hours to days depending on site).

**When to use:** Low-frequency sources (weekly/daily scrape). Acceptable for BCTC report discovery (once per quarter per ticker).

## Libraries Required

Option B:
- `2captcha-python >= 1.2.0` (install: `pip install 2captcha-python`)
- 2captcha API key (env var: `TWOCAPTCHA_API_KEY`)

Option A/C:
- `requests >= 2.28` + `cookie-warmup` technique

## Code Snippet — Option B (2captcha reCAPTCHA v2)

```python
import os
import requests
import datetime
from twocaptcha import TwoCaptcha

def solve_recaptcha_v2(site_key: str, page_url: str) -> str | None:
    """
    Solve reCAPTCHA v2 via 2captcha API.
    Returns g-recaptcha-response token string or None on failure.
    """
    api_key = os.environ.get("TWOCAPTCHA_API_KEY")
    if not api_key:
        return None
    solver = TwoCaptcha(api_key)
    try:
        result = solver.recaptcha(sitekey=site_key, url=page_url)
        return result.get("code")
    except Exception:
        return None

def fetch_with_captcha_solve(
    page_url: str,
    form_url: str,
    site_key: str,
    form_data: dict,
    headers: dict | None = None,
) -> dict:
    """
    Solve reCAPTCHA and submit form.
    form_data: additional POST fields (e.g. ticker, date range)
    """
    token = solve_recaptcha_v2(site_key, page_url)
    if not token:
        return {"status": "error", "reason": "captcha_solve_failed"}

    session = requests.Session()
    h = headers or {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    }
    post_data = {**form_data, "g-recaptcha-response": token}
    resp = session.post(form_url, data=post_data, headers=h, timeout=30)
    if resp.status_code != 200:
        return {"status": "error", "reason": f"http={resp.status_code}"}
    return {
        "status": "ok",
        "data": resp.text,
        "fetched_at": datetime.datetime.utcnow().isoformat(),
    }
```

## RAM Cost

- requests + 2captcha client: ~5–10 MB
- No browser spawned
- Note: 2captcha solve is I/O-bound (waiting for human solver, 15–45s) — not RAM-bound

## Decision Tree for VN Sources

```
Source has CAPTCHA?
  ├── CAPTCHA only on HTML page, data served via XHR?
  │     → Option A: find XHR endpoint (bypass CAPTCHA entirely)
  ├── CAPTCHA on login form, data behind auth?
  │     → Option C: manual cookie bootstrap, then cookie-warmup technique
  ├── CAPTCHA on every data request?
  │     → Option B: 2captcha API (costly — only if no alternative)
  └── Cloudflare Turnstile?
        → See cloudflare-managed-bypass.md — same 2captcha path applies
```

## Status for Current VN Sources (2026-05-13)

| Source | CAPTCHA? | Approach |
|--------|---------|---------|
| vps-prices | No | plain-requests-open-api |
| cafef-index | No | plain-requests-open-api |
| sbv-rates | No | plain-requests-open-api |
| vn-news-rss | No | ua-rotation-rss |
| hsx-bctc (HNX) | No | hnx-ajax-post |
| hsx-bctc (SSC) | No explicit CAPTCHA, but SPA requires browser | ssc-playwright-download (failing) |

**No current VN source requires CAPTCHA solving.** This technique is documented for future sources.

## Known Limits

- 2captcha turnaround: 15–45s per solve — unsuitable for real-time data polling
- reCAPTCHA v3 (score-based): solving token does not guarantee high score — site may still reject low-score tokens
- Cloudflare Turnstile: 2captcha supports it but latency and cost are high
- CAPTCHA providers change their algorithms — test solve rate periodically
- Manual cookie bootstrap (Option C) requires human intervention to refresh — operationally fragile for automated pipelines

## References

- [2captcha Python client](https://github.com/2captcha/2captcha-python)
- [Cloudflare Turnstile bypass 2026 — CapSolver](https://www.capsolver.com/blog/Cloudflare/bypass-cloudflare-challenge-2025)
- [reCAPTCHA v3 bypass guide — ZenRows](https://www.zenrows.com/blog/bypass-cloudflare-python)
