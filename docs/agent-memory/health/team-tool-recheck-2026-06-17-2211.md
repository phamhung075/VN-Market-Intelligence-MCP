# Team MCP Tool Health Recheck — 2026-06-17 22:11 UTC

**Run by:** health-recheck routine  
**Scope:** All MCP tools depended on by cowork + dev agents  
**Method:** Read-only smoke probes via `mcp__gateway__call_tool(server="vn-market", ...)`  
**Tool surface scanned:** 164 tools on vn-market server (from system-map.json)  
**Agents covered:** market-watcher, news-scout, unified-agent, bctc-analyst, alert-commander, digest-predict, system-auditor, qa-responder, fb-market-poster  

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| BUG | 2 | BCTC VPS service down, bctcQueueEnricher 57.5h failure + SLA breach |
| ISSUE | 3 | ISM no_data (FRED key missing), Reuters/TradingEcon source failures, BDI 70d stale |
| IMPROVE | 3 | Bootstrap enum stale, cascade metrics uncomputed, task_claim TTL undocumented |

---

## Findings

### BUG-1 — vn-bctc-fetch VPS service UNHEALTHY (CRITICAL)

**Tool probed:** `get_vps_service_health`, `get_vps_proxy_health`  
**Evidence:**
- `get_vps_service_health` → `vn-bctc-fetch | unhealthy | 35s ago | 0ms response | 1d 4h 2m uptime`
- `get_vps_proxy_health` → bctc last push 2026-06-16 18:02:24 UTC, **0 pushes in last 24h**, status: STALE

**Blast radius:** bctcQueueEnricher cannot fetch URLs from VPS → BCTC PDF pipeline starved → bctc-analyst agent operates on stale data. Confirmed in `docs/agents/ops/flow/bctc.md`, `docs/architecture-briefs/2026-06-16-bctc-pipeline-durability.md`.  
**Action needed:** Restart `vn-bctc-fetch` service on VPS; investigate crash logs; verify URL scraper health.

---

### BUG-2 — bctcQueueEnricher 230 consecutive zero-cycles + BCTC SLA CRITICAL breach

**Tool probed:** `get_system_status`, `get_sla_status`  
**Evidence:**
- `get_system_status` WARN entries: "0 URLs found for ticker X — scrape may be stale or source unavailable" × 10 tickers
- `zero-url-alert: consecutive_zero_cycles=230` → 230 × 15min cadence = **~57.5 hours** of complete BCTC URL discovery failure
- `get_sla_status` → bctc SLA **BREACHED**: 1524 min elapsed vs 360 min SLA = **4.2× over threshold** (CRITICAL)
- `get_bctc_pending_refine` confirms large backlog: VCB Q1-2025 `refine_status=PARTIAL`, `confirm_status=PENDING`

**Blast radius:** bctc-analyst agent running all cycles with no new BCTC source URLs. Financial report analysis pipeline is effectively frozen for ~57.5h.  
**Action needed:** Fix vn-bctc-fetch (see BUG-1). After restart, verify queue picks up URLs within 2 cycles. Monitor `consecutive_zero_cycles` resets to 0.

---

### ISSUE-3 — `get_ism_subcomponents` returns no_data (FRED_API_KEY absent)

**Tool probed:** `get_ism_subcomponents`  
**Evidence:**
```json
{
  "source_tier": 1,
  "error": "no_data",
  "message": "fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."
}
```
**Blast radius — confirmed callers:**
- `docs/agents/tools/package/news-scout.md` — news-scout uses ISM for US monetary chain context
- `docs/agents/tools/package/unified-agent.md` — unified-agent uses ISM for macro regime signals
- `docs/agents/tools/package/bctc-analyst.md` — bctc-analyst uses ISM as macro overlay
- `docs/agents/dev-macro-indicators/flow/main.md` — explicitly names FRED_API_KEY requirement; macro-indicators service is responsible for populating this
- Flow files (`docs/agents/*/flow/**/*.md`) do NOT directly call `get_ism_subcomponents` — it is listed in tool packages only, so agents can call it opportunistically; failure is soft-degraded not hard-broken.

