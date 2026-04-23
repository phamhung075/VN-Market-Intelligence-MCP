# TECH-1289f: Browser-Based BCTC PDF URL Discovery for VPS

**status:** APPROVED_BY_ARCHITECT
**req_ref:** Task 1289f, Phase 2 Enhancement
**sprint:** 1291
**date_analysis:** 2026-04-22
**depends_on:** Task 1289c–e COMPLETE (Phase 2 deployed)

---

## Executive Summary

**The Problem:** Phase 2 BCTC enricher (Task 1289c–e) deployed successfully but uses basic shell script with `curl | grep` to discover PDF URLs. This approach fails on portals with Client-Side Rendering (CSR) — React-based HOSE, HNX, UPCOM portals return empty or dynamic HTML that grep cannot parse.

**The Solution:** Replace shell script logic with Python + Playwright/Chromium running on VPS. Browser automation renders JavaScript, queries live DOM, extracts PDF URLs with high confidence (0.95 HOSE, 0.9 HNX, 0.85 UPCOM).

**Impact:** Recovers PDFs from portals that require JavaScript rendering. No code changes on Bun server (endpoint `/api/enrich-queue-item` already implemented). VPS-side only.

**Effort:** 3 hours TDD (TypeScript mock tests + Python implementation + VPS integration)

---

## Root Cause: Why curl | grep Fails

### Current Behavior (Task 1289c, shell script)

```bash
# From enrich-bctc-urls.sh
HOSE_HTML=$(curl -s "https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=$CODE")
PDF_URL=$(echo "$HOSE_HTML" | grep -o "https://[^\"]*\.pdf" | head -1)

if [ -z "$PDF_URL" ]; then
  echo "SKIP: no PDF found in HOSE response"
  exit 0
fi
```

### The Issue

When VPS curls the HOSE URL:
1. Server returns HTML scaffold with empty `<div id="app"></div>`
2. JavaScript (React) executes in browser, fetches data, populates DOM
3. curl receives **pre-JavaScript HTML** — no PDF links visible
4. grep finds nothing → PDF_URL stays empty
5. Enricher marks item as "skipped" → queue item never updated

**Proof:** Manual curl on VPS:
```bash
$ curl -s "https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=VCB"
<html>
  <body>
    <div id="app"></div>  <!-- ← Empty, React hasn't run -->
    <script src="/app.js"></script>
  </body>
</html>

# No PDF links in response
$ grep "\.pdf" → (no match)
```

---

## Architecture: Playwright Approach

### Why Playwright?

1. **Headless Chromium:** Renders JavaScript, same as real browser
2. **Python support:** VPS already has Python 3.9+
3. **Async API:** Non-blocking, efficient
4. **DOM querying:** Locator API simpler than Selenium
5. **Lightweight:** Smaller than full browser stack

### Script Flow

```
Input: code="VCB", year=2024, quarter="Q1"
  ↓
Try HOSE portal (https://www.hsx.vn/...?issuerCode=VCB)
  │ Launch Chromium
  │ Goto URL, wait 30s for JavaScript render
  │ Query all <a href="*.pdf">
  │ Match text containing "Q1" + "2024"
  │ Extract href → return with confidence 0.95
  ↓ (if found, return; if not found, continue)
Try HNX portal (https://hnx.vn/...?StockCode=VCB)
  │ Same logic, confidence 0.9
  ↓ (if found, return; if not found, continue)
Try UPCOM portal (https://upcom.hnx.vn/...?StockCode=VCB)
  │ Same logic, confidence 0.85
  ↓ (if found, return; if not found, continue)
All failed
  │ Return error "No PDF found in any portal"
  ↓
Output: JSON with results[] or error message
```

### JSON Output Schema

```typescript
interface DiscoveryResult {
  code: string;           // Input stock code
  year: number;           // Input year
  quarter: string;        // Input quarter (Q1–Q4)
  results: Array<{
    source: "HOSE" | "HNX" | "UPCOM";
    url: string;          // Full HTTPS URL to PDF
    confidence: 0.95 | 0.9 | 0.85;  // Portal reliability
    page_title: string;   // Verification (page title)
  }>;
  error: string | null;   // null if success, message if error
}
```

---

## Implementation: Three Portal Strategies

### Portal 1: HOSE (Hong Kong Stock Exchange equivalent for Vietnam)

**URL:** `https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode={CODE}`

**HTML structure (post-render):**
```html
<div class="article-list">
  <div class="article-item">
    <h3><a href="/Modules/.../2024Q1_VCB_BCTC.pdf">BCTC Q1 2024</a></h3>
    <p>...</p>
  </div>
  <!-- More articles -->
</div>
```

