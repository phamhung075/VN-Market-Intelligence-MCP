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
