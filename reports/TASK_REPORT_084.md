# Task Report — Task 084: Market MCP Tools (get_market_snapshot, get_patterns)

> **Branch**: `task/084-tool-market`
> **Date started**: 2026-03-28
> **Date merged**: 2026-03-28
> **Final status**: APPROVED
> **DDD layer**: interface

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Todo | 2026-03-28 | Sprint 006 planning; deps 081, 013, 065 all Done |
| Todo → In Progress | 2026-03-28 | Assigned to Developer |
| In Progress → Review | 2026-03-28 | 14/14 tests pass, tsc clean |
| Review → Done | 2026-03-28 | QA approved, merged to main |

---

## Role Activity Log

### PM (Project Manager)
- Defined task scope: 2 MCP tools — `get_market_snapshot` and `get_patterns`
- Confirmed: `search_similar_context` must NOT be re-registered (already in analysis.ts)
- Dependencies: 081 (server), 013 (retriever), 026/027 (market fetchers), 065 (pattern matcher)
- DDD layer: interface/mcp/tools

### Developer
- Files created: `src/interface/mcp/tools/marketTools.ts`, `src/__tests__/084-tool-market.test.ts`
- Files modified: `src/interface/mcp/tools/index.ts` (barrel export), `src/interface/mcp/server.ts` (registerMarketTools call)
- TDD cycle: Tests and implementation committed in a single commit (see non-blocking note below)
- Tests written: `src/__tests__/084-tool-market.test.ts` — 14 tests
- Assumptions: `_testHoseClient`/`_testHnxClient`/`_testUpcomClient` injected via Zod `z.any().optional()` for mock HTTP in tests; stripped in production

### QA — Review 1
- Date: 2026-03-28
- Outcome: APPROVED
- `bun test src/__tests__/084-tool-market.test.ts`: PASS (14/14)
- `bun test` full suite: PASS (451 tests, 0 failures)
- `bun tsc --noEmit`: PASS (0 errors)
- Issues found: 0 blocking, 1 non-blocking

---

## Test Results

```
bun test src/__tests__/084-tool-market.test.ts

  Task 084 — Market MCP Tools
    get_market_snapshot
      (pass) returns formatted VN-Index header when no codes provided
      (pass) returns 'No codes provided' or snapshot header for empty codes array
      (pass) handles exchange fetch error gracefully (one exchange fails, others succeed)
      (pass) formats prices grouped by exchange
      (pass) includes generatedAt timestamp in the output
    get_patterns
      (pass) returns 'No historical precedents found' when no rag_analyses match
      (pass) returns formatted pattern summary when precedents exist
      (pass) returns dominant direction and avg impact in summary
      (pass) returns no-match message for unknown stock even if keyword matches
      (pass) respects lookbackHours = 1 (very short window returns no results for old data)
    registerMarketTools export
      (pass) registerMarketTools is exported from the tools barrel index
      (pass) registerMarketTools registers exactly 2 new tools on a fresh McpServer
      (pass) all 4 groups + market tools total 16 tools on a combined McpServer
      (pass) does NOT register search_similar_context (it is already in analysis.ts)

  14 pass, 0 fail
```

**Coverage notes**: All acceptance criteria covered. Error isolation path for each exchange fetch is tested. Edge cases: empty codes array, unknown stock code, lookback time window filtering, and no-duplicate-tool guard.

---

## Issues Discovered During Review

### BLOCKING Issues

None.

---

### NON-BLOCKING Issues

#### Issue 084-01
- **Type**: TDD process (minor deviation)
- **File**: `src/__tests__/084-tool-market.test.ts` (git log)
- **Description**: Tests and implementation were committed in a single commit (`a5b4063`) rather than a red-first commit followed by a green commit. This deviates from the TDD discipline of committing the failing test before writing implementation.
- **Impact**: None to code quality or test validity. Tests are substantive and cover all acceptance criteria.
- **Fix applied**: Deferred (process note only). Tests are comprehensive — no re-work required.
- **Status**: Won't fix (retroactive TDD ordering not worth a rebase; tests are correct and meaningful)

