# Team MCP Tool Health Recheck — 2026-06-19 08:10 UTC

**Run by:** health-recheck agent  
**Cycle start:** 2026-06-19T08:03 UTC  
**Market window:** VN market OPEN (02:00–08:59 UTC)  
**Gateway:** vn-market reachable via mcp__gateway__call_tool  

---

## Summary

| Class | Count |
|-------|-------|
| BUG (broken, ≥1 affected caller) | 1 |
| ISSUE (degraded/failing subsystem) | 4 |
| IMPROVE (doc drift — 0 broken callers) | 2 |
| RESOLVED (n/a — first recheck) | 0 |

**Telegram alert sent:** YES (channel=bug) — BCTC pipeline down

---

## Tool Dependency Map (from flow files + skills)

Derived by grepping `docs/agents/*/flow/main.md` and `.claude/skills/*/SKILL.md`.

| Frequency | Tool(s) |
|-----------|---------|
| 85 refs | `send_telegram` |
| 55 refs | `task_claim` |
| 51 refs | `task_release` |
| 24 refs | `get_macro_snapshot` |
| 12 refs | `task_heartbeat` |
| 11 refs | `post_agent_signal`, `log_agent_work`, `get_cycle_bootstrap` |
| 7 refs  | `get_market_snapshot` |
| 6 refs  | `get_week_period` |
| 5 refs  | `task_list_held`, `get_ticker_intelligence`, `get_market_context` |
| 4 refs  | `get_market_foreign_flow` |
| 3 refs  | `push_bctc_refined_unit`, `get_technical_indicators`, `get_system_status` |
| ≤2 refs | `get_pipeline_health`, `get_cron_health`, `get_alerts`, `get_vps_proxy_health`, `get_vps_service_health`, `get_sla_status`, `get_sentiment_trend`, `get_rate_limit_status`, `get_legal_risk_signals`, `get_earnings_calendar`, `get_agent_signals` |

---

## ACTIVE FINDINGS — Re-confirmed this cycle

### [BUG-1] vn-bctc-fetch VPS service UNHEALTHY → BCTC SLA CRITICAL breach

**Class:** BUG | **Severity:** CRITICAL  
**Probes:** `get_vps_service_health`, `get_vps_proxy_health`, `get_sla_status`, `get_system_status`

**Root cause chain:**
```
vn-bctc-fetch unhealthy (0ms response)
  → bctc VPS proxy stale (last push: 2026-06-16 18:02 UTC — 66h ago, 0 pushes in 24h)
    → BCTC data stale: 3564 min (59.4h old)
      → SLA breach CRITICAL (threshold: 120 min)
```

**Evidence:**
```
get_vps_service_health:
  vn-bctc-fetch | unhealthy | 4m ago | 0ms | 2d 13h 57m uptime

get_vps_proxy_health:
  bctc | 2026-06-16 18:02:24 | 1 item | ok | 0 (24h) | STALE YES
  "STALE: bctc — VPS may be down or unreachable"

get_sla_status:
  bctc | 3564 min old | SLA 120 min | breached | CRITICAL
```

**Caller surface verified:**
```bash
grep -rn "bctc\|push_bctc_refined_unit\|get_bctc" docs/agents/*/flow/main.md
```
Affected agents: `bctc-analyst` (primary consumer), `refine_bctc_md` (push_bctc_refined_unit caller), `dev-pdf-extractor` pipeline. All BCTC reads and writes blocked from fresh data.

**Suggested fix:** Restart `vn-bctc-fetch` VPS service; verify network connectivity from VPS to BCTC source; check for auth/rate-limit issues on BCTC fetch endpoint. Service has been unhealthy for ~66h.

---

### [ISSUE-1] Reuters RSS — 40 consecutive failures, never succeeded

**Class:** ISSUE | **Severity:** HIGH  
**Probe:** `get_system_status`

**Evidence:**
```
Reuters RSS | Ngưng | Chưa bao giờ | 40 ⚠
```
"Chưa bao giờ" = never succeeded in current server lifetime (server started ~3h 9m ago at probe time). 40 is the circuit-breaker max before it stops retrying.

**Caller surface:** `news-scout` flow + any pipeline consuming Reuters headlines. Reduces news diversity and may miss international macro catalysts.

**Suggested fix:** Check Reuters RSS URL/endpoint still valid; check for IP blocking or rate limit; verify the endpoint config in server RSS source list. May require URL rotation or proxy.

---

### [ISSUE-2] Trading Economics — 40 consecutive failures each (2 endpoints), never succeeded

