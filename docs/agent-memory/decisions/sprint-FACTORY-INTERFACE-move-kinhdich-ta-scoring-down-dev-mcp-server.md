# Decision Journal — Sprint FACTORY-INTERFACE-move-kinhdich-ta-scoring-down · dev-mcp-server

**Sprint goal:** DDD layering — move Kinh Dich + TA scoring math out of interface/tools into domain/application, pure move, no behavior change.
**Agent:** dev-mcp-server
**Started:** 2026-07-24T02:19:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-24T02:30:00Z
**task-id:** FACTORY-INTERFACE-move-kinhdich-ta-scoring-down
**what-done:** Moved 9 Kinh Dich score-computation functions (computeSentimentScore, computeFundamentalsScore, computePriceScore, computeForeignFlowScore, computeSectorScore, computeMacroScore, tickerJitter, computeHaoScores, computeMacroIndicatorScore) from `interface/mcp/tools/kinhdich/kinhDichTools.ts` to new file `application/services/kinhDich/kinhDichScoring.ts`; interface file now imports+calls them. Updated the 1 scheduler dynamic-import consumer + 6 test files' import paths.
**what-considered:**
- domain/services/kinhDich/ (sibling to existing pure hexagram-algorithm files) — rejected: that folder's own header states "Pure domain — NO I/O imports"; these functions call getDb()/IKinhDichScoreRepository directly (real SQLite I/O), so placing them there would break the codebase's own established domain-purity convention.
- application/services/kinhDich/ (chosen) — matches the established pattern of application/services/imfConvictionBridge.ts + application/usecases/getForeignRoom.ts (usecase/service layer orchestrates infra I/O + computation; domain stays pure). Zero formula/threshold/signature change beyond relocation.
**why-decision:** Functions mix DB reads with computation (not pure) — application layer is this codebase's documented home for exactly that mix; domain would be a layering violation, not a fix.
**why-change:** TASK text said "domain (or application)" — application is the correct pick per source-verified existing convention, not domain.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-24T02:31:00Z
**task-id:** FACTORY-INTERFACE-move-kinhdich-ta-scoring-down
**what-done:** Investigated the "TA scoring in the tools layer" half of the task (`interface/mcp/tools/market-data/technicalIndicatorTools.ts` local pure-math helpers: localEma/localComputeRSI/localComputeMACD/localComputeBB/maSignal/rsiLabel/etc). Decision: did NOT move — left in interface layer.
**what-considered:**
- Move TA math to domain, mirroring the Kinh Dich move — rejected.
- Leave as-is — chosen, after reading `docs/handoffs/TASK_P2-B2.md` + `docs/architecture-briefs/2026-05-22-refactor/p2-b-caller-inventory.md`.
**why-decision:** This is EXPLICITLY, ALREADY-DECIDED architecture (G5/P2-B1/P2-B2, already shipped): the real domain TA service (`domain/services/technicalIndicators.ts`) was deliberately quarantined to `src/_deprecated/` — TA business logic's permanent home is the Go microservice (port 5003); mcp-server keeps only a documented, intentional, self-contained interface-layer DB-fallback duplicate ("Kept until G5 is complete... Go service provides equivalent math"). Moving this into mcp-server's domain layer would resurrect code the architecture explicitly retired and contradict a shipped decision — same category as Kinh Dich's own AC-8 "not migrated to microservice" note, just for TA instead of Kinh Dich.
**why-change:** Task description speculated TA math "may" need the same treatment ("any TA scoring...") — source investigation shows it does not; honest PARTIAL/documented-exception outcome, not silent scope-cut.
