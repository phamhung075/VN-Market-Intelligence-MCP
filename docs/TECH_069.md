# TECH-069: Market Message Review UX + Task 1139 Close

status: APPROVED_BY_ARCHITECT
req_ref: REQ-069

---

## Brownfield Impact

- Files modified:
  - `src/infrastructure/db/marketMessageStore.ts` — add two new exported functions (`getMarketMessageDigest`, `batchReviewMarketMessages`) and two new exported interfaces (`MarketMessageDigestEntry`, `BatchReviewResult`)
  - `src/interface/mcp/tools/marketMessageTools.ts` — add two new handler functions (`handleGetMarketMessageDigest`, `handleBatchReviewMarketMessages`) and register two new MCP tools inside `registerMarketMessageTools`
  - `docs/data/project-stats.json` — advance `currentSprint` to 69, `toolCount` to 95, update `lastUpdated`
  - `TASKS.md` — Task 1139 confirmed Done (already in Done state per brownfield check — no change needed)
- Files created:
  - `src/__tests__/1168-market-message-digest.test.ts` — TDD test suite covering AC-1 through AC-12 and AC-14
- Files deleted: none
- Breaking changes: no — existing `marketMessageStore.ts` exports and `marketMessageTools.ts` tool registrations are untouched. The two Sprint 068 tools (`get_unreviewed_market_messages`, `review_market_message`) remain identical.

---

## Architecture Decision

Sprint 068 established the exact extension pattern this sprint follows: new store helpers are added as additional exports to the existing `marketMessageStore.ts` module (not a new file), and new MCP tools are added inside the existing `registerMarketMessageTools` function in `marketMessageTools.ts` (not a new registration function). The `batchReviewMarketMessages` function re-uses the same single-row UPDATE SQL already proven by `reviewMarketMessage`, wrapping it in `db.transaction()` — consistent with the transaction pattern used in `telegramReportStore.ts`. The `getMarketMessageDigest` function introduces the only new SQL pattern: a `GROUP BY` aggregate query using `GROUP_CONCAT` and `MIN(substr(...))` — both are standard SQLite 3.46+ features confirmed available in Bun's bundled SQLite. No new ports, no domain layer involvement, no new files in `src/domain/`.

---

## Brownfield Analysis Results

### Task 1139 verification

Running `grep -n "recordJobRun" src/scheduler/jobs.ts` against the current `main` branch confirms all four target jobs are already wrapped:

- line 267: `recordJobRun(getDb(), "franceSummaryJob", ...)`
- line 274: `recordJobRun(getDb(), "devTeamHeartbeatJob", ...)`
- line 290: `recordJobRun(getDb(), "weatherCheckJob", ...)`
- line 297: `recordJobRun(getDb(), "davPharmacyCheckJob", ...)`

TASKS.md line 722 already shows Task 1139 with status `Done`. Task 1139 administrative close is a no-op: no code changes, no TASKS.md changes, no branch merge required. Task 1171 (FR-6) is still assigned to verify and confirm this state.

### Existing index coverage

Sprint 068 created `idx_mm_sent_at ON market_messages(sent_at DESC)`. The `getMarketMessageDigest` WHERE clause filters on `sent_at` directly — this index will be used by SQLite's query planner for the date-range predicate. No new indexes are needed.

### Existing test isolation pattern

`src/__tests__/1163-market-message-review.test.ts` establishes the pattern for this module:
- `process.env["DB_PATH"] = ":memory:"` at file top before any import
- `initDatabase()` + `closeDb()` in `beforeEach` / `afterEach`
- Handler functions imported directly (not via a live McpServer)

