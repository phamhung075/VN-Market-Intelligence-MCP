# ops-vps-fetch — Notebook

**Last updated:** 2026-06-16 19:00 UTC | **Sprint:** FIX-FOREIGN-FLOW-INTEGRITY-BREAK + FIX-MARKET-BREADTH-MISSING + FIX-MARKET-LIQUIDITY-MISSING-TOOL (triple recon)

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
| ssc-bctc-newsearch | 2026-06-16 12:40 | FUNCTIONAL — afrLoop+HNX session fixed; remaining queue = genuine non-filers. Transient 503 at ~12:00Z UTC daily. | none |
| hnx-bctc-post-api | 2026-06-16 12:40 | FIXED — session warmup GET deployed; both NY+UPCOM warmup OK in live probes | ASP.NET session |

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

## c015 · 2026-06-16T05:10Z · AUDIT-FC-FOREIGN-FLOW — Page-Cap Audit (RECON ONLY)

Trigger: User directive — verify whether foreign_flow source fetch is complete or page-capped. DB shows 102 of 1569 daily_ohlcv rows have foreign_net_vol nonnull.

**VERDICT: real-count-no-truncation.** No page cap at source or fetcher.

**Source:** `https://bgapidatafeed.vps.com.vn/getliststockdata/<CODES>`  
No pagination. Single GET with comma-joined codes. Returns all matching tickers in one JSON array.

**Fetcher:** `vps-scripts/fetch-foreign-flow.sh` (VPS push model, 60s interval market hours).  
VPS fetches 111 codes from live watchlist → API returns 105 → jq filter (buy OR sell OR room > 0) → 102 items → POST /api/push-foreign-flow → upserted 102.

**Root of 102:** 6 codes not recognized by bgapidatafeed (BDI, DLC, JSH, PME, SIS, VDC — confirmed empty response individually), 3 more have zero buy+sell+room. 102 is structurally stable per VPS log (same every cycle).

**Root of 102/1569 gap:** daily_ohlcv accumulates ALL ~1569 traded tickers from OHLCV price data. Foreign flow only covers the 111-code watchlist+ref subset. Non-watchlist tickers (1457 codes) have foreign_net_vol=NULL permanently.

**Field completeness:** fBVol, fSVolume, fRoom all present. fBValue + fSValue available but NOT extracted. holding_ratio not in source.

**Dead code found:** `foreignFlowFetcher.ts` GETs `http://${VINAHOST_IP}/foreign-flow` — this endpoint does NOT exist on vps-proxy-server.js. 404 every minute market hours. Silent fallback. Needs removal.

**Fix-1 (structural):** Expand CODES to full daily_ohlcv code universe — bgapidatafeed supports arbitrary code lists.  
**Fix-2 (dead code):** Remove `fetchPrimaryVpsEndpoint` — push model is the only live path.

Recon: `docs/handoffs/AUDIT-FC-FOREIGN-FLOW-recon.md`

---

## c017 · 2026-06-16T19:00Z · TRIPLE RECON — FIX-FOREIGN-FLOW-INTEGRITY-BREAK + FIX-MARKET-BREADTH-MISSING + FIX-MARKET-LIQUIDITY-MISSING-TOOL

Trigger: Three orch-state READY tasks (same VnDirect/bgapidatafeed upstream family). Probed in one session via SSH root@125.212.251.27.

**TASK 1 — FIX-FOREIGN-FLOW-INTEGRITY-BREAK (P0)**

Root cause confirmed via live DB + code trace. TWO WRITERS into `vnstock_trading_stats` with incompatible semantics:
- Writer A (VPS bgapidatafeed push): writes daily-delta `foreign_volume` (buy−sell net) and `foreign_room` (remaining buy room in shares ~210M for HPG). Does NOT write `current_holding_ratio`.
- Writer B (vnstock Python VCI via `syncVnstockData` → `storeTradingStats`): uses `INSERT OR REPLACE` (full-row overwrite) writing `foreignVolume = foreigner_pct × total_shares` (CUMULATIVE ~1.81B for HPG) and `foreignRoom = free_float` (CUMULATIVE ~4.64B). Also writes `current_holding_ratio = 0.2146` (21.46% foreigner_percentage from VCI).
- Regime break ~06-13: Writer B first fired on that date and overwrote Writer A's daily-delta rows. `storeTradingStats` wins as last-writer due to INSERT OR REPLACE timing.
- Daily_ohlcv (Writer A only) shows correct values: HPG buy=635560 sell=120570 net=514990 for 06-16. The column mislabeled "Net Vol (daily)" in vnstock_trading_stats is actually cumulative holding.
- bgapidatafeed probe: fBVol=635560, fSVolume=120570, fRoom=210082728.80 (confirmed current; NOT 4643M). holding_ratio absent from bgapidatafeed payload.
- fBValue + fSValue confirmed present in bgapidatafeed but not currently extracted.

