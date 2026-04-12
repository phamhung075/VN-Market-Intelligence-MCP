# TECH-060: Prediction Engine Phase D — Calibration Report + Telegram Digest

status: APPROVED_BY_ARCHITECT
req_ref: REQ-060
sprint: 060
author: Architect

---

## Brownfield Impact

- **Files modified:**
  - `src/infrastructure/db/schema.ts` — append `calibration_snapshots` DDL to `initDatabase()`
  - `src/scheduler/jobs.ts` — add `CRONS.calibrationReport` key + cron callback
  - `src/interface/mcp/tools/registry.ts` — add `registerCalibrationTools` import + entry in `toolRegistry`
  - `src/interface/mcp/tools/index.ts` — re-export `registerCalibrationTools`
  - `docs/data/tool-registry.json` — add `get_calibration_report` entry
  - `docs/data/cron-registry.json` — add `calibrationReportJob` entry
  - `docs/data/project-stats.json` — `toolCount` 88→89, `schedulerFileCount` 26→27
  - `.claude/agents/08-prediction-synthesizer.md` — insert Step 0 self-assessment block

- **Files created:**
  - `src/infrastructure/db/calibrationSnapshotStore.ts`
  - `src/scheduler/calibrationReportJob.ts`
  - `src/interface/mcp/tools/calibrationTools.ts`
  - `src/__tests__/1127-calibration-snapshot-store.test.ts`
  - `src/__tests__/1128-calibration-report-job.test.ts`
  - `src/__tests__/1129-calibration-tools.test.ts`

- **Files deleted:** none

- **Breaking changes:** none. `CREATE TABLE IF NOT EXISTS` is additive. All existing Phase B+C tables and stores are read-only from Phase D's perspective.

---

## Architecture Decision

Phase D closes the feedback loop on the prediction engine by adding a weekly snapshot layer between the raw `prediction_claims` table and the `get_calibration_report` tool. Rather than computing Brier aggregates on-demand (which would scan 90 days of claims on every tool call), `calibrationReportJob` materialises the statistics into a single `calibration_snapshots` row each Sunday. The tool then performs a single-row lookup — constant time regardless of claims volume.

This pattern follows the established Phase A precedent (`evidence_scores` = materialised nightly aggregate over `evidence_fragments`). All computation logic lives in the scheduler layer (`calibrationReportJob.ts`), the infrastructure layer is pure CRUD (`calibrationSnapshotStore.ts`), and no domain service is needed because the Brier arithmetic (mean, grouping, bucketing) is straightforward aggregation that does not encode business rules warranting a domain model. The one existing domain function that is reused, `computeBrierScore` from `baseRateComputer.ts`, is imported by the scheduler, which is the only layer permitted to orchestrate across domain and infrastructure.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `calibration_snapshots` DDL | infrastructure | `src/infrastructure/db/schema.ts` | MODIFY |
| `calibrationSnapshotStore` | infrastructure | `src/infrastructure/db/calibrationSnapshotStore.ts` | NEW |
| `calibrationReportJob` (computation + digest) | scheduler | `src/scheduler/calibrationReportJob.ts` | NEW |
| Cron registration | scheduler | `src/scheduler/jobs.ts` | MODIFY |
| `get_calibration_report` MCP tool | interface | `src/interface/mcp/tools/calibrationTools.ts` | NEW |
| Tool registry entry | interface | `src/interface/mcp/tools/registry.ts` | MODIFY |
| Tool index re-export | interface | `src/interface/mcp/tools/index.ts` | MODIFY |
| Agent 08 self-assessment Step 0 | interface/Cowork | `.claude/agents/08-prediction-synthesizer.md` | MODIFY |

---

## Interface Contracts

### FR-1: `calibration_snapshots` DDL

Append after the `prediction_claims` DDL block in `initDatabase()` in `src/infrastructure/db/schema.ts`:

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

Column notes:
- `snapshot_date` — ISO date `YYYY-MM-DD`, the Sunday wall-clock date (VN time) of the run.
- `avg_brier_score` — NULL when `total_resolved = 0` or when all resolved claims have `brier_score IS NULL` (unresolvable).
- `avg_brier_by_agent`, `avg_brier_by_stock`, `avg_brier_by_direction` — JSON objects. Empty object `"{}"` when no qualifying data.
- `calibration_curve`, `top_predictions`, `worst_predictions` — JSON arrays. Empty array `"[]"` when no qualifying data.
- `trend_delta` — NULL on the first run (no previous snapshot to compare against).
- No `UNIQUE(snapshot_date)` constraint — re-runs on the same Sunday produce a second row; the query layer always uses `ORDER BY id DESC LIMIT 1`.

