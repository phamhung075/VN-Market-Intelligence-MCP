# TASKS — VN Market Intelligence MCP

> Done/historical tasks: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 071 — Per-Ticker Intelligence Summary

Vision: `SPRINT_GOAL.md`
Spec: `docs/REQ_071.md` | Design: `docs/TECH_071.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| REQ-071 | BA: write REQ_071.md — per-ticker intelligence summary spec, data contracts, acceptance criteria | BA | — | — | — | Done |
| TECH-071 | Architect: write TECH_071.md — DDD layer plan, interface contracts, test strategy | Architect | — | REQ-071 | — | Done |
| PM-071 | PM: sprint planning — create tasks 1178–1181 in TASKS.md, assign to Developer, set branch | PM | — | TECH-071 | — | Done |
| 1178 | TDD: write failing tests for AC-1 to AC-8 in `src/__tests__/1178-ticker-intelligence.test.ts` | Developer | tests | TECH-071 ✓ | task/1178-ticker-intelligence | Review |
| 1179 | Implement `tickerIntelligenceTools.ts` — all 6 sections + `handleGetTickerIntelligence` + `formatTickerIntelligence` + `registerTickerIntelligenceTools` (FR-1 through FR-8) | Developer | interface | 1178 ✓ | task/1178-ticker-intelligence | Todo |
| 1180 | Register `registerTickerIntelligenceTools` in `registry.ts`; update `087-server-wiring.test.ts` to expect `toolCount = 97` (FR-9) | Developer | interface | 1179 ✓ | task/1178-ticker-intelligence | Todo |
| 1181 | Sprint close: advance `project-stats.json` `currentSprint` to 71, `toolCount` to 97, update `lastUpdated` | Developer | docs/data | 1179 ✓, 1180 ✓ | task/1178-ticker-intelligence | Backlog |

**WIP state:** 0 tasks In Progress (limit: 2). Sprint 071 ACTIVE. Task 1178 in Review.

---

### Task 1178 — TDD: write failing tests for AC-1 to AC-8

**Branch**: `task/1178-ticker-intelligence`
**Layer**: tests
**Depends on**: TECH-071 (approved design)

#### Files to read first

- `src/__tests__/1146-get-insider-transactions.test.ts` — DB injection pattern to copy (`handleGetInsiderTransactions` called directly, in-memory db)
- `src/infrastructure/db/evidenceFragmentStore.ts` — `getLatestEvidenceScore` signature
- `src/infrastructure/db/insiderStore.ts` — `getInsiderTransactionsFiltered` signature
- `src/infrastructure/db/predictionClaimStore.ts` — `getResolvedClaims` signature

#### Files to create

- CREATE: `src/__tests__/1178-ticker-intelligence.test.ts`

#### Setup boilerplate

```typescript
process.env["DB_PATH"] = ":memory:";
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import Database from "bun:sqlite";
import { handleGetTickerIntelligence, formatTickerIntelligence } from "../interface/mcp/tools/tickerIntelligenceTools.js";
```

The test file must define a `buildDb()` helper that creates an in-memory `Database` instance and runs the following DDL:

```sql
CREATE TABLE market_prices_history (code TEXT, price REAL, volume INTEGER, fetched_at TEXT);
CREATE TABLE evidence_scores (id INTEGER PRIMARY KEY, stock TEXT, score_date TEXT,
  bullish_score REAL, bearish_score REAL, neutral_score REAL, fragment_count INTEGER, computed_at TEXT);
CREATE TABLE insider_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT,
  insider_name TEXT, position TEXT, type TEXT, executed_volume INTEGER, registered_volume INTEGER,
  price REAL, from_date TEXT, to_date TEXT, fetched_at TEXT);
CREATE TABLE vnstock_trading_stats (code TEXT, foreign_volume INTEGER, foreign_room INTEGER,
  current_holding_ratio REAL, fetched_at TEXT);
CREATE TABLE financial_reports (id INTEGER PRIMARY KEY, action_code TEXT, sort_key TEXT,
  period_year INTEGER, period_quarter INTEGER, ai_analysis TEXT);
CREATE TABLE prediction_claims (id INTEGER PRIMARY KEY, stock TEXT, agent_id TEXT,
  claim_text TEXT, direction TEXT, target_price REAL, creation_price REAL,
  resolution_date TEXT, confidence REAL, resolution_outcome TEXT, brier_score REAL,
  resolved_at TEXT, created_at TEXT);
```

All tests call `handleGetTickerIntelligence(code, db)` directly — no MCP transport overhead. Import is named; if the module does not exist yet, TypeScript will compile but the import will fail at runtime, causing all tests to fail (red phase).

#### Test cases to write (all must fail — red phase)

| Test | AC | What it proves |
|---|---|---|
| `AC-1: full brief with all data` | AC-1 | Seed all 6 tables for VCB; assert header `=== INTELLIGENCE BRIEF: VCB ===`, `85,000 VND`, `Bullish 0.7200`, 2 insider lines, `TICH CUC`, `Chinh xac 2/2 (100.0%)`, footer `===================================` |
| `AC-2: clean brief with no data` | AC-2 | Empty DB for HPG; assert all 6 section labels present with their respective no-data strings |
| `AC-3: ticker normalised to uppercase` | AC-3 | Insert price for `"FPT"`, call with `"fpt"`; assert header shows `FPT` and price data returned |
| `AC-4: malformed ai_analysis JSON` | AC-4 | Insert `ai_analysis = "not-valid-json"` for VNM; assert section 5 shows `(loi phan tich BCTC)` |
| `AC-5: insider cap at 3 with overflow` | AC-5 | Insert 5 insider rows for VCB within last 7 days; assert exactly 3 transaction lines + `(+2 giao dich khac trong 7 ngay)` |
| `AC-6: all brier_scores null` | AC-6 | Insert 2 resolved claims for TCB with NULL brier_score; assert `Brier TB: N/A` |
| `AC-7: tool registered in server wiring` | AC-7 | Import `registry.ts`; assert `get_ticker_intelligence` present (toolCount = 97 deferred to task 1180) |
| `AC-8: formatTickerIntelligence output structure` | AC-8 | Call `formatTickerIntelligence` directly with stub sections; assert header uses exactly 35 `=`, all 6 labels present, footer uses exactly 35 `=` |
| `edge: section 5 missing ai_analysis fields` | edge | Insert valid JSON `{}` (no outlook/summary); assert section 5 shows `(loi phan tich BCTC)` |

#### Acceptance Criteria

**Given** `src/__tests__/1178-ticker-intelligence.test.ts` is written with the 9 test cases above and `tickerIntelligenceTools.ts` does not yet exist

**When** `bun test src/__tests__/1178-ticker-intelligence.test.ts` is run

**Then**
- All 9 tests fail with import or runtime errors (red phase confirmed)
- `bun tsc --noEmit` shows only the expected "module not found" errors for the not-yet-existing implementation file — no other type errors
- No changes are made to any non-test file

---

### Task 1179 — Implement tickerIntelligenceTools.ts

**Branch**: `task/1178-ticker-intelligence`
**Layer**: interface
**Depends on**: 1178 (red-phase tests committed)

#### Files to read first

- `src/__tests__/1178-ticker-intelligence.test.ts` — the test contracts to satisfy
- `src/interface/mcp/tools/foreignFlowTools.ts` — DB injection pattern + `formatVolume` / `formatPrice` local helpers to replicate
- `src/interface/mcp/tools/insiderTools.ts` — `registerInsiderTools` DB injection pattern
- `src/infrastructure/db/evidenceFragmentStore.ts` — `getLatestEvidenceScore(db, ticker)` return type
- `src/infrastructure/db/insiderStore.ts` — `getInsiderTransactionsFiltered(db, { codes, sinceDate })` return shape
- `src/infrastructure/db/predictionClaimStore.ts` — `getResolvedClaims(db, ticker, limit)` return shape
- `src/infrastructure/db/schema.ts` — `getDb()` import path

#### Files to create

- CREATE: `src/interface/mcp/tools/tickerIntelligenceTools.ts`

#### Implementation requirements

Export three functions in this file:

1. `registerTickerIntelligenceTools(server: McpServer, db?: Database): void`
   - Registers tool `get_ticker_intelligence` with input schema `{ code: z.string() }`
   - Uses `db ?? getDb()` pattern (same as `foreignFlowTools.ts`)

2. `handleGetTickerIntelligence(code: string, db: Database): Promise<string>`
   - Normalises `code` via `.toUpperCase().trim()`
   - Runs all 6 sections in sequential independent `try/catch` blocks (see error isolation pattern in TECH-071)
   - Calls `formatTickerIntelligence(code, sections, timestamp)`
   - Outer try/catch returns a generic error string if anything escapes all inner guards

3. `formatTickerIntelligence(code: string, sections: [string, string, string, string, string, string], timestamp: string): string`
   - Assembles the complete brief — header line `=== INTELLIGENCE BRIEF: {CODE} ===`, timestamp line, 6 labelled sections, footer line
   - Header and footer each use exactly 35 `=` characters

Section implementation details (refer to TECH-071 `Per-Section Implementation Plan`):
- Section 1: inline SQL on `market_prices_history`; `formatPrice` = `Math.round(n).toLocaleString("en-US")`; `formatVolume` thresholds: `>=1_000_000` → `M`, `>=1_000` → `K`, else raw integer
- Section 2: `getLatestEvidenceScore(db, ticker)` — scores to `.toFixed(4)`, fragment_count as integer
- Section 3: `getInsiderTransactionsFiltered(db, { codes: [ticker], sinceDate })` — 7-day window, cap at 3 rows, overflow line, type map `buy→mua / sell→ban`
- Section 4: inline SQL on `vnstock_trading_stats`; zero-guard on `foreign_volume`; `holding_ratio = (current_holding_ratio * 100).toFixed(2)`
- Section 5: inline SQL on `financial_reports`; `JSON.parse` inside inner try/catch; outlook map `positive→TICH CUC / neutral→TRUNG TINH / negative→TIEU CUC / mixed→HO HOP / else→KHONG RO`; summary truncated at 120 chars + `"..."`
- Section 6: `getResolvedClaims(db, ticker, 20)`; compute `correct`, `pct`, `avg_brier` (null-filtered); `avg_brier = "N/A"` when no non-null scores

#### Acceptance Criteria

**Given** `tickerIntelligenceTools.ts` is implemented and the 9 tests from task 1178 exist

**When** `bun test src/__tests__/1178-ticker-intelligence.test.ts` is run

**Then**
- All 9 tests pass (0 failures)
- `bun tsc --noEmit` reports 0 errors
- `registry.ts` is NOT yet modified (that is task 1180)

---

### Task 1180 — Register tool in registry.ts + update 087-server-wiring.test.ts

**Branch**: `task/1178-ticker-intelligence`
**Layer**: interface
**Depends on**: 1179 (implementation complete and tests green)

#### Files to read first

- `src/interface/mcp/tools/registry.ts` — existing import list and `toolRegistry` array
- `src/__tests__/087-server-wiring.test.ts` — locate `toolCount` assertion to update
- `docs/data/tool-registry.json` — current `toolCount` to verify starting value

#### Files to modify

- MODIFY: `src/interface/mcp/tools/registry.ts`
  - Add import: `import { registerTickerIntelligenceTools } from "./tickerIntelligenceTools.js";`
  - Append to `toolRegistry` array: `registerTickerIntelligenceTools, // Sprint 071: get_ticker_intelligence (+1 tool → 97)`
- MODIFY: `src/__tests__/087-server-wiring.test.ts`
  - Find the assertion that checks `toolCount` and update the expected value from `96` to `97`
- MODIFY: `docs/data/tool-registry.json`
  - Set `toolCount` to `97`
  - Add entry for `get_ticker_intelligence` in the tool list

#### Acceptance Criteria

**Given** `registry.ts` is updated with the new import and array entry

**When** `bun test src/__tests__/087-server-wiring.test.ts` and `bun test src/__tests__/1178-ticker-intelligence.test.ts` are run

**Then**
- Both test files pass with 0 failures
- `bun tsc --noEmit` reports 0 errors
- `get_ticker_intelligence` appears in the registered tool list
- `docs/data/tool-registry.json` `toolCount` = 97

---

### Task 1181 — Sprint close

**Branch**: `task/1178-ticker-intelligence`
**Layer**: docs/data
**Depends on**: 1179 ✓, 1180 ✓

#### Files to modify

- MODIFY: `docs/data/project-stats.json`
  - Set `currentSprint` to `71`
  - Set `toolCount` to `97`
  - Set `lastUpdated` to today's date (`2026-04-13`)

#### Acceptance Criteria

**Given** tasks 1179 and 1180 are Done and all tests pass

**When** `docs/data/project-stats.json` is updated and `bun test && bun tsc --noEmit` are run

**Then**
- `project-stats.json` `currentSprint` = 71
- `project-stats.json` `toolCount` = 97
- `bun test` passes with 0 failures (full suite)
- `bun tsc --noEmit` reports 0 errors
- All task branches deleted locally and remotely, working directory back on `main`

---

## Sprint 070 — Calibration Label Integration

Vision: `SPRINT_GOAL.md`
Spec: `docs/REQ_070.md` | Design: `docs/TECH_070.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| REQ-070 | BA: write REQ_070.md — calibration label integration spec, acceptance criteria | BA | — | — | — | Done |
| TECH-070 | Architect: write TECH_070.md — DDD layer plan, SQL design, interface contracts, test strategy, risk analysis | Architect | — | REQ-070 | — | Done |
| PM-070 | PM: sprint planning — create tasks 1173–1177 in TASKS.md, assign to Developer, set branch | PM | — | TECH-070 | — | Done |
| 1173 | TDD: write failing tests for AC-1 to AC-9 in `src/__tests__/1173-label-accuracy-report.test.ts` | Developer | tests | TECH-070 ✓ | task/1173-calibration-label-integration | Done |
| 1174 | Add `getLabelAccuracyReport` + `LabelAccuracyRow` type to `marketMessageStore.ts` (FR-1) | Developer | infrastructure | 1173 ✓ | task/1173-calibration-label-integration | Done |
| 1175 | Add `get_label_accuracy_report` tool to `calibrationTools.ts` + extend `registerCalibrationTools` (FR-2, FR-4) | Developer | interface | 1174 ✓ | task/1173-calibration-label-integration | Done |
| 1176 | Extend `CalibrationJobResult` with `label_accuracy` field + update `runCalibrationReport` Step 3.5 + `sendCalibrationDigest` WORK block (FR-3); extend `makeDb()` in `1128-calibration-report-job.test.ts` to create `market_messages` table | Developer | scheduler | 1174 ✓ | task/1173-calibration-label-integration | Done |
| 1177 | Sprint close: advance `project-stats.json` `currentSprint` to 70, `toolCount` to 96, update `lastUpdated` | Developer | docs/data | 1175 ✓, 1176 ✓ | task/1173-calibration-label-integration | Done |

**WIP state:** 0 tasks In Progress (limit: 2). Sprint 070 COMPLETE. Tasks 1173–1177 Done.

---

### Task 1173 — TDD: write failing tests for AC-1 to AC-9

**Branch**: `task/1173-calibration-label-integration`
**Layer**: tests
**Depends on**: TECH-070 (approved design)

#### Files to read first

- `src/__tests__/1163-market-message-review.test.ts` — isolation pattern to copy exactly (`process.env["DB_PATH"] = ":memory:"` at file top before any import, `initDatabase` + `closeDb` in `beforeEach`/`afterEach`)
- `src/__tests__/1128-calibration-report-job.test.ts` — `TelegramOverrides` pattern and `makeDb()` helper for AC-6, AC-7, AC-9
- `src/__tests__/1129-calibration-tools.test.ts` — how `registerCalibrationTools` is called with an injected db for AC-4, AC-5
- `src/infrastructure/db/marketMessageStore.ts` — existing exports to understand current shape before adding `getLabelAccuracyReport`
- `src/scheduler/calibrationReportJob.ts` — existing `CalibrationJobResult` interface and `TelegramOverrides` type

#### Files to create

- CREATE: `src/__tests__/1173-label-accuracy-report.test.ts`

#### Setup boilerplate

```typescript
process.env["DB_PATH"] = ":memory:";
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { insertMarketMessage, reviewMarketMessage,
         getLabelAccuracyReport } from "../infrastructure/db/marketMessageStore.js";
