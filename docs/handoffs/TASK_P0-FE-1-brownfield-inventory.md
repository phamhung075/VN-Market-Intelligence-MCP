# TASK_P0-FE-1 — Frontend Brownfield Inventory

**Task ID:** P0-FE-1
**Zone:** `apps/frontend/`
**Owner:** architect (this cycle) → dev-frontend (Phase 1 reference)
**Status:** DONE (architect deliverable complete)
**Created:** 2026-05-25

---

## Brief

P0-FE-1 is the brownfield inventory for the frontend SCALE pilot. It establishes:
- Complete file structure of `apps/frontend/`
- Confirmed port from `docs/data/system-map.json`
- Pure-function audit (primitive candidates for MVR track)
- Existing test harness state (Vitest + Playwright)
- DDD layer mapping and drift assessment
- G5 surface determination

---

## [Architect] Brownfield Findings

**Zone:** `apps/frontend/` (anti-scope-creep boundary binding)

**Port confirmed:** 3001 — `docs/data/system-map.json` `.project.microservices[]` where `id="frontend"`: `port: 3001`, `external_port: 3001`. NOTE: frontend is NOT under a simple top-level key in system-map.json — it is inside the `project.microservices` array. PO flag resolved.

**Verified paths:**
- `apps/frontend/app/domain/market.ts` — domain types + 2 pure functions (`parseMacroSources`, `groupBySector`). Zero fetch imports. Clean domain layer.
- `apps/frontend/app/lib/api/client.ts` — ALL api-gateway calls. Contains 4 pure non-fetch helpers already exported and tested: `accuracyBadgeProps`, `deriveAccuracyDigestState`, `digestRateColor`, `parseAccuracyFromResponse`.
- `apps/frontend/app/routes/dashboard.analysis.tsx` — 1440-line primary route. Contains 7 untested pure helpers buried inline: `directionArrow`, `signalColor`, `confidencePct`, `formatSignalTime`, `directionLabel`, `confidenceLabel`, `signalTypeLabel`. Also `computeDecision` (already exported + tested via 1937 test).
- `apps/frontend/app/__tests__/` — 12 Vitest unit test files. Harness already operational (jsdom + Testing Library + Vite).
- `apps/frontend/tests/e2e/smoke.spec.ts` — 1 Playwright test (title check). Expansion point for render-gate.
- `apps/frontend/playwright.config.ts` — testDir: tests/e2e, baseURL: localhost:3001.
- `apps/frontend/Dockerfile` — multi-stage node:20-alpine. Port 3001. API_GATEWAY_URL=http://api-gateway:4000.

**Reuse patterns:**
- Do NOT re-extract `computeDecision`, `accuracyBadgeProps`, `deriveAccuracyDigestState` — they are already in Vitest test coverage. Phase 1 extracts only the 4 untested formatters.
- Extend existing Playwright smoke test pattern — do not create a separate config file.
- Formatter extraction pattern: extract function, add test, update route import, verify `npm test` passes.

**Design decisions:**
- Layer: pure formatters → `app/domain/formatters/` (domain layer analog)
- Layer: view-model → `app/lib/view-models/` (application layer analog)
- Layer: Playwright render specs → `tests/e2e/` (interface layer)
- DI pattern for time-dependent formatters: inject `now: Date` (see `classifyStaleBadge`)
- `formatSignalTime` uses `new Date()` internally — EXCLUDED from primitive set (not deterministic without injection). Replaced by `classifyStaleBadge` which takes `now` as param.

**G5 surface:** N/A. Frontend has no prior location in `apps/mcp-server/`. G5 = not applicable for this service.

**Scan clean:** true

**BUILD-STANDARD: lean** — `apps/frontend/` already exists.
**PILOT-STATUS-SSOT:** `docs/data/pilot-status-frontend.json`

---

## Acceptance Criteria (for dev wave reference)

**AC-1:** Brownfield inventory complete at `docs/architecture-briefs/2026-05-22-refactor/scale/frontend-brownfield.md`. Covers: file structure, port confirmation, pure-function audit, test harness state, DDD layer assessment, G5 surface.

**AC-2:** Port 3001 confirmed from `docs/data/system-map.json` (not hardcoded — sourced from SSOT).

**AC-3:** MVR-vs-FULL verdict documented with rationale. FULL primitive extraction (sandbox runner + scenario JSON) NOT recommended. MVR (Vitest formatters + Playwright render-gate) IS recommended.

**AC-4:** Primitive candidate set named with exact function signatures (4 formatters: `formatDirectionArrow`, `formatChangePct`, `formatSignalTypeLabel`, `classifyStaleBadge`).

**AC-5:** DDD drift risks documented (R-1 through R-4).

All ACs: COMPLETE (architect cycle 2026-05-25).

---

## Full Design Reference

`docs/architecture-briefs/2026-05-22-refactor/scale/frontend-brownfield.md`
