# ops-vps-fetch — Notebook

**Last updated:** 2026-06-09 03:30 UTC | **Sprint:** FIX-NEWS-VPS-CRASH-LOOP

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
| ssc-bctc-newsearch | 2026-06-06 16:45 | VIABLE-CURL — full recipe proven | none |

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

## c010 · 2026-06-14 · VN-MACRO-TOOLING WAVE-1 — PROBE-1..4

Trigger: ops-vps-fetch dispatch for VN-MACRO-TOOLING WAVE-1 sprint. Four recon probes executed in single SSH session.

**PROBE-1 (Customs FDI/domestic bloc) → BLOCKED_JS_RENDER**
customs.gov.vn is a JSP SPA. Shell page (~12KB, `<div id="main"></div>`). All content loaded via internal bridge proxy API calling `tongcuc.customs.gov.vn` which is DNS NXDOMAIN externally. Bridge API returns `{"errorMessage":"Du lieu truy cap khong hop le!"}` (HTTP 400) with no `main_new` variable. No FDI enterprise-type breakdown found machine-readable.
Fallback approved: NSO FDI Excel sheet (`12.FDI`) for bloc_split field.
Recon: docs/vps-sources/vmt-customs-probe/recon.md

**PROBE-2 (SBV BOP) → PASS**
Liferay DXP headless article API discovered by reading page JS. Endpoint: `GET /o/article/v1.0/articles?scopeKey=20117&contentStructureId=10063168&pageSize=100&filter=<OData>`. All 10+ BOP components in JSON (`canCanVangLai`, `loiVaSaiSot`, etc.). E&O sign convention confirmed IMF BPM6 from live Q4 2025 data (`loiVaSaiSot = "-12.375"` = -12,375 M USD negative = unexplained outflows). Vietnamese number format: period=thousands, comma=decimal.
Recon: docs/vps-sources/vmt-sbv-bop-probe/recon.md

**PROBE-3 (NSO/GSO monthly Excel) → PASS**
TLS SAN mismatch resolved: `www.gso.gov.vn` cert issued for `nso.gov.vn`. Fix = GlobalSign RSA OV SSL CA 2018 intermediate from AIA URL, combined with system CA bundle. Use `nso.gov.vn` domain (IP 160.25.148.3). WordPress CMS. Press release HTML has 0 HTML tables — all data in Excel downloads. Monthly Excel (`02.-Bieu-T{M}.{YYYY}-final.xlsx`) has 19 sheets. Key sheets: `2.IIPthang`, `12.FDI`, `13. Tongmuc`, `16.CPI`. CPI has 15-category Vietnamese basket. URL discovery: index page → bai-top/ link → press release → .xlsx download URL.
Recon: docs/vps-sources/vmt-nso-monthly-probe/recon.md

**PROBE-4 (SBV OMO + Interbank) → PARTIAL**
OMO PASS: `www.sbv.gov.vn` OMO page returns 408KB Liferay HTML with live auction table. June 12, 2026 auction: 35-day 217.45bn VND + 56-day 1,000bn VND, both @ 4.5%/year. Net outstanding NOT published — must compute from rolling add/absorb window.
Interbank BLOCKED: `dttktt.sbv.gov.vn` (202.58.245.101) 100% packet loss from VPS. Oracle WebCenter portal. Cannot probe 1W tenor.
IRS: permanently `is_estimate=true` per DD-6.
FX reference rates (www.sbv.gov.vn/tỷ-giá): PASS bonus — USD center rate 25,155 VND (Jun 12, 2026).
Recon: docs/vps-sources/vmt-sbv-interbank-omo-probe/recon.md

Scripts: scripts/probes/vmt-probe-{1,2,3,4}.sh | Samples: scripts/probes/vmt-{1,2,3,4}-sample.json

---

## c005 · 2026-06-04T08:10Z · RECON-AGM-1

Trigger: operator P0 spike — find fetchable source for AGM business plan figures.
**VERDICT: FETCHABLE** — vietstock.vn POST + CSRF warmup. No Cloudflare. VPS 200 OK ~0.25s.
Signal: docs/signals/dev-vps-crawls-2026-06-04T08-10-00Z.json
Recon: docs/vps-sources/vietstock-agm-plan/recon.md

