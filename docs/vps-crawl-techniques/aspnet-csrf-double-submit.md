# Technique — aspnet-csrf-double-submit

**Problem:** ASP.NET anti-forgery double-submit pattern. Structured JSON APIs (e.g. finance.vietstock.vn) require both a session cookie AND a matching CSRF token in the POST body. Without both, the API returns 400 or empty data.

**Anti-bot type:** none (this is application-level CSRF protection, not bot detection)

**Date documented:** 2026-06-04

## Solution Approach

Two-step urllib opener flow:

1. **Warm session** — GET the HTML page (e.g. `/FPT/ke-hoach-kinh-doanh.htm`) using a `CookieJar`-backed opener. This populates `ASP.NET_SessionId` in the jar and returns the CSRF token embedded in a hidden form input.
2. **Parse token** — the token is in `<input name=__RequestVerificationToken ... value=<TOKEN>>` inside `<form id=__CHART_AjaxAntiForgeryForm>`. Vietstock uses minified HTML — attribute values are UNQUOTED (no quotes around the `value=` assignment). Regex must handle both quoted and unquoted forms.
3. **POST with token** — the same opener (cookie auto-replayed) sends the API POST with `stockCode=<TICKER>&__RequestVerificationToken=<TOKEN>`. Token must match the session cookie — they are paired server-side.

**Critical gotcha — gzip encoding:** urllib's `HTTPHandler` does NOT auto-decompress gzip responses. If you include `Accept-Encoding: gzip` in request headers, the server sends a compressed body that decodes to garbage and CSRF extraction silently fails. Solution: omit `Accept-Encoding` from headers entirely. Add a safety-net check: if `Content-Encoding: gzip` or magic bytes `\x1f\x8b` are detected, decompress with `gzip.decompress()` before decoding.

**Session reuse:** after the first GET, the cookie and token are valid for the entire session lifetime. One GET warms the session; you can then POST multiple endpoints (e.g. `GetData_PlannedTarget` and `GetData_PlannedTarget_ImplementStatus`) within the same opener without a second warmup.

## Libraries Required

- `urllib.request` (stdlib — no pip install needed)
- `http.cookiejar` (stdlib)
- `ssl` (stdlib — CERT_NONE for VPS SSL tolerance)
- `gzip` (stdlib)
- `re` (stdlib)

No third-party libraries required.

## Code Snippet

```python
import urllib.request, http.cookiejar, ssl, gzip, re, json, urllib.parse

# SSL context — CERT_NONE for VPS compatibility
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# Shared CookieJar opener — carries session cookie across calls
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(
    urllib.request.HTTPSHandler(context=ctx),
    urllib.request.HTTPCookieProcessor(jar)
)

# Step 1: GET warmup — OMIT Accept-Encoding to prevent gzip
req1 = urllib.request.Request(
    'https://finance.vietstock.vn/FPT/ke-hoach-kinh-doanh.htm',
    headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9',
    }
)
resp1 = opener.open(req1, timeout=30)
raw1 = resp1.read()
# Safety-net gzip decompress
if raw1[:2] == b'\x1f\x8b':
    raw1 = gzip.decompress(raw1)
body1 = raw1.decode('utf-8', errors='replace')

# Step 2: Extract CSRF token (handles both unquoted and quoted attribute values)
TOK = r'[A-Za-z0-9_\-]{20,}'
m = re.search(
    r'name=(?:["\'])?__RequestVerificationToken(?:["\'])?[^>]*?'
    r'value=(?:["\'])?(' + TOK + r')(?:["\'\s>])',
    body1, re.IGNORECASE
)
csrf_token = m.group(1) if m else None

# Step 3: POST with token (cookie auto-replayed from jar)
data = urllib.parse.urlencode({
    'stockCode': 'FPT',
    '__RequestVerificationToken': csrf_token,
}).encode('utf-8')
req2 = urllib.request.Request(
    'https://finance.vietstock.vn/Data/GetData_PlannedTarget',
    data=data,
    headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Referer': 'https://finance.vietstock.vn/FPT/ke-hoach-kinh-doanh.htm',
    }
)
resp2 = opener.open(req2, timeout=30)
raw2 = resp2.read()
if raw2[:2] == b'\x1f\x8b':
    raw2 = gzip.decompress(raw2)
result = json.loads(raw2.decode('utf-8', errors='replace'))
# result['data']['Data_Results'] = [{StockCode, PTID, PTName, YearPeriod, Value}, ...]
```

## Scraper on VPS

`/root/vietstock-agm-plan.py` — full implementation covering batch ticker sweep, plan + actuals endpoints.

Endpoint: `GET VPS:8765/proxy/agm-plan?ticker=FPT` or `?batch=FPT,VIC,ACB`

## Known Limits

- Token is session-scoped and rotates. Re-warmup required if session expires (not an issue for single-run sweep; use one opener across all tickers).
- Minified HTML attribute parsing: value is UNQUOTED — must match `value=TOKEN>` not `value="TOKEN"`. Handled by regex alternation in the scraper.
- `Accept-Encoding: gzip` causes silent failure (urllib does not auto-decompress). OMIT this header.
- PTID availability varies by sector: banks report LNTT+LNST but no revenue plan (no PTID=5). Filter by PTName, not PTID alone.
- VPS SSL context uses `CERT_NONE` — suitable for scraping, not for production auth contexts.

## References

- Vietstock recon: `docs/vps-sources/vietstock-agm-plan/recon.md`
- Scraper: `vps-scripts/vietstock-agm-plan.py`
- Sprint: RAPID-DATA-LAYER / FIX-G (2026-06-04)
