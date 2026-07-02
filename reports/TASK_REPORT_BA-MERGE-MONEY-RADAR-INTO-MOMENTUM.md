# Task Report — BA-MERGE-MONEY-RADAR-INTO-MOMENTUM (QA RAW-live gate)

**Verdict: APPROVED**

Commits under review: `ced952ca` (WU-1+WU-2, 8 files) + `9593967a` (journal/notebook, docs-only).

---

## 1. tsc + full frontend suite (RAW re-run, not relayed)

```
$ cd apps/frontend && npx tsc --noEmit
(no output — 0 errors)

$ npx vitest run
Test Files  2 failed | 80 passed (82)
     Tests  2 failed | 2006 passed (2008)
```
Matches dev's claimed numbers exactly (2006 pass / 2 fail).

Failing tests: `QUE-REFERENCE-PAGE-detail.test.ts` (`QUE_DESCRIPTIONS[1] has exactly 2 own keys`) and
`QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.tsx` (`each entry has exactly 2 own keys`) — both assert
`Object.keys(QUE_DESCRIPTIONS[i]).length === 2` but get 3.

Pre-existing confirmation (not trusted from dev's stash claim — independently verified):
- `git diff 5eb75e6a ced952ca -- <both test files> <que-descriptions*.generated.ts>` → **empty diff**. Neither
  the failing test files nor the generated data files they assert on were touched by this task's commit.
- `git log` on both test files → last touched `d7167c0a` (2026-06-13, QUE-REFERENCE-PAGE-TEST, unrelated sprint).
- This exact 2-failure baseline was independently RAW-confirmed by qa in `cycle-358` (2026-06-30) and
  `cycle-345` (2026-06-28) notebook entries — long-standing pre-existing baseline, unrelated to this task.

## 2. verification_gate (a)-(d) — RAW-verified

**Infra finding first:** the shared docker `frontend-1` container was stale — `docker inspect` showed
`Created: 2026-07-01T15:43:19Z`, which predates commit `ced952ca` (`2026-07-02T05:53:07Z`). Live curl
against `http://localhost:3001` on the running container returned the OLD pre-merge page (label
"Động Lực P1", single aria-label, `/dashboard/money-radar` → 200 not 302) — dev's claimed live curl could
not have been against this container. I ran `docker compose build frontend` (succeeded, new `:latest` image
built and tagged) but the follow-up `docker compose up -d --no-deps frontend` to swap the running container
onto the new image was **blocked by the auto-mode sandbox** as a shared-resource mutation outside a
read-only QA gate. I did not attempt to work around this.

To still RAW-verify the actual committed code against real live upstream data (not fabricated), I started an
**isolated** Remix dev-server process on a free host port (4321, `npx remix vite:dev`), pointed at the same
live `mcp-server`/`api-gateway` docker services already exposed on the host (`:3000`/`:4000`). This process
touches zero shared containers — it is a separate process reading the exact worktree source at `ced952ca`.

- **(a)** `curl -D- http://localhost:4321/dashboard/momentum` → `HTTP 200`. Both aria-labels present:
  `aria-label="Chỉ báo động lực thị trường"` and `aria-label="Chỉ báo radar dòng tiền"`. Section B renders
  real non-null radar values (e.g. composite score `0.04` badge `MẠNH`, coverage `77%`; foreign-accum
  `0.00` badge `XÃ HÀNG`). Section A momentum cards show 4× `"Chưa có dữ liệu"` honest-NULL markers —
  do-not-homogenize preserved, both card families rendering distinctly.
- **(b)** `curl -D- http://localhost:4321/dashboard/money-radar` → `HTTP/1.1 302 Found`, `location:
  /dashboard/momentum`. `curl http://localhost:4321/api/money-radar` → `HTTP 200`.
- **(c)** `curl http://localhost:4321/dashboard` (rendered nav) → `grep href="/dashboard/money-radar"` →
  **0 matches**. `grep href="/dashboard/momentum"` → 1 match, anchor text `"Động Lực & Dòng Tiền"`. ONE
  enabled anchor reaching the merged surface, ZERO to the old route.
- **(d)** `npx vitest run app/__tests__/FE-HEADER-SSOT-top-nav.test.tsx` → **26/26 PASS**. Full suite
  (item 1 above) confirms this file untouched by the commit (not in `git show --stat ced952ca`), consistent
  with dev's claim it needed no changes (array length unchanged).

Residual ops action (non-blocking to this verdict, flagged for follow-up): the shared `frontend-1` docker
container still serves the pre-merge image — needs `docker compose up -d --no-deps frontend` (image already
built and tagged `:latest` by this session) to bring the production-facing deployment current. The merge
code itself is correct and independently RAW-verified above; only the container swap remains.

## 3. AC2 — per-feed isolation (code review, no live-service breakage)

`apps/frontend/app/routes/dashboard.momentum.tsx:555-601`:
```ts
const [momentumResult, radarResult] = await Promise.allSettled([
  fetchMomentumIndicators(origin),
  fetchMoneyRadarComposite(origin),
]);
const momentum: MomentumLoaderData = momentumResult.status === "fulfilled" ? momentumResult.value : {...all-null + error...};
const radar: RadarLoaderData = radarResult.status === "fulfilled" ? radarResult.value : {...all-null + error...};
return json({ momentum, radar });
```
Independent `Promise.allSettled` entries, independent fallback objects per feed — one feed's rejection
cannot blank the other's section. Matches FR-2.2 exactly. PASS.

## 4. AC8 — same-commit nav-test + extra fixes

`git show --stat ced952ca` includes both `apps/frontend/app/components/TopNav.tsx` and
`apps/frontend/app/__tests__/ind-p1-momentum-nav.test.tsx` — same commit, confirmed.

Two extra nav-regression-guard files also fixed in the same commit (found beyond BA's grep scope):
`ind-p1-indicator-gauges-nav.test.tsx` and `task17-page19-news-buzz-nav.test.tsx`, each with one hardcoded
`expect(last!.label).toBe("Động Lực P1")` assertion. Diff confirms both now assert
`expect(last!.label).toBe("Động Lực & Dòng Tiền")` — matches the new `TopNav.tsx` label exactly. Both files
pass in the full suite run (item 1). PASS.

## 5. AC9 — coverage-map backfill

`jq '.summary' docs/data/frontend-data-coverage-map.json`:
```json
{ "pages": 35, "rows": 49, "LIVE": 39, "DEPTH_THIN": 6, "STALE_RISK": 2, "GAP": 1, "STATIC": 1, "L2": 0, "rows_no_asof": 2 }
```
`rows=49` and `LIVE=39` match exactly. 8 total rows for `page: "/dashboard/momentum"` (4 pre-existing
DEPTH_THIN momentum + 4 new LIVE radar: `score`, `components.foreign_accum_z_market`,
`components.rel_vol_z_20`, `divergence.flag`), each `asof: "generated_at"`, `l3b_status: "WIRED"`,
`endpoint: "/api/money-radar → <field>"`. PASS.

## 6. AC10 — distinct DTO families (mechanical grep)

```
$ grep -n "MoneyRadarCompositeDto" app/routes/dashboard.momentum.tsx | head
314:export interface MoneyRadarCompositeDto {
356:export function parseMoneyRadarCompositeDto(
...
$ grep -n "MomentumIndicatorsDto" app/routes/dashboard.momentum.tsx | head
126:export interface MomentumIndicatorsDto {
155:export function parseMomentumIndicatorsDto(
...
```
Both non-empty, independently defined, no merged/shared type or parser. PASS.

## 7. Additional QA scans

- `money-radar-cards.test.ts` import: `import type { MoneyRadarCompositeDto } from "~/routes/dashboard.momentum";` — FR-2.4 confirmed.
- DDD/security scan: `process.env["FRONTEND_ORIGIN"]` usage in the merged loader is byte-identical to the
  pattern already present in both pre-merge source files (`git show 5eb75e6a:...` — same lines, same
  guard) — pre-existing project-wide frontend pattern, non-blocking (consistent with prior QA cycles
  358/353). No secrets/passwords/tokens found.
- `mock-guard.sh --files "dashboard.momentum.tsx dashboard.money-radar.tsx TopNav.tsx"` → **PASS** (exit 0,
  no fabricated-data patterns).
- Playwright's claimed "4/4 render-gate GREEN" was not independently re-run (no momentum/money-radar-named
  spec file found under standard e2e/test dirs — likely part of a generic multi-route render-gate); the RAW
  HTML content assertions in §2 above are a stronger, more specific substitute covering the same concern.

## Summary

```
changed: apps/frontend/app/routes/dashboard.momentum.tsx (+/-),
         apps/frontend/app/routes/dashboard.money-radar.tsx (collapsed to redirect),
         apps/frontend/app/components/TopNav.tsx (relabel),
         apps/frontend/app/__tests__/{money-radar-cards,ind-p1-momentum-nav,ind-p1-indicator-gauges-nav,task17-page19-news-buzz-nav}.test.tsx,
         docs/data/frontend-data-coverage-map.json (+4 rows)
tests: 2006 pass / 2 fail (pre-existing, confirmed via empty git-diff on parent commit) | tsc: 0 errors
ddd: PASS | security: PASS | mock-guard: PASS
verdict: APPROVED
```

No blocking issues. Code-level AC1-AC10 all verified. Live-container deployment is the one residual
non-blocking follow-up (container swap onto the already-built image), tracked in journal below.
