# TASKS — VN Market Intelligence MCP
# Kanban Board | Agile/Kanban | DDD + TDD | Bun + TypeScript

> **Historical/Done tasks live in `docs/TASKS_ARCHIVE.md` — read ONLY when you need past context.**
> Read this file for active work only. Open `docs/TASKS_ARCHIVE.md` only when investigating a past sprint or closed task.

> **WIP Limit**: max 2 tasks In Progress simultaneously
> **Workflow**: Backlog → Todo → In Progress → Review → Done
> **Branch**: `task/NNN-kebab-name`
> **Report**: `reports/TASK_REPORT_NNN.md` generated after every Review

---

## Sprint 054 — Position-Aware Analysis, /ask Queue, Alert Narrowing, Kinh Dich Default Layer

> Sprint 054 Theme: Position-Aware Analysis + /ask Queue + Narrowed Alert Policy + Kinh Dich Default Layer
> WIP limit: max 2 In Progress simultaneously
> All restarts via `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp` ONLY — no hot reload, no start.sh
> Parallel Batch A (no deps): 1070, 1072, 1075, 1077 | Batch B (after A): 1071, 1073, 1074, 1076, 1078, 1079 | Batch C: 1081

### Kanban

| ID | Title | Branch | Layer | Depends On | Size | Test File | Status |
|----|-------|--------|-------|------------|------|-----------|--------|
| 1070 | Position ledger: buyPosition + sellPosition + applyPositionCommand | `task/1070-position-ledger` | domain/infra | — | M | `src/__tests__/1070-position-ledger.test.ts` | Done |
| 1071 | Telegram /set_position + /check_position handlers | `task/1071-telegram-position-commands` | interface | 1070 | M | `src/__tests__/1071-telegram-position-commands.test.ts` | Done |
| 1072 | ask_queue DDL + askQueueStore CRUD helpers | `task/1072-ask-queue-store` | infrastructure | — | M | `src/__tests__/1072-ask-queue-store.test.ts` | Done |
| 1073 | Telegram /ask handler | `task/1073-telegram-ask-command` | interface | 1072 | S | `src/__tests__/1073-telegram-ask-command.test.ts` | Done |
| 1074 | askQueueCheckJob scheduler + cron registration | `task/1074-ask-queue-check-job` | scheduler | 1072 | S | `src/__tests__/1074-ask-queue-check-job.test.ts` | Done |
| 1075 | alertPolicyChecker + stopLossComputer + mcp.config.json alertPolicy | `task/1075-alert-policy-checker` | domain | — | M | `src/__tests__/1075-alert-policy.test.ts` | Done |
| 1076 | marketScanJob noise retirement (remove direct MARKET sends) | `task/1076-retire-noise-alerts` | scheduler | 1075 | S | `src/__tests__/1076-market-scan-noise-retirement.test.ts` | Done |
| 1077 | kinhDichWrapper + wire appendKinhDich into analysis/market/portfolio tools | `task/1077-kinh-dich-wrapper` | domain/interface | — | M | `src/__tests__/1077-kinh-dich-wrapper.test.ts` | Done |
| 1078 | askQueueTools: get_pending_ask_questions + answer_ask_question MCP tools | `task/1078-ask-queue-tools` | interface | 1072 | S | `src/__tests__/1078-ask-queue-mcp-tools.test.ts` | Done |
| 1079 | positionTools: get_user_positions_for_analysis MCP tool | `task/1079-position-for-analysis-tool` | interface | 1070 | S | `src/__tests__/1079-position-for-analysis-tool.test.ts` | Done |
| 1081 | Sprint 054 smoke test: /set_position → /check_position → /ask → signal → answer | `task/1081-sprint054-smoke-test` | test | 1070, 1071, 1072, 1073, 1074, 1075, 1076, 1077, 1078, 1079 | S | `src/__tests__/1081-sprint054-smoke.test.ts` | Done |

---

### Task Detail Sheets

---

**Task 1070 — Position Ledger: buyPosition + sellPosition + applyPositionCommand**

Branch: `task/1070-position-ledger`
Layer: domain/infrastructure (`src/infrastructure/db/positionStore.ts`)
Priority: P0
Depends on: none
Size: M (1 file modified, ~80 lines production code)

Files to read first:
- `src/infrastructure/db/positionStore.ts` (current upsertPosition, closePosition, listOpenPositions)
- `docs/TECH_054.md` sections E1 + AC-E1

Files to create/modify:
- MODIFY: `src/infrastructure/db/positionStore.ts`
- CREATE: `src/__tests__/1070-position-ledger.test.ts`

Acceptance Criteria:

