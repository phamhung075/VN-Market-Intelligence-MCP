# BCTC Portal Form Investigation Protocol

**Date:** 2026-04-23
**Status:** INVESTIGATION REQUIRED (Playwright discovery returning 0 PDFs)
**Scope:** Reverse-engineer SSC, HOSE, HNX, UPCOM portal forms
**Estimated effort:** 2–3 hours with Chromium DevTools

---

## Context: Why This Investigation

Task 1289f deployed Playwright browser automation to discover BCTC PDFs, but recent backfill execution returned **0 PDFs** despite the script running without errors. Possible causes:

1. **Form submission not working** — search form exists but Playwright doesn't submit it correctly
2. **Wrong CSS selectors** — PDF link selector has changed since implementation
3. **JavaScript rendering issues** — page state doesn't reach PDF list display
4. **Redirect/navigation** — form redirects to different URL that script doesn't handle
5. **Authentication/blocking** — portal requires session cookies or blocks automated access
6. **Portal restructuring** — HOSE/HNX redesigned their interface

**Goal:** Document exact form structure, submission method, and result page PDF extraction logic for each portal.

---

## Investigation Methodology

### Phase 1: Portal Access & Form Discovery (per portal, ~20 min each)

**Setup:**
```bash
# Use Chromium or Firefox with DevTools
# Open Developer Tools: F12 or Cmd+Option+I
# Tabs to monitor: Elements, Network, Console
```

**Steps:**

1. **Navigate to portal's BCTC search page**
   - HOSE: https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=VNM
   - HNX: https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=VNM
   - UPCOM: https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=VNM
   - SSC (alternative): https://congbothongtin.ssc.gov.vn/faces/NewsSearch

2. **Inspect page DOM (Elements tab)**
   - [ ] Is there a `<form>` element? Note its attributes:
     - `id`, `name`, `action`, `method` (GET/POST), `enctype`
   - [ ] List all form fields and their attributes:
     - Input name, type (text/select/hidden), placeholder, required attribute
     - Example: `<input name="issuerCode" type="text" required />`
   - [ ] Take screenshot of form rendering

3. **Capture all GET parameters (if URL-based)**
   - Reload page with Network tab open
   - Look at initial page request URL
   - Note: which parameters are already in URL? Which are defaults?
   - Example:
     ```
     https://www.hsx.vn/...?category=BCTC&issuerCode=VNM&year=2024&quarter=Q4
     ```

4. **Search for PDF download links**
   - [ ] In Elements tab, search for `href*=".pdf"` (Ctrl+F in Elements)
   - [ ] If found: what's the pattern?
     - Relative URL? Absolute URL?
     - Example: `/download/BCTC_Q1_2024.pdf` or full `https://...`
   - [ ] If NOT found: PDFs may be loaded dynamically

---

### Phase 2: Form Submission & Dynamic Loading (per portal, ~20 min each)

**If form is static HTML:**

1. **Locate form submission**
   - [ ] Note form's `action` attribute (where does it POST/GET?)
   - [ ] Note form's `method` (GET or POST?)
   - [ ] Are there any hidden fields? (`<input type="hidden">`)
   - [ ] Any JavaScript `onsubmit` handlers? (Right-click form → Inspect)

2. **Test form submission manually**
   - Fill in ticker (e.g., VNM) and quarter/year
   - Click submit button
   - Network tab: capture the request
     - Request URL (GET) or request body (POST)
     - Response status (200, 302 redirect, etc.)
     - Response type (HTML, JSON, redirect)

3. **Follow redirects**
   - If response is 302 redirect, note the Location header
   - Navigate to redirect URL
   - Check Elements tab for PDF links

**If form is JavaScript-based (SPA/AJAX):**

1. **Find the AJAX request**
   - Open Network tab (clear any existing requests)
   - Manually fill in search form
   - Click submit or press Enter
   - Watch Network tab for AJAX request
   - [ ] Note request:
     - URL (endpoint)
     - Method (GET/POST)
     - Parameters (query string or request body)
     - Response type (JSON or HTML)
   - [ ] Note response:
     - Status code (200, 404, 500)
     - Response body (does it contain PDF URLs?)
     - Response format (JSON structure or HTML snippet)

2. **Check page rendering after AJAX**
   - After response arrives, check Elements tab
   - Has DOM changed? Are PDF links now visible?
   - [ ] Search for `href*=".pdf"` again

---

### Phase 3: PDF Extraction & Quarter Matching (per portal, ~15 min)

**For each PDF link found:**

1. **Extract link properties**
   - [ ] Full href: `_________________`
   - [ ] Link text: `_________________`
   - [ ] Parent container class/id: `_________________`
   - [ ] Sibling elements (date, quarter label): `_________________`