#### Issue 084-02
- **Type**: Code smell (z.any() in Zod schema)
- **File**: `src/interface/mcp/tools/marketTools.ts:93-95`
- **Description**: Three `z.any().optional()` fields (`_testHoseClient`, `_testHnxClient`, `_testUpcomClient`) are registered in the Zod schema for test injection. These are unknown to production callers and Zod strips them on parse, so there is no runtime risk. However, they slightly pollute the tool schema description surfaced to Claude.
- **Impact**: Low — these fields are hidden from the tool's public schema in practice.
- **Fix applied**: Deferred. Pattern is consistent with existing test injection patterns in the codebase (e.g., analysis.ts).
- **Status**: Won't fix (acceptable pattern; can be removed when Task 123 integration tests replace the mock injection approach)

---

## Bug Report

| # | Severity | Description | File | Status |
|---|----------|-------------|------|--------|
| — | — | No bugs found | — | — |

---

## Security Report

| # | Category | Description | Risk | Mitigation |
|---|----------|-------------|------|------------|
| 1 | SQL injection | `getPatternSummary` uses parameterised queries for stockPattern and keywordPattern | None | Parameterised queries confirmed; no string interpolation into SQL |
| 2 | process.env | Test file uses `process.env["DB_PATH"]` = ":memory:" | Low | Test-only; consistent pattern across all 084-era tests; production uses Bun.env |

**Security verdict**: CLEAN

---

## DDD Compliance

| Rule | Result | Notes |
|------|--------|-------|
| `src/domain/` has zero imports from `infrastructure/` or `application/` | PASS | Pre-existing `newsNormalizer.ts` imports `RssItem` from infrastructure; not introduced by task 084 |
| `marketTools.ts` is in `interface/` layer — may import from infrastructure | PASS | Interface layer importing infrastructure is correct per DDD |
| `getPatternSummary` (application layer) does not import from interface | PASS | Clean application layer; only imports from infrastructure/db |
| No business logic in MCP tool handlers | PASS | Tool handlers delegate to `getPatternSummary` and formatting helpers only |
| Repository interfaces in `src/domain/repositories/` | N/A | Tool does not define new repository interfaces |

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| `get_market_snapshot` and `get_patterns` are the only 2 tools registered by `registerMarketTools` | PASS | Confirmed by test: exactly 2 tools on fresh server |
| `search_similar_context` is NOT registered in market tools | PASS | Test explicitly asserts absence |
| `registerMarketTools` exported from barrel index.ts | PASS | Verified in `src/interface/mcp/tools/index.ts` |
| `registerMarketTools` called in `server.ts` | PASS | Line 85 of `src/interface/mcp/server.ts` |
| Total tool count is 16 after all groups registered | PASS | 4 + 3 + 4 + 3 + 2 = 16; test asserts exactly 16 |
| Each exchange fetch is error-isolated (one fails, others succeed) | PASS | Tested: HNX failing client, HOSE still returns data |
| `get_patterns` delegates to `getPatternSummary` correctly | PASS | Returns null → "No historical precedents found" message; returns summary → formatted output |
| `get_market_snapshot` includes generatedAt timestamp | PASS | Output matches `/Generated|generated|UTC|T\d{2}:\d{2}/` |
| `lookbackHours` filtering enforced (old data excluded) | PASS | 48h-old data not returned for 1h window |
| `bun test` full suite: 0 failures | PASS | 451 tests, 0 failures |
| `bun tsc --noEmit`: 0 errors | PASS | TypeScript strict clean |

---

## Merge Summary

```bash
git merge --no-ff task/084-tool-market -m "merge(084): Market MCP tools (get_market_snapshot, get_patterns)"
```

- Commits in branch: 1
- Files changed: 5
- Lines added: +721  |  Lines removed: -4
- Tests added: 14 new tests
- Type errors at merge: 0

---

## Notes for Next Tasks

- Task 123 (Integration tests — MCP tools with real SQLite) is now fully unblocked. Task 084 was the last missing dependency. Task 123 should be promoted to the next sprint wave.
- The `_testHoseClient` / `_testHnxClient` / `_testUpcomClient` injection pattern in `get_market_snapshot` can be refactored out once Task 123 validates end-to-end behavior with real SQLite. At that point the `z.any()` fields can be removed from the Zod schema.
- Sprint 006 Wave 2 is complete. All Sprint 006 tasks (065, 066, 027, 084, 105) are now Done.
