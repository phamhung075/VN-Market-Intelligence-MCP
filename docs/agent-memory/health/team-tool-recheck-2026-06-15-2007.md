# Team MCP Tool Health Recheck — 2026-06-15 20:07 UTC

**Run by:** health-recheck agent (scheduled)
**Gateway:** `claude.ai gateway → vn-market`
**Probe window:** 2026-06-15 20:05–20:07 UTC (VN market CLOSED)
**Prior report:** `team-tool-recheck-2026-06-15-1806.md` (2h 01min delta)
**Method:** Read-only smoke calls per tool + caller-surface grep. No live-state mutations.

---

## Gateway Reachability

| Check | Result |
|---|---|
| Gateway transport | **REACHABLE** — `mcp__gateway__call_tool` schema loaded |
| vn-market server | **UP** — 26m uptime (restart at ~19:38 UTC); Telegram env SET |
| MCP error class | Schema validation errors returned correctly (transport healthy) |

---

## STEP 3c — Prior-Report Delta (re-probed this cycle)

| Prior ID | Finding | Re-probe evidence this cycle | Delta |
|---|---|---|---|
| BUG-1 | `vnstockTradingStatsRefresh` crash 50% | `get_cron_health`: `last_status=crashed`, `success_rate=0.50`, `total_runs=2`, `avg_duration=2,754,485ms` — identical | **ONGOING, UNCHANGED** |
| BUG-2 | BCTC VPS push stale | `get_vps_proxy_health`: bctc `STALE, last push 2026-06-13 23:45:12, 0 pushes/24h` — unchanged. `bctcQueueEnricher`: 0 URLs for all 9 tickers (recurring every cycle). VPS service `vn-bctc-fetch=healthy` but still not pushing | **ONGOING, UNCHANGED** |
| BUG-2 (SLA) | BCTC SLA CRITICAL | `get_sla_status`: `bctc \| 11 min \| 360 min \| ok` — **SLA now shows ok** (masked: `bctcReparseJob` ran at 19:56 UTC and touched DB, resetting the SLA age clock). Root cause (VPS push dead) still present | **SLA MASKED** — underlying cause unresolved |
| BUG-3 | `post_agent_signal` schema drift | Flow file `docs/agents/system-auditor/flow/main.md` unchanged — L193, L482, L509 still use wrong contract. No code fix deployed this cycle | **ONGOING, UNCHANGED** |
| BUG-NEW-3 | `bctcReparseJob` 79.8% | `get_cron_health`: `success_rate=0.80 (80.0%)`, `total_runs=170`, `last_run=2026-06-15 19:56:32 success` — just at threshold | **ONGOING, MARGINALLY AT THRESHOLD** |
| BUG-NEW-4 | `get_foreign_flow` param mismatch (fb-market-poster) | `call_tool(server="vn-market", tool="get_foreign_flow", arguments={})` → `MCP -32602: path:['code'], received:undefined, Required` — identical error | **ONGOING, UNCHANGED** |
| ISSUE-1 | Server restart rate | `get_cron_health`: `mcpServerStartup total_runs=28` — +1 restart at 19:38:21 UTC | **WORSENED** — now 28/7d (4.0/day) |
| ISSUE-2 | WTI crude inverted $95.5 vs Brent $83.56 | `get_system_status`: `wti_crude_usd=95.5 (79 data points)` vs `brent_crude_usd=83.56` | **ONGOING, UNCHANGED** |
| ISSUE-3 | Reuters RSS + Trading Economics stopped | `get_system_status`: `Reuters RSS: Ngưng \| 7 errors`; `Trading Economics: Ngưng \| 7 errors × 2` — reset by 19:38 restart, re-accumulating | **ONGOING** — never succeeded; counters reset each restart |
| IMPROVE-1 | `get_cycle_bootstrap` legacy enum | `get_cycle_bootstrap(agent_name:"news-scout")` → OK. Enum still includes `financial-analyst`, `report-analyzer` | **ONGOING** |
| IMPROVE-2 | 5 dark tickers 0 OHLCV rows | `get_pipeline_health`: BDI/DLC/JSH/SIS/VDC `rows=0`, TA not ready | **ONGOING** |
| IMPROVE-3 | `macroIndicatorRefreshJob` schedule doc drift | `get_cron_health`: `last_run=2026-06-15 12:13:01 UTC` — schedule runs at 12:13 UTC; system-map says `"19:13 UTC"` (VN local time leaked into UTC field) | **ONGOING** |
| IMPROVE-4 | `get_sla_status` BCTC threshold mismatch | `get_sla_status`: BCTC threshold still `360 min` (6h) vs expected 168h out-of-earnings-window | **ONGOING** |

