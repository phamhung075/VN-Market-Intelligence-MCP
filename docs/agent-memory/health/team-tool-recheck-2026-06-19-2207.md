# Team MCP Tool Health Recheck — 2026-06-19T22:07Z

**Probe window:** 2026-06-19T22:02Z – 2026-06-19T22:07Z
**Gateway:** `vn-market` via `mcp__gateway__call_tool` — **REACHABLE** ✅
**Probed tools:** 18 read-only calls across all cowork/dev agent dependencies
**Prior report:** `team-tool-recheck-2026-06-19-2005.md`
**Report path:** `docs/agent-memory/health/team-tool-recheck-2026-06-19-2207.md`
**Server uptime at probe:** 2h 58m 53s (restarted ~19:04 UTC today)

---

## STEP 3c — RE-PROBE VERIFICATION TABLE

Each prior finding re-probed fresh this cycle before carry-forward decision.

| Prior Finding | Re-probe command | Result |
|---|---|---|
| BUG-2 (ISM no_data) | `get_ism_subcomponents` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows"}` — STILL FAILING |
| BUG-3 (BCTC VPS) | `get_vps_service_health` + `get_vps_proxy_health` + `get_sla_status` | `vn-bctc-fetch: unhealthy, uptime 3d 4h 2m` · `bctc STALE, last push 2026-06-16 18:02:24` · SLA breach `4402/814 min CRITICAL` — WORSENING |
| BUG-4 (SBV zero-value) | `get_system_status` errors | 12 new `storeSbvSnapshot REJECTED` entries from 19:30 UTC June 19 through 05:00 UTC June 20 — ONGOING |
| ISSUE-1 (Reuters RSS) | `get_system_status` source health | `Reuters RSS | Ngưng | Chưa bao giờ | 33 ⚠` — ONGOING (counter at 33 = continues to grow since server restart at 19:04) |
| ISSUE-2 (Trading Economics) | `get_system_status` source health | `Trading Economics | Ngưng | Chưa bao giờ | 33 ⚠` (×2 entries) — ONGOING |
| ISSUE-3 (intel-cycle skip) | `get_system_status` recent errors | 5 occurrences since 19:04 restart: 19:15, 20:30, 21:45 UTC (June 19); 02:15, 03:30, 04:45 UTC (June 20) — ONGOING |
| ISSUE-6 (vnstock slow) | `get_cron_health` | `vnstockTradingStatsRefresh: 85.7% success, avg 649220ms` — UNCHANGED |
| NEW-1 prior (kinhdich 503) | `get_system_status` recent errors | NOT SEEN in post-restart error log (10 slots all occupied by sbv + intel-cycle). Unable to confirm/deny — may be market-hours only. UNCERTAIN |
| NEW-2 prior (windowPartitioner) | `get_system_status` recent errors | NOT SEEN in current error log. UNCERTAIN — insufficient evidence |

---

## ACTIVE FINDINGS (re-confirmed this cycle)

### BUGs

