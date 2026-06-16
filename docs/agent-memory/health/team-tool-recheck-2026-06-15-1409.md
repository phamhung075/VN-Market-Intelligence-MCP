# Team MCP Tool Health Recheck — 2026-06-15 14:09 UTC

**Run by:** health-recheck agent (scheduled)
**Gateway:** `claude.ai gateway → vn-market`
**Probe window:** 2026-06-15 14:03–14:09 UTC (VN market CLOSED — Sunday)
**Method:** Read-only smoke calls + schema validation + caller-surface grep. No live-state writes.
**Prior report:** `team-tool-recheck-2026-06-15-1207.md` (2h delta)

---

## Gateway Reachability

| Check | Result |
|---|---|
| Gateway transport | **REACHABLE** — `mcp__gateway__call_tool` schema loaded |
| vn-market server | **UP** — uptime 2h 15m 31s (restarted 11:48:28 UTC); Telegram env SET |
| MCP error class | Input-validation errors returned correctly (transport alive) |

---

## STEP 3c — Prior-Report Delta (all re-probed this cycle)

| Prior ID | Finding | Re-probe command / output this cycle | Delta |
|---|---|---|---|
| BUG-1 | `vnstockTradingStatsRefresh` crash 50% | `get_cron_health`: `last_status=crashed`, `success_rate=0.50`, `total_runs=2`, `avg_duration=2,754,485ms` — identical | **ONGOING** |
| BUG-2 | BCTC pipeline dead (SLA CRITICAL) | `get_sla_status`: `bctc 1925/360min CRITICAL`; `get_vps_proxy_health`: bctc STALE last push 2026-06-13 23:45; `get_bctc_full("VCB")` → "Chưa có dữ liệu BCTC" | **ONGOING, WORSENED** (+118min since 12:07) |
| ISSUE-1 | High server restart rate | `get_cron_health`: `mcpServerStartup total_runs=26` (stable since 12:07) | **ONGOING (stable)** |
| ISSUE-2 | WTI crude stale/inverted vs Brent | `get_system_status`: `wti_crude_usd=95.5` vs `brent_crude_usd=83.15` — $12.47 inverted | **ONGOING** |
| ISSUE-3 | Reuters RSS + Trading Economics degraded | `get_system_status`: Reuters `Ngưng | Chưa bao giờ | 22 errors`; TradingEconomics `Ngưng | Chưa bao giờ | 22 errors × 2` — failure count grew from 4→22 since post-restart at 11:48 | **WORSENED** |
| IMPROVE-1 | `get_cycle_bootstrap` legacy enum | Probe confirmed `financial-analyst \| report-analyzer` still in schema | **ONGOING** |
| IMPROVE-2 | 5 dark watchlist tickers (0 OHLCV rows) | `get_pipeline_health`: BDI/DLC/JSH/SIS/VDC rows=0, TA not ready | **ONGOING** |
| IMPROVE-3 | macroIndicatorRefreshJob timezone docs | Static doc issue; no change expected | **ASSUMED ONGOING** |

---

## Active Findings

### BUG-1 (ONGOING) — `vnstockTradingStatsRefresh` crash: 50% success, 45.9-min runtime

| Field | Value |
|---|---|
| Class | **BUG** |
| Cron | `vnstockTradingStatsRefresh` |
| Evidence | `get_cron_health`: `last_status: crashed`, `success_rate: 0.50 (50.0%)`, `total_runs: 2`, `avg_duration: 2,754,485 ms` |
| Last crash | 2026-06-15 08:30:01 UTC |
| Delta | No change from 12:07 report — 0 new runs, still crashed |
| Caller-surface | `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts:314` — `runVnstockTradingStatsJob` sweeps full watchlist via Python vnstock bridge; reads `readWatchlistTickers()` and calls `syncVnstockData` per ticker. 3 agents consume: market-watcher, bctc-analyst, unified-agent |
| Blast radius | `vnstock_trading_stats` table not refreshed on crash days; downstream: `get_sector_comparison`, `get_market_cap`, `get_company_profile` |

