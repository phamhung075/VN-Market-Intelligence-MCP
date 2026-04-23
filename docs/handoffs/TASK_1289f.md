# Task Context — 1289f: Browser-Based BCTC PDF URL Discovery Script for VPS

## TLDR (read this first)

**What:** Create Python script using Playwright/Chromium on VPS to discover BCTC PDF URLs from HOSE/HNX/UPCOM portals (which use CSR — React, not plain curl-able HTML).

**Where:** `/root/discover-bctc-urls-browser.py` (new file on VPS)

**Why:** Phase 2 shell script enricher (Task 1289c–e) uses basic curl + grep, fails on CSR portals. Browser automation handles JavaScript rendering + dynamic DOM queries.

**Input:** stock code, year, quarter (e.g., "VCB", 2024, "Q1")

**Output:** JSON with discovered URLs + confidence scores

**TDD:** Write 3 async test cases first (mock browser + real Playwright), then implement discovery logic.

**Branch:** `task/1289f-bctc-browser-discovery`

**Depends:** Task 1289c–e COMPLETE (Phase 2 enricher deployed, VPS infra ready)

**Knowledge needed:** [bundle-developer, Playwright async API, DOM querying, JSON output formatting]

---

## Status: TODO (Ready to start)

| Field | Value |
|-------|-------|
| Sprint | 1289 (Phase 2 enhancement) |
| Branch | task/1289f-bctc-browser-discovery |
| Status | Todo |
| Assigned | Developer |
| Blocking | None (enhancement; Phase 2 enricher still works if skipped) |

---

## PM Planning Context

**Layer:** infrastructure/vps (VPS-side script, no TypeScript/Bun code)

**Depends on:** 1289c–e (Phase 2 deployed, VPS connectivity proven)

**Parallel with:** None (Phase 2 enricher already deployed and stable)

### Files to read first

- **This handoff** (TASK_1289f.md) — full context
- **TASK_1289_DEPLOYMENT.md** (lines 47–67) — VPS deployment structure
- **TASK_1289_VPS_BCTC_BLOCKER.md** (lines 20–50) — Root cause (CSR portals, curl fails)
- **docs/ARCHITECTURE.md#vps-proxy-geo-block-workaround** — VPS structure
- **vps-scripts/enrich-bctc-urls.sh** — Current shell script implementation (will be replaced)

### Files to create

- `/root/discover-bctc-urls-browser.py` (NEW, on VPS)
- `src/__tests__/1289f-bctc-browser-discovery.test.ts` (NEW, TypeScript TDD tests with mock Playwright)

### Files to modify

- `vps-scripts/enrich-bctc-urls.sh` (lines 50–80) — Replace curl | grep logic with call to Python script
- `docs/ARCHITECTURE.md#vps-proxy-geo-block-workaround` (optional) — Add browser automation note

### Files unchanged

- Bun server code (no changes)
- Endpoint `/api/enrich-queue-item` (already implemented in Phase 2)
- VPS deployment script `./deploy-vinahost.sh` (compatible with new Python script)

---

## Acceptance Criteria

### Given

A stock code, year, and quarter (e.g., "VCB", 2024, "Q1")

### When

Running `/root/discover-bctc-urls-browser.py VCB 2024 Q1` on VPS

### Then

**Output:** JSON on stdout with structure:

```json
{
  "code": "VCB",
  "year": 2024,
  "quarter": "Q1",
  "results": [
    {
      "source": "HOSE",
      "url": "https://www.hsx.vn/Modules/.../BCTC_Q1_2024.pdf",
      "confidence": 0.95,
      "page_title": "HOSE Disclosure — VCB"
    }
  ],
  "error": null
}
```

**Success cases:**

1. **HOSE portal succeeds** → Return single result with confidence 0.95, source "HOSE"
2. **HOSE fails, HNX succeeds** → Return result with confidence 0.9, source "HNX"
3. **Both fail, UPCOM succeeds** → Return result with confidence 0.85, source "UPCOM"
4. **All portals fail** → Return empty results array, error "No PDF found in any portal"

**Error cases:**

1. **Network timeout** → error: "Portal timeout (30s)" + empty results
2. **Invalid input** → error: "Usage: script.py <code> <year> <quarter>" (exit 1)
3. **JavaScript rendering fails** → error: "Browser launch failed" (exit 1)

