# Team MCP Tool Health Recheck — 2026-06-19 10:12 UTC

**Run by:** health-recheck agent  
**Cycle start:** 2026-06-19T10:02 UTC  
**Market window:** VN market CLOSED (market closed at 08:30 UTC / 15:30 VN)  
**Gateway:** vn-market reachable via mcp__gateway__call_tool ✅  
**Prior report:** `team-tool-recheck-2026-06-19-0810.md` (re-probed all prior findings per STEP 3c)

---

## Summary

| Class | Count |
|-------|-------|
| BUG (broken, ≥1 affected caller) | 1 |
| ISSUE (degraded/failing subsystem) | 5 |
| IMPROVE (doc drift — 0 broken callers) | 1 |
| RESOLVED (no longer reproduce) | 0 |
| NOT-A-BUG (probe error — caller surface clean) | 1 |

**Telegram alert sent:** YES (channel=bug) — BUG-1 BCTC now 66h, ISSUE-1/2 Reuters/TE still circuit-broken, ISSUE-5 new SBV error storm

---

## STEP 3c — Prior Findings Delta (re-probed this cycle)

| Finding | Prior (08:10) | This Cycle (10:12) | Delta |
|---------|---------------|--------------------|-------|
| BUG-1 vn-bctc-fetch unhealthy | 59.4h stale | 61.4h stale (3683 min / 360 min SLA) | **WORSE** |
| ISSUE-1 Reuters RSS | 40 failures | 66 failures | **WORSE** |
| ISSUE-2 Trading Economics x2 | 40 failures × 2 | 66 failures × 2 | **WORSE** |
| ISSUE-3 Foreign-flow log noise | Active | Active (08:58–08:59 UTC pattern) | **UNCHANGED** |
| ISSUE-4 Low-reliability crons | vnstock 80%, bctcReparse 89.7% | vnstock 85.7%, bctcReparse 89.5% | **UNCHANGED** |
| IMPROVE-1 get_technical_indicators doc drift | Active, 0 callers | Re-probed: `{"ticker":"FPT"}` fails, `{"code":"FPT"}` works | **UNCHANGED** |

---

## ACTIVE FINDINGS — Re-confirmed this cycle

### [BUG-1] vn-bctc-fetch VPS service UNHEALTHY → BCTC SLA CRITICAL (66h and climbing)

**Class:** BUG | **Severity:** CRITICAL  
**Re-probe commands run:** `get_vps_service_health`, `get_vps_proxy_health`, `get_sla_status`

**Evidence (re-confirmed 10:05 UTC):**
```
get_vps_service_health:
  vn-bctc-fetch | unhealthy | 12s ago | 0ms | 2d 16h 2m uptime

get_vps_proxy_health:
  bctc | 2026-06-16 18:02:24 | 1 item | ok | 0 (24h) | STALE YES
  "STALE: bctc — VPS may be down or unreachable"

get_sla_status:
  bctc | 3683 min old | SLA 360 min | breached | CRITICAL
```

**Root cause chain (unchanged from prior report):**
```
vn-bctc-fetch unhealthy (0ms response)
  → bctc VPS proxy stale (last push: 2026-06-16 18:02 UTC — 66h ago, 0 pushes in 24h)
    → BCTC data stale: 3683 min (61.4h old)
      → SLA breach CRITICAL (threshold: 360 min)
```

**Caller surface:** bctc-analyst (primary consumer), refine_bctc_md (push_bctc_refined_unit), dev-pdf-extractor pipeline. All fresh BCTC reads and queue enrichment are affected.

**Delta vs prior:** Age increased from 59.4h → 61.4h. SLA threshold changed 120→360 min in tool output (possible config update). Still fully breached.

**Suggested fix:** Restart `vn-bctc-fetch` VPS service; verify network/auth to BCTC source. Service has been unhealthy for 66h with zero pushes. Escalate if no ops response since 08:10 alert.

