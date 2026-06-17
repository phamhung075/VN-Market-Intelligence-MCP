# Team MCP Tool Health Recheck — 2026-06-16 20:09 UTC

**Run by:** health-recheck agent (scheduled)
**Gateway transport:** ✅ LIVE — `vn-market` reachable via `mcp__gateway__call_tool`
**Probe method:** read-only calls only; no state mutations
**Prior report:** `team-tool-recheck-2026-06-16-1809.md` (2h00m gap)
**Re-probe mandate:** STEP 3c — every prior finding re-executed this cycle before carry-forward

---

## DELTA SUMMARY vs 18:09 UTC

| Finding | Prior State | This Cycle | Action |
|---|---|---|---|
| BUG-4 `get_system_status` timeout | CONDITIONALLY RESOLVED (server restarted 16:55) | **RECURRED** — timeout after 60s, confirmed ×2 | 🔴 RE-OPEN |
| ISSUE-3 bctcQueueEnricher 0 URLs | ACTIVE, 1330min SLA breach | **WORSENING** — 1452min (+122min) | 🔴 WORSE |
| ISSUE-6 SBV FX SLA mismatch | ACTIVE | **RESOLVED** — sbv_fx 7/30min OK at probe | ✅ CLOSE |
| BUG-1/2/3, ISSUE-1/2/5, IMPROVE-1/2/3/4 | ACTIVE | **UNCHANGED** | ↔ CARRY |

---

## RESOLVED THIS CYCLE

### ISSUE-6 — SBV FX SLA Threshold Mismatch (RESOLVED — oscillating artifact)

| Field | Value |
|---|---|
| Prior class | ISSUE |
| Delta | **NOT BREACHED** at probe time |
| Proof | `get_sla_status: sbv_fx \| 7 min \| 30 min SLA \| ok` — VPS push 5min before probe |
| Note | sbvRatesRefreshJob cadence mismatch still exists structurally; the breach oscillates. IMPROVE suggestion still valid: relax threshold to ~360min. Dropping from active ISSUE tally. |

---

## ACTIVE FINDINGS — BUGS (re-confirmed this cycle)

### BUG-4 — `get_system_status` 60s Timeout (RECURRED — predicted in prior report)

| Field | Value |
|---|---|
| Tool | `get_system_status` |
| Class | **BUG** (timeout regression — recurred as predicted) |
| Severity | HIGH |
| Caller count | **6 flow files** — `market-watcher/flow/main.md:36` (abort-on-fail smoke probe), `system-auditor/flow/tier1-probe.md:115`, `tran-ngoc-bau/flow/bootstrap.md:26`, `unified-agent/flow/market-bootstrap.md:13`, `po/flow/channel-audit.md:73`, `po/flow/market-group.md:33` |

**Re-probe evidence (this cycle):**
```
Probe 1: get_system_status standalone (parallel batch round 2)
→ MCP server "gateway" tool "call_tool" timed out after 60s

Probe 2: get_system_status standalone (parallel batch round 3)
→ MCP server "gateway" tool "call_tool" timed out after 60s

Sibling calls in same batch that SUCCEEDED: get_macro_snapshot, get_market_context,
get_earnings_calendar, get_cron_health — ruling out gateway transport failure.

get_cycle_bootstrap: returns system_status in 1ms (lightweight cached version, unaffected).
mcpServerStartup last_run: 2026-06-16 16:55:00 (3h14m before probe) — restart window elapsed.
```

**Root cause (from prior report, unaddressed):** Trading Economics Chromium fetch hangs without a per-call timeout guard in `getSystemStatus.ts`. Server restart at 16:55 UTC cleared hanging connections temporarily. BUG recurs ~3h after restart when TE fetch blocks again. No code fix landed (verified: `get_recent_fixes` top 20 — no TE timeout guard entry).

**Impact:** market-watcher/flow/main.md step 3 calls `get_system_status` as a smoke probe; on timeout it `send_telegram(channel="bug", ...)` + EXIT — every market-watcher agent cycle aborts at step 0. 5 additional flow files calling `get_system_status` also affected.

**Suggested fix:** In `getSystemStatus.ts`, add `Promise.race([<TE fetch>, timeout(3000)])` per external source. Alternatively, replace the market-watcher smoke probe with `get_cycle_bootstrap` (already includes fast system_status in 1ms).

---

### BUG-1 — HVN Alert Dedup Regression (OPEN — scan jobs not wired to fingerprint)