**Given** VCB 1000 shares @ 75000 already in positions table
**When** `buyPosition(db, "VCB", 80000, 500)` is called
**Then**
- `avg_price = Math.round((75000*1000 + 80000*500) / 1500)` = 76667
- `shares = 1500`
- `PositionCommandResult.ok = true`
- Message contains "Mua thêm 500" and avg cost in Vietnamese format

**Given** FPT 200 shares in positions table
**When** `sellPosition(db, "FPT", 90000, 500)` (qty exceeds shares)
**Then**
- Clamped to 200, `shares = 0`, `closePosition` called
- Message contains "Chỉ bán được 200 CP"

**Given** HPG 3000 shares in positions table
**When** `applyPositionCommand(db, { ticker: "HPG", price: 0, qty: 0 })`
**Then**
- `closed_at IS NOT NULL` in DB
- Message = "Đã xóa toàn bộ vị thế HPG"

**Given** no position for VHM
**When** `buyPosition(db, "VHM", 45000, 1000)`
**Then**
- New row: shares=1000, avg_price=45000

Additional:
- `bun test src/__tests__/1070-position-ledger.test.ts` → all pass
- `bun tsc --noEmit` → 0 errors

---

**Task 1071 — Telegram /set_position + /check_position Handlers**

Branch: `task/1071-telegram-position-commands`
Layer: interface (`src/infrastructure/notifiers/telegramCommands.ts`)
Priority: P0 (first slot after 1070 completes)
Depends on: 1070
Size: M (1 file modified, ~60 lines + HELP_TEXT)

Files to read first:
- `src/infrastructure/db/positionStore.ts` (after 1070 merge: applyPositionCommand, listOpenPositions)
- `src/infrastructure/notifiers/telegramCommands.ts` (current switch at line 282, HELP_TEXT lines 54–61)
- `docs/TECH_054.md` section E2 + AC-E2

Files to create/modify:
- MODIFY: `src/infrastructure/notifiers/telegramCommands.ts`
- CREATE: `src/__tests__/1071-telegram-position-commands.test.ts`

Acceptance Criteria:

**Given** Telegram message `text: "/set_position FPT 80300 5100"`
**When** `handleTelegramCommand(db, msg)` is called
**Then**
- Reply contains "Mua thêm 5100" and computed avg cost in Vietnamese format

**Given** `text: "/set_position VCB 0 0"`
**When** handler processes
**Then**
- Reply contains "Đã xóa toàn bộ vị thế VCB"

**Given** `text: "/set_position"` (no args)
**When** handler processes
**Then**
- Reply contains usage hint with example (e.g. "/set_position VCB 75000 1000")

**Given** VCB position: 1000 shares @ 75000, market price 80000 in `market_prices`
**Given** `text: "/check_position"`
**When** handler processes
**Then**
- Reply contains "VCB"
- Reply contains "75.000" (avg price formatted)
- Reply contains "+6,7%" (gain %)
- Reply contains stop-loss floor 69750 (= round(75000 * 0.93))
- Reply contains TP1 82500 (= round(75000 * 1.10))

Additional:
- `bun tsc --noEmit` → 0 errors
- HELP_TEXT updated to list /set_position and /check_position

---

**Task 1072 — ask_queue DDL + askQueueStore CRUD Helpers**

Branch: `task/1072-ask-queue-store`
Layer: infrastructure
Priority: P0
Depends on: none
Size: M (1 schema DDL addition, 1 new store file, ~90 lines)

Files to read first:
- `src/infrastructure/db/schema.ts` (find initDatabase(), understand DDL pattern)
- `docs/TECH_054.md` sections E3 + AC-E3-1, AC-E3-2
- `docs/TECH_054.md` section 5 (ask_queue schema definition)

Files to create/modify:
- MODIFY: `src/infrastructure/db/schema.ts` (add ask_queue DDL inside initDatabase())
- CREATE: `src/infrastructure/db/askQueueStore.ts`
- CREATE: `src/__tests__/1072-ask-queue-store.test.ts`

Acceptance Criteria:

**Given** `initDatabase()` runs on a fresh DB
**When** checking `sqlite_master`
**Then**
- `ask_queue` table exists with columns: id, question_text, received_at, status, processing_since, answered_at, answer_text, ticker_context

**Given** three `/ask` calls inserted at t+0s, t+1s, t+2s
**When** `getPendingAskQuestions(db)` is called
**Then**
- Returns all three in `received_at ASC` order

**Given** a pending row with id=5
**When** `markAskProcessing(db, 5)` then `answerAskQuestion(db, 5, "Phân tích...", "answered")`
**Then**
- Row has `status='answered'` and `answered_at IS NOT NULL`

**Given** a row with `status='processing'` and `processing_since` 25 minutes ago
**When** `recoverStaleAskProcessing(db)` is called
**Then**
- Row reverts to `status='pending'`

**Given** `markAskProcessing(db, id)` called twice concurrently on same row
**When** second call runs (status already 'processing')
**Then**
- Second call returns `changes == 0` (row-level optimistic lock)

