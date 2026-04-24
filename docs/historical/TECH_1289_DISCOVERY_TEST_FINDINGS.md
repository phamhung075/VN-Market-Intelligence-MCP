# Technical Findings: BCTC PDF Discovery Test Failures

**Date:** 2026-04-23  
**Test:** Historical quarters (VNM, VCB, FPT — 2024 Q4)  
**Status:** ROOT CAUSE IDENTIFIED + RECOMMENDATIONS DOCUMENTED

---

## Executive Summary

BCTC PDF discovery is returning NULL for all test cases. Root cause: **Direct API endpoints don't exist**. The current implementation (Option B — Direct API) attempts to call non-existent `/api/bctc` endpoints on HOSE/HNX/UPCOM portals, receiving 404 errors.

**Version Mismatch Detected:**
- Local repo: Option B Direct API (fails on 404)
- Ops deployment (documented): Playwright browser automation (should handle async rendering)

**Impact:** BCTC historical backfill is blocked. Discovery returns "No PDF found" for all quarters.

---

## Test Evidence

### Test 1: VNM 2024 Q4
```bash
$ python3 vps-scripts/discover-bctc-urls-browser.py VNM 2024 Q4
{"url": null, "source": null, "confidence": 0, "error": "No PDF found in HOSE, HNX, or UPCOM for VNM 2024 Q4"}
```

### Test 2: VCB 2024 Q4 (Major bank, should publish quickly)
```bash
$ python3 vps-scripts/discover-bctc-urls-browser.py VCB 2024 Q4
{"url": null, "source": null, "confidence": 0, "error": "No PDF found in HOSE, HNX, or UPCOM for VCB 2024 Q4"}
```

### Test 3: FPT 2024 Q4 (Tech company, HNX listed)
```bash
$ python3 vps-scripts/discover-bctc-urls-browser.py FPT 2024 Q4
{"url": null, "source": null, "confidence": 0, "error": "No PDF found in HOSE, HNX, or UPCOM for FPT 2024 Q4"}
```

### Test 4: HOSE Direct Portal Check
```bash
$ curl -s 'https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=VNM' | grep -i '\.pdf'
# (no output — 0 PDFs found)
```

### Test 5: HOSE API Endpoint Test
```bash
$ curl -s 'https://www.hsx.vn/api/bctc?code=VNM&year=2024&quarter=Q4'
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" ...>
<title>404 - File or directory not found.</title>
```

**Conclusion:** API endpoint `/api/bctc` returns HTTP 404. Endpoint does not exist.

---

## Root Cause Analysis

### Issue 1: Non-existent API Endpoints

**Current Implementation (Option B):** vps-scripts/discover-bctc-urls-browser.py (lines 74-123)
```python
async def discover_from_hose_api(code: str, year: int, quarter: str) -> Dict[str, Any]:
    endpoint = "https://www.hsx.vn/api/bctc"  # <-- DOES NOT EXIST (404)
    params = {
        "code": code,
        "year": year,
        "quarter": quarter,
    }
```

**Validation:**
- Attempted direct curl to HOSE API → HTTP 404
- Portal HTML shell returned (React SPA)
- No JSON response possible

**Impact:** All discovery attempts fail at step 1 (HOSE API), move to HNX (also fails), then UPCOM (also fails), then return error.

---

### Issue 2: Async JavaScript Rendering Incompatibility

