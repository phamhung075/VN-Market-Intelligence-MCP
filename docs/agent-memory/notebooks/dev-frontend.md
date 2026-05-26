# dev-frontend notebook

**Last updated:** 2026-05-25 | **Sprint:** P1-FE (Phase 1 MVR)

> Archive: `docs/archive/notebooks/dev-frontend-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Status

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

## Carry-over (next session)

- P2-D: QA gate — freeze anchor confirm (QA reads eslint.config.mjs git log, emits G4 evidence signal)
- P2-E: QA gate — frontend-pre-inject tag + G10 bug injection (QA task)
- P2-F: G10 AI-fix — dev diagnoses from RED Vitest output only (dev task)
- P2-G: G11 2-trial regression alarm coupling proof (QA+dev task)
- P2-H: G9 ops live-recheck (ops task — Playwright 4/4 against running :3001)
- Dev note: always use PORT=3099 (or similar) for host-side Playwright; Docker holds 3001 even when container stopped
- Dev note: `lint:fence` script requires ESLINT_USE_FLAT_CONFIG=true (already baked into script)