Additional:
- `bun tsc --noEmit` → 0 errors

---

**Task 1073 — Telegram /ask Handler**

Branch: `task/1073-telegram-ask-command`
Layer: interface
Priority: — (unblocks after 1072)
Depends on: 1072
Size: S (1 file modified, ~25 lines)

Files to read first:
- `src/infrastructure/db/askQueueStore.ts` (after 1072 merge: insertAskQuestion)
- `src/infrastructure/notifiers/telegramCommands.ts` (switch statement, HELP_TEXT)
- `docs/TECH_054.md` section E3 + AC-E3-3, AC-E3-4

Files to create/modify:
- MODIFY: `src/infrastructure/notifiers/telegramCommands.ts`
- CREATE: `src/__tests__/1073-telegram-ask-command.test.ts`

Acceptance Criteria:

**Given** `text: "/ask FPT có nên mua không?"`
**When** `handleTelegramCommand(db, msg)` is called
**Then**
- DB row inserted in `ask_queue` with `status='pending'`
- Reply matches regex `Câu hỏi đã ghi nhận \(#[0-9]+\)`

**Given** `text: "/ask"` (empty body)
**When** handler processes
**Then**
- Reply contains usage hint (e.g. "/ask VCB có nên giữ không?")
- No row inserted in `ask_queue`

Additional:
- `bun tsc --noEmit` → 0 errors
- HELP_TEXT updated to list /ask

---

**Task 1074 — askQueueCheckJob Scheduler + Cron Registration**

Branch: `task/1074-ask-queue-check-job`
Layer: scheduler
Priority: — (unblocks after 1072)
Depends on: 1072
Size: S (1 new scheduler file, 1 jobs.ts modification)

Files to read first:
- `src/infrastructure/db/askQueueStore.ts` (after 1072: getPendingAskQuestions)
- `src/scheduler/jobs.ts` (CRONS map pattern, how other jobs register)
- `docs/TECH_054.md` section E4 + AC-E4

Files to create/modify:
- CREATE: `src/scheduler/askQueueCheckJob.ts`
- MODIFY: `src/scheduler/jobs.ts`
- CREATE: `src/__tests__/1074-ask-queue-check-job.test.ts`

Acceptance Criteria:

**Given** `src/scheduler/jobs.ts` after merge
**When** inspecting CRONS map
**Then**
- Key `"askQueueCheck"` exists with default `"*/12 * * * *"`

**Given** 2 pending rows in `ask_queue` (status='pending')
**When** `runAskQueueCheck(db)` is called
**Then**
- Exactly 1 new row in `agent_signals` with `to_agent='07-qa-responder'`, `signal_type='pending_questions'`
- Payload JSON contains `count: 2`

**Given** 0 pending rows in `ask_queue`
**When** `runAskQueueCheck(db)` is called
**Then**
- No new row inserted in `agent_signals`

Additional:
- `bun tsc --noEmit` → 0 errors

---

**Task 1075 — alertPolicyChecker + stopLossComputer + mcp.config.json alertPolicy**

Branch: `task/1075-alert-policy-checker`
Layer: domain
Priority: — (unblocks Batch B: 1076)
Depends on: none
Size: M (2 new domain files + 1 config change)

Files to read first:
- `docs/TECH_054.md` section E5 + AC-E5 (all 6 criteria)
- `mcp.config.json` (current structure — find where to add `alertPolicy`)
- `docs/TECH_054.md` section 7 (alertPolicy schema)

Files to create/modify:
- CREATE: `src/domain/services/alertPolicyChecker.ts`
- CREATE: `src/domain/services/stopLossComputer.ts`
- MODIFY: `mcp.config.json` (add `alertPolicy` top-level section)
- CREATE: `src/__tests__/1075-alert-policy-checker.test.ts`

Acceptance Criteria:

**Given** `{ stopLossHit: true, singleDayDropPct: 3.0, newsSentiment: -0.8 }`
**When** `checkPositionDanger(input)` is called
**Then** returns `false` (drop < 5.0 threshold)

**Given** `{ stopLossHit: true, singleDayDropPct: 6.0, newsSentiment: -0.7 }`
**When** `checkPositionDanger(input)` is called
**Then** returns `true` (all 3 conditions met)

**Given** `{ kinhDichConfidence: 80, kinhDichSignal: "BUY", newsSentiment: 0.2, agentSignalsMajority: "BUY" }`
**When** `checkWatchlistOpportunity(input)` is called
**Then** returns `false` (sentiment 0.2 < threshold 0.3)

**Given** all four inputs exactly at threshold
**When** `checkWatchlistOpportunity(input)` is called
**Then** returns `true`