**Discovery logic:**
1. Locator: `a[href*=".pdf"]` (all PDF links)
2. For each link:
   - Get href + textContent
   - Check if `"Q1"` (case-insensitive) in text AND `"2024"` in text
   - If match: extract href, resolve to absolute URL
   - Return with confidence 0.95 (HOSE is most reliable)
3. If no match: return None (try next portal)

**Code:**
```python
async def discover_hose(code: str, year: int, quarter: str, browser):
    page = await browser.new_page()
    try:
        url = f"https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode={code}"
        await page.goto(url, timeout=30000, wait_until='networkidle')

        pdfs = await page.locator('a[href*=".pdf"]').all()
        for pdf_elem in pdfs:
            href = await pdf_elem.get_attribute('href')
            text = await pdf_elem.text_content()

            quarter_match = quarter.lower() in (text or "").lower()
            year_match = str(year) in (text or "")

            if quarter_match and year_match and href:
                abs_url = href if href.startswith('http') else f"https://www.hsx.vn{href}"
                return {
                    "source": "HOSE",
                    "url": abs_url,
                    "confidence": 0.95,
                    "page_title": await page.title()
                }
        return None
    except Exception as e:
        logging.error(f"HOSE discovery failed: {e}")
        return None
    finally:
        await page.close()
```

### Portal 2: HNX (Hanoi Stock Exchange)

**URL:** `https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={CODE}`

**HTML structure (post-render):**
```html
<div class="disclosure-section">
  <h4>Báo cáo tài chính</h4>
  <ul>
    <li><a href="/files/2024-Q1-VCB.pdf">BCTC Q1 2024</a></li>
  </ul>
</div>
```

**Discovery logic:**
1. Locator: `a[href*=".pdf"]`
2. For each link:
   - Get href + textContent
   - Check: (quarter in text OR year in text) AND (keyword in text)
   - Keywords: "BCTC", "Báo cáo tài chính", "BC/BĐHS"
   - If match: return with confidence 0.9 (HNX structure varies)
3. If no match: return None

**Note:** HNX layout is less standardized than HOSE, so confidence lower (0.9).

### Portal 3: UPCOM (Unlisted Public Company Market)

**URL:** `https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={CODE}`

**HTML structure:** Same as HNX (uses same CMS)

**Discovery logic:** Same as HNX

**Confidence:** 0.85 (UPCOM has fewer companies, less liquid market)

---

## TDD: Test Cases (6 Assertions)

### Test Suite: `src/__tests__/1289f-bctc-browser-discovery.test.ts`

#### Test 1: HOSE Success (Confidence 0.95)
```typescript
describe("discover_hose", () => {
  it("should return PDF URL with confidence 0.95 when match found", async () => {
    const mockPage = {
      locator: jest.fn().mockReturnThis(),
      all: jest.fn().mockResolvedValue([
        {
          getAttribute: jest.fn().mockResolvedValue("https://www.hsx.vn/files/2024Q1_VCB.pdf"),
          textContent: jest.fn().mockResolvedValue("BCTC Q1 2024 — VCB")
        }
      ]),
      title: jest.fn().mockResolvedValue("HOSE Disclosure"),
      close: jest.fn()
    };
    const mockBrowser = { newPage: jest.fn().mockResolvedValue(mockPage) };

    const result = await discover_hose("VCB", 2024, "Q1", mockBrowser);

    expect(result.source).toBe("HOSE");
    expect(result.confidence).toBe(0.95);
    expect(result.url).toMatch(/\.pdf$/i);
    expect(result.page_title).toBe("HOSE Disclosure");
  });
});
```

#### Test 2: Fallback HOSE→HNX
```typescript
it("should fallback to HNX when HOSE returns null", async () => {
  const hoseResult = null;
  const hnxResult = {
    source: "HNX",
    url: "https://hnx.vn/files/HPG-2024-Q1.pdf",
    confidence: 0.9,
    page_title: "HNX Disclosure"
  };

  const result = await discover_urls("HPG", 2024, "Q1", { hose: hoseResult, hnx: hnxResult });

  expect(result.source).toBe("HNX");
  expect(result.confidence).toBe(0.9);
});
```

#### Test 3: All Portals Exhausted
```typescript
it("should return error when all portals return null", async () => {
  const result = await discover_urls("DGC", 2024, "Q1", {
    hose: null,
    hnx: null,
    upcom: null
  });

  expect(result.error).toContain("No PDF found");
  expect(result.results).toEqual([]);
});
```

