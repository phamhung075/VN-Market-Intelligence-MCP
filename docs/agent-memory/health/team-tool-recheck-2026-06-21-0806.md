# Team MCP Tool Recheck — 2026-06-21 08:06 UTC

**Run by:** health-recheck agent  
**Gateway:** vn-market reachable ✅  
**Probe window:** 2026-06-21 ~08:00–08:07 UTC (VN market CLOSED — Sunday off-hours)  
**Prior report:** `team-tool-recheck-2026-06-21-0605.md`  
**STEP 3c:** All prior BUG/ISSUE findings re-probed this cycle before classification.

---

## Summary

| Class | Count | Worst severity |
|-------|-------|----------------|
| BUG   | 4     | CRITICAL (BCTC pipeline dead — day 5, SLA 6442/2855 min = 2.26×) |
| ISSUE | 6     | HIGH (49 open warnings; SBV restart loop; intelligence-cycle stalls) |
| IMPROVE | 3   | LOW–MEDIUM |
| RESOLVED | 1  | ISSUE-7 weatherCheckJob stall (not confirmed this cycle) |

---

## RESOLVED (not confirmed this cycle)

### ISSUE-7 — weatherCheckJob stall — NOT CONFIRMED → DOWNGRADED TO CLOSED

| Field | Value |
|-------|-------|
| Prior evidence | `[weatherCheckJob] previous run still in progress — skipping` at 05:00 UTC (06:05 report) |
| Re-probe result | `weatherCheckJob: last_run=2026-06-21 05:00:01, last_status=success` — no stall in current error log window (06:05–08:07 UTC). Prior stall was one-off. |
| Delta | Not reproduced this cycle. Closed as transient. |

---

## ACTIVE FINDINGS

### BUG-1 — CRITICAL: BCTC pipeline dead (day 5+), SLA breached 2.26× — UNCHANGED (WORSENING)

| Field | Value |
|-------|-------|
| Tools probed | `get_sla_status`, `get_vps_service_health`, `get_vps_proxy_health` |
| Evidence (re-confirmed 08:03 UTC) | `get_sla_status` → **bctc: 6442/2855 min — CRITICAL breach 2.26×** (was 6322/2735 at 06:05 UTC, +120 min). `get_vps_service_health` → `vn-bctc-fetch: unhealthy, uptime 4d 13h 57m`. `get_vps_proxy_health` → bctc last push `2026-06-16 18:02:24` (5+ days ago, STALE flagged). |
| Delta vs prior | SLA grew from 6322→6442 min (+120 min). No fix landed. Active for 2h since last report. |
| Caller count | bctc-analyst, refine_bctc_md, cron:bctcReparseJob, cron:bctcPdfPull, cron:bctcQueueEnricher — **5 callers** |
| Impact | No new BCTC PDFs since June 16. Q1-2026: 11 tickers QUÁ HẠN (BID, GAS, DAG, DLC, PLX, PPC, SIS, VDC, VEA, VNH, JSH). `bctcReparseJob` success_rate improved 94.4%→97.0% this cycle (likely from non-BCTC reruns passing) but structurally linked. |
| Suggested fix | SSH VPS → `sudo systemctl restart vn-bctc-fetch.service`. Verify via `get_vps_service_health`. If still unhealthy: `journalctl -u vn-bctc-fetch -n 100`. Then call `trigger_bctc_vps_fetch` to flush queue. |

---

### BUG-2 — HIGH: Reuters RSS — persistent, never succeeded — UNCHANGED (WORSENING)

