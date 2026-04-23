# Handoff: Task 1289g — BCTC Portal Discovery Reverse-Engineering

**Status:** ESCALATED
**Blocker For:** Task 1289f (BCTC Discovery), Phase 2 Enrichment Pipeline
**Assigned To:** Developer
**Effort Estimate:** 2–3 hours
**Success Criteria:** ≥2/3 validation tests pass (66% hit rate)
**Timeline:** Target 24-hour resolution

---

## TL;DR

**The Blocker:**
Deployed BCTC discovery script (`vps-scripts/discover-bctc-urls-browser.py`) passed syntax validation and deploys cleanly to VPS, but produces **zero PDF discoveries** across all 3 validation tests (VNM, BID, FPT querying 2024 Q4 reports). Root cause: hard-coded portal URLs no longer return BCTC PDF links in discoverable DOM elements. This blocks the full historical backfill (37 stocks × 8 quarters = 296 PDFs, 40–60 min runtime).

**Why It Matters:**
- Validation tests currently at 0/3 (0% hit rate, target ≥66%)
- Full BCTC enrichment pipeline cannot proceed without verified PDF discovery
- 37 stocks across 8 quarters remain unprocessed
- Phase 2 feature incomplete, sprint blocked

**Expected Effort:**
2–3 hours of manual browser investigation + script updates. Most likely cause: Vietnamese stock exchange portals (HOSE, HNX, UPCOM) underwent redesigns or API changes since the script was written.

---

## Investigation Protocol

### Phase 1: Setup & Manual Portal Inspection

**1.1 Open HOSE Portal in Firefox with DevTools**

```bash
# On your local machine (not VPS), open Firefox and navigate to:
https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=VNM
```

**What You'll See:**
- Page loads to React skeleton (SPA initialization)
- JavaScript renders dynamically
- Initial DOM may show only navigation links, not BCTC PDFs

**Expected Page Structure:**
- Left sidebar: Stock list or navigation
- Main content area: Article/document list
- Possible filters: by year, quarter, document type
- Target: List of BCTC PDFs for the selected stock

**1.2 Open DevTools and Enable Network Tab**

```
Firefox: Press F12 or Ctrl+Shift+I
Navigate to: Network tab
Reload page: F5 (Ctrl+R on Windows/Linux)
```

**What to Look For:**
- **Network Requests:** Intercept all XHR/Fetch calls (filter: XHR)
- **API Endpoints:** Note any API calls containing "BCTC", "báo cáo", "PDF", or stock code
- **Form Submissions:** Any POST requests to search/filter endpoints
- **PDF Direct Links:** Search for `.pdf` in Network tab (filter by type or URL pattern)

**Example:** If you see a request like:
```
GET https://www.hsx.vn/api/disclosures?code=VNM&category=BCTC&year=2024
```
This is the discovery endpoint you need to document.

**1.3 Manually Navigate to VNM 2024 Q4 BCTC Report**

Using the portal UI, try to locate a BCTC PDF for VNM:
- Click through filters/tabs to find "2024" and "Q4" or "Quý 4"
- Right-click on the PDF link you find (if any)
- Copy link address → this is the **actual PDF URL** the portal serves

**Document in a text file:**
```
PORTAL: HOSE
STOCK: VNM
QUARTER: Q4
YEAR: 2024
NAVIGATION PATH: [describe button clicks/menu items you used]
PDF LINK FOUND: [URL or "NOT FOUND"]
ACTUAL API ENDPOINT: [if you found one in Network tab]
```

---

### Phase 2: Portal-by-Portal Reverse-Engineering

Test three portals in order. If HOSE works, you can stop. If not, proceed to HNX and UPCOM.

#### Portal 1: HOSE (Primary) — Highest Priority

**Portal URL:** `https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=VNM`

**Known Issues from Validation Report:**
- Page loads (HTTP 200) and renders successfully
- 107 links found in DOM but zero contain `.pdf`
- Filter parameter `category=BCTC` may not work as expected