**Given** `computeStopLoss(75000, 1500, 72000)` (avgPrice=75000, atr14Derived=1500, recentLow=72000)
**When** called
**Then** returns `max(72000, 72000, 69750)` = 72000

**Given** `computeStopLoss(75000, -500, 72000)` (atr14 <= 0)
**When** called
**Then** treats atr14 as unavailable, uses floor from avgPrice*0.93 only

**Given** `mcp.config.json` after merge
**When** checking for `alertPolicy` key
**Then** section exists with at minimum: `positionDanger.minDayDropPct`, `positionDanger.minNewsSentiment`, `watchlistOpportunity.minKinhDichConfidence`, `watchlistOpportunity.minNewsSentiment`

Additional:
- Domain files contain zero imports from `infrastructure/`
- `bun tsc --noEmit` → 0 errors

---

**Task 1076 — marketScanJob Noise Retirement**

Branch: `task/1076-market-scan-noise-retirement`
Layer: scheduler
Priority: — (unblocks after 1075)
Depends on: 1075
Size: S (1 file modified — remove 3 sendTelegramMarket call sites)

Files to read first:
- `src/scheduler/marketScanJob.ts` (find all sendTelegramMarket calls for medium-move, heartbeat, volume-spike alert types)
- `docs/TECH_054.md` section E5 alert narrowing design + AC-E5-6

Files to create/modify:
- MODIFY: `src/scheduler/marketScanJob.ts`
- CREATE: `src/__tests__/1076-market-scan-noise-retirement.test.ts`

Acceptance Criteria:

**Given** `scanMarket()` runs with a 3% price drop detected
**When** execution completes
**Then**
- An `alerts` row is inserted (DB insert path preserved)
- NO call to `sendTelegramMarket` / `sendTelegramWork` / `sendTelegramBug` occurs for that alert
- i.e., direct Telegram send from marketScanJob for medium-move, heartbeat, and volume-spike types is removed

**Given** `src/scheduler/marketScanJob.ts` after merge
**When** grepping for `sendTelegramMarket` / `sendTelegramWork`
**Then**
- 0 occurrences for noise alert types (medium-move, heartbeat, volume-spike)
- DB insert path (`insertAlert` or equivalent) still present

Additional:
- `bun tsc --noEmit` → 0 errors
- No data loss: `alerts` table rows still written

---

**Task 1077 — kinhDichWrapper + Wire appendKinhDich**

Branch: `task/1077-kinh-dich-wrapper`
Layer: domain/interface
Priority: — (can start immediately, no deps)
Depends on: none
Size: M (1 new domain file + 3 interface files modified)

Files to read first:
- `src/domain/services/kinhDich/kinhDichReading.ts` (computeReading, formatReading signatures)
- `src/interface/mcp/tools/analysis.ts` (analyze_stock handler)
- `src/interface/mcp/tools/marketTools.ts` (get_market_snapshot handler)
- `src/interface/mcp/tools/portfolioTools.ts` (get_portfolio_conviction handler)
- `docs/TECH_054.md` section E6 + AC-E6 + Risk note on kinhDichWrapper infra import

Files to create/modify:
- CREATE: `src/domain/services/kinhDichWrapper.ts`
- MODIFY: `src/interface/mcp/tools/analysis.ts`
- MODIFY: `src/interface/mcp/tools/marketTools.ts`
- MODIFY: `src/interface/mcp/tools/portfolioTools.ts`
- CREATE: `src/__tests__/1077-kinh-dich-wrapper.test.ts`

Acceptance Criteria:

**Given** `analyze_stock({code: "VCB"})` called with `kinhdich_readings` data in DB
**When** handler returns
**Then**
- Returned text contains "Kinh Dịch:" and "Biến quẻ:"

**Given** `appendKinhDich("XYZ", "base output", db)` with no hexagram data for XYZ
**When** called
**Then**
- Returns `"base output\n---\nKinh Dịch: Chưa đủ dữ liệu để tính quẻ."`

**Given** `computeReading` throws an exception inside `appendKinhDich`
**When** called
**Then**
- No exception propagated to caller
- Fallback text returned (exception swallowed)

**Given** `src/domain/services/kinhDichWrapper.ts` after merge
**When** `grep -n "infrastructure" src/domain/services/kinhDichWrapper.ts`
**Then**
- 0 matches (wrapper must not import from infrastructure/)

Additional:
- `bun tsc --noEmit` → 0 errors

---

**Task 1078 — askQueueTools: get_pending_ask_questions + answer_ask_question**

Branch: `task/1078-ask-queue-tools`
Layer: interface
Priority: — (unblocks after 1072)
Depends on: 1072
Size: S (1 new tools file + registration)

Files to read first:
- `src/infrastructure/db/askQueueStore.ts` (after 1072: getPendingAskQuestions, answerAskQuestion)
- Any existing tools file for registration pattern (e.g. `src/interface/mcp/tools/positionTools.ts`)
- `docs/TECH_054.md` section "TOOLS" + smoke test step 5–6

