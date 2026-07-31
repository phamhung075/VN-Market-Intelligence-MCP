# dev-frontend notebook

**Last updated:** 2026-07-31 | **Sprint:** COWORK-GUARANTEED-SLOT-CATCHUP

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

## Session: 2026-07-31 (FIX-CI-FRONTEND-ESLINT-BUNLOCK-DUAL-LOCKFILE-DRIFT — P0 dev-team S3 hand-dispatch)

**DONE — CI-plane verified green — frontend-eslint job's first-ever GREEN run (was 0/8+ since added)**

Root cause: `apps/frontend` tracked TWO lockfiles. `bun.lock` (canonical for CI — ci.yml:142 cache key + :146 `bun install --frozen-lockfile`) was stale since 7793ca286 (2026-06-02); commit 48eb49a0c (2026-06-11) added `tailwindcss-animate` to package.json and regenerated only `package-lock.json`, never `bun.lock`. Job died at "Install dependencies", before `lint:fence` ever ran.

Fix: `bun install` in apps/frontend regenerated `bun.lock` (adds tailwindcss-animate + tightens some transitive deps that had drifted since June); `--frozen-lockfile` now exits 0. `package-lock.json` is NOT dead weight — `apps/frontend/Dockerfile` stage `deps` runs `npm ci --ignore-scripts` against it for the production image build (docker-compose.yml:419) — kept both lockfiles, documented the single regen-both command: `cd apps/frontend && bun install && npm install --package-lock-only`. `npm install --package-lock-only` produced 0 diff this cycle (package-lock.json already had the dep from 48eb49a0c).

`bun run lint:fence` ran for the first time in this job's history: 0 violations, exit 0 — validates the FACTORY-GUARD-CI-TSBOUNDARIES-IMPL "fixed 3 fence violations" claim with real CI evidence for apps/frontend (previously zero evidence, job never reached that step).

Commit 8c45fc1a0 (bun.lock only — package-lock.json unchanged, not staged). Pushed; CI run 30611681976 (headSha 8c45fc1a0) `frontend-eslint` conclusion=success, all 19 jobs green including size-lint (sibling row FIX-CI-SIZELINT-MACRO-VMT-LIQUIDITY-RESOLVERS-NEW-OFFENDER landed same tier) — main is fully CI-green.

Full vitest: 2183 pass / 2 fail — same pre-existing unrelated QUE_DESCRIPTIONS/Kinh-Dich codegen schema mismatch (file untouched since 2026-06-13, confirmed by reading the failing test's imports, not stash — no import overlap with bun.lock). tsc clean. Board flipped `in_progress`→`review`, `next_agent=qa`. `.head` NOT touched (was already pointed elsewhere per CANONICAL:SSOT-STATUSFLIP-LANEMOVE rule — flipped task ≠ `.head.active_task_id`). Decision journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-frontend.md` STEP dev-frontend-S4.

---

**Current state:** 100 test files; 2183 pass / 2 fail (pre-existing QUE-TOOLTIP schema); tsc 0 errors; `apps/frontend` bun.lock+package-lock.json in sync; `lint:fence` 0 violations.
**Tech stack:** Remix 2 + TypeScript 5 strict + Tailwind 3 + shadcn/ui + Vitest + Playwright
**Key patterns:** useFetcher self-fetching zones; FreshnessBadge(intraday/daily/weekly/event SLA); safeFetch bounded; honest-NULL (null_reason + gray badge, never fabricate) EXCEPT where a DTO's own type contract predates the freshness work and already defines an always-a-string fallback (e.g. analysis-briefs `generated_at`); DDD layers enforced; Playwright G12 gate must run with an unused `PLAYWRIGHT_PORT` override if the live frontend Docker container occupies :3001. `parseDate` (app/lib/formatDate.ts) is the SSOT naive-SQLite→UTC normalizer. `git stash` is unsafe in this shared-main working tree — prefer direct code-reading to confirm a failing test is unrelated. **Dual lockfile:** `apps/frontend` intentionally carries both `bun.lock` (CI-canonical, dev speed) AND `package-lock.json` (Dockerfile `npm ci` for the prod image) — any `package.json` dependency change MUST run `cd apps/frontend && bun install && npm install --package-lock-only` to regenerate BOTH, or the next drift silently reproduces this exact CI-red (bit me once, 7 weeks latent before the fence job surfaced it).