---

### [ISSUE-1] Reuters RSS — 66 consecutive failures, never succeeded

**Class:** ISSUE | **Severity:** HIGH  
**Re-probe command:** `get_system_status` (source health section)

**Evidence (re-confirmed 10:03 UTC):**
```
Reuters RSS | Ngưng | Chưa bao giờ | 66 ⚠
```
Failure count increased 40→66 since the 08:10 report. "Chưa bao giờ" = never succeeded in current server uptime (5h 8m).

**Caller surface:** news-scout pipeline (international macro headlines); reduces news diversity and may miss macro catalysts.

**Suggested fix:** Check Reuters RSS endpoint URL validity; look for IP block/rate-limit; consider URL rotation or proxy path. This has been broken since server start.

---

### [ISSUE-2] Trading Economics — 66 consecutive failures each (2 endpoints), never succeeded

**Class:** ISSUE | **Severity:** HIGH  
**Re-probe command:** `get_system_status` (source health section)

**Evidence (re-confirmed 10:03 UTC):**
```
Trading Economics | Ngưng | Chưa bao giờ | 66 ⚠  (endpoint 1)
Trading Economics | Ngưng | Chưa bao giờ | 66 ⚠  (endpoint 2)
```
Both TE endpoints remain circuit-broken. Failure count 40→66 since 08:10 report.

**Caller surface:** Macro data pipeline — `get_macro_snapshot` (24 refs in flow files), `macroIndicatorRefreshJob`. Macro signals currently served from stale cache or fallback values.

**Suggested fix:** TradingEconomics blocks scrapers aggressively. Check for session cookie expiry, new anti-bot fingerprinting, or need for API key rotation. macroIndicatorRefreshJob avg 17.4s suggests it's attempting but circuit-breaking quickly.

---

### [ISSUE-3] Foreign flow — recurring primary-endpoint failure + WARN log storm each market minute

**Class:** ISSUE | **Severity:** LOW (self-healing)  
**Re-probe command:** `get_system_status` (recent errors section)

**Evidence (re-confirmed 10:03 UTC):**
```
[WARN] 08:58 foreign-flow-job: fallback activated
[WARN] 08:58 foreign-flow-job: all fallbacks exhausted
[WARN] 08:59 fallback: primary endpoint failed
[WARN] 08:59 fallback: all fallback sources exhausted, returning empty
[WARN] 15:58 foreign-flow-job: fallback activated  (same pattern, repeated per minute)
[WARN] 15:59 fallback: primary endpoint failed
```

**Mitigating context:** `foreignFlowFetcherJob` cron shows 100% success (2029 total runs). VPS push log shows successful pushes at 09:00, 09:30 etc. The main-server direct fetch always fails; VPS fallback self-heals within the same minute. System is functionally healthy but logs ~2 WARNs per market minute = ~100+ WARNs per trading day.

**Caller surface:** `get_foreign_flow`, `get_market_foreign_flow` — data is present (probed `get_foreign_flow(code="HPG")` successfully). Real impact: log noise obscures genuine errors.

**Suggested fix:** Demote the known-failing primary-path WARN to DEBUG, or suppress it entirely if VPS is the canonical path for foreign-flow data.

---

### [ISSUE-4] Low-reliability cron jobs (below 95% threshold)

**Class:** ISSUE | **Severity:** LOW  
**Re-probe command:** `get_cron_health`

| Job | Rate (08:10) | Rate (10:12) | Runs | Notes |
|-----|-------------|-------------|------|-------|
| `vnstockTradingStatsRefresh` | 80.0% (5 runs) | 85.7% (7 runs) | 7 | Still below 95%; very long avg 649s |
| `bctcReparseJob` | 89.7% (107 runs) | 89.5% (105 runs) | 105 | ~11% failure rate; avg 200s |

No cron below the 80% alert threshold (all above `cronHealthAlertJob` trigger). Both jobs are long-running and likely timeout/OOM prone.