**Investigation Steps:**

1. **Check if category parameter is correct:**
   - Try removing `category=BCTC`: `https://www.hsx.vn/Modules/CMS/Web/ArticleList?issuerCode=VNM`
   - Try alternate category values: `category=BCĐH`, `category=financial-reports`, `category=báo-cáo`
   - Check DevTools Network tab for any 404 or redirect responses

2. **Look for AJAX/API endpoints:**
   - In DevTools Network tab, filter for XHR requests
   - Look for URLs containing: `disclosure`, `report`, `bctc`, `financial`
   - Check if data is loaded from a separate API call (e.g., `/api/disclosures` or `/ajax/get-pdfs`)
   - Document the exact API call: method (GET/POST), parameters, response structure

3. **Inspect the page source for hidden content:**
   - Right-click → View Page Source (Ctrl+U)
   - Search for `.pdf` in the source
   - Search for URLs containing stock code and year/quarter
   - Look for JavaScript data objects that might contain PDF URLs before rendering

4. **Check for form-based discovery:**
   - Are there input fields for "Stock Code", "Year", "Quarter"?
   - If yes, try submitting the form and watching Network tab
   - Document form action URL and field names

5. **Look for pagination or dynamic loading:**
   - Does content load in chunks or tabs?
   - Click through tabs (if any) and check if PDFs appear
   - Look for "Load More" buttons or infinite scroll

**Success Indicators:**
- You find at least one PDF URL for VNM 2024 Q4
- You can repeat the process for BID and FPT and find their PDFs
- You document the API endpoint or URL structure pattern

**Failure Indicators:**
- Portal returns 404 for the given URL pattern
- Page loads but shows "No disclosures found" message
- PDFs are gated behind login or additional navigation

**If HOSE Fails:** Proceed to Portal 2 (HNX)

---

#### Portal 2: HNX (Fallback 1) — Secondary Priority

**Portal URL:** `https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=BID`

**Known Issues:**
- Less standardized layout than HOSE (confidence 0.9 vs 0.95)
- Same validation test failure pattern
- May have different URL structure for BCTC documents

**Investigation Steps:**

1. **Test the URL as-is:** Navigate to it in Firefox, see if any PDFs appear in DOM
2. **Check for category filters:** Try adding `&category=BCTC` or `&type=financial`
3. **Look for separate BCTC section:** Some portals have dedicated BCTC pages:
   - Try: `https://hnx.vn/cong-bo-thong-tin/` (root disclosure page)
   - Look for menu items or breadcrumbs leading to "BCTC" or "Báo cáo tài chính"
4. **Repeat DevTools investigation:** Network tab, API endpoints, form submissions
5. **Document findings in same format as HOSE**

**If HNX Succeeds:** Document it and test one more stock (FPT) to confirm pattern

**If HNX Fails:** Proceed to Portal 3 (UPCOM)

---

#### Portal 3: UPCOM (Fallback 2) — Lowest Priority

**Portal URL:** `https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=BID`

**Known Issues:**
- SSL certificate error in validation report: `net::ERR_CERT_COMMON_NAME_INVALID`
- Likely shares HNX infrastructure
- Lowest confidence (0.85)

**Investigation Steps:**

1. **Verify SSL certificate:**
   - Navigate to the portal URL
   - Check if certificate warning appears
   - Check DevTools Console for SSL errors
   - If certificate is invalid, note the issue for documentation

2. **If SSL resolves or is not blocking:** Repeat HNX investigation steps

3. **If SSL persists:** This may be a VPS/Chromium sandbox issue (see Risk Mitigation)

---

### Phase 3: Findings Documentation

**Create a new findings document:** `docs/BCTC_PORTAL_URL_FINDINGS_2026.md`

**Structure:**

