# Task Report — Task 083: Analysis MCP Tools

> **Branch**: `task/083-tool-analysis`
> **Date started**: 2026-03-27
> **Date merged**: 2026-03-27
> **Final status**: APPROVED
> **DDD layer**: interface

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Todo | 2026-03-27 | Unblocked after task 062 merged (Wave 4 of Sprint 004) |
| Todo → In Progress | 2026-03-27 | Assigned to Developer |
| In Progress → Review | 2026-03-27 | Developer submitted; 16 tests pass, tsc clean |
| Review → Done | 2026-03-27 | QA approved, merged to main |

---

## Role Activity Log

### PM (Project Manager)
- Defined task scope: expose three MCP tools — `fetch_and_analyze`, `run_impact_chain`, `search_similar_context`
- Identified dependencies: Task 062 (cascade engine + runImpactChain), Task 081 (Bun server), Task 022/023 (RSS fetchers)
- DDD layer assigned: interface
- Context injection: `src/interface/mcp/tools/`, `src/application/usecases/runImpactChain.ts`, `src/infrastructure/rag/retriever.ts`

### Developer
- Files created: `src/__tests__/083-tool-analysis.test.ts`, `src/interface/mcp/tools/analysis.ts` (real implementation replacing stub)
- Files modified: `TASKS.md` (moved to Review), `src/interface/mcp/tools/index.ts` (barrel export already correct)
- TDD cycle followed: YES — test file committed before implementation
- Tests written: `src/__tests__/083-tool-analysis.test.ts`, 16 tests
- Assumptions made:
  - `process.env["DB_PATH"]` used in tests for in-memory SQLite (acceptable test-only override; production uses `Bun.env`)
  - `RssItem` type import in `newsNormalizer.ts` is an approved structural `import type` per TECH-004 FR-061-7
- Time to implement: ~1h

### QA — Review 1
- Date: 2026-03-27
- Outcome: APPROVED
- `bun test src/__tests__/083-*.test.ts` result: PASS (16 tests, 0 failures, 9.40s)
- `bun test` (full regression) result: PASS — all tests across all files pass; toolCount=14 confirmed in 081 server test
- `bun tsc --noEmit` result: PASS (0 errors)
- Issues found: 0 blocking, 1 non-blocking (see below)

---

## Test Results

```
bun test src/__tests__/083-tool-analysis.test.ts

  Task 083 — Analysis MCP Tools
    fetch_and_analyze
      (pass) registers the fetch_and_analyze tool on the server [16ms]
      (pass) returns analysis entries with level, sentiment, impact score [6547ms]
      (pass) returns error text (not a thrown exception) when all fetchers fail [16ms]
      (pass) respects the limit parameter [984ms]
    run_impact_chain
      (pass) registers the run_impact_chain tool on the server
      (pass) returns causal chain text for oil price news [453ms]
      (pass) returns causal chain with domain entries for oil_gas [250ms]
      (pass) includes watchlist stocks when includeWatchlist is true and watchlist has entries [188ms]
      (pass) returns error text (not a throw) on invalid input [171ms]
    search_similar_context
      (pass) registers the search_similar_context tool on the server
      (pass) returns 'No similar context found.' when vector store is empty [157ms]
      (pass) returns error text (not a throw) when embedding fails [156ms]
      (pass) accepts optional level and actionCode filters [187ms]
    registerAnalysisTools
      (pass) registers exactly 3 tools
      (pass) does not register duplicate tool names
    Integration roundtrip
      (pass) fetch_and_analyze stores entries accessible via get_analysis_history query [16ms]

Tests: 16 passed, 0 failed
```

**Coverage notes**: Tests cover tool registration, happy-path real network calls (gracefully degraded when RSS 404/403), error path (empty sources), watchlist integration, RAG search with empty store, optional filter parameters, and SQLite roundtrip. Edge case: tests do not mock network — live RSS calls happen in CI; CafeF returns 404 and Reuters returns 403/404 in test environment but the handlers degrade gracefully returning non-throwing error text. VnExpress feed returned 60 live items confirming `fetch_and_analyze` works end-to-end with real data.

---

## Issues Discovered During Review

