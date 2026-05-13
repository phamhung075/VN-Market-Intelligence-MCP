# Triage — hsx-bctc

**Date:** 2026-05-13
**Agent:** dev-vps-crawls
**Severity:** CRITICAL — zero Q1/2026 BCTC PDFs being acquired
**Signal source:** docs/signals/processed/dev-vps-crawls-2026-05-13T04-49-25Z.json

---

## 1. Confirmed Current Behavior (Live Probe 2026-05-13)

### HNX AJAX Endpoint — Two Distinct Issues

The recon doc identified `NextPageTinCPNY_CBTCPH POST returns homepage HTML`. Live probe from VPS disambiguates this into TWO separate failure modes:

**Failure A — Missing `pAction=1` parameter (existing scraper bug):**
When POST is sent with only `pageIndex`/`pageSize` (as `discover-bctc-urls-browser.py` uses in its first probe step), the server returns homepage HTML (~40,545 bytes, `<title>Trang chủ</title>`). This is the recon doc observation. Root cause: this minimal POST is not the correct AJAX contract.

**Failure B — HOSE ticker routed to HNX endpoint (logic bug):**
When POST is sent with `pAction=1` + `pNhomTin="'FIN_REPORT'"` + `pMaChungKhoan=VNM` (or MWG, BID, HPG etc.), the server correctly responds with `Không tìm thấy dữ liệu` (no results) because VNM is HOSE-listed, not HNX/UPCOM-listed. This is correct server behaviour for a correct query on the wrong exchange.

**What works correctly:**
- HNX-listed tickers (NVB, PVS, ACB, SHB etc.) with correct `pAction=1` parameters return Q1/2026 BCTC data:
  - NVB: `04/05/2026` — "Báo cáo tài chính quý 1/2026" (2 records, server-side date filter confirmed working)
  - PVS: `12/05/2026` — "Báo cáo tài chính quý 1/2026"
- Server-side date filtering (pFromDate/pToDate DD/MM/YYYY) works correctly

**Conclusion on HNX:** The HNX endpoint is NOT broken. The `discover-bctc-urls-browser.py` script has a parameter bug (missing `pAction=1` in its first probe) that makes it appear broken. The Q1/2026 failure for HOSE tickers is a routing problem, not an endpoint problem.

### HSX/SSC Playwright — Confirmed TasksMax Resource Kill

```
pthread_create: Resource temporarily unavailable (11)
```

Systemd `vn-bctc-fetch.service` has `TasksMax=32`. Chromium requires ~100+ threads. Fix requires changing `TasksMax` in the service unit. This is an ops configuration change, not a code change.

However: even with TasksMax increased, Playwright on this ~1 GB VPS is fragile (OOM risk). A no-browser replacement is strongly preferred.

---

## 2. Root Cause Summary

| Problem | Root Cause | Correct Fix |
|---------|-----------|-------------|
| HNX returns homepage for HOSE tickers | `discover-bctc-urls-browser.py` sends wrong POST (missing `pAction=1`) on first probe; then HOSE tickers correctly return "not found" from HNX endpoint | Fix POST parameters in discovery script; add exchange routing logic |
| SSC Playwright crashes | `TasksMax=32` kills Chromium threads | Replace with no-browser path OR increase TasksMax + MemoryMax |
| HOSE tickers have zero fallback | After HNX/UPCOM both return empty, SSC fallback crashes | Build a no-browser SSC path |

---

## 3. No-Chromium Replacement Proposal

### Path A — Fix HNX Parameters (High confidence, low effort — 1h)

Fix the initial POST in `discover-bctc-urls-browser.py` to always include `pAction=1` and `pNhomTin="'FIN_REPORT'"`. This restores HNX/UPCOM ticker discovery immediately.

Affected function: `_discover_hnx_upcom()` — the `ATTEMPT 1` block already has correct parameters. The bug is that the script's first outer probe (`pageIndex`/`pageSize` minimal params) runs before the function and causes the "returns homepage" confusion. The function itself has correct params and will work once called.

Verdict: **No code change needed in `_discover_hnx_upcom()`** — the function is already correct. The script-level confusion was the recon probe using minimal params. The real fix is ensuring the discovery script is called correctly (it IS called with correct params from `fetch-bctc.sh`). Re-test by running `python3 /root/discover-bctc-urls-browser.py NVB 2026 Q1` on the VPS.

### Path B — HSX SPA XHR Endpoint Discovery (Medium confidence, medium effort — 4-8h)

HSX (`hsx.vn`) is a React SPA. The StockDocuments page loads data via client-side XHR after render. The XHR API endpoint is not documented but can be reverse-engineered from browser DevTools Network tab on `https://www.hsx.vn/Modules/Listed/Web/StockDocuments?pageFieldValue=VNM&...`.

