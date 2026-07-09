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

### STEP dev-frontend-S2 · dev-frontend · 2026-07-09T07:35:00Z
**task-id:** FACTORY-FRONTEND-split-dashboard-analysis
**what-done:** Split 1836L `dashboard.analysis.tsx` — 5 formatters to `domain/formatters/*`, ~22 components to `components/analysis/*` (one cluster per file); route down to 457L, 20 commits.
**what-considered:**
- clustering tightly-coupled small comps into one file (KdTilePill+WatchlistTile, etc.) per approach note's "one cluster per file" language
- 3 comps initially over 120L (InfoSourcePanel/StockDetailPanel/AiDeepDivePanel) — split further rather than accept over-cap, since DoD hardcaps new files
- route residual 457L (over generic 120L convention) — added honest size-justification header instead of over-fragmenting past Remix route-module idiom
**why-decision:** DoD requires "each new file <=120L" (hard) but only "route under cap" (soft, and monorepo-wide unenforced per audit brief) for the route; header is the convention-compliant move, already smallest of 19 sibling routes.
**why-change:** one addition beyond brief — split 3 initially-over-cap files further (not named in brief, required by DoD's own <=120L hardcap)
