---
parent_task: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
task_number: T-2
title: Barrel export in fetchers/index.ts
sprint: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
size: XS
zone: apps/mcp-server/
depends_on: [T-1]
blocks: [T-3, T-4, T-5, T-6, T-8, T-9, T-10]
---

## TLDR

Add barrel export line to `apps/mcp-server/src/infrastructure/fetchers/index.ts` to re-export `withDeadline`, `macroFetch`, and `DegradeEnvelope` from the new `fetchDeadline.ts` file. This is a trivial one-liner that unblocks all other fetch-site migrations to import the utility.

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Files to modify:** `apps/mcp-server/src/infrastructure/fetchers/index.ts`
- **Dependencies:** T-1 (fetchDeadline.ts must exist and compile first)
- **Knowledge needed:** `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § D-4

## Acceptance Criteria

- [ ] File `apps/mcp-server/src/infrastructure/fetchers/index.ts` is opened
- [ ] A single new export line is added: `export { withDeadline, macroFetch, type DegradeEnvelope } from './fetchDeadline.js'`
- [ ] The export follows existing section comment style in the barrel file (if present)
- [ ] `bun check` passes with zero TypeScript errors in `apps/mcp-server/`

## Files to read first

- `apps/mcp-server/src/infrastructure/fetchers/index.ts` (current barrel structure; add export at appropriate location)

## Implementation Notes

1. **Export location:** Add the export line at a logical position in the barrel file. If the file already has section comments, add it under an "Deadline utilities" or "Async utilities" section. If no sections exist, add it in alphabetical order or at the end.

2. **Import path:** Use the relative path `./fetchDeadline.js` (or `.ts` if the barrel uses `.ts` imports; follow existing convention in the file).

3. **Type export:** Include `type DegradeEnvelope` to re-export the type, not just the runtime value.

## Testing Strategy (for QA / code review)

- **Static check:** `bun check` passes.
- **Import check:** Verify that downstream files can now `import { withDeadline, macroFetch } from '../infrastructure/fetchers'` or similar relative path.

## Blockers

None — depends only on T-1 completion.

---

**Task ID:** W2-T-2
**Estimated Duration:** 15 min
**Status:** TODO
**Owner:** dev-mcp-server
**Critical Path:** No (parallel with T-3..T-10, serial blocker only for T-7 and T-11)
