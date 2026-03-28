# Task Report: 085 — SSC Report MCP Tools (fetch/summary/compare)

date: 2026-03-26
outcome: APPROVED

---

## Test Results

- Unit tests (085): **7 passed / 0 failed**
- Full regression suite: **222 passed / 0 failed**
- TypeScript (`bun tsc --noEmit`): **0 errors**

---

## DDD Compliance: PASS

The implementation is in `src/interface/mcp/tools/reports.ts` — the interface layer. It correctly imports from:
- `src/application/usecases/fetchParseAndStoreBctc.ts` (application layer)
- `src/domain/services/periodDeltaComputer.ts` (domain layer, read-only service)
- `src/infrastructure/db/schema.ts` (infrastructure layer — acceptable for interface layer)

`src/domain/` has zero imports from infrastructure or application — confirmed clean.

---

## Security: PASS

- All SQL queries use `better-sqlite3` parameterized bindings (`$paramName` pattern). No user input is concatenated into SQL strings.
- The `whereClause` in `get_financial_summary` is built from hard-coded column name strings; user values are bound separately via `bindParams`.
- `process.env` usage in test files is test setup only (`process.env["DB_PATH"] = ":memory:"`); production code in `reports.ts` uses no `process.env`.
- No `any` types in the two new files (`src/interface/mcp/tools/reports.ts`, `src/__tests__/085-tool-reports.test.ts`).
- Legacy `src/tools/` files have pre-existing `any` usages — out of scope for this task.

---

## MCP Tools: PASS

Three tools registered by `registerReportTools(server, pipelineFn?)`:

| Tool | Purpose | Zod Validated |
|------|---------|---------------|
| `fetch_ssc_reports` | Triggers full BCTC pipeline; returns formatted summary | `actionCode`, `year`, `quarter` with `.describe()` |
| `get_financial_summary` | Queries SQLite for stored reports; optional year/quarter filters | `actionCode` required; `year`, `quarter` optional with `.describe()` |
| `compare_financials` | Computes YoY/QoQ delta between two stored periods | `actionCode`, `period1`, `period2` (nested PeriodSchema) |

All three tools:
- Wrapped in try/catch with user-friendly error messages
- Return `{ content: [{ type: 'text' as const, text: '...' }] }` format
- Have English descriptions and `.describe()` on every Zod field

---

## Issues Found

### Blocking

None.

### Non-Blocking

1. **TDD order**: Test and implementation were committed in a single commit (`dacd2bd`) rather than separate Red/Green commits. Not a functional issue — all tests pass and are meaningful.

2. **`null as unknown as number` casts in test fixture** (`src/__tests__/085-tool-reports.test.ts`, lines 165–185): The `FinancialReport.ratios` type requires `number` for fields that logically can be null (e.g. `roic`, `quickRatio`). The fixture uses `null as unknown as number` to satisfy TypeScript while testing null-handling paths. This is a symptom of a domain model type issue in `bctc-schema.ts` (pre-existing, out of scope for task 085).

3. **`fmtBillions` comment**: The JSDoc says "million × 1000 ÷ 1000" which simplifies to million — the actual formula is `millionVnd / 1000` converting million VND to billion VND (tỷ). Functionally correct, comment is slightly confusing.

---

## Coverage Note

Task 085 files have strong coverage:
- `src/interface/mcp/tools/reports.ts`: 100% functions, 92.15% lines (uncovered lines 270–279, 387–396, 551–560 are catch blocks for exceptions that would require runtime errors to trigger — acceptable)
- `src/__tests__/085-tool-reports.test.ts`: 100% functions and lines

---

## Merge Status

Merged to `main` via:
```
git merge --no-ff task/085-tool-reports -m "merge(085): SSC report MCP tools"
```

Branch `task/085-tool-reports` deleted. TASKS.md updated: 085 moved to Done (Done count: 19 → 20).