#### Test 4: Network Timeout
```typescript
it("should catch timeout and return error", async () => {
  const mockBrowser = {
    newPage: jest.fn().mockRejectedValue(new Error("Timeout after 30s"))
  };

  const result = await discover_hose("BID", 2024, "Q1", mockBrowser);

  expect(result.error).toContain("Portal timeout");
  expect(result.results).toEqual([]);
});
```

#### Test 5: Invalid Input (Exit Code)
```typescript
it("should exit 1 on invalid input (missing args)", async () => {
  const exitCode = await runScript(["VCB"]); // Missing year, quarter

  expect(exitCode).toBe(1);
});
```

#### Test 6: Text Matching (Quarter Variants)
```typescript
it("should match quarter in multiple text formats", () => {
  const cases = [
    { text: "BCTC Q1 2024", quarter: "Q1", year: 2024, expected: true },
    { text: "báo cáo q1 năm 2024", quarter: "Q1", year: 2024, expected: true },
    { text: "BCTC/Q1-2024", quarter: "Q1", year: 2024, expected: true },
    { text: "BCTC Q2 2024", quarter: "Q1", year: 2024, expected: false }
  ];

  cases.forEach(({ text, quarter, year, expected }) => {
    const match = checkTextMatch(text, quarter, year);
    expect(match).toBe(expected);
  });
});
```

---

## Integration with Phase 2 Enricher

### Current Shell Script (Task 1289c)

File: `vps-scripts/enrich-bctc-urls.sh` (lines 50–80)

```bash
#!/bin/bash
# Current approach: curl + grep
CODE=$1
YEAR=$2
QUARTER=$3

HOSE_HTML=$(curl -s "https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=$CODE")
PDF_URL=$(echo "$HOSE_HTML" | grep -o "https://[^\"]*\.pdf" | head -1)

if [ -z "$PDF_URL" ]; then
  echo "SKIP: No PDF found"
  exit 0
fi

echo "Found PDF: $PDF_URL"
# Download and push...
```

### Updated Shell Script (Task 1289f)

Replace curl logic with Python call:

```bash
#!/bin/bash
# New approach: Python + Playwright browser automation
CODE=$1
YEAR=$2
QUARTER=$3

# Call Python discovery script
PDF_RESULT=$(python3 /root/discover-bctc-urls-browser.py "$CODE" "$YEAR" "$QUARTER")

# Parse JSON result
PDF_URL=$(echo "$PDF_RESULT" | jq -r '.results[0].url // empty')
SOURCE=$(echo "$PDF_RESULT" | jq -r '.results[0].source // "UNKNOWN"')
CONFIDENCE=$(echo "$PDF_RESULT" | jq -r '.results[0].confidence // 0')
ERROR=$(echo "$PDF_RESULT" | jq -r '.error // empty')

if [ -n "$ERROR" ]; then
  echo "ERROR: $CODE $YEAR-$QUARTER: $ERROR"
  exit 1
fi

if [ -z "$PDF_URL" ]; then
  echo "SKIP: No PDF found"
  exit 0
fi

echo "SUCCESS: $CODE $YEAR-$QUARTER: found on $SOURCE (confidence: $CONFIDENCE)"
echo "URL: $PDF_URL"

# Continue with download and push...
```

### No Server Changes

The `/api/enrich-queue-item` endpoint (Task 1289d) requires no changes — it already accepts JSON with PDF URLs from shell script.

---

## Deployment: VPS Prerequisites

### Already Installed on VPS (verify)

```bash
# Python version check
$ python3 --version
Python 3.9.18  ✓

# Playwright installed?
$ python3 -c "from playwright.async_api import async_playwright"
(no error) ✓

# Chromium available?
$ python3 -m playwright install chromium
Looking for chromium to reuse from /home/user/.cache/playwright/chromium-...
(or install if missing) ✓
```

### Deployment Command

```bash
# From local machine
./deploy-vinahost.sh

# Or manual SCP
scp /root/discover-bctc-urls-browser.py root@$VINAHOST_IP:/root/
ssh root@$VINAHOST_IP chmod +x /root/discover-bctc-urls-browser.py
scp vps-scripts/enrich-bctc-urls.sh root@$VINAHOST_IP:/root/
```

### Rollback Plan

If Python script has issues:
1. Keep old shell script as `/root/enrich-bctc-urls-backup.sh`
2. Revert to curl + grep if failures occur
3. No downtime — Phase 2 fetcher still works with hint URLs as fallback

---

## Error Handling Strategy

### Timeout (30s per portal)