2. **Quarter/Year matching strategy**
   - [ ] Is quarter visible in link text? (e.g., "Q1 2024")
   - [ ] Is quarter visible in sibling/parent elements?
   - [ ] Is quarter in URL parameters?
   - [ ] Example link text patterns for Q1 2024:
     - Expected: `_________________`
     - Actual: `_________________`

3. **CSS selector validation**
   - [ ] Current selector in code: `a[href*=".pdf"]`
   - [ ] Does it match all PDFs? Yes / No / Partially
   - [ ] Better selector (if needed): `_________________`
   - [ ] Parent container selector (for filtering): `_________________`

---

### Phase 4: Playwright Compatibility Check (per portal, ~20 min)

**Simulate what Playwright is doing:**

1. **Test page navigation with headless assumptions**
   - Open in private window (no cookies, clean state)
   - Note: does form auto-populate? (If yes, via cookies/session storage)
   - Fill in ticker manually, submit
   - Verify PDF links appear

2. **Check for bot-blocking**
   - DevTools → Network → Set user agent to Playwright:
     - Example: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/91.0.4472.0 Safari/537.36`
   - Reload page
   - [ ] Does page load normally? Yes / No
   - [ ] Are PDFs visible? Yes / No
   - [ ] Any errors in Console tab? Note them: `_________________`

3. **Test with network isolation**
   - DevTools → Console → check for CORS errors (red messages)
   - Any blocked requests? Note them: `_________________`

---

## Portal-Specific Investigation Templates

### Portal 1: HOSE (Ho Chi Minh Stock Exchange)

**URL:** https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=VNM

| Item | Finding |
|------|---------|
| **Form type** | Static HTML / AJAX / SPA |
| **Form action** | `GET` / `POST` to: _________________ |
| **Form fields** | `issuerCode`, `year`, `quarter`, _________________ |
| **Hidden fields** | _________________ |
| **PDF selector** | `a[href*=".pdf"]` / `_________________` |
| **PDF link pattern** | _________________ |
| **Quarter display** | Link text / Sibling / URL param / Other: _________________ |
| **AJAX endpoint** | None / `GET` to _________________ / `POST` to _________________ |
| **AJAX response format** | JSON / HTML |
| **AJAX response time** | < 1s / 1-3s / > 3s |
| **Bot blocking** | None detected / Requires User-Agent / Requires cookies |
| **Result page URL** | Same as input / Redirects to: _________________ |

**Screenshots/Notes:**
```
[Paste screenshot of form here]
[Paste Network request/response here]
[Other observations]
```

---

### Portal 2: HNX (Hanoi Stock Exchange)

**URL:** https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=VNM

| Item | Finding |
|------|---------|
| **Form type** | Static HTML / AJAX / SPA |
| **Form action** | `GET` / `POST` to: _________________ |
| **Form fields** | `StockCode`, `quarter`, _________________ |
| **Hidden fields** | _________________ |
| **PDF selector** | `a[href*=".pdf"]` / `_________________` |
| **PDF link pattern** | _________________ |
| **Quarter display** | Link text / Sibling / URL param / Tab selector / Other: _________________ |
| **Tab structure** | Separate tabs for Q1/Q2/Q3/Q4? Yes / No |
| **AJAX endpoint** | None / `GET` to _________________ / `POST` to _________________ |
| **AJAX response format** | JSON / HTML |
| **Bot blocking** | None detected / Requires User-Agent / Requires cookies |
| **Result page URL** | Same as input / Redirects to: _________________ |

**Screenshots/Notes:**
```
[Paste screenshot of form here]
[Paste Network request/response here]
[Other observations]
```

---

### Portal 3: UPCOM (Unlisted Public Company Market)

**URL:** https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=VNM

| Item | Finding |
|------|---------|
| **Form type** | Static HTML / AJAX / SPA |
| **Form action** | Same as HNX / Different: _________________ |
| **Shares infrastructure with** | HNX / Independent |
| **PDF selector** | Same as HNX / Different: _________________ |
| **Other differences** | _________________ |

---

### Portal 4: SSC (Secondary Source, if Needed)

**URL:** https://congbothongtin.ssc.gov.vn/faces/NewsSearch

| Item | Finding |
|------|---------|
| **Form type** | Static HTML / AJAX / SPA / JSF Form |
| **Form action** | `GET` / `POST` to: _________________ |
| **Form fields** | _________________ |
| **Is this searchable by code?** | Yes / No / Limited (only company name) |
| **PDF selector** | `a[href*=".pdf"]` / `_________________` |
| **Confidence** | High / Medium / Low (reasons: _________________) |

---

## Expected Findings Summary

Once investigation complete, fill in:

| Portal | Form Type | Entry Point | PDF Discovery Method | Confidence |
|--------|-----------|-------------|----------------------|------------|
| HOSE | ? | Search form / Direct link | DOM selector / AJAX / Other | ? |
| HNX | ? | ? | ? | ? |
| UPCOM | ? | ? | ? | ? |
| SSC | ? | ? | ? | ? |

---

## Common Issues & Diagnostics

### Issue 1: No PDFs Found in DOM

**Possible causes:**
1. Wrong CSS selector → Try broader selectors: `a`, `a[href]`, `[href*="pdf"]`
2. PDFs loaded after page renders → Wait for AJAX request (Network tab)
3. PDFs in iframe → Check for nested `<iframe>` (Elements tab)
4. Content behind popup/modal → Dismiss any overlays first

**Diagnostic steps:**
```javascript
// Run in Console tab to search for PDFs:
Array.from(document.querySelectorAll('a'))
  .filter(a => a.href.includes('.pdf') || a.textContent.toLowerCase().includes('pdf'))
  .map(a => ({ href: a.href, text: a.textContent, parent: a.parentElement.className }))
