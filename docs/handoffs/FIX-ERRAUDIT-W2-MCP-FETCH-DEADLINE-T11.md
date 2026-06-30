---
parent_task: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
task_number: T-11
title: Migrate 7 macro sibling tools → macroFetch (carryTools, tradeBalance, bop, liquidityState, cpiComponents, macroIndicatorsVn, dinhGia)
sprint: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
size: M
zone: apps/mcp-server/
depends_on: [T-1, T-2, T-7]
blocks: [T-12]
critical_path: true
---

## TLDR

Replicate the `macroFetch` pattern (established in T-7) across 7 sibling macro tool files. Each file has 1–2 fetch sites that need migration from bare `fetch` + inline error handling to `macroFetch`. This is a one-sweep refactoring of 8 fetch calls (carryTools has TWO: line 57 + line 134) across 7 files. The pattern is: `const result = await macroFetch<T>(baseUrl, path, body, { deadlineMs: 15_000 }); if (!result.ok) { return degrade; } // use result.data`. Total scope: **~25 lines × 7 files** of duplicated error-handling code are consolidated.

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Files to modify:** 7 macro tool files in `apps/mcp-server/src/interface/mcp/tools/macro/`:
  1. `carryTools.ts` — **TWO fetch sites:** line 57 (`get_carry_trade_signal`/`/snapshot`) + line 134 (`get_macro_calendar`/`/macro-calendar`)
  2. `tradeBalanceTools.ts` — line 96
  3. `bopTools.ts` — line 119
  4. `liquidityStateTools.ts` — line 137
  5. `cpiComponentsTools.ts` — line 95
  6. `macroIndicatorsVnTools.ts` — line 80
  7. `dinhGiaTools.ts` — line 56

- **Dependencies:** T-1 (withDeadline/macroFetch must exist), T-2 (barrel export must be ready), T-7 (pattern precedent — replicate exact structure)
- **Knowledge needed:** `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § FR-5, ARCH-RATIFY-W2-3 (T-11 = 7 files / 8 calls), macroFetch pattern from T-7

## Acceptance Criteria

- [ ] All 7 files are modified with macroFetch pattern
- [ ] **carryTools.ts** — TWO sites migrated:
  - Line 57: `const result = await macroFetch<Record<string, unknown>>(baseUrl, '/snapshot', _params ?? {}, { deadlineMs: 15_000 }); if (!result.ok) { return { content: [{ type: 'text', text: JSON.stringify({ error: 'macro-indicators service unavailable' }) }] }; } // use result.data`
  - Line 134: Same pattern for `/macro-calendar` endpoint
- [ ] **tradeBalanceTools.ts** — line 96: Same macroFetch pattern (single site)
- [ ] **bopTools.ts** — line 119: Same macroFetch pattern
- [ ] **liquidityStateTools.ts** — line 137: Same macroFetch pattern
- [ ] **cpiComponentsTools.ts** — line 95: Same macroFetch pattern
- [ ] **macroIndicatorsVnTools.ts** — line 80: Same macroFetch pattern
- [ ] **dinhGiaTools.ts** — line 56: Same macroFetch pattern
- [ ] All 7 files have import statement: `import { macroFetch } from '../../../infrastructure/fetchers'` (relative path from interface/mcp/tools/macro to infrastructure)
- [ ] Deadline value is **15_000** for all calls (< 60_000 per NFR-2)
- [ ] Degrade response shapes are preserved: `{ content: [{ type: 'text', text: JSON.stringify({ error: 'macro-indicators service unavailable' }) }] }` — honest degrade, no fabricated data
- [ ] All old `try/catch` blocks for fetch error handling are removed (macroFetch absorbs the error into the discriminated result)
- [ ] `bun check` passes with zero TypeScript errors across all 7 files
- [ ] The `baseUrl` variable is obtained from `getMacroBaseUrl()` (verify each file has this available or call it)

## Files to read first

- `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts:446` (T-7 completed this; use as pattern reference)
- All 7 target files (carryTools, tradeBalance, bop, liquidityState, cpiComponents, macroIndicatorsVn, dinhGia) — locate the fetch + error-handling blocks
- `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § FR-5 (macroFetch scope), ARCH-RATIFY-W2-3 (carryTools has 2 fetch sites)

## Implementation Notes

1. **Pattern from T-7:** T-7 (macroTools.ts:446) established the exact pattern. All 7 sibling files replicate it. The structure is:
   ```ts
   const result = await macroFetch<ExpectedType>(baseUrl, '/endpoint', body, { deadlineMs: 15_000 });
   if (!result.ok) {
     return { content: [{ type: 'text', text: JSON.stringify({ error: 'macro-indicators service unavailable' }) }] };
   }
   // use result.data for the response
   ```

2. **CarryTools special case (2 sites):** `carryTools.ts` has TWO fetch calls:
   - Line 57: `get_carry_trade_signal` → fetch to `/snapshot`
   - Line 134: `get_macro_calendar` → fetch to `/macro-calendar`
   Both are migrated in this single task. The file is read once, both sites are updated together.

3. **BaseUrl availability:** Each file should have `const baseUrl = getMacroBaseUrl()` available at registration time (or call it in the handler). Verify each file's structure before writing. If `baseUrl` is NOT available, it must be added.

4. **Type parameter:** Each handler knows its expected response type. Use the specific type if available (e.g., `macroFetch<MacroIndicatorDTO>(baseUrl, '/macro-indicators-vn', ...)`), or use `macroFetch<Record<string, unknown>>(...)` as a safe default.

5. **Degrade shape consistency:** All 7 files return the same degrade shape on `result.ok === false`. This is the honest degrade contract; no fabricated success or default value.

6. **Import path:** From `interface/mcp/tools/macro/` to `infrastructure/fetchers/`, the relative path is `../../../infrastructure/fetchers`.

7. **Total scope:** 8 fetch calls (7 files, 1 with 2 calls) × ~3–4 lines each removed + 2 new lines added = net ~20–25 lines of code consolidated.

## Testing Strategy (for QA / code review)

- **Happy path:** Macro-indicators:5004 healthy → all 7 tools return live data, behavior unchanged.
- **Degrade path (forced-failure):** `docker stop macro-indicators` → call each of the 7 tools → each returns `{ "error": "macro-indicators service unavailable" }` within 15s, not a hang.
- **Specific sites:** Test `get_carry_trade_signal` (carryTools:57) and `get_macro_calendar` (carryTools:134) separately to verify both sites in one file are migrated.
- **Static check:** `bun check` passes across all 7 files.
- **Pattern check:** Code review confirms all 7 files use the exact pattern from T-7 (consistency gate).

## Blockers

Depends on T-1 (withDeadline/macroFetch), T-2 (barrel export), and T-7 (pattern precedent). T-12 (full bun check) depends on T-11 completion.

---

**Task ID:** W2-T-11
**Estimated Duration:** 3–4h
**Status:** TODO
**Owner:** dev-mcp-server
**Critical Path:** Yes (T-11 → T-12; 7 files × 1 pattern is the bulk of the migration work)
