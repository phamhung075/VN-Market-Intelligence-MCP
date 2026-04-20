# TASK_1504b — GREEN: schema + stores + tool implementation

phase: GREEN
sprint: 191
tech_ref: docs/TECH_191.md
depends_on: TASK_1504a (RED committed)

## Goal

Make all 11 AC assertions pass. Zero regressions (test baseline >= 5681). `bun tsc --noEmit` clean.

## Edit 1 — schema.ts: cascade_rule_hits ALTER block

File: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/schema.ts`

After line 1082 (the `idx_cascade_hits_at` index line), insert:

```typescript
  // Sprint 191 — outcome tracking columns (idempotent: try/catch per column)
  for (const sql of [
    `ALTER TABLE cascade_rule_hits ADD COLUMN source_rag_id   TEXT`,
    `ALTER TABLE cascade_rule_hits ADD COLUMN price_impact_3d REAL`,
    `ALTER TABLE cascade_rule_hits ADD COLUMN price_impact_7d REAL`,
    `ALTER TABLE cascade_rule_hits ADD COLUMN outcome_correct INTEGER`,
    `ALTER TABLE cascade_rule_hits ADD COLUMN confidence      REAL`,
  ]) {
    try { db.exec(sql); } catch { /* column already exists — safe */ }
  }
```

Exact `old_string` for Edit tool:

```
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cascade_hits_at   ON cascade_rule_hits(hit_at)`);

  // ── Audit state:
```

Replace with:

```
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cascade_hits_at   ON cascade_rule_hits(hit_at)`);

  // Sprint 191 — outcome tracking columns (idempotent: try/catch per column)
  for (const sql of [
    `ALTER TABLE cascade_rule_hits ADD COLUMN source_rag_id   TEXT`,
    `ALTER TABLE cascade_rule_hits ADD COLUMN price_impact_3d REAL`,
    `ALTER TABLE cascade_rule_hits ADD COLUMN price_impact_7d REAL`,
    `ALTER TABLE cascade_rule_hits ADD COLUMN outcome_correct INTEGER`,
    `ALTER TABLE cascade_rule_hits ADD COLUMN confidence      REAL`,
  ]) {
    try { db.exec(sql); } catch { /* column already exists — safe */ }
  }

  // ── Audit state:
```

## Edit 2 — schema.ts: market_messages ALTER block

After the closing `);` of the `market_messages` `db.exec(...)` call (line 1491), insert:

Exact `old_string`:

```
  `);

  // Task 1407 — HUT domain migration
```

Replace with:

```
  `);

  // Sprint 191 — impact tracking columns (idempotent: try/catch per column)
  for (const sql of [
    `ALTER TABLE market_messages ADD COLUMN impact_score     REAL`,
    `ALTER TABLE market_messages ADD COLUMN price_at_message REAL`,
    `ALTER TABLE market_messages ADD COLUMN price_3d_after   REAL`,
  ]) {
    try { db.exec(sql); } catch { /* column already exists — safe */ }
  }

  // Task 1407 — HUT domain migration
```

Note: the `old_string` must include enough context — use the CREATE INDEX lines at end of that exec block as anchor:

Exact `old_string` (use full closing of exec):

```
    CREATE INDEX IF NOT EXISTS idx_mm_ticker     ON market_messages(ticker);
  `);

  // Task 1407 — HUT domain migration: real_estate → construction
```

Replace with:

```
    CREATE INDEX IF NOT EXISTS idx_mm_ticker     ON market_messages(ticker);
  `);

  // Sprint 191 — impact tracking columns (idempotent: try/catch per column)
  for (const sql of [
    `ALTER TABLE market_messages ADD COLUMN impact_score     REAL`,
    `ALTER TABLE market_messages ADD COLUMN price_at_message REAL`,
    `ALTER TABLE market_messages ADD COLUMN price_3d_after   REAL`,
  ]) {
    try { db.exec(sql); } catch { /* column already exists — safe */ }
  }

  // Task 1407 — HUT domain migration: real_estate → construction
