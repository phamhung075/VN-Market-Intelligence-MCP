# ops-vps-fetch — Notebook

**Last updated:** 2026-06-15 17:11 UTC | **Sprint:** OPS-BCTC-PIPELINE-RECON (BCTC pipeline dead 34.4h)

---

## Identity

Agent: VPS Fetch Diagnostician
Role: SSH recon specialist for VN geo-blocked data sources
Zone: ops-zone (VPS / infra)

---

## Active Sources Under Watch

| Source | Last recon | Status | Anti-bot |
|--------|-----------|--------|---------|
| vps-prices | 2026-05-13 | healthy (upstream) / MCP push broken | none |
| cafef-index | 2026-05-13 | healthy | none |
| vn-news-rss | 2026-06-09 | healthy (upstream+push). Two bugs: Bug A=false-UNHEALTHY (dev-zone fix needed in vpsHealthPoller.ts); Bug B=cursor jump (VPS fix applied 2026-06-09) | none |
| sbv-rates | 2026-05-13 | healthy | none (Akamai present, not blocking) |
| hsx-bctc | 2026-05-13 09:17 | FIXED (HNX params corrected) / HSX SPA unchanged | none |
| hsx-bctc (api.hsx.vn) | 2026-05-15 04:45 | BLOCKER — /n/ JSON REST endpoints unreachable from VPS. Envoy route-level block, not geo-IP. | Envoy route table |
| ssc-bctc-newsearch | 2026-06-15 17:11 | FIXED — afrLoop rollover resolved; HOSE tickers OK; UPCOM tickers blocked by c111+HNX session | none |
| hnx-bctc-post-api | 2026-06-15 17:11 | BROKEN — 302 for stateless POST; requires session cookie GET first | ASP.NET session |

---

## Recon History

| Date | Source | Trigger | Outcome |
|------|--------|---------|---------|
| 2026-05-13 | vps-prices | bootstrap | 200 OK upstream. MCP push failing 38 consecutive cycles. Signal dropped. |
| 2026-05-13 | hsx-bctc | bootstrap | BROKEN. HNX AJAX returns homepage. Playwright crashes (pthread_create). |
| 2026-05-13 09:17 | hsx-bctc | re-recon | ROOT CAUSE FOUND. Old params replaced. Q1/2026 PDFs confirmed. |
| 2026-05-15 04:45 | hsx-bctc (api.hsx.vn) | TASK-BCTC-3a | FAIL. Envoy route table blocks /n/ paths. Not geo-IP. BLOCKER. |
| 2026-06-01 08:51 | cafef + vneconomy | VPS-NEWS-CAFEF-VNECO | Direct paths healthy. is_blocked() false-positive fixed. |
| 2026-06-04 08:10 | vietstock-agm-plan | RECON-AGM-1 | FETCHABLE. POST + CSRF warmup. No CF. Signal dropped. |
| 2026-06-06 16:45 | ssc-bctc-newsearch | SPIKE-VPS-SSC-CURL-RECIPE | VIABLE-CURL. Full 3-step recipe proven. Signal dropped. |
| 2026-06-09 03:30 | vn-news-rss | FIX-NEWS-VPS-CRASH-LOOP | Bug A: false-UNHEALTHY from timestamp format mismatch (T vs space) in vpsHealthPoller.ts MAX() — dev-zone fix required. Bug B: cursor jump from future-dated pubDate — VPS cap applied. |

---

## c014 · 2026-06-15T17:11Z · OPS-BCTC-PIPELINE-RECON — BCTC Dead 34.4h: afrLoop Rollover + HNX Session

Trigger: P0 incident — BCTC pipeline dead ~34.3h. Last push HUT Q1/2026 at 2026-06-13T23:45Z. VPS queue stuck at 9 items since.

**ROOT CAUSE A (FIXED): SSC afrLoop counter rollover 26xxx→27xxx**

Between 2026-06-15T11:55Z and 16:54Z the Oracle ADF `_afrLoop` counter value transitioned from `26994xxx` to `27012xxx`. The extraction regex `r"(26\d{14,16})"` matched nothing → fallback hardcoded value `"26000000000000000"` used → step2 GET returned loopback JS (6.8KB) not ADF page (83KB) → ViewState absent → all SSC searches 0 rows.

Fix deployed: regex changed to `r"(\d{15,18})"` (prefix-agnostic). winId extraction moved to positional parse of `runLoopback()` 8th argument. Verified: VCB Q1/2026 (8.5MB) + FPT Q1/2026 (2.7MB) downloaded.

**ROOT CAUSE B (UNFIXED): HNX POST endpoints require session cookie**