**Test assertions (6 total, all GREEN):**

1. ✅ HOSE portal success: returns PDF URL with confidence 0.95
2. ✅ HOSE fail → HNX fallback: returns HNX URL with confidence 0.9
3. ✅ All portals fail: returns empty results + "No PDF found" error
4. ✅ Network timeout: error "Portal timeout"
5. ✅ Invalid input: error "Usage: ..." + exit 1
6. ✅ Text matching (quarter + year nearby): extracts correct href from multiple PDFs

**Integration test (1 assertion, manual verification post-deploy):**

1. ✅ Shell script calls Python script, receives JSON, parses correctly
2. ✅ Downloaded PDFs in `/tmp/bctc-pdf/` appear in logs
3. ✅ No orphaned Chromium processes on VPS (cleanup on exit)

---

## Implementation Details

### Part 1: Playwright Setup

**VPS prerequisites (already installed):**
- Python 3.9+
- Playwright library: `pip3 install playwright`
- Chromium browser: `playwright install chromium`

**Script boilerplate:**

```python
#!/usr/bin/env python3
import sys
import json
import asyncio
from playwright.async_api import async_playwright

async def main():
    if len(sys.argv) != 4:
        sys.stderr.write("Usage: discover-bctc-urls-browser.py <code> <year> <quarter>\n")
        sys.exit(1)

    code, year, quarter = sys.argv[1], int(sys.argv[2]), sys.argv[3]

    try:
        # Implement discovery logic (see Part 2)
        result = await discover_urls(code, year, quarter)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

async def discover_urls(code: str, year: int, quarter: str) -> dict:
    """Try HOSE → HNX → UPCOM. Return first match."""
    # Implement Part 2 logic
    pass

if __name__ == "__main__":
    asyncio.run(main())
```

**Make executable:**
```bash
chmod +x /root/discover-bctc-urls-browser.py
```

### Part 2: Portal Discovery Logic

#### HOSE Portal (Try First)

**URL:** `https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode={CODE}`

**Steps:**

1. Launch Chromium (headless)
2. Navigate to URL, wait 30s for page load (timeout)
3. Query all `<a>` elements with `href` containing ".pdf"
4. For each PDF link:
   - Get `href` attribute
   - Get `textContent` (link text)
   - Check if quarter + year mentioned in text (e.g., "Q1 2024" or "BCTC Q1-2024")
   - If match: extract href, resolve to absolute URL, return with confidence 0.95
5. If no match: return None (try HNX)
6. If error: log to stderr, return None (try HNX)

**Code skeleton:**

```python
async def discover_hose(code: str, year: int, quarter: str, browser) -> dict | None:
    """Try HOSE portal, return first PDF match or None."""
    page = await browser.new_page()
    try:
        url = f"https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode={code}"
        await page.goto(url, timeout=30000, wait_until='networkidle')

        # Find all PDF links
        pdfs = await page.locator('a[href*=".pdf"]').all()

        for pdf_elem in pdfs:
            href = await pdf_elem.get_attribute('href')
            text = await pdf_elem.text_content()

            # Check if quarter + year in text
            quarter_variants = [quarter.lower(), quarter.replace("Q", "q"), f"{quarter}-{year}", f"{quarter}/{year}"]
            year_str = str(year)

            has_quarter = any(var in (text or "").lower() for var in quarter_variants)
            has_year = year_str in (text or "")

            if has_quarter and has_year and href:
                # Resolve relative URL
                if not href.startswith('http'):
                    href = f"https://www.hsx.vn{href}" if href.startswith('/') else f"https://www.hsx.vn/{href}"

                return {
                    "source": "HOSE",
                    "url": href,
                    "confidence": 0.95,
                    "page_title": await page.title()
                }

        return None
    except Exception as e:
        # Log to stderr, fallback to next portal
        print(f"HOSE discovery failed for {code}: {str(e)}", file=__import__('sys').stderr)
        return None
    finally:
        await page.close()
```

#### HNX Portal (Try Second)

**URL:** `https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={CODE}`

**Logic:** Same as HOSE, but look for labels "Báo cáo tài chính", "BCTC", or "BC/BĐHS" near PDF links