```

In `beforeEach`: call `initDatabase()`. In `afterEach`: call `closeDb()`. The in-memory DB created by `initDatabase()` already creates `market_messages` with all four indices — no manual DDL needed.

For AC-4 and AC-5 (MCP tool tests): use a real in-memory DB injected through `registerCalibrationTools(server, db)` — the existing `resolveDb` closure already accepts an optional `db` parameter.

For AC-6, AC-7, AC-9 (job tests): use `TelegramOverrides` to capture the WORK message string:

```typescript
let capturedWork = "";
const overrides: TelegramOverrides = {
  sendWork: async (msg) => { capturedWork = msg; return true; },
  sendMarket: async () => true,
};
const result = await runCalibrationReport(db, overrides);
expect(capturedWork).toContain("Label Accuracy (90 ngay, human labels):");
```

#### Test groups to write (all must fail on first commit — red phase)

| Test | AC | What it proves |
|---|---|---|
| `getLabelAccuracyReport — groups by from_agent, excludes unreviewed` | AC-1 | 5 rows → 2 groups; NULL verdict excluded; ordering signal_rate DESC |
| `getLabelAccuracyReport — respects since_days window` | AC-2 | reviewed_at 95 days ago excluded; reviewed_at 5 days ago included |
| `getLabelAccuracyReport — returns [] when no reviewed rows` | AC-3 | empty table / all NULL verdict → [] |
| `get_label_accuracy_report MCP tool — formatted table with 2 rows` | AC-4 | header contains "90 ngay", percentages correct, footer counts correct |
| `get_label_accuracy_report MCP tool — empty state message` | AC-5 | no data → Vietnamese empty-state text |
| `runCalibrationReport — WORK message includes label_accuracy block` | AC-6 | captured workLines contain section header and agent lines |
| `runCalibrationReport — WORK message shows (no label data yet)` | AC-7 | empty market_messages → fallback line present |
| `CalibrationJobResult has label_accuracy field` | AC-8 | type assertion + runtime check; tsc clean |
| `runCalibrationReport — getLabelAccuracyReport exception is isolated` | AC-9 | mock db.prepare throw → job completes, label_accuracy=[], WORK shows (no label data yet) |

All tests must compile (TypeScript valid) but fail because `getLabelAccuracyReport` does not yet exist in `marketMessageStore.ts`, `get_label_accuracy_report` does not yet exist in `calibrationTools.ts`, and `CalibrationJobResult.label_accuracy` does not yet exist in `calibrationReportJob.ts`.

#### Acceptance Criteria

**Given** `src/__tests__/1173-label-accuracy-report.test.ts` exists with all 9 test cases
**When** `bun test src/__tests__/1173-label-accuracy-report.test.ts` is run before tasks 1174–1176 are done
**Then**
- All 9 test cases exist and are syntactically valid TypeScript
- Tests fail (red) because `getLabelAccuracyReport` is not yet exported from `marketMessageStore.ts` and `get_label_accuracy_report` is not yet registered in `calibrationTools.ts`
- `bun tsc --noEmit` passes (imports forward-declared or typed correctly)

---

### Task 1174 — Add getLabelAccuracyReport + LabelAccuracyRow to marketMessageStore.ts

**Branch**: `task/1173-calibration-label-integration`
**Layer**: infrastructure
**Depends on**: 1173 ✓

#### Files to read first

- `src/infrastructure/db/marketMessageStore.ts` — full file: existing exported interfaces (`MarketMessage`, `MarketMessageAgent`) and function patterns to follow
- `src/infrastructure/db/schema.ts` — confirm `market_messages` DDL column names (`verdict`, `reviewed_at`, `from_agent`, `sent_at`)

#### Files to modify

- MODIFY: `src/infrastructure/db/marketMessageStore.ts` — add `LabelAccuracyRow` interface + `getLabelAccuracyReport` function

#### New exports to add

**Interface** (add before function declarations):

```typescript
export interface LabelAccuracyRow {
  from_agent: string;
  total_reviewed: number;
  signal_count: number;
  noise_count: number;
  signal_rate: number | null;
  last_reviewed_at: string | null;
}
```

**`getLabelAccuracyReport`** — exact SQL and clamping:

```typescript
export function getLabelAccuracyReport(
  db: Database,
  since_days?: number,
): LabelAccuracyRow[]
```

Clamping: `const clampedDays = Math.min(365, Math.max(1, since_days ?? 90));`

SQL (parameterized, single binding `[clampedDays]`):

```sql
SELECT
  from_agent,
  COUNT(*)                                            AS total_reviewed,
  SUM(CASE WHEN verdict = 'signal' THEN 1 ELSE 0 END) AS signal_count,
  SUM(CASE WHEN verdict = 'noise'  THEN 1 ELSE 0 END) AS noise_count,
  CAST(SUM(CASE WHEN verdict = 'signal' THEN 1 ELSE 0 END) AS REAL)
    / COUNT(*)                                        AS signal_rate,
  MAX(reviewed_at)                                    AS last_reviewed_at
FROM market_messages
WHERE verdict IS NOT NULL
  AND reviewed_at >= date('now', '-' || ? || ' days')
GROUP BY from_agent
ORDER BY signal_rate DESC, total_reviewed DESC
```

Post-query: cast `signal_count` and `noise_count` to `number`; coerce `signal_rate` to `number | null`.

#### Acceptance Criteria

**Given** `getLabelAccuracyReport` and `LabelAccuracyRow` are exported from `marketMessageStore.ts`
**When** `bun test src/__tests__/1173-label-accuracy-report.test.ts` is run
**Then**
- AC-1 passes: 5 rows → 2 groups, NULL verdict excluded, ordered signal_rate DESC
- AC-2 passes: reviewed_at 95 days ago excluded, 5 days ago included
- AC-3 passes: empty table → []
- `bun tsc --noEmit` reports 0 errors

---

### Task 1175 — Add get_label_accuracy_report tool to calibrationTools.ts

**Branch**: `task/1173-calibration-label-integration`
**Layer**: interface
**Depends on**: 1174 ✓

#### Files to read first

- `src/interface/mcp/tools/calibrationTools.ts` — full file: existing `registerCalibrationTools` signature, `resolveDb` closure pattern, `get_calibration_report` tool registration as the model to follow
- `src/infrastructure/db/marketMessageStore.ts` — confirm `getLabelAccuracyReport` and `LabelAccuracyRow` are now exported (from task 1174)

#### Files to modify

- MODIFY: `src/interface/mcp/tools/calibrationTools.ts` — add import of `getLabelAccuracyReport, type LabelAccuracyRow` from `marketMessageStore.js`; add new tool inside existing `registerCalibrationTools`

#### Tool registration (exact signature)

```typescript
server.tool(
  "get_label_accuracy_report",
  "Returns per-agent signal accuracy computed from human verdict labels on MARKET channel messages. " +
  "Each row shows how often an agent's messages were labelled 'signal' vs 'noise' by the user. " +
  "Use this alongside get_calibration_report to understand which agents generate genuine signals. " +
  "since_days controls the lookback window (default 90 days, matching the calibration engine window).",
  {
    since_days: z.coerce.number().int().min(1).max(365).default(90).optional()
      .describe("Lookback window in calendar days (1-365, default 90)"),
  },
  async ({ since_days }) => { ... }
)
```

The handler calls `getLabelAccuracyReport(resolveDb(), since_days ?? 90)` and formats output per the contracts below. No change to `registry.ts` — `registerCalibrationTools(server)` already covers the new tool.

#### Output format — non-empty path

```
Label Accuracy Report — {N} ngay gan nhat
=========================================

Agent                  Reviewed  Signal  Noise   Signal%   Last reviewed
--------------------   --------  ------  -----   -------   -------------------------
{from_agent.padEnd(22)}  {total_reviewed.padStart(8)}  {signal_count.padStart(6)}  {noise_count.padStart(5)}  {signal_rate_pct.padStart(7)}  {last_reviewed_at}

-----------------------------------------
Tong: {rows.length} agents, {totalReviewed} tin da review.
Su dung get_calibration_report de xem Brier score tu prediction_claims.
```

`signal_rate_pct` = `(row.signal_rate * 100).toFixed(1) + "%"`. `totalReviewed` = `rows.reduce((s, r) => s + r.total_reviewed, 0)`.

#### Output format — empty path

```
Khong co tin nhan da review trong {N} ngay qua.
Hay su dung batch_review_market_messages de danh gia tin nhan.
```

#### Acceptance Criteria

**Given** `get_label_accuracy_report` is registered in `registerCalibrationTools`
**When** `bun test src/__tests__/1173-label-accuracy-report.test.ts` is run
**Then**
- AC-4 passes: formatted table header contains "90 ngay", `alert-commander` at 73.8%, `morning-briefing` at 64.3%, footer contains "2 agents" and "56 tin da review"
- AC-5 passes: empty state returns exact Vietnamese text
- `bun tsc --noEmit` reports 0 errors

---

### Task 1176 — Extend CalibrationJobResult + runCalibrationReport + sendCalibrationDigest; fix makeDb() in 1128 test

**Branch**: `task/1173-calibration-label-integration`
**Layer**: scheduler
**Depends on**: 1174 ✓

#### HIDDEN DEPENDENCY — read this first

`src/__tests__/1128-calibration-report-job.test.ts` contains a `makeDb()` helper that creates only `prediction_claims` and `calibration_snapshots`. After this task's changes to `runCalibrationReport`, the job will query `market_messages` via `getLabelAccuracyReport`. The `makeDb()` helper in the 1128 test file MUST be extended to also create the `market_messages` table (with its four indices) so that existing 1128 tests do not fail with "no such table: market_messages".

#### Files to read first

- `src/scheduler/calibrationReportJob.ts` — full file: `CalibrationJobResult` interface, `runCalibrationReport` function (all steps), `sendCalibrationDigest` function (workLines construction)
- `src/__tests__/1128-calibration-report-job.test.ts` — full file: `makeDb()` helper DDL, existing test structure, how `TelegramOverrides` is used
- `src/infrastructure/db/schema.ts` — `market_messages` DDL (table + four indices) to copy into `makeDb()`
- `src/infrastructure/db/marketMessageStore.ts` — confirm `getLabelAccuracyReport` and `LabelAccuracyRow` are exported (from task 1174)

#### Files to modify

- MODIFY: `src/scheduler/calibrationReportJob.ts` — extend `CalibrationJobResult`, add Step 3.5 to `runCalibrationReport`, extend `workLines` block in `sendCalibrationDigest`
- MODIFY: `src/__tests__/1128-calibration-report-job.test.ts` — extend `makeDb()` to create `market_messages` table and its indices

#### CalibrationJobResult extension

```typescript
export interface CalibrationJobResult {
  // ... existing fields unchanged ...
  /** Per-agent accuracy from human verdict labels on market_messages. Empty array on error or no data. */
  label_accuracy: LabelAccuracyRow[];
}
```

Import to add: `getLabelAccuracyReport, type LabelAccuracyRow` from `../infrastructure/db/marketMessageStore.js`.

#### New Step 3.5 in runCalibrationReport (insert after existing Step 3)

```typescript
// ── Step 3.5: Per-agent label accuracy (human verdicts) ───────────────────
let labelAccuracy: LabelAccuracyRow[] = [];
try {
  labelAccuracy = getLabelAccuracyReport(database, 90);
} catch (err) {
  logger.warn("[calibrationReportJob] getLabelAccuracyReport failed — using empty", {
    error: err instanceof Error ? err.message : String(err),
  });
}
```

Thread `labelAccuracy` into `jobResult.label_accuracy` and pass via `CalibrationJobResult` to `sendCalibrationDigest`.

#### workLines extension in sendCalibrationDigest (append after existing "Per-agent Brier:" block)

```typescript
workLines.push("\nLabel Accuracy (90 ngay, human labels):");
if (result.label_accuracy.length === 0) {
  workLines.push("  (no label data yet)");
} else {
  for (const row of result.label_accuracy) {
    const pct = row.signal_rate !== null
      ? (row.signal_rate * 100).toFixed(1)
      : "0.0";
    workLines.push(`  ${row.from_agent}: ${row.signal_count}/${row.total_reviewed} signal (${pct}%)`);
  }
}
```

#### makeDb() fix in 1128 test file

Extend the existing `makeDb()` helper to run the `CREATE TABLE IF NOT EXISTS market_messages` DDL and all four `CREATE INDEX IF NOT EXISTS` statements that match the schema in `src/infrastructure/db/schema.ts`. Copy the exact DDL from `schema.ts` — do not paraphrase.

#### Acceptance Criteria

**Given** `CalibrationJobResult.label_accuracy` field exists, Step 3.5 is in `runCalibrationReport`, `workLines` block is extended, and `makeDb()` in 1128 test creates `market_messages`
**When** `bun test src/__tests__/1173-label-accuracy-report.test.ts` is run
**Then**
- AC-6 passes: WORK message contains section header and agent lines
- AC-7 passes: empty market_messages → WORK message contains "(no label data yet)"
- AC-8 passes: returned object has `label_accuracy: LabelAccuracyRow[]`, tsc clean
- AC-9 passes: mock db.prepare throw → job completes, label_accuracy=[], WORK shows "(no label data yet)"

**And** when `bun test src/__tests__/1128-calibration-report-job.test.ts` is run
**Then**
- All pre-existing 1128 tests still pass (market_messages table now exists in makeDb())
- `bun tsc --noEmit` reports 0 errors

---

### Task 1177 — Sprint close: advance project-stats.json to sprint 070

**Branch**: `task/1173-calibration-label-integration`
**Layer**: docs/data
**Depends on**: 1175 ✓, 1176 ✓

#### Files to read first

- `docs/data/project-stats.json` — current values for `currentSprint`, `toolCount`, `lastUpdated`

#### Files to modify

- MODIFY: `docs/data/project-stats.json` — set `currentSprint` to `70`, `toolCount` to `96`, `lastUpdated` to today's date

#### Verification steps

1. Run `bun test` — confirm all tests pass including pre-existing suites
2. Run `bun tsc --noEmit` — confirm 0 errors
3. Confirm `get_label_accuracy_report` is the 96th tool (was 95 before this sprint)
4. Merge branch `task/1173-calibration-label-integration` to `main`
5. Delete branch locally and remotely: `git branch -d task/1173-calibration-label-integration && git push origin --delete task/1173-calibration-label-integration`
6. Confirm `git branch --show-current` = `main`

#### Acceptance Criteria

**Given** tasks 1173–1176 are Done and all tests pass
**When** `docs/data/project-stats.json` is updated and `bun test && bun tsc --noEmit` runs
**Then**
- `project-stats.json` has `currentSprint = 70`, `toolCount = 96`
- `bun test` exits with 0 failures
- `bun tsc --noEmit` exits with 0 errors
- Branch `task/1173-calibration-label-integration` deleted locally and remotely
- `git branch --show-current` = `main`

---

## Sprint 069 — Market Message Review UX + Task 1139 Close

Vision: `SPRINT_GOAL.md`
Spec: `docs/REQ_069.md` | Design: `docs/TECH_069.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| REQ-069 | BA: write REQ_069.md — digest + batch review UX, Task 1139 close spec, acceptance criteria | BA | — | — | — | Done |
| TECH-069 | Architect: write TECH_069.md — DDD layer plan, interface contracts, SQL, test strategy, dependency graph | Architect | — | REQ-069 | — | Done |
| PM-069 | PM: sprint planning — create tasks 1168–1172 in TASKS.md, assign to Developer, set branch | PM | — | TECH-069 | — | Done |
| 1168 | TDD: write failing tests for AC-1 to AC-12 + AC-14 in `src/__tests__/1168-market-message-digest.test.ts` | Developer | tests | TECH-069 ✓ | task/1168-market-message-digest | Done |
| 1169 | Add `getMarketMessageDigest` + `batchReviewMarketMessages` + types to `marketMessageStore.ts` (FR-1, FR-2) | Developer | infrastructure | 1168 ✓ | task/1168-market-message-digest | Done |
| 1170 | Add `handleGetMarketMessageDigest`, `handleBatchReviewMarketMessages` + register two new MCP tools in `marketMessageTools.ts` (FR-3, FR-4, FR-5) | Developer | interface | 1169 ✓ | task/1168-market-message-digest | Done |
| 1171 | Close Task 1139: verify recordJobRun wraps in `jobs.ts`, confirm Done in TASKS.md, archive in `docs/TASKS_ARCHIVE.md` (FR-6) | Developer | admin | — | main (no code changes expected) | Done |
| 1172 | Sprint close: advance `project-stats.json` `currentSprint` to 69, `toolCount` to 95, update `lastUpdated` | Developer | docs/data | 1170 ✓, 1171 ✓ | task/1168-market-message-digest | Done |