Both HNX endpoints (`NextPageTinCPNY_CBTCPH`, `NextPageTCPHUpCoM`) now return HTTP 302 → `/Home/Error` for stateless POSTs. A prior GET to the referrer URL is required to set cookie `616a3745ee32423b8ef6bed543a12282`. The discovery script's `_http_post` makes stateless POSTs. Affects all 9 queued HNX/UPCOM tickers. Fix owner: dev-vps-crawls.

**PRE-EXISTING A (DEPLOYED): exchange_code HOSE-only excluded UPCOM tickers**

`exchange_code = _EXCHANGE_CODES.get("HOSE","1")` → soc3="1" filtered out UPCOM tickers on SSC. Fixed to `exchange_code = ""` (all exchanges). ACV, VEA, VNH now visible on SSC.

**PRE-EXISTING B (UNFIXED): SSC c111 empty for UPCOM/state-entity filers**

ACV Q1/2026 on SSC at idx=15 (filed 06/05/2026) but c111 is empty. Matching logic skips it. Period info in c3: "Báo cáo tài chính quý 1/ 2026". Fix: fallback to c3 when c111 empty. Owner: dev-vps-crawls.

**Queue status:** 9 items remain (ACV, BDI, DAG, DLC, JSH, SIS, VDC, VNH, VEA). ACV recoverable with c3 fix + HNX session fix. Others need HNX session fix; most appear to have not filed Q1/2026 on SSC yet.

Signal: `docs/signals/dev-vps-crawls-2026-06-15T17-11-01Z.json`
Recon: `docs/vps-sources/ssc-bctc-afrloop-incident/recon.md`

---

## c011 · 2026-06-15T05:50Z · VPS-AVAIL-02-FIX — Proxy :3128 Outage Root Cause + Restore

Trigger: INCIDENT — macro-indicators container logs show every NSO/SBV fetch failing with `proxyconnect tcp: dial tcp 125.212.251.27:3128: connect: connection refused`. Tools dark: get_vn_trade_balance, get_vn_bop, get_vn_macro_indicators, get_cpi_components.

**ROOT CAUSE: Port :3128 never existed on the VPS.**

The Go adapter `vpsFetch.go` in `apps/macro-indicators/pkg/infrastructure/` hardcodes `vpsHTTPPortDefault = "3128"` as an HTTP CONNECT proxy (Squid-style). But **no Squid or general forward proxy was ever installed on the VPS**. The only proxy service was `vn-vps-proxy.service` (Node.js on :8765) — a purpose-built reverse proxy for specific endpoints only (iboard, SSC, BCTC, AGM, etc.), not a general CONNECT proxy. Port :3128 was never bound. Connection refused was permanent, not a crash.

**SECONDARY ISSUE: vn-vps-proxy OOM crash loop.**
`MemoryMax=64M` cgroup limit is too tight when python3 child processes (`discover-bctc-urls-browser.py`) are spawned per-request. Service had OOM-killed and restarted 16 times by the time of diagnosis. Not related to :3128 but co-present.

**RESTORE ACTIONS:**
1. `apt-get install tinyproxy` on VPS — installed v1.11.1
2. Configured `/etc/tinyproxy/tinyproxy.conf`: Port=3128, Allow 127.0.0.1/::1/172.16.0.0/12/10.0.0.0/8/192.168.0.0/16/176.175.78.70 (main server IPv4)
3. Backup at `/etc/tinyproxy/tinyproxy.conf.bak-20260615`
4. `systemctl enable && restart tinyproxy` — active, listening on 0.0.0.0:3128
5. Raised vn-vps-proxy `MemoryMax` from 64M → 256M in `/etc/systemd/system/vn-vps-proxy.service`; backup at `.service.bak-20260615`; daemon-reload + restart

**PROXY VERIFICATION (RAW):**
- From VPS localhost: `curl -x http://127.0.0.1:3128 http://example.com` → http_code=200
- From main server (176.175.78.70): `curl -x http://125.212.251.27:3128 http://example.com` → http_code=200
- HTTPS CONNECT to nso.gov.vn: `CONNECT tunnel: HTTP/1.1 negotiated → 200 Connection established → TLS OK (GlobalSign RSA OV SSL CA 2018) → HTTP 301`
- HTTPS to sbv.gov.vn: http_code=302 (normal redirect)
- From inside macro-indicators Docker container via wget: `example.com` returns full HTML

**TLS FIX (NSO/GSO):**
NSO cert (`nso.gov.vn`) is issued by GlobalSign RSA OV SSL CA 2018, absent from Alpine default CA bundle. Fixed by:
- Written PEM to `apps/macro-indicators/certs/globalsign-rsa-ov-ssl-ca-2018.pem`
- Added to Dockerfile: `COPY certs/ ... + update-ca-certificates`
- Rebuilt + restarted `vn-market-intelligence-mcp-macro-indicators-1`

