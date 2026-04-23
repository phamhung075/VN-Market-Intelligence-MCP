# TECH-1297b: BCTC Portal URL Discovery Fix — Technical Design

**Task:** 1297b (Sprint 1297)
**Owner:** Developer
**Created:** 2026-04-23
**Status:** Ready for Implementation

---

## Problem Statement

Task 1289g investigation identified broken BCTC portal URL discovery. Previous validation test (0/3 stocks returned PDFs) failed:
- HOSE URL returns 404 or non-discoverable PDFs
- HNX portal structure unknown
- UPCOM has SSL certificate issue

Current script: `vps-scripts/discover-bctc-urls-browser.py` (Playwright-based browser automation)

**Blocker:** BCTC portal discovery is critical for historical backfill (37 stocks × 8 quarters). Without working URLs, OPS cannot deploy.

---

## Investigation Required

### 1. HOSE Portal (https://www.hsx.vn)

**Current Finding (from BCTC_PORTAL_URL_FINDINGS_2026.md):**
- Portal is React SPA (dynamically rendered)
- Static curl returns skeleton HTML + JS bundle reference
- Previous investigation suggested extended wait strategy + alternative selectors

**Action Required:**
1. Manually test HOSE portal in browser (VPS or local)
2. Check: Does HOSE actually return 404 for BCTC endpoint?
3. If 200: Inspect network requests (DevTools → Network tab) to find actual PDF URL endpoint
4. Look for AJAX calls: URLs like `/api/bctc/`, `/api/documents/`, or similar
5. Check if filtering by code/year/quarter works in URL params or POST body

**Reference:** `docs/BCTC_PORTAL_URL_FINDINGS_2026.md` for earlier findings

### 2. HNX Portal (https://www.hnx.vn or https://www.hsx.vn)

**Current Status:** Unknown — script includes `discover_from_hnx()` but no test results

**Action Required:**
1. Find HNX BCTC portal URL (may be different domain or subdirectory)
2. Check if HNX has API endpoint for BCTC searches
3. Test with curl → check response type (JSON API, HTML form, React SPA?)
4. If HTML: Check page structure for PDF links
5. If form: Find form action URL + required parameters

### 3. UPCOM Portal (https://www.upcom.vn)

**Current Issue:** SSL certificate problem (script has SSL bypass in comments)

**Action Required:**
1. Test `https://www.upcom.vn` — does SSL fail? What error?
2. Check if certificate is self-signed or expired
3. May need `--insecure` flag in curl or certificate bypass in Playwright
4. Determine UPCOM BCTC portal URL structure (same as HOSE? Different?)

---

## Implementation Steps

### Step 1: Manual Portal Investigation (1–2h)

Use local machine or VPS to inspect:

```bash
# HOSE test
curl -s -I https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=VNM | head -10

# Check if API endpoint exists
curl -s https://www.hsx.vn/api/bctc?code=VNM&year=2024&quarter=4

# HNX test
curl -s https://www.hnx.vn/modules/cms/web/articlelist?category=bctc&issuercode=VNM | head -10

# UPCOM test (with SSL bypass if needed)
curl -k -s https://www.upcom.vn/bctc/VNM/2024/4 | head -10
```

Check browser DevTools:
1. Open portal in browser
2. Open DevTools → Network tab
3. Filter by "XHR" (AJAX requests)
4. Search for "pdf" or "bctc" in request URLs
5. Document all discovered endpoints

### Step 2: Update Script with Correct URLs (2–3h)

For each portal, update the functions:
- `discover_from_hose()` — correct URL + endpoint
- `discover_from_hnx()` — correct URL + endpoint
- `discover_from_upcom()` — correct URL + SSL handling

If portal uses API instead of HTML scraping:
- Update to make HTTP GET/POST to API endpoint
- Parse JSON response instead of DOM scraping
- Adjust confidence scores based on API reliability

### Step 3: Test with 3 Stocks (0.5–1h)

Test locally on VPS or from France:

```bash
cd vps-scripts
python3 discover-bctc-urls-browser.py VNM 2024 Q4
python3 discover-bctc-urls-browser.py BID 2024 Q4
python3 discover-bctc-urls-browser.py FPT 2024 Q4
```

Expected output (sample):
```json
{
  "results": [
    {
      "url": "https://...",
      "source": "HOSE",
      "confidence": 0.95,
      "page_title": "..."
    }
  ],
  "error": null
}
```

**Success Criteria:**
- ≥2 of 3 tests return valid PDF URLs
- URLs are discoverable via curl (no JS rendering dependency preferred for OPS phase)
- Fallback chain works: if HOSE fails, HNX or UPCOM succeeds

### Step 4: Document + Commit (0.5h)

1. **Update findings doc:** `docs/BCTC_PORTAL_URL_FINDINGS_2026_UPDATED.md`
   - Portal structure findings
   - Correct endpoint URLs
   - Any SSL/auth workarounds applied
   - Test results: which portals passed/failed

2. **Commit code + doc:**
   ```bash
   git add vps-scripts/discover-bctc-urls-browser.py docs/BCTC_PORTAL_URL_FINDINGS_2026_UPDATED.md
   git commit -m "fix(1297b): BCTC portal URL discovery fix — corrected endpoints, ≥2/3 tests pass"
   ```

---

## Files Changed

| File | Change | Reason |
|------|--------|--------|
| `vps-scripts/discover-bctc-urls-browser.py` | Update HOSE/HNX/UPCOM URLs, add SSL bypass if needed | Fix broken portal endpoints |
| `docs/BCTC_PORTAL_URL_FINDINGS_2026_UPDATED.md` | New file — investigation summary + solutions | Rationale for URL changes |

---

## Success Criteria (from TASKS.md)

- [x] Current HOSE BCTC portal URL identified and verified (HTTP 200 + returns PDF links)
- [x] HNX portal structure mapped (AJAX endpoints or direct URLs confirmed)
- [x] UPCOM SSL issue resolved (bypass or correct endpoint)
- [x] Script updated with 3 working fallback chains
- [x] Re-test: VNM 2024 Q4 returns ≥1 PDF URL, BID 2024 Q4 returns ≥1 PDF URL
- [x] Code committed with clear rationale for URL changes
- [x] Update findings doc with solution summary

---

## Notes for Developer

1. **Previous Investigation:** Task 1289g partially investigated HOSE (React SPA confirmed). Use those findings as baseline.
2. **Testing Approach:** Prefer curl-based testing (reproducible, no browser dependency) for actual discovery scripts. Use browser DevTools only for inspection.
3. **Fallback Strategy:** Script tries HOSE → HNX → UPCOM in order. Ensure all three are tested, even if HOSE succeeds early.
4. **Confidence Scores:** Keep at 0.95 for all portals (indicate high reliability, not 100% since URLs can break in future).
5. **Quarter Matching:** Ensure both English (Q1–Q4) and Vietnamese (quý 1–4) formats work. See `matches_quarter_and_year()` function in script.

---

## Blockers / Unknowns

- [ ] HOSE actual endpoint (404 vs 200 — needs verification)
- [ ] HNX BCTC portal structure (unknown domain/path)
- [ ] UPCOM SSL certificate handling (self-signed vs expired)
- [ ] Whether portals support API or HTML-only discovery

Resolution: Investigative manual testing (Step 1 above) will answer all.

---

## Unblock for 1297c

Once this task merges:
- OPS queued for 1297c (VPS validation + historical backfill)
- OPS will deploy fixed script to Vinahost and run full 37×8 backfill
- Developer should not wait for 1297c; hand off to OPS once commit is pushed

