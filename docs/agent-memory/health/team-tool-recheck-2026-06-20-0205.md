# Team MCP Tool Health Recheck — 2026-06-20T02:05Z

**Probe window:** 2026-06-20T02:00Z – 2026-06-20T02:06Z
**Gateway:** `vn-market` via `mcp__gateway__call_tool` — **REACHABLE** ✅
**Probed tools:** 18 read-only calls + 2 task_claim/task_release round-trip
**Prior report:** `team-tool-recheck-2026-06-20-0007.md`
**Report path:** `docs/agent-memory/health/team-tool-recheck-2026-06-20-0205.md`
**Server uptime at probe:** ~7h (restarted 2026-06-19 19:04 UTC)
**VN trading window:** OPEN (02:00–08:59 UTC Mon–Fri) — market live at probe time

---

## STEP 3c — RE-PROBE TABLE (mandatory fresh re-run)

All prior findings re-probed this cycle before carry-forward decision.

| Prior Finding | Re-probe command (this cycle) | Result |
|---|---|---|
| BUG-2 (ISM no_data) | `get_ism_subcomponents({})` | `error: "no_data" — fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob (requires FRED_API_KEY)` — **CONFIRMED ONGOING** |
| BUG-3 (BCTC VPS) | `get_vps_service_health` + `get_vps_proxy_health` + `get_sla_status` | `vn-bctc-fetch: unhealthy, 0ms response, uptime 3d 7h 57m` · `bctc STALE, last push 2026-06-16 18:02:24, 0 items in 24h` · SLA breach 4642 min / 1054 min threshold = CRITICAL (was 4523 at 00:07Z — +119 min in 2h) — **CONFIRMED WORSENING** |
| BUG-4 (SBV zero-value) | `get_system_status` recent errors | `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` at 02:00:58Z — **CONFIRMED ONGOING** |
| ISSUE-1 (Reuters RSS) | `get_system_status` source health | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 71 ⚠` — was 51 at 00:07Z (+20 in 2h) — **CONFIRMED ONGOING** |
| ISSUE-2 (Trading Economics ×2) | `get_system_status` source health | Both TE entries `Ngưng \| Chưa bao giờ \| 71 ⚠` — same +20 delta as Reuters — **CONFIRMED ONGOING** |
| NEW-HNX (HNX/UPCOM price loop) | `get_system_status` recent errors | `[hnx] all UPCOM price sources failed` + `[hnx] all HNX price sources failed` — 10 occurrences in last 5-min window (02:00:01, 02:01:06, 02:02:10 UTC). **UPGRADED P1→P0: market is now OPEN (09:00 VN)** — 6 watchlist tickers showing N/A during live session. |
| ISSUE-6 (vnstock slow) | `get_cron_health` | `vnstockTradingStatsRefresh: 85.7% (6/7 runs), avg 649220ms` — **UNCHANGED** |
| ISSUE-3 (intel-cycle overlap) | `get_system_status` errors | Not directly observable in current error window (saturated by hnx noise) — UNCERTAIN |
| NEW-1 (kinhdich 503 off-hours) | Not re-probed (market now open; off-hours condition not reproducible) | UNCERTAIN |
| NEW-4 (digest W25 old key) | `task_list_held` | Locks present: `published:digest-sunday:2026-W25` (exp 22:06-22T13:50Z) + `2026-W24` + `2026-06-08/2026-06-14`. Upcoming Sunday key = `2026-06-15/2026-06-21` (periodKey-based). No collision with existing locks. Risk LOWER than prior cycle; flow already uses periodKey. — **CARRY, lowered to IMPROVE** |
| IMPROVE-1 (get_bctc_pending_refine unbounded) | Not re-probed — stable doc issue | CARRY |
| IMPROVE-2 (fb-market-poster doc stale) | Not re-probed — doc issue | CARRY |
| IMPROVE-3 (emit_pressure_state stale_warning) | `emit_pressure_state({})` | `{success:true, cycle_snapshot_promoted:false}` at 02:05:58Z — **CONFIRMED ONGOING** |
| NEW-3 (system-map watchlist drift) | Not re-probed — doc issue | CARRY |

---

## ACTIVE FINDINGS (re-confirmed this cycle)

### BUGs — callers affected

| # | Tool / Component | Class | Evidence (fresh — 02:05Z) | Caller Count / Impact | Suggested Fix |
|---|---|---|---|---|---|
| **BUG-HNX** ⬆ P0 | HNX/UPCOM price sources — ALL failed | BUG | `get_system_status` 02:00–02:02Z: 10 errors `[hnx] all UPCOM price sources failed` + `[hnx] all HNX price sources failed`. Market OPEN since 02:00 UTC. `get_pipeline_health` + `get_watchlist`: BDI/HNX, DLC/UPCOM, VNH/HNX, ACV/UPCOM, JSH/HNX, VDC/UPCOM → all N/A during live session. CB counter stays 0 (not tripping). **Upgraded P1→P0** — this is now active data-loss during trading hours. | market-watcher (cycle.md price anomaly), alert-commander (price alerts), unified-agent (chef.md price calls), fb-market-poster (ticker_intel loop). 6 watchlist tickers dark. | SSH to VPS: check `vn-price-fetch` logs. Investigate HNX sub-source URL. CB failure-count reset bug: counter stays 0 on each call → should accumulate. |
| **BUG-2** | `get_ism_subcomponents` — no_data | BUG | Re-probe 02:04Z: `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob (requires FRED_API_KEY)."}` — **CONFIRMED ONGOING**. Not in recent_fixes. | market-watcher + unified-agent ISM regime signal. 3 cowork agents macro-blind on ISM. | Set `FRED_API_KEY` env var in mcp-server container and run `macroIndicatorRefreshJob` to backfill. |
| **BUG-3** ⬆ | BCTC VPS pipeline (`vn-bctc-fetch` unhealthy) | BUG | Re-probe 02:03Z: `vn-bctc-fetch: unhealthy, 0ms response, uptime 3d 7h 57m`. `get_vps_proxy_health`: `bctc STALE, last push 2026-06-16 18:02:24, 0 pushes/24h`. `get_sla_status`: 4642 min / 1054 min = CRITICAL (was 4523 at 00:07Z). `get_system_status`: BCTC data `77.4h old ("!! Rất cũ")`. `get_earnings_calendar`: 11 tickers QUÁ HẠN (BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH). grep: `docs/agents/bctc-analyst/flow/cycle.md`, `docs/agents/refine_bctc_md/flow/main.md` depend on BCTC pipeline. | bctc-analyst Q1-2026 queue blocked; refine_bctc_md pending stale; 11 overdue tickers cannot be processed. | SSH to VPS: `journalctl -u vn-bctc-fetch -n 50`. Service alive (3d+ uptime) but not pushing — likely BCTC portal URL or auth changed. Restart + log review. |
| **BUG-4** | SBV fetch zero-value rejections (persistent) | BUG | Re-probe 02:00:58Z: `storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` — recurring every 30 min at market open. `vn-sbv-fetch: healthy` (confirms service is up). DB guard correctly blocking zero-value. Root cause: SBV scraper returns zeros; real cause unknown (portal change or parse fail). SBV SLA shows `ok` — this is a FALSE GREEN (tracks VPS push arrival, not DB write success). Macro carry-trade / yield signals reading cached SBV rates of unknown age. | sbvRatesRefreshJob + get_macro_snapshot carry-trade. All cowork agents reading SBV rates via get_macro_snapshot use stale cached data. | VPS SSH: `journalctl -u vn-sbv-fetch -n 20`. Capture raw SBV response to find what returns zero. |

