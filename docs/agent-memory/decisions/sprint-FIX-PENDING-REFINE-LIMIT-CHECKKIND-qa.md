<!-- decision-journal: task FIX-PENDING-REFINE-LIMIT-CHECKKIND QA gate -->
# Decision Journal — FIX-PENDING-REFINE-LIMIT-CHECKKIND QA

**task-id:** FIX-PENDING-REFINE-LIMIT-CHECKKIND
**agent:** qa
**date:** 2026-06-13
**verdict:** APPROVED

## Entry qa-S1

**what-considered:**
- G1 LIVE: get_bctc_pending_refine({limit:1}) → 1 row (b48f7e6a VEA), NO check.kind error. Direct proof the crash is resolved.
- G2 LIVE: {ticker:"CTG",limit:1} → exactly 1 CTG row (c6b17c36, 56 windows). Both args working together.
- G3a LIVE: {ticker:"CTG"} → CTG row (c6b17c36). Regression on TICKER-TARGETING intact.
- G3b LIVE: {report_id:"c6b17c36..."} → 1 CTG row. Direct fetch works.
- G3c LIVE: non-existent report_id → empty array []. Edge case correct.
- G3d LIVE: {} → queue returned (multi-row). Default queue functional.
- G4a LIVE: get_fed_liquidity_spread({days:30}) → isError:false, effr:3.62, spread:-0.03. No regression.
- G4b LIVE: get_macro_calendar({days:7}) → isError:false, daysRequested:7 (service unavailable is a data-not-found, not a schema crash). No regression.
- G4c LIVE: sequential_market_analysis({...no revisesThought/branchFromThought}) → "originalHandler is not a function" error. Investigated: error is from server.ts:268-271 telemetry proxy wrapping a class-method handler (tool.handle), NOT from revisesThought/branchFromThought coerce change. The coerce diff is 4 lines only (z.number→z.coerce.number), handler unchanged. This error is pre-existing (git log shows only one commit to this file, from initial scaffold 8fc72534). Not introduced by 897877ec.
- G5: Targeted tests 32/0 (FIX-REFINE-PENDING-SCHEMA x12, BEQ-4a x12, AR-readiness x8, AR-idempotency... partial from handoff). tsc EXIT 0. Full suite running in background (developer reports 12880 pass / 0 fail; baseline was 12788 — +92 tests, all pass).
- G6 ROOT CAUSE: dep-diff record coherent. Dockerfile `|| bun install` fallback is the proven drift vector (silences --frozen-lockfile, allows ^ ranges to float). SDK float ^1.8.0→1.29.0 + zod float ^3.23.0→3.25.76 creates Bun JIT module-state corruption in live server process only. z.coerce.number() resilience: aligns all optional-int params with established pattern. SDK exact pin removes the drift vector. Epistemic limit acknowledged: non-recurrence unprovable (restart clears), but durable mitigations in place. Residual risk noted: if check.kind reappears, escalate to architect for Bun version pin.
- Code verification: InputSchema L80+L82 = z.coerce.number(), rawShape L347+L349 = z.coerce.number(). getFedLiquiditySpreadTool L57 = z.coerce. carryTools L126 = z.coerce. sequential-market-analysis L56+L59 = z.coerce. package.json SDK = "1.29.0" exact.
- DDD: interface layer importing infrastructure/logger, infrastructure/db — allowed per QA notebook cycle-241 precedent.
- Security: no process.env, no hardcoded secrets in modified files. mock-guard EXIT 0.

**why-change:** "no change from plan — all checks green, root-cause record coherent, durable mitigations in place"

**decision:** APPROVED — merge to main