---

## NEW Finding This Cycle

### BUG-NEW-5 (NEW) — `get_ticker_intelligence` no-arg call breaks fb-market-poster every cycle

| Field | Value |
|---|---|
| Class | **BUG** |
| Live probe | `call_tool(server="vn-market", tool="get_ticker_intelligence", arguments={})` → `MCP -32602: path:['code'], received:undefined, message:Required` |
| Live schema | Requires `code: string` (confirmed: `get_ticker_intelligence({"code":"VCB"})` → OK, full intelligence brief) |
| Tool list doc | `docs/agents/tools/list/get_ticker_intelligence.md:9` — says param is `ticker` — **wrong field name** (live API uses `code`) |
| Package doc | `docs/agents/tools/package/fb-market-poster.md:49` — `(none required)` and `arguments={}` — **wrong: code is required** |
| Flow file | `docs/agents/fb-market-poster/flow/main.md:81` — `call_tool(…, tool="get_ticker_intelligence", arguments={})` — **fails every cycle** |
| Pair with | BUG-NEW-4 (`get_foreign_flow` same pattern) — fb-market-poster is missing both foreign flow and ticker intelligence data on every run |
| Error guard | Flow has `"skip individual call if it errors (log + continue)"` → silent failure; no crash but live mover data always absent |
| Caller-surface grep | `grep "get_ticker_intelligence" docs/agents/fb-market-poster/flow/main.md` → line 81 confirmed broken; `grep "get_ticker_intelligence" docs/agents/tools/package/market-watcher.md` → line 207 uses `{code:...}` correctly; market-watcher unaffected |
| Affected callers | **1 agent broken**: fb-market-poster (line 81). market-watcher uses correct `code` param. |

**Fix:**
1. `docs/agents/fb-market-poster/flow/main.md:81`: Replace `get_ticker_intelligence(arguments={})` with `get_market_snapshot(arguments={})` — returns market-wide movers, breadth, sector data with no args required; OR call `get_ticker_intelligence` for each top-mover code extracted from snapshot.
2. `docs/agents/tools/package/fb-market-poster.md:49,56`: Replace `get_ticker_intelligence` row with `get_market_snapshot` (or remove and note market_snapshot already called at line 72).
3. `docs/agents/tools/list/get_ticker_intelligence.md:9`: Fix param name from `ticker` to `code`.

---

## ACTIVE FINDINGS (re-confirmed this cycle)

### BUG-1 (ONGOING) — `vnstockTradingStatsRefresh` crashed: 50% success, 45.9-min avg runtime

| Field | Value |
|---|---|
| Evidence | `get_cron_health`: `last_status=crashed`, `success_rate=0.50 (50.0%)`, `total_runs=2`, `avg_duration=2,754,485ms` |
| Last run | 2026-06-15 08:30:01 UTC (crashed). No subsequent run today — weekday-only job |
| Downstream | `vnstock_trading_stats` table not refreshed; affects `get_sector_comparison`, `get_market_cap`, `get_company_profile` |

**Fix:** Add `AbortSignal.timeout(60_000)` per-ticker + job-level 600s guard in `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts`.

---

### BUG-2 (ONGOING) — BCTC VPS push dead: no push since 2026-06-13 23:45 UTC

| Field | Value |
|---|---|
| VPS evidence | `get_vps_proxy_health`: `bctc \| 2026-06-13 23:45:12 \| 0 pushes/24h \| STALE` |
| Enricher | `get_system_status`: `bctcQueueEnricher: 0 URLs populated across all 9 item(s) — all sources may be unavailable or geo-blocked` (every 15 min) |
| VPS service | `vn-bctc-fetch: healthy` — up but producing 0 URLs (silent-failure in URL enricher) |
| SLA mask | `get_sla_status`: bctc shows `ok` (11 min age) because `bctcReparseJob` at 19:56 UTC refreshed DB from cached PDFs — does NOT mean new PDFs arriving |
| Earnings context | `get_earnings_calendar`: 11 tickers still QUÁ HẠN (ACV, BDI, DAG, DLC, JSH, PLX, PPC, SIS, VDC, VEA, VNH) |
| Downstream | bctc-analyst, digest-predict, unified-agent BCTC data frozen since 2026-06-13 |

**Fix:** `trigger_bctc_vps_fetch` to force discovery cycle; SSH VPS probe `curl /proxy/bctc-discover/<ticker>` to distinguish geo-block vs scraper format change.

