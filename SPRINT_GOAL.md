# Sprint Goal

## Current Sprint — 058 (COMPLETE)

started: 2026-04-12 | completed: 2026-04-12 | theme: BCTC Split-Block OCR Fix (VNM income + balance sheet quality)

### Goal
Fix BCTC extraction for consolidated PDFs where labels and numbers are in separate blocks (100+ lines apart). VNM Q4-2025 was producing net_revenue=1, total_assets=0.

### Scope

| Task | Description | Status |
|------|-------------|--------|
| 1119 | Split-block fallback + magnitude inference for incomeStatementExtractor | Done — 8/8 tests |
| 1120 | Split-block fallback for balanceSheetExtractor (VNM totalAssets=0) | Done — 11/11 tests |

### Results
- VNM net revenue: 1 → 63,645,887 million VND (63.6 trillion VND) ✓
- VNM COGS: 10 → 37,436,413 million VND ✓
- VEA income magnitude inference: raw VND now ÷1M ✓
- VNM totalAssets: 0 → 53,312,371 million VND (53.3 trillion VND) ✓
- VNM equity: 0 → 34,483,015 million VND ✓
- VNM inventory: 0 → 6,839,280 million VND ✓
- Split-block parser: page-boundary detection + item code extraction + positional zip
- Magnitude inference: raw VND ÷1M applied when totalAssets > 1B
- 19 new tests (1119 + 1120) + all 18 existing BS tests pass
- Commits: bcedf52 (income), pending (balance sheet)

---

## Previous Sprint — 057 (COMPLETE)

started: 2026-04-12 | completed: 2026-04-12 | theme: Prediction Engine — Phase A (Evidence Accumulation Store)

### Goal
Ship the evidence accumulation foundation that all later prediction engine phases depend on: persistent evidence fragments per stock, a nightly accumulator computing weighted evidence scores, and a new MCP tool for agents to write fragments.

### Scope

| Task | Description | Status |
|------|-------------|--------|
| 1116 | evidence_fragments DDL + evidenceFragmentStore CRUD | Done — 18/18 tests |
| 1117 | record_evidence_fragment MCP tool (+1 tool) | Done — 6/6 tests |
| 1118 | evidenceAccumulatorJob + evidence_scores table | Done — 7/7 tests |

OUT: foreign_flow_snapshots (task deferred — Architect must confirm VPS feasibility first)
OUT: Phase B (base rates), Phase C (prediction claims), Phase D (calibration) — depend on shipped Phase A data

### Results
- `evidence_fragments` table + TTL expiry: shipped
- `evidence_scores` table + nightly accumulator: shipped
- `record_evidence_fragment` MCP tool: shipped (+1 tool → 85 total)
- 31/31 tests pass, bun tsc --noEmit clean
- Fix 1115 also shipped this loop: news_mention alert dedup after restart

---

## Previous Sprint — 056 (COMPLETE)

started: 2026-04-11 | completed: 2026-04-11 | theme: BCTC Fallback Hardening (P1 deadline fix)

Task shipped: 1111 (disableSscPolling config flag + UPCOM fetcher + listSscDocumentsWithFlag). 9/9 tests pass. bun tsc --noEmit clean. Closes task 1085 (P1 — bank BCTC deadline 2026-04-14). TECH_056.md approved.

---

## Previous Sprint — 055 (COMPLETE)

started: 2026-04-10 | completed: 2026-04-11 | theme: Observability + Signal Quality + Alert Attribution

All 11 tasks shipped: 1100 (cron_job_runs DDL) + 1101 (recordJobRun wrapper) + 1102 (get_cron_health tool) + 1103 (cronHealthAlertJob) + 1104 (smoke test) + 1105 (causal_root_id) + 1106 (signal_class weighting) + 1107 (recency_weight) + 1108 (agent_work_log store) + 1109 (agent_work_log tools) + 1110 (sent_by column). 156/156 tests pass. Net +3 tools → ~83 total.

---

## Previous Sprint — 054 (COMPLETE)

started: 2026-04-08 | completed: 2026-04-10 | theme: Position-Aware Analysis + /ask Queue + Alert Narrowing + Kinh Dich Default Layer

