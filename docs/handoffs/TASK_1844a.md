---
sprint: 1844
branch: task/1844a-backtest-retrieval-tools
size: M
depends_on: []
blocks: []
---

## TLDR

Add two read-only MCP tools (`get_backtest_runs` #121 and `get_backtest_run` #122) that expose the existing `backtest_runs` SQLite table to callers. The domain repository interface gets a new `getAllRuns()` method; the infrastructure implementation adds the corresponding SELECT query; the tool handlers live in the existing `backtestTools.ts` under a new `registerBacktestQueryTools()` function.

## [PM] Planning Context

- **Acceptance Criteria:**
  - [ ] AC-1-1: `get_backtest_runs` with `strategy` + `limit` returns array of items with 11 summary fields, no `resultJson`
  - [ ] AC-1-2: `get_backtest_runs` with no args returns up to 10 runs across all strategies, no error key
  - [ ] AC-1-3: `get_backtest_runs` with `limit: 0` returns response containing `"error"` key
  - [ ] AC-1-4: `get_backtest_runs` with `limit: 99` returns response containing `"error"` key (Zod `max(50)` rejects — NOT silent clamping, consistent with `min(1)` rejection; confirm with PO before merge if UX preference differs)
  - [ ] AC-1-5: `get_backtest_runs` on empty table returns `[]`
  - [ ] AC-1-6: `get_backtest_runs` when SQLite throws returns `{ "error": "..." }` JSON, no exception propagated
  - [ ] AC-2-1: `get_backtest_run` with valid existing UUID returns 12-field object including `resultJson`
  - [ ] AC-2-2: `get_backtest_run` with valid UUID not in DB returns `{ "error": "Backtest run <id> not found." }`
  - [ ] AC-2-3: `get_backtest_run` with non-UUID string returns response containing `"error"` (Zod uuid() rejection)
  - [ ] AC-2-4: `get_backtest_run` when SQLite throws returns `{ "error": "..." }` JSON, no exception propagated
  - [ ] AC-2-5: `get_backtest_run` with known `resultJson` value: `JSON.parse(text).resultJson === originalString` (verbatim, not re-parsed)
  - [ ] AC-repo-1: `getAllRuns(10)` on populated table returns records sorted `runAt` DESC
  - [ ] AC-repo-2: `getAllRuns(10)` on empty table returns `[]`
  - [ ] 13 new tests pass (2 unit + 6 tool + 5 tool)
  - [ ] `bun test` shows >= 8804 pass / <= 1 fail after adding new tests
  - [ ] `tsc` remains clean (no new type errors)
  - [ ] `docs/data/project-stats.json` `toolCount` updated to 125 (verify actual count first)

- **Files to read first:**
  - `apps/mcp-server/src/domain/repositories/IBacktestResultRepository.ts` — existing interface (add `getAllRuns` after `getRunById`)
  - `apps/mcp-server/src/infrastructure/db/backtestResultRepo.ts` — existing implementation (add `getAllRuns` after `getRunById`, reuse `BacktestRunRow` + `rowToRecord`)
  - `apps/mcp-server/src/interface/mcp/tools/backtesting/backtestTools.ts` — existing `registerBacktestTools` (add `registerBacktestQueryTools` after it)
  - `apps/mcp-server/src/interface/mcp/tools/backtesting/index.ts` — add export
  - `apps/mcp-server/src/interface/mcp/tools/registry.ts` — add import + registry entry after `registerBacktestTools`
  - `apps/mcp-server/src/__tests__/1842d-backtest-engine.test.ts` — follow this pattern exactly for test setup
  - `docs/data/project-stats.json` — verify actual `toolCount` before updating

- **Files to create:**
  - `apps/mcp-server/src/__tests__/1844-backtest-retrieval.test.ts` — 13 tests (U-1, U-2, T-1 through T-11)

- **Files to modify:**
  - `apps/mcp-server/src/domain/repositories/IBacktestResultRepository.ts` — add `getAllRuns(limit: number): BacktestRunRecord[]` to interface; update JSDoc task reference to include Task 1844
  - `apps/mcp-server/src/infrastructure/db/backtestResultRepo.ts` — add `getAllRuns()` SQLite implementation after `getRunById`
  - `apps/mcp-server/src/interface/mcp/tools/backtesting/backtestTools.ts` — add `registerBacktestQueryTools(server: McpServer): void` with `get_backtest_runs` (#121) and `get_backtest_run` (#122)
  - `apps/mcp-server/src/interface/mcp/tools/backtesting/index.ts` — export `registerBacktestQueryTools`
  - `apps/mcp-server/src/interface/mcp/tools/registry.ts` — import `registerBacktestQueryTools` from `./backtesting/index.js`; add entry after `registerBacktestTools` with slot comment `// Task 1844: get_backtest_runs (#121) + get_backtest_run (#122) (+2 → 122)`
  - `docs/data/project-stats.json` — `toolCount` 123→125 (verify ground truth first), `testBaseline` updated, `totalTasksDone` +1, `currentSprint` = 1844

- **Dependencies:** none (1844a is the sole task this sprint)

- **Knowledge needed:** `.claude/knowledge/dev-standards.md`

---

## Architecture Reference

Full design in `docs/handoffs/ARCH_1844.md`. Key decisions:

**BLK-1 (tool slots):** `get_backtest_runs` = #121, `get_backtest_run` = #122. No slots 121-123 are reserved anywhere in the codebase.

**BLK-2 (getAllRuns interface):** Option A — explicit `getAllRuns(limit: number): BacktestRunRecord[]` method. Do NOT overload `getRunsByStrategy`. The SQL body is a verbatim copy of `getRunsByStrategy` minus the `WHERE strategy = ?` clause.

**BLK-3 (file organisation):** Extend `backtestTools.ts`. Do NOT create a new file.

### Zod schemas

```typescript
// get_backtest_runs
{
  strategy: z.enum(["kinh-dich-high-confidence", "kinh-dich-all", "combined-high-confidence"])
    .optional()
    .describe("Filter by strategy ID. Omit to list runs across all strategies."),
  limit: z.number().int().min(1, "limit must be >= 1").max(50).default(10).optional()
    .describe("Maximum number of results to return (1–50, default 10)."),
}

// get_backtest_run
{
  id: z.string().uuid().describe("UUID of the backtest run to retrieve."),
}
```

### RISK-1 note (AC-1-4)

Architect chose `z.number().max(50)` (validation error on >50), NOT `.transform(v => Math.min(v, 50))` (silent clamp). This is consistent with `min(1)` rejection. Test T-4 asserts error response for `limit: 99`. If PO prefers silent clamping, the schema and T-4 must both be changed before merge.

### Handler patterns

Both handlers follow the U-4 pattern: `getDb()` called inside the handler, not at module scope. See `ARCH_1844.md` sections 4.1 and 4.2 for the full handler code.

`get_backtest_runs`: strips `resultJson` via destructuring (`const { resultJson: _omit, ...rest } = run`) — summary list only.

`get_backtest_run`: returns full record including `resultJson` verbatim (not re-parsed).

### registry.ts comment convention

After this sprint, the registry comment block must read:
```
registerBacktestTools,               // Task 1842d: run_backtest (+1 → 120)
registerBacktestQueryTools,          // Task 1844: get_backtest_runs (#121) + get_backtest_run (#122) (+2 → 122)
```

The comment watermark (→ 122) diverges from actual `toolCount` (125). Do not reconcile in this sprint — leave a TODO comment for a future janitor task.

### Test setup pattern

Follow `1842d-backtest-engine.test.ts` exactly:
- `makeDb()`: creates `:memory:` Database, calls `initBacktestingTables(db)`
- `insertRun(db, record)`: inserts via `SqliteBacktestResultRepository.saveRun()`
- One fixture `McpServer` per describe block with `registerBacktestQueryTools` applied

### toolCount verification

Before updating `docs/data/project-stats.json`, verify actual tool count:
```bash
grep -c 'server\.tool(' apps/mcp-server/src/interface/mcp/tools/**/*.ts
```
Expected baseline: 123. After this sprint: 125. Use the ground-truth count, not the comment watermark.
