# Team MCP Tool Health Recheck — 2026-06-18 00:06 UTC

**Run by:** health-recheck routine  
**Scope:** All MCP tools depended on by cowork + dev agents  
**Method:** Read-only smoke probes via `mcp__gateway__call_tool(server="vn-market", ...)`  
**Prior report:** `team-tool-recheck-2026-06-17-2211.md`  
**STEP 3c prior-finding re-probe:** All 8 prior findings re-executed this cycle — results below.

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| BUG | 2 | BCTC pipeline: vn-bctc-fetch still unhealthy (+2h), zero-URL cycles now 243 (+13 from prior) |
| ISSUE | 5 | ISM no_data (FRED_API_KEY), Reuters/TE stopped, BDI 72d stale, chef.md agent_id drift (NEW), vnstockTradingStatsRefresh 67% (NEW) |
| IMPROVE | 4 | Bootstrap enum deprecated names, cascade metrics 0 outcomes, task_claim min undocumented, bctcReparseJob 260s avg |
| RESOLVED | 0 | — |

All BUG/ISSUE findings have ≥1 confirmed affected caller.

---

## ACTIVE FINDINGS (re-confirmed this cycle)

---

### BUG-1 — vn-bctc-fetch VPS service UNHEALTHY → WORSENING

**Prior (22:11 UTC):** `unhealthy | 1d 4h 2m uptime`  
**Current (00:06 UTC):** `unhealthy | 1d 6h 2m uptime`  
**Re-probe command:** `get_vps_service_health({})` → `vn-bctc-fetch | unhealthy | 14s ago | 0ms | 1d 6h 2m`  
**Re-probe status:** UNCHANGED (service has been unhealthy for ≥30h, getting no healthier)

**Evidence this cycle:**
- `get_vps_service_health` → `vn-bctc-fetch: unhealthy`
- `get_vps_proxy_health` → bctc last push `2026-06-16 18:02:24 UTC`, 0 pushes in 24h, status: STALE
- VPS uptime counter still climbing (not restarted) — no recovery action taken

**Caller surface verified:** `docs/agents/bctc-analyst/flow/main.md` — bctc-analyst depends on vn-bctc-fetch for new Q1-2026 filing discovery. `docs/agents/refine_bctc_md/flow/main.md` — refine_bctc_md processes PDF units pushed via this service.  
**Affected callers: 2**

**Action:** Restart `vn-bctc-fetch` service on VPS. Check crash logs. Verify URL scraper health post-restart.

---

### BUG-2 — bctcQueueEnricher consecutive_zero_cycles=243 → WORSENING

**Prior (22:11 UTC):** consecutive_zero_cycles=230  
**Current (00:06 UTC):** consecutive_zero_cycles=243 (+13 cycles = +3.25h)  
**Re-probe command:** `get_system_status({})` WARN entry: `bctcQueueEnricher: zero-url-alert: consecutive_zero_cycles=243`  
**Re-probe status:** UNCHANGED (active failure, worsening)

**Evidence this cycle:**
- `zero-url-alert: consecutive_zero_cycles=243` → 243 × 15min = **60.75 hours** total BCTC URL discovery failure
- `get_sla_status` → bctc SLA **CRITICAL BREACH**: 1642 min elapsed vs 360 min SLA (4.6× over threshold)
- `get_bctc_pending_refine` → 4+ PDFs in PENDING/PARTIAL state (VCB PARTIAL, HPG/GVR/HVN PENDING)
- System errors: `[bctcQueueEnricher] 0 URLs found for ticker VEA — scrape may be stale or source unavailable`
- Additional WARN: `[bctcQueueEnricher] 0 URLs populated across all 8 item(s) — all sources may be unavailable or geo-blocked`

**Root cause:** Same as BUG-1 — vn-bctc-fetch unhealthy starves the queue enricher of source URLs.