**POST-RESTORE TOOL STATUS:**
- `get_vn_macro_indicators` / `get_vn_trade_balance` / `get_cpi_components`: Proxy CONNECT works, TLS OK. Error changed from `connection refused` to `no bai-top link found in NSO index page (85867 bytes)` — NSO HTML structure changed since PROBE-3, scraper selector is stale. **Proxy is fixed; scraper needs update (separate task).**
- `get_vn_bop`: Proxy CONNECT works. Error: `context deadline exceeded` — Go vpsFetch sends OData filter URL with raw spaces (`filter=status eq 0 and ...`); tinyproxy/sbv.gov.vn rejects malformed URL. URL-encoding bug in BOP use case. **Separate scraper fix needed.**
- `get_vn_liquidity_state`: `status: ok` with live data — unaffected (direct SBV + DB, no VPS proxy).

**OPEN VPS BOARD TASKS (common root assessment):**
- `FIX-SBV-FX-VPS-FETCHER-UNHEALTHY`: vn-sbv-fetch.service active + running — NOT caused by :3128. Separate health poller issue.
- `FIX-NEWS-VPS-CRASH-LOOP`: vn-news-fetch.service active + running — NOT caused by :3128. Prior c009 fix (cursor cap) still holds.
- `OPS-POLLNEWS-NIGHT-ZERO`: NOT caused by :3128. Separate issue.
- `VPS-AVAIL-02-FIX`: RESOLVED by this cycle — tinyproxy on :3128 is the fix. :8765 OOM also fixed (MemoryMax 256M).

**NOT the common root** of the 4 board tasks — vn-sbv-fetch/news-fetch/pollnews are separate issues. :3128 only affected the macro-indicators Go layer (vpsFetch.go).

Remaining blockers (NOT proxy, need dev agent):
1. NSO HTML scraper: `bai-top` link selector stale — HTML layout changed
2. BOP OData filter: URL with spaces not encoded before passing to vpsFetch

---

## c013 · 2026-06-15 · F-BOP-QUERY-RECON STEP1 — SBV BOP OData query semantics

Trigger: `get_vn_bop` returns 0 items even though SBV responds (F-BOP-ENCODING fixed URL-encoding). Root cause investigation: OData query SEMANTICS match 0 live articles.

**ROOT CAUSE: TWO independent bugs**

**Bug 1 (structural — blocks ALL parsing): Wrong JSON root key**
`sbvArticleResponse` uses `json:"items"` but SBV Liferay returns `"articles"` as the root array key. `"items"` key is absent. Go's `json.Unmarshal` silently skips it → `Items` nil → `len(apiResp.Items) == 0` → `bop_parser: SBV API returned 0 items`. This breaks ALL filter paths including the broad `Date48362898 gt ''` filter (which does return totalCount=15 from the API, but Go parses 0 because the key is wrong).

Evidence from VPS probe:
```
items key present? False
articles key present? True
ALL keys: ['articles', 'lastPage', 'page', 'pageSize', 'totalCount', 'xClassName']
```

**Bug 2 (semantic — blocks date-range path): Date48362898 is a mid-quarter reference date, not quarter-end**
Current quarter window (Q2 2026): 2026-04-01..2026-06-30 → 0 results
Prev quarter window (Q1 2026): 2026-01-01..2026-03-31 → 0 results
Q4 2025 data has `Date48362898=2025-12-25` which is inside Q4 2025 (Oct-Dec) but OUTSIDE Q1 2026 and Q2 2026 windows.

All 4 quarters in live DB: quyI→2025-03-26 / quyII→2025-05-05 / quyIII→2025-08-12 / quyIV→2025-12-25

**Working recipe:**
```
GET https://www.sbv.gov.vn/o/article/v1.0/articles
  ?scopeKey=20117&contentStructureId=10063168&pageSize=100
  &filter=status%20eq%200%20and%20Date48362898%20gt%20%27%27
  &sort=datePublished%3Adesc
Parse: response.articles[0] (deduplicate by articleId first — 15 rows, 4 unique IDs due to Liferay locales)
```

**Generic contract: no date-range filter. The broad `status eq 0 and Date48362898 gt ''` + `sort=datePublished:desc` + `articles[0]` is quarter-agnostic and will always return the latest published quarter.**

Recon: `docs/vps-sources/vmt-sbv-bop-probe/recon.md`
Script: `scripts/probes/vmt-bop-step1-recon.sh`

---

## c012 · 2026-06-15T01:38Z · F-NSO-SELECTOR — NSO bai-top Selector Stale Recon

