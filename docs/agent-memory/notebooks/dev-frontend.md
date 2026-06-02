# dev-frontend notebook

**Last updated:** 2026-05-28 | **Sprint:** BCTC-EVAL-SUBSTRATE

> Archive: `docs/archive/notebooks/dev-frontend-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Status

2026-05-28 — BCTC-EVAL-FE COMPLETE (unstaged). 2 routes + 3 helper components + domain types + API client. 204/204 Vitest GREEN (+21 new). tsc clean. Build ✓. shadcn components installed (table, badge, collapsible). No commits (main terminal scoped-commit).
2026-05-26 — P2-H macro contract fix COMPLETE. MacroSnapshot.signals: MacroSignal[] → MacroSignals (keyed-object). 3 files. 183/183 Vitest GREEN. tsc exit 0. lint:fence exit 0. Build ✓. Architect ruling 1d277bc7.
2026-05-26 — P2-F G10 blind-fix COMPLETE. direction-arrow.ts "↑↑" → "↑" fix (G10-injected bug). 179/179 Vitest GREEN. tsc clean. lint:fence 0. 1 cycle used.
2026-05-26 — Phase 2 P2-A + P2-B + P2-C COMPLETE. ESLint fence (G4) installed and proven. 179/179 Vitest GREEN. tsc clean. Stopping before P2-D (QA gate).
2026-05-25 — Phase 1 MVR COMPLETE. P1-A + P1-B1..B4 + P1-C + P1-E all DONE. 179/179 Vitest GREEN. 4/4 Playwright GREEN. G12 streak 3/3 COMPLETE. tsc clean.
2026-05-19 — Task 1956 emergency route rename complete. 2026-05-18 — Task 1945b-frontend complete. 20/20 tests GREEN. 144/144 full suite GREEN. 0 tsc errors.

## Tech stack (confirmed)

- Framework: Remix 2 (Vite plugin)
- Language: TypeScript 5 strict
- Styling: Tailwind CSS 3 + CSS variable tokens
- UI lib: shadcn/ui (Radix primitives)
- Test: Vitest (unit) + Playwright (e2e)
- Port: 3001 (dev server)

## Zone health

Phase 2 P2-A/B/C DONE. ESLint fence (G4) installed: eslint.config.mjs + eslint-plugin-boundaries@6.0.2 + TS resolver. Fence-A/B/C proven via deliberate-violation (exit 1, "Fence-A" in output), clean run exits 0. 179/179 Vitest, tsc clean. Stopped at P2-D (QA gate). | HEALTHY

## Cycle P1-FE — 2026-05-25 (Phase 1 MVR — formatter extraction + render-gate)

- P1-A: render-check.spec.ts (3 Playwright tests), playwright.config.ts PORT env, vite.config.ts PORT env
- P1-B1: domain/formatters/direction-arrow.ts + test (5 tests). Route: local directionArrow removed.
- P1-B2: domain/formatters/change-pct.ts + test (6 tests). Market-data policy "never bare number" test PRESENT. Route: WatchlistTile + SectorPeersBar updated.
- P1-B3: domain/formatters/signal-type-label.ts + test (10 tests). Route: local signalTypeLabel removed.
- P1-B4: domain/formatters/stale-badge.ts + test (8 tests). now: Date injection — deterministic.
- P1-C: lib/view-models/analysis-vm.ts + test (6 tests). buildWatchlistTileVM composes formatChangePct + formatDirectionArrow.
- P1-E: G7 (fixture edit RED→GREEN proof) + G8 (Playwright deliberate-fail RED→GREEN proof) + zero-creds audit.
- Commits: 3ef797d0 (P1-A) + eeb4d2f8 (P1-B1..B4) + 9b55a086 (P1-C)
- G12 streak: P1-B1 ✓ P1-B2 ✓ P1-C ✓ — 3/3 COMPLETE
- Key insight: Docker holds port 3001 even when container is stopped (TCP LISTEN). Use PORT=3099 env var for host-side Playwright runs.

## Cycle 1956 — 2026-05-19 (emergency route rename — Remix .server suffix violation)

- `dashboard.server.tsx` → `dashboard.services.tsx` (git mv). Nav links updated in 2 files.
- Signal: docs/signals/dev-frontend-1956-route-rename.json
- Commit: d4fa8648

## Key patterns

- ClientTimestamp component: SSR="...", after mount=toLocaleString("vi-VN") — eliminates root-level hydration cascade
- React hydration suppression is per-element (not inherited). Every ancestor containing locale-formatted text needs suppressHydrationWarning.
- process.env guard: `typeof process !== "undefined"` before bare process.env — browser bundle safe
- Promise.allSettled() for parallel fetch with per-source error isolation
- unknown + type guards (no `any`) in all API response parsers
- Remix .server suffix in route files with default export = Remix v7+ code-split violation

## Cycle P2-FE — 2026-05-26 (Phase 2 — ESLint fence G4)

- P2-A: `frontend-pre-ci` annotated tag created at fd6bc6a4. Tag SHA: 3fbbd5e021c1b5a611a96ca23ed72ed0790a841a. Local-only.
- P2-B: `eslint.config.mjs` created with Fence-A/B/C adapted for Remix app/ layout. devDeps: eslint@8.57.1, eslint-plugin-boundaries@6.0.2, @typescript-eslint/parser@8.60.0, @typescript-eslint/eslint-plugin@8.60.0, eslint-import-resolver-typescript@4.4.4. `lint:fence` script added. Initial commit: 437e8514. Fix commit (mode:full + TS resolver + rule order): 9cc11a31.
- P2-C: Deliberate Fence-A violation proof (NEVER committed). Added `import type { GatewayHealth } from '../../lib/api/client.js'` to direction-arrow.ts. ESLint exit 1, output: "Fence-A: domain/formatters must not import api-client layer". Reverted. Post-revert exit 0. git status clean.
- Key learnings:
  - eslint-plugin-boundaries v6 FOLDER mode appends /**/* to pattern for segment matching — files directly in a folder (not subdirectory) need mode:"full"
  - .js-suffixed ESM imports not resolved by default resolver; need eslint-import-resolver-typescript
  - ~ Remix alias requires tsconfig.json paths + TS resolver to resolve correctly
  - last-write-wins: put most-specific fence rule LAST in rules array to control error message
  - checkUnknownLocals:true needed as fallback for any remaining unresolved imports

## Cycle P2-F — 2026-05-26 (G10 blind-fix)

- G10 injected bug: `direction-arrow.ts` line 22 — `symbol: "↑↑"` (double arrow) instead of `symbol: "↑"`. Comment marker `// G10-INJECTED-BUG` present.
- Fix: reverted to single-arrow `"↑"`, removed bug comment.
- Diagnosis: Vitest output → `expected '↑↑' to be '↑'` → traced to formatDirectionArrow("up") in direction-arrow.ts → single-line fix.
- Verify: 179/179 Vitest, tsc exit 0, lint:fence exit 0. Cycles used: 1.
- Signal: docs/signals/dev-frontend-p2f-fix-20260526T125755Z.json