**Caller surface verified:** `docs/agents/bctc-analyst/flow/main.md` (bctc-analyst), `docs/agents/refine_bctc_md/flow/main.md` (refine_bctc_md). Financial report analysis pipeline frozen for ~61h. 10 tickers marked QUÁ HẠN (overdue) in earnings calendar with no new PDF fetch.  
**Affected callers: 2**

**Action:** Same as BUG-1 — fixing vn-bctc-fetch will allow queue enricher to recover within 2 cycles.

---

### ISSUE-3 — `get_ism_subcomponents` returns no_data (FRED_API_KEY absent) → UNCHANGED

**Prior (22:11 UTC):** `error: "no_data"` — FRED_API_KEY missing  
**Current re-probe:** `get_ism_subcomponents({})` → `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`  
**Re-probe status:** UNCHANGED

**Caller surface:** Confirmed callers per prior report — news-scout, unified-agent, bctc-analyst tool packages all list this tool. Failure is soft-degraded (tool packages mark it optional context).  
**Affected callers: 3**

**Action:** Configure `FRED_API_KEY` env var for macro-indicators service. Trigger `macroIndicatorRefreshJob`.

---

### ISSUE-4 — Reuters RSS and Trading Economics permanently stopped → UNCHANGED

**Prior (22:11 UTC):** 17 consecutive failures each  
**Current re-probe:** `get_system_status({})` SOURCE HEALTH section  
- Reuters RSS: status `Ngưng (Stopped)`, `Chưa bao giờ (never succeeded)`, 10 consecutive failures (counter reset after server restart at 23:17 UTC, immediately resumed failing)  
- Trading Economics ×2: status `Ngưng`, `Chưa bao giờ`, 10 consecutive failures each  
**Re-probe status:** UNCHANGED (failure count reset by restart but still failing)

