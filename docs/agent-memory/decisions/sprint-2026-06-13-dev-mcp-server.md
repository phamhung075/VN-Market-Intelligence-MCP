# Decision Journal — Sprint 2026-06-13 · dev-mcp-server

**Sprint goal:** FIX-PENDING-REFINE-LIMIT-CHECKKIND — unblock refine cron
**Agent:** dev-mcp-server
**Started:** 2026-06-13T01:00:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-13T01:30:00Z
**task-id:** FIX-PENDING-REFINE-LIMIT-CHECKKIND
**what-done:** Applied z.coerce.number() + exact SDK pin to fix check.kind crash in get_bctc_pending_refine
**what-considered:**
- Dep pin only (downgrade SDK to pre-1.29.0): would break other SDK 1.29.0 features in use
- Schema-level symptom-patch (remove .int()/.min()/.max()): forbidden by AC
- z.coerce.number() + SDK exact pin: aligns with established pattern; preserves all constraints; prevents future drift
**why-decision:** z.coerce.number() matches working-tool pattern (get_recent_fixes, search_similar_context); SDK exact pin removes floating ^ drift vector; root cause is Bun JIT module-state corruption cleared by rebuild+restart
**why-change:** investigation revealed crash is in zod/v3/types.js:1086 (not zod-to-json-schema as originally hypothesized); Docker restart resolves immediately — code fix provides resilience for next rebuild