## Cycle P2-H — 2026-05-26 (macro snapshot signals keyed-object contract fix)

- Trigger: P2-H blocked on `snapshot.signals.map is not a function` (Go SignalResult = keyed object, not array).
- Architect ruling: 1d277bc7. Brief: `docs/architecture-briefs/2026-05-26-macro-snapshot-signals-contract-ruling.md`.
- File 1: `app/domain/market.ts` — replaced `MacroSignal` + `MacroSnapshot.signals: MacroSignal[]` with `MacroSignalEntry` (heterogeneous optional fields) + `MacroSignals = Record<string, MacroSignalEntry>`. `MacroSnapshot.signals` now typed `MacroSignals`.
- File 2: `app/routes/dashboard.analysis.tsx` — `MacroSignalPanel`: `signals.map()` → `Object.entries(signals).map([key, entry])`. `InfoSourcePanel`: `.length > 0` → `Object.values().length > 0`; spread+sort → `Object.entries().sort()`. `indicatorLabel()`: added 6 new canonical key mappings. Import: `MacroSignal` → `MacroSignalEntry`.
- File 3: `app/__tests__/1934-macro-panel.test.ts` — appended `describe("MacroSnapshot signals — keyed-object contract")` with 4 assertions (not array, 6 entries, per-key field access, Object.values length).
- Verify: 183/183 Vitest GREEN (+4 new). tsc --noEmit exit 0. lint:fence exit 0. Remix build ✓ (114 + 21 modules).
- Macro service NOT touched. Frontend only.

## Cycle BCTC-EVAL-FE — 2026-05-28 (BCTC-EVAL-SUBSTRATE sprint)

- Task: BCTC-EVAL-FE — per-PDF eval scorecard Remix dashboard surface.
- Brief: docs/architecture-briefs/2026-05-28-bctc-eval-shared-substrate.md (§4 JSON contract, §8 FE design, §13 DDD table).
- shadcn install: `npx shadcn@latest add table badge collapsible` → 3 new components in app/components/ui/. Card/Button already existed.
- Domain types: app/domain/bctc-eval.ts (EvalStatus, GateFailure, EvalStage, EvalReportSummary, EvalListResponse, EvalDetailResponse, ThresholdsResponse).
- API client: app/lib/api/bctc-eval-client.ts (fetchBctcEvalList, fetchBctcEvalDetail, recomputeBctcEval, fetchBctcEvalThresholds). Base URL from MCP_SERVER_BASE_URL env var (NOT api-gateway). fetchBctcEvalDetail returns {data, status} to let loader discriminate 404 vs 409.
- Helper components: app/components/bctc-eval/StatusBadge.tsx, StageCard.tsx.
- Routes: dashboard.bctc-eval._index.tsx (list), dashboard.bctc-eval.$reportId.tsx (detail).
- Nav: dashboard.tsx NAV_ITEMS += { to: "/dashboard/bctc-eval", label: "BCTC Eval" }.
- Tests: bctc-eval-list.test.tsx (9 tests), bctc-eval-detail.test.ts (12 tests) — 21 new tests, all GREEN.
- Total: 204/204 Vitest GREEN. tsc --noEmit exit 0. bun run build ✓ (1615 + 32 modules).
- Key learnings:
  - lucide-react icons must be typed as `LucideIcon` (not inline ComponentType with `size: number`) — LucideProps.size accepts `string | number`.
  - fetchBctcEvalDetail wraps BctcEvalApiError internally to return {status, data} — loader can discriminate without throwing.
  - MCP_SERVER_BASE_URL is separate from API_GATEWAY_URL; BCTC eval routes go direct to mcp-server:3000.
  - `satisfies` operator in STATUS_CONFIG causes assignability friction with LucideIcon — use explicit `Record<EvalStatus, StatusConfig>` instead.

