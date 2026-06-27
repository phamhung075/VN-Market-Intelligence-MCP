# Team MCP Tool Health Recheck — 2026-06-23T08:06Z

**Cycle:** 2026-06-23T08:06Z (UTC — VN market OPEN 02:00–08:59 UTC)
**Prior report:** `team-tool-recheck-2026-06-23-0606.md`
**Delta window:** ~2h since last report
**Gateway:** REACHABLE — all probes executed via `mcp__gateway__call_tool(server="vn-market", ...)`
**Server uptime at probe:** ~12h 3m (restarted ~2026-06-22T20:03:15Z)
**DB:** market.db 290.16 MB, WAL 0 B
**Probe scope:** 20 tools probed live; full Step 3c re-probe of all 6 prior BUGs + 4 ISSUEs; 1 new BUG discovered

---

## STEP 3c — Prior Findings Re-Probed This Cycle

| Prior Item | Re-probe command | This cycle result | Delta |
|---|---|---|---|
| BUG-1 BCTC dead | `get_vps_service_health`, `get_vps_proxy_health`, `get_sla_status` | unhealthy 6d 13h 57m; last push 2026-06-16T18:02:24Z; 0 24h pushes; SLA **9321/120min** | **WORSENING +118 min vs 0606 report** |
| BUG-2 Reuters dead | `get_system_status` source health | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 141 ⚠` | **UNCHANGED** |
| BUG-3 TE dead | `get_system_status` source health | `Trading Economics \| Ngưng \| 141 ⚠` + `142 ⚠` (two entries) | **UNCHANGED** |
| BUG-4 ISM no_data | `get_ism_subcomponents({})` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows."}` | **UNCHANGED** |
| BUG-5 fb-poster no stock_code | `grep docs/agents/fb-market-poster/flow/main.md` | line 118: `arguments={}` still present | **UNCHANGED** |
| BUG-6 foreign-flow direct dead | `get_system_status` errors + `get_cron_health` | 8/10 unresolved-error slots consumed by foreign-flow; foreignFlowFetcherJob 100% false-success | **UNCHANGED** |
| ISSUE-12 SBV zero-value | `storeSbvSnapshot` code at `sbv.ts:398` still present; `get_vps_proxy_health` sbv: 16 24h_pushes, not stale; error slot starved by BUG-6 — cannot confirm cleared | **PRESUMED ONGOING** |
| ISSUE-3 cycle collision | `get_cron_health`: intelligenceCycleJob 99.8%, avg 28205ms | **UNCHANGED** |
| ISSUE-4 TA gaps | `get_pipeline_health`: BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 rows | **UNCHANGED** |
| ISSUE-6 vnstock timing | `get_cron_health`: vnstockTradingStatsRefresh avg 708371ms | **UNCHANGED** |

---

## STEP 2 — Full Probe Table (This Cycle)

