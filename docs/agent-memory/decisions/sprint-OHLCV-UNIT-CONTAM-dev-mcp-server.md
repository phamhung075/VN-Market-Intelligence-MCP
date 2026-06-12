# Decision Journal — Sprint OHLCV-UNIT-CONTAM · dev-mcp-server

**Sprint goal:** Fix OHLCV unit contamination across all 5 writers (A–E); foundational guard + normalizer first
**Agent:** dev-mcp-server
**Started:** 2026-06-12T11:05:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-12T11:10:00Z
**task-id:** CONTAM-1
**what-done:** Created ohlcvUnitGuard.ts domain service + 17 unit tests (all GREEN)
**what-considered:**
- Place guard in market-data subfolder (matches foreignFlowValidator.ts precedent for data-unit validators)
- Place guard directly in domain/services/ root
**why-decision:** market-data/ subfolder is the canonical location for market-data domain validators per foreignFlowValidator.ts precedent; clean DDD separation
**why-change:** no change from plan — AC exactly followed; normalizeOhlcvToVnd WHOLE-ROW rule correctly implemented (per PO amendment: never per-field)
