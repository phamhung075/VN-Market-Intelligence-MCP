# dev-frontend notebook

**Last updated:** 2026-07-25 | **Sprint:** FRONTEND-FRESHNESS-TRANSPARENCY

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

## Session: 2026-07-25 (QUALITY-AUDIT-FRESHNESS-LIVE-PROBE — direct dispatch, quality-audit page freshness)

**DONE — quality-audit FRESH checks upgraded from static badge-presence to LIVE-PROBE real recency**

Zone health: unchanged (no apps/frontend/ code touched — scope was scripts/gen-frontend-page-checks.mjs + docs/data/quality-checklist.json only) | HEALTHY

User complaint: "quality-audit for each page must verify data freshness against the database... many data forgot to update." Extended the generator per docs/handoffs/BA-FRONTEND-FRESHNESS-TRANSPARENCY.md §FR-6/EC-3/EC-4: FRESH checks now fetch each page's real endpoint at generation time and grade real age vs docs/data/frontend-data-coverage-map.json `sla_tiers` (never hardcoded) — PASS ≤0.5×thr, WARN ≤thr, FAIL >thr; off-hours realtime/intraday capped WARN (never FAIL) per VN market hours 02:00-08:59 UTC Mon-Fri (today=Sat, gate verified firing on alerts/foreign-flow).

Anti-false-green field-trust rule: L2-fix rows (`_l2_fix`: marketDigest/alerts/qualityChecklist/vpsProxyHealth/priceHistory) require the literal canonical `data_asof`; other rows use the coverage-map's documented `row.asof` name; any other field found live is shown (real value+age) but capped NEEDS_REVIEW, never silently promoted to a certified PASS.

Confirmed live: market-digest/alerts/vps-proxy-health/quality-checklist all genuinely carry `data_asof`. GENUINE GAP confirmed: `/api/price-history/:ticker` (Technical Zone inside `analysis`) still has NO top-level `data_asof` → new `FE-PG-ANALYSIS-TECHNICAL-PRICE-HISTORY-FRESH` = FAIL. quality-checklist's `generated_at` found ~45 days stale despite always-fresh `data_asof` (RISK-2) → new `FE-PG-QUALITY-AUDIT-CONTENT-REGEN-CORR` = WARN. Mechanism also organically surfaced bctc-eval (list+detail) lacking any real top-level asof — flagged NEEDS_REVIEW, not fabricated.

Result: 175 new checks / 36 CAP-FE-PAGE-* groups (143 PASS/5 WARN/3 INFO/19 NEEDS_REVIEW/5 FAIL); stored summary 389/8/6/17/22/442 jq-tally-verified; check_id set identical + zero dupes across 2 consecutive runs (idempotent); 38 non-CAP-FE-PAGE-* caps untouched.

Files: `scripts/gen-frontend-page-checks.mjs` (+378L probe engine), `docs/data/quality-checklist.json` (regenerated), `docs/agents/po/flow/scripts-registry.md` (pointer addendum).

Lesson: naive DB timestamps ("YYYY-MM-DD HH:MM:SS", no offset) must be parsed as UTC explicitly — this host's Node default TZ resolves Europe/Paris (+2h); `new Date(str)` naive parsing would have silently skewed every age computation by 2h.

---

**Current state:** 96 test files; 2125 pass / 2 fail (pre-existing QUE-TOOLTIP schema); tsc 0 errors.
**Tech stack:** Remix 2 + TypeScript 5 strict + Tailwind 3 + shadcn/ui + Vitest + Playwright
**Key patterns:** useFetcher self-fetching zones; FreshnessBadge(intraday/daily/weekly SLA); safeFetch bounded; honest-NULL (null_reason + gray badge, never fabricate); DDD layers enforced; route-colocated DTO/parser/formatter families kept textually distinct across merged pages (do-not-homogenize); Playwright G12 gate must run with an unused `PLAYWRIGHT_PORT` override if the live frontend Docker container occupies :3001 (reuseExistingServer piggybacks on it otherwise, false-greening against stale code). Shared pure helpers used by >=2 sibling split-out components go to `domain/` (formatters or a feature-scoped `domain/<feature>/`), never colocated in one sibling — avoids components<->components circular imports (FACTORY-FRONTEND-split-orchestration). quality-audit FRESH checks are now LIVE-PROBED (not static) — an undocumented-field fallback is always capped NEEDS_REVIEW, never a certified PASS, to prevent compute-time fields masquerading as real recency (gen-frontend-page-checks.mjs).
