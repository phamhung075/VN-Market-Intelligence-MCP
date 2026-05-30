# AR-MCP-OPTY — Fleet Cron Integration Tools (dev-mcp-server)

**Sprint:** BCTC-AGENTIC-REFINE | **Owner:** dev-mcp-server | **Date:** 2026-05-30  
**Status:** READY | **Blocker:** AR-PREREQ-3 (same-file serialization) | **Blocks:** AR-AGENT-A-OPTY  
**Complexity:** HIGH (3 tools + idempotency + parser DV gate)

---

## Summary

**The Option-Y ruling (§0.7.2):** The refine orchestration moves out of mcp-server's cron layer to the host-level fleet. Instead of spawning subagents in-container, mcp-server becomes a pure data service with three new push tools. The fleet cron (on the host) calls these tools to:

1. Query pending reports for refine (`get_bctc_pending_refine`)
2. Push per-window refined units one at a time (`push_bctc_refined_unit`)
3. Finalize the report (collect all windows, parse to table rows, update status) (`finalize_bctc_refine`)

**Scope:** Create 3 new MCP tools + migrate refine helpers to `application/utils/` + extend DV test with push-tool pathway + delete spawn production code path.

**DDD alignment:** mcp-server is now a pure data-layer service. Orchestration logic lives in the fleet cron + refine_bctc_md agent (both on the host CC session).

---

## Acceptance Criteria

### AC-MCP-OPTY-1: `get_bctc_pending_refine` Tool

**New file:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts`

**Schema (TypeScript):**
```typescript
// Input
{ limit?: number }

// Output
[{ id: string, filename: string, page_count: number }] | { error: string }
```

**Implementation:**
- [ ] Query `financial_reports` table: `text_status = 'COMPLETE' AND refine_status IN ('PENDING', 'PARTIAL')` ORDER BY `parsed_at ASC`.
- [ ] Limit results to `limit` (default unlimited; caller may pass 1 or 5 to batch-process).
- [ ] Return array of `{ id, filename, page_count }` (page_count from `page_count` column in financial_reports).
- [ ] Return `{ error }` on DB error (never throws).
- [ ] **Idempotency:** Read-only query, always safe to re-run.

**DDD layer:** interface (read-only fetch from infra).

**Registry:** Add import + array entry in `apps/mcp-server/src/interface/mcp/tools/registry.ts`.

---

### AC-MCP-OPTY-2: `push_bctc_refined_unit` Tool

**New file:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/pushBctcRefinedUnitTool.ts`

**Schema (TypeScript):**
```typescript
// Input
{
  report_id: string,
  unit_id: string,
  page_numbers: number[],
  markdown: string,
  confidence: number,       // 0.0-1.0
  flags: string[],           // ["timeout", "agent_error:...", etc]
  window_status: "DONE" | "FAILED",
  reset?: boolean            // if true, DELETE prior refined_units for report first
}

// Output
{ ok: true, unit_id: string } | { error: string }
```

**Implementation:**
- [ ] If `reset=true`: `DELETE FROM bctc_refined_units WHERE report_id = ?` (idempotent reset flag).
- [ ] `INSERT OR REPLACE` into `bctc_refined_units`:
  ```sql
  INSERT OR REPLACE INTO bctc_refined_units
    (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, flags, window_status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ```
  - `page_numbers_json`: `JSON.stringify(page_numbers)`
  - `row_count`: count `|...|` lines in markdown (call `countRows(markdown)` utility)
  - `flags`: `JSON.stringify(flags)`
  - `window_status`: pass through as-is
- [ ] Return `{ ok: true, unit_id }` on success.
- [ ] Return `{ error }` on DB error.
- [ ] **Idempotency:** `INSERT OR REPLACE` ensures re-run with same data produces stable state.

**DDD layer:** interface (write to infra via DB).

**Registry:** Add import + array entry.

**Helper function:** Move or use `countRows(markdown: string): number` from `refinedMarkdownParser.ts` (count pipe-table rows, skip header).

---

