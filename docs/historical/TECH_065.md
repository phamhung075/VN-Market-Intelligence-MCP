# TECH-065: Prediction Claim Resolution Loop (Bug Fix)

status: APPROVED_BY_ARCHITECT
req_ref: REQ-065

---

## Brownfield Impact

- Files modified:
  - `src/infrastructure/db/schema.ts` — ALTER TABLE migration for `creation_price` column
  - `src/infrastructure/db/predictionClaimStore.ts` — extend interfaces + INSERT statement
  - `src/scheduler/predictionResolutionJob.ts` — fix `evaluateOutcome()` + pass `creation_price`
  - `src/interface/mcp/tools/evidenceTools.ts` — add `direction` + `expected_move_pct` params, price lookup
- Files created:
  - `src/__tests__/065-prediction-resolution-loop.test.ts`
- Files deleted: none
- Breaking changes: no — `PredictionClaimInput.creation_price` is optional with default `null`; `evaluateOutcome()` is a module-private function (not exported)

---

## Architecture Decision

All four defects are in the interface/infrastructure/scheduler layers. No domain logic is introduced. The fix threads a new `creation_price` value from the MCP tool (computed from `daily_ohlcv`) through the store interface into the resolution evaluator, and adds a direction-only fallback path that unblocks the calibration loop for legacy rows that have `creation_price` but no `target_price`. The changes are additive: every existing caller and schema row remains valid.

---

## DDD Layer Plan

| Component                     | Layer          | File Path                                                      | New/Modify |
| ----------------------------- | -------------- | -------------------------------------------------------------- | ---------- |
| `prediction_claims` DDL       | infrastructure | `src/infrastructure/db/schema.ts`                              | MODIFY     |
| `PredictionClaimInput` / `Row`| infrastructure | `src/infrastructure/db/predictionClaimStore.ts`                | MODIFY     |
| `insertPredictionClaim()`     | infrastructure | `src/infrastructure/db/predictionClaimStore.ts`                | MODIFY     |
| `evaluateOutcome()`           | scheduler      | `src/scheduler/predictionResolutionJob.ts`                     | MODIFY     |
| `runPredictionResolution()`   | scheduler      | `src/scheduler/predictionResolutionJob.ts`                     | MODIFY     |
| `create_prediction_claim` tool| interface      | `src/interface/mcp/tools/evidenceTools.ts`                     | MODIFY     |
| Test suite                    | —              | `src/__tests__/065-prediction-resolution-loop.test.ts`         | NEW        |

---

## Interface Contracts

### FR-2: `PredictionClaimInput` — add optional `creation_price`

```typescript
// src/infrastructure/db/predictionClaimStore.ts

export interface PredictionClaimInput {
  stock: string;
  agent_id: string;
  claim_text: string;
  direction: ClaimDirection;
  target_price?: number | null;
  resolution_date: string;
  confidence: number;
  creation_price?: number | null;   // NEW — nullable, optional for backward compat
}
```

### FR-2: `PredictionClaimRow` — add `creation_price`

```typescript
export interface PredictionClaimRow extends PredictionClaimInput {
  id: number;
  resolution_outcome: number | null;
  actual_price: number | null;
  brier_score: number | null;
  created_at: string;
  resolved_at: string | null;
  creation_price: number | null;    // NEW — always present after migration
}
```

### FR-2: `ClaimDbRow` — add `creation_price`

```typescript
interface ClaimDbRow {
  id: number;
  stock: string;
  agent_id: string;
  claim_text: string;
  direction: string;
  target_price: number | null;
  resolution_date: string;
  confidence: number;
  resolution_outcome: number | null;
  actual_price: number | null;
  brier_score: number | null;
  created_at: string;
  resolved_at: string | null;
  creation_price: number | null;    // NEW
}
```

### FR-3: `evaluateOutcome()` — new signature

```typescript
function evaluateOutcome(
  actualPrice: number,
  direction: string,
  targetPrice: number | null,
  creationPrice: number | null,     // NEW
): 0 | 1 | null
```

---

## Exact Code Changes

### Task 1148 — FR-2: schema.ts ALTER TABLE migration

Insert immediately after line 1288 (after the four `idx_pc_*` index statements, before the calibration snapshots comment):

```typescript
  // Sprint 065 / Task 1148: creation_price column — nullable for legacy rows
  try {
    db.exec(`ALTER TABLE prediction_claims ADD COLUMN creation_price REAL`);
  } catch {
    // Column already exists — safe to ignore
  }
```

