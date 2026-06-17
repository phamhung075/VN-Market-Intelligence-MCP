# Team MCP Tool Health Recheck — 2026-06-16 14:08 UTC

**Run by:** health-recheck agent (scheduled)  
**Gateway transport:** ✅ LIVE — `vn-market` reachable via `mcp__gateway__call_tool`  
**Uptime at probe time:** ~47m (server started 13:21:02 UTC)  
**Probe method:** read-only calls only; no state mutations  
**Prior report:** `team-tool-recheck-2026-06-16-1204.md` (2h04m gap)  
**Re-probe mandate:** STEP 3c — every prior finding re-executed this cycle before carry-forward  

---

## ACTIVE FINDINGS — BUGS (re-confirmed this cycle)

### BUG-1 — HVN Alert Dedup Regression (FIX IN PROGRESS)

| Field | Value |
|---|---|
| Tool | `alertScanParallelJob` → `taAlertScanJob` / `bbAlertScanJob` |
| Class | **BUG** (regression) |
| Severity | HIGH |
| Delta vs 12:04 | Fix-in-progress — `task:FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS` was claimed by dev-team at 12:38 UTC (expired 13:38 UTC). No fix logged in `get_recent_fixes` yet. |
| Affected callers | alert-commander, unified-agent, all cowork alert consumers |

**Re-probe evidence (get_cycle_bootstrap → agent_signals this cycle):**
```
18 identical HIGH alerts for HVN price_surge,volume_spike from 08:43–08:59 UTC
"HVN volume spike: 3.5× average (422,060 vs avg 121,720)" — same message every entry
Market now closed (14:08 UTC) — no new intraday alerts expected until tomorrow open
```

**Caller-surface grep (this cycle):**
```
grep -r "get_alerts\|alert-commander" docs/agents/*/flow/*.md
→ alert-commander/flow/stage-signals.md, unified-agent/flow/chef.md — both confirmed callers
```

**Dev-team task status:** `task:FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS` TTL expired at 13:38. Outcome unknown — no `log_fix` entry observed. Monitor at next market open.

**Root cause (from 12:04 report):** `alertScanParallelJob` does not invoke `computeAlertFingerprint` from `alertDedup.ts`. Dedup domain helper exists but is not wired to the scan path.

**Suggested fix:** Wire `computeAlertFingerprint` into `taAlertScanJob` before the DB insert call.

---

### BUG-2 — Tool SSOT Docs: `ticker` param vs live `code` (schema drift)

| Field | Value |
|---|---|
| Tools | `get_technical_indicators`, `get_price_history` |
| Class | **BUG** (doc/contract drift — SSOT is wrong) |
| Severity | MEDIUM |
| Delta vs 12:04 | Unchanged — no commit fixing this observed |
| Affected callers | 0 runtime broken (flow files use correct `code`); any agent re-reading SSOT docs |

**Re-probe evidence (caller surface grep this cycle):**
```
grep -n "ticker" docs/agents/tools/list/get_technical_indicators.md → line 8: ticker: string  ← WRONG
grep -n "ticker" docs/agents/tools/list/get_price_history.md → line 8: ticker: string  ← WRONG
grep -n "code" docs/agents/market-watcher/flow/cycle.md:77 → get_technical_indicators(code) ✅ CORRECT
grep -n "code" docs/agents/ops/flow/data-validation-checks.md:50 → get_price_history(code=...) ✅ CORRECT
```

**Caller-surface verified: 0 runtime callers use the broken `ticker` param. Doc-only issue.**

**Suggested fix:** Update `docs/agents/tools/list/get_technical_indicators.md`, `get_price_history.md` — rename `ticker` → `code`. Fix `docs/agents/tools/package/market-watcher.md:147,177,208`.

---

### BUG-3 — `get_agent_signals(from_agent=…)` Fails Schema Validation (NEW THIS CYCLE)

| Field | Value |
|---|---|
| Tool | `get_agent_signals` |
| Class | **BUG** (schema — `agent` required even when `from_agent` supplied) |
| Severity | MEDIUM-HIGH |
| Delta vs 12:04 | **NEW — not in prior reports** |
| Affected callers | news-scout (1 confirmed runtime caller, every cycle) |

**Re-probe evidence (live probe this cycle):**
```
get_agent_signals({"from_agent": "news-scout", "status": "all", "hours_back": 6})
→ MCP error -32602: Input validation error: agent Required (path: ["agent"])
```