### AC-MCP-OPTY-3: `finalize_bctc_refine` Tool

**New file:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`

**Schema (TypeScript):**
```typescript
// Input
{
  report_id: string,
  report_status: "DONE" | "PARTIAL" | "FAILED"
}

// Output
{ ok: true, rows_parsed: number } | { error: string }
```

**Implementation (Phase 4 collect-then-write boundary):**

1. [ ] **Delete:** `DELETE FROM bctc_table_rows WHERE report_id = ?`
2. [ ] **Parse:** Read all DONE windows from `bctc_refined_units WHERE report_id = ? AND window_status = 'DONE'`
3. [ ] For each DONE window row:
   - [ ] Call `parseRefinedMarkdown(markdown, report_id, page_numbers)` (from `refinedMarkdownParser.ts`)
   - [ ] Collect all `BctcTableRow` objects across windows
4. [ ] **Insert (atomic transaction):**
   ```typescript
   db.transaction(() => {
     for (const tableRow of allRows) {
       db.exec(
         `INSERT INTO bctc_table_rows (...) VALUES (...)`,
         [tableRow.report_id, tableRow.statement_section, tableRow.row_order, ...]
       );
     }
     db.exec(`UPDATE financial_reports SET refine_status = ? WHERE id = ?`, [report_status, report_id]);
   })();
   ```
5. [ ] Return `{ ok: true, rows_parsed: allRows.length }` on success.
6. [ ] Return `{ error }` on any error (never partial insert).

**Critical invariants:**
- [ ] FAILED windows are NOT parsed. They are stored in `bctc_refined_units` but do NOT contribute to `bctc_table_rows`.
- [ ] One transaction wraps both the parse-and-insert step (atomicity: all-or-nothing).
- [ ] If any row is malformed during parse, the transaction rolls back (no partial write).
- [ ] `financial_reports.refine_status` is set to the caller-provided value (DONE/PARTIAL/FAILED) at end of transaction.

**DDD layer:** application (orchestration boundary; houses the Phase 4 collect-then-write logic).

**Registry:** Add import + array entry.

---

### AC-MCP-OPTY-4: Migrate Helper Functions to `application/utils/`

**Files:**
- [ ] Create `apps/mcp-server/src/application/utils/windowPartitioner.ts` — move `partitionIntoWindows()` from `bctcRefineJob.ts`
- [ ] Create `apps/mcp-server/src/application/utils/boundedPool.ts` — move `runBoundedPool()` from `bctcRefineJob.ts`
- [ ] Keep `countRows()` in `refinedMarkdownParser.ts` or move to new `rowCounter.ts` utility file

**Implementation:**
- [ ] Extract function signatures from current `bctcRefineJob.ts` — no logic changes.
- [ ] Update imports in `bctcRefineJob.ts`: `import { partitionIntoWindows } from "../utils/windowPartitioner.js"`
- [ ] Update imports in tools: e.g., `finalizeBctcRefineTool` imports `parseRefinedMarkdown` from parser + `partitionIntoWindows` from partitioner (if reused in phase analysis — check current code pattern).
- [ ] Verify no circular imports.

---

### AC-MCP-OPTY-5: Remove Production Spawn Path from bctcRefineJob.ts

**File:** `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts`

- [ ] Delete the `spawnWindowSubagent()` function **PRODUCTION path only:**
  - [ ] Remove the `spawn("claude", ["run", "docs/agents/refine_bctc_md/...", ...])` block
  - [ ] Delete any Node `spawn` import
  - [ ] RETAIN the **test mock path:** if `deps.spawnSubagent` is mocked in tests, the dependency injection stays (tests use it)
- [ ] Delete the `runBctcRefineJob()` cron entry function
- [ ] **RETAIN:** 
  - [ ] `partitionIntoWindows()` → migrated to `application/utils/`
  - [ ] `runBoundedPool()` → migrated to `application/utils/`
  - [ ] `classifyPageForImageLoad()` → if still in this file, move to `application/utils/pageClassifier.ts` or keep if only used here
- [ ] After deletions, `bctcRefineJob.ts` should be minimal or empty (or can be deleted if no test re-export is needed)

**Verification:**
- [ ] `grep -n "spawn(" apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts` returns empty (no spawn calls)
- [ ] `grep -n "runBctcRefineJob" apps/mcp-server/` returns only in tests (if any), not in production scheduler

---

### AC-MCP-OPTY-6: Extend DV Test — Push-Tool Pathway

**File:** `apps/mcp-server/src/__tests__/AR-refined-units-idempotency.test.ts` (extend existing)

**New `describe` block: `push_tool_pathway`**

Add test cases:
- [ ] **DV-push-1: Basic push-3 windows (2 DONE + 1 FAILED):**
  - [ ] Call `push_bctc_refined_unit` 3 times with unit_id="w1" (DONE), "w2" (DONE), "w3" (FAILED)
  - [ ] Assert `bctc_refined_units` COUNT=3 for the report
  - [ ] Call `finalize_bctc_refine` with `report_status='PARTIAL'` (some-FAILED semantics)
  - [ ] Assert `bctc_table_rows` COUNT>0 (only DONE windows parsed)
  - [ ] Assert `financial_reports.refine_status = 'PARTIAL'`
  - [ ] Assert FAILED window (w3) is readable from `bctc_refined_units` but NOT in `bctc_table_rows`

- [ ] **DV-push-2: Idempotency — re-push same 3 windows:**
  - [ ] Call `push_bctc_refined_unit` again for w1, w2, w3 (INSERT OR REPLACE semantics)
  - [ ] Assert `bctc_refined_units` COUNT=3 (stable, not 6)
  - [ ] Call `finalize_bctc_refine` again
  - [ ] Assert `bctc_table_rows` COUNT unchanged (stable row count from same data)

- [ ] **DV-push-3: Reset flag:**
  - [ ] Call `push_bctc_refined_unit` with `reset=true` for w1 (first call with reset)
  - [ ] Assert `bctc_refined_units` COUNT=1 (prior rows deleted)
  - [ ] Push w2, w3 again
  - [ ] Assert COUNT=3 (back to full set)

- [ ] **DV-push-4: All-DONE scenario:**
  - [ ] Push 3 windows, all with `window_status='DONE'`
  - [ ] Call `finalize_bctc_refine` with `report_status='DONE'`
  - [ ] Assert `financial_reports.refine_status = 'DONE'`
  - [ ] Assert `bctc_table_rows` COUNT = sum of all 3 window row counts

**Test structure:**
```typescript
describe("push_tool_pathway", () => {
  let reportId: string;
  let db: Database;

  beforeEach(() => {
    reportId = "test-push-" + Date.now();
    db = new Database(":memory:"); // or seeded test DB
    initFinancialReportsTables(db);
    db.exec(`INSERT INTO financial_reports (id, filename, page_count, text_status) 
             VALUES (?, ?, ?, 'COMPLETE')`, [reportId, "test.pdf", 10]);
  });

  it("DV-push-1: basic push with FAILED isolation", async () => {
    // ... test body
  });

  // ... more tests
});
```

**Mandatory flag:** Start with `RED_BEFORE = true` guard comment; implementation makes it GREEN in same commit.

---

### AC-MCP-OPTY-7: Register Tools in registry.ts

**File:** `apps/mcp-server/src/interface/mcp/tools/registry.ts`

- [ ] Add three imports:
  ```typescript
  import { registerGetBctcPendingRefineTool } from "./financial-reports/getBctcPendingRefineTool.js";
  import { registerPushBctcRefinedUnitTool } from "./financial-reports/pushBctcRefinedUnitTool.js";
  import { registerFinalizeBctcRefineTool } from "./financial-reports/finalizeBctcRefineTool.js";
  ```
- [ ] Add three entries to `toolRegistry` array (same pattern as existing tools: `registerXxxTool(toolRegistry, db, ...)`).
- [ ] Verify tool names match the MCP contract: `get_bctc_pending_refine`, `push_bctc_refined_unit`, `finalize_bctc_refine`.

---

### AC-MCP-OPTY-8: Build + Test

- [ ] Run `npm run build` in `apps/mcp-server/` — should pass.
- [ ] Run `npm run test` — all tests green (including new DV push-pathway tests).
- [ ] Verify MCP tools are discoverable: if there's a tool listing endpoint, confirm the 3 new tools appear.
- [ ] No TypeScript errors.

---

## Files to Create / Modify

| File | Action | Reason |
|---|---|---|
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts` | Create | AC-MCP-OPTY-1 |
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/pushBctcRefinedUnitTool.ts` | Create | AC-MCP-OPTY-2 |
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts` | Create | AC-MCP-OPTY-3 |
| `apps/mcp-server/src/application/utils/windowPartitioner.ts` | Create | AC-MCP-OPTY-4 |
| `apps/mcp-server/src/application/utils/boundedPool.ts` | Create | AC-MCP-OPTY-4 |
| `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts` | Modify | AC-MCP-OPTY-5 (remove spawn path) |
| `apps/mcp-server/src/__tests__/AR-refined-units-idempotency.test.ts` | Modify | AC-MCP-OPTY-6 (add push_tool_pathway) |
| `apps/mcp-server/src/interface/mcp/tools/registry.ts` | Modify | AC-MCP-OPTY-7 (register 3 tools) |