### BLOCKING Issues

None.

---

### NON-BLOCKING Issues

#### Issue 083-01
- **Type**: Code smell / legacy artifact
- **File**: `src/server.ts` (root-level legacy server factory)
- **Description**: `src/server.ts` still imports `registerAnalysisTools` from `./tools/analysis.js` (the old stub file at `src/tools/analysis.ts`). This file is no longer the production entry point — `src/index.ts` uses `src/interface/mcp/server.ts` which correctly imports from the new location. The old `src/server.ts` is dead code.
- **Fix applied**: Deferred — `src/server.ts` is not used in production and does not affect any passing tests. Cleanup can be done in a dedicated housekeeping task.

---

## Bug Report

| # | Severity | Description | File | Status |
|---|----------|-------------|------|--------|
| — | — | No bugs found | — | — |

---

## Security Report

| # | Category | Description | Risk | Mitigation |
|---|----------|-------------|------|------------|
| 1 | SQL Injection | All SQLite queries use parameterized `?` placeholders | None | Compliant — all queries verified parameterized |
| 2 | Env vars | Production code uses `Bun.env`; `process.env` appears only in test files for in-memory DB override | None | Compliant |
| 3 | Input validation | All tool inputs validated via Zod schemas with `.describe()` on every field | None | Compliant |

**Security verdict**: CLEAN

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| `fetch_and_analyze` tool registered on McpServer | PASS | Confirmed via `_registeredTools` inspection |
| `run_impact_chain` tool registered on McpServer | PASS | Confirmed via `_registeredTools` inspection |
| `search_similar_context` tool registered on McpServer | PASS | Confirmed via `_registeredTools` inspection |
| `registerAnalysisTools` registers exactly 3 tools | PASS | Test asserts all 3 names present, no duplicates |
| `fetch_and_analyze` returns analysis entries from live RSS | PASS | VnExpress returned 60 items; entries normalized with level/sentiment/impact |
| `run_impact_chain` returns cascade chain for oil-related text | PASS | "Causal Chain" header present; oil_gas domain entries generated |
| `run_impact_chain` includes watchlist stocks when `includeWatchlist: true` | PASS | GAS inserted to DB, appears in chain output |
| `search_similar_context` returns text result (not throw) when empty store | PASS | Returns "No similar context found." |
| All tool handlers wrapped in try/catch — errors returned as text not thrown | PASS | All 3 handlers have outer try/catch returning `{ content: [{ type: 'text', text: '...' }] }` |
| Zero `any` types in new implementation files | PASS | `grep ": any"` returns nothing in `src/interface/` |
| `bun tsc --noEmit` = 0 errors | PASS | Clean TypeScript |
| Tool count in `src/interface/mcp/server.ts` = 14 | PASS | Confirmed in 081 test log: `"toolCount":14` |
| Barrel export in `src/interface/mcp/tools/index.ts` includes `registerAnalysisTools` | PASS | Line 13 of index.ts exports from `./analysis.js` |
| DDD compliance: interface layer imports from domain/application/infrastructure are permitted | PASS | All imports follow correct outward-only direction |
| Zod `.describe()` on every input field | PASS | All 8 input fields across 3 tools have `.describe()` |

---

## Merge Summary

```bash
git checkout main
git merge --no-ff task/083-tool-analysis -m "merge(083): analysis MCP tools (fetch_and_analyze, run_impact_chain, search_similar_context)"
```

- Commits in branch: 2
- Files changed: 3
- Lines added: +731 | Lines removed: -15
- Tests added: 16 new tests
- Type errors at merge: 0

---

## Notes for Next Tasks

- **Sprint 004 COMPLETE** — All 6 tasks merged: 087, 022, 023, 061, 062, 083.
- Task 084 (market tools: get_market_snapshot, additional context tools) can now be planned for Sprint 005 — it depends on 081 (done) and 013/065 (pending).
- The old `src/server.ts` and `src/tools/` directory are legacy stubs. A housekeeping task should delete them once confirmed no longer referenced anywhere.
- The `search_similar_context` tool in `src/tools/analysis.ts` (stub) uses `limit` parameter, while the new implementation uses `k` — callers should use the new interface.