**WIP state:** 0 tasks In Progress (limit: 2). Sprint 069 COMPLETE. Tasks 1168–1172 Done.

---

### Task 1168 — TDD: write failing tests for AC-1 to AC-12 + AC-14

**Branch**: `task/1168-market-message-digest`
**Layer**: tests
**Depends on**: TECH-069 (approved design)

#### Files to read first

- `src/__tests__/1163-market-message-review.test.ts` — isolation pattern to copy exactly (`process.env["DB_PATH"] = ":memory:"` at file top before any import, `initDatabase` + `closeDb` in `beforeEach`/`afterEach`)
- `src/infrastructure/db/marketMessageStore.ts` — existing exports (`insertMarketMessage`, `getUnreviewedMarketMessages`, `reviewMarketMessage`) to understand current shape before adding new exports
- `src/interface/mcp/tools/marketMessageTools.ts` — existing handler exports to confirm `handleGetMarketMessageDigest` and `handleBatchReviewMarketMessages` do not yet exist

#### Files to create

- CREATE: `src/__tests__/1168-market-message-digest.test.ts`

#### Setup boilerplate (copy from `1163-market-message-review.test.ts` pattern)

```typescript
process.env["DB_PATH"] = ":memory:";
import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { insertMarketMessage, getMarketMessageDigest, batchReviewMarketMessages }
  from "../infrastructure/db/marketMessageStore.js";
import { handleGetMarketMessageDigest, handleBatchReviewMarketMessages }
  from "../interface/mcp/tools/marketMessageTools.js";

beforeEach(() => { initDatabase(getDb()); });
afterEach(() => { closeDb(); });
afterAll(() => { closeDb(); });
```

#### Test groups to write (all must fail on first commit — red phase)

| Test group | ACs covered | What is tested |
|---|---|---|
| `getMarketMessageDigest — grouped entries` | AC-1 | 5 rows per AC-1 scenario; 3 entries returned; correct counts, ids, ordering |
| `getMarketMessageDigest — excludes reviewed rows` | AC-1 | id 14 with verdict "signal" absent from result |
| `getMarketMessageDigest — limit_days respects date cutoff` | AC-2 | Row at `datetime('now', '-8 days')` excluded; row at `datetime('now', '-1 day')` included |
| `getMarketMessageDigest — empty state` | AC-3 | No unreviewed rows; returns `[]` |
| `getMarketMessageDigest — id_list single row` | edge | One group, one row; `"42".split(",").map(Number)` produces `[42]` |
| `getMarketMessageDigest — default limit_days=7` | edge | No second arg; rows 6 days ago included, 8 days ago excluded |
| `getMarketMessageDigest — limit_days clamped min` | edge | `limit_days=0` treated as 1 (store-level clamping, not Zod) |
| `getMarketMessageDigest — limit_days clamped max` | edge | `limit_days=50` treated as 30 |
| `batchReviewMarketMessages — updates all ids` | AC-4 | 3 rows updated; returns `{ updated: 3, notFound: [] }` |
| `batchReviewMarketMessages — reports notFound` | AC-5 | ids [20, 21, 999]; returns `{ updated: 2, notFound: [999] }` |
| `batchReviewMarketMessages — empty ids no-op` | AC-6 | `ids=[]`; returns `{ updated: 0, notFound: [] }` with no SQL |
| `batchReviewMarketMessages — invalid verdict throws` | AC-7 | `verdict="maybe"`; throws `Error("Invalid verdict")` |
| `batchReviewMarketMessages — sets verdict_note` | AC-4 | SELECT row; `verdict_note = "overnight noise batch"` |
| `batchReviewMarketMessages — idempotent overwrite` | edge | Two calls with different verdicts; second wins; no error |
| `batchReviewMarketMessages — all not found` | edge | 200 non-existent ids; `{ updated: 0, notFound: [all 200] }` |
| `get_market_message_digest MCP tool — formatted output` | AC-8 | Text contains `[2026-04-13]`, `2 tin`, `ids: [`, `Tong: 3` |
| `get_market_message_digest MCP tool — empty state` | AC-9 | Returns `"Khong co tin nhan chua review trong 7 ngay qua."` |
| `batch_review_market_messages MCP tool — all found` | AC-10 | Returns `"3 tin da duoc danh gia la 'noise'."` |
| `batch_review_market_messages MCP tool — partial notFound` | AC-11 | Text contains `"2 tin"`, `"1 ID khong tim thay"`, `"999"` |
| `batch_review_market_messages MCP tool — with note` | AC-12 | Text ends `"Note saved."`; row has `verdict_note = "false alarm"` |
| `batch_review_market_messages MCP tool — all not found` | edge | Returns `"Khong tim thay bat ky tin nhan nao."` |
| `batch_review_market_messages MCP tool — invalid verdict error` | edge | Returns `"Error in batch review: Invalid verdict"` |

All tests must compile (TypeScript valid) but fail because `getMarketMessageDigest`, `batchReviewMarketMessages`, `handleGetMarketMessageDigest`, `handleBatchReviewMarketMessages` do not yet exist in their respective modules.

#### Acceptance Criteria

**Given** `src/__tests__/1168-market-message-digest.test.ts` exists with all 22 test cases
**When** `bun test src/__tests__/1168-market-message-digest.test.ts` is run before tasks 1169–1170 are done
**Then**
- All 22 test cases exist and are syntactically valid TypeScript
- Tests fail (red) because `getMarketMessageDigest`, `batchReviewMarketMessages` are not yet exported from `marketMessageStore.ts` and handlers are not yet exported from `marketMessageTools.ts`
- `bun tsc --noEmit` passes (imports forward-declared or typed correctly)

---

### Task 1169 — Add getMarketMessageDigest + batchReviewMarketMessages to marketMessageStore.ts

**Branch**: `task/1168-market-message-digest`
**Layer**: infrastructure
**Depends on**: 1168 ✓

#### Files to read first

- `src/infrastructure/db/marketMessageStore.ts` — full file: existing `reviewMarketMessage` UPDATE SQL (column name is `reviewed_at`), `insertMarketMessage` pattern, existing exported interfaces
- `src/infrastructure/db/schema.ts` — confirm `market_messages` DDL column names (`verdict`, `verdict_note`, `reviewed_at`, `sent_at`, `from_agent`, `content`, `id`)
- `src/infrastructure/db/telegramReportStore.ts` — `db.transaction()` pattern to replicate for batch

#### Files to modify

- MODIFY: `src/infrastructure/db/marketMessageStore.ts` — add two interfaces and two exported functions

#### New exports to add

**Interfaces** (add before the function declarations):

```typescript
export interface MarketMessageDigestEntry {
  date: string;
  from_agent: string;
  count: number;
  ids: number[];
  preview: string;
}

export interface BatchReviewResult {
  updated: number;
  notFound: number[];
}
```

**`getMarketMessageDigest`** — SQL with clamping:

```typescript
export function getMarketMessageDigest(
  db: Database,
  limit_days?: number,
): MarketMessageDigestEntry[] {
  const days = Math.min(30, Math.max(1, limit_days ?? 7));
  // SQL: GROUP BY date(sent_at), from_agent — see TECH_069.md for full query
  // Post-query: row.id_list.split(",").map(Number) → ids array
  // Null guard: (row.id_list ?? "").split(",").map(Number).filter(Boolean)
}
```

Full SQL (copy verbatim from `docs/TECH_069.md` Interface Contracts section).

**`batchReviewMarketMessages`** — transaction design:

1. `if (verdict !== "signal" && verdict !== "noise") throw new Error("Invalid verdict");`
2. `if (ids.length === 0) return { updated: 0, notFound: [] };`
3. Prepare UPDATE statement once outside the transaction closure
4. Execute `db.transaction(...)` iterating over ids, tracking `changes > 0`
5. Return `{ updated, notFound }`

Full implementation (copy verbatim from `docs/TECH_069.md` Interface Contracts section).

#### Acceptance Criteria

**Given** both functions and interfaces are exported from `marketMessageStore.ts`
**When** `bun test src/__tests__/1168-market-message-digest.test.ts` is run (store-level tests only)
**Then**
- All store-level test groups pass (AC-1 through AC-7 + edge cases for store functions)
- MCP tool test groups still fail (handlers not yet implemented — expected)
- `bun tsc --noEmit` reports 0 errors
- `bun test` (full suite) shows no regressions in prior tests

---

### Task 1170 — Add MCP tool handlers + register two new tools in marketMessageTools.ts

**Branch**: `task/1168-market-message-digest`
**Layer**: interface
**Depends on**: 1169 ✓

#### Files to read first

- `src/interface/mcp/tools/marketMessageTools.ts` — full file: existing `handleGetUnreviewedMarketMessages`, `handleReviewMarketMessage` handler pattern to replicate; existing `registerMarketMessageTools` function signature
- `src/interface/mcp/tools/registry.ts` — confirm `registerMarketMessageTools(server)` is already called; confirm no new registry entry is needed
- `docs/TECH_069.md` — handler formatting logic and Zod schemas (copy verbatim)

#### Files to modify

- MODIFY: `src/interface/mcp/tools/marketMessageTools.ts` — add two handler exports + two tool registrations inside existing `registerMarketMessageTools`

#### Do NOT modify

- `src/interface/mcp/tools/registry.ts` — already calls `registerMarketMessageTools(server)`; no change needed

#### New exports to add

**`handleGetMarketMessageDigest`** — formatting logic (copy verbatim from `docs/TECH_069.md`):
- Call `getMarketMessageDigest(db, days)`
- Empty state: return `"Khong co tin nhan chua review trong ${days} ngay qua."`
- Non-empty: build header, per-date/per-agent lines with count + ids + preview, footer with total count

**`handleBatchReviewMarketMessages`** — try/catch wrapping `batchReviewMarketMessages`:
- Error path: return `"Error in batch review: ${msg}"`
- All found: return `"${updated} tin da duoc danh gia la '${verdict}'.${noteText}"`
- Partial notFound: append `"${notFound.length} ID khong tim thay: [${notFound.join(', ')}]"`
- All not found: return `"Khong tim thay bat ky tin nhan nao. IDs: [${notFound.join(', ')}]."`

**Tool registrations** (append inside `registerMarketMessageTools`, after Sprint 068 registrations):

```typescript
server.tool("get_market_message_digest", "...", { limit_days: z.coerce.number()... }, ...)
server.tool("batch_review_market_messages", "...", { ids: z.array(...)..., verdict: z.enum(...)..., note: z.string()... }, ...)
```

Full Zod schemas: copy verbatim from `docs/TECH_069.md` MCP tool Zod schemas section.

#### Acceptance Criteria

**Given** both handlers are exported and both tools are registered in `marketMessageTools.ts`
**When** `bun test src/__tests__/1168-market-message-digest.test.ts` is run
**Then**
- All 22 test cases pass (green phase complete)
- `bun test` (full suite) passes with 0 failures
- `bun tsc --noEmit` reports 0 errors
- `grep "server.tool" src/interface/mcp/tools/marketMessageTools.ts` returns 4 matches (2 from Sprint 068 + 2 new)

---

### Task 1171 — Close Task 1139: verify recordJobRun wraps, confirm Done, archive

**Branch**: main (no code changes expected; commit only if archival edit required)
**Layer**: admin
**Depends on**: none (independent, run in parallel with 1168–1170)

#### Files to read first

- `src/scheduler/jobs.ts` — grep for `recordJobRun` to confirm 4 target jobs are already wrapped
- `docs/TASKS_ARCHIVE.md` — check if Task 1139 entry already exists

#### Verification steps

1. Run `grep -n "recordJobRun" src/scheduler/jobs.ts` and confirm matches for all four jobs:
   - `franceSummaryJob` (expected line ~267)
   - `devTeamHeartbeatJob` (expected line ~274)
   - `weatherCheckJob` (expected line ~290)
   - `davPharmacyCheckJob` (expected line ~297)
2. Confirm Task 1139 row in TASKS.md already shows `Done` (TECH-069 brownfield check confirmed this).
3. Check `docs/TASKS_ARCHIVE.md` for an existing Task 1139 entry. If absent, add it.
4. No code changes to `src/scheduler/jobs.ts` are expected. If grep fails to find any of the four wraps, stop and escalate — do not silently skip.

#### Files to modify (only if archival entry is absent)

- MODIFY: `docs/TASKS_ARCHIVE.md` — add Task 1139 archival entry if not already present

#### Acceptance Criteria

**Given** the current `main` branch state
**When** `grep -n "recordJobRun" src/scheduler/jobs.ts` is run
**Then**
- Output contains matches for `franceSummaryJob`, `devTeamHeartbeatJob`, `weatherCheckJob`, `davPharmacyCheckJob` (4 matches minimum)
- Task 1139 row in TASKS.md has status `Done`
- `docs/TASKS_ARCHIVE.md` contains an entry for Task 1139
- `bun test` passes with 0 failures (no regression)
- `bun tsc --noEmit` reports 0 errors