**Proposed approach:**
1. Use browser DevTools (or `mitmproxy` on dev machine) to capture XHR calls made by `hsx.vn/StockDocuments` for ticker VNM
2. Identify the underlying JSON API endpoint (likely `api.hsx.vn/...` or an undocumented sub-path)
3. If API returns document list with PDF URLs: implement with `requests` (plain, no browser needed)
4. If API returns only metadata without PDF URLs: check `hsx.vn` search page for direct document download links

**Known data from recon:** `api.hsx.vn` news API exists but "returns items with no PDF URLs (ADF PPR links)" per `discover-bctc-urls-browser.py` comments. This suggests the PDF download may be behind another API call or require authentication. More investigation needed.

**Effort estimate:** 4-8h (reverse engineering XHR API + testing + implementing scraper)

### Path C — SSC Direct HTTP (Low confidence, possible — 2h research)

`congbothongtin.ssc.gov.vn/faces/NewsSearch` is Oracle ADF. Plain GET returns 7 KB JS splash. However, Oracle ADF uses `PPR` (Partial Page Rendering) for AJAX sub-requests. These PPR endpoints may be callable without full page render if the correct ADF state token can be extracted.

**Proposed approach:**
1. Capture the ADF PPR XHR calls from browser DevTools when searching on the SSC portal
2. Identify the PPR endpoint URL and required state parameters (`_adf.ctrl-state`, `_afrLoop` etc.)
3. Implement a 2-step HTTP session: GET main page to extract ADF state → POST PPR search request
4. If download link is in PPR response: download directly without browser

**Risk:** Oracle ADF state tokens are session-bound and expire quickly. The `_afrLoop` counter must increment correctly. This may be fragile.

**Effort estimate:** 2h research (browser DevTools capture) + 4-6h implementation if feasible

### Path D — SSC TasksMax Increase (Ops fix, short-term — 30min)

Increase `TasksMax=512` and `MemoryMax=512M` in `/etc/systemd/system/vn-bctc-fetch.service`. This unblocks the existing Playwright implementation immediately without any code changes.

**Risk:** RAM contention with other VPS services. Monitor OOM events after change. If VPS RAM < 1.5 GB total, risk is high. Treat as temporary until Path B or C is validated.

**Effort estimate:** 30min (ops systemd edit + reload)

---

## 4. Recommended Action Plan

**Immediate (no code change needed):**
- Re-test `python3 /root/discover-bctc-urls-browser.py NVB 2026 Q1` on VPS — this should now succeed for HNX-listed tickers given the correct parameters are already in the function. If it fails, investigate the specific function call path.

**Short-term (1-2 days):**
- File TASK for developer: implement Path D (TasksMax increase for HOSE/SSC unblock) as temporary fix
- File TASK for developer: implement Path B (HSX SPA XHR endpoint reverse-engineering)

**Medium-term (1 week):**
- Path B or C replaces Playwright permanently, eliminating VPS RAM risk

---

## 5. TASK Recommendation

**Recommend filing: YES — two tasks**

| Task | Type | Priority | Effort | Agent |
|------|------|----------|--------|-------|
| TASK-BCTC-1: Increase TasksMax/MemoryMax in vn-bctc-fetch.service | ops | HIGH | 30min | ops |
| TASK-BCTC-2: Reverse-engineer hsx.vn XHR API for no-browser HOSE BCTC discovery | dev | HIGH | 4-8h | developer (dev-vps-crawls) |
| TASK-BCTC-3 (optional): Research SSC Oracle ADF PPR endpoint for no-browser SSC path | dev | MEDIUM | 6-8h | developer (dev-vps-crawls) |

**TASK-BCTC-1 can be done independently by ops (no code). TASK-BCTC-2 is the long-term fix.**

---

## 6. Downstream Impact

| Tickers | Exchange | Current status | Fix path |
|---------|----------|---------------|---------|
| NVB, PVS, ACB, SHB, NVB, PVS (and all HNX-listed) | HNX | Works with correct params — may already be working if discover script is called correctly | Verify / no-op |
| VEA, MCH (UPCOM) | UPCOM | Same as HNX path — may already work | Verify / no-op |
| VNM, MWG, BID, VCB, HPG, FPT (HOSE) | HOSE/SSC | Fully blocked — SSC Playwright crashes | TASK-BCTC-1 + TASK-BCTC-2 |

---

## 7. Signal Items Deferred (Not Crawl Problems)

Per mission scope, the following signal items belong to **dev-mcp-server / ops**, not dev-vps-crawls:

- **vps-prices push failures** (38 consecutive): `cannot reach MCP server`. Upstream `bgapidatafeed.vps.com.vn` is healthy. Issue is VPS→MCP server connectivity or MCP push endpoint config. Owner: dev-mcp-server.
- **vn-news-rss push 404**: `PUSH 245 items → /api/push-news http=404`. All 14 RSS feeds healthy. MCP endpoint `/api/push-news` missing or moved. Owner: dev-mcp-server.
