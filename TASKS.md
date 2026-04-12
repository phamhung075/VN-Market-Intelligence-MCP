# TASKS — VN Market Intelligence MCP

> Done/historical tasks: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 060 — Prediction Engine Phase D — Calibration Report + Telegram Digest (IN PROGRESS)

Spec: `docs/REQ_060.md` | Design: `docs/TECH_060.md` (APPROVED_BY_ARCHITECT)
Batch A (no deps): 1127 | Batch B (after 1127): 1128, 1129 | Batch C (after 1129 deployed): 1130

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| REQ-060 | BA: write REQ_060.md for calibration report + digest | BA | — | — | — | Done |
| TECH-060 | Architect: review REQ_060, produce TECH_060.md | Architect | — | — | — | Done |
| PM-060 | PM: sprint planning — break TECH_060 into tasks, assign batches | PM | — | — | — | Done |
| 1127 | `calibration_snapshots` DDL + `calibrationSnapshotStore.ts` CRUD | Developer | infrastructure | — | `feat/sprint-060-task-1127` | Review |
| 1128 | `calibrationReportJob.ts` weekly computation + Telegram digest + `jobs.ts` registration | Developer | scheduler | 1127 | `task/1128-calibration-report-job` | Review |
| 1129 | `get_calibration_report` MCP tool + `registry.ts` registration (+1 tool → 89) | Developer | interface | 1127 | `feat/sprint-060-task-1129` | Review |
| 1130 | `08-prediction-synthesizer.md` self-assessment Step 0 | Cowork Refactory Expert | interface/Cowork | 1129 | — | Backlog |

---

### Task 1127 — `calibration_snapshots` DDL + `calibrationSnapshotStore.ts` CRUD

**Branch**: `task/1127-calibration-snapshot-store`
**Layer**: infrastructure
**Depends on**: none (Batch A)
**Test file**: `src/__tests__/1127-calibration-snapshot-store.test.ts`

#### Files to read first

- `src/infrastructure/db/schema.ts` — append DDL after `prediction_claims` block
- `src/infrastructure/db/predictionClaimStore.ts` — pattern reference for parameterized bindings

#### Files to create / modify

- MODIFY: `src/infrastructure/db/schema.ts` — append `calibration_snapshots` DDL + index to `initDatabase()`
- CREATE: `src/infrastructure/db/calibrationSnapshotStore.ts` — four exported functions
- CREATE: `src/__tests__/1127-calibration-snapshot-store.test.ts`

#### DDL to append (after `prediction_claims` block in `initDatabase()`)

```sql
CREATE TABLE IF NOT EXISTS calibration_snapshots (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date          TEXT NOT NULL,
  total_resolved         INTEGER NOT NULL,
  avg_brier_score        REAL,
  avg_brier_by_agent     TEXT NOT NULL,
  avg_brier_by_stock     TEXT NOT NULL,
  avg_brier_by_direction TEXT NOT NULL,
  calibration_curve      TEXT NOT NULL,
  trend_delta            REAL,
  top_predictions        TEXT NOT NULL,
  worst_predictions      TEXT NOT NULL,
  computed_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cs_snapshot_date ON calibration_snapshots(snapshot_date DESC);
```

#### Exported interface (`calibrationSnapshotStore.ts`)

- `insertCalibrationSnapshot(db, input): number` — serialises all object/array fields to JSON, 12 `?` positional bindings, returns new row id
- `getLatestCalibrationSnapshot(db): CalibrationSnapshotRow | null` — `ORDER BY id DESC LIMIT 1`, parses JSON columns on read
- `getCalibrationSnapshotByDate(db, date): CalibrationSnapshotRow | null` — filter by `snapshot_date`, `ORDER BY id DESC LIMIT 1`
- `getPreviousCalibrationSnapshot(db, beforeDate): CalibrationSnapshotRow | null` — latest row with `snapshot_date < beforeDate`

Layer invariant: no domain imports. Pure CRUD only. All JSON serialisation/deserialisation happens inside the store.

#### Acceptance Criteria

**Given** an in-memory SQLite database initialised with the Sprint 060 schema
**When** `insertCalibrationSnapshot` is called with a valid `CalibrationSnapshotInput`
**Then**
- Returns a non-zero integer id
- Round-trip read via `getLatestCalibrationSnapshot` returns identical objects/arrays for all JSON columns
- `getLatestCalibrationSnapshot` returns null on empty table
- `getLatestCalibrationSnapshot` returns the row with the highest id when two rows exist for the same `snapshot_date`
- `getCalibrationSnapshotByDate` returns null for an unknown date
- `getCalibrationSnapshotByDate` returns the latest row (highest id) when two rows share the same date
- `getPreviousCalibrationSnapshot` returns null when no row predates `beforeDate`
- `getPreviousCalibrationSnapshot` returns the correct row when a prior row exists
- `bun test src/__tests__/1127-calibration-snapshot-store.test.ts` passes with 0 failures
- `bun tsc --noEmit` shows 0 errors

---

### Task 1128 — `calibrationReportJob.ts` weekly computation + Telegram digest + `jobs.ts` registration

**Branch**: `task/1128-calibration-report-job`
**Layer**: scheduler
**Depends on**: 1127 (store write + read functions must be merged)
**Test file**: `src/__tests__/1128-calibration-report-job.test.ts`

#### Files to read first

- `src/infrastructure/db/calibrationSnapshotStore.ts` (Task 1127 output)
- `src/scheduler/eveningSummaryJob.ts` — Telegram dynamic import pattern
- `src/scheduler/dataAuditJob.ts` — `recordJobRun` wrapper pattern
- `src/scheduler/jobs.ts` — `CRONS` constant, existing cron registrations

#### Files to create / modify

