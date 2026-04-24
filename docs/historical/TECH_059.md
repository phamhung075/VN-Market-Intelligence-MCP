# TECH-059: Prediction Engine Phase B+C — Base Rates + Prediction Claims

status: APPROVED_BY_ARCHITECT
req_ref: REQ-059
sprint: 059
author: Architect

---

## Brownfield Impact

- **Files modified:**
  - `src/infrastructure/db/schema.ts` — add DDL for `evidence_likelihood_ratios` and `prediction_claims`
  - `src/interface/mcp/tools/evidenceTools.ts` — add `get_evidence_summary` + `create_prediction_claim` tools
  - `src/scheduler/jobs.ts` — register `baseRateComputationJob` + `predictionResolutionJob`
  - `docs/data/project-stats.json` — toolCount 84 → 86, schedulerFileCount 24 → 26
  - `docs/data/cron-registry.json` — add 2 new cron entries
  - `docs/data/tool-registry.json` — add 2 new tool entries
  - `.claude/knowledge/agent-roster.md` — add agent 08 row to Analysis Team table

- **Files created:**
  - `src/infrastructure/db/likelihoodRatioStore.ts`
  - `src/infrastructure/db/predictionClaimStore.ts`
  - `src/domain/services/baseRateComputer.ts`
  - `src/scheduler/baseRateComputationJob.ts`
  - `src/scheduler/predictionResolutionJob.ts`
  - `.claude/agents/08-prediction-synthesizer.md`
  - `src/__tests__/1121-likelihood-ratio-store.test.ts`
  - `src/__tests__/1122-base-rate-computation-job.test.ts`
  - `src/__tests__/1123-prediction-claim-store.test.ts`
  - `src/__tests__/1124-evidence-tools-phase-bc.test.ts`
  - `src/__tests__/1125-prediction-resolution-job.test.ts`

- **Files deleted:** none