**Action needed:** Configure `FRED_API_KEY` env var for macro-indicators service and trigger `macroIndicatorRefreshJob`. See `docs/agents/ops/flow/docker.md` — note c71 incident warning: restart macro-indicators service in isolation only, not with `--force-recreate` fleet-wide.

---

### ISSUE-4 — Reuters RSS and Trading Economics — 17 consecutive source failures each

**Tool probed:** `get_system_status`  
**Evidence:**
- Reuters RSS: status "Ngưng", 17 consecutive failures
- Trading Economics: status "Ngưng", 17 consecutive failures (×2 entries)
- These sources have not successfully delivered data in the current probe window

**Blast radius:** `fetch_and_analyze` (news-scout) operates in `source_tier: 2` mode — confirmed in probe response. International financial data context is degraded. `get_macro_snapshot` falls back to local data.  
**Action needed:** Check if Reuters RSS endpoint URL has changed (anti-bot challenge or feed URL rotation). For Trading Economics, verify API key / credential validity. Both are referenced in VPS source config.

---

### ISSUE-5 — `get_supply_chain_exposure` BDI data 70 days stale

**Tool probed:** `get_supply_chain_exposure`  
**Evidence:** BDI (Baltic Dry Index) last data point: 2026-04-07 — **70 days stale** as of 2026-06-17  
**Blast radius — confirmed callers:**
- `docs/agents/market-watcher/flow/cycle.md`
- `docs/agents/unified-agent/flow/market-analysis.md`
- `docs/agents/digest-predict/flow/daily.md`
- Tool packages: market-watcher, unified-agent, tran-ngoc-bau, digest-predict

BDI feeds supply chain risk scoring. Stale index means shipping cost trends not reflected in risk calculations.  
**Action needed:** Investigate BDI scraper — source URL may have changed or scraper is failing silently. Check VPS crawler logs for `bdi` fetch errors.

---

### IMPROVE-6 — `get_cycle_bootstrap` enum contains deprecated agent names

**Tool probed:** `get_cycle_bootstrap(agent_name="health-recheck")` → validation error revealing enum  
**Evidence:** Enum still includes `"financial-analyst"` and `"report-analyzer"` — both superseded by `"bctc-analyst"` per tool package timestamp 2026-05-29. These slots waste enum space and could mislead new agent implementations.  
**Action needed:** Remove `"financial-analyst"` and `"report-analyzer"` from the bootstrap enum in MCP server schema. Low priority, no functional breakage confirmed.

---

### IMPROVE-7 — `get_cascade_metrics` returns 0 outcomes evaluated for all 46+ rules

**Tool probed:** `get_cascade_metrics`  
**Evidence:** All 46+ cascade rules show `Eval=0`, `WinRate=—` despite recording hundreds of signal hits. cascade-backtest cron last ran 2026-06-17 20:37 UTC (success rate 100%) but outcome computation yields zero results.  
**Blast radius — confirmed callers:**
- `docs/agents/tools/package/unified-agent.md`
- `docs/agents/tools/package/digest-predict.md`
- `docs/agents/digest-predict/flow/weekly.md` (direct flow call confirmed)

unified-agent and digest-predict both rely on cascade effectiveness data for signal weighting. Zero outcomes means `WinRate` guidance is permanently unavailable, degrading confidence calibration.  
**Action needed:** Audit cascade-backtest cron — the job runs successfully but outcomes table stays at 0. Likely a DB write issue or outcome-linkage query bug. Check `get_cascade_outcomes` for related diagnostic.

---

### IMPROVE-8 — `task_claim` minimum TTL=60s not documented in tool contract

**Tool probed:** `task_claim(ttl_seconds=30)` → schema error: "Number must be greater than or equal to 60"  
**Evidence:** `docs/agents/tools/list/task_claim.md` line 11: `| ttl_seconds | number | Timeout optional |` — no minimum stated.  
**Blast radius:** Any flow or agent passing `ttl_seconds < 60` (e.g. 30 for a quick lock) will fail with schema validation error. bctc-analyst flow uses `task_claim` for dedup guard.  
**Action needed:** Update `docs/agents/tools/list/task_claim.md` to document `minimum: 60`. Low effort, prevents future confusion.