### FR-1: `calibrationSnapshotStore.ts` — exported interface

```typescript
// src/infrastructure/db/calibrationSnapshotStore.ts

import type { Database } from "bun:sqlite";

export interface CalibrationCurveBucket {
  bucket_midpoint: number;     // 0.05, 0.15, ..., 0.95
  predicted_prob:  number;     // same as bucket_midpoint
  actual_hit_rate: number;     // correct outcomes / total in bucket
  sample_size:     number;
}

export interface PredictionSummary {
  id:          number;
  stock:       string;
  agent_id:    string;
  direction:   string;
  confidence:  number;
  claim_text:  string;
  brier_score: number;
  resolved_at: string;
}

export interface CalibrationSnapshotInput {
  snapshot_date:          string;
  total_resolved:         number;
  avg_brier_score:        number | null;
  avg_brier_by_agent:     Record<string, number>;  // serialised to JSON by store
  avg_brier_by_stock:     Record<string, number>;
  avg_brier_by_direction: Record<string, number | null>;
  calibration_curve:      CalibrationCurveBucket[];
  trend_delta:            number | null;
  top_predictions:        PredictionSummary[];
  worst_predictions:      PredictionSummary[];
  computed_at:            string;    // ISO 8601 UTC
}

export interface CalibrationSnapshotRow extends CalibrationSnapshotInput {
  id: number;
  // JSON columns are deserialized back to objects/arrays on read
}

/**
 * Insert a new calibration snapshot row.
 * Serialises all object/array fields to JSON strings before insert.
 * Returns the new row's auto-increment id.
 *
 * Layer: infrastructure — no domain imports.
 * All bindings are parameterized.
 */
export function insertCalibrationSnapshot(
  db: Database,
  input: CalibrationSnapshotInput,
): number

/**
 * Return the latest calibration snapshot (highest id).
 * Returns null if the table is empty (no runs yet).
 *
 * JSON columns are parsed back to objects/arrays before return.
 */
export function getLatestCalibrationSnapshot(
  db: Database,
): CalibrationSnapshotRow | null

/**
 * Return the calibration snapshot for a specific date.
 * Uses ORDER BY id DESC LIMIT 1 on snapshot_date — returns the latest run
 * for that date (handles re-runs on the same Sunday).
 * Returns null if no snapshot exists for the given date.
 */
export function getCalibrationSnapshotByDate(
  db: Database,
  date: string,    // ISO date YYYY-MM-DD
): CalibrationSnapshotRow | null

/**
 * Return the most recent snapshot whose snapshot_date < the given date.
 * Used by calibrationReportJob to compute trend_delta:
 *   trend_delta = this_run_avg_brier - prev_snapshot.avg_brier_score
 * Returns null if no prior snapshot exists.
 */
export function getPreviousCalibrationSnapshot(
  db: Database,
  beforeDate: string,   // ISO date YYYY-MM-DD (exclusive upper bound)
): CalibrationSnapshotRow | null
```

**Implementation notes for `calibrationSnapshotStore.ts`:**
- The store is pure infrastructure — no domain imports. It does not compute Brier averages. It receives pre-computed objects from `calibrationReportJob.ts` and persists them.
- JSON serialisation: `JSON.stringify(input.avg_brier_by_agent)` etc. on write. `JSON.parse(row.avg_brier_by_agent)` etc. on read.
- Parameterized insert: 12 `?` positional bindings. Never template-literal user input into SQL.

---

### FR-2: `calibrationReportJob.ts` — scheduler