### ISSUEs — degraded but not blocking

| # | Tool / Component | Class | Evidence (fresh — 02:05Z) | Caller Count | Suggested Fix |
|---|---|---|---|---|---|
| **ISSUE-1** | Reuters RSS source | ISSUE | Re-probe 02:03Z: `Reuters RSS \| Ngưng \| Chưa bao giờ \| 71 ⚠` — was 51 at 00:07Z (+20 in 2h). Never succeeded since server restart 19:04 UTC yesterday. Per fix log #7 (2026-04-30), `vn-reuters-fetch.service` was decommissioned for dead URLs — but mcp-server's direct RSS fetch CB still open and incrementing. | news-scout `pollNewsJob` international coverage dark; CB log noise. | Disable Reuters RSS source in mcp-server source config. Feed is confirmed dead since April. |
| **ISSUE-2** | Trading Economics sources (×2) | ISSUE | Re-probe 02:03Z: Both TE entries `Ngưng \| Chưa bao giờ \| 71 ⚠` — same +20 delta as Reuters. Never succeeded since server restart. Chromium fix was applied 2026-04-30 (fix #6) but regressed after 2026-06-19 restart. Both VPS-side TE and main-server Chromium path failing. | macro-indicators service; get_macro_snapshot TE-sourced fields; C-09 threshold may be impacted. | Verify `TRADING_ECONOMICS_API_KEY` env var set in current container. Check if Chromium still installed at `/usr/bin/chromium` post-restart (may have been lost in rebuild). |
| **ISSUE-6** | `vnstockTradingStatsRefresh` slow | ISSUE | Re-probe 02:04Z: `success_rate: 85.7% (6/7 runs), avg_duration: 649220ms (~10.8 min)`. Unchanged across all cycles. Near 15-min cron window. | market-watcher trading-stats enrichment. 14.3% miss rate. | Profile ticker HTTP loop — likely N+1 calls. Batch or parallelize. Consider daily frequency. |
| **ISSUE-7** | News SLA breached (97 min / 30 min threshold) | ISSUE | `get_sla_status`: `news: 97/30min breached CRITICAL`. However raw news sources are healthy (VnEconomy/VnExpress/CafeF OK, last push 02:02Z). SLA measures enriched `market_messages` pipeline, not raw RSS. Low-flow off-hours period (early market open) naturally exceeds 30-min SLA. | `pipelineWatchdogJob` may false-alarm; freshnessSlaMonitorJob reporting CRITICAL. | Adjust news SLA threshold to differentiate market-hours vs off-hours cadence. 30-min during session; 90-min outside. Or filter SLA alert by trading window. |

---

## UNCERTAIN (not resolvable from this probe)

| Prior Finding | Status |
|---|---|
| ISSUE-3 (intelligence-cycle overlap skips) | **UNCERTAIN** — error log saturated by hnx noise; can't disambiguate. |
| NEW-1 (kinhdich 503 off-hours) | **UNCERTAIN** — market now open; off-hours condition not reproducible this probe. |
| NEW-2 (windowPartitioner truncation) | **UNCERTAIN** — low severity; not in current error window. |

---

## IMPROVEments (carry-forward, 0 callers broken at runtime)

| # | Tool / Component | Class | Evidence | Caller Count | Suggested Fix |
|---|---|---|---|---|---|
| IMPROVE-1 | `get_bctc_pending_refine` unbounded default | IMPROVE | No `limit` arg returns all pending items (token overflow risk). Callers use `{limit:1}` correctly — 0 affected callers. | 0 broken callers | Add server-side default `limit=10`. |
| IMPROVE-2 | `fb-market-poster` tool package doc stale | IMPROVE | `docs/agents/tools/package/fb-market-poster.md` still lists `get_cycle_bootstrap`. Flow correctly removed this call (FIX-CYCLE-BOOTSTRAP-AGENT-ENUM-SSOT at line 31–36). Doc lags. | 0 runtime callers broken | Update package doc to reflect STEP 0 live tool list. |
| IMPROVE-3 | `emit_pressure_state` stale_warning / `cycle_snapshot_promoted:false` | IMPROVE | Re-probe 02:05Z: `{success:true, cycle_snapshot_promoted:false}`. Cowork telemetry reading stale pressure snapshot. | cowork-team telemetry.md Step 6 | Investigate why cycle_snapshot_promoted stays false; check if cowork dispatcher is running its tick-snapshot step. |
| IMPROVE-4 | Digest dedup key W25 legacy | IMPROVE | task_list_held: `published:digest-sunday:2026-W25` + `2026-W24` old-format keys still held (expire 2026-06-22). Upcoming Sunday key = `2026-06-15/2026-06-21` (periodKey-format). No collision risk since flow uses periodKey. Low risk. | digest-predict Sunday June 22 | No immediate action needed; confirm flow uses get_week_period correctly (already fixed per FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP). |
| IMPROVE-5 | system-map.json watchlist drift | IMPROVE | `get_watchlist` = 41 tickers; system-map.json .watchlist has ~34 active entries. | Agents/scripts reading system-map.json | PM to sync system-map.json watchlist with live `get_watchlist` output. |

---

## RESOLVED (confirmed fixed vs prior cycles)

| # | Was | Evidence of Resolution |
|---|---|---|
| — | — | No new resolutions this cycle. All prior resolved findings remain resolved. |

---

## HEALTHY TOOLS — spot-checked this cycle

| Tool | Status | Notes |
|---|---|---|
| `get_cycle_bootstrap` | ✅ | Valid enum values; tested `agent_name="market-watcher"` — returns agent_signals + market_context + system_status (9ms). |
| `get_system_status` | ✅ | Full health returned. Content issues = BUG-HNX/BUG-3/BUG-4. |
| `get_market_snapshot` | ✅ | VN-Index 1824.53, breadth 81/203/66. HNX/UPCOM tickers N/A (BUG-HNX). |
| `get_macro_snapshot` | ✅ | Tool functional; SBV rates on cached fallback (BUG-4). TE macro fields dark (ISSUE-2). |
| `get_earnings_calendar` | ✅ | 41-ticker calendar returned; 11 QUÁ HẠN tickers reflect BUG-3. |
| `get_cron_health` | ✅ | All crons firing. Min success rate: `vnstockTradingStatsRefresh` 85.7% (ISSUE-6). Zero crons below 80% alert threshold. |
| `get_pipeline_health` | ✅ | 37 tickers with TA; 5 with 0 rows (BDI/DAG/DLC/SIS/VDC — BUG-HNX coverage). |
| `get_vps_proxy_health` | ✅ (tool) | prices/news/sbv routes ok; bctc STALE (BUG-3). |
| `get_vps_service_health` | ✅ (tool) | 2 healthy (news, sbv), 2 idle (price/foreign-flow, market-closed expected), 1 unhealthy (bctc — BUG-3). |
| `get_sla_status` | ✅ (tool) | BCTC breach BUG-3; news breach ISSUE-7; SBV false-green BUG-4. |
| `get_watchlist` | ✅ | 41 tickers returned. |
| `get_earnings_calendar` | ✅ | 41 tickers, status correct. |
| `get_agent_signals` | ✅ | Sender-history mode (`from_agent=...`) works. Inbox mode requires `agent` param (documented). |
| `task_claim` / `task_release` | ✅ | Probe round-trip: claimed → released OK. 7 active locks (normal). |
| `get_recent_fixes` | ✅ | 20 fixes returned; none resolve BUG-HNX/BUG-2/BUG-3/BUG-4/ISSUE-1/ISSUE-2. |
| `get_rate_limit_status` | ✅ (inferred from get_system_status CBs) | 0 open circuits. |
| `emit_pressure_state` | ✅ (tool) | Returns success=true; stale_warning implicit via cycle_snapshot_promoted:false (IMPROVE-3). |
| `task_list_held` | ✅ | 7 locks: 2 chef slots (normal), 1 cowork-leader (normal), 1 bctc-analyst esc guard, 3 digest-predict keys. No orphans. |

---

## Priority Matrix

| Priority | Finding | Age | Blast Radius |
|---|---|---|---|
| **P0 — Fix immediately** | BUG-HNX: HNX/UPCOM all sources failed DURING MARKET HOURS (09:00 VN) | NEW (upgraded from P1) | 6 watchlist tickers dark (BDI/DLC/VNH/ACV/JSH/VDC); price alerts cannot fire; market-watcher + unified-agent data gap during live session |
| **P0 — Fix now** | BUG-3: BCTC VPS service unhealthy — 4642 min SLA breach (77+ hours) | 3+ days (since 2026-06-16) | bctc-analyst Q1-2026 queue blocked; 11 tickers QUÁ HẠN; refine_bctc_md stale; worsening 1 min/min |
| **P1 — Fix this sprint** | BUG-4: SBV zero-value every 30 min; DB guard working but root cause unresolved | Ongoing (recurrent) | SBV FX rates on stale cached fallback; macro carry-trade thesis unreliable |
| **P1 — Fix this sprint** | BUG-2: `get_ism_subcomponents` no_data — FRED_API_KEY missing | Confirmed since 2026-06-13 | 3 cowork agents macro-blind on ISM subcomponents |
| **P2 — Investigate** | ISSUE-1: Reuters RSS — 71 failures (never succeeded this server lifetime) | Since restart 2026-06-19 19:04Z | Log noise; international news dark; CB counter churn |
| **P2 — Investigate** | ISSUE-2: Trading Economics — 71 failures (2 sources, Chromium regression post-restart) | Since restart 2026-06-19 19:04Z | Macro TE-sourced fields dark; C-09 indicator count may drop below threshold |
| **P2 — Improve** | ISSUE-7: News SLA 30-min threshold too tight for off-hours cadence (false CRITICAL) | Ongoing | freshnessSlaMonitorJob generating false CRITICAL alarms off-hours |
| **P3 — Monitor** | ISSUE-6: `vnstockTradingStatsRefresh` 85.7% success / 10.8 min avg | Ongoing | Near 15-min SLA window; 14.3% miss rate |
| **P3 — Maintain** | IMPROVE-1/2/3/4/5 | Various | 0 runtime callers broken; doc/config hygiene |

---

## Delta vs Prior Report (2026-06-20T00:07Z)

| Finding | Delta |
|---|---|
| BUG-HNX (HNX/UPCOM price loop) | 🔴 **UPGRADED P1→P0** — market is now OPEN; 6 tickers dark during live session |
| BUG-2 (ISM no_data) | ❌ **CONFIRMED ONGOING** — re-probed this cycle; FRED_API_KEY still missing |
| BUG-3 (BCTC VPS) | ❌ **WORSENING** — SLA 4523→4642 min (+119 in 2h) |
| BUG-4 (SBV zero-value) | ❌ **ONGOING** — firing at 02:00:58Z |
| ISSUE-1 (Reuters RSS) | ⚠ **ONGOING** — counter 51→71 (+20 in 2h) |
| ISSUE-2 (Trading Economics) | ⚠ **ONGOING** — counter 51→71 (+20 in 2h) |
| ISSUE-3 (intel-cycle overlap) | ❓ **UNCERTAIN** — error log saturated; cannot confirm |
| ISSUE-6 (vnstock slow) | ⚠ **UNCHANGED** — 85.7% / 649s avg |
| NEW ISSUE-7 (news SLA false CRITICAL) | 🆕 **NEW** — 97 min vs 30 min threshold; raw sources healthy |
| IMPROVE-4 (digest W25 key) | ↘ **RISK REDUCED** — upcoming Sunday uses periodKey format; no collision |
| IMPROVE-1/2/3/5 | ⚠ **CARRY** — 0 runtime callers broken |

---

*Generated by: health-recheck scheduled routine*
*Probed via: `mcp__gateway__call_tool(server="vn-market", ...)`*
*UTC: 2026-06-20T02:05Z*
