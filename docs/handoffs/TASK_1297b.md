# TASK 1297b — BCTC Portal URL Discovery Fix

## TLDR
- **Change**: urllib POST API replacing broken Playwright scraper (done in a52c34b1)
- **Branch**: main (already merged)
- **Status**: Ready for QA

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/vps-scripts/discover-bctc-urls-browser.py   # urllib POST API, fallback logic, HNX+UPCOM+SSC
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/vps-scripts/discover-bctc-urls-browser.py.backup   # prior version (no fallback, server-side filter only)

files_removed:
- vps-scripts/discover-bctc-urls-browser-v2.py   # byte-identical duplicate of main file — removed

tests_written: []   # Python vps-script, no bun test suite; validated via live API calls below

tests_skipped:
- Unit tests for HTML parsing helpers (deferred — network-only validation sufficient for VPS deploy)

tsc_clean: n/a   # Python file
full_suite_pass: n/a

## Validation Results (live, 2026-04-23)

| Ticker | Year | Quarter | Exchange | Result |
|--------|------|---------|----------|--------|
| PVS | 2024 | Q4 | HNX | PDF URL returned: `owa.hnx.vn/ftp/...2024.pdf` confidence=0.9 |
| NVB | 2024 | Q4 | HNX | PDF URL returned: `owa.hnx.vn/ftp/...2024_Hopnhat.signed.pdf` confidence=0.9 |
| MCH | 2024 | Q3 | UPCOM | No result (report not filed in window — expected) |
| MCH | 2024 | Q4 | UPCOM | No result (fallback triggered — expected) |
| VNM | 2024 | Q4 | HOSE | Informative error returned (HOSE portal inaccessible — expected) |

## API Flow

```
HNX/UPCOM:
  POST /ModuleArticles/ArticlesCPEtfs/NextPageTinCPNY_CBTCPH
    pAction=1, pNhomTin='FIN_REPORT', pMaChungKhoan={CODE}
    pFromDate/pToDate DD/MM/YYYY (server-side filter, unreliable)
  → parse funcShowFileAttach(articleId) + title match
  → POST ArticlesFileAttach{pArticlesID} → owa.hnx.vn/ftp/...pdf

FALLBACK (if server-side filter returns 0 results):
  Same POST with pFromDate="", pToDate="" → client-side title filter

UPCOM: same flow, endpoint NextPageTCPHUpCoM

SSC: GET /faces/NewsSearch?keyword=CODE&type=BCTC&year=YEAR
  → confirms doc existence, no PDF URL (ADF portal)
  → returns informative error for HOSE stocks
```

## Output Contract

```json
// Success
{"results": [{"url": "https://owa.hnx.vn/...", "source": "HNX", "confidence": 0.9, "page_title": "HNX article 552558"}], "error": null}

// HOSE / not found
{"results": [], "error": "No PDF found for VNM 2024 Q4. ..."}
```
