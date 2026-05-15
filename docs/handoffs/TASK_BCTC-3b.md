---
sprint: BCTC-3
branch: task/bctc-3b-hsx-xhr-fetcher
size: M
zone: vps-scripts/
depends_on: TASK-BCTC-3a
blocks: TASK-BCTC-3c
---

## TLDR

Implement pure Python XHR fetcher for hsx.vn BCTC discovery API. Script accepts ticker/year/quarter, calls `api.hsx.vn/n/api/v1/news/securities/{TICKER}/1`, parses JSON response, filters for BCTC PDFs, constructs full URLs. Integrate as pre-Playwright strategy in `discover-bctc-urls-browser.py`.

---

## [PM] Planning Context

### Zone

**Primary:** `vps-scripts/`

**Secondary:** `vps-scripts/tests/` (unit tests)

### Acceptance Criteria

**AC-1:** `fetch-hsx-bctc.py` exists and fetches BCTC URLs correctly
- [ ] File: `vps-scripts/fetch-hsx-bctc.py` (Python 3.8+)
- [ ] Accepts positional args: `{ticker}`, `{year}`, `{quarter}` (e.g., `./fetch-hsx-bctc.py VNM 2026 1`)
- [ ] Computes `startDate` = quarter start (Q1 → Jan 1), `endDate` = quarter end + 60 days (late filing buffer)
- [ ] Calls `https://api.hsx.vn/n/api/v1/news/securities/{ticker}/1?pageIndex=1&pageSize=20&startDate={YYYY-MM-DD}&endDate={YYYY-MM-DD}`
- [ ] Includes header: `type: HJ2HNS3SKICV4FNE` (from spike doc § 1.3)
- [ ] Parses JSON response, extracts `filePath` + `fileName` fields
- [ ] Filters: only items where `fileName.endswith('.pdf')` AND title contains BCTC keyword ("báo cáo tài chính" or "BCTC") AND year/quarter match
- [ ] Constructs full URL: `filePath.replace("~", "https://staticfile.hsx.vn")`
- [ ] Emits JSON to stdout: `{"results": [{"url": "...", "fileName": "...", "source": "hsx", "confidence": 0.9}], "error": null}`
- [ ] On error: `{"results": [], "error": "<error message>", "statusCode": <int>}`
- [ ] Exit code: 0 on success (even if results empty), 1 on fetch error

**AC-2:** `discover-bctc-urls-browser.py` integrates XHR as strategy 1 (before Playwright)
- [ ] Add new function `_discover_hsx_xhr(ticker, year, quarter)` to `discover-bctc-urls-browser.py`
- [ ] Function calls: `subprocess.run(["python3", "fetch-hsx-bctc.py", ticker, str(year), str(quarter)], capture_output=True, timeout=5)`
- [ ] Parses JSON response, returns list of result dicts (or empty list on error/timeout)
- [ ] Main `discover_bctc_urls()` flow:
  1. Call `_discover_hsx_xhr()` as strategy 1 (first attempt)
  2. If ≥1 result with confidence > 0.7 → return `{"results": [...], "error": null}` immediately
  3. Else → fall through to Playwright (strategy 2)
- [ ] Maintains same `VpsPlaywrightResult` interface for compatibility with `bctcDiscovery.ts`
- [ ] Timeout on XHR fetch: 5s (fail-fast, proceed to Playwright)

