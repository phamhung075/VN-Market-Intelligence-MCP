# Decision Journal — Sprint FIX-DIGEST-RSI-DUAL-ENGINE-DIVERGE · architect

**Sprint goal:** Single-source RSI in the evening digest — one engine, one window, one min-candle gate
**Agent:** architect
**Started:** 2026-06-21T00:00Z

---

### STEP architect-S1 · architect · 2026-06-21T00:00Z
**task-id:** FIX-DIGEST-RSI-DUAL-ENGINE-DIVERGE
**what-done:** Engine authority decision + fallback removal rationale + generic-mandate TA audit completed
**what-considered:**
- Option A: Keep TS `computeRSILocal` in `defaultComputeTa`, align its window+gate to match Go path → REJECTED: two independent impls diverge on float precision long-term + synthetic fallback correctness risk remains latent; two impls = two maintenance surfaces.
- Option B: Route both paths through Go `computeTAIndicators` (already the alert path) → CHOSEN: single implementation, synthetic fallback eliminated, min-candle gate unified to 35, Go client already imported in sibling file.
- Option C: Route both paths through a new shared TS helper → REJECTED: introduces a third implementation; Go service is already the canonical engine per the project's microservice boundary.
**why-decision:** Go service is the designated TA microservice; TS local copies were explicitly flagged as "intentional duplication, temporary" in P2-B1 comment. Unifying eliminates the duplicated implementation and the fallback risk.
**why-change:** No prior architect decision on this task — first cycle.

### STEP architect-S2 · architect · 2026-06-21T00:00Z
**task-id:** FIX-DIGEST-RSI-DUAL-ENGINE-DIVERGE
**what-done:** Generic mandate TA audit — MACD, BB, MA20 confirmed NOT dual-engine in digest
**what-considered:** only path: read `TaSignal` interface (rsi14+ma20 only), `bbAlertScanJob` (Go only, no digest TS parallel), `taAlertScanJob` (RSI only), `assembleBriefing.ts` `defaultComputeTa` (rsi14+ma20 only). MACD/BB absent from digest TA-block. MA20 single-source (TS only, no alert parallel). RSI is the only active dual-engine split.
**why-decision:** Scope is RSI-only; no other indicator requires parallel remediation in this sprint.
**why-change:** no change from plan.

### STEP architect-S3 · architect · 2026-06-21T00:00Z
**task-id:** FIX-DIGEST-RSI-DUAL-ENGINE-DIVERGE
**what-done:** Subtask split: TASK-RSIFIX-1 (dev-technical-analysis, contract doc) → TASK-RSIFIX-2 (dev-mcp-server, wiring fix)
**what-considered:**
- Single task combining contract doc + code change → REJECTED: zone boundary violation (docs vs mcp-server); contract doc needs to precede wiring to prevent dev-mcp-server re-reading Go source mid-implementation.
- Two tasks, parallel → REJECTED: TASK-RSIFIX-2 must read the contract doc to implement correctly; serial dependency is required.
- Two tasks, serial (chosen): TASK-RSIFIX-1 docs-only (fast, no rebuild) → TASK-RSIFIX-2 code fix (rebuild required).
**why-decision:** Contract doc is the load-bearing spec for the wiring task; serial enforces correctness.
**why-change:** no change from plan.