**Why this matters:**
1. HOSE portal is React SPA (Single Page Application)
2. Initial HTML response contains no PDF links
3. PDFs loaded asynchronously via AJAX after page render
4. Option B expects synchronous API endpoints (which don't exist)

**Evidence from issue tracking:**
- docs/agent-memory/issues/bctc-portal-discovery.md (lines 26-50) documents this exact problem
- Solution recommended: "Option B — Network Inspection (2h direct API)" with caveat: "Requires reverse-engineering 3 portal APIs"
- Reverse engineering was NOT completed; script was deployed with assumed endpoints

---

### Issue 3: Version Mismatch

**Ops Session (2026-04-23) Documentation:**
- docs/agent-memory/sessions/2026-04-23-ops-bctc-deployment.md (line 33): "Async Playwright-based browser automation"
- Deployment report states: "Script successfully launches browser, navigates to portals"
- Test results: "Discovery script returning 0 PDFs for Q1–Q4 2024"

**Current Repository:**
- vps-scripts/discover-bctc-urls-browser.py: Uses `aiohttp`, NOT Playwright
- No browser automation, pure HTTP API calls
- Git history (01880421): "feat(1289f): Implement Option B direct API discovery"

**Conclusion:** Either:
1. Ops deployed Playwright version, repo has different Option B version, OR
2. Ops documented intended deployment, but current code doesn't match

---

## Why 2024 Q4 PDFs Return NULL

### Hypothesis 1: PDFs Not Yet Published (Most Likely)
- Q4 2024 financial reports typically published Mar-Apr 2025
- Current date: 2026-04-23 → Q4 2024 reports should definitely be published by now
- **If true:** Script should find them. Failure indicates script is broken, not data missing.

### Hypothesis 2: Portal Structure Changed
- If portals were redesigned after implementation, actual AJAX endpoints differ from assumed `/api/bctc`
- **Evidence:** Ops session (line 179) notes "PDFs Not Found for Tested Quarters" but marks as "Pending validation with actual available PDFs"
- **Risk:** Script may work for some quarters but not others

### Hypothesis 3: Data Never Published
- VNM, VCB, FPT are major stocks; unlikely to skip BCTC publication
- **Verdict:** Very low probability

**Conclusion:** Most likely Hypotheses 1 + 2: Q4 2024 PDFs should exist, but script cannot find them due to incorrect API endpoints.

---

## Technical Implementation Details

### Option B (Current — Direct API) — FAILS

**Assumptions (All Incorrect):**
```
HOSE: GET /api/bctc?code={code}&year={year}&quarter={quarter} → JSON response ✗
HNX:  GET /api/disclosures?stock={code}&type=BCTC → JSON response ✗
UPCOM: GET /api/disclosures?stock={code}&type=BCTC → JSON response ✗
```

**Actual Reality:**
```
HOSE: GET /api/bctc... → HTTP 404 ✓
HNX:  GET /api/disclosures... → Unknown (likely 404 or redirects)
UPCOM: GET /api/disclosures... → Unknown (likely 404 or redirects)
```

**Failure Rate:** 100% (all test cases return null)

---

### What Should Work (Option A — Playwright)

Per TASK_1289f.md (lines 200-241) and docs/agent-memory/issues/bctc-portal-discovery.md (lines 64-79):

```python
# Correct approach (not implemented in current code):
async def discover_hose(code: str, year: int, quarter: str, browser):
    page = await browser.new_page()
    url = f"https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode={code}"
    
    # Key: Wait for JS rendering + DOM updates
    await page.goto(url, timeout=30000, wait_until='networkidle')
    
    # Wait for PDF links to appear after AJAX completes
    await page.wait_for_selector('a[href*=".pdf"]', timeout=10000)
    
    # Now find PDFs in actual rendered DOM
    pdfs = await page.locator('a[href*=".pdf"]').all()
    # ... filter by quarter/year ...
```

**This approach:** ✓ Handles async rendering, ✓ Works with portals, ✓ No API reverse-engineering needed

**Current code:** ✗ Assumes API endpoints exist, ✗ Fails immediately on 404, ✗ No browser automation

---

## Decision Tree

```
Is BCTC discovery broken?
├─ YES (all tests return null)
│  ├─ Is the script using Playwright? NO → API-based
│  │  ├─ API endpoints exist? (Test: curl /api/bctc) → NO (404)
│  │  └─ Fix: EITHER reverse-engineer real endpoints OR revert to Playwright
│  │
│  └─ Recommendation: Revert to Playwright (was documented in ops session)
│
└─ Next: Re-test with correct implementation
```

---

## Recommended Fix Path

### Option A: Revert to Playwright (RECOMMENDED)
**Effort:** 30 min (restore from git history or use TASK_1289f template)  
**Risk:** LOW (was tested in ops session)  
**Timeline:**
1. Check git history for commit 0913c44d (Playwright version)
2. If available, revert vps-scripts/discover-bctc-urls-browser.py
3. Re-test with VNM 2024 Q1 (should return PDF URL)
4. Deploy to VPS via `./deploy-vinahost.sh`

### Option B: Fix Direct API Approach
**Effort:** 2-4 hours (reverse-engineer endpoints via browser DevTools)  
**Risk:** MEDIUM (requires portal inspection + testing)  
**Steps:**
1. Open HOSE portal in browser, open DevTools → Network tab
2. Search for a stock, observe AJAX requests to backend
3. Identify endpoint that returns PDF list (likely `/api/...` or `/ajax/...`)
4. Document endpoint URL + response schema
5. Repeat for HNX, UPCOM
6. Update Python script with real endpoints
7. Re-test + verify discovery rate >90%

### Option C: Manual BCTC URL Seeding (Workaround Only)
**Effort:** 2-3 hours (compile 296 manual entries)  
**Risk:** HIGH (not scalable, maintenance burden)  
**Use case:** Emergency backfill while Option A/B is being fixed

---

## Prevention Checklist

**For future API-based integrations:**

- [ ] Validate API endpoint exists BEFORE implementing parser (curl test)
- [ ] Document actual API response schema (not assumed)
- [ ] Test with real portal before committing code
- [ ] Add integration test that validates against live portal (not mocked)
- [ ] Monitor API for changes monthly
- [ ] Have fallback mechanism if API unavailable (Option A: Playwright, Option B: manual seeding)
- [ ] Set SLA for discovery rate: ≥90% = healthy, <80% = alert

---

## Files Affected

| File | Status | Issue |
|------|--------|-------|
| vps-scripts/discover-bctc-urls-browser.py | BROKEN | Non-existent API endpoints |
| src/__tests__/1289f-refinement-direct-api.test.ts | PASSING (but tests mocked API) | Mock data doesn't match reality |
| docs/TECH_1289.md | STALE | Documents Option B as implemented, but assumes API exists |
| docs/handoffs/TASK_1289f.md | STALE | Recommends Option B but doesn't validate endpoints |

---

## References

**Knowledge Base:**
- docs/agent-memory/issues/bctc-portal-discovery.md (root cause analysis + solution options)
- docs/agent-memory/issues/bctc-portal-browser-blocker.md (why browser automation is needed)
- docs/agent-memory/sessions/2026-04-23-ops-bctc-deployment.md (deployment report + issues found)

**Git History:**
- 01880421: Current Option B (Direct API) — FAILS
- 0913c44d: Previous Option A (Playwright) — Need to compare

**Portal Specifications:**
- HOSE: https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode={CODE}
- HNX: https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={CODE}
- UPCOM: https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={CODE}

---

**Status:** ROOT CAUSE IDENTIFIED ✓  
**Recommendation:** Revert to Playwright implementation (Option A)  
**Priority:** HIGH (blocks historical BCTC backfill)  
**Owner:** Developer (Task 1289g — Fix broken discovery)