**Caller-surface grep (this cycle):**
```
grep -n "from_agent" docs/agents/news-scout/flow/stage-bootstrap.md
→ line 39-43: SELF_SIGNALS_CACHE = call_tool(..., get_agent_signals, {from_agent: "news-scout", status: "all", hours_back: 6})
   ← NO `agent` param → FAILS every news-scout cycle

grep -n "from_agent" docs/agents/tools/list/get_agent_signals.md:31
→ "news-scout calls get_agent_signals(from_agent='news-scout', status='all', hours_back=6)"
   ← TOOL DOC itself shows the broken call pattern
```

**Alert-commander comparison:** `stage-signals.md:31` correctly passes `agent: "alert-commander"` → ✅ works.  
**News-scout stage-bootstrap.md:39:** passes only `from_agent` → ❌ fails every cycle.

**Runtime impact:** news-scout bootstrap Step 0c (L-4 SELF_SIGNALS_CACHE) silently fails on every cycle. The flow falls back to `SELF_SIGNALS_CACHE = []` and skips feedback tuning. Signal-type threshold adaptation (FILTER_HINT_*) is permanently disabled for news-scout. This means alert quality cannot self-tune even as feedback accumulates (54 pending_feedback items visible in DB audit).

**Suggested fix (Option A — preferred):** In `agentSignalTools.ts`, make `agent` optional when `from_agent` is provided (the two params serve different query directions — requiring `agent` for a sender-history lookup is logically wrong). Update schema: `agent: z.string().optional()`.  
**Option B (workaround):** Add `agent: "news-scout"` to the call in `stage-bootstrap.md:39` and update the tool doc example.

---

## ACTIVE FINDINGS — ISSUES (re-confirmed this cycle)

### ISSUE-1 — Reuters RSS Circuit Breaker Dead (stale CB)

| Field | Value |
|---|---|
| Source | `reuters` in `circuitBreakerRegistry.ts` |
| Class | **ISSUE** (decommissioned source; CB pollutes SOURCE HEALTH) |
| Severity | LOW |
| Delta vs 12:04 | Unchanged — count reset to 10 after server restart at 13:21 UTC |

