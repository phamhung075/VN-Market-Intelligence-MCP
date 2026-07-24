# Decision Journal — Sprint FACTORY-FRONTEND-split-orchestration · dev-frontend

**Sprint goal:** Split the 997L+ route `dashboard.orchestration.tsx` — DTOs to domain,
staleness predicate to a tested helper, render blocks to per-component files (each
<=120L, test-first). Behavior-preserving (code-only, rebuild-verify deferred).
**Agent:** dev-frontend
**Started:** 2026-07-24T10:20:00Z

---

### STEP dev-frontend-S1 · dev-frontend · 2026-07-24T10:21:00Z
**task-id:** FACTORY-FRONTEND-split-orchestration
**what-done:** Moved the DTO contract (`StepDto`, `DecisionsDto`, `TaskStatus`,
`TaskRow`, `TaskBoardCounts`, `TaskBoard`, `SignalRow`, `SignalQueue`, `SprintGoal`,
`Narrative`, `Head`, `OrchState`) verbatim (byte-identical shapes) to
`app/domain/orchestration/types.ts`; re-exported from the route for backward-compat.
**what-considered:**
- leave the Cron Recheck Table types (`CronStatus`, `CronStatusDto`, etc.) in the
  route too vs. move — checked at source: TASK-DASH-CRON-2 is OUT OF the ticket's
  scope AND a pre-existing test imports those exports directly from the route
  module; moving them would force repointing a test outside this ticket's ask