**AC-3:** Unit tests pass (mocked HTTP responses)
- [ ] File: `vps-scripts/tests/test_fetch_hsx_bctc.py`
- [ ] Test 1: Valid BCTC JSON response → expect ≥1 result with correct URL + source="hsx"
- [ ] Test 2: Mixed response (1 BCTC PDF + 1 non-BCTC news item) → expect 1 result (only BCTC PDF)
- [ ] Test 3: Response missing `filePath` field → expect 0 results (skip items)
- [ ] Test 4: Quarter computation: Q1 2026 → startDate=2026-01-01, endDate=2026-04-30 (30+31+28+60)
- [ ] Test 5: HTTP 404 response → return `{"error": "...", "statusCode": 404}`, exit code 1
- [ ] Test 6: Timeout (>5s) → return `{"error": "timeout"}`, exit code 1
- [ ] All tests: use `unittest.mock.patch` for requests library (no live HTTP)
- [ ] All tests pass: `python3 -m pytest vps-scripts/tests/test_fetch_hsx_bctc.py -v` → all green

### Files to Read First

- `docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md` § 1 (API endpoints, auth, URL mapping)
- `docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md` § 3 (auth/session details)
- `vps-scripts/discover-bctc-urls-browser.py` — full existing script (integration point)
- `vps-scripts/fetch-bctc.sh` — existing script pattern (reference for subprocess usage)

### Files to Create

- `vps-scripts/fetch-hsx-bctc.py` — main XHR fetcher
- `vps-scripts/tests/test_fetch_hsx_bctc.py` — unit tests with mocked responses

### Files to Modify

- `vps-scripts/discover-bctc-urls-browser.py` — add `_discover_hsx_xhr()` function + integrate strategy 1

### Dependencies

- **Blocking prerequisite (ops):** TASK-BCTC-3a (ops-vps-fetch) — verify hsx.vn /n/ API accessible from VPS before coding starts
  - If ops returns FAIL → escalate BLOCKER (dev-vps-crawls cannot proceed)
  - If PASS → proceed with implementation

### Knowledge Needed

- `docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md` — complete API documentation
- Python 3 `requests` or `urllib3` (for HTTP)
- `subprocess` module (for calling fetch script from discover script)
- JSON parsing + filtering patterns
- VPS deployment details (if needed for manual verification)

---

## Implementation Guidance

### fetch-hsx-bctc.py Interface

```python
#!/usr/bin/env python3
# vps-scripts/fetch-hsx-bctc.py

import sys
import json
import requests
from datetime import datetime, timedelta

def quarter_date_range(year: int, quarter: int) -> tuple:
    """Return (startDate, endDate) for the given quarter, with 60-day buffer for late filings."""
    # Q1: Jan 1 to Apr 30 (Q1 end + 60 days)
    # Q2: Apr 1 to Jul 30
    # Q3: Jul 1 to Oct 30
    # Q4: Oct 1 to Jan 30 (next year)
    ...

def fetch_hsx_bctc(ticker: str, year: int, quarter: int) -> dict:
    """Fetch BCTC URLs from hsx.vn news API."""
    url = "https://api.hsx.vn/n/api/v1/news/securities/{ticker}/1"
    headers = {
        "type": "HJ2HNS3SKICV4FNE",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.hsx.vn/thong-tin-cong-bo",
        "Origin": "https://www.hsx.vn"
    }
    params = {
        "pageIndex": 1,
        "pageSize": 20,
        "startDate": startDate,
        "endDate": endDate
    }
    response = requests.get(url, headers=headers, params=params, timeout=5)
    response.raise_for_status()  # Raise on 4xx/5xx
    data = response.json()
    
    # Parse response, filter, construct URLs
    results = []
    for item in data.get("data", []):
        filePath = item.get("filePath")
        fileName = item.get("fileName", "")
        title = item.get("title", "")
        
        if not filePath or not fileName.endswith('.pdf'):
            continue
        
        # Keyword filtering: check if title has BCTC keywords + year/quarter
        if not _is_bctc_report(title, year, quarter):
            continue
        
        url = filePath.replace("~", "https://staticfile.hsx.vn")
        results.append({
            "url": url,
            "fileName": fileName,
            "source": "hsx",
            "confidence": 0.9
        })
    
    return {"results": results, "error": None}

if __name__ == "__main__":
    try:
        ticker, year, quarter = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
        result = fetch_hsx_bctc(ticker, year, quarter)
        print(json.dumps(result))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"results": [], "error": str(e), "statusCode": 500}))
        sys.exit(1)
```