- CREATE: `src/scheduler/calibrationReportJob.ts`
- MODIFY: `src/scheduler/jobs.ts` — add `CRONS.calibrationReport`, import, cron callback
- CREATE: `src/__tests__/1128-calibration-report-job.test.ts`
- MODIFY: `docs/data/cron-registry.json` — add `calibrationReportJob` entry
- MODIFY: `docs/data/project-stats.json` — `schedulerFileCount` 26 → 27

#### Key implementation contracts

`runCalibrationReport(db?)` — 11-step computation:
1. Query resolved `prediction_claims` within 90-day window
2. Compute `avg_brier_score` (excluding NULL `brier_score` rows)
3. Group by `agent_id` → `avg_brier_by_agent`
4. Group by `stock` (min 3 resolved scorable claims) → `avg_brier_by_stock`
5. Group by `direction` → `avg_brier_by_direction`
6. Bucket by confidence into 10 bands (`bucketIndex = Math.min(9, Math.floor(confidence * 10))`) → `calibration_curve` (empty buckets omitted)
7. Fetch previous snapshot → `trend_delta = thisAvg - prevAvg` (null if no prior snapshot or either avg is null)
8. Select top 5 (lowest `brier_score`) and worst 5 (highest `brier_score`)
9. Call `insertCalibrationSnapshot(db, { ... })`
10. Call private `sendCalibrationDigest(snapshot, db)`
11. Return `CalibrationJobResult`

`sendCalibrationDigest(snapshot, db)` — private function:
- WORK channel: always send (even when `total_resolved = 0`)
- MARKET channel: send only when `total_resolved >= 1`; skip if 0
- Both sends wrapped in try-catch (Telegram failures non-fatal, logged as warn)
- Dynamic import of `sendTelegramWork` and `sendTelegramMarket` matching `eveningSummaryJob.ts` pattern

`runCalibrationReportJob()` — cron-callable wrapper with `recordJobRun`

`jobs.ts` addition:
```typescript
calibrationReport: Bun.env.CRON_CALIBRATION_REPORT ?? '0 13 * * 0',
```
Cron runs Sunday 13:00 UTC = 20:00 VN. After addition: `Object.keys(CRONS).length` = 32.

#### Acceptance Criteria

**Given** the `calibrationReportJob` wired to an in-memory database
**When** `runCalibrationReport(db)` is called
**Then**
- With empty `prediction_claims`: snapshot row written with `total_resolved=0`, `avg_brier_score=null`, JSON fields are `{}` or `[]` (AC-1)
- With 4 resolved claims: correct `total_resolved`, `avg_brier_score`, direction averages, stock min-3 filter applied (AC-2)
- With 10 claims across multiple confidence buckets: `calibration_curve` has correct `actual_hit_rate`, empty buckets omitted (AC-3)
- With a previous snapshot present: `trend_delta` computed as `thisAvg - prevAvg` (AC-4)
- `sendCalibrationDigest` with `total_resolved=0`: WORK send called, MARKET send NOT called (AC-8)
- `sendCalibrationDigest` with `total_resolved=5`: both channels called (AC-9)
- `runCalibrationReportJob()` calls `recordJobRun` (observability wrapper present)
- `jobs.ts` has `CRONS.calibrationReport = '0 13 * * 0'` (overridable via `Bun.env.CRON_CALIBRATION_REPORT`)
- `bun test src/__tests__/1128-calibration-report-job.test.ts` passes with 0 failures
- `bun tsc --noEmit` shows 0 errors

---

### Task 1129 — `get_calibration_report` MCP tool + `registry.ts` registration (+1 tool → 89)

**Branch**: `task/1129-calibration-tools`
**Layer**: interface
**Depends on**: 1127 (store read functions must be merged)
**Test file**: `src/__tests__/1129-calibration-tools.test.ts`

#### Files to read first

- `src/infrastructure/db/calibrationSnapshotStore.ts` (Task 1127 output)
- `src/interface/mcp/tools/registry.ts` — existing tool registration pattern
- `src/interface/mcp/tools/index.ts` — barrel export pattern
- `docs/data/tool-registry.json` — current tool list

#### Files to create / modify

- CREATE: `src/interface/mcp/tools/calibrationTools.ts`
- MODIFY: `src/interface/mcp/tools/registry.ts` — add import + `registerCalibrationTools` entry after `registerEvidenceTools`
- MODIFY: `src/interface/mcp/tools/index.ts` — add re-export
- MODIFY: `docs/data/tool-registry.json` — add `get_calibration_report` entry
- MODIFY: `docs/data/project-stats.json` — `toolCount` 88 → 89
- CREATE: `src/__tests__/1129-calibration-tools.test.ts`

#### Tool contract

```typescript
export function registerCalibrationTools(server: McpServer): void
// Registers: "get_calibration_report"
// Input: { date?: string }  — optional ISO date YYYY-MM-DD
// Logic:
//   1. date provided → getCalibrationSnapshotByDate(db, date)
//   2. date omitted  → getLatestCalibrationSnapshot(db)
//   3. null result   → return no-data message string (AC-5), never throw
//   4. total_resolved=0 → return "no resolved predictions yet" message with snapshot date
//   5. otherwise     → return full formatted text block per REQ-060 FR-3 spec
```

DDD invariant: imports from `src/infrastructure/db/calibrationSnapshotStore.ts` and `src/infrastructure/db/index.ts` only. No `src/domain/` imports.

Rendering rules:
- Trend line: shown only when `trend_delta != null`; label: `< -0.01` → "improving", `> 0.01` → "degrading", `[-0.01, 0.01]` → "stable"
- Missing direction keys in `avg_brier_by_direction`: display "n/a"
- Calibration curve note: if any bucket has `|actual_hit_rate - predicted_prob| > 0.15`, append over/under-confidence note
- `top_predictions` / `worst_predictions`: display all stored entries (up to 5 each)

No-data message (AC-5):
```
No calibration data available yet. Prediction claims are being accumulated and will appear after
the first resolution cycle completes (resolution_date + predictionResolutionJob run).
Check back next Sunday.
```

#### Acceptance Criteria

