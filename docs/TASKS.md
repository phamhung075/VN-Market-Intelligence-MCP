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
| 1869b-seed | FIX-HIGH: DB migration — populate watchlist alert_drop_pct defaults: 7.0 (standard), 9.0 (high-vol: NVL, DPM, REE, VNH, KBC, MWG, TCH). All rows non-null after migration. AC: migration idempotent, standard=7.0 count, high-vol=9.0 count verified. | HIGH | FIX | developer | TASK_1869b-seed.md | 1869b |
| 1862c-D | OPS-HIGH: Add `/vn-market/mcp` Cloudflare ingress route — expose StreamableHTTP endpoint to cowork agents. Edit `~/.cloudflared/config.yml`, add ingress rule `path: /vn-market/mcp → http://localhost:3000/mcp` + reload cloudflared. Update cron hints (market-watcher, unified-agent, news-scout flows) from `https://zenmidi.com/mcp` to `https://zenmidi.com/vn-market/mcp`. No Docker rebuild. Arch brief: 1862c-D, ship with 1862c-E. | HIGH | OPS | ops | TASK_1862c-D.md | — |
| 1862c-E | OPS-HIGH: Increase SSE keepAliveTimeout 30s → 300s — eliminate heartbeat-at-timeout-boundary race on `/vn-market/sse` Cloudflare route. Edit `~/.cloudflared/config.yml` keepAliveTimeout value. No Docker rebuild. Ship together with 1862c-D in single cloudflared reload. | HIGH | OPS | ops | TASK_1862c-E.md | — |
| 1862c-F | FIX-MEDIUM: SseSessionManager dead-session eviction + reconnect detection — detect stale/disconnected SSE sessions. `apps/mcp-server/src/interface/mcp/transport.ts`: structured 404 error response + optional session-TTL eviction. 2 files + 5 tests + Docker rebuild. Ship after 1862c-D/E confirmed stable (5 cycles clean). | MEDIUM | FIX | developer | TASK_1862c-F.md | container-rebuild |
| 1862c-G | FIX-HIGH: Market-watcher smoke-test probe — pre-market verification call before full cycle. `cron-market-watcher.md` Step 0: cheap tool call (e.g. `get_system_status`) + BUG telegram on failure. Convert silent BLOCKED → immediate alert. 1 flow file, no rebuild. | HIGH | FIX | developer | TASK_1862c-G.md | — |
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
| 1862c | FIX-HIGH: Cowork scheduled-task MCP access RCA — market-watcher BLOCKED at 04:38, unified-agent 4x BLOCKED before CLI recovery. **Architect brief complete.** Decomposed into 1862c-D/E/F/G (4 atomic tasks per brief 2026-05-10-1862c-cowork-mcp-rca.md). Root causes: (1) Cloudflare `/mcp` route missing, (2) SSE keepAliveTimeout = heartbeat (30s), (3) dead-session eviction + startup race. Ship order: D+E (no rebuild) → observe 5 cycles → G → F (rebuild). | HIGH | FIX | architect | 2026-05-11 |
| 1869b | SPRINT-S: Wire per-watchlist thresholds into scanMarket dispatch. IWatchlistRepository.getThresholds() added, scanMarket passes per-stock SignalContext to detectSignals(). 10 new tests. 9148 pass / 11 fail. SHA dbefc47c. | HIGH | SPRINT-S | developer | 2026-05-11 |
| 1869a | FIX-HIGH: Raise price_drop threshold -5% → -7% in signalDetector.ts. Precision gate (50% → target 60%). DEFAULT_DROP_PCT=-7. 5 files. 9132 pass / 17 fail pre-existing. SHA d884be66. | HIGH | FIX | developer | 2026-05-11 |
| 1869c | FIX-HIGH: Extend 1865a UTC guard to qa-responder + news-scout. 1865a had session-log guard in news-scout but missing notebook step; qa-responder had no guard. Added Notebook timestamp guard to both. market-watcher unchanged. 9267 pass/15 fail (pre-existing). | HIGH | FIX | developer | 2026-05-11 |
| 1868d | CHORE-LOW: Cherry-pick eb1c469f handoff sweep (73 archived-task handoffs ≥2026-05-03 cutoff) from task/1863b-reconcile-verdict-job to main, then CLEAN branch. Re-audit verified: all 73 in archive, no active signal/brief refs. Cherry-picked f6483b9d → main. Branch deleted. | LOW | CHORE | code-janitor | 2026-05-11 |
| 1868c | CHORE-LOW: B8-gap — migrate all sessions/ writes to notebook commits across 9 dev-team flow files (architect, ba, code-janitor, developer, fixer, market-analyst, pm, system-auditor, tran-ngoc-bau). AC3: 0 append_session/sessions/ refs in flows/skills. QA APPROVED 2026-05-11. | LOW | CHORE | developer | 2026-05-11 |
| 1862i | CHORE-LOW: project-stats.json stale infra status — mcpServerHealth UP, connectionStatus OK, removed estimatedRecoveryTime/recoveryLink/affectedServices, toolCount 128→132, totalTasksDone 515→555, lastFixApplied→1863h. QA APPROVED 2026-05-11. | LOW | CHORE | ops | 2026-05-11 |
| 1863h | CHORE-M: Migrate stale NULL-outcome agent_signals pruner into dataAuditJob (D-NEW check). 30-day TTL, try/catch non-fatal, console.log row count, task refs 1863h+1863b. 2 new tests + 16 pre-existing pass. QA APPROVED 2026-05-10. | MEDIUM | CHORE | developer | 2026-05-10 |
| 1863a | FEATURE-M: Create `infrastructure/fileStore/alertVerdictStore.ts` — read/write/prune abstraction for `docs/data/alert-verdicts.json`. Atomic temp-file + rename pattern. Interface-injectable for tests. ~2h. | MEDIUM | FEATURE | dev-mcp-server | 2026-05-10 |
| 1863b | FEATURE-M: Create `scheduler/alerts/verdictResolutionJob.ts` core — hourly cron job, pending→confirmed/false_positive logic, direction-match rule, price fetch, fail-loud on error. ~2h. RECONCILE: swapped DB/agent_signals impl for file-store impl; 1863f deleted; 1863b test created 14/14 green. QA APPROVED 2026-05-10. | MEDIUM | FEATURE | dev-mcp-server | 2026-05-10 |
| 1863c | FEATURE-M: Register cron + scheduler wiring — cronConfig.ts entry `0 * * * *`, startScheduler.ts registration, jobRunRepo.wrapRun pattern. ~1h. RECONCILE: cron at minute=7 (not 0) per architect collision-avoidance; Bun.env.CRON_VERDICT_RESOLUTION; 8/8 ACs verified. QA APPROVED 2026-05-10. | MEDIUM | FEATURE | dev-mcp-server | 2026-05-10 |
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
