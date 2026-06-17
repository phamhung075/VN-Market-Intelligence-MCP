# Team MCP Tool Health Recheck — 2026-06-16 10:06 UTC

**Run by:** health-recheck agent (scheduled)  
**Gateway transport:** ✅ LIVE — `vn-market` reachable, `get_system_status` responded in <1s  
**Uptime at probe time:** 29m 41s (recent restart noted)  
**Probe method:** read-only calls only; no state mutations

---

## ACTIVE FINDINGS

### BUG-1 — HVN Alert Dedup Regression (HIGH IMPACT)

| Field | Value |
|---|---|
| Tool | alert dedup in `alertGenerator.ts` / alert-engine |
| Class | **BUG** (regression) |
| Severity | HIGH |
| Affected callers | alert-commander, unified-agent, all alert consumers |

**Evidence:**  
14 identical HIGH alerts fired for HVN `price_surge, volume_spike` every ~1 minute from 08:41–08:59 UTC today. All carry the same body: `"HVN volume spike: 3.5× average (422,060 vs avg 121,720)"`. Alert IDs are unique (dedup not triggering), but the content, ticker, and signal type are identical.

```
[HIGH] 2026-06-16T08:59 HVN price_surge, volume_spike  ← same message
[HIGH] 2026-06-16T08:57 HVN price_surge, volume_spike  ← same
[HIGH] 2026-06-16T08:56 HVN price_surge, volume_spike  ← same
... (14 total, 08:41–08:59)
```

