# dev-frontend notebook

**Last updated:** 2026-07-25 | **Sprint:** FIX-PREDCLAIM-DASHBOARD-HITRATE-HONESTY

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

## Session: 2026-07-25 (FIX-PREDCLAIM-DASHBOARD-HITRATE-HONESTY — BOUNDED-1 idle-pickup)

**DONE-CODE (rebuild-verify pending, ops-gated) — calibration banner adds denominator/staleness/breakdown/exclusion context, zero hitRate recomputation**

Zone health: 96 test files; 2150 pass / 2 fail (same pre-existing QUE-TOOLTIP, confirmed via git-stash A/B); tsc 0 errors | HEALTHY

Task: bare `66,7%` hit-rate badge (4/6 over 17 total, frozen since 2026-06-21) read as live accuracy. 5 deliverables, all in `routes/dashboard.prediction-claims.tsx`: (a) inline denominator "4 đúng / 2 sai trên 6 dự báo đã chấm điểm", (b) data-driven staleness marker (`STALE_THRESHOLD_DAYS=14`), (c) exclusion explanation at point of use (tooltip on aggregate chip + note on excluded `ClaimCard`s), (d) full disposition breakdown line, (e) plain-VN wording (no jargon added, no decimals introduced).

Key design decision: `fetchPredictionClaimsData` now does a DOUBLE FETCH when an `?outcome=` filter is active — an always-unfiltered "context" call (source of `calibration` + new `lastScoredAt`) plus the existing filtered call for the display list. Without this, the staleness marker (needs correct/wrong `resolvedAt`) would silently vanish on the "Đang chờ"/"Loại trừ" tabs — the CalibrationBanner renders on every filter tab, unfiltered. Zero-cost on the "Tất cả" default view (still exactly 1 fetch, confirmed by test).

`claims[].exclusionReason` added as OPTIONAL type field (`resolveExclusionReason` consumes when present, `GENERIC_EXCLUSION_REASON` fallback otherwise) — producer (FIX-PREDCLAIM-BACKFILL-NULL-CREATIONPRICE deliverable c) NOT YET SHIPPED; live-probed zero rows carry it today, confirmed via `curl :3000/api/prediction-claims?outcome=excluded`.

**PLAYWRIGHT_PORT gotcha hit again (see line below) — port 3001 is the live Docker container (stale image); re-ran G12 with `PLAYWRIGHT_PORT=3011` against a fresh `npm run dev` to get real evidence: 4/4 pass.** Also live-verified the ACTUAL rendered SSR HTML on a throwaway `PORT=3012 npm run dev` against the real (unmodified) mcp-server on :3000 — denominator/breakdown/staleness/exclusion-reason all confirmed rendering with live values (staleness: "21/6/2026 (33 ngày trước)", matching root_cause's 2026-06-21 freeze exactly, non-hardcoded).

Files: `routes/dashboard.prediction-claims.tsx` (+9 exported pure helpers: `computeLastScoredAt`, `formatHitRateDenominator`, `formatDispositionBreakdown`, `describeStaleness`, `resolveExclusionReason`, `STALE_THRESHOLD_DAYS`, `GENERIC_EXCLUSION_REASON`), `__tests__/task17-prediction-claims-loader.test.ts` (+25 tests, Suites 16-21), `docs/architecture/microservice/frontend/api-reference.md` (new § Prediction Claims Trust-Surface Context — route wasn't in the table at all before).

rebuild_required=true, NOT performed (ops-gated, not my zone). Board flipped `in_progress`→`review`, `next_agent=qa`, review_note flags PENDING-REBUILD for live-container re-verification — mirrors sibling FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT precedent.

---

**Current state:** 96 test files; 2150 pass / 2 fail (pre-existing QUE-TOOLTIP schema); tsc 0 errors.
**Tech stack:** Remix 2 + TypeScript 5 strict + Tailwind 3 + shadcn/ui + Vitest + Playwright
**Key patterns:** useFetcher self-fetching zones; FreshnessBadge(intraday/daily/weekly SLA); safeFetch bounded; honest-NULL (null_reason + gray badge, never fabricate); DDD layers enforced; route-colocated DTO/parser/formatter families kept textually distinct across merged pages (do-not-homogenize); Playwright G12 gate must run with an unused `PLAYWRIGHT_PORT` override if the live frontend Docker container occupies :3001 (reuseExistingServer piggybacks on it otherwise, false-greening against stale code) — reconfirmed 2026-07-25. quality-audit FRESH checks are now LIVE-PROBED (not static) — an undocumented-field fallback is always capped NEEDS_REVIEW, never a certified PASS, to prevent compute-time fields masquerading as real recency (gen-frontend-page-checks.mjs).