| Tool | Call pattern | Result summary | Status |
|---|---|---|---|
| `get_system_status` | `{}` | 10 unresolved errors (8 foreign-flow, 2 vn_index_cache); Reuters/TE 141-142×; BCTC 155.4h stale; 50 open high/critical warnings | ✅ REACHABLE |
| `get_cycle_bootstrap` | `{agent_name:"market-watcher"}` | 53 agent_signals, full market_context, elapsed_ms=14 | ✅ HEALTHY |
| `get_week_period` | `{}` | W26, 2026-06-22/2026-06-28, periodKey correct | ✅ HEALTHY |
| `get_market_snapshot` | `{}` | VN-Index 1869.04 +0.60%; breadth 95/208/61; turnover 28788bn VND (+97.2%); source=vndirect | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | oil $77, gold $4124, USD/VND 26128; carry NEUTRAL; yield CHEAP; deltas null (BUG-3) | ✅ REACHABLE (delta gap) |
| `get_market_breadth` | `{}` | Live HOSE data; advances 95, declines 208 | ✅ HEALTHY |
| `get_market_context` | `{}` | Full watchlist prices + macro + 20 open alerts + recent analysis | ✅ HEALTHY |
| `get_market_foreign_flow` | `{}` | Net sell -3.14M; VIC top buyer +1.32M; HPG top seller -842.8k; 99 tickers | ✅ HEALTHY |
| `get_cron_health` | `{}` | 75+ jobs; all ≥98.2%; intelligenceCycleJob 99.8% avg 28205ms; vnstockTradingStats avg 708s | ✅ REACHABLE |
| `get_pipeline_health` | `{}` | 7 tickers TA not ready; 4 oversold (D2D/DPM/NKG/NVL RSI<30) | ⚠ ISSUE-4 |
| `get_vps_proxy_health` | `{}` | prices/news/sbv/foreign-flow: ok; **bctc: STALE 7d, 0 24h pushes** | ❌ BUG-1 |
| `get_vps_service_health` | `{}` | **vn-bctc-fetch UNHEALTHY** (6d 13h 57m uptime, 0ms); vn-foreign-flow unhealthy (15m uptime); 3 others healthy | ❌ BUG-1, BUG-6 |
| `get_sla_status` | `{}` | **bctc: 9321/120min CRITICAL**; price/news/sbv_fx/foreign_flow: ok | ❌ BUG-1 |
| `get_earnings_calendar` | `{}` | 12 QUÁ HẠN (BDI, BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH); Q2 window opens July 1 | ✅ REACHABLE |
| `get_ism_subcomponents` | `{}` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows."}` | ❌ BUG-4 |
| `get_technical_indicators` | `{code:"VCB"}` | RSI 42.3, MACD bearish, BB mid — source_tier 3 | ✅ HEALTHY |
| `get_rate_limit_status` | `{}` | 14 sources; all 0s wait; tradingeconomics.com "Chua goi" (never called) — confirms BUG-3 | ✅ REACHABLE |
| `post_agent_signal` | probe payload | Critic gate reject score 0.4 (expected for minimal probe) — tool reachable | ✅ REACHABLE |
| `task_claim` | `{ttl_seconds:60,...}` | `{"claimed":true}` | ✅ HEALTHY |
| `task_release` | probe id | `{"ok":true}` | ✅ HEALTHY |

---

## STEP 3b — Caller-Surface Verification (This Cycle)

| Finding | Grep run | Result |
|---|---|---|
| BUG-7 `vn_index_cache` schema | `grep -rn "vn_index_cache" apps/mcp-server/src/**/*.ts` | `vnIndexCacheStore.ts:30` upserts `(code, price, ...)` — matches error. `schema-market-data.ts:136` DDL has `code TEXT PRIMARY KEY` but no ALTER migration. `vnIndexRefreshJob.ts:73,83` confirms writer + non-fatal log. **1 job fires every 5 min market hours.** |
| BUG-5 fb-poster | `grep -n "get_sentiment_trend" docs/agents/fb-market-poster/flow/main.md` | Line 118: `arguments={}` — `stock_code` still missing. Tool doc: `stock_code \| string \| Yes`. 1 broken caller. |
| `get_foreign_flow` no-code usage | `grep -rn "get_foreign_flow()" docs/agents/**/*.md` | `unified-agent/flow/market-analysis.md:30` — prose reference, not a code-block call. `fb-market-poster.md` explicitly documents fix (replaced with `get_market_foreign_flow()`). **0 active broken callers** — unified-agent reference is interpretive prose, not a tool call template. NON-ISSUE. |
| `get_news` not found | `grep -rn "get_news\b" docs/agents/**/*.md` | 0 matches — no agent calls this tool. NON-ISSUE. |
| BUG-2 Reuters callers | prior cycle verified 0 cowork callers | Confirmed NON-ISSUE for cowork; error noise only. |

---

## ACTIVE BUGS — 7 (6 re-confirmed + 1 NEW)

### BUG-1 — CRITICAL — WORSENING (Day 7) — BCTC VPS Pipeline Dark

| Signal | Prior 0606 UTC | This cycle 0806 UTC | Delta |
|---|---|---|---|
| SLA breach | 9203/120min | **9321/120min** | +118 min |
| Last VPS push | 2026-06-16T18:02:24Z | 2026-06-16T18:02:24Z | Unchanged |
| 24h pushes | 0 | 0 | Unchanged |
| Service status | unhealthy | **unhealthy** | Unchanged |
| VPS uptime | 6d 11h 57m | **6d 13h 57m** | +2h |

