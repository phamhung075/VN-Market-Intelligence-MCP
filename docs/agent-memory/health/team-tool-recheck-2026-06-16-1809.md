# Team MCP Tool Health Recheck — 2026-06-16 18:09 UTC

**Run by:** health-recheck agent (scheduled)
**Gateway transport:** ✅ LIVE — `vn-market` reachable via `mcp__gateway__call_tool`
**Probe method:** read-only calls only; no state mutations
**Prior report:** `team-tool-recheck-2026-06-16-1611.md` (1h58m gap)
**Re-probe mandate:** STEP 3c — every prior finding re-executed this cycle before carry-forward

---

## RESOLVED THIS CYCLE

### BUG-4 — `get_system_status` 60s Timeout (CONDITIONALLY RESOLVED)

| Field | Value |
|---|---|
| Prior class | BUG (tool degraded — consistent 60s timeout) |
| Delta | **SYMPTOM GONE** — full response returned <5s this cycle |
| Proof | `get_system_status` returned complete output at 18:03:36 UTC; `mcpServerStartup last_run: 2026-06-16 16:55:00` (server restarted 1h14m before this probe) |
| Root cause note | Server restart at 16:55 UTC cleared hanging TE Chromium connections. Trading Economics STILL failing (12 consecutive failures) — no per-call timeout guard added. **BUG-4 will recur on next TE-hang cycle.** Classify CONDITIONALLY RESOLVED. |

---

### ISSUE-4 — BCTC VPS Pipeline Stalled 64h+ (RESOLVED)

| Field | Value |
|---|---|
| Prior class | ISSUE (VPS pipeline stalled, worsening) |
| Delta | **RESOLVED** — VPS bctc proxy now `ok` |
| Proof | `get_vps_proxy_health: bctc \| 2026-06-16 18:02:24 \| 1 items \| ok \| All VPS proxy services healthy.` Prior: `2026-06-13 23:45:12 STALE (64.4h)` |
| Residual | BCTC SLA still CRITICAL (1330/360min) — now driven by ISSUE-3 (enricher 0 URLs), not VPS down. VPS connectivity itself restored. |

---

## ACTIVE FINDINGS — BUGS (re-confirmed this cycle)

### BUG-1 — HVN Alert Dedup Regression (OPEN — dev-team on different task)

| Field | Value |
|---|---|
| Tool | `alertScanParallelJob` → `computeAlertFingerprint` not wired |
| Class | **BUG** (regression) |
| Severity | HIGH |
| Delta vs 16:11 | Unchanged — no fix in `get_recent_fixes` (20 checked); no fix task in `task_list_held` |
| Affected callers | alert-commander, unified-agent, all cowork alert consumers |

**Re-probe evidence (this cycle):**
```
get_cycle_bootstrap alerts (24h): 12 identical [HIGH] HVN (price_surge, volume_spike) 08:46–08:59 UTC
All: "HVN volume spike: 3.5× average (422,060 vs avg 121,720)"

grep -r "computeAlertFingerprint|alertFingerprint|fingerprint" apps/mcp-server/src/scheduler → NO MATCHES
alertGenerator.ts has computeAlertFingerprint() (lines 157-199) but NOT imported by scan jobs

task_list_held: dev-team on task:FIX-INFOCARD-DROPDOWN-EXPAND (frontend); no alert-dedup task present
get_recent_fixes (20): latest alert dedup fix was 2026-04-28 — unrelated to scan job wiring
```

**Root cause:** `alertScanParallelJob` does not call `computeAlertFingerprint` from `alertDedup.ts`.
Dedup helper exists but is not wired to the scan path.

**Suggested fix:** Import and invoke `computeAlertFingerprint` in `taAlertScanJob`/`bbAlertScanJob` before the DB insert call. Verify at next market open (~02:00 UTC tomorrow).

---

### BUG-2 — Tool SSOT Docs: `ticker` param vs live `code` (schema drift)

| Field | Value |
|---|---|
| Tools | `get_technical_indicators`, `get_price_history` |
| Class | **BUG** (doc/contract drift — SSOT wrong) |
| Severity | MEDIUM |
| Delta vs 16:11 | Unchanged |
| Affected callers | 0 runtime broken (flow files use correct `code`); doc-only |

