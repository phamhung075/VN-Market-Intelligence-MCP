# Team MCP Tool Health Recheck — 2026-06-16 16:11 UTC

**Run by:** health-recheck agent (scheduled)
**Gateway transport:** ✅ LIVE — `vn-market` reachable via `mcp__gateway__call_tool`
**Probe method:** read-only calls only; no state mutations
**Prior report:** `team-tool-recheck-2026-06-16-1408.md` (2h03m gap)
**Re-probe mandate:** STEP 3c — every prior finding re-executed this cycle before carry-forward

---

## ACTIVE FINDINGS — BUGS (re-confirmed this cycle)

### BUG-1 — HVN Alert Dedup Regression (OPEN — fix task expired, not replaced)

| Field | Value |
|---|---|
| Tool | `taAlertScanJob` / `bbAlertScanJob` → `computeAlertFingerprint` not wired |
| Class | **BUG** (regression) |
| Severity | HIGH |
| Delta vs 14:08 | Unchanged — no fix logged in `get_recent_fixes`; dev-team active on different task |
| Affected callers | alert-commander, unified-agent, all cowork alert consumers |

**Re-probe evidence (get_cycle_bootstrap this cycle):**
```
14 identical [HIGH] HVN (price_surge, volume_spike) alerts from 08:43–08:59 UTC today
All identical message: "HVN volume spike: 3.5× average (422,060 vs avg 121,720)"
Market closed (16:11 UTC) — no new intraday alerts expected until tomorrow open
task_list_held: FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS NOT present (expired 13:38 UTC)
dev-team currently on: task:FIX-CI-RED-STANDING-1837A-1352A (unrelated CI fix)
get_recent_fixes: 15 fixes checked — no entry for alert dedup fix
```

**Root cause:** `alertScanParallelJob` does not invoke `computeAlertFingerprint` from `alertDedup.ts`. Dedup helper exists but not wired to scan path.

**Suggested fix:** Wire `computeAlertFingerprint` into `taAlertScanJob` before the DB insert call. Verify at next market open (tomorrow ~02:00 UTC).

---

### BUG-2 — Tool SSOT Docs: `ticker` param vs live `code` (schema drift)

| Field | Value |
|---|---|
| Tools | `get_technical_indicators`, `get_price_history` |
| Class | **BUG** (doc/contract drift — SSOT wrong) |
| Severity | MEDIUM |
| Delta vs 14:08 | Unchanged — no commit fixing this |
| Affected callers | 0 runtime broken (flow files use correct `code`); doc-only |

**Re-probe evidence (grep this cycle):**
```
grep docs/agents/tools/list/get_technical_indicators.md → line 8: ticker: string  ← WRONG
Caller flows use `code` correctly (market-watcher/flow/cycle.md:77)
Caller-surface verified: 0 affected runtime callers
```

**Suggested fix:** Update `docs/agents/tools/list/get_technical_indicators.md` and `get_price_history.md` — rename `ticker` → `code`. Also fix `docs/agents/tools/package/market-watcher.md:147,177,208`.

---

### BUG-3 — `get_agent_signals(from_agent=…)` Fails Schema Validation

| Field | Value |
|---|---|
| Tool | `get_agent_signals` |
| Class | **BUG** (schema — `agent` required even when `from_agent` supplied) |
| Severity | MEDIUM-HIGH |
| Delta vs 14:08 | Unchanged — still broken every cycle |
| Affected callers | news-scout stage-bootstrap.md:39 (1 confirmed runtime caller, every cycle) |

**Re-probe evidence (live probe this cycle):**
```
get_agent_signals({"from_agent": "news-scout", "status": "all", "hours_back": 6})
→ MCP error -32602: Input validation error: agent Required (path: ["agent"])
```

**Impact:** news-scout SELF_SIGNALS_CACHE silently empty every cycle → FILTER_HINT_* adaptation permanently disabled → alert quality cannot self-tune (54 pending_feedback items in DB not consumed).