```markdown
# BCTC Portal URL Investigation Findings — 2026-04-23

## Summary
[1–2 sentences: which portals work, which don't, recommended action]

## Portal 1: HOSE
- **Status:** ✅ WORKING / ❌ BROKEN
- **Tested URL:** [the URL you tested]
- **Navigation Path:** [steps to find PDF]
- **API Endpoint:** [if found]
- **PDF URL Pattern:** [example: https://www.hsx.vn/document/123456.pdf]
- **Form Fields:** [if applicable]
- **Confidence:** [0.85–0.95]
- **Notes:** [anything noteworthy]

## Portal 2: HNX
- **Status:** ✅ WORKING / ❌ BROKEN
- [same structure as HOSE]

## Portal 3: UPCOM
- **Status:** ✅ WORKING / ❌ BROKEN
- [same structure as HOSE]

## Recommended Action
[Based on findings: use HOSE / use HNX / use UPCOM / use SSC official portal]

## Code Changes Needed
[Describe what needs to change in the discovery script]
```

---

## Specific Testing Checklist

Use this checklist to track your investigation:

### Test Case 1: VNM (Vinamilk) 2024 Q4

- [ ] HOSE portal: manually navigate to VNM 2024 Q4 BCTC → document URL/path/API
- [ ] DevTools Network: intercept API calls, document endpoints
- [ ] Inspect page source: search for `.pdf` in HTML, document findings
- [ ] Result: PDF found / PDF not found / ERROR [details]

### Test Case 2: BID (BIDV Bank) 2024 Q4

- [ ] Repeat Test Case 1 process for BID
- [ ] If HOSE works: confirm it works for BID too
- [ ] If HOSE fails: try HNX for BID
- [ ] Result: PDF found / PDF not found / ERROR [details]

### Test Case 3: FPT (FPT Telecom) 2024 Q4

- [ ] Repeat Test Case 1 process for FPT
- [ ] Result: PDF found / PDF not found / ERROR [details]

---

## Implementation: Script Updates

Once you've identified working portals and their URL/API patterns, update the script:

**File to Update:** `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/vps-scripts/discover-bctc-urls-browser.py`

**Lines to Focus On:**

1. **HOSE URL (line 110):** Update the URL or add form submission logic
   ```python
   url = f"https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode={code}"
   # Change to actual working URL/API endpoint
   ```

2. **PDF Link Detection (lines 117–146):** If PDFs are loaded via API, update the wait_for_function
   ```python
   await page.wait_for_function(
       "() => document.querySelectorAll('a[href*=\".pdf\"]').length > 0",
       timeout=3000
   )
   # May need to change selector or add form submission
   ```

3. **HNX URL (line 171):** Similar updates
   ```python
   url = f"https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={code}"
   ```

4. **UPCOM URL (line 234):** Similar updates
   ```python
   url = f"https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={code}"
   ```

**Common Changes You May Need to Make:**

**If Portal Uses API Endpoint:**
```python
# Instead of page.goto(url), use fetch:
response = await page.evaluate("""
    async () => {
        const res = await fetch('https://api.example.com/disclosures?code={code}&year={year}&quarter={quarter}');
        return await res.json();
    }
""")
```

**If Portal Uses Form Submission:**
```python
# Fill form fields and submit:
await page.fill('input[name="StockCode"]', code)
await page.fill('input[name="Year"]', str(year))
await page.select('select[name="Quarter"]', quarter)
await page.click('button[type="submit"]')
await page.wait_for_navigation()
```

**If PDFs are in Different Selector:**
```python
# Change from: a[href*=".pdf"]
# To actual selector found in inspection, e.g.: a.pdf-link, div.report a, etc.
pdf_links = await page.query_selector_all('YOUR_ACTUAL_SELECTOR')
```

---

## Re-Testing Validation

After script updates, re-run the 3 validation tests on VPS:

```bash
# SSH to VPS
ssh root@125.212.251.27

# Copy updated script
scp /path/to/discover-bctc-urls-browser.py root@125.212.251.27:/root/

# Test 1: VNM
python3 /root/discover-bctc-urls-browser.py VNM 2024 Q4

# Test 2: BID
python3 /root/discover-bctc-urls-browser.py BID 2024 Q4

# Test 3: FPT
python3 /root/discover-bctc-urls-browser.py FPT 2024 Q4
```

**Success Criteria:**
- At least 2/3 tests return PDF URLs (confidence ≥0.85)
- Each result includes: `url`, `source`, `confidence`, `page_title`
- No errors in JSON output

**If Tests Pass:**
Proceed to full backfill (Task 1289f-test execution)

**If Tests Still Fail:**
Review findings document, try next portal in fallback chain, or escalate to Architect for SSC portal alternative

---

## Risk Mitigation

### Risk 1: Portal Completely Redesigned
**Symptom:** No PDFs found on any portal, portal structure unrecognizable

**Mitigation A (Recommended):**
Switch to official SSC portal as primary source:
- URL: `https://congbothongtin.ssc.gov.vn/`
- Likely more reliable, stable structure
- Already documented as canonical source in architecture
- May require different discovery logic (form fields, API endpoints)

**Mitigation B:**
Contact HOSE/HNX technical team (ops responsibility) for updated API documentation

### Risk 2: SSL Certificate Issues (UPCOM)
**Symptom:** `net::ERR_CERT_COMMON_NAME_INVALID` in Chromium

**Mitigation A:**
Add Playwright flag to bypass certificate validation (for dev/testing only):
```python
context = await browser.new_context(
    ignore_https_errors=True
)
page = await context.new_page()
```

**Mitigation B:**
Verify certificate with `openssl` before updating script:
```bash
openssl s_client -connect upcom.hnx.vn:443 -servername upcom.hnx.vn
```

### Risk 3: Portal Requires Authentication
**Symptom:** Page loads but shows login form or "Access Denied" message

**Mitigation:**
Use SSC portal (public, no auth required) as fallback source

### Risk 4: PDFs Hidden Behind Multiple Clicks/Forms
**Symptom:** PDFs exist but require multi-step navigation

**Mitigation:**
Enhance script with interactive Playwright steps:
- Page click
- Form fill + submit
- Wait for page navigation
- Repeat as needed

---

## Success Criteria (Gate for Task 1289f Unblock)

✅ **Complete when all are true:**

1. **Browser investigation documented** in `docs/BCTC_PORTAL_URL_FINDINGS_2026.md`
   - Which portal(s) work: HOSE / HNX / UPCOM
   - Exact URL/API/form structure documented
   - Navigation steps repeatable

2. **Script updated** with corrected discovery logic
   - File: `vps-scripts/discover-bctc-urls-browser.py`
   - Handles form submissions or API calls if needed
   - Correct URL patterns or API endpoints

3. **Validation tests re-run** with ≥66% hit rate
   - At least 2/3 of (VNM Q4, BID Q4, FPT Q4) return PDFs
   - Each result has valid `url`, `source`, `confidence` fields
   - No errors in JSON output

4. **Test results committed** to version control
   - Create `docs/BCTC_VALIDATION_RESULTS_2026.md` with test output
   - Update `docs/handoffs/TASK_1289f.md` with status change to UNBLOCKED

5. **Ready for full backfill**
   - Task 1289f-test can proceed with 37 stocks × 8 quarters
   - Expected runtime: 40–60 minutes
   - Downstream enrichment pipeline can resume

---

## Implementation Record (Fill During Investigation)

**Developer Name:** [your name]
**Start Date/Time:** [when you begin]
**Investigation Duration:** [hours spent]

### Phase 1 Findings

Portal tested: [HOSE / HNX / UPCOM]

**HOSE Investigation:**
- URL tested: [exact URL]
- Status: ✅ Found PDFs / ❌ No PDFs / 🛑 Error
- API endpoint discovered: [if yes, document it]
- Form structure: [if yes, document fields]
- PDF URL pattern: [example]
- Confidence score: [0.85–0.95]