The `CREATE TABLE IF NOT EXISTS` block (lines 1268–1284) does NOT need the column added — the ALTER TABLE guard covers both fresh and existing databases consistently with the pattern used throughout schema.ts (see lines 131, 277–279, 717–727 for precedent).

---

### Task 1149 — FR-2: predictionClaimStore.ts — interfaces + INSERT

**Step 1 — Update `PredictionClaimInput`**

Replace:
```typescript
  target_price?: number | null;
  /** ISO 8601 date (YYYY-MM-DD) by which the claim should be resolved */
  resolution_date: string;
```
With:
```typescript
  target_price?: number | null;
  /**
   * Price at claim-creation time (close from daily_ohlcv).
   * Nullable — legacy rows inserted before Sprint 065 have NULL.
   */
  creation_price?: number | null;
  /** ISO 8601 date (YYYY-MM-DD) by which the claim should be resolved */
  resolution_date: string;
```

**Step 2 — Update `PredictionClaimRow`**

Add `creation_price: number | null;` as a field after `brier_score`:
```typescript
  brier_score: number | null;
  creation_price: number | null;    // Sprint 065
  created_at: string;
```

**Step 3 — Update `ClaimDbRow`**

Add after `resolved_at`:
```typescript
  resolved_at: string | null;
  creation_price: number | null;
```

**Step 4 — Update `mapRow()`**

Add the field mapping:
```typescript
function mapRow(r: ClaimDbRow): PredictionClaimRow {
  return {
    id: r.id,
    stock: r.stock,
    agent_id: r.agent_id,
    claim_text: r.claim_text,
    direction: r.direction as ClaimDirection,
    target_price: r.target_price ?? null,
    resolution_date: r.resolution_date,
    confidence: r.confidence,
    resolution_outcome: r.resolution_outcome,
    actual_price: r.actual_price,
    brier_score: r.brier_score,
    creation_price: r.creation_price ?? null,   // NEW
    created_at: r.created_at,
    resolved_at: r.resolved_at,
  };
}
```

**Step 5 — Update `insertPredictionClaim()` SQL + bindings**

Replace the current INSERT (7 columns / 7 params) with:

```typescript
export function insertPredictionClaim(
  db: Database,
  params: PredictionClaimInput,
): number {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO prediction_claims
         (stock, agent_id, claim_text, direction, target_price,
          resolution_date, confidence, creation_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      params.stock,
      params.agent_id,
      params.claim_text,
      params.direction,
      params.target_price ?? null,
      params.resolution_date,
      params.confidence,
      params.creation_price ?? null,
    );

  return result.changes > 0 ? (result.lastInsertRowid as number) : 0;
}
```

---

### Task 1150 — FR-3 + FR-4: predictionResolutionJob.ts — fix evaluateOutcome + pass creation_price

**Step 1 — Replace `evaluateOutcome()`**

Full replacement of the function (lines 58–72):

```typescript
/**
 * Evaluates whether actual price confirms the claim's direction.
 *
 * Decision table:
 *   target non-null, bullish  → actual >= target ? 1 : 0
 *   target non-null, bearish  → actual <= target ? 1 : 0
 *   target null, creation non-null, bullish  → actual > creation ? 1 : 0
 *   target null, creation non-null, bearish  → actual < creation ? 1 : 0
 *   target null, creation null   → null (skip — no baseline)
 *   neutral / other direction    → null (skip)
 */
function evaluateOutcome(
  actualPrice: number,
  direction: string,
  targetPrice: number | null,
  creationPrice: number | null,
): 0 | 1 | null {
  if (targetPrice != null) {
    switch (direction) {
      case "bullish":
        return actualPrice >= targetPrice ? 1 : 0;
      case "bearish":
        return actualPrice <= targetPrice ? 1 : 0;
      default:
        return null;
    }
  }
  // Direction-only fallback — requires creation_price as baseline
  if (creationPrice == null) return null;
  switch (direction) {
    case "bullish":
      return actualPrice > creationPrice ? 1 : 0;
    case "bearish":
      return actualPrice < creationPrice ? 1 : 0;
    default:
      return null;
  }
}
```

**Step 2 — Update the call site in `runPredictionResolution()` (FR-4)**

Replace the existing `evaluateOutcome` call (lines 205–209):

```typescript
      // Evaluate the claim direction against actual price
      const outcome = evaluateOutcome(
        closePrice,
        claim.direction,
        claim.target_price ?? null,
        claim.creation_price ?? null,   // NEW — direction-only fallback baseline
      );
```

No other changes to the loop body. `getClaimsDueForResolution()` already uses `SELECT *` which will return `creation_price` after the migration. `PredictionClaimRow` now carries the field — TypeScript will type-check the access.

