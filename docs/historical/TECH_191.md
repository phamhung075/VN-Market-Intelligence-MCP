# TECH-191: Cascade Outcome Tracking — Backtesting Schema + Signal Quality Feedback Loop

status: APPROVED_BY_ARCHITECT
req_ref: REQ-191

## Brownfield Impact

- Files modified: `src/infrastructure/db/schema.ts`, `src/infrastructure/db/cascadeHitStore.ts`, `src/infrastructure/db/marketMessageStore.ts`, `src/interface/mcp/tools/registry.ts`
- Files created: `src/interface/mcp/tools/cascadeOutcomeTools.ts`, `src/__tests__/1504-cascade-outcome.test.ts`
- Files deleted: none
- Breaking changes: no — `recordHit()` new params are optional; existing callers unaffected

## Architecture Decision

Outcome columns are nullable by design: populated asynchronously by Sprint 192 backtest cron, not at insert time. `updateOutcome()` and `updateImpact()` follow the partial-update pattern already used by `reviewMarketMessage()` — dynamic SET clause, parameterized bindings, `changes > 0` return. Tool registration uses `registry.ts` (not `server.ts` directly) — BA spec said `server.ts` but canonical project pattern since Task 308 is `registry.ts`; no server.ts edit required.

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| cascade_rule_hits ALTER (+5 cols) | infrastructure | `src/infrastructure/db/schema.ts:1082` — after index lines | MODIFY |
| market_messages ALTER (+3 cols) | infrastructure | `src/infrastructure/db/schema.ts:1491` — after `db.exec(CREATE TABLE market_messages...)` | MODIFY |
| `recordHit()` extend signature | infrastructure | `src/infrastructure/db/cascadeHitStore.ts:42` | MODIFY |
| `updateOutcome()` new fn | infrastructure | `src/infrastructure/db/cascadeHitStore.ts:54` — after recordHit body | MODIFY |
| `updateImpact()` new fn | infrastructure | `src/infrastructure/db/marketMessageStore.ts` — append after `batchReviewMarketMessages` | MODIFY |
| `cascadeOutcomeTools.ts` | interface | `src/interface/mcp/tools/cascadeOutcomeTools.ts` | NEW |
| `registry.ts` — add entry | interface | `src/interface/mcp/tools/registry.ts:145` | MODIFY |
| TDD test file | test | `src/__tests__/1504-cascade-outcome.test.ts` | NEW |

## Interface Contracts

### Extended `recordHit()` (cascadeHitStore.ts)

```typescript
export function recordHit(
  db: Database,
  ruleKey: string,
  matchedText: string,
  sector?: string,
  stocks?: string,
  sourceRagId?: string | null,
  confidence?: number | null,
): void
```

INSERT adds `source_rag_id` and `confidence` columns; undefined args become NULL via `?? null`.

### New `updateOutcome()` (cascadeHitStore.ts)

```typescript
export function updateOutcome(
  db: Database,
  id: number,
  outcome: {
    priceImpact3d?: number | null;
    priceImpact7d?: number | null;
    outcomeCorrect?: 0 | 1 | null;
    confidence?: number | null;
  }
): boolean
```

Returns `true` if `changes > 0`, `false` otherwise. All-undefined outcome = no-op (no SQL run).

### New `updateImpact()` (marketMessageStore.ts)

```typescript
export function updateImpact(
  db: Database,
  id: number,
  impact: {
    impactScore?: number | null;
    priceAtMessage?: number | null;
    price3dAfter?: number | null;
  }
): boolean
```

Same partial-update / `changes > 0` pattern. Null values stored explicitly (not skipped).

### New `registerCascadeOutcomeTools(server: McpServer)` (cascadeOutcomeTools.ts)

Tool `get_cascade_outcomes`:
- Params: `{ days: z.number().int().min(1).max(90).default(30), ticker: z.string().optional() }`
- Query: `SELECT id, rule_key, hit_at, affected_stocks, price_impact_3d, price_impact_7d, outcome_correct, confidence, source_rag_id FROM cascade_rule_hits WHERE hit_at >= datetime('now', '-' || ? || ' days') [AND affected_stocks LIKE ?] ORDER BY hit_at DESC LIMIT 200`
- Output: formatted text table + JSON rows; `confidence` displayed as percentage
- Returns empty array (not error) when 0 rows

## Injection Points (exact)

### schema.ts — cascade_rule_hits block

After line 1082 (`CREATE INDEX idx_cascade_hits_at`), inject:

```typescript
// Sprint 191 — outcome tracking columns (idempotent ALTER per column)
for (const sql of [
  `ALTER TABLE cascade_rule_hits ADD COLUMN source_rag_id   TEXT`,
  `ALTER TABLE cascade_rule_hits ADD COLUMN price_impact_3d REAL`,
  `ALTER TABLE cascade_rule_hits ADD COLUMN price_impact_7d REAL`,
  `ALTER TABLE cascade_rule_hits ADD COLUMN outcome_correct INTEGER`,
  `ALTER TABLE cascade_rule_hits ADD COLUMN confidence      REAL`,
]) {
  try { db.exec(sql); } catch { /* column already exists */ }
}
```

### schema.ts — market_messages block

After the closing `);` of the `db.exec(CREATE TABLE IF NOT EXISTS market_messages ...)` call (line 1491), inject:

```typescript
// Sprint 191 — impact tracking columns
for (const sql of [
  `ALTER TABLE market_messages ADD COLUMN impact_score     REAL`,
  `ALTER TABLE market_messages ADD COLUMN price_at_message REAL`,
  `ALTER TABLE market_messages ADD COLUMN price_3d_after   REAL`,
]) {
  try { db.exec(sql); } catch { /* column already exists */ }
}
```

### registry.ts

Add after line 144 (`registerPipelineHealthTools`):

```typescript
import { registerCascadeOutcomeTools } from "./cascadeOutcomeTools.js";
// ...
registerCascadeOutcomeTools, // Task 1504: get_cascade_outcomes (+1 tool → 101)
```

## Task Breakdown

| Task | Description | Depends on |
|---|---|---|
| 1504a | TDD RED — write `src/__tests__/1504-cascade-outcome.test.ts` with 11 failing assertions (AC-1 to AC-11) | — |
| 1504b | GREEN — schema ALTERs + extend `recordHit()` + `updateOutcome()` + `updateImpact()` + `cascadeOutcomeTools.ts` + registry entry | 1504a |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| SQLite ALTER errors if column exists (e.g. re-run) | High | Low | try/catch per column — already standard project idiom |
| Partial-update with all-undefined fields runs empty SQL | Medium | Medium | Guard: if no keys provided, return early before prepare() |
| `affected_stocks LIKE '%VCB%'` false-positive on "AVCB" | Medium | Low | Acceptable per REQ-191; exact fix deferred Sprint 192 |
| `outcome_correct` typed as `0 | 1 | null` in TS but stored as INTEGER | Low | Low | TypeScript union type + no DB constraint needed |

## Security Review

- SQL parameterized: yes — all queries use `?` bindings
- File paths validated: N/A
- External HTTP rate-limited: N/A — no external calls
- Secrets via Bun.env only: N/A