### Goal

Four investor experience gaps closed (deferred since Sprint 036):

1. **Position Ledger (E1+E2)**: `/set_position`, `/check_position` via Telegram with auto stop-loss floor + TP ladder. `get_user_positions_for_analysis` for analysis agents.
2. **/ask Queue (E3+E4+tools)**: `/ask` queues questions in `ask_queue` table. Every 12 min `askQueueCheckJob` posts signal to `agent_signals` for `07-qa-responder`. FIFO processing via `answer_ask_question`.
3. **Alert Narrowing (E5)**: `checkPositionDanger` (3-AND) + `checkWatchlistOpportunity` (4-AND) gate MARKET alerts. Direct Telegram sends for medium-move/heartbeat/volume-spike removed from `marketScanJob`. DB insert paths preserved (zero data loss).
4. **Kinh Dich Default Layer (E6)**: `appendKinhDich` wraps `analyze_stock`, `get_market_snapshot`, `get_portfolio_conviction`. Graceful fallback + exception swallowing.

### Scope

| Task | Description | In/Out |
|------|-------------|--------|
| 1070 | positionStore — buyPosition + sellPosition + applyPositionCommand | IN |
| 1071 | telegramCommands — /set_position + /check_position handlers | IN |
| 1072 | schema.ts DDL + askQueueStore CRUD helpers | IN |
| 1073 | telegramCommands — /ask handler | IN |
| 1074 | askQueueCheckJob scheduler + cron registration (*/12 * * * *) | IN |
| 1075 | alertPolicyChecker.ts + stopLossComputer.ts + mcp.config.json alertPolicy | IN |
| 1076 | marketScanJob noise retirement (remove direct MARKET sends, keep DB inserts) | IN |
| 1077 | kinhDichWrapper.ts + wire appendKinhDich into analysis/market/portfolio tools | IN |
| 1078 | askQueueTools — get_pending_ask_questions + answer_ask_question (+2 tools) | IN |
| 1079 | positionTools — get_user_positions_for_analysis (+1 tool) | IN |
| 1081 | Sprint 054 integration smoke test (all-mocked end-to-end) | IN |
| E7 | Cowork position-aware agent prompts (05-alert-commander.md, 04-market-watcher.md) | OUT → cowork-refactory-expert Phase 6 |
| E8 | 07-qa-responder agent creation/rewrite | OUT → cowork-refactory-expert Phase 6 |

Exclusions: hot reload/start.sh | `user_requests` table reuse (ask_queue is NEW) | E7/E8 cowork agent rewrites

### Success Criteria

| # | Check |
|---|-------|
| 1 | `bun test src/__tests__/107*.test.ts src/__tests__/1081-sprint054-smoke.test.ts` → all pass |
| 2 | `bun tsc --noEmit` → 0 errors after every merge |
| 3 | Tool count increments by exactly +3 (1078: +2, 1079: +1) |
| 4 | `launchctl list | grep com.vn-market.mcp` → PID non-zero after restart |
| 5 | `curl -s http://127.0.0.1:3000/health` → `{"status":"ok","toolCount":N}` where N = prev + 3 |
| 6 | `marketScanJob.ts` contains 0 direct `sendTelegramMarket` calls for noise alert types |
| 7 | `kinhDichWrapper.ts` contains 0 imports from `infrastructure/` |
| 8 | `/ask FPT có nên mua?` via Telegram → DB row inserted, reply confirms queue ID |
| 9 | Smoke test (1081) passes: 7-step cycle, 0 MARKET sends |

### Dependency Map

```
Batch A (no deps):     1070  1072  1075  1077
Batch B (after A dep): 1071←1070  1073←1072  1074←1072  1076←1075  1078←1072  1079←1070
Batch C (all A+B done): 1081←1070–1079
```

WIP limit: max 2 In Progress. First 2 slots: 1070 + 1072.

---

## Previous Sprint — 053 (COMPLETE)

started: 2026-04-07 | completed: 2026-04-07 | theme: Code Janitor + Test Isolation + Signal Quality