Files to create/modify:
- CREATE: `src/interface/mcp/tools/askQueueTools.ts`
- MODIFY: `src/interface/mcp/server.ts` (register tool) OR appropriate registry file
- CREATE: `src/__tests__/1078-ask-queue-tools.test.ts`

Acceptance Criteria:

**Given** 3 pending rows in `ask_queue`
**When** `get_pending_ask_questions()` tool called (no args)
**Then**
- Returns all 3 rows in `received_at ASC` order
- Each row shows id, question_text, ticker_context, received_at

**Given** pending row id=7
**When** `answer_ask_question(7, "Phân tích cho thấy...", "answered")` tool called
**Then**
- Row `ask_queue` has `status='answered'`, `answer_text` set, `answered_at IS NOT NULL`

**Given** `src/interface/mcp/server.ts` (or registry) after merge
**When** checking tool registrations
**Then**
- `toolCount` increments by 2 vs. pre-1078 baseline (verified via `/health` endpoint)

Additional:
- `bun tsc --noEmit` → 0 errors

---

**Task 1079 — positionTools: get_user_positions_for_analysis**

Branch: `task/1079-position-for-analysis-tool`
Layer: interface
Priority: — (unblocks after 1070)
Depends on: 1070
Size: S (1 file modified — add 1 tool to existing positionTools.ts)

Files to read first:
- `src/interface/mcp/tools/positionTools.ts` (existing tools — set_position, get_positions, close_position)
- `src/infrastructure/db/positionStore.ts` (after 1070: listOpenPositions)
- `docs/TECH_054.md` section TOOLS + AC for get_user_positions_for_analysis + smoke test step 5

Files to create/modify:
- MODIFY: `src/interface/mcp/tools/positionTools.ts`
- CREATE: `src/__tests__/1079-position-for-analysis-tool.test.ts`

Acceptance Criteria:

**Given** 3 open positions in `positions` table
**When** `get_user_positions_for_analysis()` tool called (no args)
**Then**
- Returns all 3 positions with computed fields: `stopLossFloor = Math.round(avgPrice * 0.93)`, `tp1 = Math.round(avgPrice * 1.10)`, `tp2 = Math.round(avgPrice * 1.20)`, `tp3 = Math.round(avgPrice * 1.30)`

**Given** positions for VCB and FPT in table
**When** `get_user_positions_for_analysis({ticker: "VCB"})` called
**Then**
- Returns only VCB row (filter works correctly)

**Given** VCB with `avg_price=75000`
**When** tool called
**Then**
- `stopLossFloor = Math.round(75000 * 0.93)` = 69750

**Given** `src/interface/mcp/server.ts` after merge
**When** checking tool registrations
**Then**
- `toolCount` increments by 1 vs. pre-1079 baseline

Additional:
- `bun tsc --noEmit` → 0 errors

---

**Task 1081 — Sprint 054 Smoke Test (Integration)**

Branch: `task/1081-sprint054-smoke-test`
Layer: test
Priority: P1 (run only after all 1070–1079 merged to main)
Depends on: 1070, 1071, 1072, 1073, 1074, 1075, 1076, 1077, 1078, 1079
Size: S (1 new test file, all mocked)

Files to read first:
- All new files from tasks 1070–1079 (production code)
- `docs/TECH_054.md` section "Smoke test" (lines 906–916)

Files to create/modify:
- CREATE: `src/__tests__/1081-sprint054-smoke.test.ts`

Acceptance Criteria:

**Given** fresh in-memory SQLite DB with all Sprint 054 tables initialized
**When** running the full smoke test sequence (all Telegram/DB mocked):
1. `applyPositionCommand(db, {ticker: "VCB", price: 75000, qty: 1000})` → position created
2. `handleCheckPosition(db)` → reply contains "VCB", stop-loss 69750
3. `insertAskQuestion(db, "VCB có nên tiếp tục giữ không?")` → returns id=1
4. `runAskQueueCheck(db)` → 1 signal posted to `agent_signals` for `07-qa-responder`
5. `get_pending_ask_questions()` tool → returns the question row
6. `answer_ask_question(1, "Phân tích...", "answered")` tool → status set to "answered"
7. `getPendingAskQuestions(db)` → returns empty list
**Then**
- All 7 steps succeed with 0 failures
- No Telegram sends to MARKET channel occur (smoke uses mock transport)
- `bun tsc --noEmit` → 0 errors

---

## Backlog — Active (genuinely unblocked or pending decision)

### [1050 / @dev P3] Remove initMentionVelocityTable() inline DDL from mentionVelocityStore.ts