**Class:** ISSUE | **Severity:** HIGH  
**Probe:** `get_system_status`

**Evidence:**
```
Trading Economics | Ngưng | Chưa bao giờ | 40 ⚠  (endpoint 1)
Trading Economics | Ngưng | Chưa bao giờ | 40 ⚠  (endpoint 2)
```
Both TE endpoints fully circuit-broken. TradingEconomics is a key macro data source (commodity prices, interest rates, GDP).

**Caller surface:** `get_macro_snapshot` (24 refs), macro indicator refresh cron jobs, `dev-macro-indicators` pipeline. Macro data is currently served from stale cache / fallback values.

**Suggested fix:** TradingEconomics.com is known to aggressively block scrapers. Check for new anti-bot measures, session cookie expiry, or need for updated request headers/fingerprinting. May need to route through VPS or use the TE official API.

---

### [ISSUE-3] Foreign flow job — recurring fallback exhaustion in system error log

**Class:** ISSUE | **Severity:** MEDIUM  
**Probe:** `get_system_status` (Recent System Errors section)

**Evidence:**
```
[WARN] 08:01 foreign-flow-job: [foreign-flow-job] fallback activated
[WARN] 08:01 foreign-flow-job: [foreign-flow-job] all fallbacks exhausted
[WARN] 08:02 fallback: [fallback] primary endpoint failed
[WARN] 08:02 fallback: [fallback] all fallback sources exhausted, returning empty
[WARN] 08:02 foreign-flow-job: [foreign-flow-job] all fallbacks exhausted
[WARN] 08:03 (same pattern repeats)
```

**Mitigating context:** `get_vps_proxy_health` shows foreign-flow VPS pushes succeeding every ~60s (08:04:05, 08:03:22, 08:03:03). `foreignFlowFetcherJob` cron shows 100% success rate (2016 total runs). The errors in the error log appear to be the MAIN-SERVER direct fetch path failing each minute before the VPS push arrives in the buffer window.

**Assessment:** This is a recurring WARN-level noise from the primary endpoint always failing (main server cannot reach the foreign-flow source directly), but the VPS fallback succeeds within the same minute window. The system is self-healing, but the error log is polluted with WARNs that obscure real failures.

**Suggested fix:** If the main-server direct foreign-flow fetch is permanently broken and VPS is the only viable path, suppress the WARN (or convert to DEBUG) for the known-failed primary path. This reduces noise so genuine failures are visible.

---

### [ISSUE-4] Low-reliability cron jobs

**Class:** ISSUE | **Severity:** LOW  
**Probe:** `get_cron_health`

| Job | Success Rate | Total Runs | Notes |
|-----|-------------|------------|-------|
| `vnstockTradingStatsRefresh` | 80.0% | 5 | 1-in-5 failure rate; may miss data for some tickers |
| `bctcReparseJob` | 89.7% | 107 | ~11 failures; partial BCTC reparse failures |

Neither job is outright broken but both are below the expected ≥95% threshold. The small `vnstockTradingStatsRefresh` sample (5 runs) makes this hard to distinguish from transient failures.

**Suggested fix:** Check error logs for `vnstockTradingStatsRefresh` and `bctcReparseJob` to identify root cause of failures. May be timeout-related (vnstockFundamentalsRefresh avg 665s, vnstockTradingStatsRefresh avg 768s — very long-running jobs prone to OOM or network timeout).

---

## IMPROVE FINDINGS — No operational impact (callers already correct)

### [IMPROVE-1] `get_technical_indicators` tool doc: param name `ticker` vs live `code`

**Class:** IMPROVE (doc drift)  
**Source:** `docs/agents/tools/list/get_technical_indicators.md` says param `ticker`; live zod schema requires `code`

**Proof:**
```bash
# Probe with wrong param fails:
get_technical_indicators({"ticker": "FPT"})
# → Invalid arguments: Required field "code" missing

# Probe with correct param succeeds:
get_technical_indicators({"code": "FPT"})
# → "[FPT] Chỉ báo kỹ thuật ..."

# Source code confirms (apps/.../technicalIndicatorTools.ts:526):
#   code: z.string().min(1).max(10).describe("Stock ticker, e.g. VCB, HPG, FPT")
```

**Caller surface verified:**
```bash
grep -rn "get_technical_indicators" docs/agents/*/flow/main.md .claude/skills/*/SKILL.md
# → fb-market-poster/flow/main.md:109 uses {"code": ticker}  ← CORRECT
```
**0 broken callers.** Doc update needed only.

