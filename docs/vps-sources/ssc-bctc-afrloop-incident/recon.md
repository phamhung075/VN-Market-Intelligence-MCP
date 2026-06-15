# Recon: OPS-BCTC-PIPELINE-RECON — BCTC Pipeline Dead 34.3h

**Date:** 2026-06-15  
**Agent:** ops-vps-fetch (c014)  
**Task:** OPS-BCTC-PIPELINE-RECON (in_progress, lane=ops, dispatch b64967b6)  
**Incident window:** 2026-06-13T23:45Z (last push) → 2026-06-15T17:08Z (~34.4h dead)

---

## Hypothesis Disposition

| Hypothesis | Verdict | Evidence |
|---|---|---|
| H1: VPS-down / resource | CLEARED | SSH ok; uptime 62d; disk 25% (5.9G/25G); mem 530Mi/961Mi; load 0.16 |
| H2: bctc-push-cron stopped | CLEARED | `vn-bctc-fetch.service` active (running) since Jun 11 00:22; last cycle completed 17:08 UTC today |
| H3: geo-block / SSL regression | PARTIAL | SSC TLS ok (CERT_NONE, verified). HNX POST API now 302→/Home/Error (new session-cookie requirement, see Root B below). Not an SSL regression. |
| H4: enricher 0-URL discovery stall | ROOT CAUSE | SSC afrLoop counter rolled 26xxx→27xxx; discovery script regex `r"(26\d{14,16})"` failed to match; step2 returned loopback JS instead of ADF page; ViewState absent → 0 rows for all HOSE tickers since ~2026-06-15T12-16Z |

---

## Root Causes — TWO independent bugs

### Root A (PRIMARY, FIXED): SSC afrLoop counter rollover
**File:** `/root/discover-bctc-urls-browser.py` (lines 784-791)  
**Onset:** 2026-06-15 between 11:55Z (last cycle with step2 OK, afrLoop=26994xxx) and 16:54Z (my probe, afrLoop=27012xxx)

**Bug:** The regex `r"(26\d{14,16})"` extracted the Oracle ADF loopback `_afrLoop` parameter from SSC's step1 response. The counter value passed `27000000000000000` (transition from 26xxx to 27xxx prefix). Both the primary regex and the fallback `r"\b(26\d{14})\b"` matched nothing, so `afr_loop` defaulted to the hardcoded `"26000000000000000"`. Step 2 (GET with that stale loop value) received the loopback JS script again (6.8KB) instead of the full ADF page (83KB). ViewState was absent from the loopback → `"ViewState not found"` → all SSC searches returned 0 rows.

**Secondary winId extraction bug (co-present):** regex `r"['\"]([wW][a-zA-Z0-9]{5,15})['\"]"` matched `'_noloopbackerror_'` or similar internal JS strings rather than the actual ADF window ID. The runLoopback() positional argument (8th arg) is the reliable source.

**Fix applied (deployed to VPS 2026-06-15T~17:40Z):**
```python
# Old (broken):
m_loop = re.search(r"(26\d{14,16})", body1)
if not m_loop:
    m_loop = re.search(r"\b(26\d{14})\b", body1)
afr_loop = m_loop.group(1) if m_loop else "26000000000000000"
m_win = re.search(r"['\"]([wW][a-zA-Z0-9]{5,15})['\"]", body1)
win_id = m_win.group(1) if m_win else "w0"

# Fixed:
m_loop = re.search(r"(\d{15,18})", body1)
afr_loop = m_loop.group(1) if m_loop else "27000000000000000"
m_win = re.search(
    r"runLoopback\(\s+11,\s+'_afrLoop',\s+'(\d+)',\s+'_afrWindowMode',"
    r"\s+'Adf-Window-Id',\s+'_afrPage',\s+'',\s+'([^']+)'",
    body1,
)
win_id = m_win.group(2) if m_win else "w0"
```

**Fix verified live:** VCB Q1/2026 → 8,505,770B PDF downloaded; FPT Q1/2026 → 2,721,355B PDF downloaded. Both confirmed via `afrLoop=27012xxx` in step1 log.

---

### Root B (SECONDARY, UNFIXED): HNX POST endpoints require session cookie

**Endpoints:** `https://hnx.vn/ModuleArticles/ArticlesCPEtfs/NextPageTinCPNY_CBTCPH` and `NextPageTCPHUpCoM`

**Behavior:** Both endpoints now return HTTP 302 → `/Home/Error?aspxerrorpath=/ModuleArticles/...` for stateless POST requests (no prior GET). With a prior GET to the referrer page that establishes the session cookie `616a3745ee32423b8ef6bed543a12282`, the POST returns HTTP 200 with article results (30KB, contains `funcShowFileAttach`).

