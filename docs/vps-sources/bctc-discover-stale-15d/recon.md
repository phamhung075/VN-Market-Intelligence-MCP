# Recon — bctc-discover-stale-15d

**Date:** 2026-07-01 23:16 UTC
**Agent:** ops-vps-fetch
**Source URL:** https://congbothongtin.ssc.gov.vn/faces/NewsSearch (SSC-CURL discovery, primary path for HOSE tickers)
**Task:** B-05-FIX — bctc-discover stale 21711min (~15d), 38-item discover backlog not draining
**Trigger:** data_stale (system-auditor, origin sau-2026-07-01T22:33:43Z)

---

## Executive Summary

**VERDICT: CORROBORATED-BROKEN.** Root cause = **external source outage** — the SSC
disclosure portal (`congbothongtin.ssc.gov.vn`) is returning a persistent, domain-wide
HTTP 503 "No server is available to handle this request" right now, on every path
tested (root `/`, `/faces/NewsSearch`, even the long-deprecated `/faces/SanGiaoDiv.xhtml`).
Confirmed non-transient across 2 separate SSH sessions and 6+ probes spanning
2026-07-01T23:07Z–23:16Z (9+ minutes, all 503, sub-200ms response time — real HTTP
response, not a hang/timeout).

This is **NOT** a VPS-side fault. All 3 relevant systemd services are healthy:
`vn-bctc-fetch.service` (active, 6h loop, zero errors), `vn-bctc-enrich.timer/.service`
(active, 6h cadence, zero errors), `vn-vps-proxy.service` (active 2+ weeks, zero
crashes). HNX/UPCOM discovery paths on the **same VPS, same script run** ARE currently
functional (return correct "no results" responses, not errors) — this rules out a
VPS network/geo-block/anti-bot problem; the fault is isolated to the SSC domain only.

**Why this matters right now:** 30 of 33 active watchlist tickers are HOSE-listed
(system-map.json). Direct HSX.vn scraping was ruled permanently out-of-scope in the
2026-05-13 recon (`docs/vps-sources/hsx-bctc/recon.md` — SPA shell requires browser
session). That means **SSC-CURL is the ONLY discovery path for ~91% of the watchlist**,
and it is down right at the opening of the Q2/2026 earnings SLA window
(`system-map.json .project.data_sources[] id=bctc-discover .sla.earnings_window`:
`trigger_months=[1,4,7,10]`, `window_days_after_quarter_end=14` → July 1–15 tightened
to 24h stale threshold). Push-age is 21711min (≈361.8h) — 15× the in-window threshold.

**Reconciling the "38-item backlog" figure:** The auditor's own documented gate
(`docs/agents/system-auditor/flow/main.md` § BCTC Healthy-Idle Gate) counts
`bctc_vps_queue WHERE status IN ('pending','url_not_found','enrich_failed')` — this is
a **different, raw DB count** than the public `/api/bctc-fetch-queue` HTTP endpoint
that `fetch-bctc.sh` polls every 6h (which returned `{"queue":[],"total":0}` live,
just now). The VPS's own 6h fetch loop is NOT what drains the 38-row backlog — that
depends on mcp-server's own `bctcQueueEnricherJob` (main-server-side, per
`vps-proxy-server.js` comment: "Strategy 0 for bctcQueueEnricherJob"), which calls OUT
to the VPS's `/proxy/bctc-discover/:ticker` HTTP route on demand. That job's own
schedule/health lives in the mcp-server Docker container — outside SSH-to-VPS scope;
hand to **dev-mcp-server** to confirm it is actually firing and hitting the VPS route.
The auditor's CRITICAL classification is **well-calibrated, not a false positive**:
`BCTC_ACTIVE=38>0` correctly routes to the normal (tightened, in-window) SLA compare.