```typescript
// src/scheduler/calibrationReportJob.ts

import type { Database } from "bun:sqlite";

export interface CalibrationJobResult {
  snapshotId:     number;
  totalResolved:  number;
  avgBrierScore:  number | null;
  trendDelta:     number | null;
  marketSent:     boolean;   // false when total_resolved = 0 (MARKET channel skipped)
  workSent:       boolean;
}

/**
 * Core computation logic — injectable db for testing.
 *
 * Steps (matches REQ-060 FR-2):
 *  1. Query resolved claims window (90 days).
 *  2. Compute overall avg_brier_score (excluding NULL brier_score rows).
 *  3. Group by agent_id → avg_brier_by_agent.
 *  4. Group by stock (min 3 resolved) → avg_brier_by_stock.
 *  5. Group by direction → avg_brier_by_direction.
 *  6. Bucket by confidence into 10 bands → calibration_curve (empty buckets omitted).
 *  7. Fetch previous snapshot → trend_delta.
 *  8. Select top 5 (lowest brier_score) and worst 5 (highest brier_score).
 *  9. insertCalibrationSnapshot(db, { ... }).
 * 10. sendCalibrationDigest(snapshot, db) — private helper in same file.
 * 11. Return CalibrationJobResult.
 */
export async function runCalibrationReport(db?: Database): Promise<CalibrationJobResult>

/**
 * Cron-callable wrapper. Uses recordJobRun for observability.
 * Called weekly: Sunday 13:00 UTC = 20:00 VN.
 */
export async function runCalibrationReportJob(): Promise<void>
```

**Computation detail — calibration curve bucketing:**

Bucket boundaries are `[i * 0.1, (i+1) * 0.1)` for `i = 0..8`, and `[0.9, 1.0]` (inclusive upper bound for the last bucket) for `i = 9`. Midpoints: `i * 0.1 + 0.05`. A claim with `confidence = 0.9` belongs to bucket 9 (midpoint 0.95). A claim with `confidence = 0.0` belongs to bucket 0 (midpoint 0.05).

Assignment logic (TypeScript pseudocode):
```typescript
const bucketIndex = Math.min(9, Math.floor(claim.confidence * 10));
```

**Computation detail — trend_delta:**

```typescript
const prev = getPreviousCalibrationSnapshot(db, snapshotDate);
const trendDelta =
  prev && prev.avg_brier_score != null && avgBrierScore != null
    ? avgBrierScore - prev.avg_brier_score
    : null;
```

**Computation detail — avg_brier_by_stock minimum-3 filter:**

```typescript
// Only include stocks with at least 3 resolved, scorable claims
const stockGroups = groupBy(scorableClaims, c => c.stock);
const avgBrierByStock: Record<string, number> = {};
for (const [stock, claims] of Object.entries(stockGroups)) {
  if (claims.length >= 3) {
    avgBrierByStock[stock] = mean(claims.map(c => c.brier_score!));
  }
}
```

**`sendCalibrationDigest` — private function, same file:**

```typescript
// Not exported — only called by runCalibrationReport
async function sendCalibrationDigest(
  snapshot: CalibrationSnapshotRow,
  db: Database,
): Promise<{ marketSent: boolean; workSent: boolean }>
```

This function:
1. Builds the WORK channel message unconditionally (always sends, even when `total_resolved = 0`).
2. Builds the MARKET channel message only when `snapshot.total_resolved >= 1`; skips if 0.
3. Uses `sendTelegramWork` and `sendTelegramMarket` from `../infrastructure/notifiers/telegram.js` via dynamic import, matching the `eveningSummaryJob.ts` / `dataAuditJob.ts` pattern.
4. Wraps both sends in try-catch — Telegram failures are non-fatal, logged as warnings.
5. Returns `{ marketSent, workSent }` for test assertions.

**Trend label derivation (used in both digest messages):**

```typescript
function trendLabel(delta: number | null): string {
  if (delta === null) return "";
  if (delta < -0.01) return `improving (${delta.toFixed(3)} vs last week)`;
  if (delta > 0.01)  return `degrading (+${delta.toFixed(3)} vs last week)`;
  return `stable (${delta.toFixed(3)} vs last week)`;
}
```

**MARKET channel message template:**

```
Prediction Accuracy — This Week ({snapshot_date})

{total_resolved} predictions resolved (90-day window)
Overall accuracy score: {avg_brier_score}/1.0 (lower = better)
[Trend: {trendLabel} — only if trend_delta != null]

Best calls this week:
• {stock} {direction in Vietnamese}: confidence {confidence*100}% → correct (score: {brier_score})
[up to 2 best predictions shown]

Worst calls this week:
• {stock} {direction in Vietnamese}: confidence {confidence*100}% → WRONG (score: {brier_score})
[up to 2 worst predictions shown]

[Calibration note if any bucket has |actual_hit_rate - predicted_prob| > 0.15]
```