---

### Task 1172 — Sprint close: advance project-stats.json to sprint 069, toolCount 95

**Branch**: `task/1168-market-message-digest`
**Layer**: docs/data
**Depends on**: 1170 ✓, 1171 ✓

#### Files to read first

- `docs/data/project-stats.json` — current values: `currentSprint`, `toolCount`, `lastUpdated`
- `src/interface/mcp/tools/` — grep `server.tool(` across all tool files to verify total count is 95 before writing

#### Verification before writing

Run `grep -r "server\.tool(" src/interface/mcp/tools/ | wc -l` to confirm the count matches 95 (93 existing + 2 new from task 1170). If the count does not match 95, investigate before updating `toolCount`.

#### Files to modify

- MODIFY: `docs/data/project-stats.json` — set `currentSprint` to `69`, `toolCount` to `95`, update `lastUpdated` to today's date

#### Acceptance Criteria

**Given** tasks 1168–1171 are all Done and branch `task/1168-market-message-digest` is merged to `main`
**When** `docs/data/project-stats.json` is updated and the branch is merged
**Then**
- `project-stats.json` `currentSprint` = `69`
- `project-stats.json` `toolCount` = `95`
- `project-stats.json` `lastUpdated` = `2026-04-13` (or the actual date of completion)
- `bun test` passes with 0 failures
- `bun tsc --noEmit` reports 0 errors
- Branch `task/1168-market-message-digest` is deleted locally and remotely
- `git branch --show-current` = `main`

---

## Sprint 068 — MARKET Message Quality Review System (COMPLETE)

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| REQ-068 | BA: write REQ_068.md — exact DDL for market_messages table, sendTelegramMarket() modification contract (INSERT signature, from_agent/message_type derivation), tool param schemas for get_unreviewed_market_messages + review_market_message, migration strategy, acceptance criteria | BA | — | — | — | Done |
| TECH-068 | Architect: write TECH_068.md — implementation plan for tasks 1163-1167, DDD layer map, test scaffold outline | Architect | — | REQ-068 | — | Done |
| PM-068 | PM: sprint planning — create tasks 1163-1167 in TASKS.md, assign to Developer, set branch name | PM | — | TECH-068 | — | Done |
| 1163 | TDD: write failing tests for AC-1 to AC-12 in `src/__tests__/1163-market-message-review.test.ts` | Developer | tests | TECH-068 ✓ | task/1163-market-message-review | Done |
| 1164 | Add `market_messages` DDL to `schema.ts` + create `marketMessageStore.ts` (insertMarketMessage, getUnreviewedMarketMessages, reviewMarketMessage) | Developer | infrastructure | 1163 | task/1163-market-message-review | Done |
| 1165 | Modify `sendTelegramMarket()` to accept and use `persist` option + update `notifyTelegramAlert`, `sendTelegram` alias, and 8 scheduler/interface call sites | Developer | infrastructure/scheduler/interface | 1164 | task/1163-market-message-review | Done |
| 1166 | Create `marketMessageTools.ts` + register `get_unreviewed_market_messages` and `review_market_message` in `registry.ts` | Developer | interface | 1165 | task/1163-market-message-review | Done |
| 1167 | Merge + sprint close: merge branch, update project-stats.json, archive tasks | Developer | docs/data | 1166 | task/1163-market-message-review | Done |

**WIP state:** 0 tasks In Progress. Sprint 068 COMPLETE 2026-04-13. All tasks Done.

---

### Task 1163 — TDD: write failing tests for AC-1 to AC-12

**Branch**: `task/1163-market-message-review`
**Layer**: tests
**Depends on**: TECH-068 (approved design)

#### Files to read first

- `src/infrastructure/db/schema.ts` — locate `initDatabase()`, understand the established `db.exec()` block pattern and the header comment listing all tables
- `src/__tests__/002-db-schema.test.ts` — established `:memory:` + `initDatabase()` + `closeDb()` pattern to copy exactly
- `src/__tests__/188-alert-digest.test.ts` — second reference for in-memory DB test isolation pattern

#### Files to create

- CREATE: `src/__tests__/1163-market-message-review.test.ts`

#### Test groups to write (all must fail on first commit — red phase)

Write the following `describe` blocks in order. Every test must compile but fail because the referenced modules (`marketMessageStore.ts`, updated `telegram.ts`, `marketMessageTools.ts`) do not yet exist:

1. `market_messages table creation` — `PRAGMA table_info` returns 9 columns; `PRAGMA index_list` returns 4 indexes; second `initDatabase()` call does not throw
2. `insertMarketMessage` — insert returns id >= 1; SELECT row matches params; `sent_at` is a valid datetime string; verdict and reviewed_at are null
3. `getUnreviewedMarketMessages ordering` — 3 rows (2 unreviewed, 1 reviewed); query returns 2 rows in DESC sent_at order; reviewed row excluded
4. `getUnreviewedMarketMessages ticker filter` — 3 unreviewed rows with different tickers; `ticker="VCB"` returns exactly 1 row
5. `getUnreviewedMarketMessages empty state` — all rows have non-null verdict; function returns `[]`
6. `reviewMarketMessage success` — sets verdict, verdict_note, non-null reviewed_at on target row; returns `true`
7. `reviewMarketMessage idempotent` — second call overwrites verdict; no error thrown; returns `true`
8. `reviewMarketMessage unknown id` — returns `false`; no exception
9. `reviewMarketMessage invalid verdict` — throws `Error("Invalid verdict")`
10. `sendTelegramMarket persist on success` — mock fetchFn returning `{ ok: true }`; one row inserted with correct from_agent and content
11. `sendTelegramMarket no persist on failure` — mock fetchFn returning `{ ok: false, status: 400 }`; zero rows in market_messages
12. `sendTelegramMarket backward compat (no persist)` — calling without persist option inserts row with from_agent="unknown", message_type="unknown", ticker=null
13. `get_unreviewed_market_messages MCP tool — rows exist` — JSON array, newest first, correct structure
14. `get_unreviewed_market_messages MCP tool — empty` — returns bilingual plain-text string
15. `get_unreviewed_market_messages MCP tool — ticker filter` — `ticker="VCB"` returns only VCB row
16. `review_market_message MCP tool — success with note` — returns `"Message N labelled as 'noise'. Note saved."`
17. `review_market_message MCP tool — success without note` — returns `"Message N labelled as 'signal'."` (no trailing note)
18. `review_market_message MCP tool — idempotent` — returns success; row overwritten
19. `review_market_message MCP tool — unknown id` — returns `"Message 999 not found."`

**Test isolation rule**: set `process.env["DB_PATH"] = ":memory:"` before all imports. Call `closeDb()` in `afterAll`. Call `initDatabase()` in `beforeAll`. This matches `002-db-schema.test.ts` exactly.

**MCP tool testing pattern**: export testable handler functions from `marketMessageTools.ts` alongside `registerMarketMessageTools`. Call those handler functions directly in tests with the in-memory DB already initialised — do not call `server.tool()` in tests.

#### Acceptance Criteria

**Given** `src/__tests__/1163-market-message-review.test.ts` exists with all 19 test cases
**When** `bun test src/__tests__/1163-market-message-review.test.ts` is run before tasks 1164-1166 are done
**Then**
- All 19 test cases exist and are syntactically valid TypeScript
- Tests fail (red) because `marketMessageStore.ts` and `marketMessageTools.ts` do not yet exist
- `bun tsc --noEmit` passes (imports typed correctly via `import type` or forward declarations where needed)

---

### Task 1164 — Add market_messages DDL to schema.ts + create marketMessageStore.ts

**Branch**: `task/1163-market-message-review` (same branch, continued)
**Layer**: infrastructure
**Depends on**: 1163 (test file committed, all tests red)

#### Files to read first

- `src/infrastructure/db/schema.ts` — locate the last `db.exec()` block (after `vps_push_log` block) and the header comment listing all tables; find the established comment-banner pattern
- `src/infrastructure/db/telegramReportStore.ts` — structural reference for the new `marketMessageStore.ts` (mirrored pattern)
- `src/__tests__/002-db-schema.test.ts` — understand what the schema test asserts so the new DDL does not break existing assertions

#### Files to create / modify

- MODIFY: `src/infrastructure/db/schema.ts` — add the `market_messages` DDL block after the last existing `db.exec()` block; update the header comment to include `market_messages` in the "Tables created" list
- CREATE: `src/infrastructure/db/marketMessageStore.ts`

#### Exact DDL to insert in schema.ts

```sql
-- ── Market Messages (Sprint 068) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  from_agent   TEXT    NOT NULL,
  message_type TEXT    NOT NULL,
  ticker       TEXT,
  content      TEXT    NOT NULL,
  sent_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  verdict      TEXT,
  verdict_note TEXT,
  reviewed_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_mm_sent_at    ON market_messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_mm_from_agent ON market_messages(from_agent);
CREATE INDEX IF NOT EXISTS idx_mm_verdict    ON market_messages(verdict);
CREATE INDEX IF NOT EXISTS idx_mm_ticker     ON market_messages(ticker);
```

#### marketMessageStore.ts public surface

Export the following types and functions (exact signatures from TECH-068):
- `MarketMessageAgent` union type (12 values including `"unknown"`)
- `MarketMessageType` union type (12 values including `"unknown"`)
- `MarketMessageRow` interface (9 fields)
- `insertMarketMessage(db, params): number` — wrapped in try/catch; returns 0 on failure
- `getUnreviewedMarketMessages(db, limit?, ticker?): MarketMessageRow[]` — limit clamped 1-100, default 20; two SQL variants (with/without ticker)
- `reviewMarketMessage(db, id, verdict, note?): boolean` — validates verdict is `"signal"` or `"noise"`, throws `Error("Invalid verdict")` for any other value

Use `db.prepare(...).run(...)` for INSERT. Obtain rowid via `.lastInsertRowid`. All three query functions use parameterized `?` placeholders — never string-interpolate user input.

#### Acceptance Criteria

**Given** `schema.ts` updated and `marketMessageStore.ts` created
**When** `bun test src/__tests__/1163-market-message-review.test.ts` is run
**Then**
- Test groups 1-9 (table creation + store functions) pass (green)
- Test groups 10-19 (telegram persist + MCP tools) still fail (not yet implemented)
- `bun tsc --noEmit` reports 0 errors
- Existing schema tests (`002-db-schema.test.ts`) continue to pass

---

### Task 1165 — Modify sendTelegramMarket() persist option + 10 call site migrations

**Branch**: `task/1163-market-message-review` (same branch, continued)
**Layer**: infrastructure / scheduler / interface
**Depends on**: 1164 (marketMessageStore.ts exists and store tests pass)

#### Files to read first

- `src/infrastructure/notifiers/telegram.ts` — locate `sendTelegramMarket()`, `sendTelegram()` alias, `notifyTelegramAlert()`, `SendTelegramOptions` interface, `TelegramNotifier` interface; understand the `sendTelegramBug()` post-send DB block (exact pattern to mirror)
- `src/scheduler/morningBriefingJob.ts` lines 250-265 — locate the chunked send loop to understand the full-text-before-split structural tension (documented in TECH-068 Risk Assessment)

#### Files to modify

- MODIFY: `src/infrastructure/notifiers/telegram.ts` — extend `SendTelegramOptions` with optional `persist` field; add post-send DB block to `sendTelegramMarket()`; update `sendTelegram()` alias; update `notifyTelegramAlert()`; update `TelegramNotifier` interface
- MODIFY: `src/scheduler/morningBriefingJob.ts` — call `insertMarketMessage` once with full `text` before the chunk loop; do NOT pass `persist` to the `sendTelegramMarket` calls inside the loop
- MODIFY: `src/scheduler/eveningSummaryJob.ts` — add `persist` to `sendTelegramMarket` call
- MODIFY: `src/scheduler/franceSummaryJob.ts` — add `persist` to `sendTelegramMarket` call
- MODIFY: `src/scheduler/patternWatchJob.ts` — extract ticker via `/\b([A-Z]{2,4})\b/` regex before the send call; add `persist` with extracted ticker
- MODIFY: `src/scheduler/calibrationReportJob.ts` — add `persist` ONLY to the MARKET path (line ~370); do NOT touch the WORK path (`sendTelegramWork` call)
- MODIFY: `src/scheduler/weeklyPortfolioReportJob.ts` — add `persist` to `sendTelegramMarket` call
- MODIFY: `src/scheduler/weatherCheckJob.ts` — add `persist` to `sendTelegramMarket` call
- MODIFY: `src/interface/mcp/tools/telegramTools.ts` — add `persist` to `sendTelegramMarket` call on the `market` branch only
- MODIFY: `src/interface/mcp/server.ts` — add `persist` to the three `sendTelegramMarket` call sites (lines ~318, ~562, ~599)

#### Key implementation details

`sendTelegramMarket()` post-send block (insert after `const result = await coreSend(...)`):
```typescript
if (result.ok) {
  try {
    const db = getDb();
    insertMarketMessage(db, {
      from_agent: options.persist?.from_agent ?? "unknown",
      message_type: options.persist?.message_type ?? "unknown",
      ticker: options.persist?.ticker ?? null,
      content: text,
    });
  } catch (persistErr) {
    log.warn("[telegram] insertMarketMessage failed — message was sent but not persisted", {
      error: persistErr instanceof Error ? persistErr.message : String(persistErr),
    });
  }
}
return result.ok;
```

`sendTelegram()` alias update:
```typescript
export async function sendTelegram(text: string): Promise<boolean> {
  return sendTelegramMarket(text, {
    persist: { from_agent: "alert-digest", message_type: "alert_digest" },
  });
}
```

`morningBriefingJob.ts` chunking fix: call `insertMarketMessage(getDb(), { from_agent: "morning-briefing", message_type: "morning_briefing", ticker: null, content: text })` once before the chunk loop. The `sendTelegramMarket` calls inside the loop must NOT carry a `persist` option.

`calibrationReportJob.ts` caution: only the MARKET channel send path receives `persist`. The WORK path (`sendTelegramWork`) must not be modified.

#### Acceptance Criteria

**Given** all 10 call sites updated and `telegram.ts` modified
**When** `bun test src/__tests__/1163-market-message-review.test.ts` is run
**Then**
- Test groups 1-12 (store + telegram persist) pass (green)
- Test groups 13-19 (MCP tools) still fail (not yet implemented)
- `bun tsc --noEmit` reports 0 errors
- `bun test` full suite: no regressions in existing tests

---

### Task 1166 — Create marketMessageTools.ts + register in registry.ts

**Branch**: `task/1163-market-message-review` (same branch, continued)
**Layer**: interface
**Depends on**: 1165 (telegram persist tests pass)

#### Files to read first

- `src/interface/mcp/tools/calibrationTools.ts` — exact pattern for `getDb()` lazy call at invocation time; `server.tool()` registration structure
- `src/interface/mcp/tools/insiderTools.ts` — second pattern reference (db-injectable store functions)
- `src/interface/mcp/tools/registry.ts` — locate where to add `registerMarketMessageTools` call

#### Files to create / modify

