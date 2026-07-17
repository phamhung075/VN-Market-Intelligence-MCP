# Decision Journal — Sprint SPRINT-CCATO-TRUTHGATE-MCP-NATIVE · architect

**Sprint goal:** Port the CCATO claim-truth-gate engine (currently `scripts/narrative-truth-gate.sh`, Bash+python3) into a native `vn-market` MCP tool so the 5 no-Bash narrative cowork agents can run the mandatory pre-write gate without shell access.
**Agent:** architect
**Started:** 2026-07-17T04:47:11Z

---

### STEP architect-S1 · architect · 2026-07-17T04:47:11Z
**task-id:** SPRINT-CCATO-TRUTHGATE-MCP-NATIVE
**what-done:** Authored `docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md` — full-engine server-side port design (domain/infrastructure/application/interface layers), 8-task decomposition for pm.
**what-considered:**
- Self-loopback HTTP JSON-RPC (mirror what the bash script does) vs direct in-process reuse of each dimension's already-exported domain/infra function — chose direct reuse: every one of the 5 dimensions (`get_technical_indicators`/`get_foreign_flow`/`get_macro_snapshot`/`compare_financials`/`get_market_snapshot`) already delegates its core fetch to an exported domain/infra function (verified by reading all 5 tool files), so self-loopback would only add latency + reentrancy risk for zero benefit.
- SDK-private `_registeredTools` map self-dispatch (test-only precedent in `082-tool-watchlist.test.ts`) vs a purpose-built application-layer use case — rejected the private-field path as an unstable API never used in production src/.
- Re-probe-only tool (leave signal-emit to the caller) vs full-engine port incl. server-side signal-emit — full port is structurally REQUIRED, not a style choice: `cowork-boundary/SKILL.md` forbids cowork agents from writing `orch-state.json` at all, so the exact agents this sprint exists to unblock could never emit the `narrative_contradiction` signal themselves.
**why-decision:** Direct reuse keeps the change additive (zero existing-file edits except a 1-function extraction in `reports.ts` + `registry.ts`'s 1-import/1-entry pattern) and avoids two classes of fragility (network self-loop, private SDK internals) for a P0 row. Full-engine-port is the only design that actually closes the escalation for cowork callers.
**why-change:** No change from PO's DECISION-4 framing ("port its CCATO engine to a native vn-market MCP tool") — this brief operationalizes that framing into DDD layers, confirms it's feasible (Docker volume mounts checked, Zod schema checked — no migration needed), and adds the one design detail PO's note didn't resolve: signal-emit must live server-side because cowork agents can't write orch-state.json themselves.

### STEP architect-S2 · architect · 2026-07-17T04:47:11Z
**task-id:** SPRINT-CCATO-TRUTHGATE-MCP-NATIVE
**what-done:** Verified no Zod/schema migration needed (`SignalRowSchema.type` is `z.string().optional()`, free-form) and confirmed `docker-compose.yml` mounts both `docs/data/claim-tool-map.json` and `docs/data/orch/orch-state.json` read-write into the `mcp-server` container — closing the two biggest "is this even reachable server-side" open questions before handing to pm.
**what-considered:**
- Trusting the original 2026-06-30 brief's open item ("must add narrative_contradiction to the Zod enum if not present") vs re-verifying live — re-verified: `orchStateSchema.ts:186` has no enum, confirmed unnecessary.
**why-decision:** A design that silently assumed a migration was needed (or silently assumed the container couldn't reach the file) would have produced a wrong task list for pm; both were RAW-checked against the live schema file and docker-compose.yml rather than inherited from the prior brief's uncertainty.
**why-change:** No change from plan — this closes an ambiguity the original brief left open, does not alter this sprint's scope.