**Re-probe evidence (grep this cycle):**
```
grep docs/agents/tools/list/get_technical_indicators.md:8
→ "| `ticker` | `string` | Company code |"  ← WRONG param name (should be `code`)

grep docs/agents/tools/list/get_price_history.md → no `ticker` pattern found
Caller-surface verified: 0 affected runtime callers (market-watcher/flow/cycle.md uses `code` correctly)
```

**Suggested fix:** Update `docs/agents/tools/list/get_technical_indicators.md:8` — rename `ticker` → `code`.

---

### BUG-3 — `get_agent_signals(from_agent=…)` Fails Schema Validation

| Field | Value |
|---|---|
| Tool | `get_agent_signals` |
| Class | **BUG** (schema — `agent` required even when `from_agent` supplied) |
| Severity | MEDIUM-HIGH |
| Delta vs 16:11 | Unchanged — still broken every cycle |
| Affected callers | news-scout stage-bootstrap.md:39 (1 confirmed runtime caller, every cycle) |

**Re-probe evidence (this cycle):**
```
get_agent_signals({"from_agent": "news-scout", "status": "all", "hours_back": 6})
→ MCP error -32602: Input validation error: agent Required (path: ["agent"])
```

**Impact:** news-scout SELF_SIGNALS_CACHE silently empty every cycle → FILTER_HINT_* adaptation permanently disabled → alert quality cannot self-tune (64 pending_feedback items in DB not consumed).

**Suggested fix (Option A):** In `agentSignalTools.ts`, make `agent` optional when `from_agent` is provided: `agent: z.string().optional()`.

---

## ACTIVE FINDINGS — ISSUES (re-confirmed this cycle)

### ISSUE-1 — Reuters RSS Circuit Breaker Dead

| Field | Value |
|---|---|
| Class | **ISSUE** (decommissioned source; CB noise) |
| Severity | LOW |
| Delta vs 16:11 | Unchanged |

**Re-probe evidence:**
```
get_system_status source health: "Reuters RSS | Ngưng | Chưa bao giờ | 12 ⚠"
```

**Suggested fix:** Remove `reuters` CB entry from `circuitBreakerRegistry.ts`.

---

### ISSUE-2 — Trading Economics Dead (2 sources, Chromium failures)

| Field | Value |
|---|---|
| Class | **ISSUE** (Chromium scrape persistent failure + BUG-4 recurrence risk) |
| Severity | MEDIUM |
| Delta vs 16:11 | Unchanged — 12 consecutive failures ×2 |

**Re-probe evidence:**
```
get_system_status: "Trading Economics | Ngưng | Chưa bao giờ | 12 ⚠" (×2)
```

**Note:** TE Chromium blocking is the suspected root cause of the now-resolved BUG-4. With no per-call timeout guard added, BUG-4 will recur when TE hangs again.

**Suggested fix:** Add per-source timeout guard (≤3s) in `getSystemStatus.ts` external calls. Secondary: replace TE Chromium scrape with VPS-side or direct HTTP scrape.

---

### ISSUE-3 — bctcQueueEnricher: VPS BCTC URL Discovery 0 URLs (38+ consecutive cycles)

| Field | Value |
|---|---|
| Class | **ISSUE** (BCTC URL discovery broken; SLA CRITICAL) |
| Severity | HIGH |
| Delta vs 16:11 | Unchanged — consecutive_zero_cycles climbing; SLA worsening (1330 min vs 1213 min at 16:11) |
| Affected callers | bctc-analyst (BCTC pipeline starved), refine_bctc_md, BCTC SLA monitor |

**Re-probe evidence (this cycle):**
```
get_system_status errors (last 10): bctcQueueEnricher zero-url-alert: consecutive_zero_cycles=38
  "0 URLs found for ticker VEA" (multiple)
  "0 URLs populated across all 10 item(s)"
get_sla_status: bctc | 1330 min | 360 min | breached | CRITICAL
get_vps_proxy_health: bctc | 2026-06-16 18:02:24 | ok  ← VPS itself healthy (ISSUE-4 resolved)
bctcQueueEnricherJob cron health: 99.6% "success" — MISLEADING: job exits 0 even with 0 URLs
```

