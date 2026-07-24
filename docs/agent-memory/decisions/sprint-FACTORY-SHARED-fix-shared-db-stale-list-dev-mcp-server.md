# Decision Journal — Sprint FACTORY-SHARED-fix-shared-db-stale-list · dev-mcp-server

**Sprint goal:** Add missing schema-backtesting to DB_SCHEMA_MODULES + sync guard (P2, zone packages-shared)
**Agent:** dev-mcp-server
**Started:** 2026-07-24T16:29:19Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-24T16:29:19Z
**task-id:** FACTORY-SHARED-fix-shared-db-stale-list
**what-done:** Added `"schema-backtesting"` (alphabetical position) to `DB_SCHEMA_MODULES` in packages/shared-db/index.ts + sync comment pointing at the on-disk source of truth; committed ef62d2921.
**what-considered:**
- Add automated drift-check test in packages/shared-db (rejected — no test harness/framework exists there; task explicitly forbids fabricating one).
- Add automated test in apps/mcp-server's bun test suite that cross-checks the shared-db constant (rejected — out of dev-mcp-server's zone-restricted scope for this task's actual location, and DoD explicitly accepts comment-only when no local harness exists).
- Comment-only sync guard (chosen — matches DoD's explicit fallback clause).
**why-decision:** Task DoD text: "If no test harness exists there, the sync comment alone satisfies the DoD — do not fabricate a test framework." Verified packages/shared-db/ has no test script/framework (package.json has no test entry, no bun test config).
**why-change:** No change from plan — verified pre-condition (grep for `DB_SCHEMA_MODULES`/`shared-db` importers across apps/mcp-server returns zero hits), confirming zero-runtime-effect claim in the task brief before committing.