Direction labels for MARKET channel (Vietnamese): `bullish` → `tăng giá`, `bearish` → `giảm giá`, `neutral` → `đi ngang`.

**WORK channel message template:**

```
[calibrationReportJob] Sprint 060 — Sunday {snapshot_date} {HH:MM} UTC

Brier scores (90-day, n={total_resolved}):
  Overall:  {avg_brier_score} | Trend: {trendLabel}
  bullish:  {bullish_avg} | bearish: {bearish_avg} | neutral: {neutral_avg}
  by stock: {stock=val ...}

Agent {agent_id} accuracy: {avg} (all {n} claims)
Calibration curve: {non_empty_bucket_count} non-empty buckets, max deviation {max_pp}pp

Snapshot id={snapshotId} written. get_calibration_report available.
```

---

### FR-3: `get_calibration_report` MCP tool

```typescript
// src/interface/mcp/tools/calibrationTools.ts

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Register the get_calibration_report tool.
 * Reads from calibration_snapshots only — never queries prediction_claims directly.
 */
export function registerCalibrationTools(server: McpServer): void {
  server.tool(
    "get_calibration_report",
    "Returns the latest weekly calibration report for the prediction engine. " +
      "Shows overall Brier score, breakdown by agent/stock/direction, calibration curve " +
      "(predicted probability vs actual hit rate), trend vs last week, and top/worst predictions. " +
      "Data is at most 7 days stale (written weekly Sunday 20:00 VN). " +
      "If no snapshots exist yet (first 1-2 weeks after Phase C deploy), returns a clear message. " +
      "Pass date= to retrieve a specific Sunday's historical report.",
    {
      date: z.string().optional().describe(
        "Optional ISO date YYYY-MM-DD of a specific Sunday's report. Omit for latest."
      ),
    },
    async ({ date }) => { ... }
  );
}
```

**Tool logic — step by step:**

1. Fetch snapshot:
   - If `date` provided: call `getCalibrationSnapshotByDate(db, date)`.
   - If `date` omitted: call `getLatestCalibrationSnapshot(db)`.
2. If snapshot is null: return the "no data" message string (AC-5). Do not throw.
3. If `snapshot.total_resolved === 0`: return a human-readable "no resolved predictions yet" message that includes the snapshot date.
4. Otherwise: build and return the formatted text block per the FR-3 output spec in REQ-060.

**No-data message (AC-5):**
```
No calibration data available yet. Prediction claims are being accumulated and will appear after
the first resolution cycle completes (resolution_date + predictionResolutionJob run).
Check back next Sunday.
```

**Formatted output — key rendering rules:**

- Trend line: rendered only when `snapshot.trend_delta != null`. Labels: `< -0.01` → "improving", `> 0.01` → "degrading", `[-0.01, 0.01]` → "stable".
- Missing direction keys in `avg_brier_by_direction` (e.g. `neutral` not present): display "n/a".
- Calibration curve interpretation: if any bucket has `|actual_hit_rate - predicted_prob| > 0.15`, append: `Note: {bucket_midpoint*100}% bucket shows {over/under}-confidence — predicted {X}% but actual hit rate was {Y}%.`
- `avg_brier_by_stock`: only stocks that satisfied the min-3 filter at compute time (already filtered in the stored JSON).
- `top_predictions` / `worst_predictions`: display all entries in the stored JSON array (up to 5 each).

**DDD layer invariant for `calibrationTools.ts`:** This file may import from `src/infrastructure/db/calibrationSnapshotStore.ts` (to call the read functions) and from `src/infrastructure/db/index.ts` (to call `getDb()`). It does NOT import from `src/domain/`. Interface layer reads data; it does not compute.

---

### FR-2: `jobs.ts` registration addition

Add to the `CRONS` constant:

```typescript
/** Calibration report: weekly Sunday 13:00 UTC = 20:00 VN — task 1128, Sprint 060 */
calibrationReport: Bun.env.CRON_CALIBRATION_REPORT ?? '0 13 * * 0',
```

Add import at the top of `jobs.ts`:

```typescript
import { runCalibrationReportJob } from './calibrationReportJob.js'
```

Add cron callback after the `predictionResolution` registration:

