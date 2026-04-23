# Task 1297: BCTC Discovery Script Deployment & Validation

**Status**: FAILED (0/3 tests passed)  
**Executed**: 2026-04-23 19:16–19:30 UTC+7  
**Agent**: Ops (VPS deployment & validation)

---

## Execution Summary

### Deployment Phase
- **Script**: `vps-scripts/discover-bctc-urls-browser.py`
- **Target**: Vinahost VPS (`root@125.212.251.27:/root/`)
- **Method**: sshpass SCP + direct execution
- **Result**: ✓ Script deployed successfully

**Environment Verified**:
```
Python:          3.12.3
Playwright:      1.58.0 (installed)
Chromium:        Available (--no-sandbox verified)
ChromeDriver:    Ready
Script perms:    755 (executable)
```

### Validation Phase
Tested 3 stocks against Q4 2024 annual reports:

#### Test 1: VNM (Vinhomes)
```bash
Command: python3 /root/discover-bctc-urls-browser.py VNM 2024 Q4
Result:  {"results": [], "error": "No PDF found in HOSE, HNX, or UPCOM for VNM 2024 Q4"}
Status:  FAILED ✗
```

#### Test 2: BID (BIDV)
```bash
Command: python3 /root/discover-bctc-urls-browser.py BID 2024 Q4
Result:  {"results": [], "error": "No PDF found in HOSE, HNX, or UPCOM for BID 2024 Q4"}
Status:  FAILED ✗
```

#### Test 3: FPT (FPT Software)
```bash
Command: python3 /root/discover-bctc-urls-browser.py FPT 2024 Q4
Result:  {"results": [], "error": "No PDF found in HOSE, HNX, or UPCOM for FPT 2024 Q4"}
Status:  FAILED ✗
```

**Success Metric**: ≥2/3 stocks return valid URL + PDF path  
**Actual Result**: 0/3 success  
**Verdict**: ✗ VALIDATION FAILED

---

## Root Cause Analysis

### Issue 1: HOSE Portal 404
```
URL:        https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=VNM
HTTP Status: 200 (but body contains 404 error page)
Page Title: "HOSE - 404 - Không tìm thấy trang" (Page not found)
PDF Links:  0 found in DOM
```

**Diagnosis**: The `category=BCTC&issuerCode={CODE}` query parameter structure appears to be outdated or incorrect. HOSE responds with HTTP 200 but serves an error page body, indicating the routing is broken on this endpoint.

### Issue 2: HNX No PDF Links
```
URL:        https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=BID
HTTP Status: 200 (valid page load)
PDF Links:  0 found in DOM after wait
Page Content: No BCTC/financial report references detected
```

**Diagnosis**: HNX portal loads successfully but PDFs are either:
1. Not present on the company info page (may be at different URL)
2. Fetched dynamically via AJAX/API after page load
3. Behind authentication or interaction walls not covered by script's wait logic

### Issue 3: UPCOM SSL Certificate Error
```
URL:        https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=FPT
Error:      net::ERR_CERT_COMMON_NAME_INVALID
Chromium:   Fails during page.goto() at timeout
```

**Diagnosis**: UPCOM subdomain has an invalid TLS certificate. Playwright refuses to proceed without `--insecure` flag or certificate bypass.

---

## Detailed Observations

### Playwright Wait Strategy (Working as Designed)
The script correctly implements a 3-retry wait loop:
```python
for attempt in range(3):
    try:
        await page.wait_for_function(
            "() => document.querySelectorAll('a[href*=\".pdf\"]').length > 0",
            timeout=2000
        )
```
- Retries 3 times with 2-second wait between
- Timeout: 30 seconds per page load
- Logs: Properly outputs debugging info to stderr

**Conclusion**: Wait strategy is sound. PDFs simply are not rendered in the expected DOM structure.

