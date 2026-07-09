# Decision Journal — Sprint SYSTEMIC-REMAKE-P1 · dev-frontend

**Sprint goal:** Phase-1 containment: idle-loop gates + detector closure + drift narrative fix (see docs/architecture-briefs/2026-07-04-systemic-remake.md §1)
**Agent:** dev-frontend
**Started:** 2026-07-09T03:53:06Z

---

### STEP dev-frontend-S1 · dev-frontend · 2026-07-09T03:53:06Z
**task-id:** FACTORY-FRONTEND-extract-computeDecision
**what-done:** Moved `computeDecision`/`DecisionResult` from `dashboard.analysis.tsx` route into new `app/domain/analysis/decision.ts`; hoisted 13 inline magic numbers to named consts; re-pointed `1937-decision-logic.test.ts` import.
**what-considered:**
- only path: pure move + threshold naming per task brief — no alternative approach considered (mechanical layering fix, brief was explicit about scope)
**why-decision:** matches DDD layer rule (domain has zero upstream deps here); brief explicitly forbids behavior change, so kept if/else structure verbatim, only renamed literals.
**why-change:** no change from plan
