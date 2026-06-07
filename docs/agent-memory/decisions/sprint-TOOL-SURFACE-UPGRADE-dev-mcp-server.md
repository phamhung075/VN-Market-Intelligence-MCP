# Decision Journal — Sprint TOOL-SURFACE-UPGRADE · dev-mcp-server

**Sprint goal:** Make 162-tool vn-market surface auditable and honest — 6 units (U1+U2: telemetry+generator, U3: weak-claim triage, U4+U5+U6: sweep/deregister)
**Agent:** dev-mcp-server
**Started:** 2026-06-07T09:00:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-07T09:00:00Z
**task-id:** TSU-DEV-U1
**what-done:** Implemented per-call telemetry counter — new `perCallCounterStore.ts` infrastructure module, handler-proxy hook in `server.ts`, modified `trackSessionToolUsageJob.ts` to use counter snapshot instead of dead sessionToolCache.
**what-considered:**
- only path: spec prescribes Map singleton + handler proxy loop + job replacement; sessionToolCache dead in gateway model (per-call dial, no SSE session)
**why-decision:** Gateway dials SSE per-call and drops — sessionId never populated; perCallCounterStore captures invocations without any session lifecycle dependency.
**why-change:** no change from plan

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-06-07T12:00:00Z
**task-id:** TSU-DEV-U6
**what-done:** Updated 10 tool descriptions across 6 files — clarified overlap/distinction for all 5 TSH leftover pairs (no merges, description-only per architect verdict). Added sibling cross-references to all pairs. Registry regenerated (157 unchanged).
**what-considered:**
- only path: architect verdict = KEEP ALL SEPARATE, description-only update; source-file text scanning (same as U3 suite) for tests — simpler/more reliable than runtime server introspection
**why-decision:** Source-text scan avoids runtime server start-up (McpServer._registeredTools is not a Map); matches U3 test pattern; descriptions are static strings in files.
**why-change:** no change from plan

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-06-07T13:00:00Z
**task-id:** TSU-DEV-U2-PARITY
**what-done:** Final parity verification — re-ran gen-tool-registry.ts (157), confirmed /health=157, parity test 8/8 pass, project-stats.json toolCount=157, all 5 deregistered tools absent from registry. Status set REVIEW.
**what-considered:**
- only path: verification task — run generator + parity test + /health probe + confirm project-stats; all four counts must converge
**why-decision:** Four independent counts all = 157: generator static-scan, /health runtime, parity test source-extraction, project-stats.json; no delta, no reconciliation needed.
**why-change:** full bun test suite triggers Bun v1.3.13 WriteFailed crash (RSS 1.09GB, pre-existing); parity test isolated run 8/8 GREEN — task acceptance unaffected.
