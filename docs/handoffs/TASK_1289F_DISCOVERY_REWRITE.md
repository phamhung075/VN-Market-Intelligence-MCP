# Task 1289f-dev: Rewrite Discovery Script (Form-Based Search)

**Sprint:** 1289f — BCTC Discovery Layer Rewrite
**Effort:** 3-6 hours
**Role:** Developer (TypeScript/Python/Bash)
**Branch:** `task/1289f-discovery-rewrite`
**Depends On:** 1289f-inv (portal findings)

---

## Blockers

❌ **BLOCKED** on 1289f-inv (portal investigation)

Once Architect/Developer complete investigation (1289f-inv), Architect will provide:
- `docs/BCTC_PORTAL_DISCOVERY_FINDINGS.md` with SSC/HNX/UPCOM form structures
- CSS selectors for form fields
- CSS selectors for PDF result rows/links
- Form submission URLs and parameters
- Special handling requirements (timeouts, rate limiting, etc.)

---

## What You'll Do

Rewrite `vps-scripts/discover-bctc-urls-browser.py` to:

### 1. Replace Hardcoded URLs with Form Submission

**CURRENT (BROKEN):**
```python
async def discover_from_hose_api(code: str, year: int, quarter: str):
    async with aiohttp.ClientSession() as session:
        url = f'https://www.hsx.vn/api/bctc?code={code}&year={year}&quarter={quarter}'
        # ❌ This endpoint returns HTTP 404 — doesn't exist
```

**EXPECTED (FORM-BASED):**
```python
async def discover_from_ssc_portal(code: str, year: int, quarter: str):
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--no-sandbox'])
        page = await browser.new_page()

        # 1. Navigate to SSC search page
        await page.goto('https://congbothongtin.ssc.gov.vn/faces/NewsSearch',
                       wait_until='networkidle', timeout=15000)

        # 2. Fill search form (selectors from investigation findings)
        await page.fill('#searchTicker', code)  # From: docs/BCTC_PORTAL_DISCOVERY_FINDINGS.md
        await page.select('#year', str(year))
        await page.select('#quarter', quarter)

        # 3. Submit form
        await page.click('button#searchBtn')

        # 4. Wait for results to load
        await page.wait_for_selector('table.results', timeout=10000)

        # 5. Extract PDFs from result table
        pdf_rows = await page.query_selector_all('tr.result-row')  # Selector from findings
        for row in pdf_rows:
            link = await row.query_selector('a[href*=".pdf"]')
            if link:
                href = await link.get_attribute('href')
                title = await link.text_content()

                # Check if matches quarter + year
                if matches_quarter_and_year(title, quarter, year):
                    full_url = resolve_relative_url(href, 'https://congbothongtin.ssc.gov.vn')
                    return {
                        'url': full_url,
                        'source': 'SSC',
                        'confidence': 0.95,
                        'page_title': 'Công bố thông tin'
                    }

        await browser.close()
        return None  # No PDF found
```

### 2. Maintain Fallback Chain

**Execution Order:**
```
try SSC (https://congbothongtin.ssc.gov.vn)
  ↓ if 0 PDFs found
try HNX (https://hnx.vn)
  ↓ if 0 PDFs found
try UPCOM (https://upcom.hnx.vn)
  ↓ if 0 PDFs found
return error (no PDF found)
```

### 3. Keep JSON Output Format

```python
{
    "url": "https://congbothongtin.ssc.gov.vn/documents/2024_Q1_VNM.pdf",
    "source": "SSC",
    "confidence": 0.95,
    "page_title": "Báo cáo tài chính",
    "error": null  # or error message if failed
}
```

---

## Files to Modify/Create

### 1. MODIFY: `vps-scripts/discover-bctc-urls-browser.py`

**Current:** 297 lines of broken aiohttp API calls
**New:** Form-based Playwright automation

**Structure:**
```python
import asyncio
from playwright.async_api import async_playwright
from typing import Optional, Dict, Any

async def discover_bctc_pdf(code: str, year: int, quarter: str) -> Dict[str, Any]:
    """Main orchestrator — tries SSC → HNX → UPCOM"""

    result = await discover_from_ssc_portal(code, year, quarter)
    if result['url']:
        return result

    result = await discover_from_hnx_portal(code, year, quarter)
    if result['url']:
        return result

    result = await discover_from_upcom_portal(code, year, quarter)
    if result['url']:
        return result

    return {'url': None, 'source': None, 'confidence': 0, 'error': f'No PDF found for {code} {year} {quarter}'}

async def discover_from_ssc_portal(code, year, quarter) -> Dict[str, Any]:
    """Submit SSC search form and extract PDFs from result table"""
    # [implementation from investigation findings]

async def discover_from_hnx_portal(code, year, quarter) -> Dict[str, Any]:
    """Submit HNX search form and extract PDFs from result table"""
    # [implementation from investigation findings]

async def discover_from_upcom_portal(code, year, quarter) -> Dict[str, Any]:
    """Submit UPCOM search form and extract PDFs from result table"""
    # [implementation from investigation findings]

def matches_quarter_and_year(text: str, quarter: str, year: int) -> bool:
    """Check if text contains quarter and year (supports Vietnamese variations)"""
    q_num = quarter[-1]  # "Q1" → "1"
    return f"{q_num}" in text and str(year) in text or \
           f"Q{q_num}" in text and str(year) in text

def resolve_relative_url(relative_path: str, base_url: str) -> str:
    """Convert /assets/doc.pdf → https://domain/assets/doc.pdf"""
    if relative_path.startswith('http'):
        return relative_path
    if relative_path.startswith('/'):
        return base_url.rstrip('/') + relative_path
    return base_url.rstrip('/') + '/' + relative_path

if __name__ == '__main__':
    import sys, json
    code = sys.argv[1] if len(sys.argv) > 1 else 'VNM'
    year = int(sys.argv[2]) if len(sys.argv) > 2 else 2024
    quarter = sys.argv[3] if len(sys.argv) > 3 else 'Q4'

    result = asyncio.run(discover_bctc_pdf(code, year, quarter))
    print(json.dumps(result))
```