**Suggested fix:** Add per-ticker timeout in `syncVnstockData.ts` trading_stats path (Python subprocess can hang on vnstock API). Add a job-level `AbortSignal.timeout(600_000)` guard around `runSweep`. Check overlap with `vnstockFundamentalsRefresh` (665,597ms avg) — resource contention likely cause.

---

### BUG-2 (ONGOING, WORSENED) — BCTC pipeline dead: SLA 1925/360min CRITICAL

| Field | Value |
|---|---|
| Class | **BUG** |
| Evidence (SLA) | `get_sla_status`: `bctc \| 1925 min \| 360 min SLA \| CRITICAL` (age +118min vs 12:07) |
| Evidence (VPS proxy) | `get_vps_proxy_health`: `bctc \| 2026-06-13 23:45:12 \| 0 pushes 24h \| STALE: YES` |
| Evidence (data) | `get_bctc_full("VCB")` → `"Chưa có dữ liệu BCTC"` — VCB filed Q1-2026 on 2026-06-13 per `get_earnings_calendar` but DB shows no data |
| Evidence (enricher) | `get_system_status` recent errors: `bctcQueueEnricher: 0 URLs found for ticker X × 9 tickers; 0 URLs populated across all 9 item(s)` — recurring every 15 min |
| VPS service | `get_vps_service_health`: `vn-bctc-fetch: healthy` — VPS service UP but returning 0 URLs (silent-failure pattern) |
| Note on SLA threshold | `get_sla_status` shows 360 min (6h) threshold; `system-map.json` says `stale_threshold_hours=168` (7d) out of earnings window (month=6 not in [1,4,7,10]). SLA tool threshold is hardcoded tighter than system-map — separate IMPROVE finding. Real issue: VCB filed but not in DB. |
| Caller-surface | `docs/agents/tools/package/bctc-analyst.md`, `unified-agent.md`, `digest-predict.md` — 3 agents confirmed. `bctc-analyst/flow/main.md` is primary consumer (all 6 passes). |