Trigger: Task F-NSO-SELECTOR from orch-state board (READY, owner dev-macro-indicators). Tools `get_vn_macro_indicators` / `get_vn_trade_balance` / `get_cpi_components` returning `is_estimate=true` / `blocked_reason="NSO bai-top selector stale"`. Transport confirmed healthy (VPS proxy up; ~85867B page returned by router).

**ROOT CAUSE: Absolute vs relative URL in bai-top links.**

The old Go regex `href="(/bai-top/\d{4}/\d{2}/[^"]+)"` captures a relative path capture group. The live NSO site (WordPress) now emits fully absolute URLs: `href="https://www.nso.gov.vn/bai-top/2026/06/..."`. The regex matches 0 times → `extractLatestPressURL` errors → 3-step chain aborts → degraded-200.

**SECONDARY ISSUE: VPS CA bundle missing GlobalSign intermediate.**

`/tmp/combined_ca.pem` does not contain the GlobalSign RSA OV SSL CA 2018 intermediate. NSO server sends leaf cert only (no chain). curl exits 60. Fixed by downloading the intermediate from the AIA URL in the cert and building `/tmp/nso_ca_bundle.pem`.

**LIVE PROBE RESULTS (2026-06-15T01:36:28Z via VPS SSH):**
- Step 1 (index): `https://www.nso.gov.vn/bao-cao-tinh-hinh-kinh-te-xa-hoi-hang-thang/` → HTTP 200, 85868B
- Step 2 (press release): `https://www.nso.gov.vn/bai-top/2026/06/bao-cao-tinh-hinh-kinh-te-xa-hoi-thang-nam-va-5-thang-dau-nam-2025-2/` → HTTP 200, 114711B
- Step 3 (xlsx HEAD): `https://www.nso.gov.vn/wp-content/uploads/2026/06/02.-Bieu-T5.2026-final.xlsx` → HTTP 200, content-type application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

**FIX for dev-macro-indicators:**
```go
// Replace reBaiTop in cache_vmt_nso.go:
var reBaiTop = regexp.MustCompile(
    `href="(https://www\.nso\.gov\.vn/bai-top/(\d{4})/(\d{2})/[^"]+)"`)
// extractLatestPressURL: pressURL = m[1], period = m[2]+"-"+m[3]
// Remove secondary rePeriod regex (period now from capture groups directly).
```

CA bundle recipe: `curl http://secure.globalsign.com/cacert/gsrsaovsslca2018.crt → DER→PEM → cat ca-certificates.crt + intermediate > /tmp/nso_ca_bundle.pem`. `VPS_CACERT_PATH_NSO` must point to this file (persists only until VPS restart — add bootstrap script or Dockerfile RUN).

Anti-bot: NONE. No CF, no captcha, no JS challenge. Apache + WordPress.

Signal: `docs/signals/dev-vps-crawls-2026-06-15T01-38-50Z.json` → dev-macro-indicators queued.
Recon: `docs/vps-sources/nso-monthly-excel/recon.md`

---

## c010 · 2026-06-14 · VN-MACRO-TOOLING WAVE-1 — PROBE-1..4 (Archived)
Four recon probes: Customs FDI (blocked JS render), SBV BOP (pass, Liferay API), NSO monthly Excel (pass, TLS fixed), SBV OMO+Interbank (partial, Oracle WebCenter hangs). Reference: `git show 3e5f8daf:docs/agent-memory/notebooks/ops-vps-fetch.md` for detailed PROBE logs. Scripts: scripts/probes/vmt-probe-{1,2,3,4}.sh

---

## Older Cycles (c004-c009) — Archived

| Session | Date | Outcome |
|---------|------|---------|
| c004 FIX-CTG-2b-DEPLOY | 2026-06-04 | Rank>=2 guard deployed; backup .bak-20260604 |
| c005 RECON-AGM-1 | 2026-06-04 | vietstock.vn fetchable (POST+CSRF) |
| c006 UNBLOCK-VPS-FETCH-RESUME | 2026-06-06 | SSC bctc-fetch Chromium thread issue identified |
| c007 SPIKE-VPS-SSC-CURL-RECIPE | 2026-06-06 | VIABLE-CURL recipe proven; 3-step Oracle ADF JSF workaround (no Chromium); 2 PDFs downloaded |
| c008 FIX-NEWS-VPS-PROBE | 2026-06-07 | HEALTHY; no restart required; Saturday low-activity RSS, no Chromium issue |
| c009 FIX-NEWS-VPS-CRASH-LOOP | 2026-06-09 | Bug A (dev-zone): vpsHealthPoller.ts timestamp MAX() lexicographic error; Bug B (VPS): cursor jump fixed (NOW+1800s cap). Dev-zone fix queued. |

Full detail: `git log --oneline -15 -- docs/agent-memory/notebooks/ops-vps-fetch.md` | Recon docs: `docs/vps-sources/*/recon.md`