**Re-probe evidence:**
```
get_system_status → Reuters RSS | Ngưng | Chưa bao giờ | 10 ⚠
```
`vn-reuters-fetch.service` decommissioned 2026-04-30 (fix #7). CB still registered — noise only.

**Suggested fix:** Remove `reuters` CB from `circuitBreakerRegistry.ts` or add `disabled: true` flag.

---

### ISSUE-2 — Trading Economics Dead (2 sources, persistent Chromium failures)

| Field | Value |
|---|---|
| Source | Two TradingEconomics entries in SOURCE HEALTH |
| Class | **ISSUE** (Chromium scrape persistent failure) |
| Severity | MEDIUM |
| Delta vs 12:04 | Unchanged — count reset to 10 after restart; both still `Ngưng | Chưa bao giờ` |

**Re-probe evidence:**
```
get_system_status → Trading Economics | Ngưng | Chưa bao giờ | 10 ⚠  (×2 entries)
```
`macroIndicatorRefreshJob` 100% success (SBV/IMF/Yahoo filling gap). TE-specific indicators (shipping index, DXY detail) absent.

**Suggested fix:** Replace `tradingEconomicsChromium.ts` with direct HTTP or VPS-side scrape. Chromium persistently fails inside Docker (recurring OOM/Playwright crashes since April 2026).

---

### ISSUE-3 — bctcQueueEnricher: ALL 10 Queue Items Returning 0 URLs (WORSENED)

| Field | Value |
|---|---|
| Tool | `bctcQueueEnricherJob` (every 15 min) |
| Class | **ISSUE** (VPS BCTC discovery endpoint may be down entirely) |
| Severity | HIGH (worsened from MEDIUM) |
| Delta vs 12:04 | **WORSENED** — was "3 tickers (VEA/VNH/VDC)"; now ALL 10 queue items returning 0 URLs |

**Re-probe evidence (get_system_status this cycle):**
```
[WARN] bctcQueueEnricher: 0 URLs found for ticker VEA
[WARN] bctcQueueEnricher: 0 URLs populated across all 10 item(s) — all sources may be unavailable or geo-blocked
[WARN] bctcQueueEnricher: zero-url-alert: consecutive_zero_cycles=11
```

**Assessment:** The previous "3 problem tickers" framing is no longer accurate. `consecutive_zero_cycles=11` and `0 URLs across all 10 item(s)` strongly suggests the **VPS BCTC discovery endpoint** (`/proxy/bctc-discover/:ticker`) is down or geo-blocked, not ticker-specific. Combined with ISSUE-4 (VPS bctc push stalled 62h), both BCTC VPS pathways are non-functional.

**Suggested fix:** (1) Check VPS `/proxy/bctc-discover/:ticker` endpoint directly via SSH probe. (2) Apply active-flag filter in enricher query as previously noted (VEA inactive). (3) If discovery endpoint is confirmed down, escalate to ops-vps-fetch.

---

### ISSUE-4 — BCTC VPS Push Pipeline Stalled 62+ Hours (SLA CRITICAL, worsening)

| Field | Value |
|---|---|
| Source | `bctc` in VPS proxy health |
| Class | **ISSUE** (pipeline stall — SLA CRITICAL) |
| Severity | HIGH |
| Delta vs 12:04 | Worsening — SLA breach 1090/360min (was 970/360min at 12:04) |

**Re-probe evidence (get_vps_proxy_health + get_sla_status this cycle):**
```
get_vps_proxy_health → bctc | 2026-06-13 23:45:12 | 1 item | 0 pushes/24h | STALE ⚠
get_sla_status → bctc | 1090 min | 360 min | breached | CRITICAL
```

`vn-bctc-fetch` VPS service shows `healthy` but zero pushes in 62+ hours. Combined with ISSUE-3 (all VPS BCTC discovery failing), the entire VPS BCTC pathway appears non-functional. `get_earnings_calendar` shows 10+ tickers QUÁ HẠN (overdue).

**Suggested fix:** ops-vps-fetch SSH probe to `/proxy/bctc-discover/VNM` directly. If endpoint dead, restart `vn-bctc-fetch` service on VPS. Then call `trigger_bctc_vps_fetch` to re-prime the pipeline.

---

### ISSUE-5 — vnstockTradingStatsRefresh: 50% Success Rate, 15.7-min Avg Duration

| Field | Value |
|---|---|
| Cron | `vnstockTradingStatsRefresh` |
| Class | **ISSUE** (low sample; alarming failure rate) |
| Severity | LOW (2-run sample) |
| Delta vs 12:04 | Unchanged — same 0.50 rate, same 2 runs, same 943,711ms avg |

**Re-probe evidence:**
```
get_cron_health → vnstockTradingStatsRefresh: success_rate=0.50, total_runs=2, avg_duration=943711ms
```

**Suggested fix:** Check scheduler logs for the failed run. Add per-run timeout guard if duration indicates hang.

---

## IMPROVE FINDINGS (re-confirmed this cycle)

### IMPROVE-1 — unified-agent chef.md uses `agent_id` instead of `agent_name`

**Re-confirmed (grep this cycle):**
```
grep -n "agent_id" docs/agents/unified-agent/flow/chef.md
→ line 91: Call `get_cycle_bootstrap(agent_id="unified-agent")` first.
```
Live schema requires `agent_name`. Package doc (`unified-agent.md:151`) correctly shows `agent_name`. LLM agent following chef.md prose literally gets a Zod validation error. Mitigation: bootstrap result also available from prior cycle; chef.md notes "Do NOT call get_agent_signals as hard gate". Risk: LOW but doc should be corrected.

**Suggested fix:** Update `chef.md:91` — change `agent_id` → `agent_name`.

---

### IMPROVE-2 — `get_cycle_bootstrap` Tool Doc Missing `bctc-analyst` in Enum

**Re-confirmed:** Live server accepts `bctc-analyst`; tool list doc enum does not list it.  
**0 runtime callers broken** — package doc for bctc-analyst correctly shows `agent_name: "bctc-analyst"`.  
**Suggested fix:** Add `bctc-analyst` to enum list in `docs/agents/tools/list/get_cycle_bootstrap.md`.

---

### IMPROVE-3 — bctcReparseJob 81.5% Rate (borderline, alert threshold 80%)

**Re-confirmed:** `success_rate: 0.82 (81.5%)`, 184 runs, avg 292,618ms. Slightly better than 80.9% at prior report. Still within one bad run of triggering `cronHealthAlertJob`.

---

### IMPROVE-4 — newsapi Source Disabled (undocumented)

**Re-confirmed:** `newsapi | disabled | Chưa bao giờ | 0`. No system-map.json entry or recent-fixes entry explaining the disable. If intentional, document in system-map.json `data_sources`.

---

## RESOLVED

None. All prior BUG/ISSUE findings from the 12:04 UTC report re-confirmed active.

---

## PROBE COVERAGE SUMMARY

| Tool | Result | Latency | Notes |
|---|---|---|---|
| `get_cycle_bootstrap` | ✅ OK | 21ms | Requires `agent_name`; compound data confirmed live |
| `get_market_snapshot` | ✅ OK | fast | VN-Index 1807.94 (+0.48%); prices (tier-2) |
| `get_macro_snapshot` | ✅ OK | fast | All macro signals live (carry/yield/gold/oil/usdvnd) |
| `get_system_status` | ✅ OK | fast | 10 unresolved errors; BCTC enricher warn burst |
| `get_cron_health` | ✅ OK | fast | 70+ jobs; see ISSUE-5, IMPROVE-3 |
| `get_vps_proxy_health` | ✅ OK | fast | prices/news/sbv fresh; bctc STALE 62h |
| `get_vps_service_health` | ✅ OK | fast | 3 healthy, 2 idle (market closed) |
| `get_rate_limit_status` | ✅ OK | fast | 11 sources; all ready, none at limit |
| `get_earnings_calendar` | ✅ OK | fast | 41 tickers tracked; 10+ QUÁ HẠN |
| `get_pipeline_health` | ✅ OK | fast | 35/41 TA-ready; BDI/DAG/DLC/JSH/SIS/VDC not ready |
| `get_sla_status` | ✅ OK | fast | bctc CRITICAL (1090/360min); news/sbv marginal breach |
| `get_agent_signals({agent:…})` | ✅ OK | fast | Correct param works |
| `get_agent_signals({from_agent:…})` | ❌ FAILS | — | BUG-3 — `agent` Required even for sender-history |
| `get_recent_fixes` | ✅ OK | fast | 10 fixes; no fix for open BUGs logged |
| `task_list_held` | ✅ OK | fast | 7 locks; FIX-ALERT-FINGERPRINT task expired (fix in progress) |
| `get_cycle_bootstrap({agent_name:"bctc-analyst"})` | ✅ OK | fast | Live OK; doc missing from enum (IMPROVE-2) |

---

## TRIAGE PRIORITY

| # | Finding | Class | Action Owner | Priority |
|---|---|---|---|---|
| 1 | HVN alert dedup regression — fix task expired, outcome unknown | BUG | dev-alert-engine | 🔴 HIGH — verify fix landed before next market open |
| 2 | BCTC VPS pathway entirely down (ISSUE-3 + ISSUE-4 combined) | ISSUE | ops-vps-fetch | 🔴 HIGH — SSH probe + trigger_bctc_vps_fetch |
| 3 | `get_agent_signals(from_agent=…)` fails — news-scout L-4 cache broken | BUG | dev-mcp-server | 🟠 MEDIUM — make `agent` optional when `from_agent` present |
| 4 | Tool SSOT docs `ticker` vs `code` | BUG | dev-mcp-server | 🟠 MEDIUM — doc fix only |
| 5 | Trading Economics dead (2 sources, Chromium failures) | ISSUE | dev-mainserver-crawls | 🟠 MEDIUM — TE data gap; replace Chromium path |
| 6 | unified-agent chef.md `agent_id` wrong param | IMPROVE | dev-mcp-server | 🟡 LOW — doc fix |
| 7 | Reuters CB stale (decommissioned source still tracked) | ISSUE | dev-mcp-server | 🟡 LOW — 1-line remove |
| 8 | vnstockTradingStatsRefresh 50% rate (small sample) | ISSUE | dev-mcp-server | 🟡 LOW — watch |
| 9 | get_cycle_bootstrap doc missing bctc-analyst | IMPROVE | dev-mcp-server | 🔵 COSMETIC |
| 10 | bctcReparseJob 81.5% borderline | IMPROVE | dev-mcp-server | 🔵 WATCH |
| 11 | newsapi disabled undocumented | IMPROVE | dev-mcp-server | 🔵 DOCUMENT |

**Report path:** `docs/agent-memory/health/team-tool-recheck-2026-06-16-1408.md`
