# Team MCP Tool Recheck — 2026-06-14 08:08 UTC

**Run by:** health-recheck agent (claude-sonnet-4-6)
**Gateway:** `mcp__gateway__call_tool(server="vn-market", ...)`
**vn-market reachable:** YES (get_system_status OK, uptime 5m47s at run start)
**DB:** market.db 275.1 MB | WAL 2.63 MB

---

## Tool Coverage — Probed This Cycle

| Tool | Probe Result | Notes |
|---|---|---|
| `get_system_status` | ✅ OK | Baseline — confirms gateway reachable |
| `get_cron_health` | ✅ OK | Full cron table returned |
| `get_cycle_bootstrap` | ✅ OK (requires `agent_name`) | Fails schema validation without agent_name param |
| `get_market_snapshot` | ✅ OK | VN-Index 1,791.65 (-0.39%) |
| `get_pipeline_health` | ✅ OK | Ticker rows + RSI from daily_ohlcv |
| `get_vps_proxy_health` | ✅ OK | 4 routes; news flagged STALE (see ISSUE-04) |
| `get_vps_service_health` | ✅ OK | 3 healthy, 2 idle (market closed) |
| `get_rate_limit_status` | ✅ OK | 11 sources, 0 throttled |
| `get_sla_status` | ✅ OK | News SLA breach detected (see ISSUE-01) |
| `get_macro_snapshot` | ✅ OK | Dual-format JSON-in-text response |
| `get_earnings_calendar` | ✅ OK | 41 tickers, 12 QUÁ HẠN |
| `get_watchlist` | ✅ OK | 41 tickers returned |
| `get_alerts` | ✅ OK | 5 unread LOW alerts |
| `get_technical_indicators` | ⚠️ DEGRADED | Returns N/A for all indicators (see ISSUE-02) |
| `get_ticker_intelligence` | ✅ OK | VCB brief returned correctly |
| `get_price_history` | ✅ OK | 21 rows VCB 30d returned |
| `task_list_held` | ✅ OK | 0 orphaned locks |
| `task_claim` / `task_release` | Schema OK (not mutated — read-only run) | |

---

## ACTIVE Findings (re-confirmed this cycle)

### BUG-01 — HNX/UPCOM all price sources failing (recurring)
| Field | Value |
|---|---|
| **Class** | BUG |
| **Tool / Source** | `get_cycle_bootstrap`, `get_price_history` (HNX/UPCOM tickers) |
| **Evidence** | System errors every ~60s: `[hnx] all UPCOM price sources failed` + `[hnx] all HNX price sources failed` — last seen 08:02:14 UTC. BDI [HNX], JSH [HNX], VNH [HNX] → N/A price. DLC [UPCOM], VDC [UPCOM] → N/A price. `get_pipeline_health`: BDI/DLC/JSH/SIS/VDC all 0 rows, "TA not ready". |
| **Caller surface** | `docs/agents/market-watcher/flow/cycle.md:77` — `get_price_history(code)` called per ticker. `get_cycle_bootstrap` market_context includes HNX/UPCOM tickers. 5 tickers have zero price data. |
| **Blast radius** | market-watcher: 5 tickers permanently N/A during market hours. bctcQueueEnricher: also failing to find URLs for these same tickers (VNH, VDC — correlated). |
| **Suggested fix** | Diagnose HNX price source failures on dev-stock-price service. Check VPS `vn-price-fetch` route health (shows "idle" today because weekend — verify it recovered Friday). Review circuit breaker logic: hnx source shows 0 failures in circuit_breaker status but prices still failing. |

---