---

## c004 · 2026-06-04 · FIX-CTG-2b-DEPLOY

Trigger: operator task — deploy FIX-CTG-2b (rank>=2-only guard) to VPS.
**DEPLOYED:** `/root/discover-bctc-urls-browser.py` overwritten with repo cc4ed657.
Backup created: `/root/discover-bctc-urls-browser.py.bak-20260604`
Integrity: sha256 match + `grep -c "SKIP all-generic rank"` = 1. Status: DONE-VERIFIED

---

## c006 · 2026-06-06T15:32Z · UNBLOCK-VPS-FETCH-RESUME

Trigger: INCIDENT — prices/bctc/foreign_flow stale 24h.

prices/foreign_flow: Weekend off-hours silence (dow=6). Services alive, sleeping by design.
bctc (vn-bctc-fetch): Playwright/Chromium pthread_create exhaustion kills SSC path on every
6h cycle since Jun 5. HNX/UPCOM curl paths healthy. All 10 Q1/2026 items SKIP (no new PDFs).
Evidence: `[0606/194928.256632:ERROR] pthread_create: Resource temporarily unavailable (11)`.
Post-restart: fresh cycle confirmed, service cycling correctly.

Follow-ups created: BCTC-PLAYWRIGHT-THREAD P2, SLA-WEEKEND-AWARE P3.

---

## c009 · 2026-06-09T03:30Z · FIX-NEWS-VPS-CRASH-LOOP

Trigger: CRITICAL recurring — vn-news-fetch UNHEALTHY 2nd time in 48h (~84min stale at ~02:30Z Jun 09).

**TWO BUGS FOUND. ONE FIXED ON VPS. ONE REQUIRES DEV-ZONE CHANGE.**

**Bug A (dev-zone, CRITICAL): Timestamp format mismatch in vpsHealthPoller.ts**
- `vps_push_log.pushed_at` stores `2026-06-09 01:44:42` (space-separated, no TZ suffix)
- `rag_analyses.created_at` stores `2026-06-09T01:28:43.297Z` (ISO 8601 with T+Z)
- SQLite MAX() compares strings lexicographically: `T` (ASCII 84) > ` ` (ASCII 32)
- Result: health query always picks `rag_analyses` timestamp as MAX, ignoring more-recent heartbeat pushes in `vps_push_log`
- Effect: false-UNHEALTHY fires every morning when VPS sends heartbeats (no new rag_analyses rows) after the last rag_analyses entry ages > 30min
- Evidence: at 02:05Z, `vps_service_health` showed last_successful_run=01:28:43 (rag_analyses) despite push_log entries at 01:44:42 and 02:00:49
- Fix: change SQL MAX(latest_at) to MAX(unixepoch(latest_at)) + datetime(...,'unixepoch') for correct epoch comparison
- File: `apps/mcp-server/src/domain/services/vpsHealthPoller.ts` latestTimestampSql for vn-news-fetch (~lines 127-136)

**Bug B (VPS, MODERATE): Cursor jump from future-dated pubDate — FIXED**
- Some RSS sources (vietstock-macro, vneconomy) set pubDate in local VN time (+07:00) WITHOUT the TZ offset — parsers read them as UTC, jumping cursor 7h ahead
- Effect: 3-10h news blackout, 1-3x per day, 23 confirmed jumps Jun 01-09
- Fix applied on VPS at 03:30Z: cursor cap at NOW+1800s in `/root/fetch-vn-news.sh` (lines 372-381)
- Backup: `/root/fetch-vn-news.sh.bak-20260609`
- Local repo fix: `vps-scripts/fetch-vn-news.sh` same edit
- Syntax OK, service still active

**VPS service status:** active (running) since Jun 02 01:23:38 +07 (1 week, NO crash)
The "~1h21m uptime" in the task brief = `uptimeSeconds` field (staleness in seconds) NOT systemd uptime.
systemctl confirm: `ActiveEnterTimestamp=Tue 2026-06-02 01:23:38 +07` (7 days continuous)

Recon doc: docs/vps-sources/vn-news-rss/recon.md (updated with Bug A + Bug B analysis)

Next: router must dispatch dev-zone fix for Bug A → dev agent to fix vpsHealthPoller.ts SQL query.

