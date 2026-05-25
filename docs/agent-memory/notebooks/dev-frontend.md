# dev-frontend notebook

**Last updated:** 2026-05-25 | **Sprint:** P1-FE (Phase 1 MVR)

> Archive: `docs/archive/notebooks/dev-frontend-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Status

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

Phase 1 MVR complete. 179/179 Vitest + 4/4 Playwright GREEN. G12 streak 3/3 DONE. 4 pure formatters extracted (domain/formatters/), 1 view-model stub (lib/view-models/), render-gate Playwright spec. tsc clean. | HEALTHY

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

## Carry-over (next session)

- Phase 2: ESLint fence (G4) — eslint-plugin-boundaries blocking domain/formatters/ → lib/api/ imports
- Phase 2: G9 verbal sign-off from user on Playwright output
- Phase 2: G10 (AI fixes bug ≤2 cycles) via QA bug injection
- Phase 2: G11 (regression alarm) — 2-trial coupling proof
- Dev note: always use PORT=3099 (or similar) for host-side Playwright; Docker holds 3001 even when container stopped