---

### BUG-3 (ONGOING) — `post_agent_signal` schema drift: system-auditor 3 emit sites broken

| Field | Value |
|---|---|
| Live schema | `from_agent (req), to_agent (req), signal_type: enum (req), payload: object (req)` |
| Flow mismatch | `docs/agents/system-auditor/flow/main.md` L193, L482, L509 — uses `{type, ts, tier, summary, checks, overall}` |
| Impact | All infra anomaly signals from system-auditor fail silently; other agents blind to infra issues |

**Fix:** Rewrite 3 emit blocks in `docs/agents/system-auditor/flow/main.md` using correct schema: `{from_agent:"system-auditor", to_agent:"po", signal_type:"chain_catalyst", payload:{title:"...", detail:"..."}}`.

---

### BUG-NEW-3 (ONGOING) — `bctcReparseJob` at 80.0%: at alert threshold

| Evidence | `get_cron_health`: `success_rate=0.80 (80.0%)`, `total_runs=170`, last_run=19:56:32 UTC success |
|---|---|
| Note | cronHealthAlertJob fires when `success_rate < 80%`. Currently at exactly 80.0% — one more failure trips alert. Likely consequence of BUG-2 (no new PDFs). |

---

### BUG-NEW-4 (ONGOING) — `get_foreign_flow` triple-parameter mismatch: fb-market-poster fails every cycle

| Evidence | `get_foreign_flow({})` → `MCP -32602: code required (string)`. fb-market-poster flow line 78 calls with `{}`. Fix: replace with `get_market_foreign_flow(arguments={})` |
|---|---|
| Caller-surface | 1 broken caller: `docs/agents/fb-market-poster/flow/main.md:78`. Doc fix also needed: `docs/agents/tools/list/get_foreign_flow.md` (param `ticker` → `code`) and `docs/agents/tools/package/fb-market-poster.md` |

---

### BUG-NEW-5 (NEW this cycle) — `get_ticker_intelligence` no-arg call breaks fb-market-poster

*(See full detail above in NEW Finding section.)*

---

## Issues (degraded, not broken)

### ISSUE-1 (WORSENED) — Server restart rate: 28 in 7 days (+1 this cycle at 19:38 UTC)

| Evidence | `mcpServerStartup total_runs=28` (was 27 at 18:06 UTC). +1 restart at 19:38:21 UTC |
|---|---|
| Impact | Circuit-breaker failure counters reset each restart; Reuters/TE re-accumulate errors from 0 after each restart; once-daily cron jobs may miss fire window |

---

### ISSUE-2 (ONGOING) — WTI crude price stale: $95.5 vs live Brent $83.56 — $11.94 inversion

| Evidence | `get_system_status`: `wti_crude_usd=95.5 (79 data points)` — historical fetch not updated |
|---|---|
| Impact | DB-stored macro analysis reads materially wrong WTI. `get_macro_snapshot` uses live Brent (ok); only auto-tracker historical table affected |

---

### ISSUE-3 (ONGOING) — Reuters RSS + Trading Economics stopped, never succeeded

| Evidence | `Reuters RSS: Ngưng \| 7 errors`; `Trading Economics: Ngưng \| 7 errors × 2` — reset at 19:38 restart |
|---|---|
| Impact | Missing Reuters international news; missing TE macro indicators. Bloomberg + VN RSS sources mitigating |

---

## Improvements (non-blocking)

| ID | Finding |
|---|---|
| IMPROVE-1 | `get_cycle_bootstrap` enum retains `financial-analyst`, `report-analyzer` — 0 active callers; dead weight in schema |
| IMPROVE-2 | 5 watchlist tickers with 0 OHLCV rows: BDI, DLC, JSH, SIS, VDC — TA alerts silent for 12% of watchlist |
| IMPROVE-3 | `macroIndicatorRefreshJob` schedule in system-map says `"19:13 UTC"` — should be `"12:13 UTC"` (VN local time leaked into UTC field) |
| IMPROVE-4 | `get_sla_status` BCTC threshold hardcoded at 360 min (6h); out-of-earnings-window threshold should be 168h; fires false CRITICAL between earnings seasons |

---

## Full Tool Probe Summary

