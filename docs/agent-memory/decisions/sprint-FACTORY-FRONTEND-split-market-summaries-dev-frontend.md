# Decision Journal — Sprint FACTORY-FRONTEND-split-market-summaries · dev-frontend

**Sprint goal:** Split the 955L route `dashboard.market-summaries.tsx` — move pure helpers to
domain, split list/detail JSX into components. Behavior-preserving (code-only, rebuild deferred).
**Agent:** dev-frontend
**Started:** 2026-07-24T09:55:00Z

---

### STEP dev-frontend-S1 · dev-frontend · 2026-07-24T09:56:00Z
**task-id:** FACTORY-FRONTEND-split-market-summaries
**what-done:** Created `app/domain/market-summaries/format.ts` with 9 pure helpers (verbatim
logic): `PERIOD_LABELS`, `formatDateRange`, `formatChangePct`, `changePctColorClass`,
`directionArrow`, `directionArrowColorClass`, `outlookLabel`, `outlookColorClass`, `filterTickers`.
**what-considered:**
- ticket named only 5 ("outlookLabel, outlookColorClass, formatDateRange, filterTickers,
  PERIOD_LABELS"); extending to all 9 vs. leaving the other 4 (formatChangePct/
  changePctColorClass/directionArrow/directionArrowColorClass) inline in the route file
- leaving the 4 in the route would force the split-out table components
  (StockPerformanceTable/RecommendationsTable) to import them BACK from the route module —
  a real (non-type) runtime import creating a route<->components circular dependency
- the ticket's own caution paragraph is worded about "these route helpers" (plural,
  formatChangePct/directionArrow family) returning bare strings vs. canonical objects —
  only makes sense as guidance if those 4 were in scope for the move
**why-decision:** moved all 9 to keep the domain layer canonical-source for this route and
avoid the circular import; matches DDD golden rule (domain has zero imports from components/lib-api).
**why-change:** extended scope from the literal "5 named helpers" list — verified at source
this was required for a clean split, not a scope-creep guess.

---

### STEP dev-frontend-S2 · dev-frontend · 2026-07-24T09:58:00Z
**task-id:** FACTORY-FRONTEND-split-market-summaries
**what-done:** Verified `app/domain/formatters/change-pct.ts` / `direction-arrow.ts` return
OBJECTS (`{formatted, symbol, cls}` / `{symbol, cls}`) with color family `text-green-400` and
ALWAYS emit a symbol; the route's own helpers return BARE STRINGS with color family
`text-emerald-400` and the symbol is a separate opt-in call. Did NOT wire the canonical
formatters anywhere — `format.ts` keeps its own independent, verbatim exports (same names,
different module path, zero import collision).
**what-considered:**
- reuse canonical formatters + adapt call-sites — rejected: would change rendered color
  (green vs emerald) and force a symbol to always render, altering DOM output
- add distinctly-named string-returning wrappers around the canonical objects — rejected as
  unnecessary indirection; verbatim copy is simpler and provably behavior-identical
**why-decision:** byte-identical rendered output is the hard constraint (rebuild-verify is
deferred, so unit-level proof must be airtight) — verbatim copy is the only option with zero
output-changing risk.
**why-change:** no change from plan; this IS the caution the ticket flagged.

---