| Field | Value |
|---|---|
| Tool | `alertScanParallelJob` / `computeAlertFingerprint` |
| Class | **BUG** (regression) |
| Severity | HIGH |
| Delta vs 18:09 | Unchanged — no fix in `get_recent_fixes` (top 20); BUG-1 task not in `task_list_held` |
| Affected callers | alert-commander, unified-agent, all cowork alert consumers |

**Re-probe evidence (this cycle):**
```
get_cycle_bootstrap alerts (24h): 12 identical [HIGH] HVN (price_surge, volume_spike) 08:46–08:59 UTC
All: "HVN volume spike: 3.5× average (422,060 vs avg 121,720)"
→ Same identical dedup-missing pattern as prior cycles.
get_recent_fixes top 20: no computeAlertFingerprint wiring in scan jobs.
```

**Root cause:** `alertScanParallelJob` does not call `computeAlertFingerprint` from `alertDedup.ts`. Helper exists but not imported by scan jobs. **Unchanged.**

**Suggested fix:** Import + invoke `computeAlertFingerprint` in `taAlertScanJob`/`bbAlertScanJob` before DB insert.

---

### BUG-2 — Tool SSOT: `ticker` param in `get_technical_indicators.md` (schema drift)

| Field | Value |
|---|---|
| Tools | `get_technical_indicators`, `get_price_history` examples in `market-watcher` package |
| Class | **BUG** (doc/contract drift — SSOT wrong) |
| Severity | MEDIUM |
| Delta vs 18:09 | Unchanged |
| Caller count | 0 affected runtime callers (cycle.md uses `code` correctly) |

**Re-probe evidence (this cycle):**
```
grep docs/agents/tools/list/get_technical_indicators.md:8
→ "| `ticker` | `string` | Company code |"  ← WRONG (should be `code`)

Live probe: get_technical_indicators({"ticker": "FPT"})
→ MCP error -32602: Required: code (path: ["code"])

Live probe: get_technical_indicators({"code": "FPT"}) → ✅ OK

grep docs/agents/tools/package/market-watcher.md:177
→ arguments: { ticker: "FPT" }  ← WRONG
grep docs/agents/tools/package/market-watcher.md:147
→ tickers: ["VCB", "ACB", "FPT"]  ← WRONG (get_price_history takes code: string)

Caller-surface verified: market-watcher/flow/cycle.md:77 uses `code` correctly — 0 broken runtime callers.
```

**Suggested fix:** Update `docs/agents/tools/list/get_technical_indicators.md:8` — `ticker` → `code`. Update market-watcher package examples lines 147, 177, 208.

---

### BUG-3 — `get_agent_signals(from_agent=…)` Fails Schema Validation

| Field | Value |
|---|---|
| Tool | `get_agent_signals` |
| Class | **BUG** (schema — `agent` required even when `from_agent` supplied) |
| Severity | MEDIUM-HIGH |
| Delta vs 18:09 | Unchanged |
| Affected callers | news-scout stage-bootstrap.md:39 (1 confirmed runtime caller, every cycle) |

**Re-probe evidence (this cycle):**
```
get_agent_signals({"from_agent": "news-scout", "status": "all", "hours_back": 6})
→ MCP error -32602: Input validation error: agent Required (path: ["agent"])

get_agent_signals({"agent": "market-watcher"}) → ✅ OK (correct param works)
```

**Impact:** news-scout SELF_SIGNALS_CACHE silently empty → FILTER_HINT_* adaptation permanently disabled. **Unchanged.**

**Suggested fix:** In `agentSignalTools.ts`, make `agent` optional when `from_agent` is present.

---

## ACTIVE FINDINGS — ISSUES (re-confirmed this cycle)

### ISSUE-3 — bctcQueueEnricher: 0 URLs, 38+ consecutive cycles (WORSENING)

| Field | Value |
|---|---|
| Class | **ISSUE** (BCTC URL discovery broken; SLA CRITICAL, worsening) |
| Severity | HIGH |
| Delta vs 18:09 | **WORSENING** — 1452min vs 1330min (+122min, consistent decay ~1min/min) |
| Affected callers | bctc-analyst (pipeline starved), refine_bctc_md, SLA monitor |

**Re-probe evidence (this cycle):**
```
get_sla_status: bctc | 1452 min | 360 min SLA | breached | CRITICAL
  Prior (18:09): 1330 min → +122 min in 2h — consistent linear decay confirming no fix landed.
get_vps_proxy_health: bctc | 2026-06-16 18:02:24 | 1 item | ok | 1 24h pushes | 0 errors
  → VPS connectivity healthy; issue is discovery (0 URLs returned), not connectivity.
get_cron_health: bctcQueueEnricherJob | success_rate=1.00 (99.6%) | last_run=20:00:00
  → Job "succeeds" (exit 0) even with 0 URLs — misleading metric.
```

