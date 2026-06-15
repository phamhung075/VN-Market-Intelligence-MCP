# Team MCP Tool Health Recheck — 2026-06-15 12:07 UTC

**Run by:** health-recheck agent (scheduled)
**Gateway:** `claude.ai gateway → vn-market`
**Probe window:** 2026-06-15 12:04–12:07 UTC (VN market CLOSED, post-session)
**Method:** Read-only smoke calls + schema validation + caller-surface grep. No live-state writes.
**Prior report:** `team-tool-recheck-2026-06-15-1007.md` (2h delta)

---

## Gateway Reachability

| Check | Result |
|---|---|
| Gateway transport | **REACHABLE** — `mcp__gateway__call_tool` schema loaded; `get_system_status` responded in <1s |
| vn-market server | **UP** — uptime 16m29s at first probe (restarted 11:48:28 UTC); Telegram env SET |
| MCP error class | Input-validation errors returned correctly (transport alive) |

---

## STEP 3c — Prior-Report Delta (re-probed this cycle)

| Prior ID | Finding | Re-probe command / output | Delta |
|---|---|---|---|
| BUG-1 | `vnstockTradingStatsRefresh` crash 50% success rate | `get_cron_health`: `last_status=crashed`, `success_rate=0.50`, `total_runs=2`, `avg_duration=2,754,485ms` — identical to prior | **ONGOING** |
| BUG-2 | `bctcReparseJob` below 80% threshold | `get_cron_health`: `success_rate=0.80 (80.1%)`, `total_runs=176` (was 79.9%/174) — 2 successful runs since 10:07 | **BORDERLINE RESOLVED** — above 80% threshold; monitor next cycle |
| BUG-3 | BCTC pipeline dead (SLA CRITICAL) | `get_sla_status`: `bctc 1807/360min CRITICAL`; `get_vps_proxy_health`: bctc STALE, last push 2026-06-13 23:45; `get_bctc_full("VCB")` → "Chưa có dữ liệu BCTC" | **ONGOING, WORSENED** (+120min since 10:07) |
| ISSUE-4 | High server restart rate (23 in 7d) | `get_cron_health`: `mcpServerStartup total_runs=26` (was 23 at 10:07); restart at 11:48 UTC (`mcpServerCleanShutdown last_run=11:48:26, total_runs=2`) | **ONGOING** — 3 more restarts since 10:07 |
| ISSUE-5 | WTI crude price stale/inverted vs Brent | `get_system_status`: `wti_crude_usd=95.5` vs `brent_crude_usd=83.08` — WTI still $12.47 above Brent | **ONGOING** |
| ISSUE-6 | Reuters RSS + Trading Economics degraded | `get_system_status` source health: Reuters "Suy giảm" 4 failures "Chưa bao giờ"; TradingEconomics "Suy giảm" 4 failures "Chưa bao giờ" (counter reset after 11:48 restart, underlying failure persists) | **ONGOING** |
| IMPROVE-1 | `get_market_hexagram` missing from server | `call_tool("get_market_hexagram", {})` → Quẻ 63 — Ký Tế 既濟, full response returned | **RESOLVED** ✅ |
| IMPROVE-2 | `get_cycle_bootstrap` enum contains legacy agent names | Schema validation error still shows `'financial-analyst' \| 'report-analyzer'` in enum | **ONGOING** |
| IMPROVE-3 | 5 watchlist tickers with 0 OHLCV rows | `get_pipeline_health`: BDI/DLC/JSH/SIS/VDC rows=0 confirmed | **ONGOING** |
| IMPROVE-4 | `macroIndicatorRefreshJob` docs timezone confusion | Static docs issue — not re-probed (no change expected) | **ASSUMED ONGOING** |

---

## Active Findings (re-confirmed this cycle)

### BUG-1 (ONGOING) — `vnstockTradingStatsRefresh` crash: 50% success, 46-min runtime

| Field | Value |
|---|---|
| Class | **BUG** |
| Cron | `vnstockTradingStatsRefresh` |
| Evidence | `get_cron_health`: `last_status: crashed`, `success_rate: 0.50 (50.0%)`, `total_runs: 2`, `avg_duration: 2,754,485 ms` |
| Last crash | 2026-06-15 08:30:01 UTC (no new run since) |
| Delta from prior | **No change** — total_runs still 2, same crash state. No fix landed. |
| Affected tools | `get_sector_comparison`, `get_market_cap`, `get_company_profile` (all read from vnstock store) |
| Caller count | 3+ agents: market-watcher, bctc-analyst, unified-agent |

**Suggested fix:** Add timeout guard + chunked batch processing in `syncVnstockData.ts`. Check if `vnstockFundamentalsRefresh` (665,597ms / 11min) creates resource contention when overlapping.

---

### BUG-2 (ONGOING, WORSENED) — BCTC pipeline dead: SLA 1807/360min CRITICAL