### Script Code Quality
- ✓ Proper async/await pattern
- ✓ Error handling for timeouts and exceptions
- ✓ JSON output format (structured, parseable)
- ✓ Quarter/year matching logic (comprehensive, handles Vietnamese variants)
- ✗ No SSL verification bypass (UPCOM fails hard)
- ✗ Hardcoded URLs with no fallbacks

---

## Failure Classification

| Category | Finding |
|----------|---------|
| **Script Deployment** | ✓ Success — correctly copied, executable, dependencies installed |
| **Script Execution** | ✓ Success — runs without crashes, outputs valid JSON |
| **Discovery Logic** | ✗ Failure — hardcoded URLs incorrect, PDFs not found |
| **Portal Compatibility** | ✗ Failure — HOSE/HNX/UPCOM structure doesn't match script assumptions |

**Overall Verdict**: Script is **technically sound but functionally incorrect** due to outdated portal URLs and structure assumptions.

---

## Blocking Issues

This task cannot pass validation without addressing:

1. **HOSE URL Fix** (Priority: CRITICAL)
   - Current: `https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=VNM`
   - Issue: Returns 404 error page
   - Required: Determine current correct HOSE BCTC disclosure URL

2. **HNX PDF Discovery** (Priority: HIGH)
   - Current: Assumes PDFs in DOM after `networkidle`
   - Issue: No PDFs in rendered HTML
   - Required: Check if HNX serves PDFs via API or different page structure

3. **UPCOM SSL Handling** (Priority: MEDIUM)
   - Current: Standard Playwright navigation fails
   - Issue: Invalid TLS certificate on upcom.hnx.vn
   - Required: Add `--disable-blink-features=AutomationControlled` or `ignore-certificate-errors` flag

---

## Recommendation

**Do NOT proceed with task 1289f (BCTC PDF download) until**:
1. Developer/Architect confirms current HOSE/HNX/UPCOM disclosure URLs
2. Script is updated with correct endpoint URLs
3. Retest with at least 2/3 stocks returning valid URLs

**Alternative Path** (if urgent):
- Continue using existing `fetch-bctc.sh` + `enrich-bctc-urls.sh` pipeline
- This discovery script appears to be exploratory Option A for Task 1289
- Option B (API approach) may be more reliable if portals expose discovery APIs

---

## Appendix: Raw Test Outputs

### VNM Test Output
```json
{
  "results": [],
  "error": "No PDF found in HOSE, HNX, or UPCOM for VNM 2024 Q4"
}
```

### BID Test Output
```json
{
  "results": [],
  "error": "No PDF found in HOSE, HNX, or UPCOM for BID 2024 Q4"
}
```

### FPT Test Output
```json
{
  "results": [],
  "error": "No PDF found in HOSE, HNX, or UPCOM for FPT 2024 Q4"
}
```

### Diagnostic Logs
```
HOSE page load status: 200
No PDFs found with primary selector for VNM, trying alternatives
Total links found: 107
HOSE: 0 PDF links found for VNM

HNX page load status: 200
No PDFs with primary selector for HNX VNM, trying alternatives
HNX: Total links found: 74
HNX: 0 PDF links found for VNM

UPCOM discovery error for VNM: Page.goto: net::ERR_CERT_COMMON_NAME_INVALID at https://upcom.hnx.vn/...
```

---

## Handoff

**Component**: `vps-scripts/discover-bctc-urls-browser.py`  
**State**: Deployed on VPS, validation FAILED  
**Next Agent**: Developer (investigate portal URLs)  
**Blocker**: Task 1289f (BCTC download) cannot proceed until URLs fixed  

**Action Items for Developer**:
1. Investigate HOSE portal for current BCTC disclosure endpoint
2. Test HNX portal structure (may need API discovery)
3. Fix or bypass UPCOM SSL certificate issue
4. Update `discover_from_hose()`, `discover_from_hnx()`, `discover_from_upcom()` with correct URLs
5. Retest with 3 stocks before marking complete

---

Generated: 2026-04-23 19:30 UTC+7 by Ops Agent