### BUG-02 — `vnstockFundamentalsRefresh` CRASHED (unresolved since 2026-06-08)
| Field | Value |
|---|---|
| **Class** | BUG |
| **Tool / Cron** | `vnstockFundamentalsRefresh` cron |
| **Evidence** | `get_cron_health`: last_status=`crashed`, success_rate=0.00 (0.0%), total_runs=1, avg_duration=4035883ms (67 min). Last run: 2026-06-08. Never re-run. No recovery in 6 days. `cronHealthAlertJob` runs daily (last: 2026-06-14 00:00 UTC) — unclear if it caught this 0% rate. |
| **Caller surface** | `docs/agents/tools/package/bctc-analyst.md` — BCTC analyst depends on fundamental data from this cron. `get_bctc_full`, `get_financial_summary` quality affected. Grep: `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts` |
| **Blast radius** | Fundamental data (P/E, P/B, EPS) for all 41 watchlist tickers is stale since 2026-06-08. bctc-analyst passes could be degraded. |
| **Suggested fix** | Investigate crash root cause in `vnstockFundamentalsJob.ts`. 67-minute avg_duration suggests a timeout or memory issue. Review `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts`. Add retry + timeout guard. Re-trigger manually after fix. |

---

### BUG-03 — BCTC Zero-confidence extraction (PPC Q1-2026)
| Field | Value |
|---|---|
| **Class** | BUG |
| **Tool / Source** | `bctcReparseJob` → BCTC extraction pipeline |
| **Evidence** | System error: `[BCTC] Zero-confidence extraction — skipped insert for PPC 2026-Q1` at 08:01:47 UTC. PPC shows QUÁ HẠN in earnings calendar. `get_earnings_calendar` confirms PPC Q1-2026 overdue (deadline 30/04/2026, not filed). bctcReparseJob currently running (status=running since 07:57:42) with 79.9% success rate (below 80% cronHealthAlert threshold). |
| **Caller surface** | `docs/agents/bctc-analyst/flow/main.md` — ESC-5 checks `get_bctc_refined(report_id)`. BCTC analyst passes for PPC will have zero data. |
| **Blast radius** | PPC BCTC analysis silently suppressed. bctcReparseJob at 79.9% triggers cronHealthAlert policy. |
| **Suggested fix** | Investigate PDF extraction failure for PPC. Check if PDF was downloaded (`bctcPdfPullJob` 96% rate). May need manual PDF re-trigger via `trigger_bctc_vps_fetch`. For the 79.9% success rate: check dev-pdf-extractor for recurring parse errors. |

---

### BUG-04 — bctcQueueEnricher: 0 URLs for 9 tickers
| Field | Value |
|---|---|
| **Class** | BUG |
| **Tool / Cron** | `bctcQueueEnricherJob` |
| **Evidence** | System warnings at 15:00-16:00 VN (08:00-09:00 UTC): `0 URLs found for SIS`, `0 URLs found for VDC`, `0 URLs found for VNH`, `0 URLs found for VEA`, `0 URLs populated across all 9 items — all sources may be unavailable or geo-blocked`. bctcQueueEnricherJob shows success_rate 99.6% (jobs complete but with empty results). |
| **Caller surface** | `docs/agents/bctc-analyst/flow/main.md` → get_earnings_calendar → BCTC queue fetch. SIS, VDC, VNH, VEA all show QUÁ HẠN. Without queue enrichment, BCTC PDFs cannot be fetched for these tickers. |
| **Blast radius** | 4+ overdue BCTC tickers (SIS, VDC, VNH, VEA) cannot be fetched — BCTC analyst has zero input for these. |
| **Suggested fix** | Review URL scraping logic for these tickers in `bctcQueueEnricher`. Check if SSC portal structure changed or if these tickers use non-standard filing paths. VEA and VNH are known low-liquidity tickers — verify they filed at all. |

---

## ISSUE Findings (re-confirmed this cycle)

