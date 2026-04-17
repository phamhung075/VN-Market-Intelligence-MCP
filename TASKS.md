# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 122 — COMPLETE (2026-04-17)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1358 | test(ohlcv-aggregator): TDD 1358-ohlcv-daily-aggregator.test.ts — written FIRST | Done | QA |
| 1359 | feat(ohlcv-aggregator): ohlcvDailyAggregatorJob + wire jobs.ts | Done | Dev |

> Req spec: `docs/REQ_122.md` | Tech design: `docs/TECH_122.md` | PO sign-off: 2026-04-17

---

## Sprint 123 — COMPLETE (2026-04-17)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1360 | test(ohlcv-backfill-queue): TDD — written FIRST, must be RED | Done | QA |
| 1361 | feat(ohlcv-backfill-queue): backfill queue endpoint + VPS poll script | Done | Dev |

> Req spec: `docs/REQ_123.md` | Tech design: `docs/TECH_123.md` | PO sign-off: 2026-04-17

---

## Sprint 124 — COMPLETE (2026-04-17)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1362 | test(vps-deploy-backfill): TDD — deploy script wires ohlcv-backfill-poll.sh | Done | QA |
| 1363 | feat(vps-deploy-backfill): deploy-vinahost.sh — add backfill poller as 6th service | Done | Dev |

> Goal: Wire ohlcv-backfill-poll.sh into deploy-vinahost.sh so the VPS poller is installed automatically — without this, the Sprint 123 queue mechanism is dead (VPS never polls it)
> Tech design: `docs/TECH_124.md` | PO sign-off: 2026-04-17

---

## Sprint 125 — COMPLETE (2026-04-17)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1364 | test(france-ta-detail): TDD — franceSummaryJob TA section shows ticker signals not just count | Done | QA |
| 1365 | feat(france-ta-detail): franceSummaryJob — replace taCount with top 3 non-neutral TA signals | Done | QA |

> Goal: Enrich France morning briefing TA section with actionable ticker-level RSI/MA20 signals so the user sees which watchlist stocks are overbought/oversold each morning, not just a count.
> Req spec: `docs/REQ_125.md` | Tech design: `docs/TECH_125.md` | PO sign-off: 2026-04-17

---

## Sprint 126 — Active

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1366 | test(pipeline-health-tool): TDD — get_pipeline_health MCP tool returns OHLCV + backfill + TA status | Done | QA |
| 1367 | feat(pipeline-health-tool): implement get_pipeline_health MCP tool | Review | Dev |

> Goal: Add `get_pipeline_health` MCP tool so the user/dev team can instantly inspect the full OHLCV → TA pipeline state (row counts per ticker, backfill queue status, last aggregator run, TA signal count) without digging into logs or waiting for the next evening report.
> Req spec: `docs/REQ_126.md` | Tech design: `docs/TECH_126.md` | Architect: APPROVED_BY_ARCHITECT

---

## Sprint 131 — Active

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1376 | fix(evening-summary-db): add optional db param to runEveningSummary for test isolation | Review | Dev |
| 1377 | fix(evening-summary-test): inject in-memory DB into 1192 test to prevent production-DB bleed | Review | Dev |

> Goal: Fix production-DB bleed in 1192-evening-summary-empty-fallback.test.ts — dedup guard was reading the production singleton DB, causing the test to skip when a real evening summary had already run today.
> Branch: `task/1376-1377-evening-summary-db-isolation`

---

## Task Details (active tasks only)

### Task 1366 — test(pipeline-health-tool): TDD for get_pipeline_health MCP tool

**Branch**: `task/1366-pipeline-health-tool-tdd`
**Layer**: test
**Depends on**: none

**Context**: The OHLCV pipeline (Sprints 121-124) was fully built but we have no way to verify it works without waiting for the next evening report. The `taSummary: []` in every production report means the user never sees TA signals. `get_pipeline_health` gives instant visibility: OHLCV row counts per ticker, backfill queue status, last aggregator run timestamp, and TA signal count — all from a single MCP tool call.