| Field | Value |
|-------|-------|
| Tool probed | `get_system_status` → Source Health |
| Evidence (re-confirmed 08:02 UTC) | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 53 ⚠` — failure count grew from 37→53 since 06:05 UTC report (+16 in 2h, ~1 failure/~7.5 min). Never succeeded. |
| Delta vs prior | Failures 37→53. Worsening. No fix. |
| Caller count | news-scout pipeline, unified-agent (international macro context) — **2 agent pipelines** |
| Impact | International Reuters coverage permanently dark. |
| Suggested fix | Dead feed confirmed (vn-reuters-fetch.service decommissioned 2026-04-30 per fix #7). Remove/disable Reuters RSS source record in mcp-server config to eliminate log noise. Zero remediation value — source is dead. |

---

### BUG-3 — HIGH: Trading Economics 2× dead — UNCHANGED (WORSENING)

| Field | Value |
|-------|-------|
| Tool probed | `get_system_status` → Source Health |
| Evidence (re-confirmed 08:02 UTC) | 2 TE instances: `Trading Economics \| Ngưng \| Chưa bao giờ \| 53 ⚠` each (up from 37 at 06:05 report). |
| Delta vs prior | Failures 37→53 on both instances. No fix. |
| Caller count | `get_macro_snapshot` (market-watcher, unified-agent), `get_vn_macro_indicators`, macro-health-read skill — **3+ agents** |
| Impact | `get_macro_snapshot` this cycle: `oilUsdDelta: null, goldUsdDelta: null, usdVndDelta: null, oilUsdDirection: "unknown"`. Macro direction signals degraded. |
| Suggested fix | Check Chromium in mcp-server container. Per prior fix #6 (2026-04-30), Chromium 147 was installed — verify it's still present after any rebuilds: `docker exec <mcp-ctr> chromium --version`. If 404/block issue: check Cloudflare anti-bot posture on TE. |

---

### BUG-4 — MEDIUM: ISM subcomponent data absent (FRED_API_KEY unset) — UNCHANGED

| Field | Value |
|-------|-------|
| Tool probed | `get_ism_subcomponents` |
| Evidence (re-confirmed 08:03 UTC) | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` — identical to prior. `macroIndicatorRefreshJob` ran 2026-06-20 12:13 UTC (success 100%) but ISM rows still empty → FRED_API_KEY absent in env. |
| Delta vs prior | Unchanged. |
| Caller count | news-scout, bctc-analyst, unified-agent — **3 agents** |
| Impact | ISM Manufacturing PMI sub-components unavailable. Macro regime US cycle indicator missing. |
| Suggested fix | Set `FRED_API_KEY` in `.env` (free key at fred.stlouisfed.org). Verify `macroIndicatorRefreshJob` picks it up on next run (19:13 UTC daily). |

---

## ISSUES

### ISSUE-1 — MEDIUM: SBV zero-value rejection loop + vn-sbv-fetch restart cycle — UNCHANGED + NEW PATTERN

| Field | Value |
|-------|-------|
| Evidence (re-confirmed 08:07 UTC) | 4 ERROR entries this cycle: `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` at 06:32, 07:02, 07:32, 08:02 UTC. **NEW**: `vn-sbv-fetch: unhealthy, 44m uptime` at 08:07 UTC — was `1h 15m uptime` at 06:05 UTC. Service restarted ~07:23 UTC but is STILL unhealthy. Service entered a restart cycle pattern. |
| Delta vs prior | vn-sbv-fetch restarted mid-cycle but remains unhealthy (systemd health probe failing). SBV FX data still fresh (age: 4 min per `get_sla_status`). Push log shows sbv pushes at 07:32 and 08:02 UTC succeeding. Data protected — rejection guard working. Main risk: restart loop escalation. |
| Caller count | `get_macro_snapshot`, `get_vn_macro_indicators`, SBV rates downstream — **2 tools + macro pipeline** |
| Impact | Data quality NOT affected (fresh). Log noise elevated. Restart loop adds VPS instability risk. |
| Suggested fix | `journalctl -u vn-sbv-fetch -n 50` on VPS to inspect why health probe fails despite successful pushes. If VCB XML API returns zeros outside 07:00–17:00 VN time, add off-hours skip gate in `sbvRatesRefreshJob.ts` and reduce systemd restart aggression (RestartSec=60 during off-hours). |

---

### ISSUE-2 — HIGH: 49 open warnings / 67 pending feedback — UNCHANGED