Task 1168 must follow this pattern exactly.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `MarketMessageDigestEntry` interface | infrastructure | `src/infrastructure/db/marketMessageStore.ts` | NEW (export) |
| `BatchReviewResult` interface | infrastructure | `src/infrastructure/db/marketMessageStore.ts` | NEW (export) |
| `getMarketMessageDigest()` function | infrastructure | `src/infrastructure/db/marketMessageStore.ts` | NEW (export) |
| `batchReviewMarketMessages()` function | infrastructure | `src/infrastructure/db/marketMessageStore.ts` | NEW (export) |
| `handleGetMarketMessageDigest()` handler | interface | `src/interface/mcp/tools/marketMessageTools.ts` | NEW (export) |
| `handleBatchReviewMarketMessages()` handler | interface | `src/interface/mcp/tools/marketMessageTools.ts` | NEW (export) |
| `get_market_message_digest` MCP tool | interface | `src/interface/mcp/tools/marketMessageTools.ts` | NEW (registered in existing `registerMarketMessageTools`) |
| `batch_review_market_messages` MCP tool | interface | `src/interface/mcp/tools/marketMessageTools.ts` | NEW (registered in existing `registerMarketMessageTools`) |
| Sprint stats advance | docs/data | `docs/data/project-stats.json` | MODIFY |
| TDD test suite | tests | `src/__tests__/1168-market-message-digest.test.ts` | NEW |

---

## Interface Contracts

### New types (add to `src/infrastructure/db/marketMessageStore.ts`)

```typescript
/** A single entry in the digest: one from_agent on one calendar date. */
export interface MarketMessageDigestEntry {
  /** UTC calendar date, YYYY-MM-DD format (derived from sent_at) */
  date: string;
  /** Agent that sent the messages */
  from_agent: string;
  /** Total unreviewed messages from this agent on this date */
  count: number;
  /** Array of unreviewed message ids (for passing to batchReviewMarketMessages) */
  ids: number[];
  /** Preview of the first message: first 120 chars of content */
  preview: string;
}

/** Return value of batchReviewMarketMessages. */
export interface BatchReviewResult {
  /** Number of rows with changes > 0 */
  updated: number;
  /** Input ids that did not match any market_messages row */
  notFound: number[];
}
```

### `getMarketMessageDigest` — full signature and SQL

```typescript
/**
 * Returns a grouped digest of unreviewed market_messages rows,
 * grouped by UTC calendar date and from_agent.
 *
 * Read-only. Never modifies rows.
 *
 * @param db         - SQLite database instance
 * @param limit_days - How many calendar days back to look (default 7, clamped 1–30)
 * @returns Array of digest entries, ordered date DESC, agent ASC
 */
export function getMarketMessageDigest(
  db: Database,
  limit_days?: number,
): MarketMessageDigestEntry[]
```

Internal clamping: `const days = Math.min(30, Math.max(1, limit_days ?? 7));`

SQL:

```sql
SELECT
  date(sent_at)                                    AS date,
  from_agent,
  COUNT(*)                                         AS count,
  GROUP_CONCAT(id ORDER BY sent_at DESC)           AS id_list,
  MIN(substr(content, 1, 120))                     AS preview
FROM market_messages
WHERE verdict IS NULL
  AND sent_at >= date('now', '-' || ? || ' days')
GROUP BY date(sent_at), from_agent
ORDER BY date(sent_at) DESC, from_agent ASC
```

Bind parameter: `[days]` (the clamped integer, passed as a string in the SQL expression).

Post-query transformation (per row from `.all()`):

```typescript
// Raw SQLite row shape:
type RawDigestRow = {
  date: string;
  from_agent: string;
  count: number;
  id_list: string;    // comma-separated from GROUP_CONCAT
  preview: string;
};

// Transform to MarketMessageDigestEntry:
const entry: MarketMessageDigestEntry = {
  date: row.date,
  from_agent: row.from_agent,
  count: row.count,
  ids: row.id_list.split(",").map(Number),
  preview: row.preview,
};
```

The `GROUP_CONCAT(id ORDER BY sent_at DESC)` ORDER BY clause is supported from SQLite 3.44.0. Bun bundles SQLite 3.46+. No runtime version check is required — the constraint is satisfied by the Bun runtime guarantee.