**Files to read first**
- `src/application/usecases/assembleBriefing.ts` (`defaultComputeTa`, `TaSignal` type)
- `src/infrastructure/db/` (pattern for counting rows, querying ohlcv_backfill_queue)
- Any existing health/diagnostic tool in `src/interface/mcp/tools/` for pattern reference

**Files to create**
- CREATE: `src/__tests__/1366-pipeline-health-tool.test.ts`

Line 1: `process.env["DB_PATH"] = ":memory:";`

**Acceptance Criteria** (all RED before 1367, all GREEN after)
- AC-1: `getPipelineHealth()` with 10 daily_ohlcv rows for ticker "VIC" → result includes `{ code: "VIC", ohlcvRows: 10 }` in `tickerStatus` array
- AC-2: `getPipelineHealth()` with empty daily_ohlcv → `tickerStatus` entries have `ohlcvRows: 0`, `taReady: false`
- AC-3: `getPipelineHealth()` with a pending backfill queue entry → `backfillQueue.pending: true`
- AC-4: `getPipelineHealth()` with no queue entries → `backfillQueue.pending: false`
- AC-5: `getPipelineHealth()` with ≥8 rows for ticker "HPG" and valid OHLCV data → `taSignalCount >= 0` (no crash)
- `bun tsc --noEmit` 0 errors

---

### Task 1367 — feat(pipeline-health-tool): implement get_pipeline_health MCP tool

**Branch**: `task/1367-pipeline-health-tool-impl`
**Layer**: interface/application
**Depends on**: 1366 (TDD tests RED)

**Files to read first**
- `src/__tests__/1366-pipeline-health-tool.test.ts` (AC definitions)
- `src/interface/mcp/tools/` (existing tool patterns)
- `src/application/usecases/assembleBriefing.ts` (defaultComputeTa)

**Files to create/modify**
- CREATE: `src/application/usecases/getPipelineHealth.ts` — pure use-case, no infra imports
- MODIFY: `src/interface/mcp/tools/` — register `get_pipeline_health` tool
- MODIFY: `src/interface/mcp/index.ts` or tool registry — wire tool

**Tool output shape**:
```ts
{
  generatedAt: string;           // ISO timestamp
  tickerStatus: Array<{
    code: string;
    ohlcvRows: number;           // COUNT(*) from daily_ohlcv WHERE code=?
    taReady: boolean;            // ohlcvRows >= 8
    taSignal?: string;           // "overbought"|"oversold"|"neutral"|"error"
    rsi14?: number;
  }>;
  backfillQueue: {
    pending: boolean;
    lastRequestedAt?: string;
    lastCompletedAt?: string;
  };
  aggregatorLastRun?: string;    // most recent daily_ohlcv MAX(date) across all tickers
  taSummaryCount: number;        // total non-neutral signals across watchlist
}
```

**Acceptance Criteria**
- All 5 AC tests from 1366 pass
- DDD clean: `getPipelineHealth.ts` in `application/` with zero infra imports (DB passed as param)
- Tool registered under name `get_pipeline_health` with description explaining each field
- `bun tsc --noEmit` 0 errors
- Full suite 0 new failures

---

## Sprint History

| Sprint | Goal summary | Status |
|--------|-------------|--------|
| 125 | feat(france-ta-detail): France briefing TA section — ticker-level RSI/MA20 (1364, 1365) | COMPLETE 2026-04-17 |
| 124 | feat(vps-deploy-backfill): wire ohlcv-backfill-poll.sh as 6th VPS service (1362, 1363) | COMPLETE 2026-04-17 |
| 123 | feat(ohlcv-backfill-queue): auto-trigger backfill via VPS pull pattern (1360, 1361) | COMPLETE 2026-04-17 |
| 122 | feat(ohlcv-aggregator): ohlcvDailyAggregatorJob post-close cron (1358, 1359) | COMPLETE 2026-04-17 |
| 121 | feat(ta-diag): taDiag observability block in evening summary (1356, 1357) | COMPLETE 2026-04-17 |
| 120 | fix(prediction-diag): predictionDiag + medium-severity fallback (1354, 1355) | COMPLETE 2026-04-17 |
