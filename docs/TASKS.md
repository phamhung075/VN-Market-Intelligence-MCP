# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md` | **Archived Done tasks:** See `docs/TASKS_ARCHIVE.md` for complete history (1777–1896+)

---
## Backlog

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| alert-precision-488-unknowns | **MONITORING**: Post-DB-rebuild agent_signals=46 (fresh DB). HOLD until ≥550. From TNB c58 Finding #8 + bug 2874. | MEDIUM | TRACKING | — | — | — |
| fa-shape-guard-watch | **MONITORING**: Next observation = first post-restart FA live session. Auto-cure trigger: REGIME-mismatch or news-fallback → spawn 1921a-fa-shape-guard-propagate. If NEUTRAL macro_snapshot → close. | MEDIUM | TRACKING | — | — | — |
| 1907a-digest-predict-silence | **CRITICAL** (c168 update): `vn-market` MCP server (`http://localhost:3000/sse`) added to `claude_desktop_config.json` mcpServers. **USER-ACTION: restart Claude Desktop** to load new MCP config. After restart, scheduled cowork tasks will have vn-market MCP access. Verify by checking digest-predict runs again. | CRITICAL | OPS | user | — | — |
| 1897b-carry | F1 USER: Docker .git/ exclude bundle + VirtioFS structural fix. PREFLIGHT cure permanent policy (1906a c89). F1 USER action (Docker .git/ exclusion) is the only structural cure. Brief: `docs/architecture-briefs/2026-05-13-headlock-recurrence-post-F2a.md`. | HIGH | URGENT-F1 | user | — | — |

---

## Todo
| ARCH-1942 | **Sprint 1942 BLOCKING ARCH** — DONE. Brief at `docs/architecture-briefs/2026-05-18-watchlist-fundamentals-cadence.md`. Two-gap diagnosis (vnstock startup probe missing + cashFlowTool needs fallback). No new cron, no new files. BA-1942a + BA-1942b unblocked. | HIGH | ARCH | architect | DONE | — |
| 1942a | **DONE 2026-05-18** — Startup backfill probe implemented. `vnstockStartupProbe.ts` + wired in `startScheduler.ts`. Guard: COUNT(DISTINCT code WHERE data_type='financials') < 10 OR last fetch > 7 days → fire runVnstockFundamentalsJob() after 90s delay. 6/6 unit tests GREEN. All 11 ACs PASS. Merged: chore(1942/mcp-server): merge task/1942a-startup-backfill-probe. Report: `reports/TASK_REPORT_1942a.md`. | HIGH | TASK | qa | docs/handoffs/TASK_1942a.md | ARCH-1942 |
| 1942b | **DONE 2026-05-18** — cashFlowTool fallback read path implemented. COALESCE-style decision (COUNT financial_reports → fallback to vnstock_cash_flow/vnstock_financials). data_source field added to CashFlowFound. loading=true UX for cold DB. Unit conversion ×1000 (tỷ→triệu). backfillOCFForWatchlist() added to schema-financial-reports.ts + wired in migration block. 10/10 new tests GREEN, 50/50 cashflow suite GREEN, 0 tsc errors. 2 files modified: cashFlowTool.ts + schema-financial-reports.ts. Depends: 1942a. | HIGH | TASK | dev-mcp-server | docs/handoffs/TASK_1942b.md | 1942a |
| 1942c | **DONE 2026-05-18** — HPG OCF all-zeros fix. `vnstockBridge.ts`: CASH_FLOW_SCRIPT multi-key fallback (3 keys) + NULL policy; FINANCE_SCRIPT NI multi-key fallback. `cashFlowExtractor.ts`: P_OPERATING_CF_MFG + F_OPERATING_CF_MFG steel-sector label added + wired into fv() call. `vnstockTypes.ts`: operatingCashFlow: number\|null. 6/6 new tests GREEN (T1-T6). 50/50 cashflow regression suite GREEN. 0 tsc errors. Scenario B confirmed (financial_reports=0 rows for HPG). | MEDIUM | TASK | dev-mcp-server | docs/handoffs/TASK_1942c.md | 1942b |
| BA-1942d | **Sprint 1942 TIER 3 (OPTIONAL)** — Write requirement spec for accuracy digest frontend card. Renders top-3/bottom-3 from new gateway endpoint backed by `getSystemAccuracyDigestStats` (Sprint 1941c). Frontend zone, independent of backend tasks. | LOW | BA-SPEC | ba | — | — |
| 1941b-signal-outcomes-seed-window | **Sprint 1941 TIER 2** — 7-day OBSERVE on `signal_outcomes` seeding. AC by 2026-05-25: ≥30 resolved rows (outcome_24h ∈ correct/incorrect/neutral) across ≥3 distinct `signal_type` values. Failure mode → bug task to dev-mcp-server (seed path broken in postSignal wrapper). No code change unless escalation triggers. | MEDIUM | OBSERVE | ops | — | 2026-05-25 |
| 1922g-pharma-events-source-verify | **OBSERVE** — `pharma_events` empty. `davPharmacyJob` cron `0 6 1 * *`. Next tick = 2026-06-01 06:00 UTC. AC: check status + row count after tick. | LOW | OBSERVE | ops | — | 2026-06-01 |
| 1922i-alert-engine-records | **WONTFIX c160 (SPIKE-1933a resolved)** — alert_engine_records always 0: evaluateAlert() dead code deleted (1933b). Architecture: market.db.alerts → Alert Commander = canonical intelligence path. Go alert-engine (/evaluate) reserved for future stop-loss use case. | MEDIUM | WONTFIX | — | — | — |

