# TECH-070: Calibration Label Integration

status: APPROVED_BY_ARCHITECT
req_ref: REQ-070

---

## Brownfield Impact

- Files modified: 3
  - `src/infrastructure/db/marketMessageStore.ts` — add `LabelAccuracyRow` type + `getLabelAccuracyReport` function
  - `src/interface/mcp/tools/calibrationTools.ts` — add `get_label_accuracy_report` tool inside existing `registerCalibrationTools`
  - `src/scheduler/calibrationReportJob.ts` — extend `CalibrationJobResult`, extend `runCalibrationReport` (Step 3.5), extend `sendCalibrationDigest` (workLines block)
- Files created: 1
  - `src/__tests__/1173-label-accuracy-report.test.ts`
- Files deleted: none
- Breaking changes: no — `CalibrationJobResult` gains one additive field (`label_accuracy`). Existing consumers (`insertCalibrationSnapshot`, all Sprint 065 tests) do not read this field. TypeScript compile will catch any callers that destructure the full type.

---

## Architecture Decision

`getLabelAccuracyReport` is a pure read-only GROUP BY aggregation over `market_messages` — the same table that Sprints 068/069 write to. Placing it in `marketMessageStore.ts` (infrastructure layer) keeps all market-message DB access co-located. The MCP tool belongs in `calibrationTools.ts` (not `marketMessageTools.ts`) because it answers a calibration question, making it the human-label counterpart to `get_calibration_report`. The `calibrationReportJob` extension appends the label block to the WORK-only post, consistent with the job's existing pattern of keeping internal metrics out of the MARKET channel.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `LabelAccuracyRow` type | infrastructure | `src/infrastructure/db/marketMessageStore.ts` | MODIFY |
| `getLabelAccuracyReport` function | infrastructure | `src/infrastructure/db/marketMessageStore.ts` | MODIFY |
| `get_label_accuracy_report` MCP tool | interface | `src/interface/mcp/tools/calibrationTools.ts` | MODIFY |
| `CalibrationJobResult.label_accuracy` field | scheduler | `src/scheduler/calibrationReportJob.ts` | MODIFY |
| `runCalibrationReport` Step 3.5 (label query) | scheduler | `src/scheduler/calibrationReportJob.ts` | MODIFY |
| `sendCalibrationDigest` WORK block extension | scheduler | `src/scheduler/calibrationReportJob.ts` | MODIFY |
| Tests AC-1 to AC-9 | tests | `src/__tests__/1173-label-accuracy-report.test.ts` | NEW |

---

## Interface Contracts

### New export in `src/infrastructure/db/marketMessageStore.ts`

```typescript
/** Per-agent accuracy statistics derived from human verdict labels. */
export interface LabelAccuracyRow {
  from_agent: string;
  total_reviewed: number;
  signal_count: number;
  noise_count: number;
  /** signal_count / total_reviewed. Null only as a guard; WHERE clause prevents it in practice. */
  signal_rate: number | null;
  last_reviewed_at: string | null;
}

/**
 * Returns per-agent signal accuracy computed from human verdict labels.
 * Read-only. Groups market_messages WHERE verdict IS NOT NULL by from_agent.
 *
 * @param db         - SQLite database instance
 * @param since_days - Lookback window in calendar days (default 90, clamped 1-365)
 * @returns LabelAccuracyRow[] ordered by signal_rate DESC, total_reviewed DESC
 */
export function getLabelAccuracyReport(
  db: Database,
  since_days?: number,
): LabelAccuracyRow[]
```

### SQL query (exact, parameterized)

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

Parameter binding: `[clampedSinceDays]` — a single integer, clamped to `[1, 365]` before the query runs. Post-query: cast `signal_count` and `noise_count` to `number`; coerce `signal_rate` to `number | null`.

### `since_days` clamping logic

```typescript
const clampedDays = Math.min(365, Math.max(1, since_days ?? 90));
```

### Extension to `CalibrationJobResult` in `src/scheduler/calibrationReportJob.ts`

