---
title: "Brownfield Inventory — frontend (P0-FE-1)"
date: "2026-05-25"
author: "architect"
task: "P0-FE-1"
pilot: "frontend"
status: "COMPLETE"
zone: "apps/frontend/"
port: 3001
---

# Brownfield Inventory — `frontend` (P0-FE-1)

**Zone:** `apps/frontend/` ONLY — anti-scope-creep boundary binding.
**Port:** 3001 (confirmed from `docs/data/system-map.json` microservices array,
`id: "frontend"`, `port: 3001`, `external_port: 3001`).
**Language:** TypeScript / Remix (locked — Remix SSR ecosystem constraint overrides Go-first default).
**Runtime:** Node 20 (Dockerfile: `node:20-alpine`; build: `npm run build`; serve: `remix-serve`).
**Test harness:** Vitest (unit/logic) + Playwright (e2e). Both already configured.

---

## 1. Directory Structure

```
apps/frontend/
  app/
    __tests__/          # Vitest unit tests (12 files across 1932a..1945b)
      setup.ts          # jsdom + Testing Library + Remix preamble stub
      1937-decision-logic.test.ts    # computeDecision pure-function tests
      1940-accuracy-badge.test.ts    # parseAccuracyFromResponse + accuracyBadgeProps
      ... (10 other test files)
    components/
      ClientTimestamp.tsx            # SSR-safe time display
      charts/
        StockChart.tsx               # lightweight-charts wrapper
        indicators.ts                # TA indicator helpers
      ui/                            # shadcn/ui components (button, card, input)
    domain/
      market.ts          # Domain types + PURE FUNCTIONS (see §2)
      health.ts          # ServiceHealth type
      news.ts            # Headline type
    lib/
      api/
        client.ts        # Tier-3: typed fetch client (ALL api-gateway calls)
      utils.ts           # cn() — tailwind-merge helper
    root.tsx             # Remix root layout
    routes/
      _index.tsx         # Home page
      dashboard.tsx      # Dashboard nav layout (Outlet)
      dashboard.analysis.tsx  # Main analysis page (960 lines, richest route)
      dashboard.db.tsx
      dashboard.fetch.tsx
      dashboard.services.tsx
      dashboard.vps.tsx
  tests/
    e2e/
      smoke.spec.ts      # Playwright smoke: homepage title check (1 test)
  components.json        # shadcn/ui config
  Dockerfile             # Multi-stage: deps → build → runtime (node:20-alpine)
  playwright.config.ts   # testDir: tests/e2e, baseURL: localhost:3001
  vite.config.ts         # Remix Vite plugin + Vitest config
  package.json           # scripts: build/dev/test/test:e2e/lint/typecheck
```

---

## 2. Pure Functions Already in the Codebase (Primitive Candidates)

The brownfield scan found these pure functions — all zero-IO, deterministic, no infrastructure imports:

### In `app/domain/market.ts`

| Function | Signature | Pure? | Notes |
|---|---|---|---|
| `parseMacroSources(macro)` | `MacroData | null → MacroSourceRow[]` | YES | Zero I/O |
| `groupBySector(stocks, opts)` | `WatchlistStock[] → Record<string, WatchlistStock[]>` | YES | Filter + group |

### In `app/lib/api/client.ts` (non-fetch helpers — already exported)

| Function | Signature | Pure? | Notes |
|---|---|---|---|
| `accuracyBadgeProps(acc)` | `SignalAccuracy → {color, label}` | YES | Already tested (1940) |
| `deriveAccuracyDigestState(data)` | `AccuracyDigestStats | null → string` | YES | Already tested (1945b) |
| `digestRateColor(rate)` | `number → string` | YES | Pure threshold map |
| `parseAccuracyFromResponse(data)` | `Record → AgentSignal[]` | YES | Already tested (1940) |

### In `app/routes/dashboard.analysis.tsx` (local helpers — exported but in route file)

| Function | Signature | Pure? | Notes |
|---|---|---|---|
| `computeDecision(ta, reading, prices)` | `(TASnapshot|null, KinhDichReading, PricePoint[]) → DecisionResult` | YES | Already tested (1937) |
| `directionArrow(direction)` | `string → {symbol, cls}` | YES | Not exported |
| `signalColor(signal)` | `string → string` | YES | Not exported |
| `confidencePct(confidence)` | `number → string` | YES | Not exported |
| `formatSignalTime(createdAt)` | `string → string` | YES | Uses `new Date()` — NOT deterministic without injection |
| `directionLabel(direction)` | `string → {text, cls}` | YES | Not exported |
| `confidenceLabel(confidence)` | `number → {text, cls}` | YES | Not exported |
| `signalTypeLabel(signalType)` | `string → string` | YES | Pure label map |

---

## 3. Test Harness State

