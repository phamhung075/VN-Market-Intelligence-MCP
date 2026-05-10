# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md` | **Archived Done tasks:** See `docs/TASKS_ARCHIVE.md` for complete history (1777–1848)

---

## Backlog

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|

---

## Todo

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| 1863g | CHORE-M: Bootstrap data + knowledge updates — update cron-jobs.md, alert-policy.md, tree-map.md with verdictResolutionJob entries. docs/data/alert-verdicts.json already created (ready). ~1h. | MEDIUM | CHORE | developer | docs/handoffs/TASK_1863g.md | — |
| 1862c | FIX-HIGH: Cowork scheduled-task MCP access — market-watcher BLOCKED at 04:38, unified-agent 4x BLOCKED before CLI recovery. **BLOCKED: Awaiting architect RCA.** Once RCA complete, PM will decompose into atomic fix tasks per 3-lever pattern (event/timeout/state). | HIGH | FIX | architect → developer | — | architect-rca |
| 1862h | CHORE-LOW: Hardcoded tool/job counts in knowledge files — restart-policy.md and ops-incident-response.md show 112 tools (actual 128). Replace with pointer to project-stats.json or dynamic health check. | LOW | CHORE | code-janitor | — | Done |
| 1862i | CHORE-LOW: project-stats.json stale infrastructure status — still shows mcpServerHealth DOWN despite recovery at 03:01 UTC. Update infrastructureStatus to reflect current state. | LOW | CHORE | ops | — | — |

---

## In Progress

| Task ID | Title | Priority | Type | Owner | Handoff | Started |
|---------|-------|----------|------|-------|---------|---------|

---

## Review

| Task ID | Title | Priority | Type | Owner | Handoff |
|---------|-------|----------|------|-------|---------|

---

## Done

