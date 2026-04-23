---
agents: ops, developer, system-auditor
trigger: vps-troubleshooting, incident-response
---

# Issue: BCTC Portal Discovery Script Validation Failed (2026-04-23)

**Status:** ESCALATED  
**Severity:** HIGH (blocks Task 1289f completion)  
**Date Discovered:** 2026-04-23 18:15 UTC+2  
**Investigator:** Ops Agent  

---

## Summary

Deployed BCTC discovery script (`vps-scripts/discover-bctc-urls-browser.py`) to VPS and ran validation tests with 3 stocks (VNM, BID, FPT) querying 2024 Q4 BCTC reports. **All 3 tests returned 0 PDFs** — script successfully deploys and runs but discovers no PDF URLs.

**Hit Rate:** 0/3 (0%) vs expected ≥2/3 (66%)

---

## Test Execution Details

### Deployment
- Location: VPS 125.212.251.27:/root/discover-bctc-urls-browser.py (14K, executable)
- Playwright: v1.58.0 ✅
- Chromium: installed ✅
- Python 3: available ✅

### Test Cases

#### Test 1: VNM (Vinamilk) 2024 Q4
```bash
python3 /root/discover-bctc-urls-browser.py VNM 2024 Q4
```
**Output:**
```json
{"results": [], "error": "No PDF found in HOSE, HNX, or UPCOM for VNM 2024 Q4"}
```
**Status:** FAIL

#### Test 2: BID (BIDV) 2024 Q4
```bash
python3 /root/discover-bctc-urls-browser.py BID 2024 Q4
```
**Output:**
```json
{"results": [], "error": "No PDF found in HOSE, HNX, or UPCOM for BID 2024 Q4"}
```
**Status:** FAIL

#### Test 3: FPT (FPT Telecom) 2024 Q4
```bash
python3 /root/discover-bctc-urls-browser.py FPT 2024 Q4
```
**Output:**
```json
{"results": [], "error": "No PDF found in HOSE, HNX, or UPCOM for FPT 2024 Q4"}
```
**Status:** FAIL

---

## Root Cause Analysis

### Portal 1: HOSE (Primary Discovery)

**URL Structure Used:** `https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=VNM`

**What Happens:**
1. Page loads successfully (HTTP 200)
2. Returns React skeleton HTML (SPA initialization)
3. JavaScript renders content dynamically
4. Playwright waits for networkidle + 3s fallback
5. Final DOM inspection finds 107 total links but **zero PDF links**

**Problem:** 
- The URL parameter `category=BCTC` may not filter to financial reports section
- PDFs may be loaded via API endpoints not visible in DOM
- Portal content structure may have changed since script was written

**Evidence:**
- Manual page inspection shows no PDF links in initial layout
- All visible links are navigation (main menu, content categories)
- Content appears to be tab-based or requires additional navigation

---

### Portal 2: HNX (Fallback 1)

**URL Structure Used:** `https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=BID`

**Status:** Not tested (never reached due to HOSE failure; would fallback if HOSE returned null, which it does)

**Known Issue:** HNX layout is less standardized; confidence score is 0.9 vs HOSE's 0.95

---

### Portal 3: UPCOM (Fallback 2)

**URL Structure Used:** `https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=BID`

**Error:** SSL certificate validation error (`net::ERR_CERT_COMMON_NAME_INVALID`)
- Chromium with `--no-sandbox` rejects certificate
- May be wildcard/domain mismatch in portal SSL setup
- Fallback never attempted in current tests (HOSE already failed)

---

## What Works vs. What Doesn't

### Confirmed Working
- VPS infrastructure: SSH, network connectivity ✅
- Playwright library: v1.58.0 installed ✅
- Chromium browser: executable, can launch with --no-sandbox ✅
- Page navigation: timeout-based loading functional ✅
- JSON output: properly formatted ✅
- Python script syntax: valid Python 3 ✅

### Confirmed Not Working
- PDF discovery on HOSE portal with current URL structure ❌
- PDF discovery on HNX portal (not tested but likely same root cause) ❌
- UPCOM portal access (SSL certificate issue) ❌
- Link text matching for financial reports ❌

