# Decision Journal — Sprint FE-PAGE-REORG · architect

**Sprint goal:** FE-PAGE-REORG (active sprint; this task is an ERROR-AUDIT-2026-06-15 Wave-2 cross-sprint item)
**Agent:** architect
**Started:** 2026-06-16T00:00:00Z

---

### STEP architect-S1 · architect · 2026-06-16T00:00:00Z
**task-id:** FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
**what-done:** Ratified 4 open items, confirmed layer placement, issued blueprint with DDD risk notes for `withDeadline` + `macroFetch` shared helper.
**what-considered:**
- ARCH-RATIFY-W2-1: Error subclass vs tagged object. Tagged object rejected — no precedent in codebase; `instanceof` discrimination unreliable on non-Error shapes. Subclass wins (4 existing `extends Error` patterns confirmed).
- ARCH-RATIFY-W2-2: `err.name === 'AbortError'` vs `instanceof DOMException`. Two live Bun callers already use `.name` check (`foreignFlowFetcher`, `clients.ts`). DOMException instanceof check is less stable across Bun versions. `.name` wins.
- ARCH-RATIFY-W2-3: 7 files / 8 calls. `carryTools.ts` has TWO fetch calls (:57 `/snapshot`, :134 `/macro-calendar`). T-11 = 7 files, annotated as 8 migrations. No task split needed.
- ARCH-RATIFY-W2-4: `pushToMcpServer:79` folded into T-5. Localhost-to-localhost; 10s deadline (architect reduced from BA's implicit no-deadline). Splitting creates false dependency.
**why-decision:** RISK-1 (macroFetch upward import) is the only blocking deviation from BA spec — resolved by adding `baseUrl` as first parameter. All other ratifications follow existing codebase conventions confirmed by brownfield read.
**why-change:** macroFetch signature gains `baseUrl` param to avoid infrastructure→interface upward import. T-5 scope expands to cover `:79`. T-11 description must note 8 calls across 7 files.