```

## Edit 3 — cascadeHitStore.ts: extend recordHit() + add updateOutcome()

File: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/cascadeHitStore.ts`

Replace the entire `recordHit` function (lines 42–53) and the separator comment after it:

`old_string`:

```typescript
export function recordHit(
  db: Database,
  ruleKey: string,
  matchedText: string,
  sector?: string,
  stocks?: string,
): void {
  db.prepare(`
    INSERT INTO cascade_rule_hits (rule_key, matched_text, affected_sector, affected_stocks)
    VALUES (?, ?, ?, ?)
  `).run(ruleKey, matchedText, sector ?? null, stocks ?? null);
}

// ═══════════════════════════════════════════════════════════════════════════
// Read helpers
```

`new_string`:

```typescript
export function recordHit(
  db: Database,
  ruleKey: string,
  matchedText: string,
  sector?: string,
  stocks?: string,
  sourceRagId?: string | null,
  confidence?: number | null,
): void {
  db.prepare(`
    INSERT INTO cascade_rule_hits (rule_key, matched_text, affected_sector, affected_stocks, source_rag_id, confidence)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(ruleKey, matchedText, sector ?? null, stocks ?? null, sourceRagId ?? null, confidence ?? null);
}

/**
 * Write backtest outcome data to an existing cascade_rule_hits row.
 *
 * Only provided (non-undefined) fields are updated. Returns true if row
 * found and updated, false if id not found. All-undefined outcome = no-op.
 *
 * @param db      - Active bun:sqlite Database connection
 * @param id      - Primary key of the hit row to update
 * @param outcome - Partial outcome fields to write
 */