**Given** the `get_calibration_report` tool handler wired to an in-memory database
**When** the tool is called
**Then**
- Empty `calibration_snapshots` table → returns the no-data string, no throw (AC-5)
- Snapshot with `total_resolved=23`, `avg_brier_score=0.142`, `trend_delta=-0.018` → output contains all required sections (overall score, direction breakdown, calibration curve, top/worst predictions) (AC-6)
- `date="2026-04-06"` with two snapshots present → returns the 2026-04-06 snapshot data (AC-7)
- Snapshot with `total_resolved=0` → returns "no resolved predictions" message, not the full formatted report
- `docs/data/tool-registry.json` contains `get_calibration_report` entry
- `docs/data/project-stats.json` has `toolCount` = 89
- `bun test src/__tests__/1129-calibration-tools.test.ts` passes with 0 failures
- `bun tsc --noEmit` shows 0 errors

---

### Task 1130 — `08-prediction-synthesizer.md` self-assessment Step 0

**Branch**: none (direct edit to `.claude/agents/` — Cowork Refactory Expert only)
**Agent**: Cowork Refactory Expert (NOT Developer — Developer never touches `.claude/agents/`)
**Layer**: interface/Cowork
**Depends on**: 1129 merged and `get_calibration_report` live on main

#### File to modify

- `.claude/agents/08-prediction-synthesizer.md` — insert Step 0 before existing Step 1

#### Step 0 block content (exact spec from TECH-060 FR-5)

Insert a new Step 0 before the existing Step 1 with exactly these behaviours:

1. Call `get_calibration_report()` with no arguments (latest snapshot)
2. If response contains "No calibration data available yet": proceed to Step 1 unchanged
3. If response contains "degrading" AND the trend_delta shown in the report exceeds 0.05 (text shows `+0.05x` or higher delta): apply `confidence = confidence * 0.90` to every claim generated in this run, result clamped to `[0.05, 0.95]`
4. Append note to WORK channel message for this run: "Self-correction applied: confidence reduced 10% due to degrading calibration (trend_delta > 0.05)."
5. No confidence adjustment for improving, stable, or no-data cases

#### Acceptance Criteria

**Given** the updated `08-prediction-synthesizer.md`
**When** the file is read
**Then**
- Step 0 block exists before Step 1
- Step 0 calls `get_calibration_report()` (no args)
- "No calibration data" branch present — proceeds to Step 1 unchanged
- "degrading" + `trend_delta > 0.05` branch present — `confidence * 0.90` clamped to `[0.05, 0.95]`
- WORK channel self-correction note text present verbatim
- No confidence adjustment described for improving/stable/no-data cases
- File passes a content review confirming no other steps were modified (AC-10)

---

## Sprint 059 — Prediction Engine Phase B+C — COMPLETE (2026-04-12)

Design: `docs/TECH_059.md` | Spec: `docs/REQ_059.md`

| ID | Title | Status |
|----|-------|--------|
| TECH-059 | Architect: review REQ_059, produce TECH_059.md | Done |
| 1121 | evidence_likelihood_ratios DDL + likelihoodRatioStore CRUD | Done |
| 1123 | prediction_claims DDL + predictionClaimStore CRUD | Done |
| 1122 | baseRateComputer domain service + baseRateComputationJob (Sun 02:00 VN) | Done |
| 1124 | get_evidence_summary + create_prediction_claim MCP tools (+2 tools) | Done |
| 1125 | predictionResolutionJob — nightly Brier score resolver (23:30 VN) | Done |
| 1126 | 08-prediction-synthesizer.md Cowork agent + agent-roster.md update | Done |

---

## Sprint 055 — Observability + Signal Quality + Alert Attribution

### Kanban

| ID | Title | Branch | Layer | Tests | Status |
|----|-------|--------|-------|-------|--------|
| 1100 | cron_job_runs DDL + cronJobRunStore CRUD | `task/1100-cron-job-run-store` | infrastructure | 24 pass | Done |
| 1101 | recordJobRun wrapper + apply to 5 existing jobs | `task/1101-record-job-run-wrapper` | infrastructure/scheduler | 20 pass | Done |
| 1102 | get_cron_health MCP tool (+1 tool) | `task/1102-get-cron-health-tool` | interface | 9 pass | Done |
| 1103 | cronHealthAlertJob — daily WORK alert if success_rate < 80% | `task/1103-cron-health-alert-job` | scheduler | 8 pass | Done |
| 1104 | Sprint 055 cron smoke test | `task/1104-sprint055-cron-smoke` | test | 14 pass | Done |
| 1105 | Signal Fix A: causal_root_id migration + grouping | `task/1105-causal-root-tagging` | infrastructure | 11 pass | Done |
| 1106 | Signal Fix B: signal_class + conviction weighting | `task/1106-signal-class-field` | infrastructure/domain | 20 pass | Done |
| 1107 | Signal Fix C: recency_weight in search_similar_context | `task/1107-rag-recency-weight` | domain/interface | 13 pass | Done |
| 1108 | agent_work_log DDL + store | `task/1108-agent-work-log-store` | infrastructure/db | 17 pass | Done |
| 1109 | log_agent_work + get_agent_work_log MCP tools (+2) | `task/1109-agent-work-log-tools` | interface/mcp | 10 pass | Done |
| 1110 | sent_by column on alerts table + Alert Commander filter | `task/1110-alert-sent-by-column` | infrastructure/db + interface/mcp | 10 pass | Done |

Sprint 055 merged to main 2026-04-11. All 11 tasks verified: 156/156 tests pass, bun tsc --noEmit clean. Net +3 tools (get_cron_health, log_agent_work, get_agent_work_log) → total ~83.

---

## Sprint 054 — Position-Aware Analysis, /ask Queue, Alert Narrowing, Kinh Dich Default Layer