**Root cause:** VPS bctc connectivity restored (ISSUE-4 resolved), but the URL discovery endpoint
(`/proxy/bctc-discover/:ticker`) returns 0 URLs. VPS up ≠ discovery working.

**Suggested fix:** ops-vps-fetch SSH probe `/proxy/bctc-discover/VNM` directly. If returning empty, investigate bctc-discover service config or scrape logic on VPS.

---

### ISSUE-5 — vnstockTradingStatsRefresh: 50% Success Rate

| Field | Value |
|---|---|
| Class | **ISSUE** (alarming failure rate; small 2-run sample) |
| Severity | LOW |
| Delta vs 16:11 | Unchanged — 2 runs, 50% rate, 943,711ms avg |

**Re-probe evidence:**
```
get_cron_health: vnstockTradingStatsRefresh: success_rate=0.50, total_runs=2, avg_duration=943711ms
```

---

### ISSUE-6 (NEW) — SBV FX SLA Calibration Mismatch

| Field | Value |
|---|---|
| Class | **ISSUE** (SLA threshold tighter than job cadence — near-constant breach) |
| Severity | LOW |
| Delta vs 16:11 | NEW — not flagged in prior report |

**Re-probe evidence (this cycle):**
```
get_sla_status: sbv_fx | 64 min | 30 min SLA | breached | CRITICAL
get_vps_proxy_health: sbv | 2026-06-16 17:58:07 | ok (push 5min before probe)
get_cron_health: sbvRatesRefreshJob: last_run=16:00 UTC | total_runs=30 (7 days) → ~5.6h cadence
get_system_status freshness: "Tỷ giá SBV | 1.1h | Bình thường" (system itself considers SBV normal)
```

**Root cause:** `sbvRatesRefreshJob` runs ~every 5-6h; `sbv_fx` SLA threshold = 30min → breach is near-constant during the second half of each refresh cycle. The SLA tool and the actual job schedule are not aligned. Low impact: VPS pushes every 30min and system_status reports SBV as normal.

**Suggested fix:** Align: either increase sbvRatesRefreshJob cadence to ≤30min, or relax sbv_fx SLA threshold in the SLA monitor to ~360min to match the actual job frequency.

---

## IMPROVE FINDINGS (re-confirmed this cycle)

### IMPROVE-1 — unified-agent chef.md uses `agent_id` instead of `agent_name`

**Re-confirmed (grep this cycle):**
```
grep docs/agents/unified-agent/flow/chef.md:91
→ Call `get_cycle_bootstrap(agent_id="unified-agent")` first.
Live: agent_name is the correct param (confirmed via get_cycle_bootstrap(agent_name="market-watcher") → OK)
```
**Unchanged.**

---

### IMPROVE-2 — `get_cycle_bootstrap` Doc Stale: Missing `bctc-analyst`, Deprecated Enum Values

**Re-confirmed (grep this cycle):**
```
docs/agents/tools/list/get_cycle_bootstrap.md:4
→ agents: [news-scout, financial-analyst, report-analyzer, market-watcher, alert-commander, digest-predict, qa-responder, unified-agent]
→ Missing: bctc-analyst
→ Still listed (deprecated): financial-analyst, report-analyzer
Line 16: enum param table reflects same stale set
```
**Unchanged.**

---

### IMPROVE-3 — bctcReparseJob 81.4% Rate (borderline, threshold 80%)

**Re-confirmed:**
```
get_cron_health: bctcReparseJob: success_rate=0.81 (81.4%), total_runs=183, avg_duration=288642ms
```
One bad run away from triggering `cronHealthAlertJob`. Marginal decrease from 81.5% (prior). **Unchanged trend.**

---

### IMPROVE-4 — newsapi Source Disabled (undocumented)

**Re-confirmed:**
```
get_system_status source health: "newsapi | disabled | Chưa bao giờ | 0"
```
**Unchanged.**

---