**Suggested fix:** Capture failure error logs for `vnstockTradingStatsRefresh` and `bctcReparseJob`; add timeout/retry guards if network or DB-contention is root cause.

---

### [ISSUE-5] SBV storeSbvSnapshot REJECTED — zero-value ERROR every 30 min post-market-close (NEW)

**Class:** ISSUE | **Severity:** LOW  
**Probe command:** `get_system_status` (recent errors section)

**Evidence (10:03 UTC):**
```
[ERROR] 2026-06-19 10:00:21  sbv: storeSbvSnapshot REJECTED — zero-value would overwrite good prior row
[ERROR] 2026-06-19 09:30:19  sbv: storeSbvSnapshot REJECTED — zero-value would overwrite good prior row
[ERROR] 2026-06-19 09:00:18  sbv: storeSbvSnapshot REJECTED — zero-value would overwrite good prior row
```
Pattern: exactly at each 30-min intelligenceCycle tick after market close (09:00, 09:30, 10:00 UTC = 16:00, 16:30, 17:00 VN).

**Analysis:** The guard (`storeSbvSnapshot REJECTED`) is working correctly — it prevents overwriting a valid SBV rate with zeros. The issue is upstream: the `intelligenceCycleJob` attempts to fetch/store an SBV rate snapshot at every 15-min tick, but SBV stops publishing rates after market close (~15:30 VN / 08:30 UTC). The dedicated `sbvRatesRefreshJob` (last successful at 08:00 UTC at 100% rate) correctly ran in-window. Post-close, the intelligence cycle's SBV sub-fetch gets zero-value responses and the guard correctly blocks them — but logs them as ERROR rather than WARN.

**Caller surface verified:**
```bash
grep -rn "storeSbvSnapshot\|sbv.*snapshot" apps/mcp-server/src/ docs/agents/*/flow/*.md
```
Root: `intelligenceCycleJob` SBV sub-fetch. No agent flow file is affected by the error — the guard succeeds.

**Suggested fix:** Two options:
1. In the intelligence cycle, skip SBV update if current time is outside SBV publication window (02:00–08:30 UTC, Mon–Fri).  
2. Change log level from ERROR to WARN/DEBUG for the zero-value rejection — it's expected behaviour post-close, not an error.

---

## NOT-A-BUG — Probe Error (my initial call used wrong param)

### `get_foreign_flow` param: my initial probe used `ticker`, but tool requires `code`

**Initial probe (FAILED):**
```
get_foreign_flow({"ticker": "HPG"}) → Required field "code" missing
```

**Re-probe with correct param (SUCCEEDED):**
```
get_foreign_flow({"code": "HPG"}) → {source_tier:2, text:"Foreign Flow Analysis — HPG\nDirection: neutral..."}
```

**Tool doc check:** `docs/agents/tools/list/get_foreign_flow.md` already correctly documents `code` as the required parameter. The doc is accurate.

**Caller surface verified:**
```bash
grep -rn "get_foreign_flow" docs/agents/*/flow/*.md .claude/skills/*/SKILL.md
# unified-agent/flow/market-analysis.md:30 — text description, not an API call with params
# fb-market-poster.md fix note: "get_foreign_flow() required code — corrected"
```
**0 affected callers. NON-ISSUE — tool and docs are correct.**

---

## IMPROVE FINDINGS — Re-confirmed, no operational impact

### [IMPROVE-1] `get_technical_indicators` doc drift: `ticker` vs live `code`

**Class:** IMPROVE (doc drift only)  
**Re-probe (10:04 UTC):**
```
get_technical_indicators({"ticker": "FPT"}) → InputValidationError: Required field "code" missing
```
**Caller surface verified (from prior report):**
```bash
grep -rn "get_technical_indicators" docs/agents/*/flow/main.md .claude/skills/*/SKILL.md
# fb-market-poster/flow/main.md:109 uses {"code": ticker}  ← CORRECT
```
**0 broken callers.** Doc update only needed — update `docs/agents/tools/list/get_technical_indicators.md` to use `code`.