**Context:** Reuters VPS service was decommissioned 2026-04-30 (fix #7 in get_recent_fixes). The source health still tracks a direct RSS fetch path that is attempting dead URLs. Trading Economics likely affected by Cloudflare anti-bot / Chromium stability in Docker.

**Caller surface:** `intelligenceCycleJob` (pollNews), news-scout via `fetch_and_analyze`. These agents currently operate in `source_tier: 2` mode as a consequence.  
**Affected callers: 2**

**Action:** 
- Reuters: Remove dead RSS feed from source health registry or mark as `disabled` (same as newsapi); it was decommissioned 2026-04-30.
- Trading Economics: Investigate Chromium container health; or mark as disabled if chromium scrape is unreliable in current Docker config.

---

### ISSUE-5 — `get_supply_chain_exposure` BDI data 72 days stale → UNCHANGED

**Prior (22:11 UTC):** BDI last data 2026-04-07 (70d stale)  
**Current re-probe:** `get_supply_chain_exposure({})` → `BDI: 1,400 (+0.0%) - 2026-04-07`  
**Re-probe status:** UNCHANGED (now 72 days stale as of 2026-06-18)

**Caller surface:** market-watcher, unified-agent, digest-predict, tran-ngoc-bau tool packages. BDI feeds supply chain risk scoring.  
**Affected callers: 4**

**Action:** Investigate BDI scraper — check if source URL changed. VPS crawler logs may show fetch errors.

---

### ISSUE-N1 — `unified-agent/flow/chef.md` uses `agent_id` instead of `agent_name` (NEW)

**Evidence:**  
```
grep: docs/agents/unified-agent/flow/chef.md:91: Call `get_cycle_bootstrap(agent_id="unified-agent")` first.
```
The live tool schema requires `agent_name` (confirmed this cycle: probing without arg yields `"received": "undefined", "path": ["agent_name"]`). The tools/package/unified-agent.md correctly shows `agent_name: "unified-agent"`.

**Caller surface verified:**
- Grep `agent_id.*unified-agent` in `docs/agents/unified-agent/flow/` → 1 match: `chef.md:91`
- Grep `agent_name.*unified-agent` in `docs/agents/tools/package/unified-agent.md` → correctly documented
- All other agent flow files (news-scout, market-watcher, bctc-analyst, etc.) use `agent_name` correctly

**Impact:** If unified-agent follows chef.md pseudocode literally (using `agent_id`), the bootstrap call fails with schema validation error, skipping the entire GATHER phase. The tools/package is the canonical call recipe, so runtime impact depends on which doc the agent prioritizes.  
**Affected callers: 1 (unified-agent)**

**Action:** Fix `docs/agents/unified-agent/flow/chef.md` line 91 — change `agent_id=` to `agent_name=`.

---

### ISSUE-N2 — `vnstockTradingStatsRefresh` cron success rate 67% (below 80% threshold) (NEW)

**Evidence:**  
`get_cron_health` → `vnstockTradingStatsRefresh: success_rate: 0.67 (66.7%), total_runs: 3, avg_duration: 915464ms (915s!)`  
Last run: 2026-06-17 08:30:01 (success).  
The `cronHealthAlertJob` fires when any job `success_rate < 80%` — this should have triggered.

**Note:** Only 3 total runs — low sample. But 915s average duration (15 min!) suggests this job is extremely heavy and may be hitting timeout or resource contention.

**Caller surface:** `vnstockTradingStatsRefresh` populates fundamental trading statistics used by `get_financial_summary` and `get_ticker_intelligence`. Both are used by bctc-analyst and market-analyst agents.  
**Affected callers: 2**

**Action:** Check `vnstockTradingStatsRefresh` job logs for failure cause. If timeout-related, consider splitting job or raising timeout. 915s avg duration is likely causing OOM or timeout.

---

## IMPROVE FINDINGS (re-confirmed this cycle)

---

### IMPROVE-6 — `get_cycle_bootstrap` enum contains deprecated agent names → UNCHANGED

**Re-probe:** `get_cycle_bootstrap({})` → error reveals enum: `'news-scout' | 'financial-analyst' | 'market-watcher' | 'alert-commander' | 'digest-predict' | 'qa-responder' | 'unified-agent' | 'report-analyzer' | 'bctc-analyst'`  
**Status:** `financial-analyst` and `report-analyzer` still present (deprecated, superseded by `bctc-analyst`).

**Action:** Remove deprecated names from MCP server enum. Low priority — no functional breakage.

---

### IMPROVE-7 — `get_cascade_metrics` returns 0 outcomes for all rules → UNCHANGED

**Re-probe:** `get_cascade_metrics({})` → All 46 rules: `Eval=0, WinRate=—`. `cascade-backtest` cron success rate 100%, last run 2026-06-17 20:37 UTC.  
**Status:** UNCHANGED. Outcome computation still broken despite successful cron runs.

**Action:** Audit cascade-backtest cron — job marks success but doesn't write to outcomes table. Likely a DB write path bug or orphan query in outcome-linkage logic.

---

### IMPROVE-8 — `task_claim` minimum TTL=60s not documented → UNCHANGED

**Re-probe:** `docs/agents/tools/list/task_claim.md` → line 11: `ttl_seconds | number | Timeout optional` — no minimum stated.  
**Status:** UNCHANGED. Documentation gap persists.

**Action:** Add `minimum: 60` to `task_claim.md` TTL field description.

---

### IMPROVE-N3 — `bctcReparseJob` high failure rate trend + extreme duration (NEW)

**Evidence:** `get_cron_health` → `bctcReparseJob: success_rate: 0.82 (82.0%), total_runs: 172, avg_duration: 260,471ms (260s)`  
Success rate is just above the 80% alert threshold. Average duration is 260 seconds — indicating heavy PDF OCR processing load.

**Action:** Monitor trend. If success rate drops below 80%, investigate. Avg 260s duration may indicate resource pressure from concurrent PDF processing.

---

### IMPROVE-N4 — HNX/UPCOM price errors during off-market hours generating DB noise

**Evidence:** `get_system_status` → 8+ errors in last ~3 min: `[hnx] all HNX price sources failed`, `[hnx] all UPCOM price sources failed`. These occur at 00:00-00:03 UTC, well outside VN market hours (02:00-08:59 UTC Mon-Fri). Market is CLOSED; VPS price service correctly shows `idle`.  
**Context:** `intelligenceCycleJob` runs `*/15 min` (no market-hours gate) and appears to attempt HNX/UPCOM price fetches regardless, filling the error log with noise and inflating the `open_warnings: 47` count in DB audit.

**Action:** Add market-hours gate to HNX/UPCOM price fetch path in `intelligenceCycleJob`, or suppress these errors from the unresolved-error count during off-hours.

---

## Tool Probe Results Matrix

| Tool | Status | Notes |
|------|--------|-------|
| `get_cycle_bootstrap` (with agent_name) | ✅ OK | Returns full context; `agent_id` typo in chef.md (ISSUE-N1) |
| `get_market_snapshot` | ✅ OK | VN-Index 1806.20 (-0.10%), breadth 168/129/65 |
| `get_macro_snapshot` | ✅ OK | tier-2; oil $78.86, gold $4295.3, USD/VND 26113 |
| `get_cron_health` | ⚠️ WARN | vnstockTradingStatsRefresh 67% (ISSUE-N2), bctcReparseJob 82% |
| `get_system_status` | ⚠️ WARN | 10 unresolved errors (HNX x8, bctcQueueEnricher x2) |
| `get_sla_status` | ❌ BREACHED | bctc 1642/360min CRITICAL; news 37/30min HIGH |
| `get_vps_service_health` | ❌ UNHEALTHY | vn-bctc-fetch unhealthy (BUG-1) |
| `get_vps_proxy_health` | ❌ STALE | bctc last push >30h ago (BUG-1/BUG-2) |
| `get_bctc_pending_refine` | ⚠️ BACKLOG | VCB PARTIAL, HPG/GVR/HVN PENDING — frozen by BUG-1 |
| `get_earnings_calendar` | ✅ OK | 10 tickers QUÁ HẠN (overdue) — BCTC pipeline freeze |
| `get_pipeline_health` | ✅ OK | TA ready for 35/41 tickers; BDI/DLC/JSH/SIS/VDC/VNH sparse |
| `task_list_held` | ✅ OK | 10 held locks, all expected (cowork-leader, published slots) |
| `get_earnings_calendar` | ✅ OK | Operational |
| `get_ism_subcomponents` | ❌ no_data | FRED_API_KEY absent (ISSUE-3, prior carry-forward) |
| `get_supply_chain_exposure` | ⚠️ STALE | BDI 2026-04-07 (72d stale) (ISSUE-5, prior carry-forward) |
| `get_cascade_metrics` | ⚠️ ZERO | All 46 rules Eval=0 (IMPROVE-7, prior carry-forward) |
| `get_recent_fixes` | ✅ OK | 20 fixes accessible |
| `get_agent_signals` | ✅ OK | Signal bus operational |

---

## STEP 3c: Prior Finding Delta

| Finding | Prior Status | Current Status | Delta |
|---------|-------------|----------------|-------|
| BUG-1 vn-bctc-fetch unhealthy | active | active | UNCHANGED (uptime +2h) |
| BUG-2 zero-URL cycles=230 | active | active=243 | UNCHANGED (worsening +13 cycles) |
| ISSUE-3 ISM no_data | active | active | UNCHANGED |
| ISSUE-4 Reuters/TE stopped | active | active | UNCHANGED (reset counter, still failing) |
| ISSUE-5 BDI 70d stale | active | active (72d) | UNCHANGED |
| IMPROVE-6 bootstrap enum deprecated | active | active | UNCHANGED |
| IMPROVE-7 cascade metrics 0 outcomes | active | active | UNCHANGED |
| IMPROVE-8 task_claim TTL undocumented | active | active | UNCHANGED |

No prior findings resolved this cycle.

---

*Generated: 2026-06-18 00:06 UTC by health-recheck routine.*
