# Decision Journal — Sprint 2026-06-12 · dev-mcp-server

**Sprint goal:** OHLCV-UNIT-CONTAM — repair unit contamination in daily_ohlcv
**Agent:** dev-mcp-server
**Started:** 2026-06-12T10:08:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-12T10:08:00Z
**task-id:** CONTAM-8
**what-done:** Updated CONTAM_WHERE boundary from `close > 1000` to `close >= 1000`, added TR-6 boundary test, executed live repair on VNH 2026-06-12 (open 0.9→900, low 0.9→900).
**what-considered:**
- only: single WHERE clause change; no other approach — QA-identified boundary miss, clear spec
**why-decision:** `close = 1000.0` exactly is implausibly high for a thousand-scale open of 0.9; strict `> 1000` was SM-1 scope miss confirmed by QA
**why-change:** no change from plan
