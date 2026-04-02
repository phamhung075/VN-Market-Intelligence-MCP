# Task Report — Task 217: compare_stocks MCP Tool

> **Branch**: `worktree-agent-a1f64692`
> **Date started**: 2026-04-01
> **Date merged**: 2026-04-02 (commit `ed5a0f7`)
> **Final status**: APPROVED
> **DDD layer**: interface (MCP tool)

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Todo | 2026-04-01 | Sprint 030 planned |
| Todo → In Progress | 2026-04-01 | Developer assigned |
| In Progress → Review | 2026-04-02 | 20 tests pass, tsc clean |
| Review → Done | 2026-04-02 | QA approved, merged to main |

---

## Role Activity Log

### Developer

- Files created:
  - `src/interface/mcp/tools/compareTools.ts` (416 lines)
  - `src/__tests__/217-compare-stocks.test.ts` (395 lines)
- Files modified:
  - `src/interface/mcp/tools/index.ts` — added `registerCompareTools` export
  - `src/interface/mcp/server.ts` — registered `registerCompareTools`
- TDD cycle followed: YES (test commit precedes implementation commit)
- Tests written: `src/__tests__/217-compare-stocks.test.ts`, 20 tests
- Assumptions made:
  - `interface/` layer may import `infrastructure/db/schema.js` and `infrastructure/logger.js` directly (established pattern in codebase — consistent with `marketTools.ts`, `alertDigestTools.ts`, etc.)
  - No dedicated use-case layer needed for simple read-only aggregation query

---

## Test Results

```
bun test src/__tests__/217-compare-stocks.test.ts

  20 pass
  0 fail
  40 expect() calls

Ran 20 tests across 1 file. [239ms]
```

### Test coverage (20 tests)

| Test | Description |
|------|-------------|
| registerCompareTools registers compare_stocks tool | Tool registration check |
| returns error when fewer than 2 codes | Validation: min 2 stocks |
| returns error when more than 5 codes | Validation: max 5 stocks |
| output includes Vietnamese header | Output format |
| output includes stock codes as column headers | Output format |
| output contains Gia row with formatted prices | Price display |
| output contains Thay doi row with +/- sign | Price change sign formatting |
| output contains P/E row from latest report | Financial ratio |
| output contains ROE row from latest report | Financial ratio |
| uses LATEST report when multiple exist | Latest sort_key selection |
| shows N/A for P/E when no financial report | Missing data handling |
| output contains DT YoY row | Revenue YoY delta |
| output contains Canh bao row with alert counts | Alert count |
| counts VCB alerts correctly (3 in last 7 days) | Alert count accuracy |
| excludes alerts older than 7 days | Time window filtering |
| output contains Xac tin row (even if N/A) | Conviction score |
| handles stock with no data gracefully (N/A) | Missing data |
| handles 5 stocks (maximum) | Max capacity |
| normalises lowercase input codes to uppercase | Input normalisation |
| returns MCP content array with type=text | MCP format contract |

**Coverage notes**: Uncovered lines 163, 401-411 are the `initDatabase()` early-init guard and error-log branch of the catch block. Both are defensive paths that do not affect correctness under normal test conditions.

---

## Full Regression Suite

```
bun test (full suite, worktree)

  669 pass
  2 fail

Ran 671 tests across 44 files.
```

The 2 failures (`085-tool-reports` and `081-bun-mcp-server`) are pre-existing in the worktree and caused by the worktree's older server.ts base — they are unrelated to task 217 and do not exist on `main` (both pass on main with 0 failures).

---

## TypeScript Check

```
bun tsc --noEmit
```

Result: 0 errors.

---

## DDD Compliance: PASS

- `src/domain/` has zero imports from `infrastructure/` or `application/` (scan clean)
- `compareTools.ts` is in `interface/mcp/tools/` — the correct layer for MCP tools
- The tool imports `getDb` and `logger` from infrastructure directly, consistent with the existing pattern used by `marketTools.ts`, `alertDigestTools.ts`, and other MCP tools in this codebase
- No business logic in the tool handler — all logic is data retrieval and formatting

---

## Security: PASS

| Check | Result | Detail |
|-------|--------|--------|
| SQL injection | PASS | All queries use parameterized placeholders: `codes.map(() => "?").join(", ")` |
| `process.env` usage | PASS | Not present in `compareTools.ts` |
| `any` types | PASS | Zero `: any` in implementation |
| Non-null assertions | PASS | No unguarded `!` operator |
| Input validation | PASS | Zod schema: `z.array(z.string().min(1).max(10)).min(2).max(5)` with `.describe()` |
| Error handling | PASS | Full try/catch wrapping the handler, returns Vietnamese error message |

---

## Issues Found

### Blocking

None.

### Non-Blocking

1. **Server.ts regression in the worktree base** — The worktree `worktree-agent-a1f64692` was branched from an old state of the repository and only registers 6 tools in server.ts (vs 62 on main). This is a worktree isolation artifact, not a defect in task 217's code. Task 217 code itself (`compareTools.ts`, the test file) was cherry-picked/merged cleanly to main via commit `ed5a0f7`. The server.ts on `main` correctly registers all 62 tools including `registerCompareTools` at line 143.

2. **`conviction_history` table guard** — The tool gracefully checks for the table's existence at runtime (`SELECT name FROM sqlite_master WHERE type='table' AND name=?`) before querying it. This is correct behaviour; the optional table may not exist in all deployments.

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| Tool accepts 2-5 stock codes | PASS | Zod `min(2).max(5)` enforced |
| Returns price and % change per stock | PASS | `Gia` and `Thay doi` rows present |
| Returns P/E and ROE from latest BCTC report | PASS | Latest by `MAX(sort_key)` |
| Returns revenue YoY delta | PASS | `DT YoY` row with prior period fetch |
| Returns alert count for last 7 days | PASS | Time-windowed query confirmed by tests |
| Returns conviction score when available | PASS | Graceful N/A when table absent |
| Input codes normalised to uppercase | PASS | `rawCodes.map(c => c.toUpperCase())` |
| Returns MCP `{ content: [{ type: 'text' }] }` format | PASS | Confirmed in test 20 |
| Vietnamese output, no Markdown, no emojis | PASS | Plain-text table format verified |
| try/catch on entire handler | PASS | Wraps all data access + formatting |
| Zero `any` types | PASS | All interfaces typed |
| `bun tsc --noEmit` = 0 errors | PASS | |
| 20 tests pass | PASS | 20/20 |

---

## Merge Summary

```bash
git merge --no-ff worktree-agent-a1f64692 -m "merge(217): compare_stocks MCP tool — side-by-side comparison, 20 tests"
```

Merge commit: `ed5a0f7` on `main`

- Files changed: 3 (compareTools.ts new, tools/index.ts updated, server.ts updated) + test file
- Tests added: 20 new tests
- Type errors at merge: 0

---

## Notes for Next Tasks

- `compare_stocks` is now available in the 62-tool MCP server
- Task 218 (weekly portfolio report) had a soft dependency on task 217 — that dependency is now cleared
- Known tech debt: no use-case layer for `compareTools.ts` — data access is direct via `getDb()`. Acceptable for read-only aggregation; refactor to a use case if the query grows significantly