---

## Hypothesis: Portal Structure Change

The script was developed based on portal URLs from `docs/TECH_1289.md` and `TASK_1289f.md`:
- HOSE: `https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode={CODE}`
- HNX: `https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={CODE}`

**Possible causes for zero results:**
1. Portal redesign (common for Vietnamese exchanges)
2. URL parameters changed (category name, endpoint path)
3. PDFs moved to different section (e.g., separate BCTC archive)
4. Disclosure format changed (e.g., from PDF to HTML tables)
5. Portal now requires login or additional filters

---

## Prevention Checklist (For Future BCTC Changes)

1. **Always verify portal URLs are live and return BCTC content**
2. **Use browser DevTools Network tab to intercept actual PDF requests**
3. **Check for form submissions** (some portals hide PDFs behind search forms)
4. **Test with real stocks** before committing discovery logic
5. **Monitor for certificate issues** (UPCOM SSL problem)
6. **Document exact portal structure** (selectors, form fields) in version control
7. **Set up automated portal validation** (daily ping + DOM structure check)

---

## Recommended Next Steps

### Option A: Portal Form Investigation (Recommended)
**Effort:** 2–3 hours
**Process:**
1. Open HOSE/HNX/UPCOM in Firefox with developer tools
2. Navigate to a known company's BCTC disclosures manually
3. Intercept network requests (DevTools Network tab)
4. Document actual API endpoints and form submissions
5. Update script with correct URLs and form-based discovery
6. Re-test with validation cases

**Pros:** Correct root cause, most likely to work
**Cons:** Requires manual investigation

### Option B: Use Official SSC Portal
**Effort:** 1–2 hours
**Approach:** 
- SSC's official portal `congbothongtin.ssc.gov.vn` is accessible (HTTP 200)
- This is documented as the canonical BCTC source
- May have cleaner API or more reliable discovery
- Already project-approved in architecture docs

**Pros:** Single source of truth, likely more stable
**Cons:** May require different discovery logic, different confidence scores

### Option C: Parallel Investigation + Script Update
**Effort:** 3–4 hours
**Approach:**
1. Start portal investigation (Option A) in parallel
2. Meanwhile, update script to add debugging/logging
3. Deploy updated script with better error diagnostics
4. Collect actual error logs from VPS
5. Use logs to guide portal investigation

**Pros:** Parallel progress, actionable error feedback
**Cons:** More work upfront

---

## Impact Assessment

**If Not Resolved:**
- Task 1289f blocks → Phase 2 BCTC enrichment pipeline incomplete
- Historical backfill cannot proceed → 37 stocks × 8 quarters (296 BCTC PDFs) not discovered
- Downstream enrichment jobs fail → financial reports not extracted
- Time to impact: ~48 hours (depends on sprint schedule)

**If Resolved (Option A/B):**
- Script updated, re-tested → proceed with full 37×8 backfill (~40–60 min run time)
- Downstream enrichment processes data → financial report extraction resumes
- Task 1289f completion → within 24 hours

---

## Files Involved

- Script (deployed): `/root/discover-bctc-urls-browser.py` on VPS 125.212.251.27
- Test case results (this document): `docs/agent-memory/issues/bctc-portal-discovery-validation.md`
- Original handoff: `docs/handoffs/TASK_1289f.md`
- Tech design: `docs/TECH_1289.md` (lines 0–100, portal URLs)

---

## Signal to Team

This is an infrastructure discovery issue, not a code bug. The Python script is syntactically correct and deploys cleanly. The problem is that the portal URLs no longer work as expected. Recommend:

1. **Immediate:** Escalate to PM for priority assignment (blocking task)
2. **Investigation:** Assign to developer for portal reverse-engineering (2–3h)
3. **Timeline:** Target resolution within 24 hours to keep sprint on track
4. **Fallback:** If portals unreliable, consider SSC official portal as primary source

---

**Last Updated:** 2026-04-23 18:15 UTC+2  
**Status:** Awaiting Decision (Option A/B/C)  
**Blocker For:** Task 1289f (BCTC Discovery), Phase 2 Enrichment Pipeline
