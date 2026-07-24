# dev-frontend notebook

**Last updated:** 2026-07-24 | **Sprint:** QUALITY-AUDIT-FRONTEND-COVERAGE

---

## Session: 2026-07-24 (FE-PG-BCTC-EVAL-_INDEX-FUNC-FIX — quality-audit dispatch)

**DONE — /dashboard/bctc-eval 500→200; live root cause diverged from PO narrative**

Zone health: 96 test files (+1); 2125 pass / 2 fail (same pre-existing QUE-TOOLTIP, confirmed unmodified in git status); tsc 0 errors | HEALTHY

PO narrative: loader throws on a 404 from `/api/bctc-eval`. Live-verified (curl :3001/:3000, `docker exec` into the running container's `build/server/index.js`, `docker logs`) that narrative was WRONG on the throw site — the loader already caught upstream errors correctly (unchanged, kept as-is). The REAL crash: render-time `TypeError` in `StatusBadge` — `STATUS_CONFIG[status]` destructured `undefined`, because live mcp-server payloads only include `stage_statuses` keys for stages actually computed (MBB Q1-2026 live row has only keys 4-6, not 1-3) while the domain type declared all 6 required. `EvalTable` iterated all 6 STAGE_KEYS unconditionally with a lying `as EvalStatus` cast.

Files updated:
- `domain/bctc-eval.ts` — StageStatuses: all 6 keys made optional (matches live wire contract)
- `components/bctc-eval/StatusBadge.tsx` — defensive: `status: EvalStatus | undefined`, renders neutral "—" instead of crashing
- `components/bctc-eval/EvalTable.tsx` — removed the lying `as EvalStatus` cast
- `routes/dashboard.bctc-eval._index.tsx` — extracted `loadBctcEvalListData()` as plain testable export (Remix strips `loader` under jsdom — dashboard.alerts.tsx precedent)
- `routes/api.bctc-eval.$.tsx` — SEPARATE real bug found+fixed: bare `GET /api/bctc-eval` through this splat proxy appended a trailing slash (empty `params["*"]`), which mcp-server 404s. Extracted `buildBctcEvalUpstreamUrl()`. NOTE: `api.bctc-inspect.$.tsx` has the identical latent pattern, unexercised today, NOT fixed (out of ticket scope) — flag for a future ticket.
- `__tests__/bctc-eval-list.test.tsx` +2 suites, new `__tests__/bctc-eval-proxy-trailing-slash.test.ts`
- `docs/architecture/microservice/frontend/domain-model.md` — StageStatuses live-contract entry added

Rebuild: `docker compose build frontend` + `up -d --no-deps frontend` (image ID verified match). Live before/after: `/dashboard/bctc-eval` 500→200; `/api/bctc-eval` proxy 404→200 (real MBB/HVN/HPG data); recompute POST sub-path regression-checked 200.

Commit: `aaf487834` | tsc: 0 errors | vitest: 2125/2127 (same 2 pre-existing fail)

Lesson: PO's narrated root cause pointed at the wrong file/layer — reproducing live against the actual served bundle (not just reading source) found the real crash site. Verify live before trusting any bug narrative, even a "PO-confirmed" one.

---

## Session: 2026-07-24 (FACTORY-FRONTEND-split-orchestration — BOUNDED-1 idle-pickup)

**FACTORY-FRONTEND-split-orchestration DONE-CODE (rebuild-verify deferred) — 1325L route split into domain types/staleness/formatter + 11 components**

Zone health: 95 test files; 2110 pass / 2 fail (pre-existing QUE-TOOLTIP, unrelated — confirmed still red with the change stashed out via `git stash push -u -- apps/frontend` A/B); tsc 0 errors | HEALTHY

Task: sequel to FACTORY-FRONTEND-split-market-summaries — split `dashboard.orchestration.tsx` (fleet-monitoring dashboard, POLL_MS=5000 polling). Ticket added an explicit test-first constraint: a render smoke test confirmed RED (module not found) BEFORE each new component file was created, GREEN immediately after.

Files created:
- `domain/orchestration/types.ts` — 12 DTO types moved verbatim (StepDto, DecisionsDto, TaskStatus, TaskRow, TaskBoardCounts, TaskBoard, SignalRow, SignalQueue, SprintGoal, Narrative, Head, OrchState)
- `domain/orchestration/staleness.ts` — STALE_THRESHOLD_MS + `isStale(tsField, now)` predicate, 9 unit tests
- `domain/formatters/task-status-classes.ts` — `taskStatusClasses` (shared by 2 split-out components — moved here, not colocated, to avoid a components<->components circular import), 8 unit tests
- `components/orchestration/{HeadPanel,TaskGroup,StepCard,DecisionAccordion,DoneTaskRow,DoneTaskGroup,doneTaskGrid,TaskBoard,SignalQueue,SprintGoal,Narrative}.tsx` — 11 files all <=120L (DoneTaskGroup, originally ~158L combined, split a 2nd time into shell 104L + row 88L, sharing `DONE_GRID` via a non-JSX const module)

Files updated:
- `routes/dashboard.orchestration.tsx` — thin composition: types (re-exported) + loader (POLL_MS=5000 + fetch untouched, grep-confirmed) + StaleBadge/Section + 5 panel imports. TASK-DASH-CRON-2 Cron Recheck Table left untouched (out of ticket scope; a pre-existing test imports its exports directly from the route)
- `vite.config.ts` — test.include gained `app/domain/orchestration/**/*.test.{ts,tsx}` (the new staleness test was otherwise invisible to Vitest's discovery glob — root-cause fix mirroring the existing `domain/formatters` entry)
- `docs/architecture/microservice/frontend/domain-model.md` — split documented (mirrors market-summaries/dashboard-analysis precedent sections)

Commit: see decision journal `sprint-FACTORY-FRONTEND-split-orchestration-dev-frontend.md` | tsc: 0 errors | vitest: 2110 pass / 2112 (same 2 pre-existing fail as baseline)

rebuild_required=true but SCOPE-BOUND to CODE-ONLY per task — NO rebuild performed (user-gated, one just ran). Live Playwright G12 render-gate DEFERRED to next rebuild batch; board flipped `in_progress`→`review`, `next_agent=qa`.

---

## Session: 2026-07-24 (FACTORY-FRONTEND-split-market-summaries — BOUNDED-1 idle-pickup)

**FACTORY-FRONTEND-split-market-summaries DONE-CODE (rebuild-verify deferred) — 955L route split into domain formatters + 12 components**

Zone health: 83 test files; 2047 pass / 2 fail (pre-existing QUE-TOOLTIP, unrelated — confirmed still red with this change stashed out via git-stash A/B); tsc 0 errors | HEALTHY

Task: same split pattern as FACTORY-FRONTEND-split-dashboard-analysis — `dashboard.market-summaries.tsx` (list/detail dual-mode route).

Files created:
- `domain/market-summaries/format.ts` — 9 pure helpers moved verbatim (PERIOD_LABELS, formatDateRange, formatChangePct, changePctColorClass, directionArrow, directionArrowColorClass, outlookLabel, outlookColorClass, filterTickers). Ticket named only 5; extended to all 9 to avoid a route<->components circular import (the other 4 feed the split-out table components) — see decision journal S1/S2.
- `components/market-summaries/{PeriodBadge,CountChip,PeriodPicker,SummaryCard,TickerFilteredTable,KeyEventsSection,SectionHeader,ListView,StockPerformanceTable,RecommendationsTable,DetailView,DetailContent}.tsx` — 12 files, all <=120L (DetailView needed a 2nd split into DetailView+DetailContent after 1st pass landed at 131L)

Files updated:
- `routes/dashboard.market-summaries.tsx` — 955L→324L; types + `fetchSummaries` (verified inline here, NOT in `lib/api/client.ts` as the ticket assumed — left in place) + loader + thin ListView/DetailView composition remain; re-exports the 9 domain helpers for backward-compat
- `__tests__/task17-market-summaries-loader.test.ts` — 9 helper imports re-pointed `~/routes/...` → `~/domain/market-summaries/format`; fetchSummaries+types unchanged
- `docs/architecture/microservice/frontend/domain-model.md` — split documented (mirrors dashboard.analysis.tsx precedent section)

Equivalence proof (scratch, uncommitted, deleted after run): reference-identity (route re-export === domain export, same fn object) + golden-value assertions for all 9 helpers + proof canonical `change-pct.ts`/`direction-arrow.ts` return OBJECTS with `text-green-400` (confirms NOT reused) — 19/19 pass.

Commit: `e2f18a897` | tsc: 0 errors | vitest: 2047 pass / 2049 (same 2 pre-existing fail as baseline)

rebuild_required=true but SCOPE-BOUND to CODE-ONLY per task — NO rebuild performed (user-gated, one just ran). Live Playwright G12 render-gate DEFERRED to next rebuild batch; board flipped `in_progress`→`review`, `next_agent=qa`.

---

**Current state:** 96 test files; 2125 pass / 2 fail (pre-existing QUE-TOOLTIP schema); tsc 0 errors.
**Tech stack:** Remix 2 + TypeScript 5 strict + Tailwind 3 + shadcn/ui + Vitest + Playwright
**Key patterns:** useFetcher self-fetching zones; FreshnessBadge(intraday/daily/weekly SLA); safeFetch bounded; honest-NULL (null_reason + gray badge, never fabricate); DDD layers enforced; route-colocated DTO/parser/formatter families kept textually distinct across merged pages (do-not-homogenize); Playwright G12 gate must run with an unused `PLAYWRIGHT_PORT` override if the live frontend Docker container occupies :3001 (reuseExistingServer piggybacks on it otherwise, false-greening against stale code). Shared pure helpers used by >=2 sibling split-out components go to `domain/` (formatters or a feature-scoped `domain/<feature>/`), never colocated in one sibling — avoids components<->components circular imports (FACTORY-FRONTEND-split-orchestration).