## PROBE COVERAGE SUMMARY

| Tool | Result | Latency | Notes |
|---|---|---|---|
| `get_system_status` | ✅ OK | <5s | **RESOLVED vs prior 60s timeout** — server restarted 16:55 UTC |
| `get_cycle_bootstrap({agent_name:"market-watcher"})` | ✅ OK | 31ms | Full context; 12 HVN dedup bugs visible in alerts |
| `get_cron_health` | ✅ OK | fast | ISSUE-5 unchanged; sbvRatesRefreshJob cadence mismatch noted (ISSUE-6) |
| `get_vps_proxy_health` | ✅ OK | fast | **bctc now ok** (push 18:02) — ISSUE-4 RESOLVED |
| `get_sla_status` | ✅ OK | fast | bctc CRITICAL 1330/360min; sbv_fx 64/30min (NEW ISSUE-6) |
| `get_agent_signals({from_agent:…})` | ❌ FAILS | — | BUG-3 confirmed unchanged |
| `get_recent_fixes(limit=20)` | ✅ OK | fast | No alert dedup fix; no TE timeout fix |
| `task_list_held` | ✅ OK | fast | dev-team on FIX-INFOCARD-DROPDOWN-EXPAND; no alert-dedup task |
| grep `computeAlertFingerprint` in scheduler/src | ❌ NO MATCH | — | BUG-1 confirmed — scan jobs unlinked from dedup |
| grep `ticker` in get_technical_indicators.md | ✅ FOUND line 8 | — | BUG-2 confirmed |
| grep `agent_id` in chef.md | ✅ FOUND line 91 | — | IMPROVE-1 confirmed |
| grep deprecated enum in get_cycle_bootstrap.md | ✅ FOUND lines 4,16 | — | IMPROVE-2 confirmed |

---

## TRIAGE PRIORITY (this cycle)

| # | Finding | Class | Action Owner | Priority |
|---|---|---|---|---|
| 1 | bctcQueueEnricher 0 URLs — 38+ cycles, BCTC SLA 1330/360 CRITICAL | ISSUE-3 | ops-vps-fetch | 🔴 HIGH — SSH probe `/proxy/bctc-discover/VNM` |
| 2 | HVN alert dedup — 12 identical alerts, scan jobs not wired to fingerprint | BUG-1 | dev-alert-engine | 🔴 HIGH — wire before tomorrow 02:00 UTC market open |
| 3 | Trading Economics dead — root cause risk for BUG-4 recurrence | ISSUE-2 | dev-mainserver-crawls | 🟠 MEDIUM — add ≤3s timeout guard in getSystemStatus.ts |
| 4 | `get_agent_signals(from_agent=…)` fails — news-scout broken every cycle | BUG-3 | dev-mcp-server | 🟠 MEDIUM — make `agent` optional |
| 5 | Tool SSOT: get_technical_indicators.md:8 ticker→code | BUG-2 | dev-mcp-server | 🟠 MEDIUM — doc fix |
| 6 | SBV FX SLA threshold vs job cadence mismatch | ISSUE-6 | dev-mcp-server | 🟡 LOW — align to ~360min |
| 7 | Reuters RSS CB stale (decommissioned) | ISSUE-1 | dev-mcp-server | 🟡 LOW — 1-line remove |
| 8 | vnstockTradingStatsRefresh 50% (2 runs) | ISSUE-5 | dev-mcp-server | 🟡 LOW — investigate |
| 9 | unified-agent chef.md `agent_id` wrong param | IMPROVE-1 | dev-mcp-server | 🟡 LOW — doc fix |
| 10 | get_cycle_bootstrap doc missing bctc-analyst + deprecated enum | IMPROVE-2 | dev-mcp-server | 🟡 LOW — doc + schema cleanup |
| 11 | bctcReparseJob 81.4% borderline | IMPROVE-3 | dev-mcp-server | 🔵 WATCH |
| 12 | newsapi disabled undocumented | IMPROVE-4 | dev-mcp-server | 🔵 DOCUMENT |

**Report path:** `docs/agent-memory/health/team-tool-recheck-2026-06-16-1809.md`
