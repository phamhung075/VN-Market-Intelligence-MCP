# dev-frontend notebook

**Last updated:** 2026-07-29 | **Sprint:** QUALITY-AUDIT-FRONTEND-COVERAGE

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

## Session: 2026-07-29 (FE-PG-_INDEX-FRESH-FIX — BOUNDED-1 idle-pickup)

**DONE-CODE (rebuild-verify pending, ops-gated) — page-level FreshnessBadge wired onto /dashboard (Market Overview)**

Zone health: 98 test files; 2172 pass / 2 fail (same pre-existing QUE-TOOLTIP, confirmed via git-stash A/B); tsc 0 errors | HEALTHY

Task: dashboard._index.tsx rendered only per-dish ClientTimestamp — no page-level freshness indicator, so a stale CHEF synthesis feed was invisible (quality-audit FE-PG-_INDEX-FRESH WARN, 15.5h vs daily-tier 780min/0.5×thr boundary). Wired the existing FreshnessBadge + useFreshnessRevalidator("daily") — exact same pattern already used on ~24 sibling pages (dashboard.macro.tsx) — no fork.

Key finding: `GET /api/market-digest` already carries a top-level `data_asof` field live, but the frontend DTO/loader silently dropped it — genuine wiring gap, not a missing backend field. `data_asof` arrives as a bare SQLite "YYYY-MM-DD HH:MM:SS" string (no offset) — reused the existing `parseDate` helper (`app/lib/formatDate.ts`, already used by 4 other routes) to normalize to real ISO8601 UTC before handing it to FreshnessBadge. This host's Node default TZ resolves Europe/Paris (+2h) — a naive `new Date(raw)` parse (what FreshnessBadge itself does internally) would have silently skewed the computed age by 2h had the raw string been passed through unnormalized — same bug class as the earlier 2026-07-25 QUALITY-AUDIT-FRESHNESS-LIVE-PROBE lesson (scripts/gen-frontend-page-checks.mjs), root cause is the host TZ, not the SQLite convention.

Extracted `fetchMarketDigestData(origin)` as a named, test-importable loader-body helper (Remix strips inline loader exports under jsdom) — same extraction pattern as `fetchMacroData`/`fetchAlertsData`. Simplicity-gate Q2: inlined the data_asof normalization directly into `parseMarketDigestDto` rather than keep a separate single-call-site wrapper function.

6 new unit tests (naive-space normalization / already-ISO passthrough / absent+null → honest-NULL / 502 + network-error no-regression). G12: Playwright 3/3 render-check + 7/7 full e2e green via `PLAYWRIGHT_PORT=3011 FRONTEND_ORIGIN=http://localhost:3011` throwaway dev server (live `:3001` container is a stale image predating this commit — same recurring gotcha as prior 2026-07-25 sessions above). Manually confirmed live: green FreshnessBadge ("Cập nhật lúc <time>") renders on GET /dashboard/ against the real, unmodified mcp-server, via a second throwaway dev server on :3012.

Graphify: skipped — `/graphify docs --update --no-viz` is an interactive-session slash-command skill, not invocable from this background subagent context (no Skill tool grant) — same disposition as TOKEN-ECONOMY-TICK-PREFLIGHT-WU-1.

Files: `routes/dashboard._index.tsx` (+data_asof DTO field, normalized via parseDate, FreshnessBadge+useFreshnessRevalidator wired, `fetchMarketDigestData` extracted), `__tests__/FE-PG-_INDEX-FRESH-FIX-dashboard-index-loader.test.ts` (+6 tests, new), `docs/architecture/microservice/frontend/api-reference.md` (new row — dashboard._index.tsx was missing from the Remix Routes table entirely).

rebuild_required=true, NOT performed (ops-gated, not my zone). Board flipped `in_progress`→`review`, `next_agent=qa`, review_note flags PENDING-REBUILD for live-container re-verification — mirrors sibling BOUNDED-1 precedent above.

---

## Session: 2026-07-29 (FE-PG-BCTC-FRESH-FIX — BOUNDED-1 idle-pickup)

**DONE-CODE (rebuild-verify pending, ops-gated) — page-level FreshnessBadge wired onto /dashboard/bctc (Financial Reports hub)**

Zone health: 99 test files; 2177 pass / 2 fail (same pre-existing QUE-TOOLTIP, confirmed via git-stash A/B); tsc 0 errors | HEALTHY

