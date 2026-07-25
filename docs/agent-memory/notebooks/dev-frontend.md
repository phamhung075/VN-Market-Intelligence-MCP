# dev-frontend notebook

**Last updated:** 2026-07-25 | **Sprint:** FE-PG-QUALITY-AUDIT-LASTVERIFIED-RENDER-FIX

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

## Session: 2026-07-25 (FE-PG-QUALITY-AUDIT-LASTVERIFIED-RENDER-FIX — BOUNDED-1 idle-pickup)

**DONE-CODE (rebuild-verify pending, user-gated) — per-check `last_verified` + 7d staleness badge on `/dashboard/quality-audit`**

Zone health: 97 test files; 2166 pass / 2 fail (same pre-existing QUE-TOOLTIP, confirmed via git-stash A/B); tsc 0 errors | HEALTHY

Task: every check rendered identically regardless of `last_verified` age (264/442 checks 45d stale, invisible). AC (a)-(d): per-check timestamp shown; >7d visually distinguishable without hover; all 4 live shapes tolerated (bare date/sec/ms/µs — the µs row is `FR-FRESH-02`); missing/unparseable → explicit UNKNOWN, never a fresh-looking blank.

New `app/domain/formatters/check-verification.ts`: `classifyCheckVerification(unknown, now)` wraps the pre-existing `classifyStaleBadge` with a `typeof === "string"` guard (payload is a pass-through cast, `last_verified` is `unknown` at the type boundary) + fixed `CHECK_VERIFICATION_WINDOW_MINUTES=10080` (7d D-PAGE window, page-freshness.md). `classifyStaleBadge` already tolerated all 4 shapes (confirmed via `new Date()` node probe before writing code — none NaN). New `LastVerifiedBadge` in the route: green+date (fresh) / red+date+"stale" text (stale, never color-only) / grey "UNKNOWN". `now` threaded from the loader's existing `fetchedAt` (no `new Date()` in render — avoids hydration mismatch).

Verified against the REAL served path (not a fixture): 16 new unit tests (check-verification.test.ts) + new `tests/e2e/quality-audit-lastverified.spec.ts` (3 tests: no-crash, all-4-shapes stale bucketing, fresh-has-no-stale-marker) — run via `PLAYWRIGHT_PORT=3011 FRONTEND_ORIGIN=http://localhost:3011 npx playwright test` against a throwaway dev server (live `:3001` container predates this commit, rebuild user-gated) hitting the real, unmodified mcp-server `:3000` — its live data naturally contains all 4 shapes already, no synthetic fixture needed. 7/7 e2e green (3 new + existing 3 render-check + 1 smoke), G12 gate intact.

Files: `domain/formatters/check-verification.ts` (+40L, new) + `.test.ts` (+108L, new), `routes/dashboard.quality-audit.tsx` (+92L: type field, `LastVerifiedBadge`, column, `now` threading), `tests/e2e/quality-audit-lastverified.spec.ts` (+90L, new), `docs/architecture/microservice/frontend/{domain-model,api-reference}.md` updated.

Aside (not fixed, out of scope): `AuditCapability.capability_id` is dead — the wire field is `cap_id`, every `key={cap.capability_id}` is `undefined` at runtime (React key-warning only, no functional break). Noted in domain-model.md for whoever picks it up.

rebuild_required=true, NOT performed (user-gated). Board flipped `in_progress`→`review`, `next_agent=qa`, review_note flags PENDING-REBUILD — code+behavior proven live against real mcp-server data via throwaway dev server, only the named `:3001` container deploy is pending.

---

**Current state:** 97 test files; 2166 pass / 2 fail (pre-existing QUE-TOOLTIP schema); tsc 0 errors.
**Tech stack:** Remix 2 + TypeScript 5 strict + Tailwind 3 + shadcn/ui + Vitest + Playwright
**Key patterns:** useFetcher self-fetching zones; FreshnessBadge(intraday/daily/weekly SLA); safeFetch bounded; honest-NULL (null_reason + gray badge, never fabricate); DDD layers enforced; route-colocated DTO/parser/formatter families kept textually distinct across merged pages (do-not-homogenize); Playwright G12 gate must run with an unused `PLAYWRIGHT_PORT` override if the live frontend Docker container occupies :3001 (reuseExistingServer piggybacks on it otherwise, false-greening against stale code) — reconfirmed 2026-07-25 (twice). quality-audit FRESH checks are LIVE-PROBED (not static); its per-check `last_verified` staleness (distinct field, 7d window) is classified via `check-verification.ts` — never conflate the two.
