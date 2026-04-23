# Task 1289f-inv: Portal Form Investigation

**Sprint:** 1289f — BCTC Discovery Layer Rewrite
**Effort:** 2-3 hours
**Role:** Architect + Developer (investigation pair)
**Branch:** `task/1289f-portal-investigation`

---

## Problem Statement

BCTC historical backfill executed but discovered **0 PDFs** out of 240 items (0% discovery rate).

**Root Causes Identified:**
1. Portal URLs are incorrect (return 404 errors)
2. Portals require **form submission** (not just page load)
3. PDFs are extracted from result tables (not initial page)
4. No public API endpoints exist for BCTC discovery

**Current State:**
- Script uses hardcoded URLs: `https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode={CODE}`
- Result: "Không tìm thấy trang" (Page Not Found)
- Fallback to HNX/UPCOM also fails (same issue)

---

## Objective

**Reverse-engineer the actual VN stock exchange portals** to understand:
1. How users search for BCTC reports
2. What form fields are required
3. How to extract PDFs from result pages
4. Fallback chain priority (SSC → HNX → UPCOM)

**Success:** Document complete form structure + CSS selectors for Developer to rewrite script.

---

## Investigation Scope

### Portal 1: SSC (Primary Source) — REQUIRED
**URL:** `https://congbothongtin.ssc.gov.vn/faces/NewsSearch`

**Questions to Answer:**
- [ ] What search form fields exist? (ticker, year, quarter, document type, etc.)
- [ ] Which fields are **required**?
- [ ] How to populate year + quarter? (dropdown, text input?)
- [ ] What is the form submission method? (GET, POST, AJAX?)
- [ ] What does the result page HTML look like?
- [ ] How to extract PDF download link from results?
- [ ] CSS selector for PDF rows/links?
- [ ] Is pagination required? (how many results per page?)
- [ ] Are there any bot-blocking measures? (User-Agent requirements, rate limiting?)

**Deliverable Format:**
```markdown
## SSC Portal

**URL:** https://congbothongtin.ssc.gov.vn/faces/NewsSearch

### Form Structure
- Field: ticker | Selector: `#searchTicker` | Type: text | Required: yes
- Field: year | Selector: `#year` | Type: select | Required: yes | Options: 2024, 2025, ...
- Field: quarter | Selector: `#quarter` | Type: select | Required: yes | Options: Q1, Q2, Q3, Q4
- Field: [other] | ...

### Form Submission
- Method: POST
- URL: `/faces/search` or AJAX to `/api/search`
- Parameters: ticker, year, quarter, documentType="BCTC"

### Result Page
- Result container selector: `div.search-results` or `table#results`
- PDF row selector: `tr.result-row` or `div.pdf-item`
- PDF link selector: `a[href*=".pdf"]`
- Link example: `/assets/downloads/2024_Q1_VNM.pdf`
- Quarter indicator in link: Yes (filename) / No (need to check title)

### PDF URL Resolution
- Base URL: `https://congbothongtin.ssc.gov.vn`
- Relative link `/assets/downloads/2024_Q1_VNM.pdf` → `https://congbothongtin.ssc.gov.vn/assets/downloads/2024_Q1_VNM.pdf`
```

### Portal 2: HNX (Fallback 1) — REQUIRED
**URL:** `https://hnx.vn/` (find BCTC section)

**Questions:**
- Does HNX have a dedicated BCTC search page?
- Form structure (same format as SSC above)?
- Result page extraction?

### Portal 3: UPCOM (Fallback 2) — OPTIONAL
**URL:** `https://upcom.hnx.vn/` (likely uses HNX infrastructure)

**Questions:**
- Does UPCOM have separate form or use HNX's?
- Form structure?

---

## How to Investigate

### Tools Needed
- Chrome or Firefox browser
- DevTools (F12)
- Network tab (monitor requests)
- JavaScript console (if needed for debugging)

### Step-by-Step Process

#### Phase 1: Manual Portal Exploration (30 min)
1. Open SSC portal in browser: https://congbothongtin.ssc.gov.vn/faces/NewsSearch
2. Look for search form
3. Try searching for: **VNM**, **Q4**, **2024**
4. Observe result page
5. Find PDF link for VNM Q4 2024
6. Note the URL pattern

#### Phase 2: DevTools Inspection (45 min)
1. Open DevTools (F12)
2. **Network Tab:**
   - Clear network log
   - Submit search form
   - Monitor requests
   - Identify form submission request (what URL, what parameters?)
   - Find PDF link request (if via AJAX)
3. **Elements Tab:**
   - Inspect form HTML (find field names, IDs, CSS classes)
   - Inspect result table (find selectors for rows, links)
   - Copy relevant HTML snippets
4. **Console Tab:**
   - If needed, run JavaScript to find hidden PDF links
   - Example: `document.querySelectorAll('a[href*=".pdf"]')`

#### Phase 3: Alternate Portals (30 min)
- Repeat phases 1-2 for HNX
- If time permits, try UPCOM

#### Phase 4: Document Findings (30 min)
- Fill in deliverable template above
- Include screenshots (DevTools showing selectors)
- Note any gotchas or special handling needed

---

## Expected Findings

### For SSC:
```
Form fields: ticker, year, quarter, documentType
Search URL: POST /api/bctc-search
Result format: JSON array or HTML table
PDF selector: a.document-link[href*=".pdf"]
Example: https://congbothongtin.ssc.gov.vn/documents/2024_Q1_VNM.pdf
```

### For HNX:
```
Likely similar to SSC but different domain
Base URL: https://hnx.vn/
Form: [to be discovered]
Result format: [to be discovered]
```

---

## Common Issues & Diagnostics

**Issue 1: No search form visible**
- Solution: Portal may use JavaScript to render form. Wait 2-3 seconds, refresh, check console for errors.

**Issue 2: Form submits but no results**
- Solution: Check form parameters (may require specific documentType code like "BCTC", "BC", "BCĐH", etc.). Try different parameter combinations.

**Issue 3: PDF links not visible in HTML**
- Solution: PDFs may be injected via AJAX. Check Network tab during page load. Find AJAX request returning PDF list.

**Issue 4: Bot blocking detected**
- Solution: Portal may reject non-browser requests. Note required headers (User-Agent, Referer). May need proxy or cookie handling.

---

## Deliverables

**Final Report:** `docs/BCTC_PORTAL_DISCOVERY_FINDINGS.md`

**Contents:**
1. SSC portal complete structure (required)
2. HNX portal complete structure (required)
3. UPCOM portal structure (optional)
4. Recommended fallback chain order
5. Special handling notes (timeouts, rate limiting, bot detection)
6. Screenshots/evidence (optional but helpful)

**Timeline:** 2-3 hours total

---

## Next Step (After Investigation)

Once findings are documented, **Developer will use them to rewrite** `vps-scripts/discover-bctc-urls-browser.py` with:
- Correct form submission logic
- Proper CSS selectors for result extraction
- Portal fallback chain (SSC → HNX → UPCOM)

---

## Questions?

Reference: `docs/BCTC_PORTAL_FORM_INVESTIGATION.md` for detailed 4-phase methodology with templates.