- CREATE: `src/interface/mcp/tools/marketMessageTools.ts`
- MODIFY: `src/interface/mcp/tools/registry.ts` — add `registerMarketMessageTools(server)` call

#### marketMessageTools.ts structure

Export `registerMarketMessageTools(server: McpServer): void` that registers two tools:

**Tool 1: `get_unreviewed_market_messages`**
- Params: `limit` (z.coerce.number, 1-50, default 20), `ticker` (z.string optional)
- Calls `getUnreviewedMarketMessages(getDb(), limit, ticker ?? null)`
- When rows exist: returns `JSON.stringify(rows, null, 2)` as text content
- When empty: returns `"Khong co tin nhan chua review. Tat ca da duoc danh gia."`

**Tool 2: `review_market_message`**
- Params: `id` (z.coerce.number, min 1), `verdict` (z.enum(["signal","noise"])), `note` (z.string optional)
- Calls `reviewMarketMessage(getDb(), id, verdict, note ?? null)`
- When `true` (found): returns `"Message {id} labelled as '{verdict}'.{note ? ' Note saved.' : ''}"`
- When `false` (not found): returns `"Message {id} not found."`
- On exception: returns `"Error reviewing message {id}: {error.message}"`

Also export testable handler functions (for use in tests without MCP server setup):
- `handleGetUnreviewedMarketMessages(params, db): string`
- `handleReviewMarketMessage(params, db): string`

This export pattern allows tests to call handlers directly, matching `168-prediction-mcp-tool.test.ts` pattern.

#### Acceptance Criteria

**Given** `marketMessageTools.ts` created and `registry.ts` updated
**When** `bun test src/__tests__/1163-market-message-review.test.ts` is run
**Then**
- All 19 test groups pass (full green)
- `bun tsc --noEmit` reports 0 errors
- `bun test` full suite: all previously passing tests continue to pass
- Both new tools appear in the MCP tool list (verify via `curl http://localhost:3000/health` or by reading registry.ts)

---

### Task 1167 — Advance project-stats.json currentSprint to 68

**Branch**: `task/1163-market-message-review` (same branch, continued)
**Layer**: docs/data
**Depends on**: 1166 (all 19 tests green, full suite passing)

#### Files to modify

- MODIFY: `docs/data/project-stats.json` — set `currentSprint` to `68`; update `lastUpdated` to today's date (`2026-04-13`)

#### Acceptance Criteria

**Given** all tasks 1163-1166 are complete and `bun test` is green
**When** `docs/data/project-stats.json` is updated
**Then**
- `currentSprint` field equals `68`
- `lastUpdated` field equals `"2026-04-13"`
- `bun tsc --noEmit` reports 0 errors
- `bun test` exits 0 with no failures (AC-12 from REQ-068 satisfied)
- Branch `task/1163-market-message-review` is merged to main and deleted (local + remote)

---

## Sprint 067 — Morning Briefing Intelligence Enrichment (COMPLETE)

Vision: `SPRINT_GOAL.md`
Spec: `docs/REQ_067.md`
Tech: `docs/TECH_067.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| REQ-067 | BA: write REQ_067.md — exact DB queries, field names, section format strings, type extensions for BriefingResult, acceptance criteria | BA | — | — | — | Done |
| TECH-067 | Architect: write TECH_067.md — implementation plan for tasks 1159-1162, DDD layer map, test scaffold outline | Architect | — | REQ-067 | — | Done |
| 1159 | TDD: write failing tests for all 3 new briefing sections (AC-1 through AC-6) in `src/__tests__/1159-morning-briefing-enrichment.test.ts` | Developer | tests | TECH-067 ✓ | task/1159-morning-briefing-enrichment | Done |
| 1160 | Extend `DailyBriefing` type + add 3 exported row types + `BEARISH_WARNING_THRESHOLD` constant + 3 query helpers + Steps 14-16 in `assembleBriefing.ts` (FR-1 to FR-4) | Developer | application | 1159 | task/1159-morning-briefing-enrichment | Done |
| 1161 | Render 3 new Telegram sections (Insider Mới, Dòng Tiền Ngoại, Tích Lũy Bằng Chứng) in `morningBriefingJob.ts`; import `BEARISH_WARNING_THRESHOLD` from `assembleBriefing.ts` (FR-5) | Developer | interface/scheduler | 1160 | task/1159-morning-briefing-enrichment | Done |
| 1162 | Advance `docs/data/project-stats.json` currentSprint to 67, update lastUpdated to today | Developer | docs/data | 1161 | task/1159-morning-briefing-enrichment | Done |

**WIP state:** 0 tasks In Progress. Sprint 067 COMPLETE 2026-04-13. All 6 tasks Done. 31 tests pass, bun tsc --noEmit clean.

---

## Sprint 066 — Code Hygiene: process.env Purge + Test Encoding Fix (COMPLETE)

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1155 | Replace process.env with Bun.env in server.ts (8 occurrences) + systemTools.ts (4 occurrences) + telegram.ts (1 occurrence) | Developer | interface/infrastructure | — | task/1155-bun-env-purge | Done |
| 1156 | Replace process.env with Bun.env in index.ts (6 Telegram + 1 TELEGRAM_ENABLED + LanceDB shims) + logger.ts (2 occurrences) | Developer | infrastructure | — | task/1155-bun-env-purge | Done |
| 1157 | Fix 3 failing /ask tests in 238-user-requests.test.ts — update assertions to accented Vietnamese output | Developer | tests | — | task/1157-ask-encoding-fix | Done |
| 1158 | Advance project-stats.json currentSprint 65 → 66, update lastUpdated | Developer | docs/data | 1155, 1156, 1157 | task/1155-bun-env-purge | Done |

**WIP state:** 0 tasks In Progress. Sprint 066 COMPLETE 2026-04-12. All 4 tasks Done. bun tsc --noEmit clean, 3 new tests pass.

**Parallelism:** Tasks 1155 + 1157 are fully independent — start both in parallel. 1156 can batch with 1155 on the same branch. 1158 is the final close-out task.

---

## Sprint 065 — Prediction Claim Resolution Loop (COMPLETE — archive pending)

Vision: `SPRINT_GOAL.md`
Spec: `docs/REQ_065.md`
Tech: `docs/TECH_065.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| REQ-065 | BA: write REQ_065.md — exact schema changes, tool param additions, resolution logic, acceptance criteria | BA | — | — | — | Done |
| TECH-065 | Architect: review REQ_065.md, produce TECH_065.md with exact code changes for all 4 files | Architect | — | REQ-065 | — | Done |
| 1150 | FR-2 (DDL): ALTER TABLE migration for creation_price in schema.ts | Developer | infrastructure | TECH-065 | task/1150-prediction-resolution-loop | Done |
| 1151 | FR-2 (store): PredictionClaimInput/Row/ClaimDbRow interfaces + INSERT update in predictionClaimStore.ts | Developer | infrastructure | 1150 | task/1150-prediction-resolution-loop | Done |
| 1152 | FR-3 + FR-4: Fix evaluateOutcome() + pass creation_price in predictionResolutionJob.ts | Developer | scheduler | 1151 | task/1150-prediction-resolution-loop | Done |
| 1153 | FR-1: Add direction + expected_move_pct + price lookup to create_prediction_claim tool in evidenceTools.ts | Developer | interface | 1151 | task/1150-prediction-resolution-loop | Done |
| 1154 | Tests: 1154-prediction-resolution-loop.test.ts — AC-1 through AC-7 | Developer | — | 1152, 1153 | task/1150-prediction-resolution-loop | Done |

**WIP state:** 0 tasks In Progress. Sprint 065 COMPLETE 2026-04-12. All 7 tasks (REQ-065, TECH-065, 1150-1154) Done. 29 tests pass, bun tsc --noEmit clean. Merged to main via task/1150-prediction-resolution-loop.

---

## Sprint 064 — Knowledge Sync: Align Agent Tool Maps with 91-Tool Reality (COMPLETE — archive pending)

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| REQ-064 | BA: write REQ_064.md — exact tool additions per agent, change matrix | BA | — | — | — | Done |
| TECH-064 | Architect: review REQ_064, confirm no code changes needed | Architect | — | REQ-064 | — | Done |
| 1148 | Update mcp-tools.md agent tool tables: add 9 new tools to correct agent rows + add Agent 08 row | Developer | docs | TECH-064 | task/1148-mcp-tools-sync | Done |
| 1149 | Verify 08-prediction-synthesizer.md tool list matches updated mcp-tools.md | Developer | docs | 1148 | task/1148-mcp-tools-sync | Done |

**WIP state:** 0 tasks In Progress. Sprint 064 COMPLETE 2026-04-13. All 4 tasks (REQ-064, TECH-064, 1148, 1149) Done. Delivered in commit 882d507 — documentation-only sprint, no code changes needed.

---

## Sprint 063 — Task 1135 Unblock + Insider Transaction Detection (COMPLETE — archive pending)

Vision: `SPRINT_GOAL.md`
Spec: `docs/REQ_063.md`
Tech: `docs/TECH_063.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| REQ-063 | BA: write REQ_063.md for insider transactions + 1135 unblock | BA | — | — | — | Done |
| TECH-063 | Architect: review REQ_063, produce TECH_063.md | Architect | — | REQ-063 | — | Done |
| PM-063 | PM: sprint planning — break TECH_063 into tasks 1141+, assign batches | PM | — | TECH-063 | — | Done |
| 1141 | FR-3: insider_transactions DDL in initDatabase() + indexes + test | Developer | infrastructure | — | task/1141-insider-ddl | Done |
| 1142 | FR-1: VPS script foreign flow step with env-var field names + test notes | Developer | infrastructure | — | task/1142-vps-foreign-flow | Done |
| 1143 | FR-5: Refactor insiderCheckJob — remove Telegram, add streak detection + insertAlert + evidenceFragment + test | Developer | domain/infrastructure | 1141 ✓ | task/1143-insider-check-fix | Done |
| 1144 | FR-2: GET /api/foreign-flow-status diagnostic endpoint + test | Developer | interface | — | task/1144-foreign-flow-status | Done |
| 1145 | FR-4: Register insiderCheck cron in jobs.ts + recordJobRun wrap + test | Developer | interface/scheduler | 1141 ✓, 1143 ✓ | task/1143-insider-check-fix | Done |
| 1146 | FR-6: get_insider_transactions MCP tool + insiderStore date-filter + test | Developer | interface/infrastructure | 1141 ✓ | task/1146-get-insider-transactions | Done |
| 1147 | FR-counts: Update project-stats.json (toolCount 91) + cron-registry.json | Developer | docs/data | 1145 ✓, 1146 ✓ | task/1147-counts-update | Done |

**WIP state:** 0 tasks In Progress. Sprint 063 COMPLETE 2026-04-13. All 7 tasks (1141-1147) + BA/Architect/PM tasks Done.

**Parallelism notes:**
- Batch A (no deps, start immediately): 1141, 1142, 1144 — all three are independent. Load WIP slots with 1141 + 1142 first (Track B DDL and Track A VPS script). 1144 can start when a slot opens.
- Batch B (depends on 1141): 1143 (Track B job refactor) and 1146 (MCP tool) can run in parallel once 1141 is done.
- Batch C (depends on 1141 + 1143): 1145 (cron registration) unblocks after both are merged.
- Batch D (depends on 1145 + 1146): 1147 (counts update) is the final task.

---

### Task 1141 — FR-3: insider_transactions DDL in initDatabase() + indexes + test

**Branch**: `task/1141-insider-ddl`
**Layer**: infrastructure
**Depends on**: none (Batch A — start immediately)

#### Files to read first

- `src/infrastructure/db/schema.ts` — find the `vps_push_log` block (around line 840) to locate the insertion point; read the "Tables created" header comment at the top of the file

#### Files to create / modify

- MODIFY: `src/infrastructure/db/schema.ts` — add `insider_transactions` DDL after the `vps_push_log` block; update header comment to add `insider_transactions` to the "Tables created" list
- CREATE: `src/__tests__/1141-insider-ddl.test.ts`

#### Exact DDL to insert (after vps_push_log block)

```typescript
// ── Insider Transactions (Task 1141 / Sprint 063) ─────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS insider_transactions (
    id                  TEXT PRIMARY KEY,
    code                TEXT NOT NULL,
    insider_name        TEXT NOT NULL,
    position            TEXT NOT NULL,
    type                TEXT NOT NULL CHECK(type IN ('buy','sell','other')),
    registered_volume   INTEGER NOT NULL DEFAULT 0,
    executed_volume     INTEGER NOT NULL DEFAULT 0,
    price               REAL NOT NULL DEFAULT 0,
    from_date           TEXT NOT NULL,
    to_date             TEXT NOT NULL,
    fetched_at          TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_it_code_from_date
    ON insider_transactions(code, from_date DESC);
  CREATE INDEX IF NOT EXISTS idx_it_type_from_date
    ON insider_transactions(type, from_date DESC);
`);
```

#### Acceptance Criteria

**Given** a fresh in-memory SQLite database
**When** `initDatabase()` is called
**Then**
- `SELECT name FROM sqlite_master WHERE type='table' AND name='insider_transactions'` returns one row (not null)
- `idx_it_code_from_date` index exists in `sqlite_master`
- `idx_it_type_from_date` index exists in `sqlite_master`
- `insertInsiderTransaction(db, validRow)` succeeds without throwing
- `bun test src/__tests__/1141-insider-ddl.test.ts` exits 0
- `bun tsc --noEmit` exits 0

---

### Task 1142 — FR-1: VPS script foreign flow step with env-var field names + test notes

**Branch**: `task/1142-vps-foreign-flow`
**Layer**: infrastructure (VPS shell script — outside Bun process)
**Depends on**: none (Batch A — parallelisable with 1141)

#### Files to read first

- `vps-scripts/fetch-prices.sh` — locate Step 2 block (VN stocks fetch, holding `$VN_DATA`) and Step 3 block (VN indices); the new Step 2b inserts between them

#### Files to create / modify

- MODIFY: `vps-scripts/fetch-prices.sh` — insert Step 2b block between Step 2 and Step 3
- CREATE: `src/__tests__/1142-fetch-prices-foreign-flow.test.ts` — shell integration test notes (document the manual test procedure; bun test file documents the expected log output pattern)

#### Step 2b block to insert (see TECH_063.md Task 1142 section for full shell code)

Key behaviours:
- Reads `FOREIGN_FLOW_FBUY_FIELD`, `FOREIGN_FLOW_FSELL_FIELD` (default `fsellVol`), `FOREIGN_FLOW_FROOM_FIELD` (default `currentRoom`) from environment
- If `FOREIGN_FLOW_FBUY_FIELD` is unset, logs `WARN: FOREIGN_FLOW_FBUY_FIELD not set, skipping foreign flow push` and skips gracefully
- Uses `$VN_DATA` from Step 2 — no second API call
- Computes `foreign_volume = (.[$fbuy] // 0) - (.[$fsell] // 0)` via `jq`
- POSTs `ForeignFlowUpsertItem[]` to `$MCP_BASE_URL/api/push-foreign-flow` with `X-API-Key` header
- Logs `FOREIGN_FLOW: N items pushed → $FF_RESP`

#### Acceptance Criteria

