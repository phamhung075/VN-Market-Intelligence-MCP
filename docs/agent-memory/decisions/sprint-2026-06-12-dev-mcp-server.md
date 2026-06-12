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

### STEP dev-mcp-server-S4 · dev-mcp-server · 2026-06-12T17:25:00Z
**task-id:** CONTAM-9
**what-done:** 3-class repair migration for SM-2/SM-3 + partial-zero rows. Fixed MIN(low) ON CONFLICT write-boundary leak. Added ohlcvUnitGuard Rule 3 mixed-unit cross-field check. Executed live repair: A=519, B=598, C=1175 rows. 0 remaining.
**what-considered:**
- only path: migration + ON CONFLICT fix; NULL not viable (NOT NULL schema); backfill from VNDIRECT not feasible (today's rows missing low in upstream too)
- low estimate: ROUND(MIN(open_after,close)*0.99) — conservative, guaranteed low <= min(o,c)
- open=0 estimate: set to close — best-effort; open≈close on VN stocks with ±7% daily limits
**why-decision:** MIN(0,n)=0 perpetuates contamination indefinitely — must fix write boundary; migration covers all historical rows; estimate beats serving literal 0 to frontend
**why-change:** user extended scope to ALL tickers and ALL partial-zero variants (open=0 class added)

### STEP dev-mcp-server-S5 · dev-mcp-server · 2026-06-12T19:55:00Z
**task-id:** CI-RED-8081e584-FIX
**what-done:** Restored UrgentNewsFindingDataSchema strict (headline/source/severity required); extracted UrgentNewsLooseSchema for post_agent_signal validator; added now:Date param to getVpsProxyHealth with parameterised 24h cutoff.
**what-considered:**
- Option A (rejected): weaken test assertions to match loose schema — PO spec forbids weakening
- Option B (chosen): dual-schema — strict for type-safety, loose for post_agent_signal (preserves SYS-FUNC-05)
**why-decision:** Strict schema is the 1293a/1295a contract; loose schema is the SYS-FUNC-05 requirement — they are separate concerns. Dual-schema is the correct DDD boundary.
**why-change:** no change from plan

### STEP dev-mcp-server-S6 · dev-mcp-server · 2026-06-13T00:50:00Z
**task-id:** FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE
**what-done:** Added BLOCK-5 to finalizeBctcRefineTool.ts — recompute extraction_confidence from weighted section coverage; raise-only guard prevents downgrade of good OCR confidence.
**what-considered:**
- only path: non-fatal try/catch block after BLOCK-4, reusing already-in-scope finalRows + imported checkSectionCompleteness; PUB-5 coverage-aware rejected per architect brief (fixes only serve path, leaves stale value for all other consumers)
**why-decision:** Raise-only guard (refinedConfidence > currentConfidence) is the hard invariant. finalizeBctcRefineTool already has finalRows and checkSectionCompleteness imported; zero new dependencies needed.
**why-change:** no change from plan