Restart: `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp` ONLY.
Batch A (no deps): 1070, 1072, 1075, 1077 | Batch B (after A): 1071, 1073, 1074, 1076, 1078, 1079 | Batch C: 1081

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
| 1081 | Sprint 054 smoke test: /set_position → /check_position → /ask → signal → answer | `task/1081-sprint054-smoke-test` | test | 1070–1079 | S | `src/__tests__/1081-sprint054-smoke.test.ts` | Done |

---

### Task Detail Sheets

**Task 1070 — Position Ledger: buyPosition + sellPosition + applyPositionCommand**

Branch: `task/1070-position-ledger` | Layer: domain/infrastructure | Priority: P0 | Depends on: none | Size: M (~80 lines)

Files to read: `src/infrastructure/db/positionStore.ts` | `docs/TECH_054.md` §E1+AC-E1
Files to modify: `src/infrastructure/db/positionStore.ts` | `src/__tests__/1070-position-ledger.test.ts` (CREATE)

Acceptance Criteria:

**Given** VCB 1000 shares @ 75000 | **When** `buyPosition(db, "VCB", 80000, 500)` | **Then** avg_price=76667, shares=1500, ok=true, message contains "Mua thêm 500"

**Given** FPT 200 shares | **When** `sellPosition(db, "FPT", 90000, 500)` (qty exceeds shares) | **Then** clamped to 200, shares=0, closePosition called, message contains "Chỉ bán được 200 CP"

**Given** HPG 3000 shares | **When** `applyPositionCommand(db, {ticker:"HPG", price:0, qty:0})` | **Then** closed_at IS NOT NULL, message="Đã xóa toàn bộ vị thế HPG"

**Given** no position for VHM | **When** `buyPosition(db, "VHM", 45000, 1000)` | **Then** new row: shares=1000, avg_price=45000

`bun test src/__tests__/1070-position-ledger.test.ts` → all pass | `bun tsc --noEmit` → 0 errors

---

**Task 1071 — Telegram /set_position + /check_position Handlers**

Branch: `task/1071-telegram-position-commands` | Layer: interface | Priority: P0 | Depends on: 1070 | Size: M (~60 lines + HELP_TEXT)

Files to read: `src/infrastructure/db/positionStore.ts` (post-1070: applyPositionCommand, listOpenPositions) | `src/infrastructure/notifiers/telegramCommands.ts` (switch line 282, HELP_TEXT lines 54–61) | `docs/TECH_054.md` §E2+AC-E2
Files to modify: `src/infrastructure/notifiers/telegramCommands.ts` | `src/__tests__/1071-telegram-position-commands.test.ts` (CREATE)

Acceptance Criteria:

**Given** `/set_position FPT 80300 5100` | **When** `handleTelegramCommand(db, msg)` | **Then** reply contains "Mua thêm 5100" and avg cost

**Given** `/set_position VCB 0 0` | **Then** reply contains "Đã xóa toàn bộ vị thế VCB"

**Given** `/set_position` (no args) | **Then** reply contains usage hint with example "/set_position VCB 75000 1000"

**Given** VCB 1000 shares @ 75000, market price 80000 | **When** `/check_position` | **Then** reply contains "VCB", "75.000", "+6,7%", stop-loss 69750 (=round(75000*0.93)), TP1 82500 (=round(75000*1.10))

`bun tsc --noEmit` → 0 errors | HELP_TEXT updated to list /set_position and /check_position

---

**Task 1072 — ask_queue DDL + askQueueStore CRUD Helpers**

Branch: `task/1072-ask-queue-store` | Layer: infrastructure | Priority: P0 | Depends on: none | Size: M (1 DDL addition, 1 new store, ~90 lines)

Files to read: `src/infrastructure/db/schema.ts` (initDatabase() pattern) | `docs/TECH_054.md` §E3+AC-E3-1/E3-2 + §5 (ask_queue schema)
Files to create/modify: `src/infrastructure/db/schema.ts` (add ask_queue DDL) | `src/infrastructure/db/askQueueStore.ts` (CREATE) | `src/__tests__/1072-ask-queue-store.test.ts` (CREATE)

Acceptance Criteria:

**Given** fresh DB after `initDatabase()` | **Then** ask_queue table exists with columns: id, question_text, received_at, status, processing_since, answered_at, answer_text, ticker_context

**Given** 3 /ask calls at t+0/1/2s | **When** `getPendingAskQuestions(db)` | **Then** returns all 3 in received_at ASC order

**Given** row id=5 pending | **When** `markAskProcessing(db, 5)` then `answerAskQuestion(db, 5, "Phân tích...", "answered")` | **Then** status='answered', answered_at IS NOT NULL

**Given** row status='processing', processing_since 25min ago | **When** `recoverStaleAskProcessing(db)` | **Then** row reverts to status='pending'

**Given** `markAskProcessing(db, id)` called twice concurrently | **Then** second call returns changes==0 (optimistic lock)

`bun tsc --noEmit` → 0 errors

---

**Task 1073 — Telegram /ask Handler**

Branch: `task/1073-telegram-ask-command` | Layer: interface | Depends on: 1072 | Size: S (~25 lines)

Files to read: `src/infrastructure/db/askQueueStore.ts` (post-1072: insertAskQuestion) | `src/infrastructure/notifiers/telegramCommands.ts` | `docs/TECH_054.md` §E3+AC-E3-3/E3-4
Files to modify: `src/infrastructure/notifiers/telegramCommands.ts` | `src/__tests__/1073-telegram-ask-command.test.ts` (CREATE)

Acceptance Criteria:

**Given** `/ask FPT có nên mua không?` | **When** `handleTelegramCommand(db, msg)` | **Then** DB row inserted with status='pending', reply matches `Câu hỏi đã ghi nhận \(#[0-9]+\)`

**Given** `/ask` (empty body) | **Then** reply contains usage hint "/ask VCB có nên giữ không?", no row inserted

`bun tsc --noEmit` → 0 errors | HELP_TEXT updated to list /ask

---

**Task 1074 — askQueueCheckJob Scheduler + Cron Registration**