**Given** `FOREIGN_FLOW_FBUY_FIELD` is NOT set on the VPS host
**When** the script runs
**Then**
- The log contains `WARN: FOREIGN_FLOW_FBUY_FIELD not set, skipping foreign flow push`
- No POST to `/api/push-foreign-flow` is attempted
- Script exits normally (price push still completes)

**Given** `FOREIGN_FLOW_FBUY_FIELD=fbuyVol` and `FOREIGN_FLOW_FSELL_FIELD=fsellVol` are set
**When** the script runs with non-empty `$VN_DATA`
**Then**
- `jq` extracts foreign flow fields using the configured names (null-coalesced to 0 if absent)
- A POST is made with a non-empty `ForeignFlowUpsertItem[]` array
- Log line `FOREIGN_FLOW: N items pushed` appears with N > 0
- `bun tsc --noEmit` exits 0 (test file only has type annotations)

---

### Task 1143 — FR-5: Refactor insiderCheckJob — remove Telegram, add streak detection + insertAlert + evidenceFragment + test

**Branch**: `task/1143-insider-check-job-refactor`
**Layer**: domain (streak logic) / infrastructure (alert + evidence writes)
**Depends on**: 1141 (insider_transactions table must exist before job can read/write it)

#### Files to read first

- `src/scheduler/insiderCheckJob.ts` — full file: locate Step 5 (direct Telegram send), existing imports, `allAlerts` construction
- `src/infrastructure/db/evidenceFragmentStore.ts` — `insertEvidenceFragment` signature
- `src/infrastructure/db/alertStore.ts` — `insertAlert` signature (or confirm inline INSERT pattern from foreignFlowAlertJob.ts)
- `src/scheduler/foreignFlowAlertJob.ts` — reference pattern for `insertAlert` + `insertEvidenceFragment` usage

#### Files to create / modify

- MODIFY: `src/scheduler/insiderCheckJob.ts` — three changes (see TECH_063.md Task 1143 section for exact code)
- CREATE: `src/__tests__/1143-insider-check-job.test.ts`

#### Three changes required

1. **Remove direct Telegram send**: delete `import { sendTelegramMarket }` and the entire Step 5 block that calls it
2. **Add streak detection helper**: add pure function `detectAccumulationStreaks(db, windowDays)` above `runInsiderCheck()` — queries `insider_transactions` for `type='buy'` with `executed_volume > 0`, groups by `code + lower(trim(position))`, returns streaks with `buyDays >= 3`
3. **Replace Step 5 with insertAlert + insertEvidenceFragment**: new Steps 5 + 6 insert evidence fragments for streaks, then insert alert rows for streaks AND significant single-buy transactions (>1% of DEFAULT_OUTSTANDING). Use `INSERT OR IGNORE` with day-scoped IDs to deduplicate within same calendar day

#### Acceptance Criteria

**Given** mock `fetchInsiderTransactions` returns buy rows for `VNM` on 3 distinct dates with `executedVolume > 0`
**When** `runInsiderCheck()` is called
**Then**
- Transactions are inserted into `insider_transactions`
- `sendTelegramMarket` is never called (verify by spy — import must be removed)
- `insertEvidenceFragment` is called with `{ stock: 'VNM', evidence_type: 'insider_accumulation', confidence: 0.85 }`
- An alert row appears in `alerts` table with `severity='high'`
- A second call on the same UTC day does NOT insert a duplicate alert row (`INSERT OR IGNORE` deduplicates by day-scoped ID)
- `sell` transactions do NOT trigger evidence fragments or alerts
- `bun test src/__tests__/1143-insider-check-job.test.ts` exits 0
- `bun tsc --noEmit` exits 0

---

### Task 1144 — FR-2: GET /api/foreign-flow-status diagnostic endpoint + test

**Branch**: `task/1144-foreign-flow-status`
**Layer**: interface (HTTP endpoint in server.ts)
**Depends on**: none (Batch B, parallelisable with 1143)

#### Files to read first

- `src/interface/mcp/server.ts` — locate the `push-foreign-flow` block (around line 663) and the `GET /api/watchlist` block that follows it; new endpoint inserts between them
- `src/infrastructure/db/schema.ts` — confirm `vps_push_log` table schema (`pushed_at`, `items_count`, `service` columns)

#### Files to create / modify

- MODIFY: `src/interface/mcp/server.ts` — insert new GET `/api/foreign-flow-status` handler after the `push-foreign-flow` block
- CREATE: `src/__tests__/1144-foreign-flow-status.test.ts`

#### Endpoint contract (see TECH_063.md Task 1144 section for full TypeScript code)

- Auth: `X-API-Key` header must match `VPS_PUSH_API_KEY` env var; returns 401 if wrong or missing
- Reads `FOREIGN_FLOW_FBUY_FIELD` / `FOREIGN_FLOW_FSELL_FIELD` / `FOREIGN_FLOW_FROOM_FIELD` from `Bun.env` (defaults: `fbuyVol`, `fsellVol`, `currentRoom`)
- Queries `vps_push_log WHERE service='foreign-flow' ORDER BY pushed_at DESC LIMIT 1`
- Queries sample row from `vnstock_trading_stats WHERE foreign_volume IS NOT NULL AND foreign_volume != 0 ORDER BY updated_at DESC LIMIT 1`
- Returns `staleSince` if last push was > 48h ago, else null
- Returns 200 even if no push has occurred yet (`lastPushSummary: null`)

#### Acceptance Criteria

**Given** no API key provided
**When** `GET /api/foreign-flow-status` is called
**Then** response is 401

**Given** valid API key + no push has occurred yet
**When** `GET /api/foreign-flow-status` is called
**Then**
- Response is 200 JSON
- `lastPushSummary` is null
- `tableRowCount` is 0
- `configuredFields.fbuyField` equals `FOREIGN_FLOW_FBUY_FIELD` env value (or default `fbuyVol`)
- `staleSince` is null

**Given** valid API key + a push occurred > 48h ago
**When** `GET /api/foreign-flow-status` is called
**Then** `staleSince` is an ISO timestamp (not null)

- `bun test src/__tests__/1144-foreign-flow-status.test.ts` exits 0
- `bun tsc --noEmit` exits 0

---

### Task 1145 — FR-4: Register insiderCheck cron in jobs.ts + recordJobRun wrap + test

**Branch**: `task/1145-insider-cron-registration`
**Layer**: interface/scheduler
**Depends on**: 1141 (DDL must exist), 1143 (job refactor must be merged — cannot register the old Telegram-violating version)

#### Files to read first

- `src/scheduler/jobs.ts` — locate: last import line (find `foreignFlowAlert` import), `CRONS` object (find `foreignFlowAlert` entry), `startScheduler()` function (find the foreignFlowAlert `cron.schedule()` block)
- `src/scheduler/insiderCheckJob.ts` — confirm `runInsiderCheck` is the exported function name after Task 1143

#### Files to create / modify

- MODIFY: `src/scheduler/jobs.ts` — add import for `runInsiderCheck`, add `insiderCheck` entry to `CRONS`, add `cron.schedule()` call in `startScheduler()`
- CREATE: `src/__tests__/1145-insider-cron-registration.test.ts`

#### Exact changes (see TECH_063.md Task 1145 section)

- Import: `import { runInsiderCheck } from './insiderCheckJob.js'`
- CRONS entry: `insiderCheck: Bun.env.CRON_INSIDER_CHECK ?? '0 1 * * *'` (01:00 UTC = 08:00 VN, Mon-Sun)
- Schedule call: wrapped in `recordJobRun(getDb(), 'insiderCheckJob', ...)` following Sprint 062 pattern
- The terminal log line already uses `Object.keys(CRONS).length` — count increments automatically

#### Acceptance Criteria

**Given** the scheduler starts
**When** `startScheduler()` is called
**Then**
- `CRONS` object contains an `insiderCheck` key
- `cron.schedule()` is called for the `insiderCheck` schedule expression
- `runInsiderCheck` is wrapped in `recordJobRun(getDb(), 'insiderCheckJob', ...)`
- `bun test src/__tests__/1145-insider-cron-registration.test.ts` exits 0
- `bun tsc --noEmit` exits 0

---

### Task 1146 — FR-6: get_insider_transactions MCP tool + insiderStore date-filter + test

**Branch**: `task/1146-get-insider-transactions`
**Layer**: interface/mcp (tool) + infrastructure/db (store extension)
**Depends on**: 1141 (insider_transactions table must exist for queries to work)

#### Files to read first

- `src/infrastructure/db/insiderStore.ts` — existing `InsiderRow` type, `getInsiderTransactions()` signature, existing imports
- `src/interface/mcp/tools/index.ts` — locate the last `register*Tools(server)` call to find the insertion point
- `src/interface/mcp/tools/foreignFlowTools.ts` — reference pattern for tool structure and `getDb()` usage

#### Files to create / modify

- MODIFY: `src/infrastructure/db/insiderStore.ts` — add `getInsiderTransactionsFiltered(db, opts)` function (see TECH_063.md Task 1146 Step 1 for full code)
- CREATE: `src/interface/mcp/tools/insiderTools.ts` — new file with `registerInsiderTools(server, resolveDb?)` export (see TECH_063.md Task 1146 Step 2 for full code)
- MODIFY: `src/interface/mcp/tools/index.ts` — add `import { registerInsiderTools } from "./insiderTools.js"` and call `registerInsiderTools(server)`
- CREATE: `src/__tests__/1146-get-insider-transactions.test.ts`

#### Tool contract summary

- Tool name: `get_insider_transactions`
- Inputs: `code?` (ticker), `days?` (1–90, default 30), `type?` ("buy"|"sell"|"all", default "all")
- If `code` omitted: queries `SELECT DISTINCT code FROM watchlist` and fetches all
- Computes `streaks` on the fly: groups buy txs by `code + lower(trim(position))`, counts distinct `from_date` values, includes groups with >= 2 distinct buy days
- Returns `{ transactions[], streaks[], totalCount, lookbackDays }`
- Results ordered by `from_date DESC`, then `code ASC`

#### Acceptance Criteria

**Given** `insider_transactions` has 3 buy rows for `VNM` on 3 distinct dates (all `executedVolume > 0`) within 30 days
**When** `get_insider_transactions({ code: "VNM" })` is called
**Then**
- `transactions` array contains all 3 rows
- `streaks` contains one entry for `VNM` with `buyDays: 3`
- `totalCount` equals `transactions.length`
- Results are ordered `from_date DESC`

**Given** no `code` param, watchlist has 2 stocks with transactions
**When** `get_insider_transactions({})` is called
**Then** transactions for both watchlist codes are returned

**Given** `days=100` (over max)
**When** tool is called
**Then** `lookbackDays` is clamped to 90

**Given** a sell-only row (executedVolume > 0)
**When** streaks are computed
**Then** the sell row does NOT appear in `streaks`

- `bun test src/__tests__/1146-get-insider-transactions.test.ts` exits 0
- `bun tsc --noEmit` exits 0

---

### Task 1147 — FR-counts: Update project-stats.json (toolCount 91) + cron-registry.json

**Branch**: `task/1147-counts-update`
**Layer**: docs/data
**Depends on**: 1145 (cron registered), 1146 (tool registered)

#### Files to read first

- `docs/data/project-stats.json` — current `toolCount` value (expected: 90)
- `docs/data/cron-registry.json` — current entries list, confirm `insiderCheck` is absent

#### Files to create / modify

- MODIFY: `docs/data/project-stats.json` — increment `toolCount` from 90 to 91
- MODIFY: `docs/data/cron-registry.json` — add `insiderCheck` entry: `{ "key": "insiderCheck", "schedule": "0 1 * * *", "description": "Daily 01:00 UTC (08:00 VN) — SSC insider transaction check + streak detection", "task": 1145, "sprint": 63 }`

#### Acceptance Criteria

**Given** Tasks 1145 and 1146 are merged to main
**When** `docs/data/project-stats.json` and `docs/data/cron-registry.json` are updated
**Then**
- `project-stats.json` `toolCount` equals 91
- `cron-registry.json` contains an entry with `key: "insiderCheck"` and `schedule: "0 1 * * *"`
- `bun tsc --noEmit` exits 0
- `GET /health` returns `toolCount: 91` after server restart

---

## Sprint 062 — Cron Observability Completion (COMPLETE)