**HNX Investigation (if needed):**
- [repeat above]

**UPCOM Investigation (if needed):**
- [repeat above]

### Phase 2: Code Changes Made

Files modified:
- [ ] `vps-scripts/discover-bctc-urls-browser.py` (lines: ___)
- [ ] Other files: [list any others]

Changes summary:
- Changed HOSE URL from: `[old]` to: `[new]`
- Added form submission logic: [yes/no]
- Updated PDF selector: [yes/no]
- Added API endpoint: [yes/no]

### Phase 3: Validation Test Results

Re-test output:
```
VNM 2024 Q4: ✅ PASS [PDF found] / ❌ FAIL [no PDF]
BID 2024 Q4: ✅ PASS [PDF found] / ❌ FAIL [no PDF]
FPT 2024 Q4: ✅ PASS [PDF found] / ❌ FAIL [no PDF]

Hit rate: X/3 (X%)
```

### Acceptance

- [ ] ≥2/3 tests pass
- [ ] Findings documented in `docs/BCTC_PORTAL_URL_FINDINGS_2026.md`
- [ ] Script committed to git with working URLs
- [ ] Test results documented in `docs/BCTC_VALIDATION_RESULTS_2026.md`
- [ ] Task 1289f-test unblocked, ready for full backfill

---

## Files & References

**Files to Inspect:**
- Local script: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/vps-scripts/discover-bctc-urls-browser.py`
- VPS deployed: `/root/discover-bctc-urls-browser.py` on 125.212.251.27
- Validation report: `docs/agent-memory/issues/bctc-portal-discovery-validation.md`
- Deployment report: `reports/TASK_DEPLOYMENT_1289f_VALIDATION.md`
- Related handoff: `docs/handoffs/TASK_1289f.md`

**Tech Design References:**
- `docs/TECH_1289.md` (original Task 1289 design, lines 0–100 contain portal URLs)
- `docs/TECH_1289f.md` (Task 1289f design, discovery script specification)
- `docs/TECH_1289_DISCOVERY_TEST_FINDINGS.md` (previous investigation notes)

**Architecture References:**
- `docs/ARCHITECTURE.md#vps-proxy-geo-block-workaround` (VPS design overview)
- `docs/GLOSSARY_VI.md` (Vietnamese financial terms: BCTC = báo cáo tài chính = financial report)

**VPS Access:**
- Hostname: 125.212.251.27
- User: root
- Key: in project secrets
- Python: 3.10.13
- Playwright: 1.58.0
- Chromium: installed

---

## Quick Reference: Portal URLs (Current)

These are the URLs currently hard-coded in the script. Your investigation should validate or update them.

| Portal | URL Pattern | Status |
|--------|-------------|--------|
| HOSE | `https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode={CODE}` | ❌ 0/3 tests pass |
| HNX | `https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={CODE}` | ❓ Not tested |
| UPCOM | `https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={CODE}` | ❌ SSL error |

---

## Escalation Path

**If Stuck:**

1. **After 1 hour with no progress:** Check if portals are completely broken (redesign)
2. **After 2 hours with no working portal:** Consider switching to SSC official portal (`congbothongtin.ssc.gov.vn`)
3. **After 2.5 hours total:** Escalate to Architect with findings doc + recommend SSC alternative

**Escalation Contact:**
- Slack: `@Architect` in #dev channel
- Include: findings doc + recommendation (HOSE vs HNX vs SSC)

---

## Sign-Off

**Developer (to complete upon task completion):**

- [ ] Investigation completed and documented
- [ ] Script updated with working URLs/API/forms
- [ ] Validation tests re-run: ✅ ≥2/3 PASS
- [ ] Code committed to git
- [ ] Task 1289f-test unblocked and ready for execution
- [ ] Findings transferred to next developer if needed

**Handoff Prepared By:** Architect (2026-04-23)
**Status:** Ready for Developer Assignment
