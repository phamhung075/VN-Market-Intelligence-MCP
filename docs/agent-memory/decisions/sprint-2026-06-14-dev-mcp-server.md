# Decision Journal — Sprint 2026-06-14 · dev-mcp-server

**Sprint goal:** FIX-MCP-CRASH-LOOP-WRITEWAL — D-1 WAL escalation gate
**Agent:** dev-mcp-server
**Started:** 2026-06-14T06:30:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-14T06:45:00Z
**task-id:** D-1
**what-done:** Added `escalateFn` as 4th optional positional param to `checkWalFileSize()` in checkpoint.ts; added escalation closure in startScheduler.ts using `appendSignalQueueRow` from orchStateStore; created 7-test suite covering all 4 AC gates.
**what-considered:**
- Use `deps` object pattern as shown in handoff spec (would break existing callers using positional args in 1329b tests)
- Add `escalateFn` as 4th positional param (non-breaking, existing calls unaffected)
- Use raw `Bun.write + Bun.sh mv` as in handoff example vs use existing `appendSignalQueueRow` with CAS retry
**why-decision:** Positional 4th param preserves 100% backwards compat; `appendSignalQueueRow` reuses proven atomic+CAS write avoiding the Bun.sh subprocess dependency and handles concurrent writer collision (WF-2).
**why-change:** escalateFn call placed after Telegram alert but before return — matches spec; `escalated=true` only returned when bytes > 10 MB path is hit (early-return paths have no escalated field, resolves as undefined per AC).