---

### Task 1151 — FR-1: evidenceTools.ts — add direction + expected_move_pct, compute target_price

Full replacement of the `create_prediction_claim` tool registration block (lines 295–384):

```typescript
  // ── create_prediction_claim ───────────────────────────────────────────────
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
      direction: z
        .enum(["bullish", "bearish"])
        .describe("Direction of the prediction"),
      expected_move_pct: z
        .number()
        .min(0.001)
        .max(0.5)
        .describe("Expected percentage move, e.g. 0.05 for 5%"),
    },
    async ({
      stock,
      claim_text,
      probability,
      horizon_days,
      resolution_criteria,
      direction,
      expected_move_pct,
    }) => {
      try {
        const database = resolveDb();
        const ticker = stock.toUpperCase().trim();

        // Step 1: validate resolution_criteria JSON
        try {
          JSON.parse(resolution_criteria);
        } catch {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: resolution_criteria is not valid JSON. Please provide a JSON object with fields: metric, operator, value, currency, description.`,
              },
            ],
          };
        }

        // Step 2: look up latest close price from daily_ohlcv
        interface OhlcvRow { close: number }
        const priceRow = database
          .prepare(
            `SELECT close FROM daily_ohlcv WHERE code = ? ORDER BY date DESC LIMIT 1`,
          )
          .get(ticker) as OhlcvRow | null;

        if (!priceRow) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No price data found for ${ticker} — cannot compute target_price`,
              },
            ],
          };
        }

        const creationPrice = priceRow.close;

        // Step 3: compute target_price
        const targetPrice =
          direction === "bullish"
            ? Math.round(creationPrice * (1 + expected_move_pct))
            : Math.round(creationPrice * (1 - expected_move_pct));

        // Step 4: compute resolution_date = today + horizon_days calendar days
        const resolutionDate = new Date();
        resolutionDate.setDate(resolutionDate.getDate() + horizon_days);
        const resolutionDateStr = resolutionDate.toISOString().slice(0, 10);

        // Step 5: insert claim
        const id = insertPredictionClaim(database, {
          stock: ticker,
          agent_id: "08-prediction-synthesizer",
          claim_text,
          direction,
          target_price: targetPrice,
          creation_price: creationPrice,
          resolution_date: resolutionDateStr,
          confidence: probability,
        });

        // Step 6: handle duplicate (INSERT OR IGNORE returned 0)
        if (id === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Duplicate claim skipped: identical claim already exists for ${ticker} resolving on ${resolutionDateStr}`,
              },
            ],
          };
        }

        // Step 7: return confirmation
        return {
          content: [
            {
              type: "text" as const,
              text:
                `Prediction claim created: id=${id}\n` +
                `Stock: ${ticker}\n` +
                `Claim: ${claim_text}\n` +
                `Direction: ${direction}\n` +
                `Probability: ${probability.toFixed(2)}\n` +
                `Expected move: ${(expected_move_pct * 100).toFixed(1)}%\n` +
                `creation_price=${creationPrice} VND\n` +
                `target_price=${targetPrice} VND\n` +
                `Horizon: ${horizon_days} days\n` +
                `resolution_date=${resolutionDateStr}`,
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[create_prediction_claim] Error:", msg);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error creating prediction claim: ${msg}`,
            },
          ],
        };
      }
    },
  );