code-janitor auto-detected: `src/infrastructure/db/mentionVelocityStore.ts` exports `initMentionVelocityTable()` with a live CREATE TABLE IF NOT EXISTS mention_velocity; this same DDL is now canonical in schema.ts:271 via initDatabase(). Remove the inline CREATE TABLE block from mentionVelocityStore.ts.

Status: Backlog

---

### [1083 / @dev P3] [janitor] Remove inline DDL from hexagramStore.ts — tables canonical in initDatabase()

code-janitor auto-detected: `src/infrastructure/db/hexagramStore.ts:initHexagramTables()` still declares live CREATE TABLE IF NOT EXISTS for kinhdich_readings and hexagram_transitions. The canonical DDL is now in schema.ts:779-813 via initDatabase(). Call sites in kinhDichTools.ts (5 handlers) and intelligenceCycleJob.ts still invoke initHexagramTables() unnecessarily. Fix: make initHexagramTables() a true no-op (remove DDL body), remove call sites. Test 1047 covers the schema path.

Status: Backlog

---

### [1082 / @dev P3] [janitor] Remove inline DDL from cascadeHitStore.ts — cascade_rule_hits canonical in initDatabase()

code-janitor auto-detected: `src/infrastructure/db/cascadeHitStore.ts:ensureCascadeHitsTable()` still declares live CREATE TABLE IF NOT EXISTS cascade_rule_hits. Canonical DDL is schema.ts:872 via initDatabase(). Production call site remains in runImpactChain.ts:202. Fix: make ensureCascadeHitsTable() a no-op, remove the call from runImpactChain.ts. Test 1043 covers the schema path.

Status: Backlog

---

### [1048 / @dev P3] Consolidate scheduler cron defaults — config.ts duplicates CRONS fallbacks from jobs.ts

code-janitor auto-detected: `src/infrastructure/config.ts:scheduler` section defines 7 cron default strings (sscCheck, morningBriefing, marketOpen, marketClose, intelligenceCycle, eveningSummary, predictionMarketPoll) that duplicate the fallback defaults already in CRONS (jobs.ts). Any cron default change requires two edits. config.ts should import and derive from CRONS rather than redeclaring literals.

**BLOCKED**: config.ts↔jobs.ts circular-dep risk — needs architect design review before implementation.

Status: Backlog (Blocked)

---

### [296 / @dev P1] e2e smoke test: OCR pipeline — reparseSingleWithOcrFallback

**Branch**: `task/296-ocr-e2e-smoke-test`
**Layer**: test
**Depends on**: 292 (schema DDL + DPI + confidence guard), 293 (OCR fallback wiring) — both merged
**Priority**: P1
**TDD test**: `src/__tests__/296-ocr-pipeline-e2e.test.ts`

**Rescoped (2026-04-09):** Original scope tested `extractAndStorePdfPages` directly. Extend to also cover `reparseSingleWithOcrFallback` introduced in fix 1068. Add one test case that calls `reparseSingleWithOcrFallback(filename, db)` with a known-scanned VNM PDF and asserts the BCTC financial_reports row is populated with non-null totalAssets.

#### Files to read first

- `src/__tests__/291-bctc-smoke-vnm.test.ts` (structural reference)
- `src/infrastructure/fetchers/pdfOcrWorker.ts` (exports: `isOcrAvailable`, `extractAndStorePdfPages`, `getCachedPdfText`)
- `src/infrastructure/db/schema.ts` (verify `initDatabase` exported and `closeDb` exists)
- `src/domain/services/` (find `extractBalanceSheet` and `extractIncomeStatement` exports)

#### Files to create

- CREATE: `src/__tests__/296-ocr-pipeline-e2e.test.ts`

#### Test structure

```typescript
// src/__tests__/296-ocr-pipeline-e2e.test.ts
process.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { closeDb, initDatabase } from "../infrastructure/db/schema.js";
import { isOcrAvailable, extractAndStorePdfPages, getCachedPdfText } from "../infrastructure/fetchers/pdfOcrWorker.js";
import { extractBalanceSheet } from "../domain/services/balanceSheetExtractor.js";
import { extractIncomeStatement } from "../domain/services/incomeStatementExtractor.js";
import { readdirSync } from "node:fs";
import { join } from "node:path";

describe("296 OCR pipeline e2e smoke test", () => {
  it("extracts VNM PDF via OCR and asserts financial ranges", async () => {
    if (!isOcrAvailable()) { console.log("skip: OCR not available"); return; }
    closeDb(); initDatabase();
    const pdfDir = join(process.cwd(), "data", "pdfs");
    let pdfFile: string | undefined;
    try { pdfFile = readdirSync(pdfDir).find(f => /vnm/i.test(f) && f.endsWith(".pdf")); } catch {}
    if (!pdfFile) { console.log("skip: no VNM PDF found in data/pdfs/"); return; }
    const pdfPath = join(pdfDir, pdfFile);
    const result = await extractAndStorePdfPages(pdfPath, pdfFile);
    expect(result.totalChars).toBeGreaterThanOrEqual(5000);
    const cached = getCachedPdfText(pdfFile);
    expect(cached).not.toBeNull();
    expect(cached!.confidence).toBeGreaterThanOrEqual(0.5);
    const bs = extractBalanceSheet(cached!.text);
    expect(bs.totalAssets).toBeGreaterThanOrEqual(50_000_000);
    expect(bs.totalAssets).toBeLessThanOrEqual(100_000_000);
    const is_ = extractIncomeStatement(cached!.text);
    expect(is_.netRevenue).toBeGreaterThan(0);
  }, 300_000);

  it("reparseSingleWithOcrFallback populates financial_reports for scanned PDF", async () => {
    if (!isOcrAvailable()) { console.log("skip: OCR not available"); return; }
    // Additional test case added for fix 1068 coverage
    // Call reparseSingleWithOcrFallback(filename, db) and assert financial_reports row populated
  }, 300_000);
});
```