| Field | Value |
|---|---|
| Class | **BUG** |
| Evidence (SLA) | `get_sla_status`: `bctc \| 1807/360 min \| breached \| CRITICAL` |
| Evidence (VPS) | `get_vps_proxy_health`: `bctc \| last push 2026-06-13 23:45:12 \| 0 pushes 24h \| STALE: YES` |
| Evidence (enricher) | `get_system_status` errors: `bctcQueueEnricher: 0 URLs found for ticker X` × 9 tickers; `0 URLs populated across all 9 item(s) — all sources may be unavailable or geo-blocked` |
| Evidence (data) | `get_bctc_full(code="VCB")` → `"Chưa có dữ liệu BCTC"` despite VCB filing 2026-06-13 per `get_earnings_calendar` |
| VPS service | `vn-bctc-fetch: healthy` — service UP but not delivering URLs (silent-failure pattern) |
| Worsened | SLA age +120min vs 10:07 report (1807 vs 1687 min) |
| Affected agents | bctc-analyst (all 6 passes blocked), unified-agent (`get_bctc_full` in chef.md), digest-predict |
| Caller count | 3 confirmed package docs: `bctc-analyst.md`, `unified-agent.md`, `digest-predict.md` |

**Diagnosis:** VPS `vn-bctc-fetch` service is alive but `bctcQueueEnricher` returns 0 URLs for all tickers. The BCTC discover route (`/proxy/bctc-discover/:ticker`) is returning empty — either SSC iboard is geo-blocking the VPS or the URL discovery scraper is broken. Jobs report `success` at job level while producing 0 useful output (fail-closed / silent-failure pattern).

**Suggested fix:**
1. SSH VPS → `curl /proxy/bctc-discover/VCB` to distinguish geo-block vs parser failure
2. `trigger_bctc_vps_fetch` to force a discovery cycle
3. Add data-quality gate in `bctcQueueEnricherJob`: if 0 URLs for ≥3 tickers → log ERROR + BUG Telegram alert

---

## Issues (degraded / not broken)

### ISSUE-1 (ONGOING) — High server restart rate: 26 restarts in 7 days

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Evidence | `get_cron_health`: `mcpServerStartup: total_runs=26`; most recent: 11:48:28 UTC (clean shutdown) |
| Delta | 3 additional restarts since 10:07 report (23 → 26) |
| Rate | ~3.7 restarts/day over 7-day window |

**Impact:** Cron state resets on restart; once-daily jobs risk missing their fire window if restart occurs during it. Circuit breaker failure counters also reset (obscuring how long external sources have been failing).

---

### ISSUE-2 (ONGOING) — WTI crude price stale: $12.47 inverted vs Brent

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Evidence | `wti_crude_usd=95.5 (79 data points)` vs `brent_crude_usd=83.08 (23 points)` |
| Normal | WTI typically $2–5 BELOW Brent; currently $12.47 ABOVE |

**Impact:** Any macro analysis reading `wti_crude_usd` from the auto-tracker will use a materially wrong price. `get_macro_snapshot` uses Brent correctly (tier-1 live), so direct macro calls are unaffected; issue is in the DB-stored indicator.

---

### ISSUE-3 (ONGOING) — Reuters RSS + Trading Economics degraded

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Evidence | `get_system_status` source health: `Reuters RSS: Suy giảm, Chưa bao giờ, 4 errors`; `Trading Economics: Suy giảm, Chưa bao giờ, 4 errors × 2` |
| Note | Failure counter reset at 11:48 restart (was 13+ before) but sources still never succeeded |

**Impact:** Reduced macro and international news coverage. TradingEconomics provides CPI/GDP/industrial production for macro-snapshot. Reuters provides global market context for news-scout impact chains.

---

## Improvements (works but suboptimal)

### IMPROVE-1 (ONGOING) — `get_cycle_bootstrap` enum contains legacy agent names

| Field | Value |
|---|---|
| Class | **IMPROVE** |
| Evidence | Schema error on invalid agent: enum still contains `'financial-analyst' \| 'report-analyzer'` (merged into `bctc-analyst` 2026-05-29) |
| Caller-surface | `grep -r "financial-analyst\|report-analyzer" docs/agents/*/flow/` → 0 active flow callers |
| Risk | Low — no active caller uses dead names; schema drift confuses new agent integrations |

**Action:** Remove `financial-analyst` and `report-analyzer` from `agent_name` enum in `get_cycle_bootstrap` tool schema.

---

### IMPROVE-2 (ONGOING) — 5 watchlist tickers with 0 OHLCV rows (TA dark)

| Field | Value |
|---|---|
| Class | **IMPROVE** |
| Evidence | `get_pipeline_health`: `BDI rows=0`, `DLC rows=0`, `JSH rows=0`, `SIS rows=0`, `VDC rows=0` — all `TA not ready` |
| Exchanges | BDI=HNX, DLC=UPCOM, JSH=HNX, SIS=HOSE, VDC=UPCOM |

**Impact:** TA alerts (RSI/MACD/BB) disabled for 5/41 watchlist tickers (12%). `market-watcher` cannot compute signals for these.

---

### IMPROVE-3 (ONGOING) — `macroIndicatorRefreshJob` schedule docs timezone confusion