### `batchReviewMarketMessages` — full signature and transaction design

```typescript
/**
 * Applies a single verdict to a list of message IDs in one SQLite transaction.
 *
 * Idempotent per row: overwrites any previous verdict.
 * Partial success is normal: ids not found are reported in notFound.
 *
 * @param db      - SQLite database instance
 * @param ids     - Message ids to update (pass empty array for no-op)
 * @param verdict - Must be "signal" or "noise"; throws Error("Invalid verdict") otherwise
 * @param note    - Optional note applied to all rows in the batch
 * @returns BatchReviewResult with updated count and notFound id list
 */
export function batchReviewMarketMessages(
  db: Database,
  ids: number[],
  verdict: "signal" | "noise",
  note?: string | null,
): BatchReviewResult
```

Implementation steps (in order):

1. Runtime verdict check: `if (verdict !== "signal" && verdict !== "noise") throw new Error("Invalid verdict");`
2. Empty-array guard: `if (ids.length === 0) return { updated: 0, notFound: [] };`
3. Prepare the single-row UPDATE statement once, outside the transaction closure (Bun SQLite best practice — prepared statements are reusable):
   ```sql
   UPDATE market_messages
   SET verdict = ?, verdict_note = ?, reviewed_at = datetime('now')
   WHERE id = ?
   ```
4. Execute inside `db.transaction(...)`:
   ```typescript
   const notFound: number[] = [];
   let updated = 0;
   const txn = db.transaction(() => {
     for (const id of ids) {
       const result = stmt.run(verdict, note ?? null, id);
       if (result.changes > 0) {
         updated++;
       } else {
         notFound.push(id);
       }
     }
   });
   txn();
   return { updated, notFound };
   ```
5. On exception from `db.transaction()`, Bun SQLite rolls back automatically. The exception propagates to the MCP tool handler, which wraps in try/catch and returns the error format string.

Note on duplicate IDs: if the input `ids` array contains a duplicate, the second UPDATE on the already-updated row in the same transaction will have `changes === 0` (the row was already updated to the same verdict earlier in the loop). That duplicate id will appear in `notFound`. This is acceptable per REQ-069 edge case spec.

### `handleGetMarketMessageDigest` — handler export

```typescript
export async function handleGetMarketMessageDigest(args: {
  limit_days?: number | undefined;
}): Promise<{ content: Array<{ type: "text"; text: string }> }>
```

Formatting logic:

```typescript
const db = getDb();
const days = args.limit_days ?? 7;
const entries = getMarketMessageDigest(db, days);

if (entries.length === 0) {
  return {
    content: [{ type: "text" as const,
      text: `Khong co tin nhan chua review trong ${days} ngay qua.` }],
  };
}

const totalCount = entries.reduce((sum, e) => sum + e.count, 0);
const lines: string[] = [
  `Digest chua review — ${days} ngay gan nhat`,
  "=========================================",
];
let currentDate = "";
for (const entry of entries) {
  if (entry.date !== currentDate) {
    if (currentDate !== "") lines.push("");   // blank separator between dates
    lines.push(`[${entry.date}]`);
    currentDate = entry.date;
  }
  lines.push(`  ${entry.from_agent.padEnd(18)} ${entry.count} tin  ids: [${entry.ids.join(", ")}]`);
  lines.push(`    Preview: "${entry.preview}"`);
}
lines.push("");
lines.push("-----------------------------------------");
lines.push(`Tong: ${totalCount} tin chua review. Dung batch_review_market_messages de danh gia hang loat.`);

return { content: [{ type: "text" as const, text: lines.join("\n") }] };
```

### `handleBatchReviewMarketMessages` — handler export

```typescript
export async function handleBatchReviewMarketMessages(args: {
  ids: number[];
  verdict: "signal" | "noise";
  note?: string | undefined;
}): Promise<{ content: Array<{ type: "text"; text: string }> }>
```