Vision: `SPRINT_GOAL.md`
Spec: `docs/REQ_062.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| REQ-062 | BA: write REQ_062.md for cron observability completion | BA | — | — | — | Done |
| TECH-062 | Architect: review REQ_062, produce TECH_062.md | Architect | — | REQ-062 | — | Done |
| PM-062 | PM: sprint planning — break TECH_062 into tasks 1136–1140, assign batches | PM | — | TECH-062 | — | Done |
| 1136 | jobs.ts imports + summaryJobs.ts wrap (FR-16, FR-18) | Developer | interface/scheduler | — | task/1136-imports-summary-wrap | Done |
| 1137 | Wrap critical briefing/cycle jobs: morningBriefing, intelligenceCycle, eveningSummary, alertDigest (FR-1–4) | Developer | interface/scheduler | 1136 | task/1137-wrap-briefing-cycle | Done |
| 1138 | Wrap market/portfolio/prediction jobs: patternWatch, weeklyPortfolioReport, predictionMarketPoll, predictionOutcome (FR-5–8) | Developer | interface/scheduler | 1136 | task/1138-market-portfolio-wrap | Done |
| 1139 | Wrap utility/infra jobs: franceSummary, devTeamHeartbeat, weatherCheck, davPharmacyCheck (FR-9–12) | Developer | interface/scheduler | 1136 | task/1139-utility-wrap | Done |
| 1140 | Replace try/catch blocks: bctcOverdueCheck, vpsProxyWatchdog, cronHealthAlert (FR-13–15) | Developer | interface/scheduler | 1136 | task/1140-trycatch-replace | Done |

**WIP state:** 0 tasks In Progress (limit: 2). Sprint 062 COMPLETE — all tasks done.

---

### Task 1136 — jobs.ts imports + summaryJobs.ts wrap (FR-16, FR-18)

**Branch**: `task/1136-imports-summary-wrap`
**Layer**: interface/scheduler
**Depends on**: none (Batch A — start immediately)

#### Files to read first

- `src/scheduler/jobs.ts` — lines 48–55 to locate the last import line (currently line 50: `runForeignFlowAlertJobCron`); confirm `getDb` and `recordJobRun` are NOT already imported
- `src/scheduler/summaryJobs.ts` — lines 1–30 (existing imports, ~line 21 is last import); lines 54–75 (current `runSummaryJob` body to be replaced)

#### Files to create / modify

- MODIFY: `src/scheduler/jobs.ts` — add 2 import lines after line 50
- MODIFY: `src/scheduler/summaryJobs.ts` — add 2 import lines after line 21; replace `runSummaryJob` body (lines 54–75) with Pattern D

#### Exact changes

**jobs.ts** — add after the last import line (after `runForeignFlowAlertJobCron`):
```typescript
import { getDb } from '../infrastructure/db/schema.js'
import { recordJobRun } from '../infrastructure/db/cronJobRunStore.js'
```

**summaryJobs.ts** — add after the existing `logger` import (after line 21):
```typescript
import { getDb } from "../infrastructure/db/schema.js"
import { recordJobRun } from "../infrastructure/db/cronJobRunStore.js"
```

**summaryJobs.ts** — replace `runSummaryJob` (lines 54–75) with Pattern D:
```typescript
async function runSummaryJob(periodType: PeriodType): Promise<void> {
  const db = getDb()
  await recordJobRun(db, `summaryJob:${periodType}`, async () => {
    const start = Date.now()
    logger.info(`[summaryJob] starting ${periodType} summary generation`)
    const summary = await generatePeriodicSummary(periodType)
    const durationMs = Date.now() - start
    logger.info(`[summaryJob] ${periodType} summary complete`, {
      id: summary.id,
      periodStart: summary.periodStart,
      periodEnd: summary.periodEnd,
      newsCount: summary.newsCount,
      alertCount: summary.alertCount,
      durationMs,
    })
  })
}
```

Note: the outer `try/catch` in the original `runSummaryJob` is superseded by `recordJobRun`'s own error capture — remove it entirely. `getDb()` is called inside the callback (per-run), not at module level.

#### Acceptance Criteria

**Given** the two import lines are added to `jobs.ts` (after existing imports) and the Pattern D wrap replaces `runSummaryJob` in `summaryJobs.ts`
**When** `bun tsc --noEmit` and `bun test` are run
**Then**

- `bun tsc --noEmit` reports 0 errors
- `bun test` passes with 0 failures (no regression)
- `jobs.ts` contains `import { getDb }` and `import { recordJobRun }` (grep-verifiable)
- `summaryJobs.ts` `runSummaryJob` body is wrapped in `recordJobRun(db, \`summaryJob:${periodType}\`, ...)`
- No standalone `try/catch` remains inside the new `runSummaryJob`
- `jobs.ts` does NOT import `recordJobRun` for summary jobs (summary imports live in `summaryJobs.ts` only — AC-5)

#### TDD Test location

No new test file required for this task (REQ-062: "no new tests beyond verifying the wrap is present"). Verification via `bun tsc --noEmit` + `bun test` + grep checks.

---

### Task 1137 — Wrap critical briefing/cycle jobs (FR-1, FR-2, FR-3, FR-4)

**Branch**: `task/1137-wrap-briefing-cycle`
**Layer**: interface/scheduler
**Depends on**: 1136 (imports must be merged before this task starts)

#### Files to read first

- `src/scheduler/jobs.ts` — lines 128–168 (morningBriefing, intelligenceCycle, eveningSummary, alertDigest cron blocks)
- `src/scheduler/intelligenceCycleJob.ts` — confirm `CycleResult` fields: `newsFetched` and `impactEventsRan` exist (grep before writing Pattern B)

#### Files to create / modify

- MODIFY: `src/scheduler/jobs.ts` — wrap 4 call sites (lines 130–132, 143–145, 158–160, 163–165)

#### Exact changes

Replace each plain `await runX()` callback body with the appropriate `recordJobRun` wrapper:

| Job | Lines | Pattern |
|-----|-------|---------|
| morningBriefing | 130–132 | A |
| intelligenceCycle | 143–145 | B — `return { rowsWritten: (result?.newsFetched ?? 0) + (result?.impactEventsRan ?? 0) }` |
| eveningSummary | 158–160 | A |
| alertDigest | 163–165 | A |

Pattern A (morningBriefing, eveningSummary, alertDigest):
```typescript
cron.schedule(CRONS.X, async () => {
  await recordJobRun(getDb(), "XJob", async () => {
    await runX()
  })
}, { timezone: 'Asia/Ho_Chi_Minh' })
```

Pattern B (intelligenceCycle):
```typescript
cron.schedule(CRONS.intelligenceCycle, async () => {
  await recordJobRun(getDb(), "intelligenceCycleJob", async () => {
    const result = await runIntelligenceCycle()
    return { rowsWritten: (result?.newsFetched ?? 0) + (result?.impactEventsRan ?? 0) }
  })
}, { timezone: 'Asia/Ho_Chi_Minh' })
```

#### Acceptance Criteria

**Given** task 1136 is merged and `getDb` + `recordJobRun` are imported in `jobs.ts`
**When** the 4 call sites are wrapped and `bun tsc --noEmit` + `bun test` are run
**Then**

- `bun tsc --noEmit` reports 0 errors
- `bun test` passes with 0 failures
- Each of the 4 cron callbacks contains `recordJobRun(getDb(), "..."` (grep-verifiable)
- `intelligenceCycleJob` callback uses `result?.newsFetched ?? 0` (null-safe)

#### TDD Test location

No new test file. Verification via `bun tsc --noEmit` + `bun test` + grep checks.

---

### Task 1138 — Wrap market/portfolio/prediction jobs (FR-5, FR-6, FR-7, FR-8)

**Branch**: `task/1138-wrap-market-portfolio`
**Layer**: interface/scheduler
**Depends on**: 1136 (imports must be merged before this task starts)

#### Files to read first

- `src/scheduler/jobs.ts` — lines 172–260 (patternWatch, predictionMarketPoll, weeklyPortfolioReport, predictionOutcome cron blocks)

#### Files to create / modify

- MODIFY: `src/scheduler/jobs.ts` — wrap 4 call sites (lines 174–176, 201–203, 241–243, 257–259)

#### Exact changes

All 4 jobs use Pattern A (void return):

| Job | Lines | jobName string |
|-----|-------|---------------|
| patternWatch | 174–176 | `"patternWatchJob"` |
| predictionMarketPoll | 201–203 | `"predictionMarketPollJob"` |
| weeklyPortfolioReport | 241–243 | `"weeklyPortfolioReportJob"` |
| predictionOutcome | 257–259 | `"predictionOutcomeJob"` |

Pattern A:
```typescript
cron.schedule(CRONS.X, async () => {
  await recordJobRun(getDb(), "XJob", async () => {
    await runX()
  })
}, { timezone: '...' })
```

Note: `predictionOutcome` uses `timezone: "UTC"` (check existing call site before applying).

#### Acceptance Criteria

**Given** task 1136 is merged
**When** the 4 call sites are wrapped and `bun tsc --noEmit` + `bun test` are run
**Then**

- `bun tsc --noEmit` reports 0 errors
- `bun test` passes with 0 failures
- Each of the 4 cron callbacks contains `recordJobRun(getDb(), "..."` (grep-verifiable)

#### TDD Test location

No new test file. Verification via `bun tsc --noEmit` + `bun test` + grep checks.

---

### Task 1139 — Wrap utility/infra jobs (FR-9, FR-10, FR-11, FR-12)

**Branch**: `task/1139-wrap-utility-infra`
**Layer**: interface/scheduler
**Depends on**: 1136 (imports must be merged before this task starts)

#### Files to read first

- `src/scheduler/jobs.ts` — lines 244–272 (franceSummary, devTeamHeartbeat, weatherCheck, davPharmacyCheck cron blocks)

#### Files to create / modify

- MODIFY: `src/scheduler/jobs.ts` — wrap 4 call sites (lines 246–248, 251–253, 263–265, 268–270)

#### Exact changes

All 4 jobs use Pattern A (void return):

| Job | Lines | jobName string | Timezone |
|-----|-------|---------------|----------|
| franceSummary | 246–248 | `"franceSummaryJob"` | UTC |
| devTeamHeartbeat | 251–253 | `"devTeamHeartbeatJob"` | UTC |
| weatherCheck | 263–265 | `"weatherCheckJob"` | Asia/Ho_Chi_Minh |
| davPharmacyCheck | 268–270 | `"davPharmacyJob"` | Asia/Ho_Chi_Minh |

Pattern A:
```typescript
cron.schedule(CRONS.X, async () => {
  await recordJobRun(getDb(), "XJob", async () => {
    await runX()
  })
}, { timezone: '...' })
```

Note: confirm timezone on each existing call site before applying (do not flip UTC vs VN).

#### Acceptance Criteria

**Given** task 1136 is merged
**When** the 4 call sites are wrapped and `bun tsc --noEmit` + `bun test` are run
**Then**

- `bun tsc --noEmit` reports 0 errors
- `bun test` passes with 0 failures
- Each of the 4 cron callbacks contains `recordJobRun(getDb(), "..."` (grep-verifiable)

#### TDD Test location

No new test file. Verification via `bun tsc --noEmit` + `bun test` + grep checks.

---

### Task 1140 — Replace try/catch blocks: bctcOverdueCheck, vpsProxyWatchdog, cronHealthAlert (FR-13, FR-14, FR-15)

**Branch**: `task/1140-replace-trycatch`
**Layer**: interface/scheduler
**Depends on**: 1136 (imports must be merged before this task starts)

#### Files to read first

- `src/scheduler/jobs.ts` — lines 274–316 (the three inline try/catch blocks to remove)
- Confirm exact field names: `bctcOverdueCheck` returns `{ alertsInserted, overdueFound, stocksChecked }`; `cronHealthAlert` returns `{ alertsSent }` — grep in their respective job files before writing

#### Files to create / modify

- MODIFY: `src/scheduler/jobs.ts` — remove 3 inline try/catch blocks; replace each with the appropriate `recordJobRun` wrapper (lines 276–285, 292–301, 306–315)

#### Exact changes

| Job | Lines | Action | Pattern |
|-----|-------|--------|---------|
| bctcOverdueCheck | 276–285 | Delete try/catch; apply Pattern B | `return { rowsWritten: r.alertsInserted }` |
| vpsProxyWatchdog | 292–301 | Delete try/catch; apply Pattern C | string-return, no rowsWritten |
| cronHealthAlert | 306–315 | Delete try/catch; apply Pattern B | `return { rowsWritten: r.alertsSent }` |

Pattern B (bctcOverdueCheck):
```typescript
cron.schedule(CRONS.bctcOverdueCheck, async () => {
  await recordJobRun(getDb(), "bctcOverdueCheckJob", async () => {
    const r = await runBctcOverdueCheck()
    if (r.alertsInserted > 0) {
      log(`[bctc-overdue] inserted=${r.alertsInserted} overdue=${r.overdueFound} checked=${r.stocksChecked}`)
    }
    return { rowsWritten: r.alertsInserted }
  })
}, { timezone: 'Asia/Ho_Chi_Minh' })
```

Pattern C (vpsProxyWatchdog):
```typescript
cron.schedule(CRONS.vpsProxyWatchdog, async () => {
  await recordJobRun(getDb(), "vpsProxyWatchdogJob", async () => {
    const status = await runVpsProxyWatchdog()
    if (status !== "ok" && status !== "off-hours" && status !== "cooldown") {
      log(`[vps-watchdog] ${status}`)
    }
  })
}, { timezone: 'UTC' })
```

Pattern B (cronHealthAlert):
```typescript
cron.schedule(CRONS.cronHealthAlert, async () => {
  await recordJobRun(getDb(), "cronHealthAlertJob", async () => {
    const r = await runCronHealthAlert()
    if (r.alertsSent > 0) {
      log(`[cron-health-alert] degraded=${r.alertsSent}`)
    }
    return { rowsWritten: r.alertsSent }
  })
}, { timezone: 'UTC' })
```

Important: `foreignFlowAlertJob` (lines ~345–352) also has an inline try/catch but is already internally instrumented via its own `recordJobRun` call. Do NOT touch it.

#### Acceptance Criteria

**Given** task 1136 is merged
**When** the 3 try/catch blocks are replaced and `bun tsc --noEmit` + `bun test` are run
**Then**

- `bun tsc --noEmit` reports 0 errors
- `bun test` passes with 0 failures
- No standalone `try { await runBctcOverdueCheck() }` / `try { await runVpsProxyWatchdog() }` / `try { await runCronHealthAlert() }` patterns remain in `jobs.ts` (AC-4)
- Each of the 3 call sites is wrapped in `recordJobRun(getDb(), "..."` (grep-verifiable)
- `foreignFlowAlertJob` try/catch is left untouched

#### TDD Test location

No new test file. Verification via `bun tsc --noEmit` + `bun test` + grep checks (AC-4).

---

## Sprint 061 — Foreign Flow VPS Pipeline (PARTIAL COMPLETE — 4/5)

Vision: `SPRINT_GOAL.md` | Spec: `docs/REQ_061.md` | Design: `docs/TECH_061.md` (APPROVED_BY_ARCHITECT)

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| REQ-061 | BA: write REQ_061.md for foreign flow VPS pipeline | BA | — | — | — | Done |
| TECH-061 | Architect: review REQ_061, produce TECH_061.md | Architect | — | — | — | Done |
| PM-061 | PM: sprint planning — break TECH_061 into tasks 1131–1135, assign batches | PM | — | — | — | Done |
| 1131 | `upsertForeignFlow` in `vnstockStore.ts` — targeted ON CONFLICT DO UPDATE SET, holding_ratio normalisation, legacy-schema fallback | Developer | infrastructure | — | task/1131-upsert-foreign-flow | Done |
| 1132 | `POST /api/push-foreign-flow` in `server.ts` — auth + validation + upsertForeignFlow + logVpsPush | Developer | interface | 1131 | task/1132-push-foreign-flow-endpoint | Done |
| 1133 | `foreignFlowAlertJob.ts` — daily 16:30 VN scan, alert rows, evidence fragments, WORK digest, recordJobRun | Developer | scheduler | 1131 | task/1133-foreign-flow-alert-job | Done |
| 1134 | `foreignFlowTools.ts` + registry entry — `get_foreign_flow` MCP tool, zero-detection, format helper (+1 tool → 90) | Developer | interface | 1131 | feat/sprint-061-task-1134 | Done |
| 1135 | VPS script extension — poll foreign flow per stock, parse fBuy/fSell/foreignPercent fields, POST to `/api/push-foreign-flow` | Developer | infrastructure (VPS) | 1132 + B1 | task/1135-vps-foreign-flow-script | Blocked |

**WIP state:** 0 tasks In Progress (limit: 2). Tasks 1131–1134 merged to main 2026-04-12, all 46 tests pass.
**Blocker B1 (Task 1135):** VPS API field names unconfirmed. Developer must run `curl -s "https://bgapidatafeed.vps.com.vn/getliststockdata/VNM" | python3 -m json.tool | grep -i "foreign\|fBuy\|fSell\|fRoom"` from Singapore VPS before 1135 starts.

---

### Task 1131 — `upsertForeignFlow` in `vnstockStore.ts`

**Branch**: `task/1131-upsert-foreign-flow`
**Layer**: infrastructure
**Depends on**: none (Batch A — start immediately)
**Test file**: `src/__tests__/1131-upsert-foreign-flow.test.ts`

#### Files to read first

- `src/infrastructure/db/vnstockStore.ts` — locate `storeTradingStats`, `tradingStatsHasDate()`, `getForeignFlowHistory`; add `upsertForeignFlow` after them
- `src/infrastructure/db/schema.ts` — lines around `vnstock_trading_stats` DDL (line ~1057) to confirm `UNIQUE(code, date)` constraint exists

#### Files to create / modify

- MODIFY: `src/infrastructure/db/vnstockStore.ts` — add `ForeignFlowUpsertItem` interface + `upsertForeignFlow` function
- CREATE: `src/__tests__/1131-upsert-foreign-flow.test.ts`

#### Interface contract

```typescript
export interface ForeignFlowUpsertItem {
  code: string;
  date: string;           // "YYYY-MM-DD"
  foreign_volume: number;
  foreign_room: number | null;
  holding_ratio: number | null;
  fetched_at: string | null; // ISO 8601 UTC; null → server uses datetime('now')
}

export function upsertForeignFlow(
  items: ForeignFlowUpsertItem[],
  db?: Database,
): number
```

#### SQL shape (primary path — `date` column present)

```sql
INSERT INTO vnstock_trading_stats
  (code, date, foreign_volume, foreign_room, current_holding_ratio, fetched_at)
VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
ON CONFLICT(code, date) DO UPDATE SET
  foreign_volume         = excluded.foreign_volume,
  foreign_room           = excluded.foreign_room,
  current_holding_ratio  = excluded.current_holding_ratio,
  fetched_at             = excluded.fetched_at
```

Legacy-schema fallback (when `tradingStatsHasDate()` returns false): use `ON CONFLICT(code)` variant omitting the `date` column.

`holding_ratio` normalisation: `if (item.holding_ratio != null && item.holding_ratio > 1.0) item.holding_ratio /= 100` before binding. Run all items in a single transaction with a prepared statement.

#### Acceptance Criteria

**Given** an in-memory SQLite database initialised with `initDatabase()` containing a `vnstock_trading_stats` row for `("VNM", "2026-04-12")` with `avg_volume_2w=500000`, `high_52w=98000`, `low_52w=72000`
**When** `upsertForeignFlow([{ code: "VNM", date: "2026-04-12", foreign_volume: 1500000, foreign_room: 50000000, holding_ratio: 0.4887, fetched_at: null }])` is called
**Then**
- Returns `1` (one row affected)
- `SELECT foreign_volume, foreign_room, current_holding_ratio FROM vnstock_trading_stats WHERE code='VNM'` returns `1500000, 50000000, 0.4887`
- `avg_volume_2w`, `high_52w`, `low_52w` columns are UNCHANGED (not zeroed) — critical invariant
- When called again with the same `(code, date)` and updated values, the row is updated (not duplicated)
- When `holding_ratio = 48.87` (> 1.0), the stored value is `0.4887` (divided by 100)
- When `fetched_at = null`, the stored `fetched_at` is a non-null UTC datetime string (server-generated)
- When `tradingStatsHasDate()` returns false, the legacy ON CONFLICT(code) path executes without error
- `bun test src/__tests__/1131-upsert-foreign-flow.test.ts` passes with 0 failures
- `bun tsc --noEmit` shows 0 errors

---

### Task 1132 — `POST /api/push-foreign-flow` endpoint in `server.ts`

**Branch**: `task/1132-push-foreign-flow-endpoint`
**Layer**: interface
**Depends on**: 1131 merged to main
**Test file**: `src/__tests__/1132-push-foreign-flow-endpoint.test.ts`

#### Files to read first

- `src/interface/mcp/server.ts` — locate `POST /api/push-prices` block (around line 619); the new block goes immediately after it
- `src/infrastructure/db/vnstockStore.ts` — confirm `upsertForeignFlow` export signature (Task 1131 output)

#### Files to create / modify

- MODIFY: `src/interface/mcp/server.ts` — add `POST /api/push-foreign-flow` block + import
- CREATE: `src/__tests__/1132-push-foreign-flow-endpoint.test.ts`

#### Endpoint logic

```
if (method === "POST" && pathname === "/api/push-foreign-flow") {
  1. Auth: x-api-key or Authorization: Bearer — check against VPS_PUSH_API_KEY → 401 if mismatch
  2. Read body chunks into string
  3. If body empty → 400 { error: "Empty request body" }
  4. JSON.parse(body) → items[]
  5. If !Array.isArray(items) || items.length === 0 → 400 { error: "Expected non-empty array" }
  6. upsertForeignFlow(items.map(i => ({ code, date, foreign_volume, foreign_room: i.foreign_room ?? null,
       holding_ratio: i.holding_ratio ?? null, fetched_at: i.fetched_at ?? null })), db)
  7. logVpsPush({ service: "foreign-flow", itemsCount: count, status: "ok" })
  8. → 200 { ok: true, upserted: count }
  On JSON parse error: logVpsPush(...status: "error"...) → 400 { error: "Invalid JSON" }
}
```

Import to add at top of server.ts:
```typescript
import { upsertForeignFlow } from "../../infrastructure/db/vnstockStore.js";
```

#### Acceptance Criteria

**Given** a running test server with `VPS_PUSH_API_KEY=test-key` and the Sprint 061 schema
**When** `POST /api/push-foreign-flow` is called with a valid array payload and correct API key
**Then**
- Returns HTTP 200 `{ ok: true, upserted: 1 }` (or count matching input array length)
- The `vnstock_trading_stats` row for the pushed code contains the correct `foreign_volume` value
- Non-foreign columns (`avg_volume_2w`, `high_52w`, etc.) on the same row are not zeroed out
- Missing API key returns HTTP 401
- Wrong API key returns HTTP 401
- Empty body returns HTTP 400 `{ error: "Empty request body" }`
- Non-array JSON body returns HTTP 400 `{ error: "Expected non-empty array" }`
- Malformed JSON returns HTTP 400 `{ error: "Invalid JSON" }`
- `bun test src/__tests__/1132-push-foreign-flow-endpoint.test.ts` passes with 0 failures
- `bun tsc --noEmit` shows 0 errors

---

### Task 1133 — `foreignFlowAlertJob.ts` — daily 16:30 VN scan

**Branch**: `task/1133-foreign-flow-alert-job`
**Layer**: scheduler
**Depends on**: 1131 merged to main
**Test file**: `src/__tests__/1133-foreign-flow-alert-job.test.ts`

#### Files to read first

- `src/infrastructure/db/vnstockStore.ts` — `getForeignFlowHistory` signature
- `src/domain/services/foreignFlowAnalyzer.ts` — `analyzeForeignFlow` return type (`ForeignFlowSignal`)
- `src/infrastructure/db/evidenceFragmentStore.ts` — `insertEvidenceFragment` signature
- `src/scheduler/calibrationReportJob.ts` — `sendTelegramWork` dynamic import pattern + `recordJobRun` wrapper pattern

#### Files to create / modify

- CREATE: `src/scheduler/foreignFlowAlertJob.ts`
- MODIFY: `src/scheduler/jobs.ts` — add `CRONS.foreignFlowAlert` entry, import, cron registration block
- CREATE: `src/__tests__/1133-foreign-flow-alert-job.test.ts`
- MODIFY: `docs/data/cron-registry.json` — add `foreignFlowAlertJob` entry, update `cronCount` 26 → 27
- MODIFY: `docs/data/project-stats.json` — `schedulerFileCount` 26 → 27

#### Key implementation contracts

```typescript
export interface ForeignFlowAlertResult {
  stocksScanned: number;
  stocksSkipped: number;   // insufficient history (< 2 rows)
  highSignals: number;
  alertsInserted: number;
  evidenceFragmentsWritten: number;
}

export async function runForeignFlowAlertJob(db?: Database): Promise<ForeignFlowAlertResult>
```

Alert row `id` = `foreign-flow-${code}-${utcDay}` (deduped by PRIMARY KEY via `INSERT OR IGNORE`).
Evidence fragment only written when `signal.netFlowDirection !== "neutral"`.
`sendTelegramWork` via dynamic import — never `sendTelegramMarket`.
Cron expression: `CRONS.foreignFlowAlert = Bun.env.CRON_FOREIGN_FLOW_ALERT ?? '30 9 * * 1-5'` (09:30 UTC = 16:30 GMT+7, weekdays).

#### Acceptance Criteria

**Given** a test database with watchlist rows for "VNM" and "FPT", where VNM has 5 days of foreign flow history showing net_buy direction (HIGH severity) and FPT has 1 row only
**When** `runForeignFlowAlertJob(db)` is called
**Then**
- Returns `{ stocksScanned: 2, stocksSkipped: 1, highSignals: 1, alertsInserted: 1, evidenceFragmentsWritten: 1 }`
- An alert row exists with `id = "foreign-flow-VNM-<today>"`, `severity = "high"`, `sent_by = "server"`
- An evidence fragment row exists for `stock = "VNM"`, `evidence_type = "foreign_flow_institutional"`, `direction = "bullish"`
- Calling `runForeignFlowAlertJob` a second time for the same day returns `alertsInserted: 0` (INSERT OR IGNORE dedup)
- When all `foreignVolume` values for a stock are 0, that stock is skipped (not counted as a HIGH signal)
- `sendTelegramWork` is called exactly once (with the WORK digest)
- `sendTelegramMarket` is never called
- `jobs.ts` includes `CRONS.foreignFlowAlert = Bun.env.CRON_FOREIGN_FLOW_ALERT ?? '30 9 * * 1-5'`
- `bun test src/__tests__/1133-foreign-flow-alert-job.test.ts` passes with 0 failures
- `bun tsc --noEmit` shows 0 errors

---

### Task 1134 — `foreignFlowTools.ts` + registry entry — `get_foreign_flow` MCP tool

**Branch**: `task/1134-get-foreign-flow-tool`
**Layer**: interface
**Depends on**: 1131 merged to main
**Test file**: `src/__tests__/1134-get-foreign-flow-tool.test.ts`

#### Files to read first

- `src/interface/mcp/tools/registry.ts` — add import + `registerForeignFlowTools` entry after `registerCalibrationTools`
- `src/interface/mcp/tools/calibrationTools.ts` — pattern reference for MCP tool structure with Zod schema
- `src/domain/services/foreignFlowAnalyzer.ts` — `ForeignFlowSignal` type fields

#### Files to create / modify

- CREATE: `src/interface/mcp/tools/foreignFlowTools.ts`
- MODIFY: `src/interface/mcp/tools/registry.ts` — import + register `registerForeignFlowTools`
- CREATE: `src/__tests__/1134-get-foreign-flow-tool.test.ts`
- MODIFY: `docs/data/tool-registry.json` — add `get_foreign_flow` entry, update `toolCount` 89 → 90
- MODIFY: `docs/data/project-stats.json` — `toolCount` 89 → 90

#### Key implementation contracts

Tool name: `get_foreign_flow`
Parameters: `code: z.string()` (required), `days: z.number().int().min(2).max(30).optional().default(10)`
Zero-detection: if `history.every(r => r.foreignVolume === 0)` → return no-data message, do NOT call `analyzeForeignFlow`
Output via `formatForeignFlowOutput(code, signal, history)` helper in same file — emits direction, severity, consecutiveDays, netVol3d/5d, holdingRatioChange5d, reasoning, daily history table.

#### Acceptance Criteria

**Given** a test database with 5 days of non-zero foreign flow history for "VNM" showing a HIGH buy signal
**When** the `get_foreign_flow` tool is called with `{ code: "VNM", days: 5 }`
**Then**
- Returns a text block containing `"Direction: net_buy"`, `"Severity: HIGH"`, `"Consecutive days: 3"` (or matching signal values)
- Contains the "Daily history" section with 5 rows

**When** called with a code that has fewer than 2 rows
**Then** returns message containing `"Insufficient foreign flow data"`

**When** called with a code whose all `foreignVolume` values are 0
**Then** returns message containing `"no data available"` and does NOT call `analyzeForeignFlow`

**When** called with `{ code: "VNM", days: 35 }` (exceeds max)
**Then** returns a Zod validation error (days max is 30)

**Always**
- `registerForeignFlowTools` is listed in `src/interface/mcp/tools/registry.ts`
- `docs/data/tool-registry.json` shows `toolCount: 90`
- `bun test src/__tests__/1134-get-foreign-flow-tool.test.ts` passes with 0 failures
- `bun tsc --noEmit` shows 0 errors

---

### Task 1135 — VPS script extension (BLOCKED on B1)

**Branch**: `task/1135-vps-foreign-flow-script`
**Layer**: infrastructure (VPS — off-repo)
**Depends on**: 1132 deployed to France server + Blocker B1 resolved
**Status**: BLOCKED

**Blocker B1:** Confirm VPS API foreign flow field names by running from Singapore VPS:
```bash
curl -s "https://bgapidatafeed.vps.com.vn/getliststockdata/VNM" | python3 -m json.tool | grep -i "foreign\|fBuy\|fSell\|fRoom\|fCurrent\|totalRoom"
```
Fields expected: `fRoom`, `fBuy`, `fSell`, `foreignPercent`. Confirm or correct before writing the script.

**Files to create / modify (on VPS, not in repo):**

- MODIFY: `/opt/vn-price-fetch/fetch-prices.sh` (or `fetch-prices-loop.sh`) — add `fetch_foreign_flow()` function called after each price-fetch loop iteration
- CREATE: `/opt/vn-price-fetch/parse_foreign_flow.py` — Python helper to translate VPS JSON to `ForeignFlowPushItem[]` schema

**Error handling invariant:** `fetch_foreign_flow` must always `return 0`. Any failure (timeout, parse error, HTTP error) logs to stderr and does NOT abort the price-fetch loop.

#### Acceptance Criteria

**Given** Task 1132 is live on the France MCP server and B1 field names are confirmed
**When** the updated VPS script runs one full loop iteration during VN market hours (09:00–15:30 GMT+7)
**Then**
- `POST /api/push-foreign-flow` is called with a non-empty JSON array conforming to `ForeignFlowPushItem[]`
- France server responds `{ ok: true, upserted: N }` where N matches watchlist size
- `getForeignFlowHistory("VNM", 10)` on the France DB returns at least 1 non-zero row
- If VPS API times out, the price-fetch loop continues without interruption
- `sudo systemctl status vn-price-fetch.service` shows `active (running)` after restart

---

## Sprint 060 — Prediction Engine Phase D — Calibration Report + Telegram Digest (COMPLETE)

Spec: `docs/REQ_060.md` | Design: `docs/TECH_060.md` (APPROVED_BY_ARCHITECT)
Completed: 2026-04-12

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| REQ-060 | BA: write REQ_060.md for calibration report + digest | BA | — | — | — | Done |
| TECH-060 | Architect: review REQ_060, produce TECH_060.md | Architect | — | — | — | Done |
| PM-060 | PM: sprint planning — break TECH_060 into tasks, assign batches | PM | — | — | — | Done |
| 1127 | `calibration_snapshots` DDL + `calibrationSnapshotStore.ts` CRUD | Developer | infrastructure | — | merged to main | Done |
| 1128 | `calibrationReportJob.ts` weekly computation + Telegram digest + `jobs.ts` registration | Developer | scheduler | 1127 | merged to main | Done |
| 1129 | `get_calibration_report` MCP tool + `registry.ts` registration (+1 tool → 89) | Developer | interface | 1127 | merged to main | Done |
| 1130 | `08-prediction-synthesizer.md` self-assessment Step 0 | Cowork Refactory Expert | interface/Cowork | 1129 | merged to main | Done |

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

### Task 1139 — Wrap utility/infra jobs (FR-9, FR-10, FR-11, FR-12)

**Branch**: `task/1139-utility-wrap`
**Layer**: interface/scheduler
**Status**: Ready for review

Wrapped franceSummaryJob, devTeamHeartbeatJob, weatherCheckJob, davPharmacyCheckJob with Pattern A recordJobRun.
Test: `src/__tests__/1139-utility-observability.test.ts` (8 assertions, all pass).
`bun tsc --noEmit` clean. Full suite: 27 pre-existing failures, 0 regressions introduced.

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
