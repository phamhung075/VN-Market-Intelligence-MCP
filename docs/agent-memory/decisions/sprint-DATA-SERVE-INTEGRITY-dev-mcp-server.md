# Decision Journal — Sprint DATA-SERVE-INTEGRITY · dev-mcp-server

**Sprint goal:** Data-serving integrity fixes across mcp-server-served tools (provenance/tier honesty, staleness reporting).
**Agent:** dev-mcp-server
**Started:** 2026-07-31T01:00:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-31T01:16:00Z
**task-id:** FU-MACRO-SNAPSHOT-TIER-WORSTOF
**what-done:** `get_macro_snapshot` handler's `sourceTier` changed from `signals.carry.source_tier ?? 2` to `max()` over `source_tier` of every PRESENT `signals.*` component.
**what-considered:**
- Explicit `max(carry.tier, yield.tier)` two-field pair — rejected: hardcodes today's 2 components, needs a future edit for every new signal (oil/gold/usdvnd/investment-clock currently have no tier field but may gain one).
- Generic `Object.values(data.signals).filter(hasTier)` reduce — chosen: matches the bug report's own "carry, yield, and any future components" framing; zero future-edit surface.
**why-decision:** Generic form is strictly more correct (covers future components) at no extra complexity cost over the hardcoded pair.
**why-change:** no change from dispatch note's fix shape; only the reduce-vs-pair implementation detail was my own call.