### 2. CREATE: `src/__tests__/1289f-discovery-form-submission.test.ts`

**Scope:** Mock Playwright interactions, test form submission + result parsing

```typescript
describe('1289f: BCTC PDF Discovery (Form Submission)', () => {
  it('should discover PDF from SSC portal form submission', async () => {
    // Mock: Playwright navigates to SSC page
    // Mock: Form fields exist and are fillable
    // Mock: After submit, result table appears with PDF links
    // Assert: Discovers correct PDF URL, source='SSC', confidence=0.95
  });

  it('should fallback to HNX if SSC returns no results', async () => {
    // Mock: SSC form submits but result table is empty
    // Mock: HNX portal has PDF in result table
    // Assert: Returns HNX result with confidence=0.9
  });

  it('should match quarter and year in link text', async () => {
    // Test matches_quarter_and_year() function
    // Assert: Correctly identifies "Q1 2024" in Vietnamese and English
  });

  it('should resolve relative URLs to absolute', async () => {
    // Test resolve_relative_url() function
    // Assert: /assets/doc.pdf + base_url → full https URL
  });

  it('should timeout gracefully if portal is slow', async () => {
    // Mock: Form takes >15 seconds to load
    // Assert: Returns error (timeout), not crash
  });
});
```

### 3. MODIFY (if needed): `vps-scripts/enrich-bctc-urls.sh`

- Verify JSON extraction still works: `jq -r '.url'`
- No changes expected (script already handles null/error cases)

---

## Testing Strategy

### Local Testing (before VPS deployment)

```bash
# 1. Syntax check
python3 -m py_compile vps-scripts/discover-bctc-urls-browser.py

# 2. Unit tests
cd src/__tests__ && npm test -- 1289f-discovery-form-submission.test.ts

# 3. Manual test with sample stocks (if Playwright installed locally)
python3 vps-scripts/discover-bctc-urls-browser.py VNM 2024 Q4
python3 vps-scripts/discover-bctc-urls-browser.py BID 2024 Q4
python3 vps-scripts/discover-bctc-urls-browser.py FPT 2024 Q4

# Expected: Valid JSON with url, source, confidence fields
```

### Success Criteria

- [ ] All 8+ unit tests passing
- [ ] Discovery rate ≥80% on test stocks (VNM, BID, FPT)
- [ ] Fallback chain works (can test by mocking timeout on first portal)
- [ ] <10 seconds per stock (acceptable for form submission)
- [ ] JSON output always valid (even on error)

---

## Expected Timeline

1. **Wait for 1289f-inv results:** 2-3 hours
2. **Read findings document:** 15 min
3. **Rewrite Python script:** 2-3 hours
4. **Write tests:** 1 hour
5. **Local testing + fixes:** 1 hour
6. **Code review + cleanup:** 30 min
7. **Total:** 5-6 hours (excluding investigation wait time)

---

## Critical Points

### ✅ DO:
- Use findings from `docs/BCTC_PORTAL_DISCOVERY_FINDINGS.md` (Architect will provide)
- Keep async/await pattern (Playwright is async)
- Maintain JSON output format (shell script depends on it)
- Handle timeouts gracefully (portals can be slow)
- Support both English and Vietnamese text in quarter/year matching

### ❌ DON'T:
- Hardcode portal URLs or CSS selectors (these may change, use findings doc)
- Mix aiohttp with Playwright (use only Playwright async)
- Return malformed JSON (breaks shell script parsing)
- Skip error handling (timeout, network issues must be caught)

---

## Context Files

**Findings (Required):** `docs/BCTC_PORTAL_DISCOVERY_FINDINGS.md` (from 1289f-inv)
**Reference:** `docs/BCTC_PORTAL_FORM_INVESTIGATION.md` (investigation methodology)
**Original Design:** `docs/BCTC_HISTORICAL_DOWNLOAD.md` (8Q strategy)
**Shell Integration:** `vps-scripts/bctc-historical-downloader.sh` (orchestrator that calls this script)

---

## After Completion

1. Commit to `task/1289f-discovery-rewrite` branch
2. Push for review
3. Once approved, Ops will:
   - Deploy to VPS: `/root/discover-bctc-urls-browser.py`
   - Run full backfill (240 PDFs, 40-55 min)
   - Validate results

---

## Questions?

- Playwright docs: https://playwright.dev/python/
- Investigation findings: Wait for `docs/BCTC_PORTAL_DISCOVERY_FINDINGS.md`