```

### Issue 2: Form Doesn't Submit / Returns No Results

**Possible causes:**
1. Missing required field → Check console for form validation errors
2. Incorrect field value → Try VNM (Vietcombank, major stock) first
3. Form uses POST with CSRF token → Check Network for hidden `_token` field
4. Backend requires session → Check Cookies tab, clear and reload
5. Ticker doesn't exist on this portal → Try different tickers (BID, HPG, VJC)

**Diagnostic steps:**
- Inspect all form inputs: Right-click form → Inspect → check `name`, `value` attributes
- Check Console for JavaScript errors (red messages)
- Check Network for 4xx/5xx responses

### Issue 3: PDFs Found But No Quarter Label

**Possible causes:**
1. Quarter embedded in URL only → Extract from href
2. Quarter in hidden parent element → Check parent `<tr>`, `<div>`, `<li>`
3. Quarter in data attributes → Look for `data-quarter`, `data-period`
4. Multiple quarters in one page → Need filtering logic

**Diagnostic steps:**
```javascript
// In Console, for each PDF link:
const link = document.querySelector('a[href*=".pdf"]');
console.log({
  href: link.href,
  text: link.textContent,
  parentText: link.parentElement.textContent,
  dataAttrs: link.dataset,
  title: link.title
});
```

---

## Output Format for Developer

Once investigation complete, Developer should receive:

### Per Portal Document: `docs/BCTC_PORTAL_<NAME>_STRUCTURE.md`

```markdown
# BCTC Portal Structure — [PORTAL_NAME]

## Quick Facts

- **URL:** https://...
- **Form type:** [Static HTML / AJAX / SPA]
- **PDF discovery method:** [CSS selector / AJAX parsing / Other]
- **Confidence:** [High/Medium/Low]
- **Investigated:** [Date], [Your name]

## Form Structure

**HTML:**
\`\`\`html
<form action="..." method="...">
  <input name="..." />
  ...
</form>
\`\`\`

**Submission:** GET/POST to `[URL]` with parameters: `[list]`

## PDF Discovery

**Selector:** `[CSS selector or logic]`

**Example result:**
\`\`\`html
<a href="[URL pattern]">[Quarter label pattern]</a>
\`\`\`

## Quarter Matching

**Patterns matched:**
- "Q1 2024" → ✓
- "quý 1 2024" → ✓
- Other: ...

## AJAX Requests (if any)

**Endpoint:** `GET [URL]`
**Response:** JSON with structure `[...]`

## Known Issues

- [Any blocking issues for Playwright]
- [Bot detection strategies]
- [Rate limiting]

## Playwright Test Plan

```python
# Expected sequence for Playwright:
page = await browser.new_page()
await page.goto('[URL]?issuerCode=VNM')
# Wait for: [DOM selector] to appear
# Extract: [CSS selector] for PDFs
```
```

---

## Next Steps

1. **Developer takes this template** and investigates each portal with DevTools
2. **Documents findings** in portal-specific structure files
3. **Fills in CSS selectors, AJAX endpoints, and quarter patterns**
4. **Updates Playwright script** with correct selectors and submission logic
5. **Tests locally** with 3 stocks (VNM, BID, HPG) for all 4 quarters
6. **Verifies discovery rate >80%** before VPS deployment

---

## Timeline

- **Investigation:** 2–3 hours (all 4 portals)
- **Documentation:** 1 hour
- **Playwright script update:** 2–3 hours
- **Testing & deployment:** 1–2 hours
- **Total:** 6–9 hours (full root-cause fix)

---

## References

- **Current implementation:** `vps-scripts/discover-bctc-urls-browser.py`
- **Task context:** docs/handoffs/TASK_1289f_REFINEMENT.md
- **Issue reference:** docs/agent-memory/issues/bctc-portal-discovery.md
- **Related TECH:** docs/TECH_1289f.md