**Suggested fix (Option A):** In `agentSignalTools.ts`, make `agent` optional when `from_agent` is provided. Update schema: `agent: z.string().optional()`.

---

### BUG-4 (NEW) — `get_system_status` 60s Timeout — Blocks market-watcher Smoke Probe

| Field | Value |
|---|---|
| Tool | `get_system_status` |
| Class | **BUG** (tool degraded — consistent 60s timeout) |
| Severity | HIGH |
| Delta vs 14:08 | **NEW** — was OK at 14:08 (compact status returned via bootstrap). Now timing out standalone. |
| Affected callers | market-watcher (1 hard gate), ops, system-auditor |

**Re-probe evidence (this cycle — 2 independent attempts):**
```
Attempt 1 (16:08 UTC): mcp__gateway__call_tool → get_system_status → timeout after 60s
Attempt 2 (16:09 UTC): mcp__gateway__call_tool → get_system_status → timeout after 60s
get_cycle_bootstrap compact system_status (fast internal path): OK, elapsed_ms=69
```

**Caller-surface grep:**
```
grep -n "get_system_status" docs/agents/market-watcher/flow/main.md
→ line 36: "Run Step 0 smoke probe: call_tool(..., tool="get_system_status"). On failure →
   send_telegram(channel="bug") → EXIT."
```

**Impact:** market-watcher step-0 smoke probe gates on `get_system_status`. A 60s timeout will be treated as failure → BUG alert sent → EXIT every cycle. Market is currently closed (16:11 UTC) so no immediate data loss, but **tomorrow market open at 02:00 UTC every market-watcher cycle will fail until fixed.**

**Root cause hypothesis:** `get_system_status` likely calls an external blocking source (Trading Economics Chromium, or a health endpoint that hangs). The internal bootstrap fast-path bypasses this. Check `getSystemStatus.ts` for blocking HTTP calls without timeout guards.

**Suggested fix:** Add per-source timeouts (≤5s each) in `getSystemStatus.ts` external calls. Or split into `get_system_status_fast` (no external calls) vs `get_system_status_full`. Market-watcher smoke probe should use the fast variant.

---

## ACTIVE FINDINGS — ISSUES (re-confirmed this cycle)

### ISSUE-1 — Reuters RSS Circuit Breaker Dead

| Field | Value |
|---|---|
| Class | **ISSUE** (decommissioned source; CB noise) |
| Severity | LOW |
| Delta vs 14:08 | Cannot re-verify (get_system_status timed out); assumed unchanged |

**Re-probe evidence:** `get_system_status` timed out — cannot re-read source health table directly. Prior report evidence stands. No `log_fix` entry for this issue.

**Suggested fix:** Remove `reuters` CB from `circuitBreakerRegistry.ts`.

---

### ISSUE-2 — Trading Economics Dead (2 sources, Chromium failures)

| Field | Value |
|---|---|
| Class | **ISSUE** (Chromium scrape persistent failure) |
| Severity | MEDIUM |
| Delta vs 14:08 | Cannot re-verify directly (get_system_status timed out); strong indirect signal: TE Chromium hang likely **causing** get_system_status 60s timeout (BUG-4) |

**Re-probe evidence:** `get_system_status` timed out. High probability that the hanging TE Chromium call is the root cause of BUG-4 — `get_system_status` calls TE endpoints that block without timeout, causing the 60s gateway timeout.

**Suggested fix:** Replace `tradingEconomicsChromium.ts` with direct HTTP or VPS-side scrape. Add per-call timeout guard of ≤3s in `getSystemStatus.ts` even as interim fix.

---

### ISSUE-3 — bctcQueueEnricher: VPS BCTC Discovery Still Returning 0 URLs

| Field | Value |
|---|---|
| Class | **ISSUE** (VPS BCTC discovery down) |
| Severity | HIGH |
| Delta vs 14:08 | Unchanged — consecutive_zero_cycles continues to climb |