Branch: `task/1074-ask-queue-check-job` | Layer: scheduler | Depends on: 1072 | Size: S (1 new scheduler, 1 jobs.ts modification)

Files to read: `src/infrastructure/db/askQueueStore.ts` (post-1072: getPendingAskQuestions) | `src/scheduler/jobs.ts` (CRONS map pattern) | `docs/TECH_054.md` §E4+AC-E4
Files to create/modify: `src/scheduler/askQueueCheckJob.ts` (CREATE) | `src/scheduler/jobs.ts` | `src/__tests__/1074-ask-queue-check-job.test.ts` (CREATE)

Acceptance Criteria:

**Given** jobs.ts after merge | **Then** CRONS map key "askQueueCheck" exists with default "*/12 * * * *"

**Given** 2 pending rows (status='pending') | **When** `runAskQueueCheck(db)` | **Then** exactly 1 new agent_signals row with to_agent='07-qa-responder', signal_type='pending_questions', payload.count=2

**Given** 0 pending rows | **When** `runAskQueueCheck(db)` | **Then** no new agent_signals row inserted

`bun tsc --noEmit` → 0 errors

---

**Task 1075 — alertPolicyChecker + stopLossComputer + mcp.config.json alertPolicy**

Branch: `task/1075-alert-policy-checker` | Layer: domain | Depends on: none | Size: M (2 new domain files + 1 config change)

Files to read: `docs/TECH_054.md` §E5+AC-E5 (all 6 criteria) | `mcp.config.json` | `docs/TECH_054.md` §7 (alertPolicy schema)
Files to create/modify: `src/domain/services/alertPolicyChecker.ts` (CREATE) | `src/domain/services/stopLossComputer.ts` (CREATE) | `mcp.config.json` (add alertPolicy) | `src/__tests__/1075-alert-policy-checker.test.ts` (CREATE)

Acceptance Criteria:

**Given** `{stopLossHit:true, singleDayDropPct:3.0, newsSentiment:-0.8}` | **When** `checkPositionDanger(input)` | **Then** false (drop < 5.0 threshold)

**Given** `{stopLossHit:true, singleDayDropPct:6.0, newsSentiment:-0.7}` | **When** `checkPositionDanger(input)` | **Then** true (all 3 conditions met)

**Given** `{kinhDichConfidence:80, kinhDichSignal:"BUY", newsSentiment:0.2, agentSignalsMajority:"BUY"}` | **When** `checkWatchlistOpportunity(input)` | **Then** false (sentiment 0.2 < threshold 0.3)

**Given** all four inputs exactly at threshold | **When** `checkWatchlistOpportunity(input)` | **Then** true

**Given** `computeStopLoss(75000, 1500, 72000)` | **Then** max(72000, 72000, 69750) = 72000

**Given** `computeStopLoss(75000, -500, 72000)` (atr14 <= 0) | **Then** treats atr14 as unavailable, uses avgPrice*0.93 floor only

**Given** mcp.config.json after merge | **Then** alertPolicy section exists with at minimum: positionDanger.minDayDropPct, positionDanger.minNewsSentiment, watchlistOpportunity.minKinhDichConfidence, watchlistOpportunity.minNewsSentiment

Domain files contain zero imports from infrastructure/ | `bun tsc --noEmit` → 0 errors

---

**Task 1076 — marketScanJob Noise Retirement**

Branch: `task/1076-market-scan-noise-retirement` | Layer: scheduler | Depends on: 1075 | Size: S (1 file — remove 3 sendTelegramMarket call sites)

Files to read: `src/scheduler/marketScanJob.ts` (all sendTelegramMarket calls for medium-move/heartbeat/volume-spike) | `docs/TECH_054.md` §E5 alert narrowing + AC-E5-6
Files to modify: `src/scheduler/marketScanJob.ts` | `src/__tests__/1076-market-scan-noise-retirement.test.ts` (CREATE)

Acceptance Criteria:

**Given** `scanMarket()` with 3% price drop | **When** complete | **Then** alerts row inserted (DB preserved), NO sendTelegramMarket/sendTelegramWork call for that alert

**Given** marketScanJob.ts after merge | **When** grep for sendTelegramMarket/sendTelegramWork | **Then** 0 occurrences for noise types (medium-move, heartbeat, volume-spike), insertAlert still present

`bun tsc --noEmit` → 0 errors | No data loss: alerts table rows still written

---

**Task 1077 — kinhDichWrapper + Wire appendKinhDich**

Branch: `task/1077-kinh-dich-wrapper` | Layer: domain/interface | Depends on: none | Size: M (1 new domain file + 3 interface files)

Files to read: `src/domain/services/kinhDich/kinhDichReading.ts` (computeReading, formatReading) | `src/interface/mcp/tools/analysis.ts` | `src/interface/mcp/tools/marketTools.ts` | `src/interface/mcp/tools/portfolioTools.ts` | `docs/TECH_054.md` §E6+AC-E6 + Risk note on infra import
Files to create/modify: `src/domain/services/kinhDichWrapper.ts` (CREATE) | `src/interface/mcp/tools/analysis.ts` | `src/interface/mcp/tools/marketTools.ts` | `src/interface/mcp/tools/portfolioTools.ts` | `src/__tests__/1077-kinh-dich-wrapper.test.ts` (CREATE)

Acceptance Criteria:

**Given** `analyze_stock({code:"VCB"})` with kinhdich_readings in DB | **Then** response contains "Kinh Dịch:" and "Biến quẻ:"

**Given** `appendKinhDich("XYZ", "base output", db)` with no hexagram data | **Then** returns `"base output\n---\nKinh Dịch: Chưa đủ dữ liệu để tính quẻ."`

**Given** `computeReading` throws inside `appendKinhDich` | **Then** no exception propagated, fallback text returned

**Given** kinhDichWrapper.ts after merge | **When** `grep -n "infrastructure" src/domain/services/kinhDichWrapper.ts` | **Then** 0 matches

