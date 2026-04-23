# Deployment Handoff: BCTC Discovery Browser Script (Task 1289f)

**Status:** Ready for OPS deployment
**Date:** 2026-04-23
**Script:** `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/vps-scripts/discover-bctc-urls-browser.py`

## Summary

Updated `discover-bctc-urls-browser.py` with hybrid wait strategy for async JavaScript rendering:
- All 3 portals (HOSE/HNX/UPCOM) now wait for PDFs to appear in DOM via `wait_for_function`
- Fallback to 2-second delay if JS detection times out
- Returns structured JSON with confidence scores (0.85–0.95)

## Changes Made

**File:** `vps-scripts/discover-bctc-urls-browser.py` (388 lines)

**Key improvements:**
```python
# Hybrid wait strategy (lines 116–123, 176–183, 239–246)
try:
    await page.wait_for_function(
        "() => document.querySelectorAll('a[href*=\".pdf\"]').length > 0",
        timeout=3000
    )
except PlaywrightTimeoutError:
    # Fallback: wait 2 seconds for any remaining JS execution
    await page.wait_for_timeout(2000)
```

- Detects when PDFs render in DOM (handles React-rendered HOSE/HNX/UPCOM portals)
- Graceful fallback prevents timeout-induced empty results
- Confidence scores: HOSE=0.95, HNX=0.9, UPCOM=0.85

## Deployment Steps (OPS Team)

### 1. Deploy script to VPS
```bash
scp -i ~/.ssh/id_ed25519 vps-scripts/discover-bctc-urls-browser.py root@125.212.251.27:/root/discover-bctc-urls-browser.py
```

### 2. Verify Playwright installation on VPS
```bash
ssh root@125.212.251.27
python3 -m pip show playwright
# If missing: pip install playwright && python3 -m playwright install chromium
```

### 3. Run test discovery (3 stocks × 1 quarters = 3 test runs)

```bash
# Test 1: VNM 2024 Q4
python3 /root/discover-bctc-urls-browser.py VNM 2024 Q4

# Test 2: BID 2024 Q4
python3 /root/discover-bctc-urls-browser.py BID 2024 Q4

# Test 3: FPT 2024 Q4
python3 /root/discover-bctc-urls-browser.py FPT 2024 Q4
```

### 4. Expected output format
```json
{
  "results": [
    {
      "url": "https://hsx.vn/.../.pdf",
      "source": "HOSE",
      "confidence": 0.95,
      "page_title": "..."
    }
  ],
  "error": null
}
```

### 5. Validation criteria
- **Success:** ≥2 PDFs found across 3 stocks (>66% hit rate)
- **Confidence:** All results should have `confidence >= 0.85`
- **Sources:** Mix of HOSE|HNX|UPCOM
- **Empty results:** Would indicate JS rendering still not captured (fallback to Option C)

## Rollback Plan

If tests fail (0 PDFs found):
1. Check VPS Python/Playwright environment
2. Verify portal URLs are still accessible from VPS IP
3. Check stderr logs for specific portal timeouts
4. If persistent: escalate to Task 1289g (fallback to Puppeteer/Node.js)

## Integration

Once validated:
- Script will be called by `vn-bctc-fetch.service` on VPS
- Results feed into `enrich-bctc-urls.sh` discovery pipeline
- BCTC PDF fetch job will retry discovery every 6 hours

## Files

- **Script:** `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/vps-scripts/discover-bctc-urls-browser.py`
- **VPS destination:** `/root/discover-bctc-urls-browser.py`
- **Related:** Task 1289f, Task 1289e (discovery pipeline)