**Re-probe evidence (this cycle):**
- `get_vps_service_health`: `vn-bctc-fetch | unhealthy | 3m ago | 0ms | 6d 13h 57m`
- `get_vps_proxy_health`: `bctc | 2026-06-16 18:02:24 | ok | YES (STALE) | 24h_pushes=0`
- `get_sla_status`: `bctc: 9321/120min — CRITICAL`
- `get_earnings_calendar`: 12 QUÁ HẠN tickers; Q2-2026 window opens July 1 (~8 days)

**Caller surface:** bctc-analyst (`get_bctc_full`, `get_bctc_ocf`, `get_bctc_series`), `refine_bctc_md`, `bctcPdfPullJob`, `bctcQueueEnricherJob`, `bctcReparseJob` — **6 callers blocked**.

**Blast radius: CRITICAL.** Q1 overdue filings (BID, GAS, PLX, PPC, VEA, etc.) cannot be fetched. Q2-2026 window opens July 1 — 8 days remaining.

**Fix:** `restart_vps_service("vn-bctc-fetch")` then `trigger_bctc_vps_fetch` for backfill. Confirm via `get_vps_proxy_health` (expect 24h_pushes > 0 within 5 min).

---

### BUG-7 — HIGH — NEW THIS CYCLE — `vn_index_cache` Schema Mismatch (Missing Migration)

**Discovery evidence:**
- `get_system_status` RECENT ERRORS: `[vn-index-refresh] vn_index_cache upsert failed (non-fatal) — table vn_index_cache has no column named code` at 08:00:01 and 08:00:02 UTC
- Source: `apps/mcp-server/src/infrastructure/db/vnIndexCacheStore.ts:30`: `INSERT OR REPLACE INTO vn_index_cache (code, price, prev_price, change_pct, volume, fetched_at)`
- Source: `apps/mcp-server/src/infrastructure/db/schema-market-data.ts:136`: DDL has `code TEXT PRIMARY KEY` in `CREATE TABLE IF NOT EXISTS vn_index_cache`
- **Root cause:** `FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH (2026-06-20)` added `code TEXT PRIMARY KEY` to the DDL but wrote no `ALTER TABLE` migration. The live DB's `vn_index_cache` table was created before 2026-06-20 with an old schema (no `code` column). `CREATE TABLE IF NOT EXISTS` is a no-op when the table already exists — the old column-less schema persists in the live volume.
- `vnIndexRefreshJob` fires every 5 min during VN market hours (02:00–08:59 UTC Mon–Fri) → **~48 errors per trading day**. The VNINDEX cache is never written; downstream reads fall back to the live API.

**Caller surface:** `vnIndexRefreshJob.ts:73,83` (1 cron). `freshnessSlaMonitorJob.ts:57` reads the cache. 0 cowork agents directly call the DB — they use `get_market_snapshot` which falls back gracefully. Impact: elevated error noise; VNINDEX SLA cache is permanently empty on this DB; eventual risk if live API fallback is also unavailable.

**Fix (dev-mcp-server):** Add migration before the `CREATE TABLE IF NOT EXISTS`:
```sql
ALTER TABLE vn_index_cache ADD COLUMN code TEXT;
-- then recreate as temp/drop+create, OR:
CREATE TABLE IF NOT EXISTS vn_index_cache_new (code TEXT PRIMARY KEY, ...);
INSERT INTO vn_index_cache_new SELECT ... FROM vn_index_cache;
DROP TABLE vn_index_cache;
ALTER TABLE vn_index_cache_new RENAME TO vn_index_cache;
```
Simplest safe fix: since `vn_index_cache` is a single-row ephemeral cache, `DROP TABLE IF EXISTS vn_index_cache` before the `CREATE TABLE IF NOT EXISTS` in the schema init function is safe and requires no data migration.

---

### BUG-2 — HIGH — CONTINUOUS — Reuters RSS Dead

**Re-probe evidence:**
- `get_system_status` source health: `Reuters RSS | Ngưng | Chưa bao giờ | 141 ⚠`
- Counter now 141 since server restart at 2026-06-22T20:03:15Z (~12h = ~11.75/h)

**Caller surface:** `grep -rE "reuters" docs/agents/*/flow/*.md` → **0 matches**. Error noise only, no cowork impact.