#### Acceptance Criteria

**Given** `data/pdfs/` contains a VNM BCTC PDF and `tesseract` + `pdftoppm` are installed
**When** `bun test src/__tests__/296-ocr-pipeline-e2e.test.ts` is run
**Then**
- `extractAndStorePdfPages` returns `totalChars >= 5000`
- `getCachedPdfText(filename)` returns `confidence >= 0.5`
- `extractBalanceSheet(text).totalAssets` is in range [50,000,000 – 100,000,000] trieu VND
- `extractIncomeStatement(text).netRevenue > 0`
- `reparseSingleWithOcrFallback` test case populates financial_reports row with non-null totalAssets
- Test passes with 0 failures

**Given** `isOcrAvailable()` returns false
**When** the test runs
**Then** — Test is skipped cleanly with 0 failures.

**Given** `data/pdfs/` has no VNM PDF
**When** the test runs
**Then** — Test is skipped cleanly with 0 failures.

Status: Deferred (pending OCR tooling available on dev machine)

---

### [1001 / @architect P1] BCTC ingest regression: VNM PDF on disk 9 days, get_bctc_full returns "Chua co du lieu"

Tasks 309/310 marked Done but pipeline not populating financial_reports table. Verify fetchParseAndStoreBctc actually called for stranded PDFs; check filename matcher (`BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf`). Reports 996/997/998.

Status: Backlog

---

### [1002 / @architect P1] Anonymous SSC PDF attribution: filenames like `000000015802468_Bao_cao_tai_chinh_Rieng_nam_2025.pdf` carry no stock code

Add download-time normalisation that records stock_code from SSC portal metadata, OR extract from PDF first page on ingest. Report 997.

Status: Backlog

---

### [1004 / @architect P2] Cascade gap: VN-market policy/macro news scoring at base 10.0

Missing cascade rules for govt-stabilization signals. Add cascade rules + raise base score for systemic-stress + policy-intervention combos. Report 1001.

Status: Backlog

---

### [1021 / @dev] 20 pre-existing per-file test flakes (Sprint 054)

Surfaced by the new `scripts/test-all.sh` per-file runner. Each file passes when run in tight scope but fails in per-file isolation. Full list in `docs/TEST_OOM_INVESTIGATION.md#follow-up-pre-existing-flakes`. Triage plan:

1. Group by common culprit (DB_PATH leaks, global singletons, timer-dependent tests, OCR-binary-dependent tests).
2. Fix the shared infrastructure issues first (test DB factory, env reset helper).
3. Per-file fixes for the rest.
4. Goal: `bun run test:all` exits green end-to-end.

Status: Backlog

---

### [1085 / @architect P1] SSC portal JS-shell: BCTC ingestion stalled 11 days (report #1071)

SSC portal now returns a short JS-only shell on fetch (`[ssc] portal_js_only — short response (JS shell?)`), so `fetchParseAndStoreBctc` falls through to HOSE/HNX. Impact: 26 watchlist tickers QUA HAN Q4-2025 (deadline 2026-03-30), 4 banks (BID/EIB/SHB/VCB) SAP DEN 2026-04-14. `list_stored_pdfs` shows only VEA+VNM PDFs dated 2026-03-29 — no new ingests in 11 days.

Needs architecture decision:
1. Headless browser (puppeteer/playwright) for SSC portal JS render — heaviest, most reliable.
2. Strengthen HOSE/HNX fallback to be primary for Q4-2025 season — lower confidence, risks UPCOM coverage.
3. Manual PDF seeding from a mirror + disable SSC polling until portal stabilises.

Current live errors (2026-04-09 22:24Z) confirm the shell issue is recurring. Circuit breaker still OK because the fallback path returns gracefully.