**Confidence:** 0.9 (lower than HOSE, as HNX layout is less standardized)

**Code skeleton:**

```python
async def discover_hnx(code: str, year: int, quarter: str, browser) -> dict | None:
    """Try HNX portal, return first PDF match or None."""
    page = await browser.new_page()
    try:
        url = f"https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={code}"
        await page.goto(url, timeout=30000, wait_until='networkidle')

        pdfs = await page.locator('a[href*=".pdf"]').all()

        for pdf_elem in pdfs:
            href = await pdf_elem.get_attribute('href')
            text = await pdf_elem.text_content()

            # Check quarter + year + financial report keywords
            has_quarter_year = (f"{quarter}" in (text or "").upper()) and (str(year) in (text or ""))
            has_report_keyword = any(kw in (text or "").upper() for kw in ["BCTC", "BÁO CÁO TÀI CHÍNH", "BC/BĐHS"])

            if (has_quarter_year or has_report_keyword) and href:
                if not href.startswith('http'):
                    href = f"https://hnx.vn{href}" if href.startswith('/') else f"https://hnx.vn/{href}"

                return {
                    "source": "HNX",
                    "url": href,
                    "confidence": 0.9,
                    "page_title": await page.title()
                }

        return None
    except Exception as e:
        print(f"HNX discovery failed for {code}: {str(e)}", file=__import__('sys').stderr)
        return None
    finally:
        await page.close()
```

#### UPCOM Portal (Try Third)

**URL:** `https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={CODE}`

**Logic:** Same as HNX (same portal structure)

**Confidence:** 0.85 (lowest, as UPCOM is less liquid market)

### Part 3: Error Handling

**Timeout:**
- If `page.goto()` exceeds 30s → catch `TimeoutError` → return `{"error": "Portal timeout (30s)", "results": []}`

**Invalid input:**
- If `sys.argv` length ≠ 4 → print usage to stderr, exit 1

**Browser launch failure:**
- If `async_playwright()` or `browser.launch()` fails → return `{"error": "Browser launch failed", "results": []}`

**All portals exhausted:**
- If all three portals return None → return `{"error": "No PDF found in any portal", "results": []}`

---

## TDD Workflow

### RED Phase: Write Tests First

File: `src/__tests__/1289f-bctc-browser-discovery.test.ts`

**Test 1: HOSE success**
```typescript
it("should discover PDF from HOSE portal with confidence 0.95", async () => {
  const result = await mockDiscoverHose("VCB", 2024, "Q1");
  expect(result.source).toBe("HOSE");
  expect(result.confidence).toBe(0.95);
  expect(result.url).toMatch(/\.pdf$/i);
  expect(result.page_title).toBeDefined();
});
```

**Test 2: HOSE fail → HNX fallback**
```typescript
it("should fallback to HNX when HOSE returns null", async () => {
  const result = await mockDiscoverFallback("HPG", 2024, "Q1", ["hose:null", "hnx:found"]);
  expect(result.source).toBe("HNX");
  expect(result.confidence).toBe(0.9);
});
```

**Test 3: All portals fail**
```typescript
it("should return error when all portals exhausted", async () => {
  const result = await mockDiscoverFallback("DGC", 2024, "Q1", ["hose:null", "hnx:null", "upcom:null"]);
  expect(result.error).toContain("No PDF found");
  expect(result.results).toEqual([]);
});
```

**Test 4: Network timeout**
```typescript
it("should catch timeout and return error", async () => {
  const result = await mockDiscoverHose("BID", 2024, "Q1", { timeout: true });
  expect(result.error).toContain("Portal timeout");
});
```

**Test 5: Invalid input**
```typescript
it("should reject invalid input (exit 1)", async () => {
  const exitCode = await runScript(["VCB"]); // Missing year, quarter
  expect(exitCode).toBe(1);
});
```