| Task ID | Title | Priority | Type | Owner | Completed |
|---------|-------|----------|------|-------|-----------|
| 1863a | FEATURE-M: Create `infrastructure/fileStore/alertVerdictStore.ts` — read/write/prune abstraction for `docs/data/alert-verdicts.json`. Atomic temp-file + rename pattern. Interface-injectable for tests. ~2h. | MEDIUM | FEATURE | dev-mcp-server | 2026-05-10 |
| 1863b | FEATURE-M: Create `scheduler/alerts/verdictResolutionJob.ts` core — hourly cron job, pending→confirmed/false_positive logic, direction-match rule, price fetch, fail-loud on error. ~2h. | MEDIUM | FEATURE | dev-mcp-server | 2026-05-10 |
| 1863c | FEATURE-M: Register cron + scheduler wiring — cronConfig.ts entry `0 * * * *`, startScheduler.ts registration, jobRunRepo.wrapRun pattern. ~1h. | MEDIUM | FEATURE | dev-mcp-server | 2026-05-10 |
| 1863d | FEATURE-M: Create `interface/mcp/tools/alerts/alertVerdictTools.ts` — `write_alert_verdict` MCP tool (Zod schema, UUID gen, append to store). ~2h. | MEDIUM | FEATURE | dev-mcp-server | 2026-05-10 |
| 1863e | CHORE-M: Update alert-commander flow + tool-package — add `write_alert_verdict` to cycle.md Step 4a, update alert-commander.md tool table. ~1h. | MEDIUM | CHORE | developer | 2026-05-10 |
| 1863f | FEATURE-M: Unit tests — verdict logic (10 AC cases), 24h window guard, TTL pruning, fail-loud on price fetch. ~2h. | MEDIUM | FEATURE | dev-mcp-server | 2026-05-10 |
| 1862f | FIX-HIGH: Reuters/TE RSS errors regression — exponential backoff on CircuitBreaker. 15min base + ×2 backoff + 2h cap for Reuters + TradingEconomics. 3 files + 10 tests. | HIGH | FIX | developer | 2026-05-10 |
| 1862g | FIX-MEDIUM: urgent_news 4h dedup — postSignal() returns -1 for same (stock_code, signal_type, direction) within 4h window. 2 files + 10 tests. | MEDIUM | FIX | developer | 2026-05-10 |
| 1862k | OPS-HIGH: vnstock rate limiter deployment — Container rebuilt with RPM 80 + SYNC_DELAY_MS 2500ms. 71 tickers were RATE_LIMITED due to stale image. | HIGH | OPS | ops | 2026-05-10 |
| 1862j | FIX-CRITICAL: sigma threshold data safeguard — W-3 dedup aborts if >50% rows would be deleted. Critical finding + agent_feedback on abort. 2 files, 5 tests. | CRITICAL | FIX | developer | 2026-05-10 |
| 1862e | CHORE: Add Error Boundary to 7 pre-standardization dev-team flows — architect, ba, developer, fixer, pm, po, qa. All missing Section 6.2 Error Boundary. Agent-father cycle 3 finding. | HIGH | CHORE | agent-father | 2026-05-09 |
| 1862d | FIX-DEPLOY: vnstock_events NOT NULL — verified deployed, JSH working. No action needed. | MEDIUM | FIX | ops | 2026-05-09 |
| 1862b | FIX-HIGH: report-analyzer enum mismatch — added report_analyzer to SKILL_MANIFEST (13 tools). 2 files + 5 tests. | HIGH | FIX | dev-mcp-server | 2026-05-09 |
| 1862a | FIX-CRITICAL: vnstock rate limiter tuning — GLOBAL_RATE_LIMIT_RPM 50→80, SYNC_DELAY_MS 1500→2500ms. 2 files + 5 tests. | CRITICAL | FIX | developer | 2026-05-09 |
| 1860d | SPRINT-S: dev-team flow Step 4.0 — expire_monitoring_reports before Step 4 archive scan. Doc-only. | MEDIUM | SPRINT-S | developer | 2026-05-09 |
| 1860e | SPRINT-S: process_telegram_report delete_success field — structured JSON response, delete_success true/false/null. 2 files + 13 tests. | MEDIUM | SPRINT-S | dev-mcp-server | 2026-05-09 |
| 1860c | SPRINT-S: monitoring report auto-expiry — expireMonitoringReports() 72h TTL, expire_monitoring_reports MCP tool. 3 files + 15 tests. | MEDIUM | SPRINT-S | dev-mcp-server | 2026-05-09 |
| 1860b | FIX: submit_feedback dedup — insertReportDeduped(), 4h window, same from_agent + 50-char prefix. 3 files + 9 tests. | HIGH | FIX | dev-mcp-server | 2026-05-09 |
| 1860a | FIX: process_telegram_report delete guard — markProcessed blocked on Telegram failure. 2 files + 11 tests. | HIGH | FIX | dev-mcp-server | 2026-05-09 |
| 1858c | FIX: logVpsPush() silent failure — safeLogVpsPush wrapper, 6 call sites replaced, 5 tests. | HIGH | FIX | developer | 2026-05-08 |
| 1858a | FIX: pollNews all-dark cooldown 4h→24h — reduces alert spam during sustained VPS push gaps. 3 files. | HIGH | FIX | developer | 2026-05-08 |
| 1857a | FIX: vnstock-sync WAL checkpoint (PASSIVE) between stock iterations. Prevents WAL bloat + DB lock. 1 file + 4 tests. | HIGH | FIX | developer | 2026-05-08 |
| 1850c | FIX: HSG price inconsistency — stale change_pct suppressed in bootstrap when >24h old. Already merged (2aa46a56). | MEDIUM | FIX | developer | 2026-05-08 |
| 1850e | CLEAN: cascade rule gap — chemicals/petrochemicals domain added to alert cascade map. 3 files + 9 tests. | LOW | CLEAN | code-janitor | 2026-05-08 |
| 1856a | FIX: vnstock_events NOT NULL constraint — storeEvents Array.isArray + null-code filter. 1 file + 11 tests. | HIGH | FIX | dev-mcp-server | 2026-05-08 |
| 1855a | FIX: suppress false pollNews all-sources-dark alert when VPS push pipeline is healthy. 2 files + 6 tests. | HIGH | FIX | developer | 2026-05-08 |
| 1850d | CLEAN: DBC domain classification — add Dabaco to agriculture sector in stock-classification.json. 2 files + 1 test. | LOW | CLEAN | code-janitor | 2026-05-07 |
| 1851a | FIX: post_agent_signal schema reconciliation — align market-watcher cycle.md + tools package with actual MCP schema (from_agent, to_agent, signal_type, payload). 2 files. | HIGH | FIX | developer | 2026-05-07 |
| 1851b | FIX: run_impact_chain + post_agent_signal params — news-scout cycle.md (newsText not ticker/event) + tools package. Absorbs 1850b. 3 files. | HIGH | FIX | developer | 2026-05-07 |
| 1851c | FIX: get_price_history actionCode→code — already fixed in prior sprint (commit 0d514018). Stale report closed. | MEDIUM | FIX | — | 2026-05-07 |
| 1851d | FIX: market-watcher session append-only — explicit APPEND instruction in cycle.md Step 5 (GAP-10). 1 file. | MEDIUM | FIX | developer | 2026-05-07 |
| 1850g | FIX: PriceAnomalyFindingDataSchema — ref_price/window_days optional, added passthrough + market-watcher fields. 2 files + 17 tests. | MEDIUM | FIX | dev-mcp-server | 2026-05-07 |
| 1850a | FIX: vnstock-sync storeShareholders Array.isArray + null-code guards. 1 file + 11 tests. | HIGH | FIX | dev-mcp-server | 2026-05-07 |
| 1850f | FIX: Polymarket t163-mkt-* test fixtures excluded from prod + staleness tightened 30d→7d. 1 file + 7 tests. | HIGH | FIX | dev-mcp-server | 2026-05-07 |
| 1849a | SPRINT-S: Schema migration + store functions — resolution tracking on telegram_reports. 2 files, 5 tests. | MEDIUM | SPRINT-S | dev-mcp-server | 2026-05-07 |
| 1849b | SPRINT-S: MCP tool + serializeReport upgrade — process_telegram_report resolution param. 1 file, 3 tests. | MEDIUM | SPRINT-S | dev-mcp-server | 2026-05-07 |
| 1849c | SPRINT-S: Dev-team flow Step 4 update — monitoring loop guard (C-6). 1 file. | MEDIUM | SPRINT-S | developer | 2026-05-07 |
| 1849d | SPRINT-S: Tests + regression — telegram report resolution tests. | MEDIUM | SPRINT-S | dev-mcp-server | 2026-05-07 |
| 1850-GAP9 | FIX: get_technical_indicators migrated from market_prices_history to daily_ohlcv. 1 file + 34 tests. | HIGH | FIX | dev-mcp-server | 2026-05-07 |

---