**Fix:** Disable/remove Reuters RSS source config in mcp-server. No cowork code change needed.

---

### BUG-3 — HIGH — CONTINUOUS — Trading Economics 2× Dead

**Re-probe evidence:**
- `get_system_status`: `Trading Economics | Ngưng | Chưa bao giờ | 141 ⚠` and `142 ⚠`
- `get_rate_limit_status`: `tradingeconomics.com | Chua goi | 0s` — zero outbound calls from main server
- `get_macro_snapshot`: `oilUsdDelta:null`, `goldUsdDelta:null`, `usdVndDelta:null` — deltas missing

**Caller surface:** 4 cowork flows (unified-agent, news-scout, bctc-analyst, market-watcher) missing commodity day-over-day deltas. Live prices available via Yahoo Finance fallback (source_tier=1 confirmed).

**Fix:** Diagnose TE Chromium scraper path in VPS/main-server. Evaluate investing.com or Yahoo Finance delta computation as interim fallback.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data (FRED NAPMBI)

**Re-probe evidence:**
- `get_ism_subcomponents({})` → `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`
- `get_cron_health`: `macroIndicatorRefreshJob: 100% success, avg=17320ms` — job succeeds but NAPMBI series returns HTTP 400 silently

**Caller surface:** 3 cowork flows (unified-agent, bctc-analyst, news-scout) blocked on ISM PMI regime classification.

**Fix:** (1) Set `FRED_API_KEY` env var. (2) Verify NAPMBI series ID — HTTP 400 = invalid/retired. Try `ISM/MAN_NO` or `NAPM`.

---

### BUG-5 — LOW — UNCHANGED — fb-market-poster `get_sentiment_trend` Missing `stock_code`

**Re-probe evidence:**
- `grep -n "get_sentiment_trend" docs/agents/fb-market-poster/flow/main.md` → line 118: `arguments={}`
- Tool doc: `stock_code | string | Yes | — | Stock ticker code`

**Caller surface:** 1 broken caller. All other flows skip or call per-ticker correctly.

**Fix:** `docs/agents/fb-market-poster/flow/main.md:118` — replace `arguments={}` with a per-watchlist-ticker loop or source sentiment from the unified-agent MARKET dish instead.

---

### BUG-6 — MEDIUM — UNCHANGED — foreign-flow-job False-Success + Error-Slot Starvation

**Re-probe evidence:**
- `get_system_status` unresolved errors: 8/10 slots consumed by foreign-flow (primary failed, all fallbacks exhausted, every minute)
- `get_cron_health`: `foreignFlowFetcherJob: 100% success_rate, 2033 runs` — job marks success when returning empty
- `get_vps_service_health`: `vn-foreign-flow | unhealthy | 15m uptime` — VPS service health check failing
- `get_vps_proxy_health` push log: foreign-flow VPS pushes arriving (101-103 items/min via push path)

**Caller surface:** `get_market_foreign_flow` returns live data via VPS-pushed DB. **0 immediate data impact.** Risk: 8/10 error slots consumed — genuine new errors cannot surface in `get_system_status`.

**Fix:** (1) Disable broken primary+fallback endpoints, or stub them if VPS push is canonical. (2) Treat "all fallbacks empty" as `partial` job status, not `success`.

---

## ACTIVE ISSUES — 4 (all re-confirmed)

### ISSUE-12 — MEDIUM — PRESUMED ONGOING — SBV VPS Parser Zero-value

**Re-probe:** `storeSbvSnapshot REJECTED — zero-value` guard code confirmed in `sbv.ts:398`. `get_vps_proxy_health`: sbv 16 24h_pushes (not stale). Cannot verify WARN presence/absence this cycle — error slots starved by BUG-6. SBV center rate 26128 VND/USD appears stable.

**Fix:** SSH VPS → `sudo systemctl restart vn-sbv-fetch.service`. Inspect SBV HTML structure if zeros persist.

---

### ISSUE-3 — MEDIUM — UNCHANGED — Intelligence Cycle Avg 28s (Tail-latency Collision Risk)

**Re-probe:** `get_cron_health`: intelligenceCycleJob 99.8%, avg_duration=28205ms. 28s mean vs 15-min slot is within budget, but 0.2% stalls indicate occasional tail spikes.