**Test 6: Text matching (quarter variants)**
```typescript
it("should match quarter in multiple text formats (Q1, q1, Q1-2024)", async () => {
  const cases = [
    { text: "BCTC Q1 2024", quarter: "Q1", year: 2024, shouldMatch: true },
    { text: "Báo cáo q1 năm 2024", quarter: "Q1", year: 2024, shouldMatch: true },
    { text: "BCTC/Q1-2024", quarter: "Q1", year: 2024, shouldMatch: true },
    { text: "BCTC Q2 2024", quarter: "Q1", year: 2024, shouldMatch: false },
  ];

  cases.forEach(({ text, quarter, year, shouldMatch }) => {
    const match = checkTextMatch(text, quarter, year);
    expect(match).toBe(shouldMatch);
  });
});
```

### GREEN Phase: Implement Script

Implement `/root/discover-bctc-urls-browser.py` to pass all 6 tests.

### REFACTOR Phase

- Clean up error messages (concise, actionable)
- Add docstrings to each function
- Validate URL formats
- Test with 3 real stocks (VCB, HPG, DGC) on live VPS

---

## Integration with Phase 2 Enricher

### Current Shell Script (enrich-bctc-urls.sh, lines 50–80)

```bash
# OLD: Plain curl + grep
HOSE_HTML=$(curl -s "https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=$CODE")
PDF_URL=$(echo "$HOSE_HTML" | grep -o "https://[^\"]*\.pdf" | head -1)
```

### Updated Shell Script

Replace with Python call:

```bash
# NEW: Browser-based discovery
PDF_RESULT=$(python3 /root/discover-bctc-urls-browser.py "$CODE" "$YEAR" "$QUARTER")
PDF_URL=$(echo "$PDF_RESULT" | jq -r '.results[0].url // empty')
SOURCE=$(echo "$PDF_RESULT" | jq -r '.results[0].source // empty')
CONFIDENCE=$(echo "$PDF_RESULT" | jq -r '.results[0].confidence // 0')

if [ -z "$PDF_URL" ]; then
  ERROR=$(echo "$PDF_RESULT" | jq -r '.error // "Unknown error"')
  echo "[ERROR] $CODE $YEAR-$QUARTER: $ERROR"
  exit 1
fi

echo "[INFO] $CODE $YEAR-$QUARTER: discovered from $SOURCE (confidence: $CONFIDENCE)"
# Continue with download...
```

### No Changes to Endpoint

The `/api/enrich-queue-item` endpoint remains unchanged (already implemented in Phase 2).

---

## Deployment

### Pre-requisites (VPS)

Verify on VPS before deploying script:

```bash
# Check Python version
python3 --version  # Expected: 3.9+

# Check Playwright installation
python3 -c "from playwright.async_api import async_playwright; print('OK')"

# Check Chromium browser
python3 -m playwright install chromium
```

### Deployment Steps

1. **Develop locally** (TDD in TypeScript tests)
2. **Generate Python script** from template + implementation
3. **Test locally** (if possible; use mock Playwright API)
4. **SCP to VPS:**
   ```bash
   scp /root/discover-bctc-urls-browser.py root@$VINAHOST_IP:/root/
   ssh root@$VINAHOST_IP chmod +x /root/discover-bctc-urls-browser.py
   ```
5. **Update enrich-bctc-urls.sh** (SCP updated shell script)
6. **Trigger enricher:**
   ```bash
   ssh root@$VINAHOST_IP systemctl start vn-bctc-enrich.service
   ```
7. **Verify logs:**
   ```bash
   ssh root@$VINAHOST_IP tail -30 /var/log/vn-bctc-enrich.log
   ```

### Rollback Plan

If Python script has issues:

1. Keep old shell script as backup: `/root/enrich-bctc-urls-backup.sh`
2. If failures occur, revert enrich-bctc-urls.sh to use curl + grep
3. No downtime (enricher is non-critical; Phase 2 fetcher still works with hint URLs)

---

## Testing Checklist

### Unit Tests (LOCAL)

- [ ] `bun test src/__tests__/1289f-bctc-browser-discovery.test.ts` → 6 assertions, all GREEN
- [ ] `bun tsc --noEmit` → 0 errors

### Integration Tests (VPS POST-DEPLOYMENT)

- [ ] Test 1: `python3 /root/discover-bctc-urls-browser.py VCB 2024 Q1`
  - Expected: Returns JSON with HOSE PDF URL, confidence 0.95
- [ ] Test 2: `python3 /root/discover-bctc-urls-browser.py HPG 2025 Q4`
  - Expected: Returns JSON with valid PDF URL from any portal