---

## In Progress

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| _(empty)_ | — | — | — | — | — | — |

---

---

## Review

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
_(empty)_ | — | — | — | — | — | — |

---
## Done

| Task ID | Title | Priority | Type | Owner | Completed |
| kinh-dich-name-fix | **DONE 2026-05-18 QA-APPROVED** — Three root-cause fixes in kinh-dich-service: (1) All 64 QUE_META hexagram names in domain/services.ts corrected to full Vietnamese diacritics (was plain ASCII). (2) Fallback path in application/usecases.ts resolves name from QUE_META.find(q => q.id === stored.hexagram_number) instead of fresh placeholder-score reading. (3) SQLitePriceScoreRepository in infrastructure/repositories.ts corrected to query market_prices_history (was price_history), columns price + fetched_at. 30/30 tests GREEN (8 new), tsc 0 errors, DDD PASS, security PASS. Commit: abf5ef2d. | MEDIUM | FIX | dev-kinh-dich | 2026-05-18 |
| 1943a | **DONE 2026-05-18 QA-APPROVED** — resetQ1UrlNotFound() wired in initFinancialReportsTables (startup idempotent reset). Grace-period auto-retry arm added to bctcQueueEnricherJob COMBINED_SQL (url_not_found + last_attempt >7d + attempts <6). bctcBatchSweepJob diagnostic log added; root cause documented (wrapRun key correct, zero-run = container down 2026-04-25 09:00 UTC). 16/16 new tests GREEN (AC-1 thru AC-4). Full suite: 9219 pass, zero new failures. tsc 0 errors. DDD PASS. Security PASS. Report: reports/TASK_REPORT_1943a.md. | HIGH | FIX | dev-mcp-server | 2026-05-18 |
| SPIKE-1943 | **DONE 2026-05-18 ARCHITECT** — Root cause diagnosis: VPS PDF discovery failure, not stale calendar. Financial_reports zero Q1-2026 rows (max_year=2025). 31 tickers stuck at `url_not_found` in `bctc_vps_queue` (MAX_ENRICH_ATTEMPTS=5 exhausted), 7 `pending` (0 attempts). Calendar deadline logic correct (dynamic computation, no hardcoded seeds). `bctcBatchSweepJob` zero runs (likely `wrapRun` key mismatch). Recommended: TASK-1943a (FIX-HIGH, reset queue + diagnose batch sweep + add auto-retry policy). Output: `docs/spikes/SPIKE_1943-bctc-banking-q1-2026-deadline-delay.md`. | MEDIUM | SPIKE | architect | 2026-05-18 |
| 1941d-fpt-net-profit-ocr-fix | **DONE 2026-05-18 QA-APPROVED** — net_profit_api_bridge column + bridgeNetProfitToFinancialReports() + cashFlowTool COALESCE + ni_source. FPT Q4/2025 OCR=20,225 → bridge=2,509,520 triệu VND, ratio 1.6371 (passes guard). 7 new tests + 17 regression = 24 cashflow tests GREEN, tsc clean, DDD PASS, security PASS. Merged to main. Report: reports/TASK_REPORT_1941d.md. | MEDIUM | FIX | dev-mcp-server | 2026-05-18 |
| _(Older Done entries (1941c, 1941a, calendar-source-replacement, 1940a, 1939a/b, 1937a, 1938a, 1862c-E, 1936b, news-bugs-reuters-bloomberg-fix, 1936, macro-calendar-timeout-cap, 1934, 1933b, 1928a/1929a/1930a/1930c, 1862c-F, 1930b, 1932a, 1931a, 1922f, 1927a, 1926a, 1925a, 1924a/b/c/d, 1923a, 1909c) archived → `docs/TASKS_ARCHIVE.md`; pre-c141 history in git)_ | — | — | — | — | 2026-05-16..18 |

---

## Deferred

| Sprint | Title | Reason | Next Step |
|--------|-------|--------|-----------|
| 1887 | METHODOLOGY-FORENSICS: Virtual Capital / related-party graph detector | Needs own architect brief — graph-store choice, related-party data source, traversal patterns, false-positive control all unspecified | When 1885+1886 ship, queue separate ARCH-1887 brief before ba spec |
| 1892a-ops AC-3 | OPS-NOTE: 1892a-ops AC-3 now UNBLOCKED by 1892b merge (2026-05-12). VPS POST to `/api/push-news` should reach MCP server after deploy. | Unblocked 2026-05-12 | ops re-verify next cycle (observational) |
| TNB-c39-#3 | MONITOR: unified-agent FPT pillar gap (2nd cycle of evidence at c39) | Per TNB protocol need 3rd cycle to auto-cure. | If c40 unified-agent cycle repeats FPT-without-pillars pattern → spawn auto-cure CHORE. If c40 PASSES → close as transient. |