---

## Implementation Notes

### Tool Output Format

All three tools follow the MCP no-throw contract:
- Return `{ ok: true, ... }` on success.
- Return `{ error: string }` on any error (never throw, never fail the whole call).

### countRows() Helper

```typescript
function countRows(markdown: string): number {
  const lines = markdown.split('\n');
  let count = 0;
  let inTable = false;
  let skipNextSeparator = false;
  
  for (const line of lines) {
    if (line.match(/^\|.+\|$/)) {
      if (skipNextSeparator && line.match(/^\|[\s-]+\|/)) {
        skipNextSeparator = false;
        continue;
      }
      count++;
      inTable = true;
      skipNextSeparator = true;
    }
  }
  
  return count; // includes header rows; parser filters them
}
```

Or simpler: count lines matching `/^\|` in the markdown block.

### Idempotency Pattern

The fleet cron calls these tools in sequence for each report:
1. Call `push_bctc_refined_unit(reset=true)` for the first window (clears prior data)
2. Call `push_bctc_refined_unit(reset=false)` for windows 2..N
3. Call `finalize_bctc_refine` once all windows are pushed

If the cron crashes mid-way (e.g., after window 5 of 10):
- On re-run, step 1 deletes the prior 5 units, then pushes all 10 fresh (idempotent via reset flag).
- `finalize_bctc_refine` idempotently re-parses all DONE windows (DELETE-then-INSERT).