### ISSUE-01 — News SLA CRITICAL breach (58min vs 30min)
| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Tool** | `get_sla_status` |
| **Evidence** | `get_sla_status` at 08:04 UTC: news age=58min, SLA=30min, status=CRITICAL breach. However VPS news proxy pushed at 07:53 (11min ago). The SLA checker may measure a different pipeline stage (e.g., `market_messages` table ingestion lag) vs raw VPS push. Source health shows CafeF RSS, VnExpress RSS, VnEconomy RSS, Reuters RSS all "never succeeded / degraded" — these are direct-fetch paths bypassed by VPS proxy. newsapi: disabled. |
| **Caller surface** | `docs/agents/news-scout/flow/cycle.md` — news freshness is prerequisite. `docs/agents/unified-agent/flow/chef.md` — news intel is Layer 1 of TNB walk. SLA breach triggers `send_telegram(bug)` from freshnessSlaMonitorJob. |
| **Blast radius** | Potential false-positive BUG alerts flooding channel if SLA is measuring wrong stage. News IS arriving (6 articles in cycle_bootstrap recent analysis). |
| **Suggested fix** | Investigate what data source `get_sla_status` reads for "news" age. If it measures `market_messages` table vs `news_articles`, align the two pipelines. Consider raising SLA threshold or making VPS-path delivery count toward SLA. |

---

### ISSUE-02 — `get_technical_indicators` returns N/A for all indicators (data path gap)
| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Tool** | `get_technical_indicators` |
| **Evidence** | `get_technical_indicators(code="VCB")` and `get_technical_indicators(code="FPT")` both return N/A for MA5/MA20/MA50/RSI14/MACD/BB20 with message "needs 15 minimum candles". But `get_pipeline_health` shows VCB has 37 rows (`TA ready`, RSI14=43.8) and FPT has 37 rows. Source_tier=3 in response. The tool delegates to technical-analysis microservice (port 5003) which has its own OHLCV store — apparently NOT reading from the same daily_ohlcv table that pipeline health uses. `ta-ohlcv-backfill` ran 2026-06-12 01:30 UTC (success) but TA service may not have received data. |
| **Caller surface** | `docs/agents/market-watcher/flow/cycle.md:77` — `get_technical_indicators(code)` called for every ticker with price move. If N/A outside market hours, market-watcher's price anomaly analysis step is blind during off-hours cycles. |
| **Caller count** | 1 confirmed caller in active flows: `market-watcher/flow/cycle.md`. Also referenced in `docs/agents/tools/package/market-watcher.md` (package doc). |
| **Blast radius** | market-watcher cannot compute RSI/MACD/BB confirmations. Off-hours cycles (weekends, pre-market) have zero TA signal support. |
| **Suggested fix** | Check if `ta-ohlcv-backfill` output reaches the technical-analysis service internal store. Add fallback: if TA service returns N/A but daily_ohlcv has sufficient rows, compute RSI14 from daily_ohlcv directly. |

---

### ISSUE-03 — `bctcReparseJob` success_rate 79.9% (below 80% threshold)
| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Tool / Cron** | `bctcReparseJob` |
| **Evidence** | `get_cron_health`: success_rate=0.80 (79.9%), total_runs=184, currently running (since 07:57:42). The cronHealthAlert policy fires alerts when success_rate < 80%. This rate is at the threshold boundary. |
| **Caller surface** | Feeds BCTC extraction pipeline → `get_bctc_full`, ESC-5 in bctc-analyst flow. |
| **Suggested fix** | Review recent parse failures in `bctcReparseJob` logs. Most likely same root cause as BUG-03 (zero-confidence extractions). Fix PDF extraction quality in dev-pdf-extractor. |

---

### ISSUE-04 — VPS news proxy stale flag (likely false positive)
| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Tool** | `get_vps_proxy_health` |
| **Evidence** | `get_vps_proxy_health` flags news as "STALE" but shows 40 pushes in 24h, last push at 07:53 UTC (11min ago). The stale flag appears triggered by low item volume (2 items per push). `vn-news-fetch` shows healthy in `get_vps_service_health`. |
| **Caller surface** | `docs/agents/system-auditor/flow/main.md:107` — auditor checks VPS proxy routes, would flag this as B-06/B-07 violation. Could cause false-positive BUG alerts from system-auditor. |
| **Suggested fix** | Review staleness thresholds in VPS proxy health monitor. If 2-item pushes every 16 min are the expected volume pattern, adjust the stale detection to use last-push timestamp (not item count). |