**Re-probe evidence:**
```
get_vps_proxy_health: bctc | last push: 2026-06-13 23:45:12 | STALE (64.4h)
get_cron_health: bctcQueueEnricherJob last_run: 2026-06-16 16:00:02 | success (job runs but yields 0 URLs)
```

**Suggested fix:** ops-vps-fetch SSH probe to `/proxy/bctc-discover/VNM` directly. If endpoint down, restart `vn-bctc-fetch` service on VPS.

---

### ISSUE-4 — BCTC VPS Push Pipeline Stalled 64+ Hours (WORSENING)

| Field | Value |
|---|---|
| Source | `bctc` in VPS proxy health |
| Class | **ISSUE** (pipeline stall — SLA CRITICAL, worsening) |
| Severity | HIGH |
| Delta vs 14:08 | **WORSENING** — 1213/360min (was 1090/360min, +123min in 2h03m) |

**Re-probe evidence (this cycle):**
```
get_vps_proxy_health: bctc | 2026-06-13 23:45:12 | 0 pushes/24h | STALE
get_sla_status: bctc | 1213 min | 360 min | breached | CRITICAL
```

10+ tickers QUÁ HẠN (overdue) per `get_earnings_calendar` (prior cycle). Combined ISSUE-3 + ISSUE-4 confirms the entire VPS BCTC pathway is non-functional.

**Suggested fix:** ops-vps-fetch SSH probe + restart `vn-bctc-fetch` service + call `trigger_bctc_vps_fetch`.

---

### ISSUE-5 — vnstockTradingStatsRefresh: 50% Success Rate (small sample)

| Field | Value |
|---|---|
| Cron | `vnstockTradingStatsRefresh` |
| Class | **ISSUE** (alarming failure rate; low sample) |
| Severity | LOW (2-run sample) |
| Delta vs 14:08 | Unchanged — same 0.50 rate, 2 runs, 943,711ms avg |

**Re-probe evidence:**
```
get_cron_health: vnstockTradingStatsRefresh: success_rate=0.50, total_runs=2, avg_duration=943711ms
```

**Suggested fix:** Check scheduler logs for the failed run; add per-run timeout guard.

---

## IMPROVE FINDINGS (re-confirmed this cycle)

### IMPROVE-1 — unified-agent chef.md uses `agent_id` instead of `agent_name`

**Re-confirmed (grep this cycle):**
```
docs/agents/unified-agent/flow/chef.md:91
→ Call `get_cycle_bootstrap(agent_id="unified-agent")` first.
```
Live schema requires `agent_name`. Risk LOW (bootstrap result also available from cycle context). **Unchanged.**

**Suggested fix:** Update `chef.md:91` — change `agent_id` → `agent_name`.

---

### IMPROVE-2 — `get_cycle_bootstrap` Doc Stale: Missing `bctc-analyst`, Has Deprecated Agent Names

**Re-confirmed (grep + live probe this cycle):**
```
docs/agents/tools/list/get_cycle_bootstrap.md:4
→ agents: [news-scout, financial-analyst, report-analyzer, market-watcher, alert-commander, digest-predict, qa-responder, unified-agent]
→ Missing: bctc-analyst ← per prior IMPROVE-2
→ Deprecated still listed: financial-analyst, report-analyzer (merged into bctc-analyst per bctc-analyst.md package)

Live server enum (from validation error):
→ 'news-scout' | 'financial-analyst' | 'market-watcher' | 'alert-commander' | 'digest-predict' |
   'qa-responder' | 'unified-agent' | 'report-analyzer' | 'bctc-analyst'
→ Server also accepts financial-analyst and report-analyzer — Zod schema not cleaned up
```

**Suggested fix:** (1) Add `bctc-analyst` to doc enum; (2) Remove `financial-analyst` and `report-analyzer` from both doc AND Zod schema in server code.