| Tool | Status | Notes |
|---|---|---|
| `get_cycle_bootstrap` | ✅ OK | Requires valid enum `agent_name`; works with news-scout |
| `get_market_snapshot` | ✅ OK | VN-Index 1799.31 +0.43%, source_tier=2 |
| `get_macro_snapshot` | ✅ OK | Carry NEUTRAL, yield CHEAP, all tier-2 live; is_estimate=false |
| `get_system_status` | ✅ OK | 10 unresolved (all bctcQueueEnricher WARNs); sources detail: Reuters/TE Ngưng |
| `get_cron_health` | ✅ OK (2 issues) | `vnstockTradingStatsRefresh` crashed; `bctcReparseJob` 80.0% |
| `get_pipeline_health` | ✅ OK (5 dark) | 36/41 TA ready; BDI/DLC/JSH/SIS/VDC rows=0 |
| `get_vps_proxy_health` | ✅ OK (BCTC stale) | prices/news/sbv ok; bctc STALE since 2026-06-13 |
| `get_vps_service_health` | ✅ OK | 3 healthy, 2 idle (market closed) |
| `get_rate_limit_status` | ✅ OK | 11 sources, 0 waiting |
| `get_sla_status` | ✅ OK (masked) | All 5 ok; bctc 11 min (masked by reparse, not real push) |
| `get_market_context` | ✅ OK | Full watchlist + macro + alerts context |
| `get_week_period` | ✅ OK | W25: 2026-06-15/2026-06-21 |
| `get_watchlist` | ✅ OK | 41 tickers; 5 showing N/A (expected dark tickers) |
| `get_alerts` | ✅ OK | 10 returned; latest 15:30 UTC |
| `get_agent_signals` | ✅ OK | Requires `agent: string`; `agent="news-scout"` → "Không có tín hiệu mới" |
| `get_earnings_calendar` | ✅ OK | 27 ĐÃ NỘP, 11 QUÁ HẠN (watch ACV, BDI, GAS, PLX, PPC) |
| `get_ticker_intelligence` | ✅ w/ args / ❌ no-args | `{code:"VCB"}` → OK; `{}` → MCP -32602 Required (BUG-NEW-5) |
| `get_foreign_flow` | ✅ w/ args / ❌ no-args | `{code:"VCB"}` → OK; `{}` → MCP -32602 Required (BUG-NEW-4) |
| `search_similar_context` | ⚠️ transient | 1st probe: timeout; 2nd probe (shorter query): OK — intermittent cold-start latency |
| `get_market_snapshot` | ✅ OK | No args; VN-Index + Kinh Dịch reading |

---

## Active Finding Tally

| Class | Count | Items |
|---|---|---|
| **BUG** | **6** | BUG-1 `vnstockTradingStatsRefresh` crash; BUG-2 BCTC VPS push dead; BUG-3 `post_agent_signal` schema drift; BUG-NEW-3 `bctcReparseJob` 80.0%; BUG-NEW-4 `get_foreign_flow` no-args; **BUG-NEW-5** `get_ticker_intelligence` no-args |
| **ISSUE** | 3 | ISSUE-1 server restarts 28/7d; ISSUE-2 WTI crude inverted; ISSUE-3 Reuters/TE stopped |
| **IMPROVE** | 4 | IMPROVE-1 bootstrap enum; IMPROVE-2 5 dark tickers; IMPROVE-3 job schedule doc; IMPROVE-4 SLA threshold |

---

## Caller-Surface Verification (STEP 3b)

```
# BUG-NEW-5 get_ticker_intelligence no-args:
grep "get_ticker_intelligence" docs/agents/fb-market-poster/flow/main.md
→ line 81: call_tool(…, "get_ticker_intelligence", arguments={})  ← CONFIRMED BROKEN

grep "get_ticker_intelligence" docs/agents/tools/package/market-watcher.md
→ line 207: get_ticker_intelligence({"code":...})  ← correct caller, unaffected

# BUG-NEW-4 get_foreign_flow (re-confirmed):
grep "get_foreign_flow" docs/agents/fb-market-poster/flow/main.md
→ line 78: call_tool(…, "get_foreign_flow", arguments={})  ← CONFIRMED BROKEN

# BUG-3 post_agent_signal (re-confirmed by file unchanged):
grep -n "post_agent_signal" docs/agents/system-auditor/flow/main.md
→ L193, L482, L509 — 3 broken emit sites, no fix deployed

# BUG-2 BCTC pipeline (re-confirmed):
get_vps_proxy_health → bctc STALE: 2026-06-13 23:45:12 (unchanged)
get_system_status → bctcQueueEnricher: 0 URLs populated across all 9 item(s)

# BUG-1 vnstockTradingStatsRefresh (re-confirmed):
get_cron_health → last_status=crashed, success_rate=0.50, total_runs=2 (unchanged)
```