```typescript
// Sunday 13:00 UTC — Calibration report + Telegram digest — task 1128, Sprint 060
cron.schedule(CRONS.calibrationReport, async () => {
  await runCalibrationReportJob()
}, { timezone: 'UTC' })
```

After this addition: `Object.keys(CRONS).length` goes from 31 to 32. Scheduler job file count goes from 26 to 27 (`calibrationReportJob.ts` is the 27th job file).

---

### FR-3: `registry.ts` and `index.ts` additions

In `src/interface/mcp/tools/registry.ts`:

```typescript
// Add import near the other Sprint 059/060 tool imports:
import { registerCalibrationTools } from "./calibrationTools.js";

// Add entry to toolRegistry array (append after registerEvidenceTools):
  registerCalibrationTools,  // Task 1129: get_calibration_report (+1 tool → 89)
```

In `src/interface/mcp/tools/index.ts`, add:

```typescript
export { registerCalibrationTools } from "./calibrationTools.js";
```

---

### FR-5: `08-prediction-synthesizer.md` self-assessment Step 0

The Cowork Refactory Expert (Task 1130) inserts a new Step 0 before the existing Step 1. The Step 0 block must contain exactly:

- Call `get_calibration_report()` with no arguments (latest snapshot).
- If response contains "No calibration data available yet": proceed to Step 1 unchanged.
- If response contains "degrading" AND the trend_delta visible in the report exceeds 0.05 (i.e., the text shows a `+0.05x` or higher delta): apply `confidence = confidence * 0.90` to every claim generated in this run, with the result clamped to `[0.05, 0.95]`.
- Append a note to the WORK channel message for this run: "Self-correction applied: confidence reduced 10% due to degrading calibration (trend_delta > 0.05)."
- No confidence adjustment in all other cases (improving, stable, no data).

This is authored exclusively by the Cowork Refactory Expert and lives in `.claude/agents/08-prediction-synthesizer.md`. Developer task 1128 does not touch this file.

---

## Task Breakdown

| ID | Title | Layer | Size | Depends On | Test File |
|---|---|---|---|---|---|
| 1127 | `calibration_snapshots` DDL + `calibrationSnapshotStore.ts` CRUD | infrastructure | S | — | `1127-calibration-snapshot-store.test.ts` |
| 1128 | `calibrationReportJob.ts` weekly computation + Telegram digest + `jobs.ts` registration | scheduler | M | 1127 | `1128-calibration-report-job.test.ts` |
| 1129 | `get_calibration_report` MCP tool + `registry.ts` registration (+1 tool → 89) | interface | S | 1127 | `1129-calibration-tools.test.ts` |
| 1130 | `08-prediction-synthesizer.md` self-assessment Step 0 (Cowork Refactory Expert) | interface/Cowork | S | 1129 | AC-10 (file existence + content check) |

**Dependency batches:**

- Batch A (no dependencies): **1127**
- Batch B (after 1127): **1128** (needs store write function), **1129** (needs store read functions)
- Batch C (after 1129 is deployed and `get_calibration_report` is live): **1130** (agent Step 0 references the tool)

Task 1130 must be authored by the Cowork Refactory Expert agent — not the Developer. The Developer does not touch `.claude/agents/`.

**Task 1127 sub-steps (developer guidance):**
1. Append `calibration_snapshots` DDL to `initDatabase()` in `schema.ts` (after `prediction_claims` block).
2. Create `calibrationSnapshotStore.ts` with `insertCalibrationSnapshot`, `getLatestCalibrationSnapshot`, `getCalibrationSnapshotByDate`, `getPreviousCalibrationSnapshot`.
3. Write `1127-calibration-snapshot-store.test.ts` using `:memory:` database — all four functions, edge cases for empty table, NULL `avg_brier_score`, re-run idempotency (two rows same date, latest returned).

**Task 1128 sub-steps (developer guidance):**
1. Write `calibrationReportJob.ts`:
   - `runCalibrationReport(db?)` — full 12-step computation from REQ-060 FR-2.
   - `sendCalibrationDigest(snapshot, db)` — private helper with dual-channel Telegram.
   - `runCalibrationReportJob()` — `recordJobRun` wrapper.
2. Register in `jobs.ts`: add `CRONS.calibrationReport`, import, cron callback.
3. Write `1128-calibration-report-job.test.ts` covering AC-1 through AC-4, AC-8, AC-9 (Telegram mocked).