---

### [IMPROVE-2] `get_ticker_intelligence` tool doc: param name `ticker` vs live `code`

**Class:** IMPROVE (doc drift)  
**Source:** `docs/agents/tools/list/get_ticker_intelligence.md` says param `ticker`; live zod schema requires `code`

**Proof:**
```bash
# Probe with wrong param fails:
get_ticker_intelligence({"ticker": "FPT"})
# → Invalid arguments: Required field "code" missing

# Probe with correct param succeeds:
get_ticker_intelligence({"code": "FPT"})
# → "=== INTELLIGENCE BRIEF: FPT ==="

# Source code confirms (apps/.../tickerIntelligenceTools.ts:368):
#   code: z.string().min(1).describe("Stock ticker symbol, e.g. VCB, FPT, HPG...")
```

**Caller surface verified:**
```bash
grep -rn "get_ticker_intelligence" docs/agents/*/flow/main.md .claude/skills/*/SKILL.md
# → fb-market-poster/flow/main.md:101 uses {"code": ticker}  ← CORRECT
```
**0 broken callers.** Doc update needed only.

---

## Healthy Tools — No issues found

| Tool | Status | Evidence |
|------|--------|----------|
| `get_system_status` | OK | Full response, all circuit breakers closed |
| `get_market_snapshot` | OK | VN-Index 1824.53 live data, breadth data present |
| `get_macro_snapshot` | OK | Live signals for oil/gold/USD/yield/carry |
| `get_market_context` | OK | Full watchlist prices + macro + alerts |
| `get_market_foreign_flow` | OK | Net sell -4.37M, top movers by ticker |
| `get_cycle_bootstrap` | OK | Returns agent_signals + market_context + system_status |
| `get_cron_health` | OK | 60+ jobs tracked, most at 99–100% success rate |
| `get_pipeline_health` | OK | 42-ticker OHLCV coverage; TA ready for 34/42 |
| `get_vps_proxy_health` | OK (partial) | prices/news/sbv/foreign-flow healthy; bctc STALE |
| `get_alerts` | OK | 5 alerts retrieved with correct filter |
| `get_agent_signals` | OK | Correct inbox-mode params work; empty = no pending |
| `task_list_held` | OK | 8 locks returned; cowork-leader-lock active |
| `get_earnings_calendar` | OK | 41 tickers, Q1-2026 filing status visible |
| `get_week_period` | OK | W25 periodKey returned correctly |
| `get_technical_indicators` | OK | FPT indicators returned (with correct `code` param) |
| `get_sentiment_trend` | OK | VNM 7-day sentiment trend computed |
| `get_ticker_intelligence` | OK | FPT brief returned (with correct `code` param) |
| `get_legal_risk_signals` | OK | 9 watchlist legal signals returned |
| `get_rate_limit_status` | OK | 14 sources tracked, 12 ready, 2 in backoff |
| `get_sla_status` | OK | Reports correctly; breaches surfaced |
| `send_telegram` | OK (schema) | Correct params: channel + message (NOT text) |
| `task_claim`/`release`/`heartbeat` | OK (schema) | Docs match expected usage in flow files |
| `post_agent_signal` | OK (schema) | TNB critic gate, retry logic documented |
| `log_agent_work` | OK (schema) | start/end lifecycle documented correctly |

---

## Source Health Snapshot (get_system_status — 08:03 UTC)

| Source | Status | Consecutive Failures |
|--------|--------|----------------------|
| bloomberg | OK | 0 |
| CafeF RSS | Degraded | 1 |
| newsapi | disabled | 0 |
| nld | OK | 0 |
| **Reuters RSS** | **Stopped** | **40 ⚠** |
| **Trading Economics x2** | **Stopped** | **40 ⚠ each** |
| VnEconomy RSS | Degraded | 1 |
| VnExpress RSS | Degraded | 1 |

---

## Data Freshness SLA (get_sla_status — 08:05 UTC)

| Signal | Age (min) | SLA (min) | Status |
|--------|-----------|-----------|--------|
| price | 0 | 10 | ok |
| **bctc** | **3564** | **120** | **CRITICAL breach** |
| news | 35 | 30 | HIGH breach (marginal) |
| sbv_fx | 5 | 30 | ok |
| foreign_flow | 0 | 10 | ok |

---

## Previous Findings Delta

First recheck run — no prior report to delta against.

---

*Report generated: 2026-06-19T08:10 UTC | Committed: main | Path: docs/agent-memory/health/team-tool-recheck-2026-06-19-0810.md*