- **Breaking changes:** none. All new tables use `CREATE TABLE IF NOT EXISTS`. The existing `evidenceTools.ts` is extended, not replaced. Existing `record_evidence_fragment` tool (tool #84, id unchanged) is untouched.

---

## Architecture Decision

Phase B+C follows the established Phase A pattern exactly: infrastructure stores hold no computation logic, domain services hold pure computation functions that receive `db: Database` as a parameter (not via `getDb()`), and scheduler jobs orchestrate both layers. The `08-prediction-synthesizer` is a Cowork agent — it calls MCP tools and writes claims; it does not embed SQL or Brier-score math. This separation means the statistical computation path (scheduler → domain → infrastructure) and the synthesis path (Cowork agent → MCP tools → infrastructure) are entirely decoupled and independently testable.

The two new scheduler jobs (`baseRateComputationJob` weekly, `predictionResolutionJob` nightly) follow the `recordJobRun` wrapper pattern established in Task 1101, making them immediately visible in the existing cron health dashboard without any new observability code.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `evidence_likelihood_ratios` DDL | infrastructure | `src/infrastructure/db/schema.ts` | MODIFY |
| `prediction_claims` DDL | infrastructure | `src/infrastructure/db/schema.ts` | MODIFY |
| `likelihoodRatioStore` | infrastructure | `src/infrastructure/db/likelihoodRatioStore.ts` | NEW |
| `predictionClaimStore` | infrastructure | `src/infrastructure/db/predictionClaimStore.ts` | NEW |
| `baseRateComputer` domain fn | domain | `src/domain/services/baseRateComputer.ts` | NEW |
| `baseRateComputationJob` | scheduler | `src/scheduler/baseRateComputationJob.ts` | NEW |
| `predictionResolutionJob` | scheduler | `src/scheduler/predictionResolutionJob.ts` | NEW |
| `get_evidence_summary` tool | interface | `src/interface/mcp/tools/evidenceTools.ts` | MODIFY |
| `create_prediction_claim` tool | interface | `src/interface/mcp/tools/evidenceTools.ts` | MODIFY |
| `08-prediction-synthesizer` agent | interface/Cowork | `.claude/agents/08-prediction-synthesizer.md` | NEW |
| Cron registration | scheduler | `src/scheduler/jobs.ts` | MODIFY |

---

## Interface Contracts

### 1. `evidence_likelihood_ratios` DDL (add to `initDatabase()` in `schema.ts`)

```sql
CREATE TABLE IF NOT EXISTS evidence_likelihood_ratios (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  evidence_type    TEXT NOT NULL,
  direction        TEXT NOT NULL CHECK(direction IN ('bullish','bearish','neutral')),
  horizon_days     INTEGER NOT NULL CHECK(horizon_days IN (5, 10, 20)),
  likelihood_ratio REAL NOT NULL DEFAULT 1.0,
  sample_size      INTEGER NOT NULL DEFAULT 0,
  last_updated     TEXT NOT NULL,
  UNIQUE(evidence_type, direction, horizon_days)
);
CREATE INDEX IF NOT EXISTS idx_elr_type_dir ON evidence_likelihood_ratios(evidence_type, direction);
```

Placement: append after the `evidence_scores` DDL block (inserted by Phase A, Task 1116).

### 2. `prediction_claims` DDL (add to `initDatabase()` in `schema.ts`)

```sql
CREATE TABLE IF NOT EXISTS prediction_claims (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  stock                TEXT NOT NULL,
  claim_text           TEXT NOT NULL,
  probability          REAL NOT NULL CHECK(probability BETWEEN 0.0 AND 1.0),
  horizon_days         INTEGER NOT NULL CHECK(horizon_days IN (5, 10, 20)),
  resolution_date      TEXT NOT NULL,
  resolution_criteria  TEXT NOT NULL,
  resolved             INTEGER NOT NULL DEFAULT 0,
  resolution_outcome   INTEGER CHECK(resolution_outcome IN (NULL, 0, 1)),
  brier_score          REAL CHECK(brier_score BETWEEN 0.0 AND 1.0),
  created_at           TEXT NOT NULL,
  resolved_at          TEXT,
  synthesizer_version  TEXT NOT NULL DEFAULT '08-prediction-synthesizer'
);
CREATE INDEX IF NOT EXISTS idx_pc_stock_resolved ON prediction_claims(stock, resolved);
CREATE INDEX IF NOT EXISTS idx_pc_resolution_date ON prediction_claims(resolution_date);
```

Important note on `CHECK(resolution_outcome IN (NULL, 0, 1))`: SQLite evaluates `NULL IN (...)` as NULL (falsy), so this constraint does not block NULL values. The column accepts NULL correctly without requiring a workaround.

Placement: append after `evidence_likelihood_ratios` DDL.

### 3. `likelihoodRatioStore.ts` — exported interface

```typescript
// src/infrastructure/db/likelihoodRatioStore.ts

export interface LikelihoodRatioRow {
  id: number;
  evidence_type: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  horizon_days: 5 | 10 | 20;
  likelihood_ratio: number;
  sample_size: number;
  last_updated: string;
}

export interface UpsertLikelihoodRatioInput {
  evidence_type: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  horizon_days: 5 | 10 | 20;
  likelihood_ratio: number;
  sample_size: number;
}

/**
 * Upsert a likelihood ratio row.
 * Uses INSERT OR REPLACE on UNIQUE(evidence_type, direction, horizon_days).
 * Business rule: if sample_size < 10, stores likelihood_ratio = 1.0 with actual sample_size.
 */
export function upsertLikelihoodRatio(
  db: Database,
  input: UpsertLikelihoodRatioInput,
): void

/**
 * Get all likelihood ratio rows for a given evidence_type and direction.
 * Returns one row per horizon_days (5, 10, 20) that exists.
 * Returns [] if no rows exist yet (first run before any data).
 */
export function getLikelihoodRatios(
  db: Database,
  evidenceType: string,
  direction: 'bullish' | 'bearish' | 'neutral',
): LikelihoodRatioRow[]

/**
 * Get the likelihood ratio for a specific triple.
 * Returns 1.0 (neutral) if no row exists OR if sample_size < 10.
 * Never throws — the caller relies on this being safe.
 */
export function getLikelihoodRatio(
  db: Database,
  evidenceType: string,
  direction: 'bullish' | 'bearish' | 'neutral',
  horizonDays: 5 | 10 | 20,
): number

/**
 * Return all distinct (evidence_type, direction) pairs currently in the table.
 * Used by baseRateComputationJob to enumerate what needs recomputation.
 */
export function getAllEvidenceTypePairs(
  db: Database,
): Array<{ evidence_type: string; direction: string }>
```

### 4. `predictionClaimStore.ts` — exported interface

```typescript
// src/infrastructure/db/predictionClaimStore.ts

export interface ResolutionCriteria {
  metric: 'price_close' | 'price_change_pct';
  operator: '>' | '<' | '>=' | '<=';
  value: number;
  currency: string;
  description: string;
}

export interface PredictionClaimInput {
  stock: string;
  claim_text: string;
  probability: number;          // clamped to [0.01, 0.99] by MCP tool before insert
  horizon_days: 5 | 10 | 20;
  resolution_date: string;      // ISO date YYYY-MM-DD, computed by MCP tool
  resolution_criteria: string;  // validated JSON string
  created_at: string;           // ISO 8601, set by MCP tool
  synthesizer_version?: string; // defaults to '08-prediction-synthesizer'
}

export interface PredictionClaimRow extends PredictionClaimInput {
  id: number;
  resolved: 0 | 1;
  resolution_outcome: 0 | 1 | null;
  brier_score: number | null;
  resolved_at: string | null;
}

/**
 * Insert a new prediction claim.
 * Uses INSERT OR IGNORE on (stock, claim_text, resolution_date).
 * Returns: { id: number, duplicate: false } on insert, { id: 0, duplicate: true } if skipped.
 */
export function insertPredictionClaim(
  db: Database,
  input: PredictionClaimInput,
): { id: number; duplicate: boolean }

/**
 * Fetch unresolved claims whose resolution_date <= dateStr (ISO date).
 * Used by predictionResolutionJob.
 */
export function getUnresolvedExpiredClaims(
  db: Database,
  dateStr: string,
): PredictionClaimRow[]

/**
 * Mark a claim as resolved. Sets resolved=1, resolution_outcome, brier_score, resolved_at.
 * outcome=null means unresolvable (no price data after 5-day retry window).
 */
export function resolveClaimById(
  db: Database,
  id: number,
  outcome: 0 | 1 | null,
  brierScore: number | null,
): void

/**
 * Get all prediction claims for a stock (most recent first).
 * Optionally filter to resolved=0 or resolved=1.
 */
export function getPredictionClaims(
  db: Database,
  stock: string,
  resolvedFilter?: 0 | 1,
): PredictionClaimRow[]
```

### 5. `baseRateComputer.ts` — domain service

```typescript
// src/domain/services/baseRateComputer.ts

import type { Database } from "bun:sqlite";

/**
 * Compute the unconditional base rate: fraction of historical horizon-day windows
 * where the absolute price change exceeded 3%.
 *
 * Data source: daily_ohlcv table (queried directly via db parameter).
 * Domain layer — no infrastructure imports, db is injected.
 *
 * @param stock        Ticker code
 * @param horizonDays  5 | 10 | 20
 * @param db           SQLite database (injected — domain never calls getDb())
 * @returns            Fraction in [0.0, 1.0]. Returns 0.5 if fewer than 10 windows.
 */
export function computeRollingBaseRate(
  stock: string,
  horizonDays: 5 | 10 | 20,
  db: Database,
): number

/**
 * Compute the Brier score for a single prediction.
 * Formula: (probability - outcome)^2
 * outcome must be 0 or 1 (not null — caller ensures resolution is complete).
 *
 * Pure function — no I/O.
 */
export function computeBrierScore(probability: number, outcome: 0 | 1): number

/**
 * Clamp a likelihood ratio to [0.1, 5.0].
 * Pure function — no I/O.
 */
export function clampLikelihoodRatio(ratio: number): number
```

**Implementation notes for `computeRollingBaseRate`:**

The function queries `daily_ohlcv` for all closing prices for the given stock ordered by date ascending. It then constructs rolling windows of `horizonDays` rows: for each window starting at index `i`, it takes `close[i]` and `close[i + horizonDays]` and computes `abs((close[i+h] - close[i]) / close[i]) * 100`. If this exceeds 3.0, the window counts as a "hit". The base rate is `hits / total_windows`. Minimum 10 windows required before returning a non-default value; otherwise returns 0.5.

The SQL query is a simple `SELECT date, close FROM daily_ohlcv WHERE code = ? ORDER BY date ASC`. The window logic is pure TypeScript, not SQL — this keeps the function easily unit-testable with an in-memory database containing injected rows.

### 6. `baseRateComputationJob.ts` — scheduler

```typescript
// src/scheduler/baseRateComputationJob.ts

export interface BaseRateJobResult {
  triplesProcessed: number;
  triplesUpserted: number;
  stocksWithInsufficientSamples: number;
}

/**
 * Core computation logic (injectable db for testing).
 * Recomputes likelihood ratios for all (evidence_type, direction, horizon_days)
 * triples found in evidence_fragments.
 */
export async function runBaseRateComputation(db?: Database): Promise<BaseRateJobResult>

/**
 * Cron-callable wrapper. Uses recordJobRun for observability.
 * Called weekly: Sunday 19:00 UTC (02:00 VN Monday).
 */
export async function runBaseRateComputationJob(): Promise<void>
```

**Computation algorithm (step-by-step, per the spec):**

1. Query distinct `(evidence_type, direction)` pairs from `evidence_fragments`.
2. For each pair and each horizon in `[5, 10, 20]`:
   a. Query evidence_fragments rows for this `(evidence_type, direction)` that are older than `horizon_days` days (so outcomes are resolvable): `WHERE evidence_type = ? AND direction = ? AND timestamp < datetime('now', '-' || ? || ' days')`.
   b. For each such fragment row: look up `daily_ohlcv` close price for `stock` at `timestamp` and at `timestamp + horizon_days` calendar days (use nearest available date on or after for the horizon date, nearest on or before for the base date). Determine outcome: did `close_at_horizon / close_at_base - 1` exceed +3% for bullish, or drop below -3% for bearish? (For neutral direction, any ±3% move counts as a "move".)
   c. `hit_rate = correct_outcomes / resolvable_fragments` (skip fragments with no price data on either end).
   d. Call `computeRollingBaseRate(stock, horizonDays, db)` for each distinct stock in the fragment set, average across all stocks for the base rate denominator.
   e. `likelihood_ratio = clampLikelihoodRatio(hit_rate / base_rate)`. If `base_rate = 0`, log warning and set `likelihood_ratio = 1.0`.
   f. Call `upsertLikelihoodRatio(db, { evidence_type, direction, horizon_days, likelihood_ratio, sample_size })`.
   g. If `sample_size < 10`: upsert `likelihood_ratio = 1.0` with actual `sample_size`.

**Performance constraint:** This job may be slow (full table scan over evidence_fragments for each triple). This is acceptable — it runs weekly at 02:00 VN when no other jobs compete. No optimization required until the job exceeds 60 seconds on real data.

### 7. `predictionResolutionJob.ts` — scheduler

```typescript
// src/scheduler/predictionResolutionJob.ts

export interface ResolutionJobResult {
  examined: number;
  resolved: number;
  unresolvable: number;   // marked as resolved=1 with NULL outcome after 5-day retry
  retried: number;        // still within 5-day retry window, left as resolved=0
}

/**
 * Core resolution logic (injectable db for testing).
 */
export async function runPredictionResolution(db?: Database): Promise<ResolutionJobResult>

/**
 * Cron-callable wrapper. Uses recordJobRun for observability.
 * Called nightly at 16:30 UTC (23:30 VN).
 */
export async function runPredictionResolutionJob(): Promise<void>
```

**Resolution algorithm:**

1. Call `getUnresolvedExpiredClaims(db, today_date)`.
2. For each claim:
   a. Parse `resolution_criteria` JSON.
   b. Look up closing price: query `daily_ohlcv WHERE code = ? AND date <= ? ORDER BY date DESC LIMIT 1` using `resolution_date` as the upper bound.
   c. If no price found: check if `resolution_date + 5 calendar days < today`. If within retry window → skip (leave `resolved=0`). If past retry window → call `resolveClaimById(db, id, null, null)` (unresolvable).
   d. If price found: evaluate `resolution_criteria` — apply `operator` to compare `actual_price` against `value`. `outcome = criteria_met ? 1 : 0`.
   e. `brierScore = computeBrierScore(claim.probability, outcome)`.
   f. Call `resolveClaimById(db, id, outcome, brierScore)`.
3. Return result summary.

### 8. `get_evidence_summary` MCP tool — schema

```typescript
// In src/interface/mcp/tools/evidenceTools.ts (extend registerEvidenceTools)

server.tool(
  "get_evidence_summary",
  "Returns the current evidence picture for a single stock: latest evidence scores, " +
    "top 5 contributing fragments by magnitude*confidence, and applicable likelihood ratios " +
    "from evidence_likelihood_ratios for the bullish direction at 10-day horizon. " +
    "If no evidence has been accumulated yet for the stock, returns a clear message. " +
    "Data is at most 23 hours stale (sourced from nightly evidence_scores aggregate).",
  {
    stock: z.string().min(1).describe("Stock ticker, e.g. 'VNM'"),
  },
  async ({ stock }) => { ... }
)
```

**Tool output construction logic:**
1. Call `getLatestEvidenceScore(db, stock.toUpperCase().trim())` — if null, return "No evidence accumulated yet for {STOCK}".
2. Query `evidence_fragments` for top 5 fragments: `SELECT * FROM evidence_fragments WHERE stock = ? ORDER BY (magnitude * confidence) DESC LIMIT 5`.
3. For each of those top fragments: call `getLikelihoodRatio(db, evidence_type, 'bullish', 10)` to get their ratio (returns 1.0 with no error if absent).
4. Query `getLikelihoodRatios(db, evidence_type, 'bullish')` for horizon=10 for all top fragment types — display with TRUSTED/UNTRUSTED label based on `sample_size >= 10`.
5. Format as the text block shown in REQ-059 FR-5.

### 9. `create_prediction_claim` MCP tool — schema

```typescript
server.tool(
  "create_prediction_claim",
  "Insert a structured, falsifiable prediction claim for a stock. " +
    "Intended to be called by the 08-prediction-synthesizer Cowork agent. " +
    "resolution_criteria must be valid JSON with fields: metric, operator, value, currency, description. " +
    "Duplicate claims (same stock + claim_text + resolution_date) are silently skipped.",
  {
    stock: z.string().min(1),
    claim_text: z.string().min(1),
    probability: z.number().min(0.01).max(0.99),
    horizon_days: z.union([z.literal(5), z.literal(10), z.literal(20)]),
    resolution_criteria: z.string().min(1),
  },
  async ({ stock, claim_text, probability, horizon_days, resolution_criteria }) => { ... }
)
```

**Tool logic:**
1. Attempt `JSON.parse(resolution_criteria)` — on failure return error string (no throw).
2. Compute `resolution_date = addCalendarDays(today, horizon_days)` as `YYYY-MM-DD` string.
3. Call `insertPredictionClaim(db, { stock: stock.toUpperCase().trim(), claim_text, probability, horizon_days, resolution_date, resolution_criteria, created_at: now.toISOString() })`.
4. If `duplicate: true` → return "Duplicate claim skipped: identical claim already exists for {STOCK} resolving on {date}".
5. Otherwise return confirmation with `id` and `resolution_date`.

---

## Task Breakdown (for PM)

| ID | Title | Layer | Size | Depends On | Test File |
|---|---|---|---|---|---|
| 1121 | `evidence_likelihood_ratios` DDL + `likelihoodRatioStore.ts` CRUD | infrastructure | S | — | `1121-likelihood-ratio-store.test.ts` |
| 1122 | `baseRateComputer.ts` domain service + `baseRateComputationJob.ts` weekly scheduler | domain + scheduler | M | 1121 | `1122-base-rate-computation-job.test.ts` |
| 1123 | `prediction_claims` DDL + `predictionClaimStore.ts` CRUD | infrastructure | S | — | `1123-prediction-claim-store.test.ts` |
| 1124 | `get_evidence_summary` + `create_prediction_claim` MCP tools (+2 tools) | interface | M | 1121, 1123 | `1124-evidence-tools-phase-bc.test.ts` |
| 1125 | `predictionResolutionJob.ts` nightly resolver + cron registration | scheduler | M | 1123 | `1125-prediction-resolution-job.test.ts` |
| 1126 | `08-prediction-synthesizer.md` Cowork agent (authored by Cowork Refactory Expert) | interface/Cowork | M | 1124 | AC-8 (file existence check) |

**Dependency batches:**
- Batch A (no dependencies — run in parallel): 1121, 1123
- Batch B (after A): 1122 (needs 1121), 1124 (needs 1121 + 1123), 1125 (needs 1123)
- Batch C (after B): 1126 (needs 1124 tools registered on server)

**Task 1122 sub-steps (developer guidance):**
1. Write `baseRateComputer.ts` with `computeRollingBaseRate`, `computeBrierScore`, `clampLikelihoodRatio`.
2. Write `baseRateComputationJob.ts` importing both `baseRateComputer.ts` (domain) and `likelihoodRatioStore.ts` (infrastructure).
3. Register in `jobs.ts` — add `CRONS.baseRateComputation` key (`0 19 * * 0`), import and call `runBaseRateComputationJob`.

**Task 1125 sub-steps (developer guidance):**
1. Write `predictionResolutionJob.ts` importing `predictionClaimStore.ts` and `baseRateComputer.ts` (for `computeBrierScore`).
2. Register in `jobs.ts` — add `CRONS.predictionResolution` key (`30 16 * * *`), import and call `runPredictionResolutionJob`.

**Task 1126 must be authored by Cowork Refactory Expert, not by Developer.** Developer does not touch `.claude/agents/`. The agent file path is `.claude/agents/08-prediction-synthesizer.md`. Cowork Refactory Expert also updates `.claude/knowledge/agent-roster.md` (Analysis Team table: add row for agent 08).

---

## Schema migration strategy

Both new tables use `CREATE TABLE IF NOT EXISTS` and are appended at the end of `initDatabase()`. No ALTER TABLE migrations are needed. The schema is additive and backward-compatible with all existing production data. The Phase D calibration job (Sprint 060) will read from `prediction_claims` — it has no schema dependency on this sprint beyond the table existing.

---

## `jobs.ts` registration additions

The following keys must be added to the `CRONS` constant in `src/scheduler/jobs.ts`:

```typescript
/** Base rate recomputation: weekly Sunday 19:00 UTC = 02:00 VN Monday */
baseRateComputation: Bun.env.CRON_BASE_RATE_COMPUTATION ?? '0 19 * * 0',

/** Prediction claim resolution: nightly 16:30 UTC = 23:30 VN */
predictionResolution: Bun.env.CRON_PREDICTION_RESOLUTION ?? '30 16 * * *',
```

And the cron callbacks:

```typescript
// Sunday 19:00 UTC — Base rate computation — task 1122, Sprint 059
cron.schedule(CRONS.baseRateComputation, async () => {
  await runBaseRateComputationJob()
}, { timezone: 'UTC' })

// Nightly 16:30 UTC — Prediction resolution — task 1125, Sprint 059
cron.schedule(CRONS.predictionResolution, async () => {
  await runPredictionResolutionJob()
}, { timezone: 'UTC' })
```

After registration: `Object.keys(CRONS).length` goes from 29 to 31.

---

## Tool count confirmation

- Before sprint 059: 84 tools (confirmed from `docs/data/project-stats.json`)
- Task 1124 adds: `get_evidence_summary` (+1) + `create_prediction_claim` (+1) = +2
- After sprint 059: **86 tools**

The existing `record_evidence_fragment` tool (Phase A, Task 1117) is tool #85 at time of shipping, remains unchanged.

---

## `08-prediction-synthesizer.md` agent design

**File path:** `.claude/agents/08-prediction-synthesizer.md`
**Authored by:** Cowork Refactory Expert (Task 1126)
**Not a developer task** — this file lives entirely in Cowork territory.

The Cowork Refactory Expert must produce a file that includes:

1. **Role definition:** Pre-market prediction synthesizer. Monday 07:30 VN (00:30 UTC). Not triggered reactively — only scheduled.

2. **Prerequisite check:** Before running, verify `get_evidence_summary(stock)` returns data for at least one stock. If zero stocks have evidence, log via `send_telegram(channel="work")` and exit.

3. **Protocol (7 steps as per REQ-059 FR-7):**
   - Step 1: `get_watchlist()` — get all monitored tickers.
   - Step 2: For each ticker, call `get_evidence_summary(stock)`. Skip if response contains "No evidence accumulated yet".
   - Step 3: Identify high-conviction stocks: `bullish_score > 0.6` OR `bearish_score > 0.6`. For these, call `get_bctc_full(stock)` and `get_market_snapshot()` for macro context.
   - Step 4: For each high-conviction stock, compute `probability = min(0.95, max(0.05, bullish_score * top_likelihood_ratio))` using the TRUSTED likelihood ratio from the evidence summary (if all ratios are UNTRUSTED, use 1.0). Call `create_prediction_claim(stock, claim_text, probability, horizon_days, resolution_criteria)` with claim_text in Vietnamese and resolution_criteria as valid JSON.
   - Step 5: Cap at 5 claims per run. If more than 5 stocks qualify, select the 5 with the largest `|bullish_score - bearish_score|` delta.
   - Step 6: Call `log_agent_work(agent_name="08-prediction-synthesizer", summary=...)` recording claim count and stock list.
   - Step 7: Call `send_telegram(channel="work", message=...)` with English subject line + Vietnamese claim texts.

4. **VND formatting rule:** All VND amounts in `claim_text` use `80,000 VND` format (comma thousand separator, no dots).

5. **horizon_days selection heuristic:**
   - `|bullish_score - bearish_score| >= 0.5`: horizon = 5 (very high conviction)
   - `|bullish_score - bearish_score| >= 0.3`: horizon = 10 (default)
   - `|bullish_score - bearish_score| < 0.3`: horizon = 20 (lower conviction, longer window)

6. **agent-roster.md update** (also Cowork Refactory Expert's responsibility in Task 1126): add row to Analysis Team table:

```
| 8 | Prediction Synthesizer | `08-prediction-synthesizer.md` | Generate prediction claims pre-market | Monday 07:30 VN |
```

---

## Test file specifications

### `1121-likelihood-ratio-store.test.ts`
- Schema helper creates `evidence_likelihood_ratios` table in `:memory:`
- `upsertLikelihoodRatio` inserts a row and is idempotent on re-run
- `upsertLikelihoodRatio` stores `likelihood_ratio = 1.0` when `sample_size < 10`
- `getLikelihoodRatio` returns 1.0 for missing rows (no throw)
- `getLikelihoodRatio` returns 1.0 for rows with `sample_size < 10`
- `getAllEvidenceTypePairs` returns correct pairs

### `1122-base-rate-computation-job.test.ts`
- `computeRollingBaseRate` returns 0.5 with fewer than 10 windows
- `computeRollingBaseRate` correctly computes fraction from synthetic price data
- `computeBrierScore(0.7, 1) === 0.09` (within floating-point tolerance)
- `computeBrierScore(0.7, 0) === 0.49`
- `clampLikelihoodRatio` clamps below 0.1 and above 5.0
- `runBaseRateComputation` with sparse data (< 10 samples) produces `likelihood_ratio = 1.0` rows
- `runBaseRateComputationJob` calls `recordJobRun` (observability wrapper present)

### `1123-prediction-claim-store.test.ts`
- `insertPredictionClaim` inserts row and returns `{ id, duplicate: false }`
- `insertPredictionClaim` returns `{ id: 0, duplicate: true }` on duplicate `(stock, claim_text, resolution_date)`
- `getUnresolvedExpiredClaims` returns only `resolved=0` rows with `resolution_date <= today`
- `resolveClaimById` sets `resolved=1`, correct `resolution_outcome`, `brier_score`, `resolved_at`
- `resolveClaimById` with `outcome=null` sets `brier_score=null`
- `getPredictionClaims` filters by stock and optional resolved flag

### `1124-evidence-tools-phase-bc.test.ts`
- `get_evidence_summary` returns "No evidence accumulated yet for X" when no evidence_scores row
- `get_evidence_summary` returns correct Bullish/Bearish/Neutral values when scores exist
- `get_evidence_summary` returns top 5 fragments ordered by magnitude*confidence
- `get_evidence_summary` shows UNTRUSTED label for ratios with n < 10
- `create_prediction_claim` inserts row and returns id + resolution_date
- `create_prediction_claim` returns error string for invalid JSON (no row inserted)
- `create_prediction_claim` returns "Duplicate claim skipped" on re-insert

### `1125-prediction-resolution-job.test.ts`
- `runPredictionResolution` resolves a claim with price data → `resolved=1`, correct outcome + Brier
- `runPredictionResolution` leaves claim `resolved=0` when no price data within 5-day retry window
- `runPredictionResolution` marks claim unresolvable (`resolved=1`, `outcome=NULL`) after 5-day window
- `runPredictionResolution` correctly applies `>` and `<` operators from resolution_criteria

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `daily_ohlcv` is sparse for some stocks (< 10 windows) | Medium | Low | `computeRollingBaseRate` returns 0.5 neutral prior; `upsertLikelihoodRatio` stores 1.0 for n<10. Correct behavior documented in edge cases. |
| `baseRateComputationJob` first run produces all 1.0 ratios (no fragments yet) | High (expected first run) | None | This is correct and expected behavior per REQ-059. Ratios populate over time. Accepted. |
| Price lookup for `predictionResolutionJob` fails due to missing `daily_ohlcv` rows on VN market closure days | Medium | Low | Resolution job uses `date <= resolution_date ORDER BY date DESC LIMIT 1` — picks nearest prior close. Covered by 5-day retry window as backup. |
| TypeScript `CHECK(resolution_outcome IN (NULL, 0, 1))` column constraint semantics | Low | Medium | SQLite evaluates `NULL IN (...)` as NULL (not a constraint violation). Verified correct behavior. NULL outcome is handled by `resolveClaimById` receiving `null` typed parameter. |
| `jobs.ts` Sunday 19:00 UTC conflicts with `predictionOutcome` job at 08:00 UTC | None | None | Different times on the same day (Sunday). No overlap. Verified from existing `CRONS.predictionOutcome = '0 8 * * 0'`. |
| `08-prediction-synthesizer` running before `baseRateComputationJob` completes | None | None | `baseRateComputationJob` runs Sunday 19:00 UTC (02:00 VN Monday). Synthesizer runs Monday 00:30 UTC (07:30 VN Monday). Gap is 5.5 hours — base rates are fully computed and committed to SQLite before the synthesizer reads them. |
| Cowork agent creates 5 claims per Monday; resolution job resolves them 10 days later; first 2 weeks have 0 resolved claims | High (expected) | None | Phase D calibration (Sprint 060) reads from `prediction_claims WHERE resolved=1`. It degrades gracefully on empty set. |
| `resolution_criteria` JSON stored as string — typos in metric/operator values not validated at DB level | Low | Medium | MCP tool validates JSON parse (not schema). Mitigation: `predictionResolutionJob` wraps `JSON.parse` in try-catch and skips malformed criteria, logging a warning. |

---

## Security Review

- SQL parameterized? **Yes** — all stores in this sprint use `db.prepare(sql).run(param, ...)` pattern, matching the existing Phase A stores pattern. No string interpolation of user input.
- File paths validated (no `../`)? **N/A** — no file system access in this sprint.
- External HTTP rate-limited? **N/A** — no new external HTTP calls. All data from local SQLite.
- Secrets via Bun.env only? **Yes** — no new secrets introduced. Cron schedule overrides via `Bun.env.CRON_BASE_RATE_COMPUTATION` and `Bun.env.CRON_PREDICTION_RESOLUTION`.

---

## DDD Invariant Checklist

All invariants from REQ-059 section "Invariants the Architect Must Preserve" are addressed:

1. `baseRateComputer.ts` is in `src/domain/services/`. It receives `db: Database` as a parameter. It does NOT import from `src/infrastructure/`. It imports only from `bun:sqlite` (type-only) — no infrastructure layer import.
2. `predictionClaimStore.ts` is in `src/infrastructure/db/`. It does NOT import from `src/domain/`. Pure infrastructure.
3. `likelihoodRatioStore.ts` only stores and retrieves numbers. Computation of `likelihood_ratio` and `base_rate` lives exclusively in `baseRateComputationJob.ts` (scheduler) via `baseRateComputer.ts` (domain).
4. All SQLite queries use parameterized bindings. Confirmed by design — developer must not use template literals for user-derived values.
5. Tool count: 84 + 2 = **86** after this sprint. Confirmed above.
6. `08-prediction-synthesizer.md` is a Cowork agent file. Developer does not touch `.claude/agents/` for this file.