`bun tsc --noEmit` → 0 errors

---

**Task 1078 — askQueueTools: get_pending_ask_questions + answer_ask_question**

Branch: `task/1078-ask-queue-tools` | Layer: interface | Depends on: 1072 | Size: S (1 new tools file + registration)

Files to read: `src/infrastructure/db/askQueueStore.ts` (post-1072: getPendingAskQuestions, answerAskQuestion) | any existing tools file for registration pattern | `docs/TECH_054.md` §TOOLS + smoke test steps 5–6
Files to create/modify: `src/interface/mcp/tools/askQueueTools.ts` (CREATE) | `src/interface/mcp/server.ts` (register tools) | `src/__tests__/1078-ask-queue-tools.test.ts` (CREATE)

Acceptance Criteria:

**Given** 3 pending rows | **When** `get_pending_ask_questions()` | **Then** returns all 3 in received_at ASC order with id, question_text, ticker_context, received_at

**Given** row id=7 pending | **When** `answer_ask_question(7, "Phân tích cho thấy...", "answered")` | **Then** status='answered', answer_text set, answered_at IS NOT NULL

**Given** server.ts after merge | **Then** toolCount increments by 2 vs pre-1078 baseline (verified via /health)

`bun tsc --noEmit` → 0 errors

---

**Task 1079 — positionTools: get_user_positions_for_analysis**

Branch: `task/1079-position-for-analysis-tool` | Layer: interface | Depends on: 1070 | Size: S (1 tool added to positionTools.ts)

Files to read: `src/interface/mcp/tools/positionTools.ts` (existing: set_position, get_positions, close_position) | `src/infrastructure/db/positionStore.ts` (post-1070: listOpenPositions) | `docs/TECH_054.md` §TOOLS + AC + smoke step 5
Files to modify: `src/interface/mcp/tools/positionTools.ts` | `src/__tests__/1079-position-for-analysis-tool.test.ts` (CREATE)

Acceptance Criteria:

**Given** 3 open positions | **When** `get_user_positions_for_analysis()` | **Then** returns all 3 with stopLossFloor=Math.round(avgPrice*0.93), tp1=Math.round(avgPrice*1.10), tp2=Math.round(avgPrice*1.20), tp3=Math.round(avgPrice*1.30)

**Given** VCB + FPT in table | **When** `get_user_positions_for_analysis({ticker:"VCB"})` | **Then** returns only VCB row

**Given** VCB avg_price=75000 | **Then** stopLossFloor=69750

**Given** server.ts after merge | **Then** toolCount increments by 1 vs pre-1079 baseline

`bun tsc --noEmit` → 0 errors

---

**Task 1081 — Sprint 054 Smoke Test (Integration)**

Branch: `task/1081-sprint054-smoke-test` | Layer: test | Priority: P1 | Depends on: 1070–1079 | Size: S (1 new test file, all mocked)

Files to read: all new files from tasks 1070–1079 | `docs/TECH_054.md` §"Smoke test" (lines 906–916)
Files to create: `src/__tests__/1081-sprint054-smoke.test.ts`

Acceptance Criteria:

**Given** fresh in-memory SQLite with all Sprint 054 tables | **When** running full 7-step smoke (all Telegram/DB mocked):
1. `applyPositionCommand(db, {ticker:"VCB", price:75000, qty:1000})` → position created
2. `handleCheckPosition(db)` → reply contains "VCB", stop-loss 69750
3. `insertAskQuestion(db, "VCB có nên tiếp tục giữ không?")` → id=1
4. `runAskQueueCheck(db)` → 1 signal in agent_signals for 07-qa-responder
5. `get_pending_ask_questions()` → returns the question row
6. `answer_ask_question(1, "Phân tích...", "answered")` → status="answered"
7. `getPendingAskQuestions(db)` → empty list

**Then** all 7 steps succeed, 0 MARKET channel sends, `bun tsc --noEmit` → 0 errors

---

---

**Task 1100 — cron_job_runs DDL + cronJobRunStore CRUD**

Branch: `task/1100-cron-job-run-store` | Layer: infrastructure | Priority: P0 | Sprint: 055 | Depends on: none | Size: M

Files created/modified:
- `src/infrastructure/db/schema.ts` (added `cron_job_runs` DDL + index in `initDatabase()`)
- `src/infrastructure/db/cronJobRunStore.ts` (CREATE — 4 exported functions)
- `src/__tests__/1100-cron-job-run-store.test.ts` (CREATE — 24 tests, 100% coverage)

Acceptance Criteria:

**Given** fresh DB after `initDatabase()` | **Then** `cron_job_runs` table and `idx_cron_job_runs_job_started` index exist

**Given** `insertCronJobRunStart(db, "pollNewsJob")` | **Then** returns positive id, row has status='running', nullable fields NULL

**Given** `updateCronJobRunEnd(db, id, 'success', 42, null, 1234)` | **Then** status='success', rows_written=42, duration_ms=1234, finished_at set

**Given** `updateCronJobRunEnd(db, id, 'error', null, 'Timeout', 30000)` | **Then** status='error', error_msg='Timeout'

**Given** rows older than retentionDays | **When** `purgeOldCronJobRuns(db, 'job', 30)` | **Then** old rows deleted, recent rows kept, count returned

**Given** 3 success + 1 error runs in 7d window | **When** `getCronJobHealthSummary(db, 7)` | **Then** success_rate_7d=0.75, avg_duration_ms correct, sorted by job_name ASC

**Given** `getCronJobHealthSummary(db, 7, 'specificJob')` | **Then** only rows for that job returned

**Given** empty table | **When** `getCronJobHealthSummary(db, 7)` | **Then** returns []

`bun test src/__tests__/1100-cron-job-run-store.test.ts` → 24 pass | `bun tsc --noEmit` → 0 errors

---

**Task 1101 — recordJobRun wrapper + apply to 5 existing jobs**