| Field | Value |
|---|---|
| Class | **IMPROVE** |
| Evidence | `system-map.json` describes `19:13 UTC daily` but `get_cron_health` shows `last_run: 2026-06-14 12:13:00` (12:13 UTC = 19:13 VN UTC+7) |

**Action:** Update `system-map.json` to `"12:13 UTC (19:13 VN)"` to prevent ops confusion.

---

## Resolved This Cycle

| Prior ID | Finding | Proof |
|---|---|---|
| BUG-2 | `bctcReparseJob` below 80% success rate | `get_cron_health`: 80.1% (176 runs) — above 80% threshold; 2 successful runs since 10:07 ✅ |
| IMPROVE-1 | `get_market_hexagram` not found on server | `call_tool("get_market_hexagram", {})` → Quẻ 63 — Ký Tế 既濟 full response ✅ |

---

## Tool Probe Summary

| Tool | Probe args | Status | Notes |
|---|---|---|---|
| `get_cycle_bootstrap` | `agent_name="news-scout"` | ✅ OK | 31ms, returns signals + market context |
| `get_system_status` | `{}` | ✅ OK (warnings) | 10 bctcQueueEnricher WARNs; Reuters/TE degraded |
| `get_market_snapshot` | `{}` | ✅ OK | VN-Index 1799.31 +0.43% |
| `get_macro_snapshot` | `{}` | ✅ OK | Carry NEUTRAL, yield CHEAP (tier-2 live) |
| `get_watchlist` | `{}` | ✅ OK | 41 tickers returned |
| `get_earnings_calendar` | `{}` | ✅ OK | 14 QUÁ HẠN, 27 ĐÃ NỘP |
| `get_cron_health` | `{}` | ✅ OK (warnings) | `vnstockTradingStatsRefresh` crashed; `bctcReparseJob` 80.1% |
| `get_vps_proxy_health` | `{}` | ✅ OK (BCTC stale) | prices/news/sbv/ff OK; bctc STALE |
| `get_vps_service_health` | `{}` | ✅ OK | 3 healthy, 2 idle (market closed) |
| `get_pipeline_health` | `{}` | ✅ OK (5 dark) | 5 tickers rows=0; 36 tickers TA ready |
| `get_sla_status` | `{}` | ⚠️ CRITICAL | bctc SLA breached: 1807/360min |
| `get_sector_rotation` | `{}` | ⚠️ DEGRADED | 5d trend N/A (only 1 session of data — expected Monday behavior) |
| `get_technical_indicators` | `code="VCB"` | ✅ OK | tier-3, MA50 unavailable, RSI=43.8 |
| `fetch_and_analyze` | `keywords=["VCB"]` | ✅ OK | 20 items, mixed signals |
| `get_rate_limit_status` | `{}` | ✅ OK | 12 sources ready, 0 throttled |
| `get_fed_liquidity_spread` | `{}` | ✅ OK | EFFR=3.62, IORB=3.65, spread=-0.03 |
| `get_agent_signals` | `agent="system-auditor"` | ✅ OK | Empty (expected off-cycle) |
| `task_list_held` | `expired=true` | ✅ OK | 0 orphaned locks |
| `log_agent_work` | `agent_name="health-recheck", status="running"` | ✅ OK | id=1382 returned |
| `get_bctc_full` | `code="VCB"` | ❌ EMPTY | "Chưa có dữ liệu BCTC" — confirms BUG-2 |
| `get_market_hexagram` | `{}` | ✅ OK (RESTORED) | Quẻ 63, full response — RESOLVED from prior |
| `send_telegram` (schema) | — | ✅ Schema OK | Requires `message` (not `text`) + `channel` |
| `task_claim` (schema) | — | ✅ Schema OK | Requires `task_id`, `task_kind`, `owner_agent` |

---

## Active Finding Tally

| Class | Count | Items |
|---|---|---|
| **BUG** | 2 | `vnstockTradingStatsRefresh` crash; BCTC pipeline dead (SLA 1807min CRITICAL) |
| **ISSUE** | 3 | Server restart rate (26/7d); WTI crude stale ($12.47 inverted); Reuters/TE degraded |
| **IMPROVE** | 3 | `get_cycle_bootstrap` legacy enum; 5 dark tickers; macroIndicatorRefreshJob docs timezone |

---

## Caller-Surface Verification (STEP 3b)

**BUG-1 `vnstockTradingStatsRefresh`:**
```
grep confirmed in prior report: sectorComparisonTools.ts, marketCapTools.ts, companyProfileTools.ts
Agents: market-watcher (get_sector_comparison), bctc-analyst (compare_stocks, compare_financials), unified-agent
Caller count: 3 agents, multiple tool files
```

**BUG-2 BCTC pipeline:**
```
grep "get_bctc_full" docs/agents/tools/package/*.md → bctc-analyst.md, unified-agent.md, digest-predict.md
grep "bctc" docs/agents/*/flow/main.md → bctc-analyst/flow/main.md confirmed primary consumer
Caller count: 3 agents with active flow calls
```