Fix owner: dev-mcp-server — `storeTradingStats()` must use ON CONFLICT DO UPDATE SET excluding foreign_volume and foreign_room from Writer B's update clause.

Recon: `docs/handoffs/FIX-FOREIGN-FLOW-INTEGRITY-BREAK-recon.md`

**TASK 2 — FIX-MARKET-BREADTH-MISSING (HIGH)**

FOUND: `https://api-finfo.vndirect.com.vn/v4/vnmarket_prices?sort=date&q=code:VNINDEX&size=1&page=1` (same endpoint as `fetchVnIndex()` in hose.ts) already carries `advances`, `declines`, `noChange`, `noTrade`, `ceilingStocks`, `floorStocks`. Live probe: advances=179, declines=109, noChange=74, noTrade=31 (2026-06-16 15:06 VN time). Zero extra network cost — extend existing fetchVnIndex() parse to include breadth fields.

Recon: `docs/handoffs/FIX-MARKET-BREADTH-MISSING-recon.md`

**TASK 3 — FIX-MARKET-LIQUIDITY-MISSING-TOOL (P1)**

FOUND: Same vnmarket_prices endpoint also carries `accumulatedVal` (total turnover, VND), `nmValue` (ordermatch), `ptValue` (put-through). Live: accumulatedVal=16,650,836,352,800 VND (~16,651 tỷ đồng mid-session 06-16). Query size=2 for prior-session delta. Both breadth and turnover are co-implementable in one fetchVnIndex() extension pass.

Recon: `docs/handoffs/FIX-MARKET-LIQUIDITY-MISSING-TOOL-recon.md`

Signal: `docs/signals/dev-vps-crawls-2026-06-16T19-00-00Z.json`
Next: dev-mcp-server for all three (Tasks 2+3 co-implement; Task 1 separate writer-isolation fix).

---

## c016 · 2026-06-16T12:40Z · FIX-BCTC-VPS-PIPELINE-STALE-5D — Root Isolation Probe

Trigger: P0 root-isolation — BCTC VPS push dead claimed >72h. Last push HUT 2026-06-13T23:45Z. bctcQueueEnricher 0 URLs all cycles. 10 tickers in queue.

**VERDICT: PIPELINE IS FUNCTIONAL. No infrastructure failure. No geo-block. No format change.**

**Decisive evidence:**
- SSC: HTTP 200, afrLoop=27084xxx (fix regex working), step1/step2/step3 all OK in live probes
- HNX: session warmup GET OK on both NY and UPCOM referrers
- ACV: SSC finds Q1/2026 at c3-fallback idx=16 → 12.9MB PDF downloaded to /root/bctc-cache/ACV/ — will auto-push at next 18:00Z cycle
- BDI/DAG/DLC/JSH/SIS/VDC: SSC returns 51KB empty PPR (0 row indices) — NOT filed Q1/2026 on any monitored source
- VNH: 2 SSC rows — annual 2025 only; VEA: 15 rows — latest Q4/2025
- One transient SSC 503 hit the 12:00Z UTC cycle (all 10 tickers, ~6min window). SSC restored 200 by 12:36Z. Likely scheduled daily maintenance window.

**c014 fixes confirmed deployed and live:**
- afrLoop regex r"(\d{15,18})" working (afrLoop=27084xxx in probes)
- HNX session warmup logging "[HNX] session warmup GET OK" in 12:00Z cycle
- exchange_code="" (all exchanges) confirmed