**No VPS service restart performed** — nothing on the VPS is down/misconfigured to
restart. All 3 services were already active/healthy before I probed. Restarting them
would not restore SSC; the outage is 100% external (Vietnamese government portal
backend), matching the class of the prior HNX TLS outage and the 2026-06-16 SSC
"12:00Z daily transient 503" precedent — except this one has NOT self-recovered within
the probe window and is NOT confined to the previously-documented ~12:00Z UTC slot
(today's probes ran ~23:07–23:16Z).

---

## VPS Service State (all healthy)

```
vn-bctc-fetch.service   — active (running) since 2026-06-26 11:32:00 +07 (5d), 0 crashes
                          Log tail: every 6h cycle since Jun 19 shows "Queue: 0 items
                          pending -- Nothing to fetch -- exit" (34 consecutive clean exits)
vn-bctc-enrich.timer    — active (waiting) since 2026-06-11, next fire 2026-07-02 06:24 +07
vn-bctc-enrich.service  — oneshot, last runs all "Queue: 0 items pending (skip_enrichment=true)
                          -- Nothing to enrich -- exit" (harmless `[: unary operator expected`
                          shell warning on stat, pre-existing, does not affect logic)
vn-vps-proxy.service    — active (running) since 2026-06-15 05:39:18 +07 (2w3d), 51.8M mem,
                          zero restarts
Live queue API (/api/bctc-fetch-queue): {"queue":[],"total":0} — confirmed 0 pending
  as of 2026-07-01T23:xx UTC
```

---

## HTTP Probe Results — SSC congbothongtin.ssc.gov.vn (BROKEN)

```
$ curl -s -D - -o /dev/null -k -L --connect-timeout 15 --max-time 30 \
    'https://congbothongtin.ssc.gov.vn/faces/NewsSearch'
HTTP/1.1 503 Service Unavailable
content-length: 107
cache-control: no-cache
content-type: text/html

<html><body><h1>503 Service Unavailable</h1>
No server is available to handle this request.
</body></html>
```

- **Status:** 503, consistent across 6+ attempts (root `/`, `/faces/NewsSearch`,
  `/faces/SanGiaoDiv.xhtml`) over 2 SSH sessions, 2026-07-01T23:07Z–23:16Z.
- **Response time:** 0.10–0.18s — real HTTP response, not a TLS/connect hang.
- **DNS:** resolves fine — `congbothongtin.ssc.gov.vn` → `103.3.252.107` (unchanged
  from the 2026-06-06 recon).
- **TLS:** handshake completes (curl `-k` used defensively, same as prior recipes;
  cert itself was previously verified valid GlobalSign RSA OV, expires Nov 2026).
- **No Cloudflare / anti-bot signature:** no `cf-ray`, no `__cf_bm`, no CAPTCHA, no JS
  challenge body. Message text ("No server is available to handle this request") is a
  generic reverse-proxy/load-balancer message (all-backends-down), not a WAF block page.

### HNX/UPCOM probes (WORKING — for comparison, same VPS, same run)

```
$ python3 /root/discover-bctc-urls-browser.py VEA 2026 Q1
Discovering VEA 2026 Q1...
  [HNX] session warmup GET OK (referrer=https://hnx.vn/vi-vn/thong-tin-cong-bo-ny-tcph.html)
  [HNX] code=VEA window=01/04/2026-30/06/2026
  [HNX] page 1 (filtered) -- no results at page 1
  [UPCOM] session warmup GET OK (referrer=https://hnx.vn/vi-vn/thong-tin-cong-bo-up-hnx.html)
  [UPCOM] code=VEA window=01/04/2026-30/06/2026
  [UPCOM] page 1/2 (filtered) -- no results at page 2
  [SSC-CURL] start code=VEA 2026 Q1
  [SSC-CURL] step1 GET error: HTTP Error 503: Service Unavailable
{"results": [], "error": "No PDF found for VEA 2026 Q1. HNX/UPCOM POST API returned no
  match. SSC NewsSearch Playwright: either not found or download failed. Check VPS logs
  for details."}
real  0m8.861s
```

Same for GAS (real 0m5.701s). HNX and UPCOM session-warmup GETs and POST searches
**succeed** with HTTP 200 and correct empty-result parsing — only the SSC-CURL fallback
step fails, and it fails identically for both an UPCOM ticker (VEA) and a HOSE ticker
(GAS), confirming the fault is the SSC endpoint itself, not ticker-specific logic.

---

## Anti-Bot Assessment

- **Type:** none / external-outage (not anti-bot). No CF headers, no captcha, no JS
  challenge, no rate-limit signature (429). Instant 503 on every path including ones
  that would normally 404 (`SanGiaoDiv.xhtml`) — this is a backend-down condition at
  the LB/reverse-proxy tier in front of the Oracle ADF app server, not a targeted block.
- **Recommendation:** no bypass technique applies — this requires the SSC portal itself
  to come back up. Monitor + retry, do not attempt anti-bot workarounds.

---

## Page Structure / Working Recipe (reference — unchanged from 2026-06-16 fix, portal down means recipe currently unusable)

See `docs/vps-sources/bctc-pipeline-stale-5d/recon.md` and
`docs/vps-sources/ssc-bctc-newsearch/recon.md` for the full 4-step SSC-CURL recipe
(loopback → ADF page → PPR search → full-form download) and the HNX session-cookie
recipe. Both recipes are structurally unchanged; SSC step 1 is the one currently
failing (503 before any session/ADF logic is reached).

---

## Sample Response Excerpt

```
HTTP/1.1 503 Service Unavailable
content-length: 107
cache-control: no-cache
content-type: text/html

<html><body><h1>503 Service Unavailable</h1>
No server is available to handle this request.
</body></html>
```

---

## Notes

1. **Prior precedent:** `docs/vps-sources/bctc-pipeline-stale-5d/recon.md`
   (2026-06-16) already documented an SSC 503 at ~12:00Z UTC daily (suspected scheduled
   maintenance, self-recovered within ~36 min) and flagged an **unfixed residual risk**:
   "Current script has NO retry on 503 — returns None → SKIP. Fix: add 1-retry with 60s
   backoff in `_ssc_curl_search()`." That fix was never shipped. Today's outage is at a
   different time-of-day (~23:xx UTC, not ~12:00Z) and has not self-recovered within the
   9+ minute probe window — worth monitoring for duration; if it persists >24h this is a
   longer/different outage than the documented daily blip, not merely the same transient.

2. **Backlog composition unknown from VPS side.** I cannot enumerate the 38
   `bctc_vps_queue` rows (no DB access from VPS/SSH — that table lives in mcp-server's
   SQLite, main server side). Per the 2026-06-25 notebook entry (c019), the last known
   composition of this backlog was HNX/UPCOM tickers (BDI, DAG, DLC, JSH, SIS, VDC, VNH,
   VEA + sub-variants) confirmed genuine non-filers via HNX/UPCOM APIs (which are NOT
   affected by today's SSC outage). If the true current 38-row set is unchanged, the SSC
   outage does not explain non-draining for those specific rows — but it WILL block
   discovery of any NEW HOSE-ticker Q2/2026 filing the moment one is queued, since HOSE
   has no other viable path. dev-mcp-server should re-pull the live `bctc_vps_queue`
   composition (status + ticker + exchange) to confirm whether it is the same historical
   set or has grown with HOSE tickers.

3. **No code change made.** Per ops-vps-fetch boundary (recon only, no scraper/production
   code), and because nothing on the VPS itself is broken (all 3 systemd units healthy),
   no restart or config change was performed.
