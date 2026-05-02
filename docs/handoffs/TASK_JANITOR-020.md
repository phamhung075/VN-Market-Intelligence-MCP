# TASK_JANITOR-020 — DRY: export AnalysisRow/AlertCountRow/LastCycleRow/MACRO_CODES from marketContextBuilder, delete duplicates in marketContextTools

| Field        | Value |
|--------------|-------|
| Task ID      | JANITOR-020 |
| Type         | refactor |
| Priority     | P2 |
| Owner        | developer |
| Branch       | `task/JANITOR-020-dry-marketcontext-types` |
| Baseline     | 8558 pass / 0 fail |
| Files        | `apps/mcp-server/src/domain/services/marketContextBuilder.ts` (Step 1) |
|              | `apps/mcp-server/src/interface/mcp/tools/market-data/marketContextTools.ts` (Steps 2–3) |
| Dependencies | none |

---

## Context

`marketContextTools.ts` (interface layer) contains exact copies of 3 interfaces and 1 const
that are already defined in `marketContextBuilder.ts` (domain layer):

- `interface AnalysisRow` — lines 59–68 in marketContextTools.ts
- `interface AlertCountRow` — lines 70–72 in marketContextTools.ts
- `interface LastCycleRow` — lines 74–76 in marketContextTools.ts
- `const MACRO_CODES` — lines 82–88 in marketContextTools.ts

The fix is DDD-correct: interface layer imports from domain layer, not the reverse.
No other file imports these 4 symbols; the change is fully contained to 2 files.

---

## Step-by-Step Instructions

### Step 1 — marketContextBuilder.ts: add `export` to the 4 declarations

File: `apps/mcp-server/src/domain/services/marketContextBuilder.ts`

Add the `export` keyword to each of the 4 declarations. They are currently at approximately
lines 56, 67, 71, and 79. Apply all 4 changes:

```typescript
// line ~56 — BEFORE
interface AnalysisRow {
// AFTER
export interface AnalysisRow {

// line ~67 — BEFORE
interface AlertCountRow {
// AFTER
export interface AlertCountRow {

// line ~71 — BEFORE
interface LastCycleRow {
// AFTER
export interface LastCycleRow {

// line ~79 — BEFORE
const MACRO_CODES = [
// AFTER
export const MACRO_CODES = [
```

### Step 2 — marketContextTools.ts: delete the 27 duplicate lines

File: `apps/mcp-server/src/interface/mcp/tools/market-data/marketContextTools.ts`

Delete the entire block from the `interface AnalysisRow` declaration through the closing
`] as const;` of `MACRO_CODES`, inclusive of the section comment header above `MACRO_CODES`.
That is approximately lines 59–88 (the 3 interfaces + section comment + const block).

The block to delete is:

```typescript
interface AnalysisRow {
  id: string;
  created_at: string;
  level: string;
  source_title: string | null;
  sentiment: string | null;
  impact_score: number | null;
  impact_direction: string | null;
  summary: string | null;
}

interface AlertCountRow {
  cnt: number;
}

interface LastCycleRow {
  triggered_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Known macro indicator codes (from commodity_prices / yahooFinance fetcher)
// ─────────────────────────────────────────────────────────────────────────────

const MACRO_CODES = [
  "BRENT", "WTI", "GOLD", "SILVER", "COPPER",
  "WHEAT", "COFFEE", "RUBBER",
  "USD_VND", "USD_INDEX",
  "VN_CPI", "VN_GDP",
  "BTC",
] as const;
```

### Step 3 — marketContextTools.ts: add 2 import statements

After the existing imports (after line 24, which currently reads
`import { tradingWindowLabel } from "../../../../domain/services/tradingWindow.js";`),
add the following 2 lines:

```typescript
import type { AnalysisRow, AlertCountRow, LastCycleRow } from "../../../../domain/services/marketContextBuilder.js";
import { MACRO_CODES } from "../../../../domain/services/marketContextBuilder.js";
```

The imports section should now read (in order):

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { sqlInClause } from "../../../../infrastructure/db/sqlHelpers.js";
import { tradingWindowLabel } from "../../../../domain/services/tradingWindow.js";
import type { AnalysisRow, AlertCountRow, LastCycleRow } from "../../../../domain/services/marketContextBuilder.js";
import { MACRO_CODES } from "../../../../domain/services/marketContextBuilder.js";
```

---

## Acceptance Criteria

**AC-1 — tsc clean**
```bash
cd apps/mcp-server && bunx tsc --noEmit
```
Must exit 0 with no errors.

**AC-2 — grep: only import lines remain in marketContextTools.ts**
```bash
grep -n "AnalysisRow\|AlertCountRow\|LastCycleRow\|MACRO_CODES" \
  apps/mcp-server/src/interface/mcp/tools/market-data/marketContextTools.ts
```
Every line printed must be an `import` statement. Zero `interface` declarations,
zero `const` declarations.

**AC-3 — grep: 4 exports present in marketContextBuilder.ts**
```bash
grep -n "^export" \
  apps/mcp-server/src/domain/services/marketContextBuilder.ts
```
Must include `export interface AnalysisRow`, `export interface AlertCountRow`,
`export interface LastCycleRow`, and `export const MACRO_CODES`.

**AC-4 — test suite: 8558+ pass / 0 new failures**
```bash
cd apps/mcp-server && bun test 2>&1 | tail -5
```
Pass count must be >= 8558. Fail count must not increase beyond the pre-existing baseline.

---

## Commit Format

```bash
git commit -m "$(cat <<'EOF'
task(JANITOR-020): DRY — export AnalysisRow/AlertCountRow/LastCycleRow/MACRO_CODES from marketContextBuilder, remove duplicates in marketContextTools

- Added export keyword to 4 declarations in marketContextBuilder.ts
- Deleted 27 duplicate lines from marketContextTools.ts
- Added 2 import statements in marketContextTools.ts (type-only + value)
- Net: -25 lines; DDD compliant (interface imports from domain)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Net Change Summary

| File | Lines before | Lines after | Delta |
|------|-------------|-------------|-------|
| marketContextBuilder.ts | ~N | ~N+0 (4 `export` keywords added) | +0 net |
| marketContextTools.ts | ~N | ~N-27 (27 lines deleted, 2 import lines added) | -25 net |
