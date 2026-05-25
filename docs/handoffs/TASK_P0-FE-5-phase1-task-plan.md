# TASK_P0-FE-5 — Frontend Phase 1 Task Plan

**Task ID:** P0-FE-5
**Zone:** `apps/frontend/`
**Owner:** architect (this cycle) → dev-frontend (Phase 1 execution)
**Status:** DONE (architect deliverable complete) → Phase 1 READY-FOR-DISPATCH
**Created:** 2026-05-25

---

## Brief

P0-FE-5 is the Phase 1 task plan for the frontend SCALE pilot. It follows the MVR (Minimum Viable Refactor) verdict. Dev-frontend should treat this handoff as the entry point into Phase 1 execution.

---

## [Architect] Design Notes

### MVR Verdict (BINDING)

VERDICT: **MVR** — lighter treatment than computational microservices. Rationale: frontend is the least domain-driven service; user trust thesis is sharpest for computational services. Heavy primitive extraction (sandbox runner, scenario JSON, 3-tier HTML dashboard) delivers marginal value for a UI service. The existing Vitest + Playwright harnesses are the right trust layer.

### What Dev-Frontend Builds in Phase 1

**4 pure formatter primitives** extracted from `dashboard.analysis.tsx`:
1. `formatDirectionArrow` → `app/domain/formatters/direction-arrow.ts`
2. `formatChangePct` → `app/domain/formatters/change-pct.ts` (market-data policy enforced as test)
3. `formatSignalTypeLabel` → `app/domain/formatters/signal-type-label.ts`
4. `classifyStaleBadge` → `app/domain/formatters/stale-badge.ts` (`now: Date` injection)

**1 view-model module** composing formatters:
- `buildWatchlistTileVM` → `app/lib/view-models/analysis-vm.ts`

**Playwright render-gate** (3 new checks):
- `tests/e2e/render-check.spec.ts` (3 checks: nav renders, stock selector renders, graceful degrade)

**G8 honest-red proof** via Playwright deliberate-fail + Vitest fixture edit.

### Key Architectural Decisions

1. **No sandbox runner** — MVR track uses Vitest directly. No `bun run sandbox` command.
2. **No separate HTML dashboard** — The running Remix app IS the trust dashboard. Playwright is the render-gate.
3. **`now` injection in `classifyStaleBadge`** — Never calls `Date.now()` internally. Tests inject `now` as `new Date("...")`.
4. **`formatSignalTime` NOT extracted** — Uses `new Date()` without `now` injection. Excluded from primitive set. The `classifyStaleBadge` primitive covers the stale-detection use case deterministically.
5. **Market-data policy test (MANDATORY)** — `formatChangePct` MUST have a test named `"never returns bare number — market-data policy"`. This is the charter §Key risks #3 enforcement.
6. **G12 streak** — P1-B1 + P1-B2 + P1-C. Each must have `npm test` green evidence before DONE.

### Files Preserved (Do NOT Touch)

- `app/routes/dashboard.analysis.tsx` — touch ONLY to remove local helpers + import formatters. Do NOT restructure the route, loader, or component tree.
- `app/lib/api/client.ts` — do NOT move the already-tested pure helpers (`accuracyBadgeProps`, `deriveAccuracyDigestState`, `digestRateColor`, `parseAccuracyFromResponse`). They stay in client.ts; Phase 2 can migrate them.
- `app/__tests__/*.test.ts` — existing tests must continue to PASS throughout Phase 1. Do NOT modify them except to reflect import path changes.

### Risk Flags for Dev-Frontend

**R-1 (MEDIUM) — Import path after extraction:** When extracting formatters from `dashboard.analysis.tsx`, update ALL callers within that file. Run `npm run typecheck` after each extraction to catch missed callers. Missed imports will cause runtime 500 errors in the loader.

**R-2 (LOW) — Playwright dev server timing:** `npm run test:e2e` requires `npm run dev` running. If CI does not pre-start dev server, the Playwright `webServer` block in `playwright.config.ts` handles it automatically. Do not start a separate server before Playwright — it uses `reuseExistingServer: !process.env.CI`.

**R-3 (LOW) — `dashboard.analysis.tsx` complexity:** The route is 1440 lines. When updating imports, search for ALL occurrences of `directionArrow`, `signalColor`, etc. using `grep`. They appear in multiple component functions within the same file.

---

## Acceptance Criteria for Phase 1 (Summary for Dev-Frontend)

**Phase 1 is complete when ALL of the following are true:**

1. `apps/frontend/app/domain/formatters/` contains 4 formatter files + 4 test files (direction-arrow, change-pct, signal-type-label, stale-badge).
2. `apps/frontend/app/lib/view-models/analysis-vm.ts` + `analysis-vm.test.ts` exist and pass.
3. `apps/frontend/tests/e2e/render-check.spec.ts` exists with 3 targeted checks + G8 deliberate-fail evidence.
4. `npm test` exits 0 — all Vitest tests including new formatter + view-model tests PASS.
5. `npm run test:e2e` exits 0 — all 3 Playwright render checks PASS.
6. `grep -r "from.*lib/api/client" apps/frontend/app/domain/formatters/ apps/frontend/app/lib/view-models/` returns 0.
7. `grep -r "never returns bare number" apps/frontend/app/domain/formatters/change-pct.test.ts` returns 1 match.
8. G12 streak: P1-B1, P1-B2, P1-C each have `npm test` green + Playwright green evidence pasted into their individual task handoffs before being marked DONE.
9. Zero-creds audit: `grep -rE "API_KEY|TOKEN|SECRET|PASSWORD" apps/frontend/app/domain/formatters/ apps/frontend/app/lib/view-models/ apps/frontend/tests/e2e/` returns 0.

---

## Full Phase 1 Plan Reference

`docs/architecture-briefs/2026-05-22-refactor/scale/frontend-phase-1-task-plan.md`

Contains: complete task ledger (8 tasks), per-task ACs (43 total), sequencing diagram, G7/G8 adaptation table, goals roadmap, §4.5 compliance statement.

---

## Next Actor

**dev-frontend** — execute Phase 1 tasks in order: P1-A → P1-B1 → P1-B2 → P1-B3 → P1-B4 → P1-C → P1-E → P1-QA.

Do not skip steps. WIP=1 throughout. QA confirms close gate (P1-QA) and updates `pilot-status-frontend.json` phase1 fields.