**Task 1129 sub-steps (developer guidance):**
1. Create `calibrationTools.ts` with `registerCalibrationTools`.
2. Add import + entry to `registry.ts`. Add re-export to `index.ts`.
3. Update `docs/data/tool-registry.json` (+1 entry), `docs/data/cron-registry.json` (+1 entry), `docs/data/project-stats.json` (`toolCount` 88→89, `schedulerFileCount` 26→27).
4. Write `1129-calibration-tools.test.ts` covering AC-5 through AC-7 (direct function call, not full MCP server wiring).

---

## Test File Specifications

### `1127-calibration-snapshot-store.test.ts`
- Schema helper creates `calibration_snapshots` table in `:memory:`
- `insertCalibrationSnapshot` inserts row, returns non-zero id
- `insertCalibrationSnapshot` serialises JSON fields correctly (round-trip parse)
- `getLatestCalibrationSnapshot` returns null on empty table
- `getLatestCalibrationSnapshot` returns the row with highest id when two rows exist for same date
- `getCalibrationSnapshotByDate` returns null for unknown date
- `getCalibrationSnapshotByDate` returns the latest row (highest id) for a date with two rows
- `getPreviousCalibrationSnapshot` returns null when no prior row exists
- `getPreviousCalibrationSnapshot` returns the correct row when prior row exists

### `1128-calibration-report-job.test.ts`
- `runCalibrationReport` with empty `prediction_claims` → snapshot row has `total_resolved=0`, `avg_brier_score=null`, JSON fields are `{}` or `[]` (AC-1)
- `runCalibrationReport` with 4 resolved claims → correct `total_resolved`, `avg_brier_score`, direction averages, stock filter applied (AC-2)
- `runCalibrationReport` with 10 claims spanning multiple confidence buckets → `calibration_curve` has correct `actual_hit_rate`, empty buckets omitted (AC-3)
- `runCalibrationReport` with previous snapshot present → `trend_delta` computed correctly (AC-4)
- `sendCalibrationDigest` with `total_resolved=0` → WORK send called, MARKET send NOT called (AC-8)
- `sendCalibrationDigest` with `total_resolved=5` → both channels called (AC-9)
- `runCalibrationReportJob` calls `recordJobRun` (observability wrapper present)

### `1129-calibration-tools.test.ts`
- Tool handler with empty `calibration_snapshots` → returns "No calibration data" string, no throw (AC-5)
- Tool handler with snapshot `total_resolved=23`, `avg_brier_score=0.142`, `trend_delta=-0.018` → output contains all required sections (AC-6)
- Tool handler with `date="2026-04-06"` when two snapshots exist → returns 2026-04-06 snapshot data (AC-7)
- Tool handler with `total_resolved=0` snapshot → returns "no resolved predictions" message, not the full formatted report

---

## DDD Invariant Checklist

1. `calibrationSnapshotStore.ts` is in `src/infrastructure/db/`. It does NOT import from `src/domain/`. Pure CRUD — all aggregation arithmetic lives in `calibrationReportJob.ts`. Confirmed by design.
2. `calibrationReportJob.ts` is in `src/scheduler/`. It imports from both `src/infrastructure/db/calibrationSnapshotStore.ts` and `src/infrastructure/db/predictionClaimStore.ts`. It MAY import `computeBrierScore` from `src/domain/services/baseRateComputer.ts` if needed for any on-the-fly Brier check, but since brier_score is already persisted on resolved claims, direct import is not required — the scheduler reads `brier_score` directly from SQLite rows. No domain import is strictly necessary for Phase D.
3. `calibrationTools.ts` is in `src/interface/mcp/tools/`. It imports from `src/infrastructure/db/calibrationSnapshotStore.ts` (read functions only) and calls `getDb()`. It does NOT import from `src/domain/`. The interface layer reads data from infrastructure; it does not compute.
4. All SQLite queries in `calibrationSnapshotStore.ts` use parameterized bindings (`?` positional). No template-literal SQL with user input.
5. Telegram sends in `calibrationReportJob.ts` use `sendTelegramWork` and `sendTelegramMarket` from `../infrastructure/notifiers/telegram.js` via dynamic import — matching the exact pattern in `eveningSummaryJob.ts` (line 79) and `dataAuditJob.ts` (line 277).
6. Tool count: 88 + 1 = **89** after this sprint. Confirmed.
7. Scheduler file count: 26 + 1 = **27** after this sprint. Confirmed.
8. No new environment secrets required. `TELEGRAM_INFO_MARKET_GROUP_ID` and `TELEGRAM_INFO_WORK_CHANNEL_ID` are existing env vars used by every other digest job.