**Prior fix:** `[BUGFIX] Deploy alert dedup fix in alertGenerator.ts` (2026-04-28, fix #18). That fix was confirmed deployed. This is a **regression** — same-ticker same-signal dedup cooldown is not suppressing within the intraday window.

**Grep verifying caller surface:**  
Flow files `docs/agents/alert-commander/flow/main.md`, `unified-agent/flow/chef.md`, and all cowork agents consume the alert bus. All are affected when dedup fails — the alert queue bloats, noise overwhelms signal, and alert-commander may fire redundant Telegram posts.

**Suggested fix:** Audit `alertGenerator.ts` — check if the dedup cooldown key includes `(ticker, signal_type, day)` composite. If the key only includes the alert ID, same-type same-ticker alerts on the same day will each get a unique ID and bypass dedup.

---

### BUG-2 — Tool List SSOT docs say `ticker`; live server requires `code` (schema drift)

| Field | Value |
|---|---|
| Tools | `get_technical_indicators`, `get_price_history` |
| Class | **BUG** (doc/contract drift — SSOT is wrong) |
| Severity | MEDIUM |
| Affected callers | New agents / any agent re-reading SSOT list docs |

**Evidence:**

Live server probe:
- `get_technical_indicators({ticker: "VCB"})` → `MCP error -32602: Required: code`
- `get_price_history({tickers: ["VCB"], days: 5})` → `MCP error -32602: Required: code`  
- `get_technical_indicators({code: "VCB"})` → ✅ returns RSI/MACD/BB  
- `get_price_history({code: "VCB", days: 5})` → ✅ returns OHLCV

**Canonical SSOT docs (WRONG):**
- `docs/agents/tools/list/get_technical_indicators.md:8` → `ticker: string`
- `docs/agents/tools/list/get_price_history.md:8` → `ticker: string`

**Package examples (WRONG):**
- `docs/agents/tools/package/market-watcher.md:147` → `tickers: ["VCB", "ACB", "FPT"]` (array, wrong)
- `docs/agents/tools/package/market-watcher.md:177` → `arguments: { ticker: "FPT" }` (wrong key)
- `docs/agents/tools/package/market-watcher.md:208` → `arguments: { ticker: "VCB" }` (wrong key)

**Caller surface verified (grep `get_technical_indicators` and `get_price_history` in docs/agents):**
- `docs/agents/market-watcher/flow/cycle.md:77` → `get_technical_indicators(code)` ✅ CORRECT
- `docs/agents/ops/flow/data-validation-checks.md:50` → `get_price_history(code=<ticker>)` ✅ CORRECT
- `docs/agents/tran-ngoc-bau/flow/audit-market.md:36` → `get_price_history(code=ticker)` ✅ CORRECT

**Assessment:** Flow files already use the working `code` param. Runtime agents running current flows are NOT broken. However, the SSOT list docs and package examples are wrong. Any agent re-reading the list docs to learn the schema will use `ticker` and get a validation error.

**Suggested fix:** Update `docs/agents/tools/list/get_technical_indicators.md` and `get_price_history.md` — rename `ticker` → `code`. Fix market-watcher.md examples at lines 147, 177, 208.

---

### ISSUE-1 — Reuters RSS dead (5 consecutive failures, never succeeded)

| Field | Value |
|---|---|
| Source | `reuters` circuit breaker |
| Class | **ISSUE** (source decommissioned but CB still tracked) |
| Impact | news coverage gap; CB appears broken in status |

**Evidence (get_system_status this cycle):**
```
Reuters RSS  | Ngưng  | Chưa bao giờ  | 5 ⚠
```

**Context:** `vn-reuters-fetch.service` was decommissioned 2026-04-30 (fix #7: "dead feeds.reuters.com URLs, redundant with direct MCP fetch"). But the Reuters circuit breaker is still registered and showing 5 consecutive failures in `get_system_status` output.

**Suggested fix:** Remove or mark the `reuters` circuit breaker as `disabled` in source health tracking so it doesn't pollute the system status with phantom failures.

---

### ISSUE-2 — Trading Economics dead (2 sources, 5 consecutive failures each, never succeeded)

| Field | Value |
|---|---|
| Source | Two Trading Economics entries in source health |
| Class | **ISSUE** (persistent fetch failures) |
| Impact | Macro data (commodity prices, yield curves) may be missing or stale |

**Evidence (get_system_status this cycle):**
```
Trading Economics  | Ngưng  | Chưa bao giờ  | 5 ⚠
Trading Economics  | Ngưng  | Chưa bao giờ  | 5 ⚠
```

**Context:** TE-Chromium has had recurring Playwright/OOM failures (fixes #5, #6 in April). `macroIndicatorRefreshJob` shows 100% success rate (last run 2026-06-15), so macros are flowing from other sources (SBV, IMF, Yahoo Finance). But TE-specific data (shipping index, commodities detail) may be absent.

**Suggested fix:** Investigate whether Chromium-based TE fetch is crashing inside Docker. Check `/app/logs` or container stdout for Playwright errors. Consider replacing Chromium TE fetch with a direct HTTP approach if the Chromium path is persistently unstable.

---

### ISSUE-3 — bctcQueueEnricher: 0 URLs for VEA, VNH, VDC (10 warnings/cycle)

| Field | Value |
|---|---|
| Tool | bctcQueueEnricher (cron) |
| Class | **ISSUE** (noisy false-failure; VEA is inactive watchlist item) |
| Impact | 10 unresolved system errors per 15-min cycle; BCTC enrichment blocked for VNH, VDC |

**Evidence (get_system_status this cycle):**
```
[WARN] bctcQueueEnricher: 0 URLs found for ticker VEA
[WARN] bctcQueueEnricher: 0 URLs populated across all 10 item(s)
[WARN] bctcQueueEnricher: 0 URLs found for ticker VNH
[WARN] bctcQueueEnricher: 0 URLs found for ticker VDC
```

**Root cause A — VEA:** `docs/data/system-map.json` marks VEA `active: false` (note: "Removed sprint-054"), but the bctcQueueEnricher still processes it. The BCTC enricher does not filter by watchlist `active` flag.

**Root cause B — VNH, VDC:** These tickers have no discoverable BCTC source URLs via the VPS geo-blocked endpoint. VNH has only 5 OHLCV rows (TA not ready); VDC has 0 rows.

**Suggested fix:** (A) Add `active=true` filter to bctcQueueEnricher's ticker selection query so inactive watchlist tickers are skipped. (B) For VNH/VDC, either add a skip-list mechanism or reduce retry frequency for tickers with repeated 0-URL results.

---

### ISSUE-4 — BCTC VPS proxy stale (72h since last push)

| Field | Value |
|---|---|
| Source | `bctc` in VPS proxy health |
| Class | **ISSUE** (pipeline stall, within 168h off-season threshold but 0 pushes in 24h) |
| Impact | BCTC enrichment pipeline running on server-side reparse only |

**Evidence (get_vps_proxy_health this cycle):**
```
bctc | 2026-06-13 23:45:12 | 1 item | ok | 0 pushes/24h | null errors | STALE ⚠
```

VPS service shows `vn-bctc-fetch: healthy` but zero pushes in 72h. Off-season threshold is 168h (June is not an earnings month per system-map.json). The 72h stall is technically within threshold but the VPS-side fetch appears inactive.

**Suggested fix:** SSH into VPS and check `vn-bctc-fetch` service status. May need `trigger_bctc_vps_fetch` to kick the pipeline.

---

### ISSUE-5 — vnstockTradingStatsRefresh: 50% success rate, 15.7-min avg duration

| Field | Value |
|---|---|
| Cron | vnstockTradingStatsRefresh |
| Class | **ISSUE** (low sample but alarming failure rate and duration) |
| Severity | LOW (only 2 runs) |

**Evidence (get_cron_health this cycle):**
```
vnstockTradingStatsRefresh
  success_rate: 0.50 (50.0%)
  total_runs:   2
  avg_duration: 943,711 ms  (~15.7 minutes)
```

One of two runs failed. 15.7-minute average suggests this job is either timing out or hitting vnstock API rate limits.

**Suggested fix:** Check scheduler logs for the failed run. If the duration indicates a hang, add a per-run timeout guard.

---

## IMPROVE FINDINGS

### IMPROVE-1 — bctcReparseJob: 80.9% success rate (borderline), 5-min avg duration

**Evidence:** `success_rate: 0.81 (80.9%)`, `avg_duration: 302,482ms`. The alert threshold is 80% (`cronHealthAlertJob` fires if any job < 80%). This job is at the edge. Duration of 5 min per run for a 09:34 VN daily job is acceptable but warrants monitoring.

---

### IMPROVE-2 — newsapi source disabled (may be intentional but undocumented)

**Evidence:** `newsapi | disabled | Chưa bao giờ | 0`. No documentation in system-map.json or recent fixes explaining why newsapi is disabled. If the API key expired, this should be noted.

---

## RESOLVED (re-probed this cycle — no longer reproducing)

None from prior reports confirmed resolved this cycle (this is the first formal recheck report in this format).

---

## PROBE COVERAGE SUMMARY

| Tool | Status | Notes |
|---|---|---|
| `get_system_status` | ✅ OK | Core health tool — all circuits open |
| `get_cycle_bootstrap` | ✅ OK | Requires `agent_name` param (correct schema) |
| `get_market_snapshot` | ✅ OK | VN-Index 1807.94 (+0.48%) |
| `get_macro_snapshot` | ✅ OK | All macro signals live |
| `get_cron_health` | ✅ OK | 70+ jobs tracked; see ISSUE-5 |
| `get_vps_proxy_health` | ✅ OK | prices/news/sbv fresh; bctc stale |
| `get_vps_service_health` | ✅ OK | 3 healthy, 2 idle (market closed) |
| `get_earnings_calendar` | ✅ OK | 41 tickers; 10 overdue |
| `get_pipeline_health` | ✅ OK | 35/41 tickers TA-ready |
| `get_technical_indicators` | ✅ OK (with `code`) | SSOT doc says `ticker` — see BUG-2 |
| `get_price_history` | ✅ OK (with `code`) | SSOT doc says `ticker` — see BUG-2 |
| `get_alerts` | ✅ OK | HVN dedup issue visible — see BUG-1 |
| `get_recent_fixes` | ✅ OK | 20 fixes returned |
| `task_claim` | ✅ OK schema | Enum: cowork-slot/sprint-task/dashboard-row/commit-mutex |
| `send_telegram` | ✅ SKIP | Write tool — not probed to avoid spam |
| `log_agent_work` | ✅ SKIP | Write tool — not probed to avoid state mutation |
| `get_news` | ❌ NOT FOUND | Tool does not exist; callers correctly use `fetch_and_analyze` |

---

## TRIAGE PRIORITY

| # | Finding | Class | Action Owner | Priority |
|---|---|---|---|---|
| 1 | HVN alert dedup regression | BUG | dev-alert-engine | 🔴 HIGH — fix today |
| 2 | Tool list SSOT `ticker` vs live `code` | BUG | dev-mcp-server | 🟠 MEDIUM — fix before next agent onboard |
| 3 | bctcQueueEnricher VEA inactive + VNH/VDC no URLs | ISSUE | dev-mcp-server | 🟠 MEDIUM — VEA filter is 1-line fix |
| 4 | Trading Economics dead (2 sources) | ISSUE | dev-mainserver-crawls | 🟡 MEDIUM — TE data gap |
| 5 | Reuters CB stale in status | ISSUE | dev-mcp-server | 🟡 LOW — cosmetic but noisy |
| 6 | BCTC VPS 72h stall | ISSUE | ops-vps-fetch | 🟡 LOW — within threshold |
| 7 | vnstockTradingStatsRefresh 50% rate | ISSUE | dev-mcp-server | 🟡 LOW — small sample |
| 8 | bctcReparseJob borderline 80.9% | IMPROVE | dev-mcp-server | 🔵 WATCH |
| 9 | newsapi disabled undocumented | IMPROVE | dev-mcp-server | 🔵 DOCUMENT |

**Report path:** `docs/agent-memory/health/team-tool-recheck-2026-06-16-1006.md`
