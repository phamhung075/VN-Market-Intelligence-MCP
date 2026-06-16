# Team MCP Tool Health Recheck — 2026-06-16 12:04 UTC

**Run by:** health-recheck agent (scheduled)  
**Gateway transport:** ✅ LIVE — `vn-market` reachable, `get_system_status` responded in <1s  
**Uptime at probe time:** 2h 30m 11s  
**Probe method:** read-only calls only; no state mutations  
**Prior report:** `team-tool-recheck-2026-06-16-1006.md` (2h gap)

---

## ACTIVE FINDINGS (re-confirmed this cycle)

### BUG-1 — HVN Alert Dedup Regression (WORSENED since 10:06 report)

| Field | Value |
|---|---|
| Tool | Alert generation / `alertScanParallelJob` → `taAlertScanJob`, `bbAlertScanJob` |
| Class | **BUG** (regression) |
| Severity | HIGH |
| Affected callers | alert-commander, unified-agent, all alert consumers |
| Delta vs prior | **26 duplicates** this cycle (up from 14 at 10:06 UTC) |

**Re-probe evidence (get_alerts this cycle):**
```
26 identical HIGH alerts for HVN price_surge,volume_spike from 08:37–08:59 UTC
Each: "HVN volume spike: 3.5× average (422,060 vs avg 121,720)"
All unique random IDs (alert-mqge...) — dedup not triggering
```