---

## IMPROVE Findings

### IMPROVE-01 — Tool list docs use stale `ticker` param (0 affected callers)
| Field | Value |
|---|---|
| **Class** | IMPROVE |
| **Tools** | `docs/agents/tools/list/get_technical_indicators.md`, `docs/agents/tools/list/get_price_history.md` |
| **Evidence** | Both docs specify param name as `ticker`. Live API validation error when calling with `ticker`: `"Required field: code"`. Live API requires `code`. All callers (flow files, package docs) already use `code` correctly. Grep: `docs/agents/market-watcher/flow/cycle.md:77` uses `code`. `docs/agents/tools/package/market-watcher.md:36` uses `code`. |
| **Caller-surface verified** | `grep -r "get_technical_indicators\|get_price_history" docs/agents/*/flow/ docs/agents/tools/package/` — 0 callers use `ticker` param. All use `code`. NON-ISSUE for production. |
| **Suggested fix** | Update `docs/agents/tools/list/get_technical_indicators.md` and `docs/agents/tools/list/get_price_history.md`: change `ticker` → `code` in the Parameters table and example. |

---

### IMPROVE-02 — Direct RSS source health misleads operators
| Field | Value |
|---|---|
| **Class** | IMPROVE |
| **Evidence** | `get_system_status` shows CafeF RSS, VnExpress RSS, VnEconomy RSS, Reuters RSS, Trading Economics all as "Suy giảm / never succeeded". But data from these sources IS arriving via VPS proxy (cycle_bootstrap shows recent cafef.vn and vnexpress.net articles). Source health tracks direct-fetch failures, not VPS-path successes. Creates operator confusion. |
| **Suggested fix** | In `get_system_status` output, annotate geo-blocked sources with "(VPS path active)" when VPS proxy for that source has recent pushes. Or suppress direct-fetch degraded status for known geo-blocked sources. |

---

### IMPROVE-03 — `vnstockFundamentalsRefresh` not caught by cronHealthAlertJob
| Field | Value |
|---|---|
| **Class** | IMPROVE |
| **Evidence** | `vnstockFundamentalsRefresh` has 0.0% success rate since 2026-06-08 (crashed). `cronHealthAlertJob` runs daily (last: 2026-06-14 00:00 UTC success). Either the alert fired and was not acted on, or this job is excluded from cronHealthAlert checks. Given 6-day window without fix, likely the alert is not being routed to the right channel or is suppressed. |
| **Suggested fix** | Verify `cronHealthAlertJob` covers all crons or at least `vnstockFundamentalsRefresh`. If alert fired to WORK channel, check whether dev-team received it. |

---

## RESOLVED Findings (prior cycle carry-forward check)

No prior report found in `docs/agent-memory/health/` — this is the first run of this health check format. No carry-forward items to re-probe.

---

## Summary

| Class | Count | Callers affected |
|---|---|---|
| BUG | 4 | BUG-01: market-watcher (5 tickers), BUG-02: bctc-analyst, BUG-03: bctc-analyst/PPC, BUG-04: bctc-analyst (4 tickers) |
| ISSUE | 4 | ISSUE-01: news-scout/unified-agent, ISSUE-02: market-watcher, ISSUE-03: bctc pipeline, ISSUE-04: system-auditor |
| IMPROVE | 3 | 0 production impact — doc/ops quality only |

**Overall system verdict: DEGRADED** — HNX/UPCOM price source failures and vnstockFundamentalsRefresh crash (6 days unresolved) are the highest priority items. Technical indicators tool blind spot is a market-hours risk.