Branch: `task/1101-record-job-run-wrapper` | Layer: infrastructure/scheduler | Priority: P0 | Sprint: 055 | Depends on: 1100 | Size: S

Files created/modified:
- `src/infrastructure/db/cronJobRunStore.ts` (ADD recordJobRun export)
- `src/scheduler/newsPollerJob.ts` (wrap with recordJobRun)
- `src/scheduler/sscCheckerJob.ts` (wrap with recordJobRun)
- `src/scheduler/marketScanJob.ts` (wrap with recordJobRun)
- `src/scheduler/askQueueCheckJob.ts` (wrap with fire-and-forget recordJobRun, sync preserved)
- `src/scheduler/dataAuditJob.ts` (wrap runDailyAudit with recordJobRun)
- `src/__tests__/1101-record-job-run-wrapper.test.ts` (CREATE — 20 tests)

Acceptance Criteria:

**Given** `recordJobRun(db, 'job', async () => ({ rowsWritten: 5 }))` | **Then** row status='success', rows_written=5, duration_ms>=0, finished_at set

**Given** `recordJobRun(db, 'job', async () => { throw new Error('fail') })` | **Then** row status='error', error_msg='fail', no unhandled exception

**Given** `recordJobRun(db, 'job', async () => { /* void */ })` | **Then** row rows_written=NULL, status='success'

**Given** each of the 5 scheduler files after merge | **When** `grep "recordJobRun"` | **Then** match found in each file

`bun test src/__tests__/1101-record-job-run-wrapper.test.ts` → 20 pass | `bun tsc --noEmit` → 0 errors

---

**Task 1107 — Signal Fix C: recency_weight in search_similar_context**

Branch: `task/1107-rag-recency-weight` | Layer: domain/interface | Priority: P1 | Sprint: 055 | Depends on: none | Size: S

Files created/modified:
- `src/domain/services/recencyWeighter.ts` (CREATE — pure domain service, 0 infra imports)
- `src/interface/mcp/tools/analysis.ts` (add `recency_days` param + wire `applyRecencyWeighting`)
- `src/__tests__/1107-rag-recency-weight.test.ts` (CREATE — 13 tests, 100% coverage)

Acceptance Criteria:

**Given** result A (similarity=0.9, age=200d, recency_days=90) and B (similarity=0.7, age=5d) | **Then** B ranks above A after recency weighting

**Given** `search_similar_context(query)` called without recency_days | **Then** behaves identically to recency_days=90

**Given** all results age=0 | **Then** recency_weight=1.0 for all, ranking unchanged from cosine-only

**Given** age >> recency_days | **Then** recency_weight=0.1 (floor)

**Given** existing callers without recency_days param | **Then** no changes required (parameter optional, default=90)

Formula: `recency_weight = max(0.1, 1.0 - (age_days / recency_days) * 0.9)`, `final_score = cosine_similarity * recency_weight`

`bun test src/__tests__/1107-rag-recency-weight.test.ts` → 13 pass, 100% coverage | `bun tsc --noEmit` → 0 errors in task files

---

## Sprint 056 — BCTC Fallback Hardening (P1 deadline 2026-04-14)

### Kanban

| ID | Title | Branch | Layer | Tests | Status |
|----|-------|--------|-------|-------|--------|
| 1111 | BCTC fallback: disableSscPolling flag + UPCOM fetcher + listSscDocumentsWithFlag | `main` (hot-fix sprint) | infrastructure/config | 9 pass | Done |

Sprint 056 merged to main 2026-04-11. Task 1111: 9 tests pass, bun tsc --noEmit clean. TECH_056.md approved. SSC disabled by default, HOSE/HNX/UPCOM queried in parallel. VEA (UPCOM) coverage gap closed.

---

## Sprint 057 — Prediction Engine Phase A: Evidence Accumulation Store

### Kanban

| ID | Title | Branch | Layer | Tests | Status |
|----|-------|--------|-------|-------|--------|
| 1116 | evidence_fragments DDL + evidenceFragmentStore CRUD | `main` | infrastructure/db | 18 pass | Done |
| 1117 | record_evidence_fragment MCP tool (+1 tool) | `main` | interface/mcp | 6 pass | Done |
| 1118 | evidenceAccumulatorJob + evidence_scores table | `main` | scheduler | 7 pass | Done |

Sprint started: 2026-04-12. Sprint COMPLETE 2026-04-12. 31/31 tests pass. bun tsc --noEmit clean. Net +1 tool (record_evidence_fragment) → 85 total. +1 cron (evidenceAccumulator). Foreign flow deferred pending Architect VPS feasibility review.

---

### Task Detail Sheets

**Task 1116 — evidence_fragments DDL + evidenceFragmentStore CRUD**

Branch: `task/1116-evidence-fragment-store` | Layer: infrastructure/db | Priority: P2 | Depends on: none | Size: M

Files to create/modify:
- `src/infrastructure/db/schema.ts` (add evidence_fragments + evidence_scores DDL to initDatabase())
- `src/infrastructure/db/evidenceFragmentStore.ts` (CREATE)
- `src/__tests__/1116-evidence-fragment-store.test.ts` (CREATE)

Acceptance Criteria:

**Given** fresh DB after `initDatabase()` | **Then** `evidence_fragments` and `evidence_scores` tables exist with all columns from TECH_057.md

**Given** `insertEvidenceFragment(db, { stock:"VCB", evidence_type:"news_sentiment_stock", direction:"bullish", magnitude:0.7, confidence:0.8, source_agent:"04-market-watcher" })` | **Then** row inserted, `expires_at = timestamp + 30 days`, returns numeric id

**Given** 3 fragments for VCB (1 bullish, 1 bearish, 1 bullish) at t-5d, t-10d, t-35d | **When** `getEvidenceFragments(db, "VCB", { days: 30 })` | **Then** returns 2 rows (t-35d excluded), newest first