```python
try:
    await page.goto(url, timeout=30000, wait_until='networkidle')
except TimeoutError as e:
    return {
        "code": code,
        "year": year,
        "quarter": quarter,
        "results": [],
        "error": f"Portal timeout (30s): {str(e)}"
    }
```

### Browser Launch Failure

```python
try:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
except Exception as e:
    return {
        "code": code,
        "year": year,
        "quarter": quarter,
        "results": [],
        "error": f"Browser launch failed: {str(e)}"
    }
```

### All Portals Exhausted

```python
if not hose_result and not hnx_result and not upcom_result:
    return {
        "code": code,
        "year": year,
        "quarter": quarter,
        "results": [],
        "error": "No PDF found in any portal"
    }
```

---

## Performance Characteristics

### Timing (per stock)

| Step | Duration | Notes |
|------|----------|-------|
| Browser launch | ~2s | One-time per run |
| HOSE portal load + render | ~3s | Chromium renders JavaScript |
| HOSE DOM query | ~0.5s | Locator.all() is fast |
| HNX portal (if HOSE fails) | ~3s | Same latency |
| UPCOM portal (if HNX fails) | ~3s | Same latency |
| **Best case (HOSE hit)** | ~5.5s | Browser launch + load + query |
| **Worst case (all portals)** | ~11.5s | All three attempts (no parallelization) |

### Memory & CPU

- **Chromium per instance:** ~150MB RAM
- **Concurrent instances:** 1 per stock (sequential)
- **Per 31-stock queue:** ~5 seconds per stock × 31 = 155s (2.5 min total)
- **VPS resource impact:** <5% CPU, <500MB additional RAM

### Optimization (Future)

- Parallel discovery (launch 3 Chromium in parallel, risk: >500MB RAM)
- Caching (6h TTL per stock/quarter combination)
- Headless optimization (disable images/CSS, load only HTML)

---

## Known Limitations

1. **Sequential fallback** (current design)
   - Tries HOSE first, HNX if fail, UPCOM if fail
   - Limitation: If HOSE is slow (3s), still wait even if HNX would be faster
   - Future: Parallel all three (faster, more memory)

2. **Text-matching heuristic** (quarter + year in link text)
   - Limitation: Portals might use different labels (e.g., "Financial Statement 1Q-2024")
   - Mitigation: Broad quarter variants ("Q1", "q1", "Q1-2024", "Q1/2024")
   - Future: DOM structure-based (selectors per portal, CSS rules)

3. **No caching** (current design)
   - Every discovery launch = new Chromium instance
   - Limitation: High portal load if run frequently
   - Future: SQLite cache (6h TTL)

4. **Single result** (current design)
   - Returns first match only
   - Limitation: If HOSE has multiple Q1 2024 PDFs, returns first
   - Future: Return all matches, score by recency

---

## Testing Checklist

### Unit Tests (LOCAL)

- [ ] `bun test 1289f-*` → 6 assertions, all GREEN
- [ ] `bun tsc --noEmit` → 0 errors
- [ ] No regressions: `bun test` full suite passes

### Integration Tests (VPS POST-DEPLOY)

- [ ] Test 1: VCB 2024 Q1
  - Command: `python3 /root/discover-bctc-urls-browser.py VCB 2024 Q1`
  - Expected: JSON with HOSE PDF URL (confidence 0.95)

- [ ] Test 2: HPG 2025 Q4
  - Command: `python3 /root/discover-bctc-urls-browser.py HPG 2025 Q4`
  - Expected: JSON with valid PDF URL

- [ ] Test 3: DGC 2024 Q2
  - Command: `python3 /root/discover-bctc-urls-browser.py DGC 2024 Q2`
  - Expected: JSON (may error if DGC hasn't filed)

- [ ] Test 4: Shell script integration
  - Trigger: `systemctl start vn-bctc-enrich.service`
  - Check: `/var/log/vn-bctc-enrich.log` shows Python discovery working
  - Verify: `bctc_vps_queue.source_url` populated with real URLs

- [ ] Test 5: Fetch & push integration
  - Trigger: `systemctl start vn-bctc-fetch.service`
  - Verify: PDFs downloaded and pushed to main server
  - Check: `financial_reports` table has new BCTC entries

---

## References

- **Playwright Python API:** https://playwright.dev/python/docs/intro
- **VPS Architecture:** `docs/ARCHITECTURE.md#vps-proxy-geo-block-workaround`
- **Phase 2 Enricher:** `docs/handoffs/TASK_1289_DEPLOYMENT.md`
- **Portal URLs:**
  - HOSE: https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC
  - HNX: https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html
  - UPCOM: https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html

---

**Approved:** Ready for developer sprint. Depends: Task 1289c–e COMPLETE.