---

## Tool Probe Results Matrix

| Tool | Status | Notes |
|------|--------|-------|
| `get_cycle_bootstrap` | ✅ OK | enum: 9 valid names; 2 deprecated |
| `get_system_status` | ✅ OK (with WARNs) | 10 WARN entries for zero-URL BCTC |
| `get_market_snapshot` | ✅ OK | VN-Index 1324.35, normal trading |
| `get_market_context` | ✅ OK | Market closed (22:10 UTC) |
| `get_watchlist` | ✅ OK | 34 active tickers |
| `get_cron_health` | ✅ OK | All scheduled jobs running |
| `get_pipeline_health` | ✅ OK | Pipelines running; BCTC queue starved |
| `get_vps_proxy_health` | ⚠️ STALE | bctc: 0 pushes in 24h (BUG-1) |
| `get_vps_service_health` | ❌ UNHEALTHY | vn-bctc-fetch unhealthy (BUG-1) |
| `get_sla_status` | ❌ BREACHED | bctc 1524min vs 360min SLA (BUG-2) |
| `get_rate_limit_status` | ✅ OK | All API limits healthy |
| `get_macro_snapshot` | ✅ OK | Macro data available, tier-2 |
| `get_fed_liquidity_spread` | ✅ OK | EFFR-IORB spread computed |
| `get_ism_subcomponents` | ❌ no_data | FRED_API_KEY absent (ISSUE-3) |
| `get_alerts` | ✅ OK | Alert bus operational |
| `get_agent_signals` | ✅ OK | Signal bus operational |
| `get_technical_indicators` | ✅ OK | Full indicator set returned |
| `get_ticker_intelligence` | ✅ OK | Momentum/vol/correlation data |
| `get_sector_rotation` | ✅ OK | 16-sector rotation data |
| `get_investment_clock_phase` | ✅ OK | Phase returned |
| `get_earnings_calendar` | ✅ OK | Filing deadlines populated |
| `get_recent_fixes` | ✅ OK | Recent fix log accessible |
| `get_supply_chain_exposure` | ⚠️ STALE | BDI 70 days stale (ISSUE-5) |
| `get_climate_risk_signals` | ✅ OK | Seasonal risk data present |
| `get_energy_grid_signals` | ✅ OK | Grid status normal (estimated) |
| `get_crisis_early_warning` | ✅ OK | No active crisis signals |
| `get_legal_risk_signals` | ✅ OK | Legal risk data present |
| `get_cascade_metrics` | ⚠️ ZERO | 0 outcomes for all 46+ rules (IMPROVE-7) |
| `get_prediction_markets` | ✅ OK | 1 active prediction market |
| `get_portfolio_conviction` | ✅ OK | Portfolio conviction data returned |
| `get_portfolio_risk` | ✅ OK | VaR computed (FPT 100% position) |
| `get_sentiment_trend` | ✅ OK | VCB sentiment: worsening, slope -1.00 |
| `get_kinhdich_reading` | ✅ OK | Hexagram reading returned |
| `get_bctc_full` | ✅ OK | VCB BCTC data returned |
| `get_bctc_pending_refine` | ✅ OK (large) | Large backlog confirmed; 235k char response |
| `list_stored_pdfs` | ✅ OK | PDF inventory accessible |
| `get_macro_snapshot` | ✅ OK | Regime snapshot tier-2 |
| `fetch_and_analyze` | ✅ OK | 20 articles fetched (tier-2, no Reuters/TE) |
| `task_claim` | ✅ OK | min TTL=60s enforced (undocumented) |
| `task_release` | ✅ OK | Lock released successfully |
| `log_agent_work` | ✅ OK | Two-call pattern works |
| `post_agent_signal` | ✅ OK | Signal bus accepts writes |
| `send_telegram` | ✅ OK | (not test-fired — channel spam guardrail) |

---

## Open Items Carried Forward

None. All prior smoke-test artifacts cleaned up:
- `task_claim` lock `health-recheck:smoke-test:2026-06-17` → released ✅
- `log_agent_work` id=1417 → closed as `completed` ✅

---

*Generated by health-recheck routine. Next recheck: scheduled.*
