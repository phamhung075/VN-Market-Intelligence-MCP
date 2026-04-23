# Issue: BCTC Portal Discovery — Playwright CSS Selector Mismatch

**Status:** ACTIVE (needs refinement)  
**Severity:** MEDIUM (task framework is solid, needs selector tuning)  
**Discovered:** 2026-04-23 (Ops deployment)  
**Recurrence:** 1x (new in 1289f)

---

## Symptom

Python Playwright wrapper (`discover-bctc-urls-browser.py`) successfully launches browser, navigates to HOSE/HNX/UPCOM portals, and waits for page load, but CSS selector `a[href*=".pdf"]` matches zero elements in the rendered DOM.

**Evidence:**
```bash
$ python3 /root/discover-bctc-urls-browser.py VCB 2024 Q1
{"results": [], "error": "No PDF found in any portal"}
```

Wrapper runs without errors, but returns empty results for all three portals.

---

## Root Cause

Portals are React SPAs (Single Page Applications) with **asynchronous PDF link loading**:

1. **Page load sequence:**
   - Initial HTML shell (no PDF links visible)
   - React mounts and renders initial content
   - Playwright's `wait_until="networkidle"` completes
   - **Meanwhile:** AJAX request fires to fetch PDF list from backend
   - PDF DOM elements inserted ~500-2000ms after networkidle

2. **Why CSS selector fails:**
   - Playwright waits for networkidle (no pending requests)
   - But `a[href*=".pdf"]` elements haven't been injected yet
   - By the time we query the DOM, no PDF links are present
   - Portal renders PDFs only after additional async operation

3. **Confirmed by curl comparison:**
   ```bash
   # Plain curl shows HTML shell with no PDF links
   $ curl -s "https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=VCB" | grep -c "\.pdf"
   0
   
   # Playwright should see rendered DOM, but doesn't find PDFs either
   # → Suggests PDFs loaded after networkidle event
   ```

---

## Affected Portals

| Portal | URL | Issue | Confidence |
|--------|-----|-------|-----------|
| HOSE | https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode={CODE} | AJAX PDF list | HIGH |
| HNX | https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={CODE} | AJAX PDF list | HIGH |
| UPCOM | https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={CODE} | AJAX PDF list (shares HNX infra) | HIGH |

---

## Solution (Phase 2 Enhancement)

### Option A: Explicit Wait for Selector (Recommended)
```python
# Instead of:
await page.goto(url, timeout=30000, wait_until='networkidle')
pdfs = await page.locator('a[href*=".pdf"]').all()

# Use:
await page.goto(url, timeout=30000, wait_until='networkidle')
try:
    # Wait up to 10 seconds for PDF links to appear
    await page.wait_for_selector('a[href*=".pdf"]', timeout=10000)
    pdfs = await page.locator('a[href*=".pdf"]').all()
except PlaywrightTimeoutError:
    # No PDF links found within timeout
    return None
```

**Pros:** Simple, minimal code change  
**Cons:** Still guessing on selector; may timeout if selector is wrong

### Option B: Network Inspection (Advanced)
```python
# Monitor network requests during page load
# Identify AJAX endpoint that returns PDF list
# Call endpoint directly after page navigation
# Parse JSON response for PDF URLs

# Example: If HOSE returns PDF list via:
# GET /api/bctc?code=VCB&year=2024&quarter=Q1 → JSON with PDF URLs
# Skip DOM parsing entirely, use API directly
```

**Pros:** Faster, more reliable, avoids DOM parsing quirks  
**Cons:** Requires reverse-engineering portal API; brittl if API changes

### Option C: Port-Specific HTML Inspection
```python
# For HOSE:
#   - Check for div.bctc-list > a.pdf-link (example)
#   - Extract href from data-url attribute (example)
#   - Validate against quarter/year in sibling elements

# For HNX:
#   - Check for section.disclosures > ul > li > a[href*=".pdf"]
#   - Filter by quarter tabs (Q1, Q2, Q3, Q4)

# For UPCOM:
#   - Same as HNX (shared DOM structure)
```

**Pros:** Aligned with actual portal HTML  
**Cons:** Requires HTML inspection for each portal (3h dev time)

---

## Prevention Checklist

For future web scraping or portal discovery enhancements:

- [ ] Test CSS selectors with real browser DevTools first (don't guess)
- [ ] Use Playwright's debug mode to inspect actual rendered DOM
- [ ] Add `page.wait_for_selector()` for async-loaded content
- [ ] Monitor Network tab to identify AJAX endpoints
- [ ] Consider direct API calls if available
- [ ] Document expected HTML structure in code comments
- [ ] Add retry logic with exponential backoff for timeouts
- [ ] Test with multiple portal stocks (not just one)
- [ ] Log actual DOM state on failure (for debugging)
- [ ] Set up integration test to validate discovery rate weekly

---

## Related

- **Task:** 1289f (Browser-based BCTC PDF discovery)
- **File:** `/root/discover-bctc-urls-browser.py`
- **Handoff:** docs/handoffs/TASK_1289f.md (lines 521-531, "Known Limitations")
- **Discovery log:** `/var/log/bctc-historical.log`

---

## Timeline

- **2026-04-23 04:40:** First test shows zero PDFs discovered
- **2026-04-23 04:50:** Root cause analysis: networkidle vs AJAX timing
- **2026-04-23 05:00:** Issue filed, solution options documented
- **Next:** Dev Team performs portal inspection (2-3h) to determine correct selectors