| Task | Description | Status |
|------|-------------|--------|
| 1006 | MAX_PEER_SYNCS_PER_CYCLE 5→30 (automotive peers now synced) | Done |
| 1021 | Delete legacy src/db/schema.ts | Done |
| 1022 | agent_feedback DDL canonical in initDatabase() | Done |
| report-1032 | pollNews false alarm investigation (off-hours throttle, not a bug) | Done |
| 106 | Test isolation: NO_NET_MARKET_DEPS fixture (25/25 pass) | Done |
| 1007/1020 | Kinh Dich convergence — tickerJitter prevents identical hexagrams | Done |

---

## Previous Sprint — 036 (COMPLETE)

theme: Less Surface, Clearer Signal — MCP Audit + Communication Hardening

### Goal

64 tools → 53 tools. Gaps G2, G3, G5 closed. System health 4 calls → 1. Telegram send 3 tools → 1. Alert mute 2 tools → 1.

### Scope

**Tier 1 — Zero-Risk Removals (Task 230, -8 tools: 64→56)**

| Tool Removed | Reason |
|-------------|--------|
| get_feedback (#32) | Deprecated, zero agent usage |
| get_global_log (#27) | Developer-only, no agent references |
| get_tool_log (#28) | get_error_summary covers the signal |
| run_daily_briefing (#12) | Cron calls directly, no agent trigger needed |
| search_stocks (#41) | Zero agent references, get_watchlist covers all codes |
| fetch_ssc_reports (#5) | FORBIDDEN in all agent prompts — Puppeteer blocks server |
| trigger_alert_check (#34) | Intelligence cycle runs every 15 min, redundant from agents |
| export_portfolio_snapshot (#46) | Weekly file dump — dev/user action, not analysis |

Removals confined to `src/interface/mcp/server.ts` (unregister) + `src/interface/mcp/tools/index.ts` (unexport). Underlying functions untouched.

**Tier 2 — Communication Fixes + Merges**

| Task | Fix | Net Tools |
|------|-----|-----------|
| 231 — Fix G5 | Report ownership lock: `claimed_by`+`claimed_at` columns on telegram_reports. New `claim_telegram_report(id, claimedBy)` tool — atomic UPDATE WHERE claimed_by IS NULL. | 56→57 |
| 232 — Fix G3 | `/report` + `/fix` Telegram commands → write to agent_feedback with agent='user-telegram', forward to Report Channel. `/fix` sets priority='high'. No new MCP tools. | 57 |
| 233 — Fix G2 | `system_changelog` table + `log_fix` (Dev Team writes after fix) + `get_recent_fixes(limit?)` (Analysis Team reads before filing report). Schema: id, fix_type, title, detail, files, commit_hash, fixed_at, related_feedback_id. | 57→59 |
| 234 — Merge M1 | 4 system health tools → `get_system_status` (returns [DB][SOURCES][FRESHNESS][ERRORS]). Removes get_source_health, get_data_freshness, get_error_summary. | 59→56 |
| 235 — Merge M2 | 3 Telegram send tools → `send_telegram(channel:"chat"|"report", message)`. Removes send_test_telegram, send_telegram_report, delete_telegram_report. | 56→53 |
| 236 — Merge M3 | 2 mute tools → `manage_alert_mute(code, action:"mute"|"unmute", hours?, reason?)`. | 53 |
| 237 | CLAUDE.md sync + update all agent .md files for 53 tools | — |

OUT: Fix G1 (/ask + /why, deferred Sprint 037) | Fix G4 (agent signal bus, deferred Sprint 038+) | Merge M4 (get_alerts absorb) | Compound tools C1/C2 | Agent-scoped tool visibility

### Task Board (Sprint 036)

| # | Title | Tier | Priority | Status | Depends on |
|---|-------|------|----------|--------|------------|
| 230 | Remove 8 dead/forbidden/internal tools from MCP | 1 | P0 | Backlog | — |
| 231 | Fix G5: claim_telegram_report + ownership columns | 2a | P0 | Backlog | — |
| 232 | Fix G3: /report + /fix Telegram commands | 2b | P1 | Backlog | — |
| 233 | Fix G2: system_changelog + log_fix + get_recent_fixes | 2c | P1 | Backlog | — |
| 234 | Merge M1: system health 4→1 (get_system_status) | 2d | P1 | Backlog | 230 |
| 235 | Merge M2: Telegram send 3→1 (send_telegram) | 2e | P1 | Backlog | 230 |
| 236 | Merge M3: alert mute 2→1 (manage_alert_mute) | 2f | P2 | Backlog | 230 |
| 237 | CLAUDE.md sync + update all agent .md files for 53 tools | — | P2 | Backlog | 230–236 |

Dependency chain: 230 gates 234/235/236. 231, 232, 233 parallel + independent. 237 waits for all in Review.

### Key Technical Decisions (Locked)

| # | Decision |
|---|----------|
| T1 | Removals are server.ts-only. Underlying functions untouched — preserves internal callers (cron, use cases). |
| T2 | claim_telegram_report uses single atomic `UPDATE ... WHERE claimed_by IS NULL` + changes() check. SQLite serialized writes — no lock table needed. |
| T3 | send_telegram channel param maps "chat"→TELEGRAM_CHAT_ID / "report"→TELEGRAM_REPORT_ID. Thin wrapper over existing internal functions. delete_telegram_report removed from MCP (only valid inside process_telegram_report workflow). |
| T4 | get_system_status is rename + union of 4 existing functions. No logic changes. Old tool names removed from server.ts, functions remain. |
| T5 | manage_alert_mute delegates to existing alertMuteStore.ts. Routing change, not logic change. |
| T6 | system_changelog is append-only. log_fix inserts only. get_recent_fixes returns N rows by fixed_at DESC. No FK on related_feedback_id. |
| T7 | get_recent_fixes must be explicit in each agent's protocol: "Before submit_feedback for system issue, call get_recent_fixes(10). If title matches, skip feedback." |
| T8 | Tool count target 53 is hard. Any deviation requires justification in task report. |

### Success Metrics (Sprint 036)

1. `bun tsc --noEmit` → 0 errors after every merge
2. `bun test` full suite → 1934+ tests pass, 0 failures
3. Tool count: 64→53 (230: -8 | 231: +1 | 233: +2 | 234: -3 | 235: -3 | 236: -1)
4. G5 closed: second claim_telegram_report call returns "Report {id} already claimed by dev-team"
5. G3 closed: /report from Telegram → agent_feedback row + Report Channel message visible via read_telegram_reports
6. G2 closed: log_fix entry visible to Analysis agents via get_recent_fixes
7. M1: get_system_status returns [DB][SOURCES][FRESHNESS][ERRORS]; old 4 tools not registered
8. M2: send_telegram routes correctly; send_test_telegram/send_telegram_report/delete_telegram_report not registered
9. M3: manage_alert_mute mutes/unmutes; old 2 tools not registered
10. All agent .md files reference 53 tools; unified-agent.md + dev-team-cron.md include claim step; 6 analysis agents include pre-report get_recent_fixes check

---

## Previous Sprint — 035b (COMPLETE)

started: 2026-04-02 | completed: 2026-04-02 | theme: Two-Team Autonomy — Report Channel Persistence

Full autonomous loop operational: Analysis Team submit_feedback → telegram_reports SQLite + Report Channel → Dev Team read_telegram_reports → process_telegram_report → row marked, message deleted.

| # | Title | Status |
|---|-------|--------|
| 226 | telegram_reports SQLite table + store + wire sendTelegramReport | Done |
| 227 | Webhook for Report Channel | Done |
| 228 | read_telegram_reports MCP tool | Done |
| 229 | process_telegram_report MCP tool | Done |

Success metrics met: correct schema, status="new" on insert, webhook stores from_agent="human", read returns rows, process marks + deletes, 1934+ tests pass, 0 errors, toolCount=64.

---

## Previous Sprint — 035a (COMPLETE)

started: 2026-04-02 | completed: 2026-04-02 | theme: Two-Team Autonomy — Docs + Config

Delivered: dev-team-cron.md, updated unified-agent.md, all agent .md files refreshed for 62 tools + correct channel rules, AI_TEAM_DESIGN.md updated, feedbackTools.ts fixed (no cross-post to user channel).

---

## Completed Sprints

| Sprint | Theme | Completed | Tasks |
|--------|-------|-----------|-------|
| 000 | Foundation | 2026-03-24 | 000 |
| 001 | BCTC Pipeline Wave 1 | 2026-03-25 | 001, 002, 003, 011, 012, 041, 042, 014 |
| 002 | BCTC Pipeline Wave 2 | 2026-03-26 | 043, 044, 013, 045, 046, 047, 029, 030, 048, 085 |
| 003 | News + Alerts | 2026-03-27 | 021, 082, 063, 064, 086 |
| 004 | MCP Wiring + Analysis | 2026-03-27 | 087, 022, 023, 061, 062, 083 |
| 005 | Market Data + Scheduler | 2026-03-28 | 088, 026, 102, 104, 103, 101 |
| 006 | Analytical Depth | 2026-03-28 | 065, 066, 027, 084, 105, 123 |
| 007 | Doc + Tests | 2026-03-28 | DOC-001, 081, 122, 124, 125 |
| 008 | Macro Intelligence | 2026-03-29 | FIX-081, 025, 028, 126, 089 |
| 009 | SSC Automation + Telegram | 2026-03-29 | 031, 034, 106 |
| 010 | Security + Alert Quality | 2026-04-01 | SQL-fix, 131, 132 |
| 011 | Adaptive Signals + Sentiment | 2026-04-01 | 133, 134, 135, 137 |
| 012 | Periodic Summaries | 2026-04-01 | 130 |
| 013 | Fetcher Reliability + Sector Context | 2026-04-01 | 035, 024, 035-TE, sectorPeers, macroThresholds, priceNewsValidator, commodityTracker |
| 014 | Trade Relationships | 2026-04-01 | tradeRelationships, tradeStore |
| 015 | Circuit Breaker | 2026-04-01 | 136 |
| 016 | Conviction Scorer + Portfolio Tools | 2026-04-01 | convictionScorer, portfolioTools, feedbackTools |
| 017 | Production Hardening | 2026-04-01 | 152, 153, 154, 155, 156 |
| 018 | Data Integrity First | 2026-04-01 | 157, 158, 159 |
| 019 | Stock Aliases + Market Broadcast | 2026-04-01 | 160, 161, 162 |
| 020 | Prediction Market Intelligence | 2026-04-01 | 163, 164, 165, 166 (stub), 167, 168, 169 |
| 021 | Close the Loop — Prediction Signals Live | 2026-04-01 | 170, 171, 172, 173 |
| 022 | House in Order | 2026-04-01 | 174, 175, 176, 177 |
| 023 | Close the Investor Loop | 2026-04-01 | 178, 179, 180, 181 |
| 024 | Reliability Hardening and Investor UX Polish | 2026-04-01 | 182, 183, 184, 185 |
| 025 | Daily Investor Intelligence | 2026-04-01 | 186, 187, 188 |
| 026 | Signal Quality and Portfolio Correlation | 2026-04-02 | 189, 190, 191 |
| 027 | Stability First | 2026-04-02 | 194, 195, hotfixes 198-205 |
| 028 | Structural Integrity and Investor Safety Net | 2026-04-02 | 192, 193, 206, 207 |
| 029 | Always-On Investor | 2026-04-02 | 208, 209, 210 |
| 030 | Quality Before Quantity | 2026-04-02 | 211, 212, 213 |
| 031 | Telegram Command Interface | 2026-04-02 | 214, 215, 216 |
| 032 | See More, Decide Faster | 2026-04-02 | 217, 218, 219 |
| 033 | Investor UX Hardening | 2026-04-02 | 220, 222, 223 |
| 034 | Depth Over Breadth | 2026-04-02 | 224, 225 |
| 035a | Two-Team Autonomy — Docs + Config | 2026-04-02 | dev-team-cron.md, unified-agent.md, agent files, feedbackTools fix |
| 035b | Two-Team Autonomy — Report Channel Persistence | 2026-04-02 | 226, 227, 228, 229 |