Zone health: 20/20 test files GREEN (204 assertions), tsc clean, build ✓, new BCTC eval surface complete | HEALTHY

## Cycle FBT-DEV — 2026-06-01 (FRONTEND-BCTC-TAB sprint)

- Task: surface mcp-server BCTC Inspect viewer at /dashboard/bctc-inspect via A2 server-side proxy.
- Files created/modified (apps/frontend/ ONLY, tsc --noEmit clean):
  - dashboard.bctc-inspect.tsx: resource route, raw Response, fetches upstream /api/bctc-inspect (WITH /api).
  - api.bctc-inspect.$.tsx: splat proxy for /api/bctc-inspect/* (GET+POST, binary-safe arrayBuffer, status relay).
  - api.bctc-eval.$.tsx: second splat proxy for /api/bctc-eval/* (correction 2 — eval tab fetches this prefix).
  - dashboard.tsx: NAV_ITEMS += { to: "/dashboard/bctc-inspect", label: "BCTC Inspect" } after "BCTC Eval".
- Router corrections applied: (1) upstream = /api/bctc-inspect not /bctc-inspect; (2) /api/bctc-eval/* separate splat.
- No collision: dashboard.bctc-eval.* = /dashboard prefix; api.bctc-eval.$ = /api prefix. Confirmed distinct.
- tsc --noEmit: exit 0 (zero errors). Commit: 80f2911b.
- Key patterns: arrayBuffer pipe (never .text()/.json() on binary); relay upstream Content-Type + status; 4xx→4xx.
- Zone health: tsc clean, 4 files changed (205 insertions), FRONTEND-BCTC-TAB SHIPPED | ops rebuild pending.

## Cycle FE-AUDIT — 2026-06-02 (Full frontend audit + fix)

Zone health: 264/264 Vitest GREEN (+15 new), tsc clean, 3 files changed | HEALTHY

- Task: Reveal ALL frontend problems and fix all (operator directive).
- Audit scope: all 9 routes (/, /dashboard, /dashboard/{analysis,bctc-eval,bctc-inspect,db,fetch,orchestration,services,vps}).
- All routes SSR HTTP 200. No ErrorBoundary throws live (orchestration was transient at 14:44Z rebuild).

**Fix 1: /dashboard/vps — VPS not_deployed discrimination (dashboard.vps.tsx)**
- Problem: news/stock/pdf showed UNKNOWN + red error "GET /health/news failed: 503 Service Unavailable".
- Root cause: api-gateway returns 503 with body {"error":"dial tcp: lookup news-fetch ... no such host"} for not-deployed containers; fetchServiceHealth throws ApiError on 503 → row.error set → "unknown" rendered.
- Fix: fetchVpsServiceHealth (new loader-local fn) reads 503 body; "no such host" DNS error → status "not_deployed" → grey "NOT DEPLOYED" pill. VpsNote updated with NOT DEPLOYED vs DOWN explanation.
- Test: vps-not-deployed-discrimination.test.ts (+15 assertions).

**Fix 2: /dashboard/fetch — honest empty label (dashboard.fetch.tsx)**
- Problem: Reuters (0) showed bare "No data available for Reuters." — reads as broken.
- Fix: HeadlineList empty state → two-line label: "No headlines available / Source not deployed on this host (FU-FE-NEWS-SOURCE)".
- No new tests needed (component logic, covered by audit).

- Commit: 9372d7c0
- tsc: exit 0. Vitest: 264/264. Mutex: acquired+released.
- NEEDS REBUILD: frontend (ops to dispatch)

## Carry-over (next session)

- P2-D: QA gate — freeze anchor confirm (QA reads eslint.config.mjs git log, emits G4 evidence signal)
- P2-E: QA gate — frontend-pre-inject tag + G10 bug injection (QA task)
- P2-G: G11 2-trial regression alarm coupling proof (QA+dev task)
- P2-H: Ops must REBUILD frontend container then RE-RUN Playwright 4/4 against :3001
- FBT: ops rebuilds frontend container; qa verifies /dashboard/bctc-inspect live + eval tab.
- Dev note: always use PORT=3099 (or similar) for host-side Playwright; Docker holds 3001 even when container stopped
- Dev note: `lint:fence` script requires ESLINT_USE_FLAT_CONFIG=true (already baked into script)