**Impact:** HNX-listed and UPCOM-listed tickers (the 9 remaining in queue: ACV, BDI, DAG, DLC, JSH, SIS, VDC, VNH, VEA) cannot be discovered via HNX path. The current script's `_http_post` makes stateless POSTs without a prior cookie-establishing GET.

**When did HNX start requiring session?** Unknown — the last HNX match in the log was HUT on Jun 13 23:45Z. Whether HNX changed behavior on Jun 13 or Jun 14 is unclear, but the 302 is consistent across all current probes.

**Fix needed (dev-vps-crawls):** In `discover-bctc-urls-browser.py`, `_discover_hnx_upcom()` must do a GET to the referrer URL before the POST, sharing a cookie jar via `http.cookiejar.CookieJar()` + urllib opener, same pattern as the SSC flow.

---

### Root C (PRE-EXISTING, UNFIXED): SSC exchange_code=HOSE excludes UPCOM tickers

**Bug:** `exchange_code = _EXCHANGE_CODES.get("HOSE", "1")` → soc3="1" (HOSE only). UPCOM-listed tickers (ACV, VEA, VNH) were invisible on SSC. Comment in the code said to use `soc3=""` for all exchanges.

**Fix applied to local file** (vps-scripts/discover-bctc-urls-browser.py, line 763): `exchange_code = ""` — search all exchanges.

**Deployed to VPS.** But this fix alone doesn't recover the 9 queued tickers because:
- ACV: SSC has Q1/2026 data (idx=15: "Báo cáo tài chính quý 1/2026", filed 06/05/2026) but `c111` cell is EMPTY. Matching logic uses `c111`; period info is in `c3`. → needs additional fix (see Root D).
- BDI, DAG, DLC, JSH, SIS, VDC: 0 rows on SSC even with all-exchange search — these tickers appear to not be on SSC or haven't filed Q1/2026.
- VNH: 2 rows on SSC but both are 2025 annual reports only.
- VEA: 15 rows on SSC but all 2025 data; Q1/2026 not filed on SSC yet.

---

### Root D (PRE-EXISTING, UNFIXED): SSC c111 empty for UPCOM/state-entity filers

**Bug:** `_ssc_parse_rows()` uses `c111` (document summary) for title matching. For ACV and similar UPCOM/state-owned enterprise filers, `c111` is always empty on SSC. The period and filing type info lives in `c3` (report type) which contains "Báo cáo tài chính quý 1/ 2026". The matcher never fires because `not title` guard exits early.

**Fix scope:** `_ssc_parse_rows()` must fall back to `c3` when `c111` is empty. Pattern: `c3` contains "quý N/ YYYY" or "năm YYYY" — same matching keywords apply.

---

## Status of the 9 Queued Tickers

| Ticker | SSC rows | Q1/2026 on SSC | HNX/UPCOM (if session) | Blocking issue |
|---|---|---|---|---|
| ACV | 15 (soc3="") | YES (c3 only) | Requires session GET | Root C+D fixed |
| BDI | 0 | NO | Requires session GET | Not filed or not on SSC |
| DAG | 0 | NO | Requires session GET | Not filed or not on SSC |
| DLC | 0 | NO | Requires session GET | Not filed or not on SSC |
| JSH | 0 | NO | Requires session GET | Not filed or not on SSC |
| SIS | 0 | NO | Requires session GET | Not filed or not on SSC |
| VDC | 0 | NO | Requires session GET | Not filed or not on SSC |
| VNH | 2 (2025 only) | NO | Requires session GET | Not filed Q1/2026 yet |
| VEA | 15 (2025 only) | NO | Requires session GET | Not filed Q1/2026 on SSC yet |

---

## HOSE Tickers (Already Resolved)

VCB Q1/2026 and FPT Q1/2026 confirmed downloadable via SSC after Root A fix. Prior pushes (Jun 7): PPC, VCB, KDC already pushed. The bctcQueueEnricher had enriched these and they're already in the DB (queue dropped from 10 to 9 after HUT was pushed Jun 13).

---

## Fixes Applied to VPS

1. `afrLoop` regex: `r"(26\d{14,16})"` → `r"(\d{15,18})"` — handles any counter prefix
2. `winId` extraction: loose string scan → positional parse from `runLoopback()` 8th arg
3. `exchange_code`: hardcoded `"1"` (HOSE) → `""` (all exchanges)