Task: dashboard.bctc.tsx rendered `generated_at` (page-level) + per-item `updated_at` but no staleness *flag* (quality-audit FE-PG-BCTC-FRESH WARN). Wired the existing FreshnessBadge + useFreshnessRevalidator("event") — slaTierKey dictated by the quality-checklist's own SLA formula (`sla_tiers["event"].max_staleness_min=1560`), same pattern as ~24 sibling pages and the immediately-prior sibling task (FE-PG-_INDEX-FRESH-FIX).

No naive-SQLite risk here (unlike that sibling's `data_asof`): confirmed live against the real, unmodified mcp-server that `generated_at` is already `new Date().toISOString()` server-side (analysisBriefIndexHandler) — no `parseDate` normalization needed.

Found + fixed a related provenance bug: `fetchAnalysisBriefs` parsed the DTO's real `generated_at` but then discarded it (`Omit<LoaderData,"generated_at">`), and the loader substituted a second, independently-computed `new Date().toISOString()`. Both were "now" at request time in practice, but the DTO value is now also the FreshnessBadge input — fixed to thread the real upstream value through instead, avoiding provenance/clock-drift ambiguity between the two processes. Kept the existing always-a-string fallback semantics on absent/malformed `generated_at` (this DTO's type contract predates this task, unlike the sibling's honest-null `data_asof`) — did not invent new null semantics unprompted.

5 new unit tests (valid passthrough / absent+null fallback / 502+network-error no-regression). Full vitest 2177/2179 pass (2 pre-existing QUE-TOOLTIP fails, confirmed via `git stash` A/B — identical 2 failures reproduce with this diff fully stashed out). tsc clean. Playwright full suite (not just render-check): `PLAYWRIGHT_PORT=3021 npx playwright test` → 7/7 pass across all 3 spec files (smoke.spec.ts 1/1, render-check.spec.ts 3/3, quality-audit-lastverified.spec.ts 3/3) — none related to this change. Manually confirmed live SSR HTML on a throwaway `PORT=3022 npm run dev` against the real mcp-server on :3000: green `bg-green-100`/`bg-green-500` FreshnessBadge + "Cập nhật lúc" renders next to the existing ClientTimestamp.

Graphify: skipped — no Skill tool grant in this background subagent context, same disposition as FE-PG-_INDEX-FRESH-FIX/TOKEN-ECONOMY-TICK-PREFLIGHT-WU-1.

Files: `routes/dashboard.bctc.tsx` (`fetchAnalysisBriefs` now returns full `LoaderData` incl. real `generated_at`, FreshnessBadge+useFreshnessRevalidator("event") wired), `__tests__/FE-PG-BCTC-FRESH-FIX-dashboard-bctc-loader.test.ts` (+5 tests, new), `docs/architecture/microservice/frontend/api-reference.md` (new row — dashboard.bctc.tsx was missing from the Remix Routes table entirely).

rebuild_required=true, NOT performed (ops-gated, not my zone). Board flipped `in_progress`→`review`, `next_agent=qa`, review_note flags PENDING-REBUILD for live-container re-verification — mirrors sibling BOUNDED-1 precedent above.

---

**Current state:** 99 test files; 2177 pass / 2 fail (pre-existing QUE-TOOLTIP schema); tsc 0 errors.
**Tech stack:** Remix 2 + TypeScript 5 strict + Tailwind 3 + shadcn/ui + Vitest + Playwright
**Key patterns:** useFetcher self-fetching zones; FreshnessBadge(intraday/daily/weekly/event SLA); safeFetch bounded; honest-NULL (null_reason + gray badge, never fabricate) EXCEPT where a DTO's own type contract predates the freshness work and already defines an always-a-string fallback (e.g. analysis-briefs `generated_at`) — don't invent null semantics unprompted onto a pre-existing parse function; DDD layers enforced; route-colocated DTO/parser/formatter families kept textually distinct across merged pages (do-not-homogenize); Playwright G12 gate must run with an unused `PLAYWRIGHT_PORT` override if the live frontend Docker container occupies :3001 (reuseExistingServer piggybacks on it otherwise, false-greening against stale code) — reconfirmed 2026-07-29 (4th+ time). quality-audit FRESH checks are LIVE-PROBED (not static); its per-check `last_verified` staleness (distinct field, 7d window) is classified via `check-verification.ts` — never conflate the two. `parseDate` (app/lib/formatDate.ts) is the SSOT naive-SQLite→UTC normalizer — reuse it, never re-derive the space→T+Z transform inline; NOT every timestamp field needs it — confirm the actual server-side emission code before assuming naive-SQLite risk. A loader that parses a real DTO field then discards it in favor of a second, independently-computed local timestamp is a provenance bug worth fixing when that field becomes a freshness-badge input.
