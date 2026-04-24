# BCTC Discovery Script Validation Report

**Date:** 2026-04-23
**Task:** 1289f (Playwright/Chromium JS rendering for BCTC PDF discovery)
**Status:** Code ready for VPS deployment + testing

## Script Validation Summary

Updated script: `vps-scripts/discover-bctc-urls-browser.py` (388 lines)

### Code Quality Checklist

| Item | Status | Notes |
|------|--------|-------|
| **Hybrid wait strategy** | ✓ | Lines 116–123, 176–183, 239–246: `wait_for_function` + fallback |
| **All 3 portals covered** | ✓ | HOSE, HNX, UPCOM each have dedicated functions |
| **JSON output contract** | ✓ | Fields: url, source, confidence, page_title, error |
| **Confidence scoring** | ✓ | HOSE=0.95, HNX=0.9, UPCOM=0.85 |
| **Quarter/year matching** | ✓ | Supports English (Q1, Q2) + Vietnamese (quý 1, kỳ 1) |
| **URL validation** | ✓ | Checks .pdf extension, HTTP(S), blocks XSS (JS/data URIs) |
| **Error handling** | ✓ | Returns graceful JSON on all failure paths |
| **Async/await** | ✓ | Proper cleanup (await browser.close(), page.close()) |

### Implementation Details

#### Wait Strategy (Hybrid Approach)

**Problem:** HOSE/HNX/UPCOM are React-rendered CSR portals. Network is idle, but PDF links load via AJAX after initial page load.

**Solution:** Two-stage detection
1. Primary: `wait_for_function()` waits up to 3 seconds for PDFs to appear in DOM
2. Fallback: If detection times out, wait 2 more seconds unconditionally

```python
try:
    await page.wait_for_function(
        "() => document.querySelectorAll('a[href*=\".pdf\"]').length > 0",
        timeout=3000
    )
except PlaywrightTimeoutError:
    await page.wait_for_timeout(2000)
```

**Benefit:** Eliminates false negatives from slow JS rendering while preventing infinite waits.

#### Portal-Specific Detection

**HOSE (lines 95–158)**
- URL: `https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode={CODE}`
- Confidence: 0.95 (highest quality, standardized layout)
- Matching: Any quarter+year match in link text
- URL resolution: Relative URLs prefixed with `https://www.hsx.vn`

**HNX (lines 160–221)**
- URL: `https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={CODE}`
- Confidence: 0.9 (less standardized)
- Matching: Requires either (quarter+year) OR (keyword: "bctc", "báo cáo tài chính", "bc/bđhs")
- URL resolution: Relative URLs prefixed with `https://hnx.vn`

**UPCOM (lines 223–283)**
- URL: `https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={CODE}`
- Confidence: 0.85 (lowest, less liquid market)
- Matching: Same as HNX
- URL resolution: Relative URLs prefixed with `https://upcom.hnx.vn`

#### Quarter Matching Logic (lines 285–319)

Supports multiple formats:
- English: `Q1`, `q1`, `quarter 1`, `quarter1`
- Vietnamese: `quý 1`, `qúy 1`, `q1ỳ`, `kỳ 1`

Example matches:
- "BCTC Q1 2024" → ✓ matches Q1 2024
- "Báo cáo tài chính 2024 quý 1" → ✓ matches Q1 2024
- "BCTC Q2 2024" → ✗ does not match Q1 2024

#### URL Validation (lines 322–346)

Checks:
- Must end with `.pdf`
- Must be `http://` or `https://` (blocks `file://`, `data:`, `javascript:`)
- XSS prevention: Blocks any data URIs, JS protocols

### Error Handling Paths

| Scenario | Response | Example |
|----------|----------|---------|
| **Browser launch fails** | JSON with error message | `{"results": [], "error": "Browser launch failed: ..."}`  |
| **Portal timeout (networkidle)** | Skip portal, try next | Moves HOSE → HNX → UPCOM |
| **JS detection times out** | Fallback wait 2s, continue | Tolerates slow rendering |
| **No PDFs on page** | Skip portal | Returns `None`, tries next |
| **All portals exhausted** | JSON with error | `{"results": [], "error": "No PDF found in HOSE, HNX, or UPCOM..."}` |
| **Invalid CLI args** | Usage message + exit 1 | Requires: `CODE YEAR QUARTER` |

### Test Plan

**Expected outcome:** ≥2 PDFs found across 3 test stocks (>66% success rate)

```bash
# Test Case 1: VNM (blue-chip, high likelihood)
python3 /root/discover-bctc-urls-browser.py VNM 2024 Q4
# Expected: HOSE result with 0.95 confidence

# Test Case 2: BID (banking stock, should be in HNX/HOSE)
python3 /root/discover-bctc-urls-browser.py BID 2024 Q4
# Expected: HOSE or HNX result

# Test Case 3: FPT (tech, may be in multiple exchanges)
python3 /root/discover-bctc-urls-browser.py FPT 2024 Q4
# Expected: HOSE result with 0.95 confidence
```

**Validation criteria:**
- All results should have `confidence >= 0.85`
- Source should be one of: `HOSE`, `HNX`, `UPCOM`
- URL should be valid, resolvable, end with `.pdf`
- error field should be `null` on success

### Deployment Readiness

**Prerequisites on VPS:**
- Python 3.9+
- Playwright installed: `pip install playwright`
- Chromium installed: `python3 -m playwright install chromium`

**Script location:** `/root/discover-bctc-urls-browser.py`

**Integration point:** Called by `vn-bctc-fetch.service` during discovery phase of BCTC PDF fetching pipeline.

## Next Steps (OPS Team)

1. **Deploy:** SCP script to VPS `/root/`
2. **Test:** Run 3 test cases (VNM, BID, FPT × 2024 Q4)
3. **Validate:** Confirm ≥2 PDFs found, all confidence ≥ 0.85
4. **Integrate:** If passing, update `enrich-bctc-urls.sh` to call this script in discovery phase
5. **Fallback:** If failing (0 PDFs), escalate to Task 1289g (Puppeteer/Node.js alternative)

## Related Tasks

- **Task 1289f:** Playwright/Chromium discovery (this task)
- **Task 1289e:** Discovery pipeline (enrich-bctc-urls.sh integration)
- **Task 1289g:** Puppeteer fallback (if Playwright fails)
- **Task 1289d:** Handoff documentation
- **Task 1289c:** RED test suite
- **Task 1289b:** RED test suite for validation error handling
- **Task 1289a:** Foreign flow parse error root-cause fix

## Code Location

- **Main script:** `vps-scripts/discover-bctc-urls-browser.py`
- **Deployment target:** `root@125.212.251.27:/root/discover-bctc-urls-browser.py`
- **Test commands in:** `docs/handoffs/DEPLOY_BCTC_DISCOVERY_1289f.md`
