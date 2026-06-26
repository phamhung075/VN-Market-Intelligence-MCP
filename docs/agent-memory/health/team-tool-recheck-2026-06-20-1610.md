# Team MCP Tool Health Recheck — 2026-06-20T16:10Z

**Run:** 2026-06-20T16:10:00Z (automated scheduled recheck)
**Prior report:** `team-tool-recheck-2026-06-20-1408.md` (2h ago)
**Methodology:** Live probe every depended-on tool via gateway; Step 3b caller-surface grep; Step 3c re-probe every prior finding before carry-forward.
**Context:** Saturday — VN market CLOSED. All "stale prices / idle VPS services" findings below market context are EXPECTED, not bugs.

---

## Summary

| Category | Count | vs 14:08Z |
|----------|-------|-----------|
| BUG (re-confirmed active) | 5 | → 0 resolved, 0 new |
| ISSUE (re-confirmed active) | 5 | → 0 resolved, +1 new |
| RESOLVED | 0 | — |
| NON-ISSUE (verified this cycle) | 4 | — |
| IMPROVE (no callers broken) | 4 | — |

All 5 BUGs and 5 ISSUEs from prior report **re-confirmed**. Data-source BUGs BUG-3 and BUG-4 still worsening (+19 failures each). BUG-1 BCTC still drifting (+121 min vs 14:08Z). One new ISSUE identified: weekly DB integrity audit not running.

---

## ACTIVE BUGs — Re-confirmed This Cycle

### BUG-1 — CRITICAL: BCTC VPS pipeline dead (WORSENING)

**Severity:** CRITICAL
**Status:** WORSENING (+121 min vs 14:08Z)

**Re-probe evidence (16:06Z):**
- `get_sla_status` → `bctc: 5484 min / 1897 min SLA` → **2.9× over SLA**
- `get_vps_service_health` → `vn-bctc-fetch: unhealthy | uptime: 3d 22h 2m | response_ms: 0`
- `get_vps_proxy_health` → `bctc: last_push: 2026-06-16T18:02:24Z | 0 pushes in 24h | STALE`
- Prior 14:08Z: bctc_freshness=5363 min. Delta: +121 min — no recovery, continues drifting.

**Caller-surface verified:** `docs/agents/refine_bctc_md/flow/main.md` (get_bctc_pending_refine → push_bctc_refined_unit); `docs/agents/tools/list/get_bctc_pending_refine.md`; `docs/agents/tools/list/push_bctc_refined_unit.md`; `docs/agents/tools/list/get_vps_service_health.md` (monitoring). Callers: ≥5 agents (bctc-analyst, refine_bctc_md, unified-agent, system-auditor, ops). All depend on fresh BCTC ingestion.

**Recommended action:** SSH VPS → `systemctl restart vn-bctc-fetch` → check `/var/log/vn-bctc-fetch.log` for crash/OOM. Also try `trigger_bctc_vps_fetch` MCP tool to force a manual push.

---

### BUG-2 — HIGH: HNX & UPCOM all price sources failing (UNCHANGED)

**Severity:** HIGH
**Status:** UNCHANGED

**Re-probe evidence (16:06Z):**
- `get_system_status` → 10/10 recent errors: `[hnx] all HNX price sources failed` + `[hnx] all UPCOM price sources failed` (recurring at every intelligenceCycleJob tick)
- `get_pipeline_health` → BDI: rows=0, DLC: rows=0, DAG: rows=2, JSH: rows=0, SIS: rows=0, VDC: rows=0, VNH: rows=6 — all HNX/UPCOM tickers chronically under-data
- Circuit breaker: `hnx [OK] failures: 0` — but CB resets after each cycle start; not accumulating due to CB isolation

**Caller-surface verified:** market-watcher (get_market_snapshot, get_ticker_intelligence), alert-engine (anomaly detection), intelligenceCycleJob price fetch path. ≥3 affected callers.

**Recommended action:** Check HNX scraper sources in `apps/mcp-server/src/`; test connectivity to HNX data endpoints; verify VPS hnx-price path.

---

### BUG-3 — HIGH: Reuters RSS dead, 198 consecutive failures (WORSENING)

**Severity:** HIGH
**Status:** WORSENING (+19 failures vs 14:08Z)

**Re-probe evidence (16:06Z):**
- `get_system_status` → `Reuters RSS | Ngưng | Chưa bao giờ | 198 ⚠` (stopped, never succeeded in current deployment)
- Prior 14:08Z: 179 failures. Delta: +19 (approximately 1 failure per intelligenceCycleJob tick = ~9 cycles in 2h)

**Note:** VPS Reuters service was decommissioned in fix #7 (2026-04-30). The direct-server Reuters RSS is a separate source path and is also broken.

**Caller-surface verified:** No agent calls Reuters RSS directly; it feeds into `fetch_and_analyze` aggregation (news-scout flow/cycle.md). Reduces headline coverage.

**Recommended action:** Verify RSS feed URL at `feeds.reuters.com`; if permanently dead, decommission direct Reuters RSS path in MCP server to stop error accumulation.

