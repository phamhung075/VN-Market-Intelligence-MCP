# TASK_1918c — hsx-bctc-env-gate

**Type:** FIX | **Size:** S | **Sprint:** 1918 | **Owner:** dev-mcp-server
**Branch:** main (no QA gate — doc/env/trivial guard only)

## Context

User wants the ability to disable hsx.vn Strategy 0 in `bctcDiscovery` without code changes.
Add `HSX_BCTC_ENABLED` env var gate at the top of `fetchHsxBctcUrls()`.
When set to `"false"` the function returns `[]` immediately, falling through to VPS Strategy 1.

## Acceptance Criteria

- AC-1: `fetchHsxBctcUrls()` returns `[]` immediately when `HSX_BCTC_ENABLED === "false"` (no HTTP calls)
- AC-2: `.env.example` documents `HSX_BCTC_ENABLED=true` with inline comment
- AC-3: `SPIKE_BCTC-3-hsx-xhr-scope.md` Re-Assessment section notes no account required + env gate

## [Developer] Implementation Record

- **Files modified:**
  - `apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts:123-125` — env gate early-exit `if (Bun.env.HSX_BCTC_ENABLED === "false") return []`
  - `.env.example:54-55` — `HSX_BCTC_ENABLED=true` entry with inline comment
  - `docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md` — note added at top of Re-Assessment section
  - `apps/mcp-server/src/__tests__/BCTC-3b-hsx-fetcher.test.ts` — TC-ENV added (env gate returns [] with no HTTP calls)
- **Tests written:** `BCTC-3b-hsx-fetcher.test.ts` TC-ENV — 1 assertion, GREEN. Total suite: 9/9 pass.
- **Git commits:** see below
- **tsc status:** clean (0 errors)
- **Full suite:** 9 pass / 0 fail (BCTC-3b suite) ✓
- **Docs updated:** `docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md` Re-Assessment — env gate note added | `.env.example` — new env var
- **Graphify:** skipped (no domain knowledge files impacted)