```

---

### Task 1152 — Tests: 065-prediction-resolution-loop.test.ts

Create `src/__tests__/065-prediction-resolution-loop.test.ts` covering AC-1 through AC-8.

The test file must:
- Import `Database` from `bun:sqlite` and `initDatabase` from `../infrastructure/db/schema.js`
- Use `new Database(":memory:")` + `initDatabase(db)` for full isolation
- Insert real rows into `daily_ohlcv` and `prediction_claims` (no mocks)
- Import `insertPredictionClaim`, `resolveClaim` from `predictionClaimStore`
- Import `runPredictionResolution` from `predictionResolutionJob`
- Use `registerEvidenceTools` via a minimal McpServer stub for AC-1 through AC-3 (tool handler path)

Test cases to cover (map to ACs):

```
AC-1: create_prediction_claim bullish — inserts row with target_price=71925, creation_price=68500, direction=bullish
AC-2: create_prediction_claim bearish — target_price=26287, creation_price=27100, direction=bearish
AC-3: create_prediction_claim no OHLCV — returns error text, zero rows inserted
AC-4: resolution with target_price set — outcome=1, brier=0.09 (VNM close=72000 >= target=71925)
AC-5: resolution direction-only fallback — target=null, creation=88000, close=90000 → outcome=1
AC-6: resolution skip truly legacy — target=null, creation=null → skipped, outcome IS NULL
AC-7: schema migration idempotent — call initDatabase() twice, no throw, column present
AC-8: TypeScript clean — verified by bun tsc --noEmit in CI (not a runtime test)
```

For AC-4 and AC-5, the test must set `resolution_date` to a past date (e.g. `"2026-01-01"`) and call `runPredictionResolution(db)` with the injected in-memory database.

For AC-7, call `initDatabase(db)` a second time on the same in-memory instance and assert no exception is thrown and `PRAGMA table_info(prediction_claims)` returns a row with `name = "creation_price"`.

---

## Task Breakdown

Dependency order: 1148 → 1149 → 1150 → 1151 → 1152

| Task | Title                                                              | Layer          | Depends on |
| ---- | ------------------------------------------------------------------ | -------------- | ---------- |
| 1148 | FR-2 (DDL): ALTER TABLE migration in schema.ts                     | infrastructure | —          |
| 1149 | FR-2 (store): PredictionClaimInput/Row/ClaimDbRow + INSERT update  | infrastructure | 1148       |
| 1150 | FR-3 + FR-4: Fix evaluateOutcome() + pass creation_price in loop   | scheduler      | 1149       |
| 1151 | FR-1: Add direction + expected_move_pct + price lookup to tool     | interface      | 1149       |
| 1152 | Tests: 065-prediction-resolution-loop.test.ts (AC-1 to AC-7)       | —              | 1150, 1151 |

All five tasks are in one branch: `task/1148-prediction-resolution-loop`.

---

## Test Plan

### Unit path (Task 1152)

| AC  | Setup                                                                | Assert                                                              |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| AC-1 | Insert daily_ohlcv(VNM, close=68500). Call tool bullish 5%.          | Row has target_price=71925, creation_price=68500, direction=bullish |
| AC-2 | Insert daily_ohlcv(HPG, close=27100). Call tool bearish 3%.          | Row has target_price=26287, creation_price=27100                    |
| AC-3 | No daily_ohlcv row for UNKNOWN. Call tool.                           | Zero rows inserted; response contains "No price data found for UNKNOWN" |
| AC-4 | Insert claim: target=71925, creation=68500, direction=bullish, date=2026-01-01. Insert ohlcv(VNM, 2026-01-01, close=72000). Run resolution. | outcome=1, brier=0.09 |
| AC-5 | Insert claim: target=null, creation=88000, direction=bullish, date=2026-01-01. Insert ohlcv(VCB, 2026-01-01, close=90000). Run resolution. | outcome=1, brier=0.1225 |
| AC-6 | Insert claim: target=null, creation=null, direction=bullish, date=2026-01-01. Insert ohlcv for that date. Run resolution. | outcome IS NULL; result.skipped=1 |
| AC-7 | Call initDatabase(db) twice on same in-memory db.                    | No exception; PRAGMA table_info has creation_price row              |

### Integration check (manual, post-merge)

```bash
bun tsc --noEmit                              # must be zero errors
bun test src/__tests__/065-prediction-resolution-loop.test.ts
curl -s http://localhost:3000/health          # server still healthy after launchctl restart
```

---

## Risk Assessment

| Risk                                                       | Probability | Impact | Mitigation                                                            |
| ---------------------------------------------------------- | ----------- | ------ | --------------------------------------------------------------------- |
| `SELECT *` in `getClaimsDueForResolution` returns null for `creation_price` on old rows | High | Low | `claim.creation_price ?? null` guard at call site (FR-4 spec); evaluateOutcome returns null → skipped |
| `daily_ohlcv` index `idx_daily_ohlcv_code_date` missing on test DB | Low | Low | `initDatabase()` creates all indexes; test uses initDatabase() |
| Duplicate call to `insertPredictionClaim` without `creation_price` from callers other than the MCP tool | Low | Low | Field is optional with default null — no existing caller breaks |
| `bun tsc` fails because `PredictionClaimRow extends PredictionClaimInput` and `creation_price` appears in both | Medium | Medium | Declare `creation_price` only in `PredictionClaimInput` (optional); `PredictionClaimRow extends PredictionClaimInput` inherits it; `ClaimDbRow` is a separate private interface — no conflict |

---

## Security Review

- SQL parameterized? Yes — all new queries use `?` bindings
- File paths validated? N/A — no file I/O added
- External HTTP rate-limited? N/A — price lookup is local SQLite
- Secrets via Bun.env only? N/A — no new env vars