**Fix:** Add per-source 10s timeout cap in intelligenceCycleJob.

---

### ISSUE-4 — LOW — UNCHANGED — 7 Tickers TA Not Ready

**Re-probe:** `get_pipeline_health`: BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 rows. Market-watcher and unified-agent will skip these tickers in TA step.

**Fix:** Audit UPCOM/HNX scraper path; replace BDI Yahoo Finance symbol.

---

### ISSUE-6 — LOW — UNCHANGED — vnstockTradingStatsRefresh Avg 11.8 min

**Re-probe:** `get_cron_health`: avg 708371ms (11.8 min). Potential overlap risk with intelligenceCycleJob on shared DB.

**Fix:** Run at off-peak hours (e.g., 00:30 UTC). Add 15-min timeout guard.

---

## NON-ISSUES This Cycle

| Probe | Result | Verdict |
|---|---|---|
| `get_cycle_bootstrap({})` no agent_name | Required param validation error | NON-ISSUE — all callers pass explicit `agent_name` per package docs |
| `get_foreign_flow` no code | Required param validation error | NON-ISSUE — caller-surface verified: 0 active callers omit `code`; unified-agent prose ref is interpretive only |
| `get_news` tool not found | Tool doesn't exist | NON-ISSUE — 0 agent callers. Grep: `grep -rn "get_news\b" docs/agents/**/*.md` → 0 matches |
| `task_claim` ttl_seconds<60 | Validation: minimum 60 | NON-ISSUE — my probe used 30 (invalid). Live callers use ≥60 per flow files |
| `post_agent_signal` probe rejected | Critic gate score 0.4 (expected — minimal payload) | NON-ISSUE — tool reachable; critic gate working correctly |
| `newsapi: disabled` | 0 fetches | NON-ISSUE — intentional, no API key configured |
| CafeF/VnExpress/VnEconomy RSS 3× failures | Source "Suy giảm" (degraded) | NON-ISSUE for now — `pollNewsJob` 99.9% success; these recover quickly. Monitor if failures climb. |

---

## Summary Table

| Severity | Count | Items |
|---|---|---|
| BUG CRITICAL | 1 | BUG-1 BCTC dead Day 7, WORSENING (9321/120min, Q2 window 8 days) |
| BUG HIGH | 3 | BUG-7 NEW vn_index_cache schema mismatch; BUG-2 Reuters 141×; BUG-3 TE 141-142× |
| BUG MEDIUM | 2 | BUG-4 ISM FRED (3 cowork flows); BUG-6 foreign-flow false-success |
| BUG LOW | 1 | BUG-5 fb-poster get_sentiment_trend no stock_code |
| ISSUE MEDIUM | 2 | ISSUE-12 SBV zero-value; ISSUE-3 cycle collision |
| ISSUE LOW | 2 | ISSUE-4 TA gaps; ISSUE-6 vnstock timing |
| RESOLVED | 0 | — |
| NON-ISSUE | 7 | Probe param errors + by-design gaps |

---

## Recommended Actions (priority order)

1. **BUG-1 CRITICAL — NOW:** `restart_vps_service("vn-bctc-fetch")` then `trigger_bctc_vps_fetch` — Day 7, Q2 window July 1
2. **BUG-7 HIGH — NEW:** Drop+recreate `vn_index_cache` table in schema init (safe: single-row cache) — 48 errors/trading day
3. **ISSUE-12 MEDIUM:** `restart_vps_service("vn-sbv-fetch")` — SBV zero-value ongoing
4. **BUG-6 MEDIUM:** Stub/disable broken foreign-flow primary+fallback endpoints; fix false-success logging — error-slot starvation
5. **BUG-4 MEDIUM:** Set `FRED_API_KEY` + fix NAPMBI series ID — 3 cowork flows affected
6. **BUG-3 HIGH:** Diagnose TE Chromium scraper; wire commodity-delta fallback
7. **BUG-2 HIGH:** Disable Reuters RSS circuit-breaker config — 0 callers, pure noise
8. **BUG-5 LOW:** Fix `docs/agents/fb-market-poster/flow/main.md:118` — add stock_code per-ticker loop
9. **ISSUE-3 MEDIUM:** Add 10s per-source timeout in intelligenceCycleJob
