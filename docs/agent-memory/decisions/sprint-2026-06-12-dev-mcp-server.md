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

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-06-12T16:35:00Z
**task-id:** EVIDENCE-ACCUM-SILENT-CRON
**what-done:** Fixed systemic node-cron silent tick drop (two confirmed misses) — added `recoverMissedExecutions: true` to evidenceAccumulator + reputationCompute; fixed double-wrap in runEvidenceAccumulatorWithDb; added same-day dedup guard.
**what-considered:**
- `recoverMissedExecutions: true` on only the two confirmed-miss jobs (surgical)
- Systemic: add to ALL daily jobs (too broad, side-effect risk on all 50+ daily crons)
**why-decision:** Surgical fix targets the proven-miss jobs; dedup guard makes recoverMissedExecutions safe; double-wrap fix is an independent correctness issue unmasked by investigation
**why-change:** no change from plan

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-06-12T11:45:00Z
**task-id:** QUE-TOOLTIP-DRY-3
**what-done:** Replaced 3-line `//` comment block on hexagramLibrary.ts with 7-line JSDoc block declaring it AUTO-GENERATED downstream of que-reference.js (PO-Q2 enforcement).
**what-considered:**
- only: JSDoc block replacement — task is comment-only; no data/type/import changes; handoff spec provides exact text
**why-decision:** PO-Q2 ruling forbids dual-source; annotation is the codified enforcement mechanism per arch brief Option B
**why-change:** no change from plan