**Diagnosis:** `bctcQueueEnricher` returns 0 URLs for the 9 overdue tickers (haven't filed Q1 yet — expected). But for the 27 tickers that DID file (including VCB on 2026-06-13), the enrich→PDF pull→extract pipeline is apparently not processing them into `financial_reports`. VPS is healthy; SSC discover route may be geo-blocking the VPS or returning empty for filed tickers.

**Suggested fix:**
1. SSH VPS → `curl /proxy/bctc-discover/VCB` to distinguish geo-block vs empty-scrape
2. Call `trigger_bctc_vps_fetch` to force a discovery cycle
3. Add data-quality gate in `bctcQueueEnricherJob`: if 0 URLs for tickers known to have filed → BUG telegram

---

### BUG-NEW-1 (NEW THIS CYCLE) — `system-auditor` calls `post_agent_signal` with wrong schema

| Field | Value |
|---|---|
| Class | **BUG** |
| Evidence | Probe `post_agent_signal({type:"system_health_report", tier:3, summary:{...}, checks:{...}, overall:"HEALTHY"})` → `MCP error -32602: Input validation error: from_agent required, to_agent required, signal_type required (enum), payload required` |
| Schema drift | System-auditor flow uses params `{type, ts, tier, summary, checks, overall, new_anomalies, dedup_skipped}`. Live tool requires `{from_agent, to_agent, signal_type∈enum, payload:{title,detail}}`. No overlap. |
| Affected call sites in flow | `system-auditor/flow/main.md` line ~509 (Tier-3 Roll-Up); line ~193 (Tier-2 E-1 emit); line ~480 (Tier-3 E-1 emit) — 3 sites total |
| Caller-surface grep | `grep -r "post_agent_signal" docs/agents/system-auditor/` → confirmed in flow/main.md at all 3 emit blocks. News agents (`news-scout`, `market-watcher`) use correct schema (`from_agent`, `to_agent`, `signal_type: chain_catalyst`). |
| Impact | Every `post_agent_signal` call from system-auditor fails with MCP error. Per flow C-2 path: agent hits bug-telegram, skips commit, exits. All system health anomaly signals (data_stale, db_integrity_breach, system_health_report types) are NEVER written to the agent coordination bus. Anomalies invisible to other agents. |
| Tool purpose mismatch | `post_agent_signal` is a news/price coordination signal bus (`chain_catalyst`, `urgent_news`, `price_anomaly`, etc.) — NOT an infrastructure health signal bus. System-auditor needs a different tool or the flow must be rewritten to map infra signals to valid signal_types. |

**Suggested fix (dev-mcp-server):** Either:
- Option A: Rewrite system-auditor flow to use `log_agent_work` for health summaries + valid `post_agent_signal` types (e.g., `signal_type: "price_anomaly"` with mapped payload) for anomalies that warrant it.
- Option B: Add infra-health signal types (`data_stale`, `db_integrity_breach`, `system_health_report`) to `post_agent_signal` schema with relaxed payload validation for infra context.
- Option C (recommended): Update system-auditor flow/main.md to match the actual live schema: replace `{type, ts, tier, summary}` with `{from_agent:"system-auditor", to_agent:"all", signal_type:"chain_catalyst", payload:{title:"...", detail:"..."}}`.

---

## Issues (degraded / not broken)

### ISSUE-1 (ONGOING) — High server restart rate: 26 restarts in 7 days

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Evidence | `get_cron_health`: `mcpServerStartup: total_runs=26`; latest: 11:48:28 UTC today |
| Rate | ~3.7 restarts/day over 7-day window; stable since 12:07 report |

**Impact:** Cron state resets on restart; once-daily jobs risk missing their fire window. Circuit breaker failure counters reset on restart (obscuring persistent external failures — Reuters/TE failure count reset at 11:48, grew back to 22 by 14:04 UTC).

---

### ISSUE-2 (ONGOING) — WTI crude price stale: $12.47 inverted vs Brent

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Evidence | `wti_crude_usd=95.5 (79 data points)` vs `brent_crude_usd=83.15 (23 data points live)` |
| Normal spread | WTI typically $2–5 BELOW Brent; current $12.47 ABOVE is physically impossible |

**Impact:** Any macro analysis reading `wti_crude_usd` from DB auto-tracker gets a materially wrong price. `get_macro_snapshot` uses Brent correctly (tier-1 live); issue is in the stored `wti_crude_usd` indicator row.

---

### ISSUE-3 (WORSENED) — Reuters RSS + Trading Economics: 22 consecutive failures

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Evidence | `get_system_status` source health: `Reuters RSS: Ngưng | Chưa bao giờ | 22 errors`; `Trading Economics: Ngưng | Chưa bao giờ | 22 errors × 2` |
| Delta | Was 4 failures at 12:07 (post-restart counter reset). Now 22 = every cycle since 11:48 restart failed = ~85 min of continuous failure |
| Code path | `newsHeadlinesRefreshJob.ts:142` → `fetchFromNewsFetch('/reuters/headlines')` → news-fetch container `ReutersRssScraper` → `https://news.google.com/rss/search?q=reuters+business+news` (FETCH_TIMEOUT_MS=10000) |
| Source | `apps/news-fetch/src/infrastructure/scrapers/reuters-rss.ts:34` — Google News RSS URL, 10s timeout |

**Impact:** Reuters headline ingestion stopped. Bloomberg still working (OK in source health). TradingEconomics macro data not ingesting; mitigated by SBV/Yahoo/IMF paths covering core macro indicators (C-09 passes at ≥3 threshold).

**Suggested fix:** Check if Google News RSS URL is geo-blocked from main server. Try `curl -A "Mozilla/5.0..." "https://news.google.com/rss/search?q=reuters+business+news"` from inside the news-fetch container to isolate. Consider adding a stealth fallback path that already exists (`reuters-stealth.ts`).

---

## Improvements

### IMPROVE-1 (ONGOING) — `get_cycle_bootstrap` enum contains legacy agent names

| Field | Value |
|---|---|
| Class | **IMPROVE** |
| Evidence | Schema error still shows `financial-analyst \| report-analyzer` in `agent_name` enum |
| Caller-surface verified | `grep -r "financial-analyst\|report-analyzer" docs/agents/*/flow/` → 0 active flow callers |
| Risk | Low — no active caller; schema drift confuses new agent integrations |

**Action:** Remove `financial-analyst` and `report-analyzer` from enum in `get_cycle_bootstrap` tool schema.

---

### IMPROVE-2 (ONGOING) — 5 watchlist tickers with 0 OHLCV rows (TA dark)

| Field | Value |
|---|---|
| Class | **IMPROVE** |
| Evidence | `get_pipeline_health`: BDI=0, DLC=0, JSH=0, SIS=0, VDC=0 — all "TA not ready" |
| Exchanges | BDI=HNX, DLC=UPCOM, JSH=HNX, SIS=HOSE, VDC=UPCOM |

**Impact:** TA alerts (RSI/MACD/BB) disabled for 5/41 watchlist tickers (12%). RSI signals from these tickers absent from alert-commander analysis.

---

### IMPROVE-3 (ONGOING) — `macroIndicatorRefreshJob` schedule docs timezone confusion

| Field | Value |
|---|---|
| Class | **IMPROVE** |
| Evidence | `system-map.json` says `"19:13 UTC daily"` but `get_cron_health` shows `last_run=12:13 UTC` (12:13 UTC = 19:13 VN UTC+7) |

**Action:** Update `system-map.json` to `"12:13 UTC (19:13 VN)"`.

---

### IMPROVE-NEW-1 (NEW) — `get_sla_status` BCTC threshold (6h) mismatches system-map (7d out-of-earnings-window)

| Field | Value |
|---|---|
| Class | **IMPROVE** |
| Evidence | `get_sla_status`: `bctc SLA = 360 min (6h)`. `system-map.json` `.data_sources[bctc-discover].stale_threshold_hours = 168` (7d default) with earnings-window override to 24h only in months [1,4,7,10]. June = month 6 → out of window → effective threshold = 168h. 38h stale < 168h = NOT actually breached. |
| Impact | `get_sla_status` reports false CRITICAL for BCTC on every non-earnings-window day. System-auditor Tier-2 reads this and files false anomaly signals. |

**Action:** Align `get_sla_status` BCTC threshold to the SLA resolver logic from system-map.json (168h default, 24h in earnings window).

---

### IMPROVE-NEW-2 (NEW) — `vn-sbv-fetch` VPS service shows "unhealthy" while SBV data flows normally

| Field | Value |
|---|---|
| Class | **IMPROVE** |
| Evidence | `get_vps_service_health`: `vn-sbv-fetch \| unhealthy \| 44m uptime`; yet `get_vps_proxy_health`: `sbv \| 2026-06-15 13:57 \| ok \| 28 pushes/24h \| 0 errors` |
| Known issue | `recent_fixes` #15: "idle status violates vps_service_health CHECK constraint" — recurring false-positive |
| Caller-surface | System-auditor Tier-2 reads `get_vps_service_health`; false-unhealthy triggers false CRITICAL for sbv route |

**Action:** Fix the health-status state machine in `vpsHealthPoller.ts` to not show "unhealthy" when push logs confirm data flow. Was flagged in TASK 1403 (recent_fixes #15) but not yet fixed.

---

## Non-Issues (verified false-positives this cycle)

| Finding | Probe | Conclusion |
|---|---|---|
| SLA news breached (59/30 min) | `get_vps_proxy_health`: news last push 14:00:03 UTC (3 min before probe). `get_cron_health`: newsHeadlinesRefreshJob 14:00:02 OK | **FALSE POSITIVE** — SLA threshold (30 min) too tight for Sunday off-hours; actual freshness is ~3 min |
| SLA sbv_fx breached (49/30 min) | `get_vps_proxy_health`: sbv last push 13:57:17 UTC (7 min before probe); 28 pushes/24h, 0 errors | **FALSE POSITIVE** — same 30-min tight threshold; actual freshness is 7 min |
| `bctcQueueEnricher` 0-URL WARNs (9 tickers) | `get_earnings_calendar`: all 9 affected tickers show "QUÁ HẠN" — they haven't filed Q1-2026 yet | **EXPECTED BEHAVIOR** — no URLs exist because reports don't exist; noise but not a bug |

---

## Tool Probe Summary

| Tool | Status | Notes |
|---|---|---|
| `get_cycle_bootstrap` | ✅ OK | Required `agent_name` param — correctly schema-validated |
| `get_system_status` | ✅ OK (warnings) | Reuters/TE degraded; 10 bctcQueueEnricher WARNs |
| `get_market_snapshot` | ✅ OK | VN-Index 1799.31 +0.43%, tier-2, 38ms |
| `get_macro_snapshot` | ✅ OK | Carry NEUTRAL, yield CHEAP (tier-2 live) |
| `get_agent_signals` | ✅ OK | 6 chain_catalyst signals from news-scout (today) |
| `get_watchlist` | ✅ OK | 41 tickers returned |
| `get_earnings_calendar` | ✅ OK | 27 ĐÃ NỘP, 14 QUÁ HẠN |
| `get_cron_health` | ✅ OK (warnings) | `vnstockTradingStatsRefresh` crashed; all others ≥80% |
| `get_vps_proxy_health` | ✅ OK (BCTC stale) | prices/news/sbv/ff OK; bctc stale 38h |
| `get_vps_service_health` | ⚠️ FALSE POSITIVE | vn-sbv-fetch "unhealthy" contradicted by push logs |
| `get_pipeline_health` | ✅ OK (5 dark) | 36/41 tickers TA ready; 5 rows=0 |
| `get_sla_status` | ⚠️ 3 false positives | news/sbv_fx Sunday off-hours; BCTC threshold hardcoded vs system-map |
| `get_rate_limit_status` | ✅ OK | 12 sources ready, 0 throttled |
| `task_list_held` | ✅ OK | 8 held locks (all published-marker dedup, expected) |
| `get_bctc_full` | ❌ EMPTY | "Chưa có dữ liệu BCTC" for VCB — confirms BUG-2 |
| `post_agent_signal` | ❌ SCHEMA DRIFT | MCP -32602: from_agent/to_agent/signal_type/payload required; system-auditor flow uses wrong contract — BUG-NEW-1 |

---

## Resolved This Cycle

| Prior ID | Finding | Proof |
|---|---|---|
| BUG-2 (prior name) | `bctcReparseJob` below 80% | `get_cron_health`: 80.1% (176 runs) — above threshold ✅ |
| IMPROVE-1 (prior) | `get_market_hexagram` not found | Confirmed resolved in 12:07 report ✅ |

---

## Active Finding Tally

| Class | Count | Items |
|---|---|---|
| **BUG** | 3 | `vnstockTradingStatsRefresh` crash; BCTC pipeline dead; `post_agent_signal` schema drift in system-auditor |
| **ISSUE** | 3 | Server restart rate (26/7d); WTI crude inverted ($12.47); Reuters/TE 22 consecutive failures |
| **IMPROVE** | 5 | `get_cycle_bootstrap` legacy enum; 5 dark tickers; macroIndicatorRefreshJob docs timezone; `get_sla_status` BCTC threshold mismatch; `vn-sbv-fetch` unhealthy false-positive |

---

## Caller-Surface Verification (STEP 3b)

**BUG-NEW-1 `post_agent_signal` schema drift:**
```
grep -r "post_agent_signal" docs/agents/system-auditor/flow/main.md
→ 3 sites: Tier-3 Roll-Up (~L509), Tier-2 E-1 emit (~L193), Tier-3 E-1 emit (~L480)
grep -r "post_agent_signal" docs/agents/news-scout/flow/ docs/agents/market-watcher/flow/
→ uses correct schema (from_agent, to_agent, signal_type: chain_catalyst/price_anomaly)
Caller count: 1 agent broken (system-auditor), 0 other agents affected
```

**BUG-1 `vnstockTradingStatsRefresh`:**
```
grep -r "vnstock_trading_stats\|trading_stats" apps/mcp-server/src → confirmed:
  assembleBriefing.ts (foreign volume table read)
  IKinhDichScoreRepository.ts (getLatestTradingStats)
Agents: market-watcher, bctc-analyst, unified-agent — 3 agents
```

**BUG-2 BCTC pipeline:**
```
grep "get_bctc" docs/agents/tools/package/*.md → bctc-analyst.md, unified-agent.md, digest-predict.md
Caller count: 3 agents confirmed
```
