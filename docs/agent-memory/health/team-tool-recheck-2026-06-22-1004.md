# Team MCP Tool Health Recheck — 2026-06-22T10:04Z

**Cycle UTC:** 2026-06-22T10:04Z
**Agent:** health-recheck (auto-routine)
**Scope:** All cowork + dev agent tool dependencies
**Prior report:** docs/agent-memory/health/team-tool-recheck-2026-06-22-0807.md
**STEP 3c:** All prior active findings re-probed this cycle before carry-forward

---

## Executive Summary

3 BUGs + 6 ISSUEs confirmed active. One prior finding resolved (I7 CafeF transient), one reclassified (I3 foreign-flow = expected during closed market). One finding **escalated**: I5 macro-indicators partial → **B3 macro-indicators service unavailable** (full service failure). BCTC SLA breach has now reached 8002 min against a 360-min SLA (22+ days lag).

---

## ACTIVE Findings

| # | Tool / Component | Class | Evidence (this cycle) | Affected Callers | Suggested Fix |
|---|---|---|---|---|---|
| B1 | vn-bctc-fetch VPS / bctcPdfPullJob | **BUG** | SLA breach: 8002 min / 360 min limit. Last VPS push: 2026-06-16T18:02Z (6d stale). `get_vps_service_health` → service "unhealthy" (5d 15h 57m, 0ms latency). Q1/2026 PDFs not reaching DB. | refine_bctc_md, bctc-analyst, dev-pdf-extractor | Restart vn-bctc-fetch.service on VPS; confirm next cycle push arrives; check if afrLoop counter regressed (see recon.md c014 fix). Escalate to dev-vps-crawls. |
| B2 | Reuters RSS + Trading Economics | **BUG** | `get_system_status` → Reuters RSS: 100 consecutive failures (never succeeded this session, up from 80 in prior cycle). TradingEconomics: 100 failures, 0 successes. Both permanently failing since prior report. | news-scout (fetch_and_analyze), news pipeline, unified-agent | Route Reuters through main-server scraper (dev-mainserver-crawls). TradingEconomics: check API key / subscription status. Escalate to dev-mainserver-crawls. |
| B3 | macro-indicators microservice (port 5004) | **BUG** | `get_vn_liquidity_state` → `{"error":"macro-indicators service unavailable"}`. Full service failure — was "partial data" in 0807 report; escalated to complete outage this cycle. `get_macro_snapshot` may be serving cached/stale regime. | market-watcher (EOD, energy/liquidity path), unified-agent (D-step COC), digest-predict | Check if macro-indicators Go service (port 5004) is down on main server. `docker ps` / `systemctl status`. Escalate to dev-macro-indicators. |
| I1 | get_ism_subcomponents | **ISSUE** | `{"error":"no_data","message":"ISM sub-component analysis requires FRED_API_KEY environment variable..."}` — no FRED key configured. Confirmed unchanged from 0807. | news-scout (US monetary chain), unified-agent (D-step COC) | Add `FRED_API_KEY` to mcp-server environment (`.env` / Docker secrets). See FRED API at fred.stlouisfed.org — free key. |
| I2 | get_sector_rotation | **ISSUE** | All 16 sectors returning "(N/A / 5d)" for 5-day performance. 1-day values present. 7-day, 30-day: N/A. Pattern unchanged from 0807. | market-watcher, unified-agent (sector leadership layer) | Investigate price-history aggregation for 5d+ windows. Likely a gap in daily OHLCV coverage — check if batch job is writing sector-level aggregates. Escalate to dev-stock-price. |
| I4 | get_cascade_metrics | **ISSUE** | 44 rules evaluated, 1665+ signal hits counted, but `Evaluations=0` and `WinRate="—"` for every rule. Signal bus active but outcome tracking never ran. Confirmed unchanged. | bctc-analyst, market-watcher, unified-agent (self-calibration) | Wire signal outcome evaluator: compare `post_agent_signal` predictions vs subsequent price moves. Escalate to dev-mcp-server (cascade eval pipeline). |
| I6 | wti_crude_usd auto-tracker | **ISSUE** | `get_system_status` → wti_crude_usd=95.5 (months stale; live market ~76–79 USD/bbl). TradingEconomics outage (B2) may be the upstream cause since WTI tracker likely pulls from there. | All agents consuming macro regime / supply chain risk signals | Fix B2 (TradingEconomics) first — WTI tracker may self-heal. If separate source needed, wire commodity price via Yahoo Finance or Investing.com scraper. |
| I8 | vn-sbv-fetch health/push contradiction | **ISSUE** | `get_vps_service_health` → vn-sbv-fetch "unhealthy". `get_vps_proxy_health` → SBV last push 3 min ago, status OK. Health poller returning stale/incorrect status while actual push pipeline works normally. | Health monitoring accuracy — ops/system-auditor false positives | Investigate VPS health poller query for vn-sbv-fetch. Likely the health check pings a stale process PID or uses an incorrect liveness endpoint while the actual scraper loop runs fine. |
| I9 | SBV zero-value rejection loop | **ISSUE** | `get_system_status` → recurring `storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` error every ~30 min. sbvRatesRefreshJob success rate 98.2%. Protective logic works but generates noisy error logs. | SBV data quality monitoring — false alarm noise | Add rate-limit or dedup on zero-value rejection log. Change log level from ERROR to WARN for zero-value-guard rejections (they are expected protective behavior, not errors). |