**why-decision:** ticket is explicit and load-bearing ("a drift here would misrender
real orch-state data") — verbatim move, zero shape change, re-export for safety.
**why-change:** no change from plan.

---

### STEP dev-frontend-S2 · dev-frontend · 2026-07-24T10:23:00Z
**task-id:** FACTORY-FRONTEND-split-orchestration
**what-done:** Moved `STALE_THRESHOLD_MS` + the inline `age > STALE_THRESHOLD_MS`
check to `app/domain/orchestration/staleness.ts` as `isStale(tsField, now =
Date.now())`. Loader still owns `fetchedAt` assignment — only the boolean
predicate moved. 9 unit tests added (undefined/null/empty → false, exactly-at
-threshold → false [strict `>`], 1ms past → true, 3h old → true).
**what-considered:**
- only path: this is the ticket's explicit ask ("extract STALE_THRESHOLD_MS + the
  staleness predicate into a tested helper")
**why-decision:** pure move, testable in isolation, loader behavior unchanged
(same boolean result feeds the same `isStale` JSON key).
**why-change:** no change from plan.

---

### STEP dev-frontend-S3 · dev-frontend · 2026-07-24T10:24:00Z
**task-id:** FACTORY-FRONTEND-split-orchestration
**what-done:** Discovered `vite.config.ts` test `include` only globs
`app/__tests__/**`, `app/domain/formatters/**`, `app/lib/view-models/**` — the new
`app/domain/orchestration/staleness.test.ts` was silently invisible to Vitest
(0 tests collected, no failure). Added `./app/domain/orchestration/**/*.test.{ts,tsx}`
to `include`, mirroring the existing `domain/formatters` entry.
**what-considered:**
- move the test into `app/__tests__/` instead of touching config — rejected: breaks
  the established domain-colocated-test convention (`domain/formatters/*.test.ts`)
  for a module that will keep growing under `domain/orchestration/`
**why-decision:** root-cause fix (config gap), not a workaround; same pattern as the
already-included `domain/formatters` glob.
**why-change:** ticket didn't anticipate this config gap; discovered at source
(NO-FABRICATION — verified by running the test and observing "no tests found").

---

### STEP dev-frontend-S4 · dev-frontend · 2026-07-24T10:26:00Z
**task-id:** FACTORY-FRONTEND-split-orchestration
**what-done:** Moved `taskStatusClasses` (shared by `TaskGroup` and `DoneTaskRow`,
both being split out) to `app/domain/formatters/task-status-classes.ts` — mirrors the
`signal-color.ts` precedent (Tailwind-class-returning pure formatters live in
`domain/formatters/`). 8 golden-value unit tests (all 7 enum values + default
fallback).
**what-considered:**
- colocate in one of the two consuming component files, import into the other —
  rejected: creates a components<->components import for a genuinely shared pure
  function; `domain/formatters/` is the established home for this exact pattern
**why-decision:** avoids a circular/awkward import, matches existing convention.
**why-change:** ticket named only the DTOs + staleness helper for domain
extraction; extended to this one shared pure fn for the same reason the
market-summaries split extended its scope (avoiding a route<->components
circular dependency) — verified necessity at source, not scope-creep guess.

---

### STEP dev-frontend-S5 · dev-frontend · 2026-07-24T10:28:00Z
**task-id:** FACTORY-FRONTEND-split-orchestration
**what-done:** Split render blocks into `app/components/orchestration/` — one
render smoke test written and confirmed RED (module-not-found) BEFORE each
component file was created, then confirmed GREEN immediately after, per-component:
`HeadPanel`(52L,7 tests), `TaskGroup`(57L,5), `StepCard`(61L,3),
`DecisionAccordion`(66L,4), `DoneTaskRow`(88L,5), `DoneTaskGroup`(104L,5),
`TaskBoard`(74L, exports `TaskBoardPanel`,4), `SignalQueue`(88L, exports
`SignalQueuePanel`,5), `SprintGoal`(49L, exports `SprintGoalPanel`,5),
`Narrative`(69L, exports `NarrativePanel`,3). `DoneTaskGroup` (originally ~158L
combined) needed a second split: shell (`DoneTaskGroup`) + row
(`DoneTaskRow`), sharing `DONE_GRID` via a non-JSX `doneTaskGrid.ts` module so
the two don't import each other.
**what-considered:**
- one `DoneTaskGroup.tsx` at ~158L — rejected, ticket AC is a hard `<=120L` per
  file (same constraint that forced the market-summaries `DetailView` split)
**why-decision:** matches the established precedent
(`FACTORY-FRONTEND-split-market-summaries` / `-dashboard-analysis`); test-first
per this ticket's explicit, load-bearing DoD ("ADD a render smoke test BEFORE
you split it out ... so the extraction is verified by a test that existed at
extraction time").
**why-change:** no change from plan; the DoneTaskGroup second-split was a
mechanical consequence of the 120L cap.

---

### STEP dev-frontend-S6 · dev-frontend · 2026-07-24T10:30:00Z
**task-id:** FACTORY-FRONTEND-split-orchestration
**what-done:** Rewrote `dashboard.orchestration.tsx` as a thin composition:
types (re-exported) + `loader` + `StaleBadge`/`Section` (used directly in the
page JSX + inside `CronRecheckTable`, both staying in the route) + the 5 panel
imports. `POLL_MS=5000` and the `useEffect` polling/visibility-pause logic are
byte-identical (grep-confirmed, diffed against pre-change source). Loader body
unchanged except `isStale(tsField)` call replaces the inline `age >
STALE_THRESHOLD_MS` — same `isStale` JSON key, same value. TASK-DASH-CRON-2
Cron section (types + `CronStatusBadge`/`CronLayerTable`/`CronRecheckTable`)
left untouched — out of ticket scope, and
`TASK-DASH-CRON-2-cron-recheck-table.test.ts` imports those exports directly
from the route module.
**what-considered:**
- destructuring `isStale` from `useLoaderData()` in the page component would
  shadow the imported `isStale` predicate function — renamed the destructured
  boolean to `stale` locally (JSON key on the wire is still `isStale`,
  zero behavior change) to avoid the shadow
**why-decision:** `tsc --noEmit` clean (0 errors); full Vitest suite 95 files /
2112 tests (2110 pass, 2 pre-existing unrelated `QUE_DESCRIPTIONS` failures) —
confirmed IDENTICAL to baseline via `git stash push -u -- apps/frontend`
re-run with the change stashed out (baseline: 81/83 files, 2047/2049 tests,
same 2 failures) then `git stash pop` to restore.
**why-change:** no change from plan.

---

### STEP dev-frontend-S7 · dev-frontend · 2026-07-24T10:31:00Z
**task-id:** FACTORY-FRONTEND-split-orchestration
**what-done:** Updated `docs/architecture/microservice/frontend/domain-model.md`
with a `dashboard.orchestration.tsx` split section mirroring the existing
`dashboard.analysis.tsx` / `dashboard.market-summaries.tsx` split-section format.
Did NOT run a live rebuild or Playwright G12 render-gate — ticket scope bound is
explicit: "SCOPE BOUND — CODE-ONLY, NO REBUILD ... rebuilds are USER-GATED ...
Leave live render-verify PENDING (user-gated), batches onto a future rebuild."
Same deferral wording/precedent as `FACTORY-FRONTEND-split-market-summaries`.
**what-considered:**
- request a rebuild anyway to get render-gate evidence — rejected: explicit
  task-level scope bound from the dispatching agent, not a user consent/gate I
  can override; router "I just did one" — a second one this task would violate
  the no-rebuild constraint
**why-decision:** honoring the explicit scope bound; render-verify PENDING is
the honest outcome, not a fabricated PASS.
**why-change:** no change from plan.
