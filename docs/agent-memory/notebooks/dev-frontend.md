# dev-frontend notebook

**Last updated:** 2026-07-29 | **Sprint:** QUALITY-AUDIT-FRONTEND-COVERAGE

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

## Session: 2026-07-29 (FE-PG-INTEL-FRESH-FIX — BOUNDED-1 idle-pickup)

**DONE-CODE (rebuild-verify pending, ops-gated) — page-level FreshnessBadge wired onto /dashboard/intel (AI Bulletin Hub)**

Zone health: 100 test files; 2183 pass / 2 fail (same pre-existing QUE-TOOLTIP, confirmed unrelated — different domain, no import overlap); tsc 0 errors | HEALTHY

Task: dashboard.intel.tsx rendered only per-dish ClientTimestamp — no page-level staleness flag (quality-audit FE-PG-INTEL-FRESH WARN). This is the third sibling in the FE-PG-*-FRESH-FIX family, hitting the IDENTICAL `GET /api/market-digest` endpoint as FE-PG-_INDEX-FRESH-FIX (dashboard._index.tsx) — same top-level `data_asof` field, same naive-SQLite risk, same fix. Wired the existing FreshnessBadge + useFreshnessRevalidator("daily") — slaTierKey matches the quality-audit check's own SLA formula (`sla_tiers["daily"].max_staleness_min=1560`).

Pure pattern replication, byte-identical normalization logic to the `_index` sibling: reused `parseDate` (app/lib/formatDate.ts) to normalize the bare SQLite "YYYY-MM-DD HH:MM:SS" `data_asof` string to real ISO8601 UTC before handing it to FreshnessBadge — never forked a second copy of the transform. `fetchIntelData` (pre-existing named, test-importable loader-body helper) now threads `data_asof` through instead of discarding it.

6 new unit tests (naive-space normalization / already-ISO passthrough / absent+null → honest-NULL / 502 + network-error no-regression) — same coverage shape as `_index`'s sibling test. Full vitest 2183/2185 pass (2 pre-existing QUE-TOOLTIP fails in an unrelated Kinh Dich codegen test file, zero import overlap with this route/endpoint — confirmed by reading the failing test's imports directly, no stash needed given the shared-main working tree has concurrent peer writes in flight). tsc clean. Playwright full suite: `PLAYWRIGHT_PORT=3031 FRONTEND_ORIGIN=http://localhost:3031 npx playwright test` → 7/7 pass across all 3 spec files (smoke.spec.ts 1/1, render-check.spec.ts 3/3, quality-audit-lastverified.spec.ts 3/3) — none related to this change. Manually confirmed live SSR HTML on a throwaway `PORT=3032 npm run dev` against the real, unmodified mcp-server on :3000: green `bg-green-100`/`bg-green-500` FreshnessBadge + "Cập nhật lúc" renders next to the item-count + ClientTimestamp.

Graphify: skipped — no Skill tool grant in this background subagent context, same disposition as the two prior sibling tasks.

Files: `routes/dashboard.intel.tsx` (`data_asof` added to DTO/LoaderData, normalized via parseDate, FreshnessBadge+useFreshnessRevalidator("daily") wired, `fetchIntelData` threads data_asof through), `__tests__/FE-PG-INTEL-FRESH-FIX-dashboard-intel-loader.test.ts` (+6 tests, new), `docs/architecture/microservice/frontend/api-reference.md` (new row — dashboard.intel.tsx was missing from the Remix Routes table entirely).

rebuild_required=true, NOT performed (ops-gated, not my zone). Board flipped `in_progress`→`review`, `next_agent=qa`, review_note flags PENDING-REBUILD for live-container re-verification — mirrors both prior sibling BOUNDED-1 precedents above. Task lock `task:FE-PG-INTEL-FRESH-FIX` intentionally NOT released — dev-team holds it pending independent RAW-verify.

---

**Current state:** 100 test files; 2183 pass / 2 fail (pre-existing QUE-TOOLTIP schema); tsc 0 errors.
**Tech stack:** Remix 2 + TypeScript 5 strict + Tailwind 3 + shadcn/ui + Vitest + Playwright
**Key patterns:** useFetcher self-fetching zones; FreshnessBadge(intraday/daily/weekly/event SLA); safeFetch bounded; honest-NULL (null_reason + gray badge, never fabricate) EXCEPT where a DTO's own type contract predates the freshness work and already defines an always-a-string fallback (e.g. analysis-briefs `generated_at`) — don't invent null semantics unprompted onto a pre-existing parse function; DDD layers enforced; route-colocated DTO/parser/formatter families kept textually distinct across merged pages (do-not-homogenize); Playwright G12 gate must run with an unused `PLAYWRIGHT_PORT` override if the live frontend Docker container occupies :3001 (reuseExistingServer piggybacks on it otherwise, false-greening against stale code) — reconfirmed 2026-07-29 (5th+ time). quality-audit FRESH checks are LIVE-PROBED (not static); its per-check `last_verified` staleness (distinct field, 7d window) is classified via `check-verification.ts` — never conflate the two. `parseDate` (app/lib/formatDate.ts) is the SSOT naive-SQLite→UTC normalizer — reuse it, never re-derive the space→T+Z transform inline; NOT every timestamp field needs it — confirm the actual server-side emission code before assuming naive-SQLite risk. A loader that parses a real DTO field then discards it in favor of a second, independently-computed local timestamp is a provenance bug worth fixing when that field becomes a freshness-badge input. `git stash` is unsafe in this shared-main working tree (peer agents commit concurrently, hundreds of unrelated pre-existing stash entries already present) — prefer direct code-reading to confirm a failing test is unrelated instead of stash A/B when the file content itself is sufficient evidence.