**Root cause (unchanged):** `/proxy/bctc-discover/:ticker` returns 0 URLs. VPS up but discovery endpoint broken. No fix confirmed in `get_recent_fixes`.

**Suggested fix:** ops-vps-fetch: SSH probe `GET /proxy/bctc-discover/VNM` directly. If empty response, investigate bctc-discover scraper config on VPS.

---

### ISSUE-1 — Reuters RSS Circuit Breaker Dead

| Field | Value |
|---|---|
| Class | **ISSUE** (decommissioned source; CB noise) |
| Severity | LOW |
| Delta vs 18:09 | Cannot re-probe directly (`get_system_status` timeout). Classified unchanged. |

**Note:** `get_system_status` timeout (BUG-4) prevents direct source-health verification. Prior cycle confirmed `reuters RSS | Ngưng | Chưa bao giờ | 12 ⚠`. Status unchanged per `get_recent_fixes` (no reuters CB removal). **Carried forward pending `get_system_status` recovery.**

**Suggested fix:** Remove `reuters` CB entry from `circuitBreakerRegistry.ts`.

---

### ISSUE-2 — Trading Economics Dead (2 sources, Chromium failures)

| Field | Value |
|---|---|
| Class | **ISSUE** (Chromium scrape persistent failure — also root cause of BUG-4 recurrence) |
| Severity | MEDIUM |
| Delta vs 18:09 | **LIKELY WORSENING** — BUG-4 recurrence (2h cycle) confirms TE Chromium still hanging. Cannot confirm directly due to `get_system_status` timeout. |

**Note:** BUG-4 recurrence itself is indirect proof TE Chromium is still hanging (same root cause as prior cycle). No TE fix in `get_recent_fixes`. ISSUE-2 and BUG-4 share the same root cause and fix.

**Suggested fix:** Add ≤3s per-source timeout guard in `getSystemStatus.ts`. Secondary: replace TE Chromium with VPS-side or direct HTTP scrape.

---

### ISSUE-5 — vnstockTradingStatsRefresh: 50% Success Rate

| Field | Value |
|---|---|
| Class | **ISSUE** (alarming failure rate; small 2-run sample) |
| Severity | LOW |
| Delta vs 18:09 | Unchanged — 2 runs, 50%, 943,711ms avg |

**Re-probe evidence:**
```
get_cron_health: vnstockTradingStatsRefresh: success_rate=0.50, total_runs=2, avg_duration=943711ms
```

---

## IMPROVE FINDINGS (re-confirmed this cycle)

### IMPROVE-1 — unified-agent chef.md uses `agent_id` instead of `agent_name`

**Re-probe (this cycle):**
```
grep docs/agents/unified-agent/flow/chef.md:91
→ 'Call `get_cycle_bootstrap(agent_id="unified-agent")` first.'
Live schema: agent_name is the required param (agent_id → validation error).
```
**Unchanged.**

---

### IMPROVE-2 — `get_cycle_bootstrap` Doc: Missing `bctc-analyst`, Deprecated Enum Values

**Re-probe (this cycle):**
```
grep docs/agents/tools/list/get_cycle_bootstrap.md:4,16
→ agents: [news-scout, financial-analyst, report-analyzer, market-watcher, ...]
→ Missing: bctc-analyst | Still listed (deprecated): financial-analyst, report-analyzer
Live schema confirmed: bctc-analyst IS valid (probed this cycle: SUCCESS).
```
**Unchanged.**

---

### IMPROVE-3 — bctcReparseJob 81.4% (borderline, threshold 80%)

**Re-probe:**
```
get_cron_health: bctcReparseJob: success_rate=0.81 (81.4%), total_runs=183, avg_duration=288642ms
```
**Unchanged.**

---

### IMPROVE-4 — newsapi Source Disabled (undocumented)

**Status:** Cannot re-probe directly (`get_system_status` timeout). Prior evidence: `newsapi | disabled`. Carried unchanged. **Unchanged.**

---

## PROBE COVERAGE SUMMARY

