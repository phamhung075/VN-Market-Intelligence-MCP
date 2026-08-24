# dev-frontend notebook

**Last updated:** 2026-08-24 | **Sprint:** COWORK-GUARANTEED-SLOT-CATCHUP

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

## Session: 2026-08-24 (FIX-DASH-CRON-LAYERB-NEVERFIRED-FALSE-LABEL — router-dispatched, Phase-B intent pre-claim)

**DONE — Layer-B cron rows no longer render false "Chưa từng chạy"**

Zone health: 100 test files; 2188 pass / 2 fail (same pre-existing unrelated QUE_DESCRIPTIONS/Kinh-Dich fails; +5 net new tests, all green); tsc 0 errors | HEALTHY

Task: `CronLayerTable`'s shared row-render loop's last-fire cell was layer-BLIND — Layer-A and Layer-B rows share one `rows.map(...)`, so all 23 Layer-B rows fell into a `row.last_fire == null` branch written for Layer-A and rendered "Chưa từng chạy" (asserts a false fact — session crons DO run, they just have no fire-telemetry writer; `normalizeCronRowB` correctly force-nulls all four fire fields by design, untouched). Root cause + ACs were fully pre-derived by po in the task row's `desc` (provenance chain traced to architecture brief line 127 dropping BA's original "(Layer-A, never fired)" qualifier) — pure implementation cycle, no re-investigation.

Fix: last-fire cell now checks `row.layer === "cli-session"` FIRST, rendering two new named exports `CRON_LAYER_B_LAST_FIRE_LABEL`("Không theo dõi")/`_HINT` (frontend-owned VN copy, visible not tooltip-only) before the untouched Layer-A `"Chưa từng chạy"` ternary. Also dropped the redundant per-row `Lớp` column (AC-5, non-blocking) — `CronRecheckTable` already splits Layer-A/Layer-B into two header-labelled sub-tables (AC-18 pre-existing), so a per-row layer value inside one already-homogeneous `CronLayerTable` call was pure redundancy; confirmed both pinned tests (`CRON_STATUS_LABELS.SESSION_SCOPED`, `cronLayerLabel("cli-session")`) are pure-function tests, not DOM assertions, so removal is conflict-free. Corrected `docs/architecture-briefs/2026-07-02-DASH-CRON-RECHECK-TABLE.md:127` (AC-6) and made the test's never-fired predicate layer-aware (AC-7, `TASK-DASH-CRON-2-cron-recheck-table.test.ts`).

G12 evidence: `render-check.spec.ts` 3/3 PASS. Full `playwright test` also surfaced 2 pre-existing unrelated live-data-content fails in `quality-audit-lastverified.spec.ts` (zero file overlap with this diff — a live SLA-breach description string on an unrelated page happens to contain the substring "stale").

Near-miss context: 2026-08-22 a router session misread this exact column as evidence session crons were unarmed and nearly double-armed repo-mutating crons (code-janitor, claude-manager-helper) over a live peer — user interrupted before any CronCreate fired.

Self-inflicted near-miss this cycle, caught+recovered: ran a stray `git stash` mid-investigation in this shared-main working tree (200+ pre-existing peer stash entries). `git stash pop stash@{0}` immediately restored my 3 edited files intact — zero data loss, zero peer-stash disturbance. This notebook already carried the "git stash is unsafe here" lesson (rolling footer, below) from a prior cycle; this is the first time it bit me directly rather than a peer.

Files: `routes/dashboard.orchestration.tsx` (2 new named exports + layer-aware last-fire branch + `Lớp` column drop), `__tests__/TASK-DASH-CRON-2-cron-recheck-table.test.ts` (layer-aware predicate, +5 net new tests), `docs/architecture-briefs/2026-07-02-DASH-CRON-RECHECK-TABLE.md:127`, `docs/architecture/microservice/frontend/domain-model.md` (doc-review addendum).

Commit `4b4bfea7a`. Board flipped `backlog`→`review`, `next_agent=qa`. Decision journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-frontend.md` STEP dev-frontend-S5.

---

**Current state:** 100 test files; 2188 pass / 2 fail (pre-existing QUE-TOOLTIP schema); tsc 0 errors; `apps/frontend` bun.lock+package-lock.json in sync; `lint:fence` 0 violations.
**Tech stack:** Remix 2 + TypeScript 5 strict + Tailwind 3 + shadcn/ui + Vitest + Playwright
**Key patterns:** useFetcher self-fetching zones; FreshnessBadge(intraday/daily/weekly/event SLA); safeFetch bounded; honest-NULL (null_reason + gray badge, never fabricate) EXCEPT where a DTO's own type contract predates the freshness work and already defines an always-a-string fallback (e.g. analysis-briefs `generated_at`); DDD layers enforced; Playwright G12 gate must run with an unused `PLAYWRIGHT_PORT` override if the live frontend Docker container occupies :3001. `parseDate` (app/lib/formatDate.ts) is the SSOT naive-SQLite→UTC normalizer. `git stash` is unsafe in this shared-main working tree (200+ pre-existing peer entries) — prefer direct code-reading to confirm a failing test is unrelated; if you stash by mistake, `git stash pop stash@{0}` immediately (never touch other indices). **Dual lockfile:** `apps/frontend` intentionally carries both `bun.lock` (CI-canonical, dev speed) AND `package-lock.json` (Dockerfile `npm ci` for the prod image) — any `package.json` dependency change MUST run `cd apps/frontend && bun install && npm install --package-lock-only` to regenerate BOTH, or the next drift silently reproduces this exact CI-red (bit me once, 7 weeks latent before the fence job surfaced it). **Shared render loop layer-blindness class:** when Layer-A/Layer-B (or any two-variant) rows share one `rows.map(...)`, a branch written for one variant silently applies to the other unless it explicitly discriminates on the variant field first — check for this pattern whenever a shared render loop renders rows sourced from more than one origin.