| Field | Value |
|-------|-------|
| Evidence (re-confirmed 08:02 UTC) | `get_system_status` → `open_warnings: 49 high/critical`, `pending_feedback: 67`. Last daily audit: 2026-06-20 16:00 UTC. |
| Delta vs prior | Count unchanged (was 49/67 at 06:05). Flat — no new warnings in 2h, also none cleared. |
| Caller count | system-auditor reads these; dev-team triage — **2 agents** |
| Suggested fix | Dispatch system-auditor Tier-2 sweep to drain feedback queue and close resolved warnings. |

---

### ISSUE-3 — LOW: bctcReparseJob success rate — IMPROVED 94.4% → 97.0%

| Field | Value |
|-------|-------|
| Evidence (re-confirmed 08:03 UTC) | `bctcReparseJob: success_rate=0.97 (97.0%), total_runs=67` (was 0.94/94.4%/71 runs in prior report). |
| Delta vs prior | Rate improved 94.4% → 97.0%. Structurally linked to BUG-1 (no new PDFs). Will self-heal fully once BUG-1 resolved. |
| Suggested fix | Monitor. Will close when BUG-1 fixed. |

---

### ISSUE-4 — MEDIUM: intelligence-cycle occasional stalls — UNCHANGED

| Field | Value |
|-------|-------|
| Evidence (re-confirmed) | `[intelligence-cycle] previous cycle still running — skipped` at 07:15 UTC (visible in `get_system_status` recent errors). `intelligenceCycleJob: avg_duration=28,799ms` (normal), but >15 min spikes occur. |
| Delta vs prior | Unchanged. One skip per ~2h observation window. |
| Caller count | All cowork agents depend on intelligence-cycle freshness — **fleet-wide** |
| Suggested fix | Add 12-min hard timeout to `intelligenceCycleJob.ts`. Investigate VPS DB lock timing at stall events. |

---

### ISSUE-5 — LOW: BDI shipping data 75 days stale (BUG-5 impact confirmed)