| Tool | Result | Latency | Notes |
|---|---|---|---|
| `get_system_status` | ❌ TIMEOUT | 60s+ | **BUG-4 RECURRED** — 2h after CONDITIONAL RESOLVE |
| `get_cycle_bootstrap({agent_name:"news-scout"})` | ✅ OK | 55ms | system_status in 1ms (fast cached path unaffected) |
| `get_market_snapshot` | ✅ OK | ~2s | VN-Index 1807.94 (+0.48%) |
| `get_macro_snapshot` | ✅ OK | fast | investment clock CORE_VN tier 8; carry NEUTRAL |
| `get_market_context` | ✅ OK | fast | 41 watchlist stocks, prices current to 08:59 UTC |
| `get_earnings_calendar` | ✅ OK | fast | 41 stocks; BID/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH still OVERDUE |
| `get_cron_health` | ✅ OK | fast | ISSUE-5 unchanged; bctcReparseJob 81.4% (IMPROVE-3) |
| `get_vps_proxy_health` | ✅ OK | fast | All VPS services healthy; bctc push 18:02 UTC |
| `get_sla_status` | ✅ OK | fast | bctc CRITICAL 1452/360min (ISSUE-3 worsening); sbv_fx OK (ISSUE-6 closed) |
| `get_watchlist` | ✅ OK | fast | 41 tickers, thresholds healthy |
| `get_pipeline_health` | ✅ OK | fast | TA ready for 34/41 tickers; BDI/DAG/DLC/JSH/SIS/VDC/VNH not ready |
| `get_vps_service_health` | ✅ OK | fast | 3 healthy, 2 idle (market closed — expected) |
| `get_technical_indicators({code:"FPT"})` | ✅ OK | fast | correct `code` param works; BUG-2 schema drift still in docs |
| `get_technical_indicators({ticker:"FPT"})` | ❌ FAILS | — | BUG-2 confirmed — validation error |
| `get_price_history({code:"VCB",days:10})` | ✅ OK | fast | 7 days returned correctly |
| `get_ticker_intelligence({code:"VCB"})` | ✅ OK | fast | intelligence brief returned |
| `get_agent_signals({agent:"market-watcher"})` | ✅ OK | fast | correct param works |
| `get_agent_signals({from_agent:"news-scout",...})` | ❌ FAILS | — | BUG-3 confirmed — agent Required |
| `task_claim` / `task_release` | ✅ OK | fast | coordination DB healthy |
| `get_recent_fixes(limit=20)` | ✅ OK | fast | No BUG-1/3/4 fixes; last entry: 2026-05-12 HEADLOCK |

---

## TRIAGE PRIORITY (this cycle)

| # | Finding | Class | Action Owner | Priority |
|---|---|---|---|---|
| 1 | **BUG-4 RECURRED** — `get_system_status` timeout + TE Chromium root cause | BUG-4 + ISSUE-2 | dev-mcp-server / dev-mainserver-crawls | 🔴 HIGH — add ≤3s timeout guard in getSystemStatus.ts; fix TE Chromium |
| 2 | bctcQueueEnricher 0 URLs — 1452min SLA CRITICAL, worsening ~1min/min | ISSUE-3 | ops-vps-fetch | 🔴 HIGH — SSH probe `/proxy/bctc-discover/VNM` immediately |
| 3 | HVN alert dedup — 12 identical HIGH alerts, scan jobs not wired to fingerprint | BUG-1 | dev-alert-engine | 🟠 MEDIUM — wire before next market open 02:00 UTC |
| 4 | `get_agent_signals(from_agent=…)` fails — news-scout broken every cycle | BUG-3 | dev-mcp-server | 🟠 MEDIUM — make `agent` optional when `from_agent` present |
| 5 | Tool SSOT: `get_technical_indicators.md:8` uses `ticker` not `code` | BUG-2 | dev-mcp-server | 🟠 MEDIUM — 1-line doc fix + market-watcher package examples |
| 6 | Reuters RSS CB stale (decommissioned source) | ISSUE-1 | dev-mcp-server | 🟡 LOW — remove CB entry |
| 7 | vnstockTradingStatsRefresh 50%, 943s avg (2 runs) | ISSUE-5 | dev-mcp-server | 🟡 LOW — investigate |
| 8 | unified-agent chef.md `agent_id` wrong param | IMPROVE-1 | dev-mcp-server | 🟡 LOW — doc fix |
| 9 | get_cycle_bootstrap doc missing bctc-analyst + deprecated enum | IMPROVE-2 | dev-mcp-server | 🟡 LOW — doc + schema cleanup |
| 10 | bctcReparseJob 81.4% borderline (threshold 80%) | IMPROVE-3 | dev-mcp-server | 🔵 WATCH |
| 11 | newsapi disabled undocumented | IMPROVE-4 | dev-mcp-server | 🔵 DOCUMENT |
| 12 | SBV FX SLA threshold < job cadence (structural) | IMPROVE (ex-ISSUE-6) | dev-mcp-server | 🔵 IMPROVE — relax to ~360min |

**Report path:** `docs/agent-memory/health/team-tool-recheck-2026-06-16-2009.md`