- [ ] Test 3: `python3 /root/discover-bctc-urls-browser.py DGC 2024 Q2`
  - Expected: Returns JSON (may have error if DGC hasn't filed)
- [ ] Test 4: Shell script integration
  - Run: `systemctl start vn-bctc-enrich.service`
  - Check: `/var/log/vn-bctc-enrich.log` shows PDF_URL populated
  - Check: Queue items move from `source_url=NULL` → `source_url='https://...'`
- [ ] Test 5: Fetch integration
  - Run: `systemctl start vn-bctc-fetch.service`
  - Check: PDFs downloaded and pushed to main server
  - Check: financial_reports table has new entries

### Load Test (OPTIONAL)

- Run enricher on full queue (31+ items)
- Monitor VPS memory/CPU (Chromium × parallel requests)
- Expected: <5 orphaned processes after completion

---

## Known Limitations & Future Improvements

1. **Sequential portal tries** (current): Try HOSE, if fail try HNX, if fail try UPCOM
   - Future: Run all three in parallel (faster)
   - Trade-off: More memory (3 Chromium instances)

2. **Fixed timeout 30s** (current): May be too aggressive for slow networks
   - Future: Configurable timeout via CLI arg
   - Testing: Verify on VPS network speed

3. **Text matching heuristic** (current): Match quarter + year in link text
   - Limitation: Some portals may use different labels
   - Future: Parse by page structure (DOM selectors) instead of text

4. **No caching** (current): Each call launches Chromium, renders page
   - Future: Cache PDF URLs for 6h (reduce portal load)
   - Trade-off: Misses new filings

5. **Single result** (current): Return first matching PDF only
   - Future: Return all matching PDFs, let caller pick best

---

## Files Changed Summary

### Created

- `src/__tests__/1289f-bctc-browser-discovery.test.ts` (NEW, 150 lines, 6 test cases)
- `/root/discover-bctc-urls-browser.py` (NEW, 250 lines, VPS side)

### Modified

- `vps-scripts/enrich-bctc-urls.sh` (lines 50–80: replace curl logic with Python call)
- `docs/ARCHITECTURE.md#vps-proxy-geo-block-workaround` (optional: add note about browser automation)

### Unchanged

- `src/interface/mcp/server.ts` (endpoint already implemented)
- `docs/handoffs/TASK_1289_DEPLOYMENT.md`

---

## Effort Estimate

- **TDD tests:** 1 hour (mock Playwright API, understand async patterns)
- **Python script:** 1.5 hours (implement three portal discovery functions + error handling)
- **Integration testing:** 0.5 hours (deploy to VPS, test with real stocks)
- **Total:** 3 hours

---

## Sign-Off Checklist

- [ ] Task branch created: `task/1289f-bctc-browser-discovery`
- [ ] 6 test cases written (RED), all fail initially
- [ ] Python script implemented, tests GREEN
- [ ] Shell script integration updated
- [ ] Local TypeScript tests pass: `bun test 1289f-*`
- [ ] No regressions: `bun test` full suite passes
- [ ] Python script tested on VPS with 3 real stocks
- [ ] Logs show PDFs being discovered + downloaded
- [ ] Implementation record appended to this handoff
- [ ] Agent memory updated: `docs/agent-memory/sessions/YYYY-MM-DD-developer.md`

---

## References

- **Phase 2 Enricher:** `docs/handoffs/TASK_1289_DEPLOYMENT.md`
- **VPS Blocker (original):** `docs/handoffs/TASK_1289_VPS_BCTC_BLOCKER.md`
- **VPS Scripts:** `vps-scripts/enrich-bctc-urls.sh`, `vps-scripts/vn-bctc-enrich.*`
- **Playwright Docs:** https://playwright.dev/python/docs/intro
- **Portal URLs:**
  - HOSE: https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC
  - HNX: https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html
  - UPCOM: https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html

---

## [Developer] Implementation Record

*(To be completed after development)*

**files_actually_modified:**
- *(pending)*

**tests_written:**
- *(pending)*

**tests_skipped:**
- *(pending)*

**tsc_clean:**
- *(pending)*

**full_suite_pass:**
- *(pending)*