---

## Healthy Tools — Spot-checked this cycle

| Tool | Status | Evidence |
|------|--------|----------|
| `get_market_snapshot` | ✅ OK | VN-Index 1824.53, breadth data, 10:02 UTC |
| `get_macro_snapshot` | ✅ OK | `{text: string}` valid shape; oil/gold/USD/yield/carry signals present |
| `get_cycle_bootstrap` | ✅ OK | agent_name="news-scout" — full bootstrap in 7ms |
| `get_system_status` | ✅ OK | All 16 circuit breakers CLOSED |
| `get_cron_health` | ✅ OK | 70+ jobs tracked; most 99–100% success |
| `get_vps_proxy_health` | ⚠️ PARTIAL | prices/news/sbv/foreign-flow healthy; bctc STALE (BUG-1) |
| `get_vps_service_health` | ⚠️ PARTIAL | 2 healthy, 2 idle (expected), 1 unhealthy (bctc — BUG-1) |
| `get_sla_status` | ✅ OK | 4 ok, 1 CRITICAL breach (bctc) |
| `get_pipeline_health` | ✅ OK | 42 tickers; 35 TA-ready, 5 oversold signals; D2D/DPM/NKG/NVL/REE |
| `get_earnings_calendar` | ✅ OK | 41 tickers Q1-2026 filing status; 10 QUÁ HẠN overdue |
| `get_week_period` | ✅ OK | W25, periodKey=2026-06-15/2026-06-21 |
| `get_agent_signals` | ✅ OK | news-scout: empty (off-hours, expected) |
| `get_foreign_flow` (code) | ✅ OK | HPG neutral signal, 10d history returned |
| `task_claim` | ✅ OK (schema) | get_week_period + claim pattern verified via digest-predict flow |

---

## Source Health Snapshot (get_system_status — 10:03 UTC)

| Source | Status | Consecutive Failures |
|--------|--------|----------------------|
| bloomberg | OK | 0 |
| CafeF RSS | Degraded | 3 |
| heartbeat | OK | 0 |
| newsapi | disabled | — |
| nld | OK | 0 |
| **Reuters RSS** | **Stopped** | **66 ⚠** |
| **Trading Economics × 2** | **Stopped** | **66 ⚠ each** |
| VnEconomy RSS | Degraded | 3 |
| VnExpress RSS | Degraded | 3 |

RSS degraded sources (CafeF, VnEconomy, VnExpress) show 3 consecutive failures each — likely a transient fetch batch issue; these succeeded "3 phút trước" so they are partially working.

---

## Data Freshness SLA (get_sla_status — 10:03 UTC)

| Signal | Age (min) | SLA (min) | Status |
|--------|-----------|-----------|--------|
| price | 4 | 95 | ✅ ok |
| **bctc** | **3683** | **360** | **🔴 CRITICAL breach** |
| news | 5 | 30 | ✅ ok |
| sbv_fx | 4 | 30 | ✅ ok |
| foreign_flow | 64 | 95 | ✅ ok |

---

## Cron Health Notable (get_cron_health — 10:03 UTC)

All 70 jobs at ≥80% success rate (cronHealthAlertJob threshold). Noteworthy:

| Job | Rate | Runs | Avg Duration |
|-----|------|------|-------------|
| `intelligenceCycleJob` | 99.4% | 990 | 34,805ms |
| `bctcReparseJob` | 89.5% | 105 | 200,549ms |
| `vnstockTradingStatsRefresh` | 85.7% | 7 | 649,220ms |
| `bctcPdfPullJob` | 99.3% | 403 | 42,984ms |

---

*Report generated: 2026-06-19T10:12 UTC | Path: docs/agent-memory/health/team-tool-recheck-2026-06-19-1012.md*