---

## RESOLVED Since Prior Report (2026-06-22T08:07Z)

| Prior # | Finding | Resolution |
|---|---|---|
| I7 | CafeF RSS degraded (3 failures) | `get_system_status` this cycle: CafeF OK — 0 failures, last fetch 1 min ago. Confirmed transient. |
| I3 | Foreign-flow fallback exhausted | Market CLOSED at probe time (10:03 UTC / 17:03 ICT). vn-foreign-flow=idle is expected outside trading hours. Not a structural issue. |

---

## Re-Probe Evidence (STEP 3c)

All 7 prior active findings re-probed this cycle before carry-forward:

| Prior # | Re-Probe Tool | Result |
|---|---|---|
| B1 | get_vps_service_health, get_sla_status | CONFIRMED WORSENED: SLA 8002 min (up from ~7650 in 0807) |
| B2 | get_system_status | CONFIRMED WORSENED: 100 failures (up from 80) |
| I1 | get_ism_subcomponents | CONFIRMED UNCHANGED |
| I2 | get_sector_rotation | CONFIRMED UNCHANGED |
| I3 | get_system_status + context | RECLASSIFIED: market closed = idle expected |
| I4 | get_cascade_metrics | CONFIRMED UNCHANGED |
| I5→B3 | get_vn_liquidity_state | ESCALATED: "service unavailable" (was partial) |
| I6 | get_system_status | CONFIRMED UNCHANGED (wti=95.5) |
| I7 | get_system_status | RESOLVED (CafeF OK) |

---

## New Findings (First appeared this cycle)

| # | Finding | Evidence |
|---|---|---|
| I8 | vn-sbv-fetch health/push contradiction | get_vps_service_health vs get_vps_proxy_health divergence |
| I9 | SBV zero-value rejection loop | Recurring ERROR logs every ~30 min in get_system_status |

---

## VPS Probe Reference

From `docs/vps-sources/bctc-pipeline-stale-5d/recon.md` (2026-06-16T12:40Z):
- vn-bctc-fetch.service: active (running) since 2026-06-11, Main PID 1417640
- Last known VPS push: HUT Q1/2026 at 2026-06-13T23:45Z
- Fix c014 deployed 2026-06-15T17:05Z (afrLoop regex + HNX session cookie)
- ACV Q1/2026 discoverable as of 2026-06-16T12:40Z (12.9MB PDF)
- Current SLA breach: 8002 min / 360 min limit → **22x over SLA**

The 10-ticker queue (BDI, DAG, DLC, JSH, SIS, VDC, VNH, VEA, ACV, others) has genuine non-filers for Q1/2026. But ACV was downloadable on 2026-06-16 — if not pushed yet, 6+ days of lag on a resolved scraper is a separate concern.

---

## Priority Order for Dev Team

1. **B3** — macro-indicators service down: blocks COC regime detection and liquidity analysis for all 3 primary synthesis agents. Check port 5004.
2. **B1** — BCTC pipeline: 8002 min SLA breach. Recon doc shows fix was deployed but service may need restart + push verification.
3. **B2** — Reuters/TradingEconomics: 100% failure rate on international news. WTI staleness (I6) is likely downstream of this.
4. **I1** — FRED API key: simple config fix, unlocks ISM sub-component signals.
5. **I2** — Sector rotation 5d: investigate OHLCV aggregation gap.
6. **I8/I9** — SBV health poller + rejection log noise: low risk, medium cleanup value.
7. **I4** — Cascade metrics eval=0: signal bus working but outcome tracking never wired.

---

*Report generated by health-recheck routine. All probes read-only. No live data modified.*
