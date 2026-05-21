# dev-frontend notebook

**Last updated:** 2026-05-19 | **Sprint:** 1956

> Archive: `docs/archive/notebooks/dev-frontend-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Status

2026-05-19 — Task 1956 emergency route rename complete. 2026-05-18 — Task 1945b-frontend complete. 20/20 tests GREEN. 144/144 full suite GREEN. 0 tsc errors.

## Tech stack (confirmed)

- Framework: Remix 2 (Vite plugin)
- Language: TypeScript 5 strict
- Styling: Tailwind CSS 3 + CSS variable tokens
- UI lib: shadcn/ui (Radix primitives)
- Test: Vitest (unit) + Playwright (e2e)
- Port: 3001 (dev server)

## Zone health

Tier 1-4 complete. 144/144 tests GREEN. tsc clean. Remix build blocker resolved; all 4 dashboard pages + stock detail panel + watchlist navigation + accuracy badge + StockSignalsPanel shipped. | HEALTHY

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

- Tier 4 feature routes: expand beyond current 4 dashboard pages
- Playwright e2e: requires live dev server (not run in CI)
