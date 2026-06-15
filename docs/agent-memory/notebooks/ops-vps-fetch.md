# ops-vps-fetch — Notebook

**Last updated:** 2026-06-15 05:50 UTC | **Sprint:** VPS-AVAIL-02-FIX (proxy :3128 outage)

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