---

## c008 · 2026-06-07T07:35Z · FIX-NEWS-VPS-PROBE

Trigger: FIX-NEWS-VPS-PROBE — service flagged unhealthy (uptime 1h44m at audit), news-vps stale 112min.

**VERDICT: HEALTHY — NO FAULT, NO RESTART REQUIRED**

Service status BEFORE: active (running) since Jun 02 01:23:38+07 — 5 days continuous, no OOM since Apr 29.
Service status AFTER: unchanged (no restart performed — not needed).

Root cause: NONE (infra). Stale-112min was Saturday RSS low-activity window.
- Last real push before audit: 2026-06-07T03:36Z (1 item, http=200 resp={ok:true,received:1})
- Cycles 03:36Z→07:04Z: 7 consecutive heartbeat-only cycles (0 new items, all 243 already seen)
- Resumed at 07:20Z: PUSH 1 item, cursor advanced from 1780827660 to 1780840920 (2026-06-07T14:02:00Z)

Chromium implicated: NO. fetch-vn-news.sh is pure bash + curl + python3 (date parsing only).
No pthread_create EAGAIN anywhere in logs. No Playwright dependency.

Push leg verification: /api/push-news http=200 resp={"ok":true,"received":1} at 07:20:34Z.

Report #3065: Resolution=monitoring — main terminal must execute:
  call_tool(server="vn-market", tool="process_telegram_report",
    arguments={id:3065, action:"resolve", resolution:"monitoring",
    note:"ops-vps-fetch probe 2026-06-07: healthy+running 5d, no Chromium, stale=weekend RSS cadence, push resumed 07:20Z ok:true"})

Follow-up flags: NONE (no Chromium implicated, no rewrite signal needed).

---

## c007 · 2026-06-06T16:45Z · SPIKE-VPS-SSC-CURL-RECIPE

Trigger: SPIKE-VPS-SSC-CURL-RECIPE (PO-approved, timebox 120min).
Goal: capture SSC BCTC-discovery endpoint recipe to replace Playwright/Chromium.

**VERDICT: VIABLE-CURL** — full recipe proven from VPS. No Chromium needed.

**SSC portal: congbothongtin.ssc.gov.vn (Oracle ADF JSF application)**
Anti-bot: NONE. No Cloudflare, no WAF. Only Oracle DMS headers and JSESSIONID session.

**3-step recipe:**
1. GET /faces/NewsSearch → 6.8 KB ADF loopback JS. Extract JSESSIONID (cookie), _afrLoop
   (16-digit literal in JS), Adf-Window-Id (w{alphanum} literal in JS). No JS engine needed.
2. GET /faces/NewsSearch;jsessionid={ID}?_afrLoop={N}&_afrWindowMode=2&Adf-Window-Id={WIN}
   → 84 KB rendered ADF page. Extract ViewState (e.g. !-jb8r9nbl3) and form id (f1).
3. POST /faces/NewsSearch (PPR, Faces-Request: partial/ajax) with pt9:it8112={TICKER},
   pt9:soc3={0=HNX|1=HOSE|2=UPCOM}, ViewState. Returns XML CDATA with result table rows.
   Row DOM index = server index + 15 (page offset). Parse c111 (filename hint), c7 (date).
4. POST /faces/NewsSearch (FULL FORM, NO Faces-Request header) with cil4z row source.
   Returns application/octet-stream with Content-Disposition filename. Body = raw PDF bytes.

**Key insight:** cil4z uses AdfDhtmlPage.__setNonHtmlResponse → forceFullSubmit(). With
Faces-Request: partial/ajax header the body is 0 bytes (5-byte chunked empty). Without it,
the full PDF is returned inline (application/octet-stream).

**Proven downloads:**
- GAS Q1/2026 consolidated (DOM row 16): 15,410,637 bytes, %PDF-1.7 valid (24/04/2026)
- HPG annual 2025 (DOM row 15): 6,151,513 bytes, %PDF-1.7 valid (27/03/2026)

Recon doc: docs/vps-sources/ssc-bctc-newsearch/recon.md
Signal: docs/signals/dev-vps-crawls-2026-06-06T16-45-00Z.json → dev-vps-crawls queued