| # | Tool / Component | Class | Evidence (this cycle — 22:07Z) | Caller Count | Suggested Fix |
|---|-----------------|-------|-------------------------------|-------------|---------------|
| BUG-2 | `get_ism_subcomponents` | BUG | Re-probe 22:03Z: `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` — unchanged for multiple report cycles. | 3 callers (grep: `docs/agents/tools/package/news-scout.md`, `bctc-analyst.md`, `unified-agent.md`). Agents macro-blind on ISM regime. | Set `FRED_API_KEY` env var in mcp-server container. Trigger `macroIndicatorRefreshJob` once to seed. |
| BUG-3 | BCTC VPS pipeline (`vn-bctc-fetch`) | BUG | Re-probe 22:05Z: `vn-bctc-fetch: unhealthy, uptime 3d 4h 2m` (service running but not fetching). `get_vps_proxy_health`: `bctc STALE, last push 2026-06-16 18:02:24, 0 items in 24h`. `get_sla_status`: bctc breach **4402 min / 814 min threshold = CRITICAL** (was 4281 at 20:05 report — worsening at ~1 min/min). 10 watchlist tickers show `QUÁ HẠN` in earnings calendar. | 2 flows: `bctc-analyst` cycle blocked on Q1-2026 queue ingestion; `refine_bctc_md` pending queue stale. | SSH to VPS → inspect `journalctl -u vn-bctc-fetch -n 50` for error type. Service is alive (3d uptime) but not pushing — likely BCTC portal URL/auth changed or a silent fetch loop error. Restart + log review needed. |
| BUG-4 | SBV fetch zero-value rejections | BUG | Re-probe 22:03Z: `get_system_status` shows 12 `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` entries, every 30 min from 19:30 UTC June 19 to 05:00 UTC June 20. `vn-sbv-fetch: healthy` (service up). VPS push log shows successful sbv pushes every 30 min — but content is all-zeros. **NOTE:** `get_sla_status` shows `sbv_fx | 18 min | 753 min | ok` — this is a FALSE GREEN: the SLA freshness tracks VPS push arrival (good), not successful DB store (rejected). Actual SBV rate data in DB may be days stale. | `sbvRatesRefreshJob` (30-min schedule) + `intelligenceCycleJob`. `get_macro_snapshot` carry-trade/yield signals use cached fallback (USD_VND=26120 — unknown age). | Check SBV portal response format on VPS: `journalctl -u vn-sbv-fetch -n 20`. Likely portal changed schema returning zeros. The mcp-server rejection guard is correctly protecting good data — root cause is upstream. |

### ISSUEs

