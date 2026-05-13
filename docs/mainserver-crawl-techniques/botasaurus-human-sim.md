# Technique — botasaurus-human-sim

**Problem:** Sites protected by Akamai Bot Manager (hard 403 or silent body drop) that require the `_abck` cookie with sensor data computation, or sites where basic Playwright stealth fails due to advanced fingerprint checks. IMF DataMapper on www.imf.org falls into this category (Akamai hard 403). Also applicable to Akamai-protected FRED web pages (irrelevant since FRED API is available).
**Anti-bot type:** akamai_bot
**Date documented:** 2026-05-13
**RAM cost:** ~400-500MB per Botasaurus Chromium instance

## Solution Approach

**2026 context:** Akamai Bot Manager validates JA3/JA4 TLS fingerprint, `_abck` cookie with sensor data (accelerometer, mouse trajectory, keyboard cadence, scroll velocity), HTTP/2 pseudo-header ordering, and navigator properties. Hard 403 (like IMF DataMapper) means Akamai has rejected the request at the WAF level before JS evaluation.

**Decision tree for IMF:**

1. **Preferred path: IMF WEO API (`api.imf.org`)** — different domain, no Akamai protection observed. Try `https://api.imf.org/external/weo/WEOApr2026/weojson?indicator=NGDP_RPCH&country=VNM` with plain `requests` first.
2. **If WEO API is sufficient:** skip Botasaurus entirely, use `open-api` technique with plain requests (~5MB).
3. **If DataMapper is specifically needed:** Botasaurus with human simulation for `_abck` cookie generation. RAM cost: ~400MB.

Botasaurus wraps undetected-chromedriver or Playwright with human-like behaviors (realistic mouse trajectories, scroll simulation, keystroke timing) and integrates with `hyper-sdk-py` or manual `_abck` sensor data solvers.

## Libraries Required

- `botasaurus` >= 3.2.0 (install: `pip install botasaurus`)
- `requests` >= 2.31.0 (fallback path: `pip install requests`)

## Code Snippet

### Preferred: IMF WEO API (plain requests — try this first)

```python
import requests
from datetime import datetime, timezone
import json

IMF_WEO_BASE = "https://api.imf.org/external/weo"

# Available WEO releases: WEOApr2026, WEOOct2025, etc.
WEO_RELEASE = "WEOApr2026"

INDICATORS = {
    "gdp_growth": "NGDP_RPCH",      # Real GDP growth (%)
    "inflation": "PCPIPCH",          # CPI inflation (%)
    "unemployment": "LUR",           # Unemployment rate (%)
    "current_account": "BCA_NGDPD", # Current account (% GDP)
}

def fetch_imf_weo(indicator: str, country: str = "VNM") -> dict:
    """
    Fetch IMF WEO data via api.imf.org — no Akamai protection.
    This is the PREFERRED path over www.imf.org DataMapper.
    """
    url = f"{IMF_WEO_BASE}/{WEO_RELEASE}/weojson"
    params = {"indicator": indicator, "country": country}
    try:
        resp = requests.get(
            url,
            params=params,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "application/json",
            },
            timeout=15,
        )
        if resp.status_code == 200:
            return {"status": "ok", "data": resp.json(), "fetched_at": datetime.now(timezone.utc).isoformat()}
        return {"status": "error", "reason": f"HTTP {resp.status_code} from api.imf.org"}
    except requests.RequestException as e:
        return {"status": "error", "reason": str(e)}

def fetch_all_imf_vn() -> dict:
    """Fetch all tracked IMF WEO indicators for Vietnam."""
    results = {}
    for name, indicator in INDICATORS.items():
        results[name] = fetch_imf_weo(indicator, "VNM")
    return {"status": "ok", "data": results, "fetched_at": datetime.now(timezone.utc).isoformat()}
```

### Botasaurus fallback (only if api.imf.org is blocked)

```python
from botasaurus.browser import browser, Driver
from datetime import datetime, timezone
import json

@browser(
    headless=True,
    block_images=True,
    reuse_driver=False,  # Always close after fetch — RAM release
)
def fetch_imf_datamapper_botasaurus(driver: Driver, data: dict) -> dict:
    """
    Botasaurus human simulation for IMF DataMapper API.
    Only use if api.imf.org is blocked. RAM cost: ~400MB.
    """
    indicator = data.get("indicator", "NGDP_RPCH")
    country = data.get("country", "VNM")

    # Visit IMF homepage first to warm up _abck cookie
    driver.get("https://www.imf.org/")
    driver.sleep(2)

    # Navigate to DataMapper API
    api_url = f"https://www.imf.org/external/datamapper/api/v1/{indicator}/{country}"
    driver.get(api_url)
    driver.sleep(1)

    content = driver.get_element_or_none("pre")
    if content:
        try:
            return {
                "status": "ok",
                "data": json.loads(content.text),
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }
        except json.JSONDecodeError:
            pass
    return {"status": "error", "reason": "Could not extract DataMapper JSON — Akamai may still be blocking"}

if __name__ == "__main__":
    # Try WEO API first (preferred — no Akamai)
    result = fetch_all_imf_vn()
    if result["status"] == "ok":
        print(json.dumps(result, indent=2))
    else:
        # Fall back to Botasaurus
        print("WEO API failed, trying Botasaurus...")
        result = fetch_imf_datamapper_botasaurus({"indicator": "NGDP_RPCH", "country": "VNM"})
        print(json.dumps(result, indent=2))
```

## RAM Profiling

```bash
# WEO API path (preferred — plain requests):
/usr/bin/time -v python imf_macro_scraper.py 2>&1 | grep "Maximum resident"
# Expected: 25-40MB total

# Botasaurus path (fallback — headless):
/usr/bin/time -v python imf_botasaurus_scraper.py 2>&1 | grep "Maximum resident"
# Expected: 450-600MB total (Python + Chromium + Botasaurus overhead)
# Botasaurus uses undetected-chromedriver or Playwright under the hood
# Peak RAM during page load: ~400-500MB additional above Python base
```

## Known Limits

- IMF DataMapper on `www.imf.org` has hard 403 Akamai block — even Botasaurus may fail without residential proxies + `_abck` sensor data computation.
- **Strongly recommend using `api.imf.org` (WEO API) as primary path** — separate domain, no Akamai observed.
- Botasaurus v3 uses undetected-chromedriver; Akamai's sensor data challenge may require custom `_abck` computation (e.g., via `hyper-sdk-py`) for full bypass.
- `reuse_driver=False` is mandatory — Botasaurus reusing a driver across cycles accumulates RAM.
- Each Botasaurus instance commits ~400-500MB; do NOT run concurrent instances without ops memory budget review.
- WEO release name changes biannually (WEOApr2026, WEOOct2026) — update `WEO_RELEASE` constant.

## Sources Used

- [How to Bypass Akamai 2026 (Scrapfly)](https://scrapfly.io/blog/posts/how-to-bypass-akamai-anti-scraping)
- [Akamai bypass 2026 (DEV.to)](https://dev.to/vhub_systems_ed5641f65d59/how-to-bypass-akamai-bot-detection-in-2026-39lj)
- [Anti-detect browser tools comparison](https://github.com/pim97/anti-detect-browser-tools-tech-comparison)
- [Hyper Solutions SDK (Akamai sensor)](https://github.com/Hyper-Solutions/hyper-sdk-py)
- IMF DataMapper recon doc: `docs/mainserver-sources/imf-datamapper/recon.md`