---

## Schedule Conflict Verification

| Job | Cron | UTC | VN |
|---|---|---|---|
| `devTeamHeartbeat` | `0 7 * * 0` | Sun 07:00 | Sun 14:00 |
| `predictionOutcomeJob` | `0 8 * * 0` | Sun 08:00 | Sun 15:00 |
| **`calibrationReportJob`** | **`0 13 * * 0`** | **Sun 13:00** | **Sun 20:00** |
| `weeklyPortfolioReportJob` | `0 16 * * 0` | Sun 16:00 | Sun 23:00 |
| `baseRateComputationJob` | `0 19 * * 0` | Sun 19:00 | Mon 02:00 |
| `dataAuditWeekly` | `0 1 * * 0` | Sun 01:00 | Sun 08:00 |

`calibrationReportJob` at 13:00 UTC has a 3-hour gap before `weeklyPortfolioReport` (16:00 UTC) and is 5 hours after `predictionOutcomeJob` (08:00 UTC). No conflicts. `calibrationReportJob` reads `prediction_claims` (written by `predictionResolutionJob`, which runs nightly at 16:30 UTC) — on Sunday the most recent resolution pass is Saturday night's 16:30 UTC run, so data is current. `baseRateComputationJob` at 19:00 UTC reads `evidence_fragments`, not `prediction_claims` — no data dependency or ordering constraint with `calibrationReportJob`.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `prediction_claims` has 0 resolved rows for first 1–2 weeks after Phase C deploy | High (expected) | None | `runCalibrationReport` writes a zero-state snapshot row with `total_resolved=0`. WORK channel notified. MARKET channel skipped. Explicitly tested in AC-1. |
| All claims in window have `brier_score IS NULL` (all unresolvable) | Low | Low | `avg_brier_score = NULL` (mean of empty set). Report correctly states "0 scorable predictions". Tested in edge-case coverage. |
| Calibration curve has only 1–2 non-empty buckets (sparse data, first 4–6 weeks) | High (expected) | None | The curve is a JSON array of non-empty buckets only. 1 bucket is valid output. The tool notes sparse data without faking entries. |
| `trend_delta` on first run — no previous snapshot | High (first run only) | None | `getPreviousCalibrationSnapshot` returns null → `trend_delta = NULL` → tool omits trend line. Tested in AC-5. |
| Re-run on same Sunday produces duplicate rows | Low | None | Query layer always uses `ORDER BY id DESC LIMIT 1`. Two rows for same date is acceptable and idempotent by design (per REQ-060 business rules). |
| Telegram send failure during digest | Low | Low | Both `sendTelegramMarket` and `sendTelegramWork` calls wrapped in try-catch. Failure logged as warn, not error. `recordJobRun` still called with success (digest failure does not invalidate the computation). |
| `claim_text` Vietnamese Unicode in JSON serialisation | Low | None | Standard `JSON.stringify` handles UTF-8 Unicode correctly. No special encoding. Per REQ-060 edge case notes. |
| `avg_brier_by_direction` missing `neutral` key (rare direction) | Medium | None | Tool output renders missing direction keys as "n/a". `calibrationTools.ts` must use `record?.neutral ?? "n/a"` pattern. |

---

## Security Review

- SQL parameterized? **Yes** — all `calibrationSnapshotStore.ts` queries use `?` positional bindings. `getCalibrationSnapshotByDate` takes a user-supplied `date` string — bound as parameter, never concatenated.
- File paths validated (no `../`)? **N/A** — no file system access in this sprint.
- External HTTP rate-limited? **N/A** — no new external HTTP calls. All data from local SQLite + Telegram notifier (existing, rate-limited by existing circuit breaker).
- Secrets via Bun.env only? **Yes** — no new secrets. Cron schedule override via `Bun.env.CRON_CALIBRATION_REPORT`.
- JSON injection: `avg_brier_by_agent`, `calibration_curve` etc. are produced by the server, not from user input — no injection surface. The `date` parameter in `get_calibration_report` is a string bound as a SQL parameter.