**Root cause (this cycle's code read):**  
`apps/mcp-server/src/domain/services/alertDedup.ts` provides `computeAlertFingerprint()` with a 60-min dedup window.  
`apps/mcp-server/src/scheduler/alerts/alertScanParallelJob.ts` — grep for "dedup|fingerprint|INSERT OR IGNORE|cooldown|window" returned **No matches found**. The scan job delegates to `runTaAlertScan()` and `runBbAlertScan()` without invoking `computeAlertFingerprint`. The dedup domain helper exists but is not wired to the alert scan path.

**Caller-surface grep:**  
`grep -r "alert-commander\|get_alerts" docs/agents/*/flow/*.md` — all cowork agents consume the alert bus via `get_cycle_bootstrap` → `agent_signals`. The 665 pending alerts (system_status this cycle) are overwhelming the signal queue.

**Suggested fix:** Wire `computeAlertFingerprint` into `taAlertScanJob` (or its alert store call) — check the last 60 min for a matching fingerprint before inserting. Alternatively add a composite dedup key `(ticker, signal_type, day)` at the DB INSERT level.

---

### BUG-2 — Tool List SSOT docs say `ticker`; live server requires `code`

| Field | Value |
|---|---|
| Tools | `get_technical_indicators`, `get_price_history` |
| Class | **BUG** (doc/contract drift — SSOT is wrong) |
| Severity | MEDIUM |
| Affected callers | 0 runtime broken (flows use `code`); any agent re-reading SSOT list docs |
| Delta vs prior | Unchanged — not re-probed (doc-only issue; no code change observed) |

**From prior report (carried forward — verified per step 3c no code fix landed):**  
- `docs/agents/tools/list/get_technical_indicators.md:8` → wrong: `ticker: string`  
- `docs/agents/tools/list/get_price_history.md:8` → wrong: `ticker: string`  
- `docs/agents/tools/package/market-watcher.md:147,177,208` → wrong `ticker/tickers` params  
- Live flow files use correct `code` param — 0 runtime agents broken today  

**Suggested fix:** Update the three SSOT list docs and market-watcher package examples.

---

### ISSUE-1 — Reuters RSS circuit breaker dead (23 consecutive failures, never succeeded)

| Field | Value |
|---|---|
| Source | `reuters` in `circuitBreakerRegistry.ts:40` |
| Class | **ISSUE** (decommissioned source; stale CB pollutes SOURCE HEALTH) |
| Severity | LOW (news coverage unaffected — other sources healthy) |
| Delta vs prior | Unchanged; failure count grew from 5→23 (server restart at 09:33) |

**Re-probe evidence (get_system_status this cycle):**
```
Reuters RSS | Ngưng | Chưa bao giờ | 23 ⚠
```

**Context:** `vn-reuters-fetch.service` decommissioned 2026-04-30 (fix #7: dead feeds.reuters.com URLs). CB still registered in `apps/mcp-server/src/infrastructure/circuitBreakerRegistry.ts:40`. The "never succeeded" is expected — there is no live Reuters fetcher. This is noise in SOURCE HEALTH that can mislead system-auditor.

**Suggested fix:** Remove the `reuters` CB from `circuitBreakerRegistry.ts` or add a `disabled: true` flag so it is excluded from SOURCE HEALTH reporting.

---

### ISSUE-2 — Trading Economics dead (2 sources, 23 consecutive failures each)

| Field | Value |
|---|---|
| Source | Two TradingEconomics entries in SOURCE HEALTH |
| Class | **ISSUE** (persistent Chromium scrape failure) |
| Severity | MEDIUM (macro commodity data gap) |
| Delta vs prior | Unchanged; failure count grew from 5→23 (consistent with restart at 09:33) |

**Re-probe evidence (get_system_status this cycle):**
```
Trading Economics | Ngưng | Chưa bao giờ | 23 ⚠  (×2 entries)
```

**Context:** `tradingEconomicsChromium.ts` + `tradingEconomicsStream.ts` both registered. Chromium-based scrape has had recurring OOM/Playwright crashes (fixes #5, #6 April 2026). Server restart at 09:33 UTC today and TE never succeeded in the 2.5h window. `macroIndicatorRefreshJob` still shows 100% success (last run 2026-06-15 12:13 UTC) — SBV/IMF/Yahoo Finance filling the gap. But TE-specific indicators (shipping index, DXY detail) are absent.

**Suggested fix:** Check mcp-server container logs for Playwright errors post-restart. Consider replacing `tradingEconomicsChromium.ts` with a direct HTTP approach or VPS-side scrape where Chromium is stable.

---

### ISSUE-3 — bctcQueueEnricher: 0 URLs for VEA (inactive), VNH, VDC — 10 WARN/cycle

| Field | Value |
|---|---|
| Tool | bctcQueueEnricherJob (every 15 min) |
| Class | **ISSUE** (noisy; VEA is inactive watchlist item) |
| Severity | LOW-MEDIUM |
| Delta vs prior | Unchanged — same 3 tickers, same pattern |

**Re-probe evidence (get_system_status this cycle, 12:00:30–12:00:48 UTC):**
```
[WARN] bctcQueueEnricher: 0 URLs found for ticker VEA
[WARN] bctcQueueEnricher: 0 URLs found for ticker VEA  (×4 in burst)
[WARN] bctcQueueEnricher: 0 URLs populated across all 10 item(s)
[WARN] bctcQueueEnricher: 0 URLs found for ticker VNH  (×2)
[WARN] bctcQueueEnricher: 0 URLs found for ticker VDC  (×2)
```

**Root cause A — VEA:** `docs/data/system-map.json` watchlist: `VEA active=false` (note: "Removed sprint-054"). bctcQueueEnricherJob reads from `bctc_vps_queue` without filtering by watchlist `active` flag (confirmed: grep in `bctcQueueEnricherJob.ts` for "active" → "No matches found").

**Root cause B — VNH/VDC:** VNH has 5 OHLCV rows (TA not ready), VDC has 0. Both have no discoverable BCTC source URL via the VPS geo-blocked endpoint. `MAX_ENRICH_ATTEMPTS=5` constant defined but VEA items appear to keep retrying beyond that limit.

**Suggested fix:** (A) Add `WHERE ticker NOT IN (SELECT ticker FROM watchlist WHERE active=false)` to the enricher's queue query. (B) Verify `MAX_ENRICH_ATTEMPTS` is being enforced — if VEA has exceeded 5 attempts it should be in `url_not_found` status.

---

### ISSUE-4 — BCTC VPS push pipeline stalled ~60 hours (CRITICAL SLA breach)

| Field | Value |
|---|---|
| Source | `bctc` in VPS proxy health |
| Class | **ISSUE** (pipeline stall; SLA CRITICAL breach) |
| Severity | HIGH (Q1-2026 filing window active) |
| Delta vs prior | WORSENED — SLA 970/360min CRITICAL (was 72h/within-threshold at 10:06 report) |

**Re-probe evidence (get_vps_proxy_health + get_sla_status this cycle):**
```
bctc | 2026-06-13 23:45:12 | 1 item | ok | 0 pushes/24h | STALE ⚠
SLA: bctc 970/360min — CRITICAL breach
```

**VPS service health:** `vn-bctc-fetch: healthy` — VPS service alive but producing zero pushes in 60h.

**Context:** Q1-2026 filing window is active — `get_earnings_calendar` shows 10 tickers QUÁ HẠN (overdue): ACV, BDI, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VEA, VNH, VDC. SLA threshold during earnings window = 24h (per system-map.json `sla.earnings_window`). Today is June 16 = M=6, out of trigger months [1,4,7,10] → default 168h threshold applies. But 970min (16.2h) vs 360min SLA suggests the SLA threshold in the monitoring code may be using a different value.

**Suggested fix:** Trigger `trigger_bctc_vps_fetch` to kick the VPS pipeline. Then check VPS logs for why `vn-bctc-fetch` is healthy but not pushing.

---

### ISSUE-5 — vnstockTradingStatsRefresh: 50% success rate, 15.7-min avg duration

| Field | Value |
|---|---|
| Cron | vnstockTradingStatsRefresh |
| Class | **ISSUE** (low sample; failure rate and duration alarming) |
| Severity | LOW (only 2 runs since restart) |
| Delta vs prior | Unchanged |

**Re-probe evidence (get_cron_health this cycle):**
```
vnstockTradingStatsRefresh
  last_run:     2026-06-16 08:30:01
  last_status:  success
  success_rate: 0.50 (50%)
  total_runs:   2
  avg_duration: 943,711ms (~15.7 min)
```

One of two runs failed. Duration near 16 min suggests timeout or rate-limit hang.

---

## NEW FINDINGS (first appearance this cycle)

### IMPROVE-1 — `unified-agent` chef.md uses wrong param name `agent_id` vs `agent_name`

| Field | Value |
|---|---|
| File | `docs/agents/unified-agent/flow/chef.md:91` |
| Class | **IMPROVE** (doc inconsistency; may cause LLM agent to pass wrong arg) |
| Affected callers | unified-agent (1 caller — the primary synthesis agent) |

**Evidence (grep this cycle):**
```
docs/agents/unified-agent/flow/chef.md:91:
  Call `get_cycle_bootstrap(agent_id="unified-agent")` first.
```

Live tool requires `agent_name` (validated this cycle: no-arg probe → error field path = "agent_name"). Package doc `docs/agents/tools/package/unified-agent.md:151` correctly shows `agent_name: "unified-agent"`. An LLM agent following chef.md prose literally and passing `agent_id` will get a Zod validation error before the handler runs.

**Suggested fix:** Update `chef.md:91` — change `agent_id` to `agent_name`.

---

### IMPROVE-2 — `get_cycle_bootstrap` tool doc enum missing `bctc-analyst`

| Field | Value |
|---|---|
| File | `docs/agents/tools/list/get_cycle_bootstrap.md:4` |
| Class | **IMPROVE** (doc drift — live server accepts it) |
| Affected callers | 0 runtime broken (live server accepts "bctc-analyst") |

**Evidence (probed this cycle):**
```
get_cycle_bootstrap({agent_name: "bctc-analyst"}) → ✅ success (returned market_context + agent_signals)
```

Tool doc YAML agents list: `[news-scout, financial-analyst, report-analyzer, market-watcher, alert-commander, digest-predict, qa-responder, unified-agent]` — no "bctc-analyst". Package doc `docs/agents/tools/package/bctc-analyst.md:31` instructs `agent_name: "bctc-analyst"`. Live server schema accepts it — doc was not updated when bctc-analyst was added.

**Suggested fix:** Add `bctc-analyst` to the agents enum list in `get_cycle_bootstrap.md`.

---

## IMPROVE (CARRIED FROM PRIOR — unchanged)

### IMPROVE-3 — bctcReparseJob borderline 80.9% success rate

**Re-confirmed:** `success_rate: 0.81 (80.9%)`, `avg_duration: 302,482ms` (unchanged from 10:06 report). CronHealthAlertJob threshold is 80%. This job is one bad run from triggering an alert.

### IMPROVE-4 — newsapi source disabled (undocumented)

**Re-confirmed:** `newsapi | disabled | Chưa bao giờ | 0` in SOURCE HEALTH. No entry in system-map.json or recent-fixes explaining the disable. If intentional (e.g. API key expired), should be documented.

---

## RESOLVED (re-probed this cycle — no longer reproducing)

None. All prior BUG/ISSUE findings from the 10:06 UTC report re-confirmed active.

---

## PROBE COVERAGE SUMMARY

| Tool | Probe Result | Latency | Notes |
|---|---|---|---|
| `get_system_status` | ✅ OK | <1s | Core health; 10 unresolved errors |
| `get_cycle_bootstrap` | ✅ OK | 7–26ms | Requires `agent_name`; accepts `bctc-analyst` live |
| `get_market_snapshot` | ✅ OK | fast | VN-Index 1807.94 (+0.48%) |
| `get_macro_snapshot` | ✅ OK | fast | All macro signals live |
| `get_cron_health` | ✅ OK | fast | 70+ jobs; see ISSUE-5, IMPROVE-3 |
| `get_vps_proxy_health` | ✅ OK | fast | prices/news/sbv fresh; bctc STALE |
| `get_vps_service_health` | ✅ OK | fast | 3 healthy, 2 idle (market closed) |
| `get_earnings_calendar` | ✅ OK | fast | 41 tickers; 10+ QUÁ HẠN |
| `get_pipeline_health` | ✅ OK | fast | 35/41 TA-ready; 6 not-ready |
| `get_sla_status` | ✅ OK | fast | bctc CRITICAL breach |
| `get_recent_fixes` | ✅ OK | fast | 20 fixes; no fix for open BUGs |
| `get_alerts` | ✅ OK | fast | 30 HVN alerts visible; dedup broken |
| `task_list_held` | ✅ OK | fast | 6 cowork-slot locks (normal) |
| `send_telegram` | ⏭ SKIP | — | Write tool; BUG channel alert sent end-of-run |
| `post_agent_signal` | ⏭ SKIP | — | Write tool; not mutated |

---

## TRIAGE PRIORITY

| # | Finding | Class | Action Owner | Priority |
|---|---|---|---|---|
| 1 | HVN alert dedup regression (26 dups today) | BUG | dev-alert-engine | 🔴 HIGH — wire `computeAlertFingerprint` into scan path |
| 2 | BCTC VPS push 60h stall — SLA CRITICAL | ISSUE | ops-vps-fetch | 🔴 HIGH — trigger `trigger_bctc_vps_fetch` |
| 3 | Tool list SSOT `ticker` vs live `code` | BUG | dev-mcp-server | 🟠 MEDIUM — doc fix |
| 4 | Trading Economics 23 consecutive failures | ISSUE | dev-mainserver-crawls | 🟠 MEDIUM — Chromium restart/alternative |
| 5 | bctcQueueEnricher VEA inactive + VNH/VDC | ISSUE | dev-mcp-server | 🟠 MEDIUM — 1-line active filter fix |
| 6 | unified-agent chef.md `agent_id` wrong param | IMPROVE | dev-mcp-server | 🟡 LOW — doc fix |
| 7 | Reuters CB stale in status | ISSUE | dev-mcp-server | 🟡 LOW — remove from registry |
| 8 | vnstockTradingStatsRefresh 50% rate | ISSUE | dev-mcp-server | 🟡 LOW — small sample |
| 9 | get_cycle_bootstrap doc missing bctc-analyst | IMPROVE | dev-mcp-server | 🔵 COSMETIC |
| 10 | bctcReparseJob 80.9% (borderline) | IMPROVE | dev-mcp-server | 🔵 WATCH |
| 11 | newsapi disabled undocumented | IMPROVE | dev-mcp-server | 🔵 DOCUMENT |

**Report path:** `docs/agent-memory/health/team-tool-recheck-2026-06-16-1204.md`