```typescript
export interface CalibrationJobResult {
  // ... existing fields unchanged ...
  /** Per-agent accuracy from human verdict labels on market_messages. Empty array on error or no data. */
  label_accuracy: LabelAccuracyRow[];
}
```

Import required: add `getLabelAccuracyReport, type LabelAccuracyRow` to the import from `../infrastructure/db/marketMessageStore.js`.

### New step in `runCalibrationReport` (after existing Step 3)

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

The result is threaded into `jobResult.label_accuracy` and passed to `sendCalibrationDigest`.

### WORK message extension in `sendCalibrationDigest`

Appended after the existing `Per-agent Brier:` block in `workLines`:

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

### MCP tool signature in `registerCalibrationTools`

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

The handler calls `getLabelAccuracyReport(resolveDb(), since_days ?? 90)` and formats the result per REQ-070 FR-2 output spec (fixed-width columns, bilingual header/footer).

---

## Formatting Contract (MCP tool output)

### Non-empty path

```
Label Accuracy Report — {N} ngay gan nhat
=========================================

Agent                  Reviewed  Signal  Noise   Signal%   Last reviewed
--------------------   --------  ------  -----   -------   -------------------------
{from_agent:<22}  {total_reviewed:>8}  {signal_count:>6}  {noise_count:>5}  {signal_rate:>6.1f}%  {last_reviewed_at}

-----------------------------------------
Tong: {agentCount} agents, {totalReviewed} tin da review.
Su dung get_calibration_report de xem Brier score tu prediction_claims.
```

Column alignment rules:
- `Agent` column: left-padded to 22 characters (`padEnd(22)`)
- `Reviewed`, `Signal`, `Noise`: right-aligned, width 8/6/5 (`padStart`)
- `Signal%`: right-aligned, width 7, one decimal (`(rate * 100).toFixed(1) + "%"`)
- `Last reviewed`: full ISO timestamp, no truncation

Footer aggregates: `agentCount = rows.length`, `totalReviewed = rows.reduce((s, r) => s + r.total_reviewed, 0)`.

### Empty path

```
Khong co tin nhan da review trong {N} ngay qua.
Hay su dung batch_review_market_messages de danh gia tin nhan.
```

`{N}` is the actual `since_days` value passed to the tool.

---

## Index Coverage Analysis

The query for `getLabelAccuracyReport` uses:
- `WHERE verdict IS NOT NULL` — covered by `idx_mm_verdict ON market_messages(verdict)`
- `AND reviewed_at >= date('now', '-N days')` — no dedicated index on `reviewed_at`
- `GROUP BY from_agent` — covered by `idx_mm_from_agent ON market_messages(from_agent)`

SQLite query planner will use `idx_mm_verdict` to filter the rowset, then scan the filtered rows for the date predicate. With a single-user local table (up to ~10,000 rows/year), no additional index is needed. A composite index on `(verdict, reviewed_at)` would be a minor optimization; deferred to a future sprint (not in scope for Sprint 070 read-only work).

---

## Task Breakdown (for PM)

Suggested atomic tasks in dependency order:

| ID | Title | Layer | Depends On |
|---|---|---|---|
| 1173 | TDD: write failing tests for AC-1 to AC-9 in `src/__tests__/1173-label-accuracy-report.test.ts` | tests | — |
| 1174 | Add `getLabelAccuracyReport` + `LabelAccuracyRow` to `marketMessageStore.ts` (FR-1) | infrastructure | 1173 |
| 1175 | Add `get_label_accuracy_report` tool to `calibrationTools.ts` + extend `registerCalibrationTools` (FR-2, FR-4) | interface | 1174 |
| 1176 | Extend `CalibrationJobResult` with `label_accuracy` + update `runCalibrationReport` Step 3.5 + `sendCalibrationDigest` WORK block (FR-3) | scheduler | 1174 |
| 1177 | Sprint close: advance `project-stats.json` `currentSprint` to 70, `toolCount` to 96, update `lastUpdated` | docs/data | 1175, 1176 |

Tasks 1175 and 1176 share only the `LabelAccuracyRow` type from 1174. They are independent of each other and can be worked in parallel once 1174 is merged.

---

## Test Strategy (TDD — task 1173)

