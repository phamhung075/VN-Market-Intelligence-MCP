---
title: "Scale Charter — macro-indicators"
date: "2026-05-24"
author: "po"
status: "READY"
service: "macro-indicators"
owner: "dev-macro-indicators"
language: "Go"
scale_order: "1 — FIRST scale target"
canonical_goals: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (G1–G12)"
---

# Scale Charter — `macro-indicators`

**Thin charter. The 12 completion goals (G1–G12), the Decision Matrix, the Security Clause, and the Baseline Metric Capture rules are CANONICAL in the pilot charter and are NOT restated here.**

→ **Canonical G1–G12 source:** `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md`
The 12 goals are language-agnostic and universal. Apply them verbatim, substituting `macro-indicators` for `technical-analysis` and `dev-macro-indicators` for `dev-technical-analysis` as goal owner.

→ **Phase plan:** `docs/architecture-briefs/2026-05-22-refactor/07-phases.md` · **QA gates:** `docs/architecture-briefs/2026-05-22-refactor/qa-gates/`
→ **Status tracking (replaces shared pilot-status.json):** `docs/data/refactor-status-macro-indicators.json`

---

## Service-Specific Deltas

| Field | Value |
|---|---|
| **Owner specialist** | `dev-macro-indicators` |
| **Language** | Go (TA-pivot §Q1 Go-first default — macro was already named the canonical scale target in pilot-charter §Decision Matrix outcome) |
| **Anti-scope-creep boundary** | `apps/macro-indicators/` ONLY. No primitive/module/composition-root work for any other service. |

### Current state — PARTIAL GO DDD, needs cleanup + scenario coverage

`apps/macro-indicators/` already has a Go scaffold (`go.mod`, `pkg/{domain,application,infrastructure,interface,module,primitive}`, `cmd/{sandbox,server}`, `dashboard/`). It is the closest non-pilot service to target state.

- **Go primitives already present** (`pkg/primitive/`): `macro_carry_trade_signal`, `macro_gold_direction_classifier`, `macro_investment_clock`, `macro_oil_impact_classifier`, `macro_usdvnd_direction_classifier`, `macro_yield_spread_signal`.
- **Go module already present** (`pkg/module/`): `macro_signals`.
- **Leftover TS scaffolding to remove** (G5): `package.json`, `bun.lock`, `tsconfig.json`, `node_modules/`, `src/`, `api/`, `__tests__/`, `scripts/`. Confirm none are live before deleting; the Go service is the production path.

This service is **rewire + complete**, not a from-scratch rebuild. Most of G1/G2/G3 structure exists — the work is scenario-JSON coverage (G1: ≥3 scenarios incl. ≥1 failure per primitive), dashboard wiring (G6–G8), the CI fence (G4), TS-scaffold deletion (G5), and the AI-fixability/regression/DoD goals (G10–G12).

### Candidate primitives (target-state §Macro signal primitives)
`macro-carry-trade-signal`, `macro-investment-clock`, `macro-ism-regime-signal`, `macro-yield-spread-signal`, `macro-pyramid-tier`, `macro-fed-liquidity-spread` — several already scaffolded above. Module candidates: `macro-core`, `macro-signals`.

### Key risks
1. **TS/Go duality** — both toolchains exist side-by-side; a stray TS callsite could mask incomplete Go coverage. Inventory live callers (G5) before deleting TS.
2. **External data inputs** — macro signals consume FRED/SBV/FX feeds. Per Security Clause, the sandbox process must run pure-function (scenario JSON in → trace out) with ZERO API keys / DB creds. Keep data-fetch in adapters, out of primitives.
3. **Data-source policy** — VIRA fetchable via VPS scraper; WiData OFF-LIMITS (paid); IMF/ADB/WB cross-check only. Do not wire forbidden sources into adapters.

### Why FIRST
Clean domain, primitives already named in `02-target-state.md`, Go scaffold already exists, and the pilot charter §Decision Matrix outcome explicitly names macro-indicators as the next target. Lowest-risk proof that the pilot pattern scales.
