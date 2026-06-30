---
parent_task: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
task_number: T-7
title: Migrate macroTools.ts:446 → macroFetch
sprint: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
size: S
zone: apps/mcp-server/
depends_on: [T-1, T-2]
blocks: [T-11]
critical_path: true
---

## TLDR

Replace the unbounded `fetch` call inside `macroTools.ts:446` (the `get_macro_snapshot` handler) with `macroFetch`. This is the **pattern-setter** for T-11 (the 7 sibling macro tools). The existing `try { const r = await fetch...; if(!r.ok){...}; const d = await r.json(); ... } catch {...}` block is replaced with `macroFetch`'s discriminated-result pattern. Recommended deadline: **15_000ms** (15s, internal Docker network, highest-traffic macro tool).

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Files to modify:** `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts:446`
- **Dependencies:** T-1 (withDeadline/macroFetch must exist), T-2 (barrel export must be ready)
- **Knowledge needed:** `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § FR-2, FR-5, mcp-interface-01 row, RISK-1 (macroFetch signature with baseUrl parameter), EC-6 (degrade contract)

## Acceptance Criteria

- [ ] File `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts` is opened and line ~446 located (the unbounded `fetch` call in `get_macro_snapshot`)
- [ ] The `try { const response = await fetch(...); if(!response.ok){...}; const data = await response.json(); ... } catch {...}` block is identified
- [ ] Replace with: `const result = await macroFetch<Record<string, unknown>>(baseUrl, '/snapshot', params ?? {}, { deadlineMs: 15_000 }); if (!result.ok) { return { content: [{ type: 'text', text: JSON.stringify({ error: 'macro-indicators service unavailable' }) }] }; } // use result.data`
- [ ] The `baseUrl` variable is already available in the handler (from `getMacroBaseUrl()` at registration time); if not, read `macroHttpClient.ts` to understand the pattern
- [ ] Import added: `import { macroFetch } from '../../../infrastructure/fetchers'` (relative path from interface/mcp/tools/macro/ to infrastructure/fetchers/)
- [ ] Deadline value is exactly **15_000** (< 60_000 per NFR-2)
- [ ] The degrade response shape is preserved: `{ content: [{ type: 'text', text: JSON.stringify({ error: 'macro-indicators service unavailable' }) }] }` — this is the honest degrade, not a fabricated success or empty data
- [ ] Existing `catch` block for non-macroFetch errors is removed (macroFetch absorbs the errors into the discriminated result)
- [ ] `bun check` passes with zero TypeScript errors

## Files to read first

- `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts:446` (the unbounded fetch in `get_macro_snapshot`)
- `apps/mcp-server/src/interface/mcp/tools/macro/macroHttpClient.ts` (to understand `getMacroBaseUrl()` and how it is called)
- `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § FR-2 (macroFetch contract), RISK-1 (baseUrl parameter), EC-6 (degrade return shape)

## Implementation Notes

1. **BaseUrl parameter (RISK-1 resolution):** `macroFetch` signature is `macroFetch<T>(baseUrl, path, body, opts)`. The first parameter is `baseUrl: string`. This is passed by the caller from `getMacroBaseUrl()` — this pattern prevents an upward import from infrastructure to interface layer. The caller should already have `const baseUrl = getMacroBaseUrl()` available; if not, call it in the handler.

2. **Discriminated result:** `macroFetch` returns `{ ok: true, data: T }` on success or `{ ok: false, degrade: DegradeEnvelope }` on failure. The `if (!result.ok)` guard checks the discriminator. No try/catch needed at the call site — error handling is via the discriminated result.

3. **Degrade shape preservation:** The existing handler returns `{ content: [{ type: 'text', text: JSON.stringify({ error: 'macro-indicators service unavailable' }) }] }` on error. This must be preserved when `result.ok === false`. Do NOT fabricate a success value or default data.

4. **Type parameter:** Use `macroFetch<Record<string, unknown>>` (or a more specific type if the handler knows the expected shape). Current code uses `as Record<string, any>` — `Record<string, unknown>` is more type-safe.

5. **Pattern precedent:** This task sets the pattern for T-11 (the 7 sibling tools). All T-11 files will replicate this exact structure: `const result = await macroFetch<T>(baseUrl, path, body, { deadlineMs: 15_000 }); if (!result.ok) { return degrade; } // use result.data`.

6. **Label note:** `macroFetch` uses the `path` parameter as the label in logs (e.g., `[macroFetch][/snapshot] degrade: deadline`). No separate label parameter needed.

## Testing Strategy (for QA / code review)

- **Happy path:** Macro-indicators:5004 is healthy → `get_macro_snapshot` returns live data, behavior unchanged.
- **Degrade path (forced-failure):** `docker stop macro-indicators` → call `get_macro_snapshot` via gateway → response is `{ "error": "macro-indicators service unavailable" }` within 15s, not a hang.
- **Static check:** `bun check` passes.
- **Pattern validation:** Code review confirms this is the pattern that T-11 will replicate for all 7 siblings.

## Blockers

Depends on T-1 (withDeadline/macroFetch) and T-2 (barrel export). No external blockers.

---

**Task ID:** W2-T-7
**Estimated Duration:** 2h
**Status:** TODO
**Owner:** dev-mcp-server
**Critical Path:** Yes (T-7 → T-11; pattern setter for all macro sibling tools)