---

### BUG-4 — HIGH: TradingEconomics 2 sources dead, 198 failures each (WORSENING)

**Severity:** HIGH
**Status:** WORSENING (+19 failures each vs 14:08Z)

**Re-probe evidence (16:06Z):**
- `get_system_status` → `Trading Economics | Ngưng | Chưa bao giờ | 198 ⚠` × 2 instances
- `get_macro_snapshot` → `oilUsdDelta: null, goldUsdDelta: null, usdVndDelta: null` — all delta fields null (TE provides delta computation)
- Prior 14:08Z: 179 each. Same +19 trajectory as Reuters.

**Caller-surface verified:** market-watcher, news-scout, unified-agent (CHEF macro layer) all depend on `get_macro_snapshot` which aggregates TE data. Macro deltas silently null.

**Recommended action:** Check Playwright/Chromium health in Docker container (`docker exec mcp-server chromium --version`); verify TE scraper in `apps/mcp-server/src/`. Likely "Target closed" Playwright crash (known recurring issue per fix #5).

---

### BUG-SENTIMENT — HIGH: `get_sentiment_trend({})` broken, fb-market-poster caller unpatched (UNCHANGED)

**Severity:** HIGH
**Status:** UNCHANGED

**Re-probe evidence (16:10Z):**
- Live probe: `call_tool(server="vn-market", tool="get_sentiment_trend", arguments={})` → `{"error":"Error: stock_code (or symbol) is required"}`
- Tool REQUIRES `stock_code` param but fb-market-poster calls it without any args.

**Caller-surface verified:**
- Grep: `docs/agents/fb-market-poster/flow/main.md:118` — confirmed unpatched caller
- 1 affected caller (fb-market-poster cycle fails to get sentiment data every run)

**Recommended action:** Patch `docs/agents/fb-market-poster/flow/main.md:118` — either pass `stock_code` for a watchlist anchor ticker or iterate over watchlist tickers and call per-ticker.

---

## ACTIVE ISSUEs — Re-confirmed This Cycle

### ISSUE-ISM: FRED API key missing (UNCHANGED)

**Re-probe (16:10Z):** `get_ism_subcomponents({})` → `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`
**Callers:** news-scout, unified-agent, bctc-analyst (macro regime signal inputs)
**Action:** Set `FRED_API_KEY` env var on MCP server.

---

### ISSUE-WTI: Stale WTI price $95.5 (UNCHANGED)

**Re-probe (16:06Z):** `get_system_status` → `wti_crude_usd: 95.5 (79 data points)`
**Reality check:** Brent at $80.59 (June 2026) — $14.91 WTI premium is physically impossible (WTI historically trades at discount to Brent). WTI $95.5 is stale seeded data.
**Callers:** unified-agent macro layer, news-scout commodity context
**Action:** Fix TradingEconomics WTI source (same root as BUG-4).

---

### ISSUE-DJIA: Stale DJIA 23,750 (UNCHANGED)

**Re-probe (16:06Z):** `get_system_status` → `dow_jones: 23750 (49 data points)`
**Reality check:** Actual DJIA June 2026 ~42,000+. 23,750 matches pre-COVID 2019/2020 level.
**Callers:** unified-agent macro layer, news-scout
**Action:** Requires working TradingEconomics or alternate DJIA data source.

---

### ISSUE-SBV-PARSE: SBV HTML parse failing (UNCHANGED)

**Re-probe (16:10Z):** `get_vn_liquidity_state({})` → `policy_rates.source: "sbv_rates DB fallback (HTML parse failed)"`, `is_estimate: true`. `get_system_status` confirms recurring `storeSbvSnapshot REJECTED — zero-value would overwrite good prior row`.
**Callers:** intelligenceCycleJob, sbvRatesRefreshJob, market-watcher
**Action:** SBV website likely changed HTML structure; update CSS selectors in scraper.

---

### ISSUE-LIQUIDITY: VN liquidity metrics null/zero (UNCHANGED)

**Re-probe (16:10Z):** `get_vn_liquidity_state({})` →
```
sjc_price_mn_vnd: 0 (SJC not machine-readable)
usd_vnd_buy: 0 / usd_vnd_sell: 0
cny_vnd_rate: 0
omo_outstanding_bn_vnd: null ("no add/absorb rows found")
interbank_overnight_rate: null ("dttktt.sbv.gov.vn unreachable — 100% packet loss")
```
**Root cause:** dttktt.sbv.gov.vn unreachable from VPS (100% packet loss, same root as ISSUE-SBV-PARSE).
**Callers:** system-auditor, market-watcher
**Action:** Fix SBV scraper selectors or use alternate SBV endpoint.

---

### ISSUE-WEEKLY-AUDIT: Weekly DB integrity audit not running — NEW

**Severity:** MEDIUM
**Status:** NEW (first identified this cycle)

**Evidence (16:06Z):**
- `get_system_status` → `last_weekly_audit: 2026-06-06 18:00:00` — 2 weeks old; June 14 Sunday run was missed
- `get_cron_health` → `integrityCheck` (schedule: `0 2 * * 0`) is **absent** from cron health registry
- `docs/agent-memory/modules/scheduler.md §Audits` → only `monthlySignalQualityJob.ts` listed; no weekly audit implementation
- `docs/data/system-map.json` has `integrityCheck` cron defined but it is not registered in `src/scheduler/jobs.ts`

**Context:** `dataAuditJob:daily` runs successfully (100%, last_run 16:00Z today). Weekly audit is a separate unimplemented gap.
**Caller-surface verified:** system-auditor reads `last_weekly_audit` from `get_system_status`; 1 direct caller affected; DB integrity checking blind spot for 2+ weeks.
**Open warnings:** 47 high/critical items currently in system — weekly audit miss means these may be accumulating untracked.

**Recommended action:** Implement `integrityCheck` in `src/scheduler/audits/integrityCheckJob.ts` and register in `src/scheduler/jobs.ts` at `0 2 * * 0`.

---

## NON-ISSUEs Verified This Cycle

| Finding | Probe | Verdict |
|---------|-------|---------|
| Stock prices 31h stale | EXPECTED — Saturday, VN market closed (last trade: Friday Jun 19 09:00 VN) | NON-ISSUE |
| Market-hours jobs (vnIndexRefreshJob, foreignFlowFetcherJob, etc.) last ran Jun 19 | EXPECTED — Saturday, crons run Mon–Fri only | NON-ISSUE |
| VPS vn-price-fetch and vn-foreign-flow idle | EXPECTED — market closed; idle status is correct per VPS health | NON-ISSUE |
| `get_agent_signals` requires `agent` in inbox mode | All flow callers use `from_agent: null` (all-producers mode) — confirmed by grep on market-watcher/flow/main.md, news-scout/flow/stage-bootstrap.md, alert-commander/flow/stage-signals.md | NON-ISSUE |

---

## IMPROVE (No Callers Currently Broken)

| Finding | Impact |
|---------|--------|
| intelligenceCycleJob fires HNX price fetch 24/7 — HNX doesn't serve data outside market hours → noisy off-hours errors every 15 min on weekends | Error noise; no circuit breaker accumulation, but obscures real HNX errors. Add market-hours guard in intelligenceCycleJob HNX path (same pattern as TASK 1407 foreignFlow fix). |
| `get_bctc_refined` returns `{"error":"no refined units found"}` for empty state instead of `{"units":[]}` | bctc-analyst flow handles gracefully; purely cosmetic. Change to `{units:[]}` for consistent JSON shape. |
| `emit_pressure_state` accepts arbitrary `state` strings despite docs specifying `normal\|high\|critical` only | No known caller sends invalid values; add enum validation to prevent silent misuse. |
| `task_claim.md` docs omit `minimum ttl_seconds: 60` constraint | All callers use ≥60s (verified grep); doc gap only — no runtime impact. |

---

## Tool Probe Coverage (This Cycle)

| Tool | Probe Result | Status |
|------|-------------|--------|
| `get_cycle_bootstrap` | OK (agent_name="market-watcher") | ✅ |
| `get_system_status` | OK — confirms BUG-2/3/4, ISSUE-WTI/DJIA/SBV | ✅ |
| `get_market_snapshot` | OK (VN-Index 1,824.53, breadth data) | ✅ |
| `get_macro_snapshot` | OK — null deltas confirm BUG-4 | ✅ |
| `get_sla_status` | OK — confirms BUG-1 (5484 min) | ✅ |
| `get_pipeline_health` | OK — confirms BUG-2 (rows=0 HNX/UPCOM tickers) | ✅ |
| `get_vps_proxy_health` | OK — confirms BUG-1 (STALE bctc, 0 pushes 24h) | ✅ |
| `get_vps_service_health` | OK — confirms BUG-1 (vn-bctc-fetch unhealthy) | ✅ |
| `get_cron_health` | OK — reveals ISSUE-WEEKLY-AUDIT (integrityCheck absent) | ✅ |
| `get_earnings_calendar` | OK (41 tickers, 12 overdue) | ✅ |
| `get_watchlist` | OK (41 tickers) | ✅ |
| `get_agent_signals` (from_agent:null) | OK (6 signals returned) | ✅ |
| `get_sentiment_trend` (no args) | FAIL → BUG-SENTIMENT re-confirmed | 🔴 |
| `get_ism_subcomponents` | FAIL → ISSUE-ISM re-confirmed | ⚠️ |
| `get_vn_liquidity_state` | FAIL → ISSUE-LIQUIDITY/SBV-PARSE re-confirmed | ⚠️ |
| `task_claim` / `task_release` | OK (claim+release cycle verified) | ✅ |
| `emit_pressure_state` | OK (stale_warning expected off-hours) | ✅ |
| `get_macro_snapshot` | OK (source_tier 2, null deltas) | ✅ |

---

## RESOLVED — None This Cycle

No prior findings resolved between 14:08Z and 16:10Z.

---

*Generated by health-recheck agent at 2026-06-20T16:10Z*