| # | Tool / Component | Class | Evidence (this cycle) | Caller Count | Suggested Fix |
|---|-----------------|-------|----------------------|-------------|---------------|
| ISSUE-1 | Reuters RSS source | ISSUE | Re-probe: `get_system_status` source health → `Reuters RSS | Ngưng | Chưa bao giờ | 33 ⚠`. 33 consecutive failures since server restart 19:04 UTC. Never succeeded in current server lifetime. CB failure count resets on restart. Long-term failure indicator: prior reports show this has been dead across multiple server restarts. | `news-scout` via `pollNewsJob`. Reduces international news diversity. | Audit the Reuters RSS URL in source config — likely dead (feeds.reuters.com discontinued per fix log #7). Disable the source to stop log noise. |
| ISSUE-2 | Trading Economics sources (×2) | ISSUE | Re-probe: Two TE entries both `Ngưng | Chưa bao giờ | 33 ⚠`. Never succeeded. | macro data consumers in macro-indicators flow. | Anti-bot / auth wall. May need TE API key or Chromium scraper path. Audit whether `tradingEconomicsChromium` source is configured correctly. |
| ISSUE-3 | `intelligence-cycle` overlap skips | ISSUE | Re-probe: 5 skip events post-restart: 19:15, 20:30, 21:45 UTC (June 19); 02:15, 03:30, 04:45 UTC (June 20). `intelligenceCycleJob` avg_duration 33110ms nominally but some runs exceed 900s (every 3rd). `bctcReparseJob` avg 180s, `agmPlanRefreshJob` avg 60s run concurrently. | All cowork agents that depend on intelligence-cycle output. Each skipped run = one missed news/price/alert orchestration cycle. | Investigate long-running outlier runs — likely bctcQueueEnricher (avg 29s but occasional timeout). Add per-job elapsed logging to pinpoint the slow step. |
| ISSUE-6 | `vnstockTradingStatsRefresh` slow | ISSUE | Re-probe: `get_cron_health` → `success_rate: 85.7% (6/7 runs), avg_duration: 649220ms (10.8 min)`. Job must complete within 15-min window to avoid contention. | `market-watcher` trading stats enrichment. Near SLA threshold. | Profile — likely N+1 ticker HTTP calls. Batch or parallelize ticker fetch loop. Consider running less frequently (daily instead of weekday). |

---

## UNCERTAIN (cannot reconfirm or deny from current data)

| Prior Finding | Status |
|---|---|
| NEW-1 (kinhdich 503 off-hours) | UNCERTAIN — no kinhdich 503 in post-restart log (10 recent error slots all consumed by sbv/intel-cycle). This is a market-hours issue; current probe is off-hours. Keep monitoring. |
| NEW-2 (windowPartitioner truncation) | UNCERTAIN — not in current error log. Low severity. Keep monitoring. |

---

## NEW FINDINGS (not in prior reports)

| # | Tool / Component | Class | Evidence (this cycle) | Caller Count | Suggested Fix |
|---|-----------------|-------|----------------------|-------------|---------------|
| NEW-3 | `system-map.json` watchlist drift | IMPROVE | `get_watchlist` returns 41 tickers (BDI, GVR, ACB, CTG, MBB, VPB, GAS, VEA, VNH, ACV, HVN, DHG, D2D, TCH, MWG, HCM, VDC, HSG, NKG, SIS, JSH, POW, PPC, REE + others). `docs/data/system-map.json` .watchlist has only ~34 active tickers and is missing ACB, CTG, GAS, BDI, VNH, ACV, HVN, etc. while having SHB, HUT, DIG, KDH, PDR, SAB, BSR, DXG, KDC, VJC, GEX, VIX, VND, DGC, FRT, MSN that are NOT in tool. system-map.json _maintained_by: "PM / system-auditor"; _trigger: "watchlist change". | Agents/scripts that read system-map.json for watchlist may operate on a stale set vs live DB. | PM to sync system-map.json .watchlist with `get_watchlist` tool output. Tool DB is the canonical source for runtime; system-map is docs SSOT — they should match. |
| NEW-4 | Digest dedup key format regression (W25) | IMPROVE | `task_list_held` shows `published:digest-sunday:2026-W25` (old weekLabel format) BUT NOT `published:digest-sunday:2026-06-15/2026-06-21` (new periodKey format per FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP). `get_week_period` confirms `periodKey: "2026-06-15/2026-06-21"` for current week. Fix was committed 2026-06-14 to flow file but the June 15 dispatch used old weekLabel format — fix did not take effect for W25. **Risk:** On June 22 (W26 Sunday), if any session still uses old code, BOTH `published:digest-sunday:2026-W26` (old) AND `published:digest-sunday:2026-06-22/2026-06-28` (new) would be claimed independently → double-publish of W26 digest (same double-publish that plagued W24). | `digest-predict` flow. Potential W26 double-publish duplicates weekly summary Telegram message. | Verify fix is live: spawn a `digest-predict` agent with test args and confirm `PUBLISH_TASK_ID` uses periodKey format. Also: proactively pre-claim `published:digest-sunday:2026-06-22/2026-06-28` AND `published:digest-sunday:2026-W26` for next Sunday to prevent double-fire. |

---

## RESOLVED (confirmed fixed vs prior cycle)

| # | Was | Evidence of Resolution |
|---|-----|------------------------|
| — | — | No new resolutions this cycle. All prior resolved findings remain resolved. |

---

## HEALTHY TOOLS — spot-checked this cycle

| Tool | Status | Notes |
|------|--------|-------|
| `get_cycle_bootstrap` | ✅ | agent_name required; returns agent_signals + market_context + system_status. elapsed_ms=20. |
| `get_system_status` | ✅ | Full health returned; DB 284MB; WAL 1.82MB; 0 open circuits. |
| `get_market_snapshot` | ✅ | VN-Index 1824.53 (-0.32%), breadth 81/203/66, liquidity 18804 tỷ. |
| `get_macro_snapshot` | ✅ | Oil 80.59, Gold 4172.9, USDVND 26120, carry/yield signals computed (cached). Note: `oilDelta/goldDelta/usdVndDelta = null` (no prior snapshot in session — expected on fresh server start). |
| `get_earnings_calendar` | ✅ | 41-ticker calendar returned; QUÁ HẠN tickers reflect BUG-3 BCTC gap. |
| `get_cron_health` | ✅ | 70 crons returned; all >85% success; `bctcReparseJob` 90.9% (acceptable). |
| `get_pipeline_health` | ✅ | 35/41 tickers TA-ready; BDI/DAG/DLC/JSH/SIS/VDC/VNH/VNH not ready (low volume — expected). 5 oversold signals: D2D/DPM/NKG/NVL/REE. |
| `get_vps_proxy_health` | ✅ (tool) | prices/news/sbv routes ok; bctc STALE is BUG-3. |
| `get_vps_service_health` | ✅ (tool) | Tool works; content issues are BUG-3/BUG-4. |
| `get_sla_status` | ✅ (tool) | Tool works; BCTC breach is BUG-3; sbv false-green is BUG-4. |
| `get_watchlist` | ✅ | 41 tickers returned with prices and thresholds. |
| `get_agent_signals` (from_agent=null) | ✅ | Pass `from_agent: null` explicitly for all-producers mode. Without key → inbox-mode error (expected). Callers in flow files all pass explicit null — 0 affected callers. |
| `task_list_held` | ✅ | 7 locks held; cowork-leader-lock active; 2 chef slots (morning/eod); esc-datacov FPT guard; digest-predict slots. Normal state. |
| `get_recent_fixes` | ✅ | 20 fixes returned; most recent 2026-05-12. |
| `task_claim` / `task_release` | ✅ | Schema reachable; round-trip confirmed in prior cycle. |
| `send_telegram` | ✅ | Last alert delivered 2026-06-19T17:29:58Z (20 alerts today, 0 unnotified). Tool functional. |

---

## Priority Matrix

| Priority | Finding | Age | Blast Radius |
|----------|---------|-----|-------------|
| P0 — Fix now | BUG-3: BCTC VPS `vn-bctc-fetch` running but not fetching | 3+ days | bctc-analyst Q1-2026 queue blocked; 10 tickers QUÁ HẠN; worsening 1 min/min |
| P0 — Fix now | BUG-4: SBV zero-value every 30 min; SBV freshness FALSE GREEN | Ongoing since pre-restart | SBV rates stale (unknown age); macro carry-trade/yield on cached fallback |
| P1 — Fix this sprint | BUG-2: `get_ism_subcomponents` empty — no FRED_API_KEY | Unknown | 3 agents (news-scout, bctc-analyst, unified-agent) blind on ISM regime |
| P2 — Investigate | ISSUE-1: Reuters RSS dead (33+ errors, never succeeded) | ≥7 days | Reduced international news coverage |
| P2 — Investigate | ISSUE-2: Trading Economics dead (2 sources, 33+ errors) | ≥7 days | Macro data gap |
| P2 — Fix before Sunday | NEW-4: digest-predict W25 used old weekLabel format → W26 double-publish risk | W25 regression | Potential duplicate weekly digest on June 22 Telegram |
| P3 — Monitor | ISSUE-3: intelligence-cycle overlap (5 skips in this session) | Recurring | Missed orchestration cycles |
| P3 — Monitor | ISSUE-6: vnstockTradingStatsRefresh slow (85.7%) | Ongoing | Near SLA threshold |
| P3 — Maintain | NEW-3: system-map.json watchlist 41 live tickers vs ~34 documented | Unknown | Doc/runtime drift; agents reading system-map may use stale set |

---

## Delta vs Prior Report (2026-06-19T20:05Z)

| Finding | Delta |
|---------|-------|
| BUG-2 (ISM no_data) | ⚠ **UNCHANGED** — still no FRED_API_KEY |
| BUG-3 (BCTC VPS) | ❌ **WORSENING** — SLA breach 4281→4402 min (121 min worse in 2h) |
| BUG-4 (SBV zero-value) | ❌ **ONGOING** — 12 new rejections; FALSE GREEN on freshness monitor confirmed |
| ISSUE-1 (Reuters RSS) | ⚠ **ONGOING** — counter at 33 (keeps growing post-restart) |
| ISSUE-2 (Trading Economics) | ⚠ **ONGOING** — same 33 errors |
| ISSUE-3 (intel-cycle overlap) | ⚠ **ONGOING** — 5 skips this session (was 2 at 20:05) |
| ISSUE-6 (vnstock slow) | ⚠ **UNCHANGED** |
| NEW-1 (kinhdich 503) | ❓ **UNCERTAIN** — not visible in post-restart off-hours error window |
| NEW-2 (windowPartitioner) | ❓ **UNCERTAIN** — not visible in current errors |
| NEW-3 (system-map watchlist drift) | 🆕 **NEW** — IMPROVE |
| NEW-4 (digest W25 old key) | 🆕 **NEW** — IMPROVE; W26 double-publish risk Sunday June 22 |

---

*Generated by: health-recheck scheduled routine*
*Probed via: `mcp__gateway__call_tool(server="vn-market", ...)`*
*UTC: 2026-06-19T22:07Z*