### Vitest (unit/logic tests)
- **Framework:** Vitest with jsdom environment, `@testing-library/jest-dom`, `@testing-library/react`
- **Location:** `app/__tests__/*.test.{ts,tsx}`
- **Run:** `npm run test` (alias: `vitest run`)
- **12 existing test files** spanning API client, market analysis logic, accuracy badges, watchlist, TA snapshot
- **Key insight:** Several pure functions are ALREADY tested in isolation (computeDecision, accuracyBadgeProps, deriveAccuracyDigestState, parseAccuracyFromResponse). This is solid existing infrastructure for formatter-primitive extraction.

### Playwright (e2e)
- **Framework:** Playwright with Chromium
- **Location:** `tests/e2e/smoke.spec.ts` (1 test: homepage title check)
- **Run:** `npm run test:e2e`
- **Config:** `baseURL: http://localhost:3001`, `webServer.command: npm run dev`
- **State:** Sparse — only 1 smoke test. This is the expansion point for the render-gate.

---

## 4. DDD Layer Assessment

Frontend is **not a domain microservice**. Applying the DDD lens honestly:

| Metaphor | Frontend analog | Files |
|---|---|---|
| **Domain (pure logic)** | `app/domain/market.ts`, `app/domain/health.ts`, `app/domain/news.ts` — types + 2 pure functions | `market.ts:82-90`, `market.ts:272-284` |
| **Application (orchestration)** | Remix loaders — fetch orchestration via `Promise.allSettled`, error aggregation | `dashboard.analysis.tsx:87-171` |
| **Infrastructure (I/O)** | `app/lib/api/client.ts` — all fetch calls to api-gateway:4000 | Full file |
| **Interface (presentation)** | Route components, UI components | `app/routes/*.tsx`, `app/components/` |

**Golden rule for UI:** all formatting/computation PURE helpers in `app/domain/` or exported from client; components are interface-only. This is mostly respected already.

---

## 5. Existing Layer Drift (Risks)

**R-1 (MEDIUM) — Pure helpers buried in route file:** `directionArrow`, `signalColor`, `confidencePct`, `formatSignalTime`, `signalTypeLabel`, `directionLabel`, `confidenceLabel` are all pure functions living inside `dashboard.analysis.tsx` (a 1440-line route file). They are NOT exported and thus not independently testable. These are prime primitive extraction candidates.

**R-2 (MEDIUM) — `formatSignalTime` uses `new Date()`:** Not deterministic — cannot be a pure scenario-testable primitive without `now` injection (same pattern as `temporal-decay-scorer` in rag-service). Either exclude from primitive set or inject `now` as parameter.

**R-3 (LOW) — `client.ts` mixes I/O and pure logic:** `accuracyBadgeProps`, `deriveAccuracyDigestState`, `digestRateColor`, `parseAccuracyFromResponse` are pure helpers mixed into the fetch client file. They are already exported and tested, but their location in a fetch file is a DDD drift (pure logic belongs in domain, not infrastructure).

**R-4 (LOW) — Market-data UI policy not enforced as a test:** The policy "always show change direction + delta %, never bare snapshot" exists as a comment in `domain/market.ts` (L9: `/** Direction of a price move — always shown with a delta %, never a bare snapshot. */`) and is implicit in `WatchlistTile` render logic, but there is no isolated unit test proving the formatter cannot return a bare number.

---

## 6. G5 Surface (Old Code to Delete)

No G5 rewire needed for frontend. The frontend does NOT have a "previous microservice location" in mcp-server. It has always been a standalone Remix app. G5 for frontend = N/A. Charter should note this.

---

## 7. Build and CI

- **Build:** `npm run build` (Remix Vite build → `build/server/index.js`)
- **Serve:** `remix-serve ./build/server/index.js` (Docker CMD)
- **Lint:** ESLint (eslint.config not found in scan — `npm run lint` uses `--ignore-path .gitignore`)
- **Typecheck:** `tsc --noEmit`
- **No import-linter** (not applicable — this is not a Python or Go service)
- **No architecture fence yet** (Phase 2 concern for this service — if MVR verdict is chosen, fence may be skipped entirely)

---

## 8. Verdict: Scope for MVR vs FULL

See `docs/architecture-briefs/2026-05-22-refactor/scale/frontend-phase-1-task-plan.md` §MVR-vs-FULL verdict section. Summary: **MVR treatment recommended.** Rationale in that doc.

---

## Scan Summary

```
Zone:               apps/frontend/
Port:               3001 (system-map.json confirmed)
Language:           TypeScript / Remix (Node 20)
DDD layers:         UI app — domain/app/infra/interface analog exists, loosely
Pure functions:     13 identified (7 untested in route file, 6 already tested)
Primitive candidates (honest G1): 4 formatters (see phase-1-task-plan.md)
Existing tests:     12 Vitest files + 1 Playwright smoke
G5 surface:         N/A (no prior mcp-server location)
Architecture fence: None exists — Phase 2 / MVR scoped
Scan clean:         true (no unexpected imports; domain/ has zero fetch calls confirmed)
```

**BUILD-STANDARD: lean** — `apps/frontend/` already exists; this is a SCALE PILOT refactor of an existing service, not a new service build.