export function updateOutcome(
  db: Database,
  id: number,
  outcome: {
    priceImpact3d?: number | null;
    priceImpact7d?: number | null;
    outcomeCorrect?: 0 | 1 | null;
    confidence?: number | null;
  },
): boolean {
  const setClauses: string[] = [];
  const values: (number | null)[] = [];

  if (outcome.priceImpact3d !== undefined) {
    setClauses.push("price_impact_3d = ?");
    values.push(outcome.priceImpact3d);
  }
  if (outcome.priceImpact7d !== undefined) {
    setClauses.push("price_impact_7d = ?");
    values.push(outcome.priceImpact7d);
  }
  if (outcome.outcomeCorrect !== undefined) {
    setClauses.push("outcome_correct = ?");
    values.push(outcome.outcomeCorrect);
  }
  if (outcome.confidence !== undefined) {
    setClauses.push("confidence = ?");
    values.push(outcome.confidence);
  }

  if (setClauses.length === 0) return false;

  const result = db
    .prepare(`UPDATE cascade_rule_hits SET ${setClauses.join(", ")} WHERE id = ?`)
    .run(...values, id);

  return result.changes > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Read helpers
```

## Edit 4 — marketMessageStore.ts: add updateImpact()

File: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/marketMessageStore.ts`

Append after the closing `}` of `batchReviewMarketMessages`:

`old_string` (last lines of file):

```typescript
  txn();

  return { updated, notFound };
}
```

`new_string`:

```typescript
  txn();

  return { updated, notFound };
}

/**
 * Write impact tracking data to an existing market_messages row.
 *
 * Partial update: only provided (non-undefined) fields are written.
 * Null values are stored explicitly. Returns true if row found and updated.
 *
 * @param db     - SQLite database instance
 * @param id     - Primary key of the message row
 * @param impact - Partial impact fields to write
 */
export function updateImpact(
  db: Database,
  id: number,
  impact: {
    impactScore?: number | null;
    priceAtMessage?: number | null;
    price3dAfter?: number | null;
  },
): boolean {
  const setClauses: string[] = [];
  const values: (number | null)[] = [];

  if (impact.impactScore !== undefined) {
    setClauses.push("impact_score = ?");
    values.push(impact.impactScore);
  }
  if (impact.priceAtMessage !== undefined) {
    setClauses.push("price_at_message = ?");
    values.push(impact.priceAtMessage);
  }
  if (impact.price3dAfter !== undefined) {
    setClauses.push("price_3d_after = ?");
    values.push(impact.price3dAfter);
  }

  if (setClauses.length === 0) return false;

  const result = db
    .prepare(`UPDATE market_messages SET ${setClauses.join(", ")} WHERE id = ?`)
    .run(...values, id);

  return result.changes > 0;
}
```

## Edit 5 — Create cascadeOutcomeTools.ts (NEW)

File: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/cascadeOutcomeTools.ts`

```typescript
/**
 * Cascade Outcome MCP Tool — Task 1504
 *
 * Exposes cascade rule hit outcome data for signal quality review.
 * Outcome columns (price_impact_3d/7d, outcome_correct) are populated
 * asynchronously by the Sprint 192 backtest cron — NULL means pending.
 *
 * Tool: get_cascade_outcomes
 *   Params: days (1–90, default 30), ticker (optional string filter)
 *   Returns: formatted table + JSON rows ordered by hit_at DESC, max 200 rows
 *
 * Layer: interface/mcp/tools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "bun:sqlite";
import { z } from "zod";
import { getDb } from "../../../infrastructure/db/schema.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CascadeOutcomeRow {
  id: number;
  ruleKey: string;
  hitAt: string;
  ticker: string | null;
  priceImpact3d: number | null;
  priceImpact7d: number | null;
  outcomeCorrect: 0 | 1 | null;
  confidence: number | null;
  sourceRagId: string | null;
}

// ─── Query helper (exported for unit tests) ────────────────────────────────────

export function queryCascadeOutcomes(
  db: Database,
  params: { days: number; ticker?: string },
): CascadeOutcomeRow[] {
  const { days, ticker } = params;

  let sql = `
    SELECT
      id,
      rule_key,
      hit_at,
      affected_stocks,
      price_impact_3d,
      price_impact_7d,
      outcome_correct,
      confidence,
      source_rag_id
    FROM cascade_rule_hits
    WHERE hit_at >= datetime('now', '-' || ? || ' days')
  `;
  const bindings: (number | string)[] = [days];

  if (ticker) {
    sql += ` AND affected_stocks LIKE ?`;
    bindings.push(`%${ticker}%`);
  }

  sql += ` ORDER BY hit_at DESC LIMIT 200`;

  const rows = db.prepare(sql).all(...bindings) as {
    id: number;
    rule_key: string;
    hit_at: string;
    affected_stocks: string | null;
    price_impact_3d: number | null;
    price_impact_7d: number | null;
    outcome_correct: 0 | 1 | null;
    confidence: number | null;
    source_rag_id: string | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    ruleKey: r.rule_key,
    hitAt: r.hit_at,
    ticker: r.affected_stocks,
    priceImpact3d: r.price_impact_3d,
    priceImpact7d: r.price_impact_7d,
    outcomeCorrect: r.outcome_correct,
    confidence: r.confidence,
    sourceRagId: r.source_rag_id,
  }));
}

// ─── Format helper ─────────────────────────────────────────────────────────────

export function formatCascadeOutcomes(rows: CascadeOutcomeRow[], days: number): string {
  const lines: string[] = [];
  lines.push(`Cascade Outcomes — Last ${days} days\n`);

  if (rows.length === 0) {
    lines.push("No cascade hits recorded in this window.");
    return lines.join("\n");
  }

  const hdr = [
    "ID".padEnd(6),
    "Rule".padEnd(24),
    "Hit At".padEnd(20),
    "Ticker".padEnd(16),
    "Impact 3d".padStart(10),
    "Impact 7d".padStart(10),
    "Correct".padStart(8),
    "Conf%".padStart(7),
  ].join(" ");
  lines.push(hdr);
  lines.push("─".repeat(hdr.length));

  for (const r of rows) {
    lines.push(
      [
        String(r.id).padEnd(6),
        r.ruleKey.padEnd(24),
        r.hitAt.padEnd(20),
        (r.ticker ?? "—").padEnd(16),
        (r.priceImpact3d !== null ? `${r.priceImpact3d.toFixed(2)}%` : "pending").padStart(10),
        (r.priceImpact7d !== null ? `${r.priceImpact7d.toFixed(2)}%` : "pending").padStart(10),
        (r.outcomeCorrect !== null ? (r.outcomeCorrect === 1 ? "yes" : "no") : "pending").padStart(8),
        (r.confidence !== null ? `${(r.confidence * 100).toFixed(0)}%` : "—").padStart(7),
      ].join(" "),
    );
  }

  return lines.join("\n");
}

// ─── Tool registration ─────────────────────────────────────────────────────────

export function registerCascadeOutcomeTools(server: McpServer): void {
  server.tool(
    "get_cascade_outcomes",
    "Get cascade rule hits with outcome data (price impact 3d/7d, correct/wrong). NULL outcome = pending backtest. Use for signal quality review.",
    {
      days: z.coerce
        .number()
        .int()
        .min(1)
        .max(90)
        .default(30)
        .describe("Look-back window in days (default 30)"),
      ticker: z
        .string()
        .optional()
        .describe("Filter by ticker code (matches affected_stocks LIKE %ticker%)"),
    },
    async ({ days, ticker }) => {
      try {
        const db = getDb();
        const rows = queryCascadeOutcomes(db, { days, ticker });
        const text = formatCascadeOutcomes(rows, days);

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[get_cascade_outcomes] Error:", msg);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching cascade outcomes: ${msg}`,
            },
          ],
        };
      }
    },
  );
}
```

## Edit 6 — registry.ts: add import + entry

File: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/registry.ts`

Add import after the `registerPipelineHealthTools` import line:

`old_string`:

```typescript
import { registerPipelineHealthTools } from "./pipelineHealthTools.js";
```

`new_string`:

```typescript
import { registerPipelineHealthTools } from "./pipelineHealthTools.js";
import { registerCascadeOutcomeTools } from "./cascadeOutcomeTools.js";
```

Add registry entry after the last entry:

`old_string`:

```typescript
  registerPipelineHealthTools,     // Task 1367: get_pipeline_health (+1 tool → 100)
];
```

`new_string`:

```typescript
  registerPipelineHealthTools,     // Task 1367: get_pipeline_health (+1 tool → 100)
  registerCascadeOutcomeTools,     // Task 1504: get_cascade_outcomes (+1 tool → 101)
];
```

## Verification steps

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP
bun test src/__tests__/1504-cascade-outcome.test.ts   # all 11 pass
bun test                                               # >= 5681 pass, 0 regressions
bun tsc --noEmit                                       # 0 errors
```

## Commit sequence

```
test(1504): RED — cascade-outcome 11 assertions
feat(1504): GREEN — schema ALTER + updateOutcome + updateImpact + get_cascade_outcomes tool
```

## Done criteria

- All 11 ACs pass
- `bun tsc --noEmit` clean
- No regressions vs baseline 5681
- Branch merged to main, branch deleted

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/schema.ts   # initDatabase accepts optional dbArg; +5 ALTER loop on cascade_rule_hits; +3 ALTER loop on market_messages
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/cascadeHitStore.ts   # recordHit extended with sourceRagId/confidence; updateOutcome() added
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/marketMessageStore.ts   # updateImpact() added
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/registry.ts   # import + registerCascadeOutcomeTools entry
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1504-cascade-outcome.test.ts   # rows[0]! non-null assertion for TS strictness
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1163-market-message-review.test.ts   # updated column count expectation 9 → 12

files_created:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/cascadeOutcomeTools.ts   # CascadeOutcomeRow type + queryCascadeOutcomes + formatCascadeOutcomes + registerCascadeOutcomeTools

tests_written:
- src/__tests__/1504-cascade-outcome.test.ts   # 11 assertions, all GREEN

tests_skipped: []

tsc_clean: true
full_suite_pass: true   # 5697 pass, 6 fail (all 6 pre-existing: 239×2, 217×2, 1168×1, minus 1163 fixed)
