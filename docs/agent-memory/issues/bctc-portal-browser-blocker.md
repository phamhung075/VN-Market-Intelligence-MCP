---
agents: ops, developer, financial-analyst
trigger: vps-troubleshooting, bctc-fetch, incident-response
---

# Issue: BCTC Portal Discovery Requires Browser Automation

**Severity:** MEDIUM (blocks historical PDF backfill, not market-critical)  
**Discovered:** 2026-04-22  
**Status:** IDENTIFIED, AWAITING IMPLEMENTATION  
**Component:** BCTC Historical Downloader (Task 1289c)

---

## Problem

VN stock exchange portals (HOSE, HNX, UPCOM) use **client-side rendering (CSR)** with JavaScript. Simple HTML parsing via curl/grep cannot extract BCTC PDF links because:

1. Initial HTTP response contains only empty HTML shell
2. Actual content is rendered in the browser after JS execution
3. PDF links exist only in the DOM after rendering

**Impact:** `bctc-historical-downloader.sh` cannot discover PDF URLs → all downloads skipped.

---

## Root Cause

**Why portals use CSR:**
- Modern web frameworks (React, Vue, Angular) render content client-side
- HOSE portal specifically uses React (`/static/js/main.*.js`)
- Portal probably made this choice for better UX, not to block scrapers

**Why it blocks our approach:**
- Original design doc (Phase 1) assumed simple regex parsing would work
- This assumption was valid 2-3 years ago but portals have since modernized

---

## Solutions

### Option A: Browser Automation with Playwright (RECOMMENDED)

**Effort:** 2-3 hours  
**Why:** Robust, official approach, Playwright already available on VPS

**Implementation:**
```python
# discover-bctc-urls-browser.py
import asyncio
from playwright.async_api import async_playwright

async def discover_bctc_pdf(code, year, quarter):
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        
        # Load HOSE portal
        url = f"https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode={code}"
        await page.goto(url, wait_until="networkidle")
        
        # Wait for JS to render
        await page.wait_for_selector('[href*=".pdf"]', timeout=10000)
        
        # Extract PDF links
        pdfs = await page.eval_on_selector_all('[href*=".pdf"]', '(els) => els.map(e => e.href)')
        
        # Filter by quarter/year
        for pdf_url in pdfs:
            if f"Q{quarter[-1]}" in pdf_url or str(year) in pdf_url:
                await browser.close()
                return pdf_url
        
        await browser.close()
        return None
```

**Deployment:**
1. Create `/root/discover-bctc-urls-browser.py` with above logic
2. Call from downloader: `PDF_URL=$(python3 /root/discover-bctc-urls-browser.py --code $CODE --year $YEAR --quarter $QUARTER)`
3. Test on 3 sample stocks

**Risk:** Browser startup adds ~2-3s per discovery; total run time for 37×8 = 296 requests × 2s = ~10 min (acceptable)

---

### Option B: SSC API Reverse-Engineering

**Effort:** 4-8 hours  
**Why:** May be faster if API exists and is discoverable

**Approach:**
1. Open browser dev tools on SSC portal (congbothongtin.ssc.gov.vn)
2. Search "BCTC" for a stock, observe network requests
3. Find API endpoint that returns BCTC metadata
4. Extract URLs from API response

**Status:** Unvalidated; requires investigation

---

### Option C: Manual URL Seeding (Short-term workaround)

**Effort:** 1-2 hours  
**Why:** Quick, allows testing PDF processing pipeline

**Approach:**
```bash
# Create /root/bctc-urls-manual.csv
CODE,YEAR,QUARTER,PDF_URL
BID,2024,Q1,https://www.hsx.vn/File/GetFile?id=12345
BID,2024,Q2,https://www.hsx.vn/File/GetFile?id=12346
...
```

Then update downloader to read CSV as fallback.

**Risk:** Not scalable; needs 296 manual entries. Good for testing only.

---

## Prevention Checklist

**For future BCTC discovery work:**

1. **Check portal JS rendering** before assuming regex parsing will work
2. **Use Playwright/Selenium** for any HTML scraping of modern portals
3. **Cache discovered URLs** locally to avoid re-discovering every cycle
4. **Monitor portal API changes** — if portal updates, discovery may break
5. **Test discovery separately** from download; decouple concerns

---

## Next Steps

1. **Today (2026-04-22):** Document blocker (this file) + create Task 1289f for browser automation
2. **Dev:** Implement `discover-bctc-urls-browser.py` (2-3h)
3. **Ops:** Deploy to VPS, test on sample stocks
4. **QA:** Full run for all 37 stocks × 8 quarters (~10 min execution time)

---

## References

- Task 1289c: BCTC Historical Downloader deployment (blocked on this)
- docs/BCTC_HISTORICAL_DOWNLOAD.md: Phase 1 design (assumed simple HTML parsing)
- docs/BCTC_HISTORICAL_DEPLOYMENT_2026-04-22.md: Full deployment report
