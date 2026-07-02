# Decision Journal — Sprint MERGE-MONEY-RADAR-INTO-MOMENTUM · architect

**Sprint goal:** (ambient — this entry belongs to router-prioritized task TOKEN-ECONOMY-TICK-PREFLIGHT, riding alongside the active sprint_goal entry)
**Agent:** architect
**Started:** 2026-07-02T00:00:00Z

---

### STEP architect-S1 · architect · 2026-07-02T12:10:00Z
**task-id:** TOKEN-ECONOMY-TICK-PREFLIGHT
**what-done:** Brownfield review of 3 WUs (cowork silent-path, dev-team SF-1-first, auditor Tier-1 shell healthcheck); live-verified the MCP-from-shell mechanism (stateless JSON-RPC-over-Streamable-HTTP, no initialize handshake, error via `.result.isError` not `.error`) against the running mcp-server container; wrote handoff with 11 risk notes + file-level change map.
**what-considered:**
- Node MCP client helper vs bash+curl+jq — chose bash for consistency with existing flow-doc idiom (leader-lock.md/blind-guard.md/match-slots.md all bash+jq) and zero new deps.
- Whether WU-3 needs the same MCP-call mechanism as WU-1/WU-2 — determined NO: probe.sh + system-map.json thresholds are pure-shell sufficient for the ALL-GREEN gate; MCP cross-ref stays subagent-only on failure, unchanged from today.
- Whether to silently drop the pre-existing unwired `cowork-tick-autosilent.sh` or flag it — flagged explicitly (R5) since it's incompatible with current telemetry.md Step 6.1 semantics and bypasses commit-mutex.
**why-decision:** Live-verifying the /mcp endpoint (rather than trusting the brief's one-line "JSON-RPC curl" claim) closed the single highest-risk unknown before pm decomposition — found the actual response is SSE-framed with a non-obvious `isError` shape that would have broken a naive implementation.
**why-change:** Brief's WU-2 section omits an explicit ERROR verdict (constraint #4 requires one) and the WU-1 step-list undercounts signal_queue draining vs its own flow-doc-update paragraph — both reconciled explicitly in the handoff (R4, R8) so pm doesn't silently drop scope.