Local file: `/vps-scripts/discover-bctc-urls-browser.py` (deployed via SCP)

---

## Durable Root Cause Summary

The pipeline is a **fragile regex-based session impersonation** of Oracle ADF. Any counter prefix change or server-side session requirement change breaks it silently with `"no PDF found"` — indistinguishable from a legitimate no-filing result. There is NO active-freshness health gate: the system cannot tell the difference between "ticker hasn't filed" and "discovery script is broken."

**Two recurring failure classes:**
1. Source-side counter/token value changes (afrLoop prefix) — happened twice now (this is the 2nd recurrence)
2. Source-side session requirements tightened (HNX 302 new behavior)

---

## Recommended Durable Fix Owners

| Fix | Owner | Scope |
|---|---|---|
| HNX session cookie (Root B) | **dev-vps-crawls** | Add GET referrer page before POST in `_discover_hnx_upcom()`; share CookieJar |
| SSC c111 empty fallback to c3 (Root D) | **dev-vps-crawls** | In `_ssc_parse_rows()`: if `c111` empty, use `c3` for title matching |
| Zero-URL alerting gate | **dev-mcp-server-enricher** | If `bctcQueueEnricher` returns 0 URLs for ALL tickers for 2+ consecutive cycles → fire alert; do NOT silently continue |
| Active-freshness health gate | **dev-mcp-server** | Gate on `max(last_success_age)` for BCTC push, not just service liveness — mirror the `passive_health_masks_dead_data` lesson |

---

## Source URLs Probed

- `https://congbothongtin.ssc.gov.vn/faces/NewsSearch` — 3-step ADF workflow  
- `https://hnx.vn/ModuleArticles/ArticlesCPEtfs/NextPageTinCPNY_CBTCPH` — HNX NY  
- `https://hnx.vn/ModuleArticles/ArticlesCPEtfs/NextPageTCPHUpCoM` — HNX/UPCOM  

## Anti-bot Assessment

SSC: NONE (cert_none, no CF, no captcha — Oracle ADF stateful session only)  
HNX: Session cookie required (new as of ~Jun 14). Not Cloudflare. Own ASP.NET session management.

## Working Recipe (SSC, post-fix)

```bash
# Step 1 — GET loopback → JSESSIONID + afrLoop + winId
curl -s -c /tmp/ssc_cookies.txt 'https://congbothongtin.ssc.gov.vn/faces/NewsSearch' -k \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...'
# Extract: afrLoop via r"(\d{15,18})" — NOT r"(26\d{14,16})"
# Extract: winId via runLoopback(11, '_afrLoop', '<loop>', '_afrWindowMode', 'Adf-Window-Id', '_afrPage', '', '<winId>', ...

# Step 2 — GET ADF page → ViewState
curl -s -b /tmp/ssc_cookies.txt -k \
  "https://congbothongtin.ssc.gov.vn/faces/NewsSearch;jsessionid=$JSESSIONID?_afrLoop=$AFRL&_afrWindowMode=2&Adf-Window-Id=$WIN_ID"
# Expect: 83-84KB HTML with javax.faces.ViewState hidden input

# Step 3a — PPR search
curl -s -b /tmp/ssc_cookies.txt -k -X POST \
  -H 'Faces-Request: partial/ajax' \
  --data "javax.faces.ViewState=$VS&pt9:it8112=$CODE&pt9:soc3=&..."
# pt9:soc3="" (empty = all exchanges) — NOT "1" (HOSE only)

# Step 3b — PDF download (no Faces-Request header)
# Parse rows via c3 field when c111 is empty
```

## Working Recipe (HNX, with session)

```bash
# GET referrer first to establish session cookie
curl -s -c /tmp/hnx_cookies.txt 'https://hnx.vn/vi-vn/thong-tin-cong-bo-up-hnx.html' -k

# POST with session cookie
curl -s -b /tmp/hnx_cookies.txt -X POST \
  -H 'Content-Type: application/x-www-form-urlencoded; charset=UTF-8' \
  -H 'X-Requested-With: XMLHttpRequest' \
  -H 'Referer: https://hnx.vn/vi-vn/thong-tin-cong-bo-up-hnx.html' \
  --data 'pAction=1&pNhomTin=&pMaChungKhoan=VEA&pFromDate=01/04/2026&pToDate=30/06/2026&pNumPage=1&pNumRecord=20' \
  -k 'https://hnx.vn/ModuleArticles/ArticlesCPEtfs/NextPageTCPHUpCoM'
# Returns 200 with article listing (30KB, contains funcShowFileAttach)
```