Status: Backlog (P1 — blocking BCTC ingestion)

---

### [1086 / @dev P1] financial_reports table empty despite fix 1068 claiming VNM/VEA rows (report #1071)

Fix 1068 (commit 6d46ffb) reported "VNM Q4-2025 financial_reports row created (conf 0.3125), VEA Q4-2025 row created (conf 0.8125)". Live `sqlite3 data/market.db 'SELECT COUNT(*) FROM financial_reports'` returns 0 on 2026-04-09. Possible causes: rows inserted against a test/override DB path, later migration wiped the table, or `reparseSingleWithOcrFallback` never persists in production. Investigate: (a) grep for INSERT INTO financial_reports, (b) check if bctcReparseJob.ts uses an injected DB distinct from getDb(), (c) check recent migrations for DROP/TRUNCATE. Rerun reparse with production DB_PATH and verify count increments. This bug is what made the freshness fix (1071) visible in the first place.

Status: Backlog (P1)

---

### [1087 / @dev P2] Macro snapshot Brent crude duplicate/conflicting values (report #1070)

digest-writer reported two different Brent values in the same macro snapshot (96.44 vs 116 USD). Root cause located via `get_system_status` 2026-04-09: two independent writers populate Brent with different scales —
- `Commodity Prices` panel (macroSnapshotAssembler live fetch): Brent ≈ 96.51 USD/bbl ✅ current
- `Auto-tracked Indicators` table: `brent_crude_usd` row stuck at 116 with 42 data points (stale writer)

Fix: reconcile the auto-tracked indicator writer so it mirrors the live commodity fetcher (or retire whichever is wrong). Candidate files: grep for `brent_crude_usd` in `src/infrastructure/db/` + `src/scheduler/` to find the writer inserting 116. Add a unit sanity guard (Brent plausible band 20-200 USD) once the correct source is confirmed.

Status: Backlog (reproducible, lead identified)

---

### [914 / @po] Steel sector watchlist gap — HPG

**Decision needed from PO**:
1. Add HPG to default watchlist → steel coverage becomes automatic, impact_chain catches steel news.
2. Document steel as intentionally out-of-scope → no change, future steel reports get "no watchlist stocks affected".
3. Make watchlist sector-balanced via `defaultSectors = ["banking", "consumer", "tech", "industrial", "steel"]` and auto-pick one ticker per sector.

Minimum-diff for option 1: add `"HPG"` to `mcp.config.json → market.defaultWatchlist`, restart server.

Status: Backlog (awaiting PO decision)

---

### [915 SHIPPED] Analyst-credibility discount on sanctioned brokers — Done 2026-04-08

Delivered: new `broker_sanctions` table + `forecastConfidenceScore()` domain service + `get_broker_credibility` MCP tool (registry entry 49). Severity multipliers: warning=0.5, suspension=0.2. 22 new tests in `src/__tests__/915-broker-credibility.test.ts`. Cascade engine wire-in intentionally deferred — downstream consumers call the domain function directly once they need it.

---

### [1019 / @dev HIGH] Stranded BCTC PDF auto-reparse pipeline — Done (all 3 slices)

**Why**: `dataAuditJob` D-7c already DETECTS stranded PDFs and writes them to `agent_feedback`. The recovery path (all 3 slices) was shipped in Sprint 053 (`c528efa`): per-file structured findings + `bctcReparseJob.ts` (daily 09:30) + `reparse_attempts` column with escalation at 3 / alert at 5. 13/13 new tests.

---

## 🚧 IN PROGRESS

| # | Title | Branch | Notes |
|---|-------|--------|-------|
| (empty) | — | — | — |

---

## 🔍 REVIEW

(empty)

---

## DDD Layer Summary

| Layer | Tasks | Description |
|-------|-------|-------------|
| **Domain** | 041-048, 061-066, 014 | Pure business logic, no I/O |
| **Infrastructure** | 002, 003, 011-013, 021-030 | SQLite, LanceDB, HTTP, scrapers |
| **Application** | 047, 048, 065, 066 | Use case orchestration |
| **Interface** | 081-105 | MCP tools, Bun server, scheduler |
| **Test** | 121-125 | Cross-cutting |

---

## Definition of Done (DoD)

A task is **Done** when ALL of the following are true:

- [ ] Code is on `task/NNN` branch
- [ ] `bun test src/__tests__/NNN-*.test.ts` → all pass
- [ ] `bun tsc --noEmit` → 0 errors
- [ ] QA checklist: 100% ✅
- [ ] Zero BLOCKING issues in Task Report
- [ ] Merged to `main` via `--no-ff`
- [ ] `reports/TASK_REPORT_NNN.md` generated
- [ ] Kanban card moved to Done
- [ ] TASKS.md updated (move row to Done table)
