# TASK 1297b Handoff — BCTC Portal URL Discovery Fix

**Date:** 2026-04-23
**To:** Developer Agent
**From:** Product Owner (Phase 1297a complete)
**Priority:** HIGH (unblocks historical backfill, 37×8 quarters)
**Depends On:** None
**Blocks:** Task 1297c (OPS validation)

---

## Quick Summary

**Problem:** BCTC PDF discovery script failed all validation tests (0/3). Portals return 404 or non-discoverable PDFs.

**Solution:** Investigate current portal URLs (HOSE/HNX/UPCOM), fix script, test with ≥2/3 stocks passing.

**Effort:** 4–6 hours
**Success:** Script passes ≥2 of 3 test stocks (VNM, BID, FPT Q4 2024)

---

## Context

- **Sprint:** 1297 (System Reliability + BCTC Backfill)
- **Previous Investigation:** Task 1289g found HOSE is React SPA (JS-rendered), created enhanced wait strategy
- **Current State:** Enhanced script exists but untested; manual portal investigation needed
- **Technical Design:** See `docs/TECH_1297b.md`

---

## Files to Change

| File | Action | Detail |
|------|--------|--------|
| `vps-scripts/discover-bctc-urls-browser.py` | Fix URLs for HOSE/HNX/UPCOM | Update portal endpoints + SSL handling |
| `docs/BCTC_PORTAL_URL_FINDINGS_2026_UPDATED.md` | Create/update | Document investigation findings + solutions |

---

## Work Plan (Recommended Order)

### Phase 1: Portal Investigation (1–2h)

Use curl + browser DevTools to discover:

1. **HOSE** (https://www.hsx.vn)
   - Is endpoint `/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=VNM` correct?
   - Does it return 200 or 404?
   - Check network tab for AJAX endpoints carrying PDF URLs
   - Any authentication needed?

2. **HNX** (https://www.hnx.vn)
   - Find BCTC search page URL
   - Check page structure (form? API? AJAX?)
   - Document search parameter names (code, year, quarter, etc.)

3. **UPCOM** (https://www.upcom.vn)
   - Test HTTPS — SSL error? Type?
   - Find BCTC portal structure
   - Test with certificate bypass if needed

**Output:** Document each portal's correct URL + discovery method

### Phase 2: Fix Script (2–3h)

Update three functions in `discover-bctc-urls-browser.py`:
- `discover_from_hose()` — new URL + endpoint
- `discover_from_hnx()` — new URL + endpoint
- `discover_from_upcom()` — SSL fix + URL

If any portal uses REST API instead of HTML:
- Replace Playwright navigation with HTTP GET/POST
- Parse JSON instead of DOM
- Update confidence scores if needed

### Phase 3: Test (0.5–1h)

```bash
cd vps-scripts
python3 discover-bctc-urls-browser.py VNM 2024 Q4
python3 discover-bctc-urls-browser.py BID 2024 Q4
python3 discover-bctc-urls-browser.py FPT 2024 Q4
```

Success = ≥2 of 3 return PDF URLs

### Phase 4: Document + Commit (0.5h)

- Update `docs/BCTC_PORTAL_URL_FINDINGS_2026_UPDATED.md` with findings
- Commit: `git commit -m "fix(1297b): BCTC portal URL discovery — corrected endpoints, ≥2/3 tests pass"`

---

## Reference Documents

- **Technical Design:** `docs/TECH_1297b.md`
- **Previous Investigation:** `docs/BCTC_PORTAL_URL_FINDINGS_2026.md`
- **Earlier Findings:** `docs/BCTC_PORTAL_FORM_INVESTIGATION.md`
- **Implementation Spec:** `docs/BCTC_PORTAL_API_SPEC.md`

---

## Acceptance Criteria

- [x] HOSE portal URL verified (HTTP 200, returns discoverable PDFs)
- [x] HNX portal structure identified + documented
- [x] UPCOM SSL issue resolved (bypass or correct endpoint)
- [x] Script updated with corrected URLs
- [x] Playwright code passes ≥2 of 3 test stocks
- [x] Findings documented in `BCTC_PORTAL_URL_FINDINGS_2026_UPDATED.md`
- [x] Committed to main

---

## Next Step After Done

Once merged to main:
1. OPS agent (1297c) will deploy fixed script to Vinahost
2. OPS will run 37×8 historical backfill validation
3. System ready for full market analysis with historical BCTC data

---

## Notes

- Use `curl -I` for quick HTTP status checks
- Use browser DevTools → Network tab to inspect actual AJAX endpoints
- Test from France (where main MCP server runs) or VPS if needed for geo-block testing
- Playwright requires Chromium; ensure `bun install` was run or manually install: `pip install playwright && playwright install chromium`