File: `src/__tests__/1173-label-accuracy-report.test.ts`

Setup pattern (copy from `1163-market-message-review.test.ts`):

```typescript
process.env["DB_PATH"] = ":memory:";
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { insertMarketMessage, reviewMarketMessage,
         getLabelAccuracyReport } from "../infrastructure/db/marketMessageStore.js";
```

In `beforeEach`: `initDatabase()`. In `afterEach`: `closeDb()`.

The in-memory DB created by `initDatabase()` already creates the `market_messages` table and all four indices (`idx_mm_verdict`, `idx_mm_from_agent`, `idx_mm_sent_at`, `idx_mm_ticker`) — no manual DDL needed in the test file.

### AC coverage plan

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

For AC-4 and AC-5 (MCP tool tests): use a real in-memory DB injected through `registerCalibrationTools(server, db)` — the existing `resolveDb` pattern in `calibrationTools.ts` already accepts an optional `db` parameter.

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

For AC-9 (exception isolation): replace `db.prepare` selectively. Pattern: create a Proxy or subclass of `Database` that throws on the `getLabelAccuracyReport` SQL. Simpler alternative: pass a `db` whose `prepare` throws for any SQL containing `verdict IS NOT NULL`. See existing pattern in `1128-calibration-report-job.test.ts` for mock-db precedents.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `reviewed_at` column missing from older DB (pre-Sprint-068 schema) | Low | Medium | `initDatabase()` migration in schema.ts already adds the column; test with in-memory DB confirms schema is current |
| `signal_rate` floating-point display artefacts (e.g. `0.738000001`) | Certain | Low | Always format with `.toFixed(1)` before display — enforced in both the MCP tool formatter and the WORK block formatter |
| `getLabelAccuracyReport` exception breaks nightly WORK post | Low | High | Step 3.5 is wrapped in try/catch; `label_accuracy` defaults to `[]`; job continues — AC-9 verifies this path |
| `CalibrationJobResult` additive field breaks TypeScript callers that use spread/destructure | Low | Low | `bun tsc --noEmit` run in task 1177 catches any missed call sites; field is additive, not required by existing consumers |
| `registerCalibrationTools` receives `db` injection in tests but MCP tool uses `resolveDb()` closure | None | None | Existing `resolveDb = () => db ?? getDb()` pattern already handles injection correctly; new tool uses same closure |
| `since_days` clamping bypass via Zod coerce of float input | Low | Low | Zod `.int()` rejects non-integers; `.min(1).max(365)` bounds enforced before TypeScript receives the value |

---

## Security Review

- SQL parameterized: Yes — `since_days` is passed as a single integer binding `?`, never string-interpolated
- File paths validated (no `../`): N/A — no file I/O in this sprint
- External HTTP rate-limited: N/A — no external HTTP in this sprint
- Secrets via `Bun.env` only: N/A — no new secrets introduced

---

## Backward Compatibility Notes

- `insertCalibrationSnapshot` call in `runCalibrationReport` is not modified — it receives no `label_accuracy` field (by design per REQ-070 NFR: "The snapshot store does NOT persist label_accuracy").
- Existing tests in `1128-calibration-report-job.test.ts` and `1129-calibration-tools.test.ts` do not assert against `CalibrationJobResult` exhaustively — adding the new field does not break them.
- The `1128` test's `makeDb()` helper creates only `prediction_claims` and `calibration_snapshots`. Task 1176's developer must extend `makeDb()` in the 1128 test file to also create `market_messages` (with its indices) so that `runCalibrationReport` no longer fails when `getLabelAccuracyReport` queries a table that does not exist in the test DB. This is the only cross-file test impact.

---

## Scope Boundary

This sprint is read-only against `market_messages`. The following are explicitly out of scope:

- Writing or modifying verdict labels (Sprints 068/069)
- Resolving or scoring `prediction_claims` (Sprint 065)
- Persisting `label_accuracy` into `calibration_snapshots` (future sprint)
- Adding a composite index on `(verdict, reviewed_at)` (future sprint, minor optimization)
- Extending the MARKET channel post with label accuracy data (future sprint, user-facing)