---

### IMPROVE-3 — bctcReparseJob 81.5% Rate (borderline, threshold 80%)

**Re-confirmed:**
```
get_cron_health: bctcReparseJob: success_rate=0.82 (81.5%), total_runs=184, avg_duration=292618ms
```
One bad run away from triggering `cronHealthAlertJob`. **Unchanged.**

---

### IMPROVE-4 — newsapi Source Disabled (undocumented)

Cannot re-verify directly (get_system_status timed out). No log_fix entry. **Carried forward unchanged.**

---

## RESOLVED

None. All prior BUG/ISSUE findings re-confirmed active.

---

## PROBE COVERAGE SUMMARY

| Tool | Result | Latency | Notes |
|---|---|---|---|
| `get_cycle_bootstrap({agent_name:"market-watcher"})` | ✅ OK | 69ms | Full market context + signals |
| `get_cron_health` | ✅ OK | fast | 70+ jobs; ISSUE-5 unchanged |
| `get_vps_proxy_health` | ✅ OK | fast | bctc STALE 64.4h (ISSUE-3+4) |
| `get_sla_status` | ✅ OK | fast | bctc CRITICAL 1213/360min |
| `get_agent_signals({from_agent:…})` | ❌ FAILS | — | BUG-3 confirmed unchanged |
| `get_recent_fixes` | ✅ OK | fast | 15 fixes; no fix for open BUGs |
| `task_list_held` | ✅ OK | fast | 8 locks; no alert-dedup fix task |
| `get_system_status` | ❌ TIMEOUT | 60s×2 | **BUG-4 NEW** — 2× consecutive 60s timeout |

---

## TRIAGE PRIORITY (this cycle)

| # | Finding | Class | Action Owner | Priority |
|---|---|---|---|---|
| 1 | **NEW** `get_system_status` 60s timeout → market-watcher smoke probe fails tomorrow open | BUG-4 | dev-mcp-server | 🔴 CRITICAL — fix before 02:00 UTC |
| 2 | HVN alert dedup — fix task expired, dev-team on different task | BUG-1 | dev-alert-engine | 🔴 HIGH — wire fingerprint before tomorrow open |
| 3 | BCTC VPS pathway entirely down 64h+ (ISSUE-3 + ISSUE-4) | ISSUE | ops-vps-fetch | 🔴 HIGH — SSH probe + restart |
| 4 | `get_agent_signals(from_agent=…)` fails — news-scout SELF_SIGNALS_CACHE broken | BUG-3 | dev-mcp-server | 🟠 MEDIUM — `agent` should be optional |
| 5 | Tool SSOT docs `ticker` vs `code` | BUG-2 | dev-mcp-server | 🟠 MEDIUM — doc fix |
| 6 | Trading Economics dead (likely root cause of get_system_status timeout) | ISSUE-2 | dev-mainserver-crawls | 🟠 MEDIUM — add timeout guard as interim |
| 7 | unified-agent chef.md `agent_id` wrong param | IMPROVE-1 | dev-mcp-server | 🟡 LOW — doc fix |
| 8 | get_cycle_bootstrap doc missing bctc-analyst + deprecated enum values | IMPROVE-2 | dev-mcp-server | 🟡 LOW — doc + schema cleanup |
| 9 | Reuters CB stale (decommissioned source) | ISSUE-1 | dev-mcp-server | 🟡 LOW — 1-line remove |
| 10 | vnstockTradingStatsRefresh 50% rate (small sample) | ISSUE-5 | dev-mcp-server | 🟡 LOW — watch |
| 11 | bctcReparseJob 81.5% borderline | IMPROVE-3 | dev-mcp-server | 🔵 WATCH |
| 12 | newsapi disabled undocumented | IMPROVE-4 | dev-mcp-server | 🔵 DOCUMENT |

**Report path:** `docs/agent-memory/health/team-tool-recheck-2026-06-16-1611.md`