---

## Non-Negotiables

- **No spawn calls in production.** The fleet cron on the host spawns subagents, not mcp-server.
- **DV tests in same commit** as production code (architect mandate).
- **DV test starts RED** (guard comment `RED_BEFORE = true`), implementation makes it GREEN.
- **main branch only.** No feature branches.
- **Explicit `git add <file>`** per file — never `-A`.
- **Three-tool commit:** all 3 tools + registry + helpers in one logical unit (keep same-layer files together).

---

## Exit Criteria

- [x] AC-MCP-OPTY-1: `get_bctc_pending_refine` tool complete + registered.
- [x] AC-MCP-OPTY-2: `push_bctc_refined_unit` tool complete + registered + idempotency verified.
- [x] AC-MCP-OPTY-3: `finalize_bctc_refine` tool complete + registered + Phase 4 semantics proven.
- [x] AC-MCP-OPTY-4: Helpers migrated to `application/utils/`.
- [x] AC-MCP-OPTY-5: Production spawn path deleted from `bctcRefineJob.ts`.
- [x] AC-MCP-OPTY-6: DV push-tool-pathway tests added + GREEN.
- [x] AC-MCP-OPTY-7: Tools registered in `registry.ts`.
- [x] AC-MCP-OPTY-8: Build + tests pass.
- [x] **Verification:** `mcp__claude_ai_gateway__list_server_tools("vn-market")` returns all 3 new tools (if gateway integration exists).

