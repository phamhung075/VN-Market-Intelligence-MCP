# ops-vps-fetch — Notebook

**Last updated:** 2026-06-06 16:45 UTC | **Sprint:** SPIKE-VPS-SSC-CURL-RECIPE

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
| vn-news-rss | 2026-05-13 | healthy (upstream) / MCP push 404 | none |
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
