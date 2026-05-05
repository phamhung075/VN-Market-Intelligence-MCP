---
sprint: 1846
branch: task/1846b-backtest-lifecycle-tools
size: M
depends_on: []
blocks: []
---

## TLDR

Extend the backtest repository interface and SQLite adapter with `deleteRun()`, implement three new MCP lifecycle tools (`delete_backtest_run` #123, `export_backtest_run_csv` #124, `compare_backtest_runs` #125) in a new `backtestLifecycleTools.ts` file, wire them through the barrel and registry, and ship 19 tests covering all four suites (A–D). All 6 files are tightly coupled and must land in a single commit.

## [PM] Planning Context

- **Acceptance Criteria:**
  - [ ] AC-1-1: `delete_backtest_run` happy path returns `{ deleted: true, id: "<uuid>" }`
  - [ ] AC-1-2: `delete_backtest_run` unknown UUID returns `{ error: "Backtest run not found: <id>" }`
  - [ ] AC-1-3: `delete_backtest_run` non-UUID input triggers Zod validation error (never reaches handler)
  - [ ] AC-1-4: `deleteRun()` returns `true` when `changes >= 1`, `false` when `changes === 0`
  - [ ] AC-1-5: `deleteRun()` returns `false` (no throw) on any SQLite error
  - [ ] AC-2-1: `export_backtest_run_csv` returns header + N data rows sorted by `exitDate` ASC
  - [ ] AC-2-2: Each data row contains exactly 8 comma-separated fields in order: `date,ticker,direction,entryPrice,exitPrice,returnPct,positionWeight,holdDays`
  - [ ] AC-2-3: `holdDays` = `Math.max(0, Math.round((exitDate - entryDate) / 86_400_000))`
  - [ ] AC-2-4: Zero-trade run returns header row only, no error
  - [ ] AC-2-5: Unknown ID returns `{ error: "Backtest run not found: <id>" }`
  - [ ] AC-2-6: Corrupt `resultJson` returns `{ error: "resultJson parse failed for run <id>" }`
  - [ ] AC-2-7: When `includeEquityCurve=true`, appends blank line + `equity_curve` section (Option C recomputation from `trades[]`)
  - [ ] AC-3-1: `compare_backtest_runs` returns array of objects each with exactly 11 fields, in input ID order
  - [ ] AC-3-2: Any missing ID returns `{ error: "Backtest runs not found: [<ids>]" }` — no partial result
  - [ ] AC-3-3: Array with 1 element triggers `z.array().min(2)` Zod error
  - [ ] AC-3-4: Array with 6 elements triggers `z.array().max(5)` Zod error
  - [ ] AC-3-5: Duplicate IDs in input are deduplicated; response contains each unique run once
  - [ ] AC-3-6: `benchmarkReturn` and `sharpeRatio` serialise as `null` (not `undefined`) when absent
  - [ ] AC-iface: `SqliteBacktestResultRepository` satisfies `IBacktestResultRepository` (tsc clean)
  - [ ] AC-tests: `bun test 1846` shows 19 pass, 0 fail
  - [ ] AC-tsc: `bun run tsc --noEmit` exits 0
  - [ ] AC-csv-raw: `export_backtest_run_csv` returns raw CSV string in `text` field, NOT JSON-wrapped

- **Files to read first:**
  - `apps/mcp-server/src/domain/repositories/IBacktestResultRepository.ts` — existing interface (add `deleteRun`)
  - `apps/mcp-server/src/infrastructure/db/backtestResultRepo.ts` — existing repo (add `deleteRun` impl)
  - `apps/mcp-server/src/interface/mcp/tools/backtesting/backtestTools.ts` — pattern reference for tool registration
  - `apps/mcp-server/src/interface/mcp/tools/backtesting/index.ts` — barrel (add export)
  - `apps/mcp-server/src/interface/mcp/tools/registry.ts` — registry (add import + entry)
  - `apps/mcp-server/src/__tests__/1844-backtest-retrieval.test.ts` — test pattern reference (`callTool`, `makeRecord`, `beforeEach`/`afterEach` with `closeDb`/`initDatabase`/`getDb`)
  - `docs/handoffs/ARCH_1846.md` — full architect spec (blocker decisions, CSV schema, tool specs, test strategy)

- **Files to create:**
  - `apps/mcp-server/src/interface/mcp/tools/backtesting/backtestLifecycleTools.ts` — `registerBacktestLifecycleTools(server)` registering tools #123, #124, #125
  - `apps/mcp-server/src/__tests__/1846-backtest-lifecycle.test.ts` — 19 tests in 4 suites (A: repo unit 3, B: delete tool 4, C: export tool 6, D: compare tool 6)

- **Files to modify:**
  - `apps/mcp-server/src/domain/repositories/IBacktestResultRepository.ts` — add `deleteRun(id: string): boolean` to interface
  - `apps/mcp-server/src/infrastructure/db/backtestResultRepo.ts` — implement `deleteRun()` with `DELETE WHERE id=?` + `.changes` check + `try/catch` returning `false`
  - `apps/mcp-server/src/interface/mcp/tools/backtesting/index.ts` — add `export { registerBacktestLifecycleTools } from "./backtestLifecycleTools.js";`
  - `apps/mcp-server/src/interface/mcp/tools/registry.ts` — import `registerBacktestLifecycleTools` from `./backtesting/index.js` + add entry after `registerBacktestQueryTools`

- **Dependencies:** none (1846a clean task completed; this is the only remaining Sprint 1846 impl task)

- **Knowledge needed:** `.claude/knowledge/dev-standards.md`

---

## Key design decisions (from ARCH_1846.md — do NOT reopen)

### BLK-1: Equity curve — Option C (recompute on demand)

No schema change. Algorithm in handler body:
```
1. sortedTrades = [...trades].sort((a, b) => a.exitDate.localeCompare(b.exitDate))
2. equity = 1.0; equityCurve = [1.0]
3. for each t: equity *= (1 + t.positionWeight * t.returnPct); equityCurve.push(equity)
4. return equityCurve  // length = trades.length + 1
```

### BLK-2: New file `backtestLifecycleTools.ts`

Do NOT extend `backtestTools.ts`. Single export: `registerBacktestLifecycleTools(server: McpServer): void`.

### BLK-3: UUID validation

New tools use `z.string().uuid()`. Existing `get_backtest_run` (`z.string().min(1)`) is left as-is.

---

## Tool specs (from ARCH_1846.md §5)

### `delete_backtest_run` (#123)

Zod: `{ id: z.string().uuid() }`

Handler:
1. `getDb()` inside handler body (U-4 pattern)
2. `new SqliteBacktestResultRepository(db)`
3. `repo.deleteRun(id)` → boolean
4. false → `return { error: "Backtest run not found: ${id}" }`
5. true → `return { deleted: true, id }`

### `export_backtest_run_csv` (#124)

Zod: `{ id: z.string().uuid(), includeEquityCurve: z.boolean().default(false) }`

Response: raw CSV string — `return { content: [{ type: "text" as const, text: csvString }] }` (no JSON.stringify)

CSV header: `date,ticker,direction,entryPrice,exitPrice,returnPct,positionWeight,holdDays`

Rounding: `entryPrice`/`exitPrice` → `.toFixed(2)`, `returnPct`/`positionWeight` → `.toFixed(6)`, `holdDays` → `Math.max(0, Math.round(...))`.

Equity curve section (when `includeEquityCurve=true`): blank line + `equity_curve` label + `index,equityValue` header + rows with `.toFixed(6)`.

### `compare_backtest_runs` (#125)

Zod: `{ ids: z.array(z.string().uuid()).min(2).max(5) }`

Dedup: `[...new Set(ids)]`. Collect all missing IDs first; if any missing return single error. Use `run.benchmarkReturn ?? null` and `run.sharpeRatio ?? null` explicitly. Exclude `resultJson` from output objects.

11-field comparison object per run: `id, strategy, startDate, endDate, runAt, totalReturn, benchmarkReturn, maxDrawdown, sharpeRatio, winRate, tradeCount`.

---

## Test suite reference (from ARCH_1846.md §7)

| Suite | Tests | Key scenarios |
|-------|-------|---------------|
| A — `deleteRun()` repo unit | 3 | returns true (changes>=1), returns false (changes===0), returns false on SQLite error (close DB before call) |
| B — `delete_backtest_run` tool | 4 | happy path, unknown UUID, non-UUID Zod rejection, double-delete = not-found |
| C — `export_backtest_run_csv` tool | 6 | 3-trade sorted, 8 fields per row, holdDays arithmetic, 0-trade header-only, unknown id, corrupt resultJson |
| D — `compare_backtest_runs` tool | 6 | 2-run compare 11 fields, one missing id, 1-element Zod, 6-element Zod, dedup, null serialisation |

Pattern: in-memory SQLite via `closeDb()`/`initDatabase()`/`getDb()` in `beforeEach`, `closeDb()` in `afterEach`. `callTool` helper reused from 1844 test file. New `makeTradeRecord` helper for export/equity tests.

---

## Registry and barrel changes (exact lines from ARCH_1846.md §6)

**`registry.ts` import line** (after `registerBacktestQueryTools` import):
```typescript
import { registerBacktestLifecycleTools } from "./backtesting/index.js";
```

**`registry.ts` array entry** (after `registerBacktestQueryTools` line):
```typescript
registerBacktestLifecycleTools, // Task 1846: delete_backtest_run (#123) + export_backtest_run_csv (#124) + compare_backtest_runs (#125) (+3 → 125)
```

**`index.ts` barrel line**:
```typescript
export { registerBacktestLifecycleTools } from "./backtestLifecycleTools.js";
```

---

## DDD compliance

| Concern | Layer | Compliant |
|---------|-------|-----------|
| `deleteRun()` port declaration | domain/repositories | No infra imports |
| `deleteRun()` SQLite adapter | infrastructure/db | Imports domain interface only |
| Equity curve recomputation | interface/mcp/tools | Pure arithmetic, no DB, no domain service |
| `holdDays` derivation | interface/mcp/tools | Presentation logic, correct layer |
| CSV serialisation | interface/mcp/tools | No npm dep, manual string build |
| `getDb()` injection | interface/mcp/tools | U-4 pattern: inside handler body only |

`domain/` gains zero infrastructure imports. `backtestEngine.ts` is untouched.

---

## Commit message

```
task(1846b): backtest lifecycle tools — delete (#123) + export csv (#124) + compare (#125)

- IBacktestResultRepository: add deleteRun(id): boolean
- SqliteBacktestResultRepository: implement deleteRun() with DELETE + .changes
- backtestLifecycleTools.ts: registerBacktestLifecycleTools() for tools #123-#125
- backtesting/index.ts: export registerBacktestLifecycleTools
- registry.ts: import + register registerBacktestLifecycleTools at #123-#125
- 1846-backtest-lifecycle.test.ts: 19 tests, 4 suites (A-D), 0 fail
```