### STEP dev-frontend-S3 · dev-frontend · 2026-07-24T10:00:00Z
**task-id:** FACTORY-FRONTEND-split-market-summaries
**what-done:** Verified `fetchSummaries` at source: it is defined INLINE in
`dashboard.market-summaries.tsx` (loader-adjacent I/O function), NOT in `lib/api/client.ts` as
the ticket assumed. Left it exactly where it was — did not move it into `format.ts` (not a pure
helper) and did not relocate it into `client.ts` (ticket said "don't move it"; the underlying
intent is honored by leaving it in place regardless of the ticket's location assumption).
**what-considered:**
- only path: relocating a stateful I/O function into `client.ts` to match the ticket's
  (incorrect) premise was out of scope and riskier than doing nothing
**why-decision:** NO-FABRICATION — verify actual code at source over trusting ticket prose;
"don't move it" is satisfied either way since it never moved.
**why-change:** ticket's `lib/api/client.ts` premise did not match live code; documented the
discrepancy instead of silently correcting the ticket text.

---

### STEP dev-frontend-S4 · dev-frontend · 2026-07-24T10:05:00Z
**task-id:** FACTORY-FRONTEND-split-market-summaries
**what-done:** Split list/detail JSX into 12 files under `app/components/market-summaries/`:
`PeriodBadge`(14L), `CountChip`(22L), `PeriodPicker`(47L), `SummaryCard`(63L),
`TickerFilteredTable`(64L), `KeyEventsSection`(60L), `SectionHeader`(9L), `ListView`(74L),
`StockPerformanceTable`(75L), `RecommendationsTable`(48L), `DetailView`(74L),
`DetailContent`(69L) — all <=120L. `DetailView` (originally ~213L inline) needed a second split
(shell `DetailView` + `DetailContent` for the chips/narrative/tables block) to land under the
120L cap after the first pass came in at 131L.
**what-considered:**
- one `DetailView.tsx` at 131L, 11L over cap — rejected, task AC is a hard `<=120L` per file
**why-decision:** matches the established precedent from `FACTORY-FRONTEND-split-dashboard-analysis`
(same route/components split pattern, documented in `domain-model.md`).
**why-change:** no change from plan; the extra split was a mechanical consequence of the cap.

---

### STEP dev-frontend-S5 · dev-frontend · 2026-07-24T10:08:00Z
**task-id:** FACTORY-FRONTEND-split-market-summaries
**what-done:** Re-pointed `task17-market-summaries-loader.test.ts` imports — the 9 pure
helpers now import from `~/domain/market-summaries/format`; `fetchSummaries` (+ types)
still import from `~/routes/dashboard.market-summaries` (unchanged location). Route file
re-exports the 9 helpers for any other backward-compat call-sites. Verified equivalence with a
scratch (uncommitted) Vitest file: reference-identity assertions (route re-export === domain
export, same function object) + golden-value assertions (exact pre-refactor strings/classes)
+ assertions that the canonical `change-pct.ts`/`direction-arrow.ts` return objects with the
`text-green-400` family — all 19 passed, then deleted the scratch file (not part of the
deliverable).
**what-considered:**
- only path: byte-diff proof was the AC; reference-identity is a stronger proof than
  golden-value alone (guarantees zero logic drift, not just matching sample outputs)
**why-decision:** `tsc --noEmit` clean (0 errors) + full Vitest suite 2047/2049 pass, IDENTICAL
to baseline (confirmed via `git stash` re-run with my changes removed: same 2 pre-existing
`QUE_DESCRIPTIONS` failures, unrelated Kinh Dịch reference-page map, present before this task).
**why-change:** no change from plan.

---

### STEP dev-frontend-S6 · dev-frontend · 2026-07-24T10:10:00Z
**task-id:** FACTORY-FRONTEND-split-market-summaries
**what-done:** Updated `docs/architecture/microservice/frontend/domain-model.md` with a
`dashboard.market-summaries.tsx` split section (mirrors the existing `dashboard.analysis.tsx`
split section format exactly). Simplicity gate: all 4 questions NO — no new feature/flag beyond
AC (Q1), the one genuinely single-call-site abstraction (`DetailContent`) exists solely to
satisfy the task's own <=120L AC, not speculation (Q2), no overcomplication vs. senior-review
gut-check (Q3), overhead is near-zero — nearly every line directly satisfies the move/split AC
(Q4). Did NOT run `/graphify` (main-terminal skill, out of scope for this bounded code-only
task; one doc-section edit mirroring an existing precedent section).
**what-considered:**
- full `/graphify docs --update --no-viz` pipeline run — deferred, disproportionate to a
  single-section doc edit reusing an established documented pattern
**why-decision:** live rebuild + Playwright G12 render-gate explicitly deferred per task scope
(`rebuild_required: true` but USER-GATED, no rebuild performed this task) — noted here so QA/PO
know the render-gate evidence is pending, not skipped.
**why-change:** no change from plan.
