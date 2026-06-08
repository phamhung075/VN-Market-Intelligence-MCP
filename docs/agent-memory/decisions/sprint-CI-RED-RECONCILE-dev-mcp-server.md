# Decision Journal — Sprint CI-RED-RECONCILE · dev-mcp-server

**Sprint goal:** Unblock CI red state on main — two targeted test fixes in apps/mcp-server/
**Agent:** dev-mcp-server
**Started:** 2026-06-08T17:30:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-08T17:35:00Z
**task-id:** FIX-MCP-TOOL-COUNT-DRIFT
**what-done:** Diagnosed count drift as case (b) — intentional deregistration of `read_bctc_pdf` in TSU-DEV-U3; assertion floor 16→15
**what-considered:**
- (a) restore read_bctc_pdf registration — rejected: TSU-DEV-U3 explicitly deregistered it (superseded by OCR/PEK pipeline); restoring = reverting intentional design
- (b) lower assertion floor from 16 to 15 and update comment — chosen: correct since deregistration was intentional and named in commit message
**why-decision:** git show 50772c2a confirms read_bctc_pdf deregistered with documented rationale; floor 16 is stale by exactly 1
**why-change:** no change from plan

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-06-08T17:50:00Z
**task-id:** FIX-MCP-CI-NETWORK-GUARD
**what-done:** Diagnosed 1146 as date-stale tests (2026-03-* outside 90-day window); 1335 as rag_analyses schema mismatch (data_env column absent from test fixture)
**what-considered:**
- For 1146: change hardcoded dates to relative computed dates — chosen; future-proof, no manual drift
- For 1335: add data_env + body_text columns to setupTestDb() fixture — chosen; minimal delta, matches schema-news.ts migration
- CI network guard (skip-in-CI) for 025/028/1487 — not needed; these pass locally with mocks and failure pattern is different from what PO diagnosed
**why-decision:** Root-cause analysis shows 1146 is time-drift not network; 1335 is fixture/schema mismatch not network; both fail identically in CI and locally confirming non-network root cause
**why-change:** scope narrowed from network-guard to test-fixture/date fixes; result is same (CI green)