| Field | Value |
|-------|-------|
| Tool probed | `get_supply_chain_exposure(ticker="HPG")` |
| Evidence (new, 08:03 UTC) | Returns `CHỈ SỐ VẬN TẢI BIỂN: BDI: 1,400 (+0.0%) - 2026-04-07` — data is **75 days stale**. `commodityTrackerRefreshJob` last ran 2026-06-21 06:00 UTC and prior report logged shippingIndex HTTP 404 errors at that timestamp. The tool silently serves stale cached data without surfacing the 404. |
| Delta vs prior | BUG-5 from prior cycle (shippingIndex 404 at 06:00 UTC) is confirmed to have real impact: BDI data 75 days stale. 404 not in current error window (cron hasn't re-fired this cycle). |
| Caller count | `get_supply_chain_exposure` (market-watcher package) — **1 tool + market-watcher agent** |
| Suggested fix | Test `curl "https://query1.finance.yahoo.com/v8/finance/chart/%5EBDI?range=1d"` directly. If 404: try v10 endpoint. Update `shippingIndex.ts` URL. If symbol changed, replace `^BDI` with valid Yahoo symbol. Add explicit freshness check: surface staleness warning when BDI age > 72h. |

---

### ISSUE-6 — LOW: Commodity price deltas null (linked to BUG-3) — UNCHANGED

| Field | Value |
|-------|-------|
| Evidence (re-confirmed 08:03 UTC) | `get_macro_snapshot` → `oilUsdDelta: null, goldUsdDelta: null, usdVndDelta: null, oilUsdDirection: "unknown"`. |
| Delta vs prior | Unchanged. |
| Suggested fix | Linked to BUG-3. Short-term: compute deltas from `tracked_indicators` table history in `commodityTracker.ts` without TE dependency. |

---

## IMPROVE

### IMPROVE-1 — LOW: `get_price_history` docs param `ticker` vs live `code` — UNCHANGED

| Field | Value |
|-------|-------|
| Caller-surface verified | `grep -r "get_price_history" docs/agents/*/flow/*.md` → 0 callers use `ticker`. All callers use `code`. **0 affected runtime callers.** |
| Suggested fix | Update `docs/agents/tools/list/get_price_history.md` param name `ticker` → `code`. |

---

### IMPROVE-2 — MEDIUM: `get_bctc_pending_refine` no default limit → context overflow risk — UNCHANGED

| Field | Value |
|-------|-------|
| Evidence | Without `limit`, returns 51 reports ≈ 235K chars. Only caller (`refine_bctc_md`) correctly uses `limit:1`. **0 affected runtime callers.** |
| Suggested fix | Add server-side default cap `limit: 10`. Update tool doc default example. |

---

### IMPROVE-3 — LOW: `vnstockTradingStatsRefresh` at 85.7% success, 10.8 min avg runtime — UNCHANGED

| Field | Value |
|-------|-------|
| Evidence (re-confirmed) | `vnstockTradingStatsRefresh: success_rate=0.86 (85.7%), total_runs=7, avg_duration=649,220ms`. Above 80% alert threshold but 1/7 fail; 10.8 min avg risks cycle overlap. |
| Suggested fix | Profile slow path. Consider incremental update. |

---

## Full Tool Probe Table

| Tool | Reachable | Latency | Result |
|------|-----------|---------|--------|
| `get_system_status` | ✅ | — | Full health; BUGs/ISSUEs confirmed above |
| `get_cycle_bootstrap(agent_name="news-scout")` | ✅ | 15ms | Works; `agent_name` required (all callers pass it) |
| `get_market_snapshot` | ✅ | <100ms | VN-Index 1824.53 (-0.32%), breadth from 2026-06-19 (weekend expected) |
| `get_macro_snapshot` | ✅ | <100ms | Works; delta fields null (BUG-3 linked) |
| `get_cron_health` | ✅ | — | 70+ jobs healthy; 2 degraded (sbvRates 98.2%, bctcReparse 97%) |
| `get_vps_service_health` | ✅ | — | vn-bctc-fetch UNHEALTHY (4d+); vn-sbv-fetch UNHEALTHY (44m—restart loop) |
| `get_vps_proxy_health` | ✅ | — | bctc STALE 5 days (BUG-1 confirmed); sbv active (17 pushes/24h) |
| `get_sla_status` | ✅ | — | bctc CRITICAL 6442/2855 min; all others OK |
| `get_earnings_calendar` | ✅ | — | 41 tickers; 11 QUÁ HẠN |
| `get_pipeline_health` | ✅ | — | 6 tickers TA not ready; 5 oversold signals |
| `get_ism_subcomponents` | ✅ (error payload) | — | no_data — BUG-4 re-confirmed |
| `get_supply_chain_exposure` | ✅ (stale) | — | Returns BDI 2026-04-07 (75 days stale) — ISSUE-5 |
| `get_watchlist` | ✅ | — | 41 tickers; 6 N/A (HNX/UPCOM expected off-hours) |
| `task_list_held` | ✅ | — | 5 locks (cowork-leader-lock active; esc-datacov:FPT:Q1 held since ~Jun 16, no heartbeat) |
| `get_recent_fixes` | ✅ | — | Last 20 fixes checked; none resolve current BUGs |
| `get_macro_snapshot` (carry/yield) | ✅ | — | Carry spread 1.37pp NEUTRAL; yield spread 3.2pp CHEAP (equity favored) |

---

## Orphan Lock Note

`task_list_held` shows: `esc-datacov:FPT:Q1-2026:ESC-3` (bctc-analyst, claimed ~2026-06-16, heartbeat_at = claimed_at, expires 2026-06-24). No heartbeats since claim — possible orphan from the BCTC pipeline outage period. Expires naturally on June 24 without action needed. Monitor: if it blocks next bctc-analyst cycle, use `task_force_release_orphan`.

---

## Cross-check: `get_recent_fixes` vs active BUGs

None of BUG-1 through BUG-4 appear in last 20 fixes. ISSUE-5 (BDI staleness) not previously logged as a fix. All active BUGs are persistent unresolved issues.

---

_Report generated: 2026-06-21 08:06 UTC_
