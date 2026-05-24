---
title: "Scale Charter — frontend"
date: "2026-05-24"
author: "po"
status: "READY"
service: "frontend"
owner: "dev-frontend"
language: "TypeScript (Remix)"
scale_order: "parallel-eligible (after macro-indicators)"
canonical_goals: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (G1–G12)"
---

# Scale Charter — `frontend`

**Thin charter. G1–G12, Decision Matrix, Security Clause, Baseline Metric Capture are CANONICAL in the pilot charter and are NOT restated here.**

→ **Canonical G1–G12 source:** `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md`
Apply verbatim with the adaptation notes below — the frontend is a UI service, so several goals map differently (see Key risks).

→ **Phase plan:** `docs/architecture-briefs/2026-05-22-refactor/07-phases.md` · **QA gates:** `qa-gates/`
→ **Status tracking:** `docs/data/refactor-status-frontend.json`

---

## Service-Specific Deltas

| Field | Value |
|---|---|
| **Owner specialist** | `dev-frontend` |
| **Language** | **TypeScript (Remix)** (stays TS — Remix SSR / React ecosystem constraint overrides Go-first default). |
| **Anti-scope-creep boundary** | `apps/frontend/` ONLY. |

### Current state — REMIX/VITE TS APP (not DDD-shaped)

`apps/frontend/` is a Remix + Vite + Tailwind app (`app/`, `components.json`, `vite.config.ts`, `playwright.config.ts`, `tests/`). It is UI-layer code, not a domain microservice — the three-tier metaphor maps loosely.

This is the **least domain-driven** service. The honest interpretation of the pilot pattern for a UI:
- **Primitives (G1)** — pure presentation/formatting functions: e.g. `format-change-direction` (always show delta % + direction, never bare snapshot — see UI policy), `format-ticker`, `format-vnd`, `classify-stale-badge`, `render-trend-arrow`. Pure data-in → display-string-out, scenario-JSON-testable.
- **Module (G2)** — view-model composition (data → display model) kept free of fetch/IO.
- **Dashboard (G6–G9)** — Playwright headless render gate is the natural trust layer here (the TA pilot already used Playwright for G9). Reuse `verify-render.mjs`-style headless verification.

### Key risks
1. **UI is not domain logic.** Do NOT force-extract React components as "primitives". Extract only pure formatting / view-model functions. Components stay components. Honest G1 for a UI is a small set of formatters.
2. **Goal mapping is loose.** G7 (edit-JSON-rerun) maps to "edit a fixture, re-render, see new display"; G8 (red/green honesty) maps to render-snapshot / visual assertion correctness. Architect must adapt the goal-verification methods for a UI during phase expansion — do not rewrite the goals, adapt the verification.
3. **Market-data UI policy.** Always show change direction + delta %, never just snapshot values — bake this into the formatting primitives as a tested scenario.
4. **Lowest priority for the trust thesis.** The user pain ("AI can't fix bugs, dashboards as trust") is sharpest for computational services. Frontend benefits less from primitive extraction. Consider whether a lighter MVR-style treatment (render gate + view-model tests, skip heavy primitive extraction) is the right scope — flag to architect.
