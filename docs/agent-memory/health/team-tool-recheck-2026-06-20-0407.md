# Team MCP Tool Health Recheck — 2026-06-20T04:07Z

**Probe window:** 2026-06-20T04:00Z – 2026-06-20T04:07Z  
**Gateway:** `vn-market` via `mcp__gateway__call_tool` — **REACHABLE** ✅  
**Probed tools:** 20 read-only calls + 2 task_claim/task_release round-trip  
**Prior report:** `team-tool-recheck-2026-06-20-0205.md`  
**Report path:** `docs/agent-memory/health/team-tool-recheck-2026-06-20-0407.md`  
**Server uptime:** ~9h (restarted 2026-06-19T19:04Z)  
**VN trading window:** CLOSED — Saturday (weekend); HNX/UPCOM N/A is expected  

---

## Summary

| Class | Count |
|-------|-------|
| BUG (broken, ≥1 affected caller, re-confirmed) | 3 |
| ISSUE (degraded/failing subsystem) | 4 |
| IMPROVE (doc drift / 0 broken callers) | 5 |
| RESOLVED this cycle | 0 |

**Telegram alert:** YES — bug channel (3 active BUGs with callers affected)

---

## STEP 3c — Re-probe Table (mandatory fresh run)

All findings from prior report re-probed this cycle before carry-forward decision.

