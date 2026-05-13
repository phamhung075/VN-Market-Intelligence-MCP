# Technique — cookie-warmup

**Problem:** Target requires an active session (cookies set by a prior page load or login) before serving API/data responses. Sending the data request cold (no session cookies) returns a redirect to login, a 403, or an empty/stub response. Applies to F5 BigIP fingerprinting cookies (hsx.vn), ASP.NET SessionId, Oracle ADF session, and any portal requiring prior navigation.
**Anti-bot type:** login_required / js_mini (session wall without JS challenge)
**Date documented:** 2026-05-13

## Solution Approach

Use `requests.Session` to perform a warm-up GET on the landing page before the target API/data request. The server sets session cookies on the first response; Session persists them automatically for all subsequent requests within the session lifetime. For authenticated portals (login wall), perform a POST to the login endpoint first, then use the authenticated session for data requests. Optionally: serialize cookies to disk (`session.cookies.get_dict()`) so the session survives service restarts without re-warming.

For F5 BigIP (`TS0*` cookies on hsx.vn): the first GET sets two cookies; all subsequent requests on the same Session carry them. No JS computation needed.

## Libraries Required

- `requests >= 2.28` (install: `pip install requests`)
- `pickle` (stdlib, for cookie persistence)

## Code Snippet

```python
import requests
import pickle
import os
import datetime

COOKIE_STORE = "/root/scrapers/cookies/{source}.pkl"

def load_or_warmup(
    session: requests.Session,
    warmup_url: str,
    source_key: str,
    headers: dict | None = None,
    force_refresh: bool = False,
) -> bool:
    """
    Load session cookies from disk or perform a warmup GET to obtain them.
    Returns True if cookies are ready; False if warmup failed.
    """
    cookie_path = COOKIE_STORE.format(source=source_key)
    if not force_refresh and os.path.exists(cookie_path):
        try:
            with open(cookie_path, "rb") as f:
                session.cookies.update(pickle.load(f))
            return True
        except Exception:
            pass  # stale — re-warm

    h = headers or {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
    }
    try:
        resp = session.get(warmup_url, headers=h, timeout=20, allow_redirects=True)
        if resp.status_code == 200 and session.cookies:
            os.makedirs(os.path.dirname(cookie_path), exist_ok=True)
            with open(cookie_path, "wb") as f:
                pickle.dump(dict(session.cookies), f)
            return True
    except requests.RequestException:
        pass
    return False

def fetch_with_session(
    warmup_url: str,
    data_url: str,
    source_key: str,
    data_headers: dict | None = None,
) -> dict:
    session = requests.Session()
    ok = load_or_warmup(session, warmup_url, source_key)
    if not ok:
        return {"status": "error", "reason": "session_warmup_failed"}

    resp = session.get(data_url, headers=data_headers or {}, timeout=20)
    if resp.status_code != 200:
        # Try force re-warm once (cookie may have expired)
        ok = load_or_warmup(session, warmup_url, source_key, force_refresh=True)
        if ok:
            resp = session.get(data_url, headers=data_headers or {}, timeout=20)
    if resp.status_code != 200:
        return {"status": "error", "reason": f"http={resp.status_code}"}
    return {
        "status": "ok",
        "data": resp.text,
        "fetched_at": datetime.datetime.utcnow().isoformat(),
    }

# Example: hsx.vn F5 BigIP warmup
# fetch_with_session(
#     warmup_url="https://www.hsx.vn/Modules/Listed/Web/StockDocuments",
#     data_url="https://www.hsx.vn/api/some-xhr-endpoint?Ticker=VNM",
#     source_key="hsx-bctc",
# )
```

## RAM Cost

- Session object + cookie store: ~2–5 MB
- Cookie file on disk: <1 KB per source
- No extra process spawned

## F5 BigIP Cookie Specifics (hsx.vn)

hsx.vn sets two F5 cookies on first contact:
- `TS016df111` — load balancer session affinity
- `TS0d710d04` — secondary LB cookie

These are set without JS computation. `requests.Session` handles them automatically. The actual blocker on hsx.vn is not the cookies but the React SPA loading data via client-side XHR — the cookie warmup alone does not expose the data API. Cookie warmup is a pre-condition for the XHR API reverse-engineering path (see `hsx-bctc/triage.md`).

## Known Limits

- Session cookies expire (typically 30 min to 8 hours depending on server config). The `load_or_warmup` function handles staleness via `force_refresh`.
- Login-based sessions require storing credentials securely (env var or secrets file). Never hardcode passwords in scraper scripts.
- Does NOT bypass JS challenges — warmup GET on a Cloudflare-protected landing page will still be blocked. Combine with `cloudflare-js-bypass` if needed.
- Cookie file is unencrypted — ensure scraper scripts run with restricted file permissions (`chmod 600`).
- For Oracle ADF (SSC portal): cookie warmup alone is insufficient because ADF's ViewRoot and session state require full JS execution to initialize.

## Sources Served

- `hsx-bctc` (hsx.vn F5 BigIP warmup — pre-condition for HOSE XHR path)
- Applicable to any VN portal with `anti_bot_type: login_required`

## References

- [hsx-bctc recon doc](docs/vps-sources/hsx-bctc/recon.md)
- [requests.Session docs](https://docs.python-requests.org/en/latest/user/advanced/#session-objects)
- [How to use cookies and sessions in Python scraping — Worth Web Scraping](https://www.worthwebscraping.com/how-to-use-cookies-and-session-in-python-web-scraping/)
- [Scraping ASP.NET platforms — Medium](https://medium.com/@matiasmaquieira96/how-i-scraped-a-complex-asp-net-platform-using-python-1b320c4743d7)