### _discover_hsx_xhr() Integration Pattern

```python
def _discover_hsx_xhr(ticker: str, year: int, quarter: int) -> dict:
    """Try hsx.vn XHR API as strategy 1 (before Playwright)."""
    try:
        result = subprocess.run(
            ["python3", os.path.join(os.path.dirname(__file__), "fetch-hsx-bctc.py"),
             ticker, str(year), str(quarter)],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode != 0:
            return {"results": [], "error": result.stderr}
        return json.loads(result.stdout)
    except subprocess.TimeoutExpired:
        return {"results": [], "error": "timeout"}
    except Exception as e:
        return {"results": [], "error": str(e)}

def discover_bctc_urls(ticker: str, year: int, quarter: int) -> dict:
    """Discovery flow: XHR first, Playwright fallback."""
    # Strategy 1: hsx.vn XHR
    xhr_result = _discover_hsx_xhr(ticker, year, quarter)
    if xhr_result["results"] and all(r.get("confidence", 0) > 0.7 for r in xhr_result["results"]):
        return xhr_result  # Early exit: high-confidence results
    
    # Strategy 2: Playwright (existing implementation)
    # ... (existing Playwright code unchanged)
    playwright_result = _discover_with_playwright(...)
    return playwright_result
```

---

## Testing Strategy

### Local Unit Tests

Run without VPS access:

```bash
python3 -m pytest vps-scripts/tests/test_fetch_hsx_bctc.py -v
```

Mock responses from `docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md` (if any live response samples are provided in the spike).

### Manual VPS Verification (after ops AC-1 PASS)

Once TASK-BCTC-3a verifies the endpoint accessible:

```bash
ssh vinahost_vps
cd /app/vps-scripts
python3 fetch-hsx-bctc.py VNM 2026 1
# Should output: {"results": [{"url": "...", "source": "hsx", ...}], "error": null}
```

---

## Risks

| Risk | Mitigation |
|------|-----------|
| **ops AC-1 FAIL:** /n/ API not accessible from VPS | dev-vps-crawls waits for ops confirmation before coding. If FAIL, escalate blocker to architect. |
| **API response format differs from spike analysis** | Defensive JSON parsing: use `.get()` for all fields, check type before using |
| **Date range computation bug** | Unit test Test 4 explicitly checks quarter boundaries |
| **Keyword filtering too restrictive** | Start with broad filtering ("báo cáo" OR "BCTC" OR year/quarter present), relax if needed after VPS verification |
| **Timeout handling** | 5s timeout with fail-fast to Playwright fallback — no blocking hangs |

---

## Success Metrics

- AC-1 PASS: fetch-hsx-bctc.py fetches and filters correctly
- AC-2 PASS: discover script integrates XHR as pre-Playwright strategy
- AC-3 PASS: all unit tests green (6 test cases)
- No changes to `bctcDiscovery.ts` (strategy chain remains unchanged)
- Output format compatible with existing `VpsPlaywrightResult` interface

---

## Handoff to TASK-BCTC-3c

After TASK-BCTC-3b ships:
- `vps-scripts/fetch-hsx-bctc.py` is fully tested and working
- `discover-bctc-urls-browser.py` calls hsx XHR as strategy 1
- TASK-BCTC-3c will integrate results into MCP `discover_bctc_urls` tool and perform end-to-end test

---

## PM Notes

- **Effort estimate:** 2h (script 1h + tests 1h)
- **Expected completion:** 2026-05-16 (after ops AC-1 verification)
- **Blocker:** ops-vps-fetch must PASS before dev-vps-crawls starts
- **Handoff test:** Run `python3 -m pytest vps-scripts/tests/test_fetch_hsx_bctc.py -v` → all 6 tests green