| Prior Finding | Re-probe command (this cycle) | Result |
|---|---|---|
| BUG-HNX (HNX/UPCOM during trading hours) | `get_system_status` recent errors (04:03Z) | `[hnx] all UPCOM/HNX price sources failed` — 10 occurrences at 04:00–04:02Z. **WEEKEND PROBE**: Today is Saturday 2026-06-20. VN market CLOSED. HNX failures on Saturday are EXPECTED (no trading). CB stays 0 (correct). **RECLASSIFIED: NON-ISSUE for this Saturday cycle.** |
| BUG-2 (ISM no_data) | `get_ism_subcomponents({})` at 04:07Z | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob (requires FRED_API_KEY)."}` — **CONFIRMED ONGOING** |
| BUG-3 (BCTC VPS pipeline) | `get_vps_service_health` + `get_vps_proxy_health` + `get_sla_status` at 04:03Z | `vn-bctc-fetch: unhealthy, 0ms response` · `bctc STALE, last push 2026-06-16 18:02:24, 0 pushes/24h` · SLA breach: 4762 min / 1175 min threshold = CRITICAL (was 4642 at 02:05Z — **+120 min in 2h, worsening**). BCTC data shown as `79.4h old` in get_system_status. — **CONFIRMED WORSENING** |
| BUG-4 (SBV zero-value rejections) | `get_system_status` recent errors at 04:03Z | `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` at 04:01:02Z — **CONFIRMED ONGOING** |
| ISSUE-1 (Reuters RSS) | `get_system_status` source health at 04:03Z | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 90 ⚠` — was 71 at 02:05Z (+19 in 2h, still incrementing). CB near counter limit. — **CONFIRMED ONGOING** |
| ISSUE-2 (Trading Economics ×2) | `get_system_status` source health at 04:03Z | Both TE entries `Ngưng \| Chưa bao giờ \| 90 ⚠` — same +19 delta. — **CONFIRMED ONGOING** |
| ISSUE-6 (vnstockTradingStatsRefresh slow) | `get_cron_health` at 04:03Z | `success_rate: 85.7% (7 runs), avg_duration: 649220ms` — **UNCHANGED** |
| ISSUE-7 (News SLA breach) | `get_sla_status` at 04:03Z | `news: 8/30min OK` — **RESOLVED for this cycle** (market closed, news flowing normally) |
| IMPROVE-1 (get_bctc_pending_refine unbounded) | Not re-probed (stable doc issue) | CARRY |
| IMPROVE-2 (fb-market-poster doc stale) | Flow file read: `docs/agents/fb-market-poster/flow/main.md:31–36` shows `<!-- FIX-CYCLE-BOOTSTRAP-AGENT-ENUM-SSOT -->` comment — flow correctly does NOT call `get_cycle_bootstrap`. Package doc (`fb-market-poster.md:26`) still says `agent_name: "fb-market-poster"`. Live probe: `get_cycle_bootstrap({"agent_name":"fb-market-poster"})` → `MCP error -32602: invalid_enum_value` (confirmed). 0 runtime callers broken (flow fixed). Doc lag only. | CARRY as IMPROVE |
| IMPROVE-3 (emit_pressure_state stale) | Not re-probed this cycle | CARRY |
| IMPROVE-4 (digest W25 legacy keys) | Not re-probed | CARRY |
| IMPROVE-5 (system-map watchlist drift) | Not re-probed | CARRY |

---

## ACTIVE BUGs — Re-confirmed this cycle (≥1 affected caller)

### BUG-2 — `get_ism_subcomponents` no_data (FRED_API_KEY not set)

**Class:** BUG | **Severity:** HIGH  
**Re-probe:** `get_ism_subcomponents({})` at 04:07Z  
```json
{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob (requires FRED_API_KEY)."}
```
**Caller-surface verified:**  
```
grep -rn "get_ism_subcomponents\|ISM" docs/agents/*/flow/*.md → market-watcher/flow/cycle.md, unified-agent/flow/chef.md, bctc-analyst
```
Affected: `market-watcher` (macro regime block), `unified-agent` (chef.md TNB Layer 3 macro), `bctc-analyst` (macro context). ISM PMI, new-orders, employment, prices-paid components all returning `no_data`. Agents substituting with partial macro data.  
**Suggested fix:** Set `FRED_API_KEY` env var in mcp-server container config, then run `macroIndicatorRefreshJob` once to backfill `fred_series_daily`.

---

### BUG-3 — BCTC VPS pipeline: `vn-bctc-fetch` UNHEALTHY (WORSENING — 79.4h stale)

**Class:** BUG | **Severity:** CRITICAL  
**Re-probe at 04:03Z:**
```
get_vps_service_health:
  vn-bctc-fetch | unhealthy | 4m ago | 0ms | 3d 9h 57m uptime

get_vps_proxy_health:
  bctc | 2026-06-16 18:02:24 | 1 item | ok | 0 (24h) | STALE YES

get_sla_status:
  bctc | 4762 min old | SLA 1175 min threshold | breached CRITICAL
  (was 4642 min at 02:05Z → +120 min in 2h — worsening)
```
Service has 3d+ uptime but is not pushing — likely BCTC portal URL/auth changed, not a service crash. No fix in `get_recent_fixes` (last BCTC fix: 2026-04-29).  
**Caller-surface verified:**  
```
grep -rn "bctc\|push_bctc_refined_unit\|get_bctc" docs/agents/bctc-analyst/flow/cycle.md docs/agents/refine_bctc_md/flow/main.md
```
2 primary callers directly blocked: `bctc-analyst` (Q1-2026 pending queue stalled), `refine_bctc_md` (BCTC refine pipeline no fresh input). 11 tickers QUÁ HẠN per `get_earnings_calendar` (BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH).  
**Suggested fix:** SSH to VPS → `journalctl -u vn-bctc-fetch -n 50`. Service alive (3d+ uptime) but not pushing — investigate BCTC portal URL or auth token change. Restart service and monitor push log.

---

### BUG-4 — SBV fetch zero-value rejections (persistent every 30 min)

**Class:** BUG | **Severity:** HIGH  
**Re-probe at 04:03Z:**
```
get_system_status recent errors:
  [ERROR] 2026-06-20 04:01:02  sbv: [sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row
```
`get_vps_service_health`: `vn-sbv-fetch: healthy` — service is UP and pushing. VPS is reaching the SBV portal and returning data, but the fetched value is zero (parse fail or portal change). DB guard correctly blocks overwrite. `get_sla_status` shows `sbv_fx: ok` — this is a **FALSE GREEN** (tracks VPS push arrival, not DB write success). Cached SBV rates may be stale by unknown duration.  
**Caller-surface verified:**  
```
grep -rn "get_macro_snapshot\|sbv\|usd_vnd\|carry_trade" docs/agents/*/flow/main.md docs/agents/*/flow/cycle.md
```
24+ cowork agent calls via `get_macro_snapshot` (used in `get_cycle_bootstrap` → all 9 cowork agents). USD/VND rate, SBV deposit rate for carry-trade and yield-spread signals affected.  
**Suggested fix:** SSH to VPS → `journalctl -u vn-sbv-fetch -n 20`. Capture raw SBV portal response to identify what parse returns zero (e.g. HTML change, encoding issue, wrong column index).

---

## ACTIVE ISSUEs — Degraded but not blocking

### ISSUE-1 — Reuters RSS: 90 consecutive failures, never succeeded

**Class:** ISSUE | **Severity:** MEDIUM  
**Re-probe at 04:03Z:** `Reuters RSS | Ngưng | Chưa bao giờ | 90 ⚠` (was 71 at 02:05Z)  
Per fix log #7 (2026-04-30): `vn-reuters-fetch.service` was intentionally decommissioned (dead URLs). But mcp-server's direct RSS CB still alive and incrementing toward CB ceiling. Not blocking any critical path (VnEconomy/VnExpress/CafeF provide domestic news) but reduces international macro coverage.  
**Suggested fix:** Disable Reuters RSS source entry in mcp-server source config (or mark it `disabled` instead of letting the CB accumulate noise). Feed is confirmed dead since April.

---

### ISSUE-2 — Trading Economics (×2): 90 consecutive failures, never succeeded

**Class:** ISSUE | **Severity:** MEDIUM  
**Re-probe at 04:03Z:** Both TE entries `Ngưng | Chưa bao giờ | 90 ⚠`  
`macroIndicatorRefreshJob` runs at 100% success via alternative sources (IMF, Yahoo Finance, SBV). Core macro data IS flowing. TE-specific fields (more granular commodity + PMI series) are unavailable. The `TRADING_ECONOMICS_API_KEY` env var may not be set (referenced in system-auditor flow C-09 note). Chromium scrape path may also have regressed post-restart.  
**Suggested fix:** Verify `TRADING_ECONOMICS_API_KEY` in mcp-server env. If absent/intentional, disable TE source in config rather than letting CB accumulate failures.

---

### ISSUE-6 — `vnstockTradingStatsRefresh`: 85.7% success, avg 649s

**Class:** ISSUE | **Severity:** LOW  
**Re-probe at 04:03Z:** `success_rate: 0.86 (85.7%), total_runs: 7, avg_duration: 649220ms`  
Average run time (649s ≈ 10.8 min) is dangerously close to the 15-min cron window. 1 in 7 runs fails. Missing run = incomplete trading stats for some tickers that session.  
**Suggested fix:** Profile the ticker loop for N+1 HTTP requests. Batch or parallelize per-ticker calls. Consider reducing to daily frequency instead of per-session.

---

### ISSUE-7 — `bctcReparseJob`: 89.7% success rate (87 runs)

**Class:** ISSUE | **Severity:** LOW  
**Re-probe at 04:03Z:** `success_rate: 0.90 (89.7%), total_runs: 87, avg_duration: 161013ms`  
~10 out of 87 BCTC reparse runs have failed. Avg duration 161s. Given BCTC pipeline is also stalled (BUG-3), these failures may be compounding (no fresh PDFs to reparse → job errors on empty input).  
**Suggested fix:** Check bctcReparseJob error logs for root cause. Likely related to BUG-3 (no fresh BCTC data). Will self-heal once BUG-3 is resolved. Add graceful empty-input handling to avoid counting no-op as failure.

---

## IMPROVEments (0 broken runtime callers)

| # | Component | Evidence | Caller Count | Fix |
|---|---|---|---|---|
| IMPROVE-1 | `get_bctc_pending_refine` unbounded default | No `limit` arg returns all pending items — this cycle returned 235K chars / 11,948 lines (saved to tool-results file). Callers in flow files use `{limit:1}` correctly. | 0 broken callers | Add server-side default `limit=10`. |
| IMPROVE-2 | `fb-market-poster` tool package doc stale | `docs/agents/tools/package/fb-market-poster.md:26` still lists `get_cycle_bootstrap(agent_name:"fb-market-poster")`. Flow file correctly removed this call (FIX-CYCLE-BOOTSTRAP-AGENT-ENUM-SSOT comment at line 31–36). Live probe: enum rejection confirmed. | 0 runtime callers broken (flow fixed) | Update package doc: remove `get_cycle_bootstrap` row; note STEP 0 uses `log_agent_work` + bash date only. |
| IMPROVE-3 | `emit_pressure_state` cycle_snapshot_promoted:false | Cowork telemetry reading stale pressure snapshot. Cowork dispatcher tick-snapshot step may not be running. | cowork-team telemetry | Investigate why cycle_snapshot_promoted stays false. |
| IMPROVE-4 | Digest dedup legacy keys W24/W25 still held | `published:digest-sunday:2026-W25` + `2026-W24` old-format keys in task_list_held (expire 2026-06-22). Flow uses periodKey correctly — no collision risk. | 0 affected | No immediate action; confirm existing fix in place. |
| IMPROVE-5 | system-map.json watchlist drift | `get_watchlist` returns 41 tickers; system-map.json `.watchlist` has ~34 active entries. | PM/agents using system-map.json | PM to sync system-map.json watchlist with live `get_watchlist` output. |

---

## RESOLVED (not applicable — no new resolutions this cycle)

BUG-HNX from 02:05Z report: **RECLASSIFIED as NON-ISSUE** for this probe. Today is Saturday 2026-06-20 (weekend). VN market is closed. HNX/UPCOM price source failures at 04:00–04:02 UTC on Saturday are expected behavior. Circuit breaker correctly stays at 0 failures (failures excluded from CB on weekends). Will need re-verification on Monday 2026-06-23 02:00 UTC.

---

## Healthy Tools — Spot-checked this cycle

| Tool | Status | Notes |
|------|--------|-------|
| `get_system_status` | ✅ | Full health returned; content-level BUGs noted above |
| `get_market_snapshot` | ✅ | VN-Index 1824.53 (last trading session); breadth 81/203/66 |
| `get_macro_snapshot` | ✅ | Tool functional; SBV on cached fallback (BUG-4); TE fields dark (ISSUE-2) |
| `get_market_context` | ✅ | Full watchlist + alerts returned correctly |
| `get_cycle_bootstrap` | ✅ | `agent_name="market-watcher"` → returns all 3 sections in 11ms |
| `get_cycle_bootstrap (fb)` | ❌ | `agent_name="fb-market-poster"` → enum rejection (IMPROVE-2, flow fixed) |
| `get_earnings_calendar` | ✅ | 41 tickers; 11 QUÁ HẠN reflect BUG-3 |
| `get_cron_health` | ✅ | 60+ jobs; all ≥80% success rate floor. Min: vnstockTradingStatsRefresh 85.7% (ISSUE-6) |
| `get_pipeline_health` | ✅ | TA ready 37/42 tickers; 5 with 0 rows (weekend + HNX/UPCOM expected) |
| `get_vps_proxy_health` | ✅ (tool) | prices/news/sbv OK; bctc STALE (BUG-3) |
| `get_vps_service_health` | ✅ (tool) | news/sbv healthy; price/ff idle (weekend OK); bctc unhealthy (BUG-3) |
| `get_sla_status` | ✅ | Correctly reports bctc CRITICAL, others ok |
| `get_rate_limit_status` | ✅ | 14 sources, all ready (0 in backoff) |
| `get_recent_fixes` | ✅ | 20 fixes returned; newest: 2026-05-12 |
| `get_agent_signals` | ✅ | from_agent=null + status="all" + hours_back=0.25 → returns all-producers mode correctly |
| `get_watchlist` | ✅ | 41 tickers with prices/thresholds |
| `task_claim` / `task_release` | ✅ | Round-trip OK (kind=cowork-slot) |
| `task_heartbeat` | ✅ | Returns `{ok:false, expires_at:0}` for non-existent task (graceful) |
| `send_telegram` | ✅ (schema) | Param = `message` (not `text`). All flow call sites use correct param. |
| `get_ism_subcomponents` | ❌ | `no_data` — FRED_API_KEY missing (BUG-2) |
| `get_bctc_pending_refine` | ⚠️ (tool) | Returns unbounded payload (235K chars); callers use `limit:1` correctly (IMPROVE-1) |

---

## Source Health Snapshot (get_system_status — 04:03Z)

| Source | Status | Consecutive Failures |
|--------|--------|----------------------|
| bloomberg | OK | 0 |
| CafeF RSS | Degraded | 1 |
| newsapi | disabled | 0 |
| nld | OK | 0 |
| nhandan | OK | 0 |
| **Reuters RSS** | **Stopped** | **90 ⚠** |
| **Trading Economics ×2** | **Stopped** | **90 ⚠ each** |
| VnEconomy RSS | Degraded | 1 |
| VnExpress RSS | Degraded | 1 |
| sbv (circuit breaker) | OK (0 CB failures) | 0 — but zero-value parse rejections ongoing (BUG-4) |

*Note: CafeF/VnEconomy/VnExpress "Degraded" with 1 failure each is normal transient — they succeed within the next cycle.*