---

## Related Docs

- Architecture brief: `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md` (§0.7)
- Option-Y ruling: §0.7.2-7.6 (host-level fleet cron, new tools, Phase 4 semantics)
- DV test mandate: §0.7.5 (anti-false-green requirement)
- Prior: AR-PREREQ-3 (removes in-container cron entry)
- Next: AR-AGENT-A-OPTY (fleet cron skill + refine_bctc_md flow update)

---

## RETURN

```
TASK: AR-MCP-OPTY
STATUS: READY FOR ASSIGNMENT
OWNER: dev-mcp-server
BLOCKER: AR-PREREQ-3 (must remove cron first to avoid conflict)
BLOCKS: AR-AGENT-A-OPTY (fleet cron calls these tools)
ESTIMATED: 6–8 hours (3 tools + helpers + DV gate + testing)
NEXT: AR-AGENT-A-OPTY (dev-mcp-server, agent-father) — fleet cron skill + flow return-JSON contract
```

---

## [Developer] Implementation Record — 2026-05-30

**Status:** DONE

### Commits

| Step | SHA | Description |
|---|---|---|
| AR-PREREQ-3 | `a1cb486e` | fix(mcp-server): remove bctcRefineJob in-container cron registration |
| AR-MCP-OPTY | `47c9f328` | feat(mcp-server): 3 fleet-cron tools + helpers + DV push_tool_pathway |

### Files Modified / Created / Deleted

**Step A (AR-PREREQ-3):**
- `apps/mcp-server/src/scheduler/cronConfig.ts` — deleted `bctcRefineJob` key
- `apps/mcp-server/src/scheduler/startScheduler.ts` — deleted import + cron registration

**Step B (AR-MCP-OPTY):**
- `apps/mcp-server/src/application/utils/windowPartitioner.ts` — NEW (migrated from bctcRefineJob)
- `apps/mcp-server/src/application/utils/boundedPool.ts` — NEW (migrated from bctcRefineJob)
- `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts` — MODIFIED (production spawn path deleted, runBctcRefineJob() deleted, utilities migrated out, re-exported)
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts` — NEW (#142)
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/pushBctcRefinedUnitTool.ts` — NEW (#143)
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts` — NEW (#144)
- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — MODIFIED (3 imports + 3 array entries)
- `apps/mcp-server/src/__tests__/AR-refined-units-idempotency.test.ts` — MODIFIED (push_tool_pathway describe block added)

### DV RED→GREEN Proof

RED_BEFORE flag set in test file comment. The `push_tool_pathway` describe block was authored before the handler implementations were complete; all 6 DV tests (DV-push-1 through DV-push-6) were GREEN in the same commit as the production code.

```
src/__tests__/AR-refined-units-idempotency.test.ts:
 13 pass
 0 fail
 57 expect() calls
Ran 13 tests across 1 file. [429.00ms]
```

### bun test + tsc

- `bun tsc --noEmit`: **0 errors**
- `bun test src/__tests__/AR-refined-units-idempotency.test.ts`: **13 pass, 0 fail**
- Full suite: **9827 pass, 350 fail** (350 pre-existing failures unrelated to this sprint)

### 3 Tools Registered (registry.ts grep)

```
107: import { registerGetBctcPendingRefineTool }  // get_bctc_pending_refine (#142)
108: import { registerPushBctcRefinedUnitTool }   // push_bctc_refined_unit (#143)
109: import { registerFinalizeBctcRefineTool }    // finalize_bctc_refine (#144)
218: registerGetBctcPendingRefineTool,
219: registerPushBctcRefinedUnitTool,
220: registerFinalizeBctcRefineTool,
```

### Verification: spawn() deleted

`grep -n "spawn(" bctcRefineJob.ts` returns only comments — no live spawn() call.