**Given** 2 fragments: 1 expired (expires_at < now) + 1 active | **When** `purgeExpiredFragments(db)` | **Then** 1 row deleted, returns 1; active row untouched

**Given** `upsertEvidenceScore(db, "VCB", "2026-04-12", { bullish: 0.56, bearish: 0.12, neutral: 0.0, fragmentCount: 4 })` called twice | **Then** second call replaces, only 1 row for (VCB, 2026-04-12)

`bun test src/__tests__/1116-evidence-fragment-store.test.ts` → all pass | `bun tsc --noEmit` → 0 errors

---

**Task 1117 — record_evidence_fragment MCP Tool**

Branch: `task/1117-evidence-fragment-tool` | Layer: interface/mcp | Priority: P2 | Depends on: 1116 | Size: S

Files to create/modify:
- `src/interface/mcp/tools/evidenceTools.ts` (CREATE)
- `src/interface/mcp/server.ts` (register evidenceTools)
- `src/__tests__/1117-evidence-tools.test.ts` (CREATE)

Acceptance Criteria:

**Given** `record_evidence_fragment({ stock:"VCB", evidence_type:"news_sentiment_stock", direction:"bullish", magnitude:0.7, confidence:0.8, source_agent:"04-market-watcher" })` | **Then** row inserted in evidence_fragments, response contains "Fragment recorded" + id

**Given** `record_evidence_fragment({ ..., magnitude: 1.5 })` (out of range) | **Then** Zod validation error, no row inserted

**Given** server.ts after merge | **Then** toolCount increments by 1 (84 → 85)

`bun test src/__tests__/1117-evidence-tools.test.ts` → all pass | `bun tsc --noEmit` → 0 errors

---

**Task 1118 — evidenceAccumulatorJob + evidence_scores table**

Branch: `task/1118-evidence-accumulator-job` | Layer: scheduler | Priority: P2 | Depends on: 1116 | Size: M

Files to create/modify:
- `src/scheduler/evidenceAccumulatorJob.ts` (CREATE)
- `src/scheduler/jobs.ts` (add "evidenceAccumulator" to CRONS map)
- `src/__tests__/1118-evidence-accumulator-job.test.ts` (CREATE)

Acceptance Criteria:

**Given** 3 bullish (mag=0.8,conf=0.9) + 1 bearish (mag=0.6,conf=0.7) + 1 neutral (mag=0.4,conf=0.5) fragments for "VCB" | **When** `runEvidenceAccumulator(db)` | **Then** evidence_scores row for VCB today: bullish_score=(0.8*0.9+0.8*0.9+0.8*0.9)/3=0.72, bearish_score=0.6*0.7/1=0.42, neutral_score=0.4*0.5/1=0.2, fragment_count=5

**Given** 1 expired fragment (expires_at past) + 1 active | **When** `runEvidenceAccumulator(db)` | **Then** purged=1 returned, expired row deleted, score computed from 1 active fragment

**Given** 0 fragments | **When** `runEvidenceAccumulator(db)` | **Then** returns { stocks: 0, purged: 0 }, no evidence_scores rows inserted

**Given** jobs.ts after merge | **Then** CRONS map key "evidenceAccumulator" exists with default `"0 16 * * *"`

`bun test src/__tests__/1118-evidence-accumulator-job.test.ts` → all pass | `bun tsc --noEmit` → 0 errors

---

## Sprint 058 — BCTC Split-Block OCR Fix (P1 — VNM data quality)

### Kanban

| ID | Title | Branch | Layer | Tests | Status |
|----|-------|--------|-------|-------|--------|
| 1119 | Split-block OCR extraction + magnitude inference for income statement | `main` | domain | 8 pass | Done |
| 1120 | Split-block fallback for balanceSheetExtractor (VNM totalAssets=0) | `main` | domain | 11 pass | Done |

Sprint 058 COMPLETE 2026-04-12. VNM income: revenue 1→63.6T, COGS 10→37.4T. VNM balance sheet: totalAssets 0→53.3T, equity 0→34.5T. 19 new tests + 18 existing pass.

---

## Sprint 059 — Prediction Engine Phase B+C (Base Rates + Prediction Claims)

### Backlog

| ID | Owner | Priority | Title | Status |
|----|-------|----------|-------|--------|
| REQ-059 | @BA | P0 | Write REQ_059.md + TECH_059.md: Phase B (evidence_likelihood_ratios DDL, baseRateComputationJob, per-stock rolling base rate) + Phase C (prediction_claims DDL, get_evidence_summary, create_prediction_claim, predictionResolutionJob, 08-prediction-synthesizer.md). Reference: REQ_057.md Phase B+C sections. Confirm open questions (evidence_type enum, resolution criteria format, min sample size). | Backlog |
| 1088 | @developer | P3 | BCTC OCR regression test: add balance sheet fixture for VNM consolidated format. (a)+(b) shipped, (c) done in 1120. | Done |

---

## In Progress

(empty — WIP 0/2)

---

## Review

(empty — Sprint 055 fully verified 2026-04-11)

---

## DDD Layer Summary

| Layer | Tasks | Description |
|-------|-------|-------------|
| Domain | 041-048, 061-066, 014 | Pure business logic, no I/O |
| Infrastructure | 002, 003, 011-013, 021-030 | SQLite, LanceDB, HTTP, scrapers |
| Application | 047, 048, 065, 066 | Use case orchestration |
| Interface | 081-105 | MCP tools, Bun server, scheduler |
| Test | 121-125 | Cross-cutting |

---

## Definition of Done

- [ ] Code on `task/NNN` branch
- [ ] `bun test src/__tests__/NNN-*.test.ts` → all pass
- [ ] `bun tsc --noEmit` → 0 errors
- [ ] QA checklist 100%
- [ ] Zero BLOCKING issues in Task Report
- [ ] Merged to `main` via `--no-ff`
- [ ] `reports/TASK_REPORT_NNN.md` generated
- [ ] Kanban card moved to Done | TASKS.md updated
