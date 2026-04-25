# TASK 1328k — Signal distribution analysis script

**Sprint:** 1328 | **Phase:** 3 | **Layer:** testing/scripts | **Size:** S
**Status:** Todo | **Depends on:** nothing | **Blocks:** 1328j (PO review gate)

---

## TLDR

Create a read-only analysis script that queries `agent_signals` for the past 7 days and outputs signal counts by impact_score bucket. Output is reviewed by PO before deploying the threshold change in 1328j.

---

## File to create

`apps/mcp-server/scripts/analyze-signal-distribution.ts`

---

## Implementation

```typescript
#!/usr/bin/env bun
/**
 * Task 1328k — Signal distribution analysis
 * Read-only. Run before deploying threshold change (1328j).
 * Usage: bun apps/mcp-server/scripts/analyze-signal-distribution.ts
 */

import { getDb } from "../src/infrastructure/db/index.js";

const db = getDb();

const rows = db.prepare(`
  SELECT
    CAST(ROUND(impact_score) AS INTEGER) as bucket,
    COUNT(*) as cnt,
    GROUP_CONCAT(DISTINCT stock_code) as tickers
  FROM agent_signals
  WHERE created_at >= datetime('now', '-7 days')
    AND impact_score IS NOT NULL
  GROUP BY bucket
  ORDER BY bucket
`).all() as Array<{ bucket: number; cnt: number; tickers: string | null }>;

const totalRow = db.prepare(`
  SELECT COUNT(*) as total
  FROM agent_signals
  WHERE created_at >= datetime('now', '-7 days')
    AND impact_score IS NOT NULL
`).get() as { total: number };

const total = totalRow?.total ?? 0;

console.log("=== Signal Distribution Analysis (7-day window) ===");
console.log(`Total signals with impact_score: ${total}\n`);
console.log("Bucket | Count | % of total | Top tickers");
console.log("-------|-------|------------|-------------------------------------------");

let count7 = 0;
let count8plus = 0;

for (const row of rows) {
  const pct = total > 0 ? ((row.cnt / total) * 100).toFixed(1) : "0.0";
  const tickers = row.tickers ? row.tickers.split(",").slice(0, 5).join(", ") : "(none)";
  console.log(`  ${String(row.bucket).padStart(4)}  | ${String(row.cnt).padStart(5)} | ${pct.padStart(9)}% | ${tickers}`);
  if (row.bucket === 7) count7 = row.cnt;
  if (row.bucket >= 8) count8plus += row.cnt;
}

console.log("\n=== PO Decision Point ===");
const pct7 = total > 0 ? ((count7 / total) * 100).toFixed(1) : "0.0";
const pct8plus = total > 0 ? ((count8plus / total) * 100).toFixed(1) : "0.0";
console.log(`Signals at score=7 (would be SUPPRESSED by 1328j): ${count7} (${pct7}%)`);
console.log(`Signals at score>=8 (would REMAIN after 1328j):   ${count8plus} (${pct8plus}%)`);
console.log("\nIf score=7 bucket contains critical tickers (VNM/VCB/BID/FPT/HPG) → consider threshold=7.5 instead.");
```

---

## Run command

```bash
bun apps/mcp-server/scripts/analyze-signal-distribution.ts
```

Safe to run against production DB (read-only, no writes).

---

## Output must be reviewed by PO

Paste the output as a comment on the 1328j PR or in TASK_1328j.md before merging.

---

## Acceptance criteria

- [ ] Script runs without error: `bun apps/mcp-server/scripts/analyze-signal-distribution.ts`
- [ ] Output shows total signals, count per bucket, % in 7 bucket, top tickers per bucket
- [ ] Script does NOT write to any table
- [ ] Output delivered to PO before 1328j starts