**New risk identified:** SSC 503 at ~12:00Z UTC appears to be a regular maintenance window. Current script has NO retry → burns entire 6h cycle. Dev fix needed: 1-retry + 60s backoff.

**Queue health:** 1 of 10 items (ACV) is now resolvable. 7 items are genuine non-filers. 2 items (VEA Q1/Q4) not found on monitored sources.

Recon: `docs/vps-sources/bctc-pipeline-stale-5d/recon.md`
Signal: `docs/signals/dev-vps-crawls-2026-06-16T12-40-00Z.json`

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



## c018 · 2026-06-19T16:20Z · P0 INCIDENT FIX-VPS-BCTC-FETCH-RESTART — False Unhealthy: Queue Empty, Service Healthy

Trigger: Dev-team router dispatched P0 incident — 12 consecutive health-recheck reports claiming vn-bctc-fetch UNHEALTHY, zero pushes since 2026-06-16T18:02Z.

**VERDICT: SERVICE IS NOT CRASHED. Misdiagnosis by health monitors.**

**Evidence:**
- `systemctl status vn-bctc-fetch` → active (running) since Jun 11 00:22:03 +07 (8+ days continuous).
- `journalctl` shows only systemd-level start/stop events — script logs go to `/var/log/vn-bctc-fetch.log`.
- Script loops every 6h, currently in `sleep 21600` (PID 2994744).
- Log confirms the service ran every 6h and completed normally on Jun 18 and Jun 19.

**Root cause of zero pushes since 2026-06-16T18:02Z:**

The `bctc-fetch-queue?skip_enrichment=true` endpoint returned `{"queue":[],"total":0}` starting 2026-06-18T00:11Z. The queue was legitimately exhausted:
- Jun 16 18:02Z: last push — ACV Q1/2026 SUCCESS (HTTP 200).
- Jun 17: 9 items in queue (BDI, DAG, DLC, JSH, SIS, VDC, VNH, VEA Q1/2026, VEA Q4/2025) — ALL SKIPPED every cycle: genuine non-filers on HNX/UPCOM/SSC. All three sources return no matching rows for these tickers.
- Jun 18 00:11Z onward: queue dropped to 0. The MCP server side marked those 9 items as exhausted/expired (likely max-retry or TTL exceeded server-side).
- Jun 18–Jun 19: 7 consecutive fetch cycles → queue=0 each time → "Nothing to fetch -- exit". Not a crash — correct behavior.

**Why health monitors reported UNHEALTHY:**
The health-recheck reporter keys on "last successful push timestamp". Last push was ACV at Jun 16 18:02Z. With no new pushes (because queue=0), the freshness check flagged SLA breach after 360min. The monitor cannot distinguish "queue empty = nothing to do" from "crashed = can't push". This is a health-monitor false-alarm class.

**No restart performed:** Restarting would accomplish nothing — the service is already running. There is no crash to fix at the VPS level.

**No new push will occur until the MCP server's bctc-fetch-queue is repopulated** — i.e., when new BCTC filings for BDI/DAG/DLC/JSH/SIS/VDC/VNH/VEA become available on HNX or when new tickers are added to the watch queue.

**Follow-on issues (pre-existing, no new code bugs):**
1. Health monitor: cannot distinguish empty-queue vs crash — needs "queue_size=0 AND service_running = IDLE (not UNHEALTHY)" differentiation. Follow-on: FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH.
2. SSC 503 ~12:00Z UTC daily maintenance window: service skips all items for that cycle (no retry). Pre-existing risk noted in c016.
3. Queue server-side TTL/expiry for genuinely-not-filed tickers: those 9 tickers dropped off at Jun 18 — if they file Q1 later, they need to be re-enqueued manually or via upstream re-scan.

Disk: 6.0G/25G (26%) — healthy. No OOM. No disk full.

---

## Archive: c004–c012 (2026-06-04 through 2026-06-15)

Moved to archive: c004–c012 entries, F-NSO-SELECTOR, F-BOP-QUERY-RECON (moved from main).

Full git history: `git log --oneline -20 -- docs/agent-memory/notebooks/ops-vps-fetch.md`
Recon docs: `docs/vps-sources/*/recon.md`