Response formatting logic:

```typescript
const db = getDb();
let result: BatchReviewResult;
try {
  result = batchReviewMarketMessages(db, args.ids, args.verdict, args.note ?? null);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error in batch review: ${msg}` }] };
}

const { updated, notFound } = result;
const noteText = args.note ? " Note saved." : "";

if (updated === 0 && notFound.length > 0) {
  return {
    content: [{ type: "text" as const,
      text: `Khong tim thay bat ky tin nhan nao. IDs: [${notFound.join(", ")}].` }],
  };
}

const notFoundText = notFound.length > 0
  ? ` ${notFound.length} ID khong tim thay: [${notFound.join(", ")}].`
  : "";

return {
  content: [{ type: "text" as const,
    text: `${updated} tin da duoc danh gia la '${args.verdict}'.${notFoundText}${noteText}` }],
};
```

### MCP tool Zod schemas

Both tools are registered inside the existing `registerMarketMessageTools(server: McpServer)` function, appended after the Sprint 068 tool registrations.

**`get_market_message_digest`:**

```typescript
server.tool(
  "get_market_message_digest",
  "Returns a grouped digest of unreviewed MARKET channel messages, grouped by date and sending agent. " +
  "Use this first thing in the morning to see what fired overnight. " +
  "Each entry shows a count and a preview. " +
  "Use the ids from each entry with batch_review_market_messages to label them all at once. " +
  "limit_days controls how many calendar days back to look (default 7).",
  {
    limit_days: z.coerce.number().int().min(1).max(30).default(7).optional()
      .describe("How many calendar days back to search (1-30, default 7)"),
  },
  async ({ limit_days }) => handleGetMarketMessageDigest({ limit_days }),
);
```

**`batch_review_market_messages`:**

```typescript
server.tool(
  "batch_review_market_messages",
  "Labels a list of MARKET channel messages with a single verdict in one call. " +
  "Pass the ids from get_market_message_digest. " +
  "Use verdict='noise' to clear low-value overnight messages, 'signal' for genuine alerts. " +
  "Returns a count of how many were updated and which ids were not found.",
  {
    ids: z.array(z.number().int().min(1)).min(1).max(200)
      .describe("Array of market_messages ids to review (from get_market_message_digest)"),
    verdict: z.enum(["signal", "noise"])
      .describe("'signal' = genuine useful alert. 'noise' = false positive or low-value."),
    note: z.string().optional()
      .describe("Optional free-text note applied to all messages in this batch"),
  },
  async ({ ids, verdict, note }) => handleBatchReviewMarketMessages({ ids, verdict, note }),
);
```

---

## Test Strategy (TDD)

Test file: `src/__tests__/1168-market-message-digest.test.ts`

Setup boilerplate (identical to `1163-market-message-review.test.ts`):

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

### Test groups and AC coverage

| Test group | ACs covered | What is tested |
|---|---|---|
| `getMarketMessageDigest — grouped entries` | AC-1 | 5 rows inserted per AC-1 scenario; returns 3 entries; correct counts, ids, ordering |
| `getMarketMessageDigest — excludes reviewed rows` | AC-1 | id 14 has verdict "signal"; confirmed absent from result |
| `getMarketMessageDigest — limit_days respects date cutoff` | AC-2 | Row at `datetime('now', '-8 days')` excluded when limit_days=7; row at `datetime('now', '-1 day')` included |
| `getMarketMessageDigest — empty state` | AC-3 | No unreviewed rows; returns `[]` |
| `getMarketMessageDigest — id_list single row` | edge | One group with one row; `"42".split(",").map(Number)` produces `[42]` |
| `getMarketMessageDigest — default limit_days=7` | edge | Call with no second arg; rows 6 days ago included, rows 8 days ago excluded |
| `getMarketMessageDigest — limit_days clamped min` | edge | `limit_days=0` treated as 1 (clamping, not Zod — store-level) |
| `getMarketMessageDigest — limit_days clamped max` | edge | `limit_days=50` treated as 30 |
| `batchReviewMarketMessages — updates all ids` | AC-4 | 3 rows updated; returns `{ updated: 3, notFound: [] }` |
| `batchReviewMarketMessages — reports notFound` | AC-5 | ids [20, 21, 999]; returns `{ updated: 2, notFound: [999] }` |
| `batchReviewMarketMessages — empty ids no-op` | AC-6 | `ids=[]`; returns immediately `{ updated: 0, notFound: [] }` with no SQL executed |
| `batchReviewMarketMessages — invalid verdict throws` | AC-7 | `verdict="maybe"`; throws `Error("Invalid verdict")` |
| `batchReviewMarketMessages — sets verdict_note` | AC-4 | SELECT row; `verdict_note = "overnight noise batch"` |
| `batchReviewMarketMessages — idempotent overwrite` | edge | Call twice with different verdicts; second verdict wins; no error |
| `batchReviewMarketMessages — all not found` | edge | All 200 ids non-existent; `{ updated: 0, notFound: [all 200] }` |
| `get_market_message_digest MCP tool — formatted output` | AC-8 | Handler returns text with `[2026-04-13]`, `2 tin`, `ids: [`, `Tong: 3` |
| `get_market_message_digest MCP tool — empty state` | AC-9 | Returns `"Khong co tin nhan chua review trong 7 ngay qua."` |
| `batch_review_market_messages MCP tool — all found` | AC-10 | Returns `"3 tin da duoc danh gia la 'noise'."` |
| `batch_review_market_messages MCP tool — partial notFound` | AC-11 | Returns text with `"2 tin"`, `"1 ID khong tim thay"`, `"999"` |
| `batch_review_market_messages MCP tool — with note` | AC-12 | Returns text ending `"Note saved."`; row has `verdict_note = "false alarm"` |
| `batch_review_market_messages MCP tool — all not found` | edge | Returns `"Khong tim thay bat ky tin nhan nao."` |
| `batch_review_market_messages MCP tool — invalid verdict error` | edge | Returns `"Error in batch review: Invalid verdict"` |

The test file is committed first with all tests failing (imports will resolve but assertions will fail because store functions do not yet exist). Task 1169 makes store-level tests green. Task 1170 makes MCP tool tests green.

---

## Task Dependency Graph

```
1168 (TDD: failing tests)
  └─► 1169 (store: getMarketMessageDigest + batchReviewMarketMessages)
        └─► 1170 (tools: handleGetMarketMessageDigest + handleBatchReviewMarketMessages + registry)
              └─► 1172 (project-stats.json sprint 69, toolCount 95)

1171 (Task 1139 admin close — independent, no code changes)
  └─► 1172 (depends on 1171 to confirm clean state before sprint close)
```

| ID | Title | Layer | Depends On | Branch |
|---|---|---|---|---|
| 1168 | TDD: write failing tests for FR-1 to FR-5 (AC-1 to AC-12, AC-14) in `src/__tests__/1168-market-message-digest.test.ts` | tests | — | `task/1168-market-message-digest` |
| 1169 | Add `getMarketMessageDigest` + `batchReviewMarketMessages` (+ types) to `marketMessageStore.ts` (FR-1, FR-2) | infrastructure | 1168 | same branch |
| 1170 | Add `handleGetMarketMessageDigest`, `handleBatchReviewMarketMessages`, and register two new MCP tools in `marketMessageTools.ts`; no changes to `registry.ts` (FR-3, FR-4, FR-5) | interface | 1169 | same branch |
| 1171 | Close Task 1139: run grep verification, confirm Done status in TASKS.md, add archival note to `docs/TASKS_ARCHIVE.md` if not already present (FR-6) | admin | — | `task/1171-close-1139` (or directly on main if no code changes) |
| 1172 | Sprint close: advance `docs/data/project-stats.json` `currentSprint` to 69, `toolCount` to 95, update `lastUpdated` | docs/data | 1170, 1171 | same branch as 1170 |

All tasks 1168–1170 + 1172 run on a single branch `task/1168-market-message-digest`. Task 1171 is administrative — if it requires no file changes (current expectation), it can be marked Done immediately without a branch.

---

## Registry Note (FR-5)

The REQ-069 spec states both new tools are added inside the existing `registerMarketMessageTools` function. `src/interface/mcp/tools/registry.ts` already calls `registerMarketMessageTools(server)` — no modification to `registry.ts` is needed. The Developer must not add a new `registerMarketMessageDigestTools` entry to the registry; the two new tools are co-registered with the Sprint 068 tools inside the single existing function.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `GROUP_CONCAT(id ORDER BY ...)` fails on SQLite < 3.44.0 | Low | High | Bun bundles SQLite 3.46+. No mitigation needed beyond the Bun version pin. If a future Bun downgrade occurs, the error message will be a SQL parse error at query execution, not a silent wrong result. |
| `id_list` is `null` when `GROUP_CONCAT` returns nothing | Low | Medium | The WHERE clause `verdict IS NULL` means any group returned by GROUP BY always has at least one row, so `GROUP_CONCAT` never returns NULL for a group that appears in the result set. The transformation code can add a null guard `(row.id_list ?? "").split(",").map(Number).filter(Boolean)` as defence-in-depth. |
| `batchReviewMarketMessages` with 200 IDs creates a long transaction | Low | Low | 200 single-row UPDATEs inside one transaction takes < 5ms on SQLite WAL mode (benchmarked patterns in prior sprints). No mitigation needed. |
| Duplicate IDs in `ids` array: id appears in both `updated` and `notFound` | Certain (if caller passes duplicates) | Low | Acceptable per REQ-069 edge case spec. Zod does not deduplicate — the store behaviour is documented. Users passing IDs from `getMarketMessageDigest` will never encounter this (the digest produces unique IDs). |
| `verified_at` column name used incorrectly | Low | Low | Column name is `reviewed_at` (matching Sprint 068 DDL). Developer must use the same column name as `reviewMarketMessage`. Cross-check against `schema.ts` before writing the batch UPDATE. |
| Task 1139 closes without archival in `docs/TASKS_ARCHIVE.md` | Low | Low | Task 1171 explicitly requires checking archival. TASKS.md line 722 already shows Done status. Developer checks `docs/TASKS_ARCHIVE.md` for existing entry; adds one if absent. |
| `toolCount` in `project-stats.json` drifts from actual registered tool count | Medium | Low | Task 1172 increments from 93 to 95 (+2 tools). Developer must verify by grepping `server.tool(` in `src/interface/mcp/tools/` to confirm total count before writing 95. |

---

## Security Review

- SQL parameterized? Yes — `getMarketMessageDigest` uses a single `?` for the `days` integer (no string interpolation). `batchReviewMarketMessages` uses `?` for `verdict`, `note`, and `id` on every prepared statement invocation. The date arithmetic `'-' || ? || ' days'` uses a bound integer parameter — the `||` is SQLite string concatenation operating on a vetted numeric value, not user-supplied text.
- File paths validated (no `../`)? N/A — no file path inputs.
- External HTTP rate-limited? N/A — no new HTTP calls.
- Secrets via Bun.env only? N/A — no new secrets.
- `verdict` double-validated? Yes — Zod `z.enum(["signal","noise"])` at the MCP tool layer (first line of defence) plus `if (verdict !== "signal" && verdict !== "noise") throw` in the store function (second line of defence). Consistent with Sprint 068 `reviewMarketMessage` pattern.
- `note` content stored verbatim: trusted internal input, no XSS surface in this sprint.
- Batch size cap enforced at Zod layer (max 200): prevents accidental mass-writes before the store is reached.
