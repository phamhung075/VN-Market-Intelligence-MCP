# Architecture Brief: Deep Module + DDD — Three-Tier Refactor Plan

**Date:** 2026-05-22  **Author:** Architect  **Version:** 2.0 (full plan)
**Status:** READY FOR PO REVIEW — open questions in `11-open-questions.md`

---

## Document Index

| File | Contents |
|---|---|
| This file | Master index, concept overlay, Pocock mapping, quick-start summary |
| `2026-05-22-refactor/01-current-state.md` | Re-audit: three-tier classification of all 12 modules, 10 microservices, 84 domain service files |
| `2026-05-22-refactor/02-target-state.md` | Proposed 48 primitives, 11 modules, final apps/ layout, dependency graph, deletion + split list |
| `2026-05-22-refactor/03-metrics-primitive.md` | 7 primitive metrics with L0-L4 maturity ladder per metric |
| `2026-05-22-refactor/04-metrics-module.md` | 7 module metrics with L0-L4 maturity ladder |
| `2026-05-22-refactor/05-metrics-microservice.md` | 6 microservice metrics with L0-L4 maturity ladder |
| `2026-05-22-refactor/06-metrics-cross-cutting.md` | 4 cross-cutting metrics + current bug inventory (10 bugs) + debt inventory (7 items) |
| `2026-05-22-refactor/07-phases.md` | 7-phase plan with entry/exit criteria, estimates, risk callouts |
| `2026-05-22-refactor/08-sandbox-dashboards.md` | Sandbox-kit spec, narrator API, renderer, three-level zoom, edit-rerun, master dashboard layout |
| `2026-05-22-refactor/09-bug-mapping.md` | 10 bugs mapped to tier + phase + metric that makes them impossible to recur |
| `2026-05-22-refactor/10-validation-rituals.md` | Measurement cadence, owner per metric, escalation triggers, 5-command quick-reference |
| `2026-05-22-refactor/11-open-questions.md` | 10 open decisions for PO; recommended defaults; sign-off table |

---

## 0. Grounding

All volatile counts are intentionally pointers, not hardcoded numbers:

- Tool count and sprint state: `docs/data/project-stats.json`
- Services, agents, zones, channels: `docs/data/system-map.json`
- Module barrel paths: `apps/mcp-server/src/interface/mcp/tools/<module>/index.ts`
- Domain services megabarrel: `apps/mcp-server/src/domain/services/index.ts`

---

## 1. Three-Tier Model (locked)

```
packages/primitives/<name>/    ← smallest, reusable, SRP units (1 operation = 1 verb)
packages/modules/<name>/       ← DDD bounded contexts, compose primitives via DI
apps/<name>/                   ← microservices, compose modules via composition root
```

**Verbal model (for the user):** "A microservice is made of modules. A module is made of primitives. A primitive is one operation."

**Primitive rules (non-negotiable):**
- Infra-free — no hardcoded Postgres/Redis/HTTP-client imports
- Config-free — no `process.env` or `Bun.env` reads inside the unit
- Neighbor-free — no imports from sibling primitives or modules
- Port-driven — depends only on interfaces, all DI via constructor

---

## 2. Pocock's Deep Module Mapped to DDD

This refactor applies an existing principle (Pocock's Deep Module) to an existing methodology (DDD). No new methodology is introduced.

| Pocock concept | DDD equivalent | Refactor unit |
|---|---|---|
| Grooming / Design Concept | Strategic DDD context mapping | Bounded context = one module in `packages/modules/` |
| Ubiquitous Language | Already in DDD | Per-module `contract.md` glossary section |
| Interface-First / Tiny Public API | Application Service + DTO | Module `index.ts` — only application service + DTOs |
| TDD loop | Contract test at app-service boundary | Scenario JSON per use case → narrated test |
| Grey Box (hidden impl) | Hexagonal Ports & Adapters | Port in `domain/repositories/`, adapter in `infrastructure/` |
| Deep implementation | Primitive composition | All domain logic in primitives; module only orchestrates |

**Core principle:** The deep module pattern is already present in DDD. The audit + shrink surfaces what was always true: wide public APIs = design debt. The narrower the barrel surface, the harder it is to break callers.

**The dashboard layer exists for one reason:** the user is non-technical. HTML pages render what the system does in human language, not TypeScript. They are generated from scenario traces — if there is no scenario, there is no page.

---

## 3. Current State Summary

From `01-current-state.md`:

- **12 module barrels:** 1 GREEN, 6 YELLOW, 4 RED (by export count), 1 RED (by domain-type leak)
- **Domain services megabarrel** (`domain/services/index.ts`): 139 lines, 84 service files, 10+ direct imports from interface layer — **Priority-1 structural violation**
- **84 domain service files** to be classified: 8 in kinhDich subfolder, 10 in financial-reports subfolder, 9 in macro subfolder, ~54 flat files
- **5 DDD violations** identified (see `01-current-state.md` section 7)
- **10 microservices:** 9 correctly scoped; `mcp-server` is the sole over-sized service

---

## 4. Target State Summary

From `02-target-state.md`:

- **~48 named primitives** in `packages/primitives/` — grouped by domain
- **11 named modules** in `packages/modules/` — bounded contexts, composing primitives
- **10 microservices unchanged** in `apps/` — `mcp-server` becomes thin composition root
- **Deleted:** domain services megabarrel, 2 infra files masquerading as domain, all direct domain imports from interface layer
- **Split:** `sector` → `sector-analytics` + `market-context`; `macro` → `macro-core` + `macro-signals`; `system` → `system-ops`

---

## 5. Metrics Summary

From `03-metrics-primitive.md`, `04-metrics-module.md`, `05-metrics-microservice.md`, `06-metrics-cross-cutting.md`:

- **7 primitive metrics** (P-1 through P-7)
- **7 module metrics** (M-1 through M-7)
- **6 microservice metrics** (S-1 through S-6)
- **4 cross-cutting metrics** (X-1 through X-4)
- **Total: 24 auditable metrics**
- **24 × 5 levels = 120 measurement definitions** — all concrete (grep command or procedure specified per metric)

---

## 6. Phase Summary

From `07-phases.md`:

| Phase | Goal | Duration |
|---|---|---|
| Phase 0 | Baseline audit — measure all 24 metrics at current L-level | 1 sprint |
| Phase 1 | Pilot — kinh-dich from L0 to L4 across all three tiers | 2-3 sprints |
| Phase 2 (Track A) | Extract all ~48 primitives to L2 | 4-6 sprints |
| Phase 3 (Track B) | Rebuild all 11 modules at L2 | 4-6 sprints (parallel) |
| Phase 4 (Track C) | Rewire apps/ composition roots at L2 | 4-5 sprints (parallel) |
| Phase 5 | Coverage push — all tiers to L3; dashboards live | 3-4 sprints |
| Phase 6 | Excellence — L4 automation + lint enforcement | 3-4 sprints |
| **Total** | | **14-18 sprints (parallel tracks)** |

---

## 7. Bug Payoff Summary

From `09-bug-mapping.md`:

10 current bugs mapped. Top 5 by structural impact:

1. **BUG-008** (Interface bypasses application layer — 10+ files): resolved by S-5 at L2 + TypeScript path aliases at L4. This single fix removes the root cause of all domain-type leaks.
2. **BUG-001** (ENOENT dailyDashboardJob + janitor path hardcode): resolved by P-2 port-driven at L2 + S-1 composition root at L2. Structurally impossible to recur.
3. **BUG-005** (vnstock jobs crashed silently for 4 days): resolved by S-4 deployment health at L2 + system-auditor nightly at L4. Silent crashes become impossible.
4. **BUG-007** (AnalysisThought domain type leak in barrel): resolved by P-5 shape compliance at L2; AST lint at L4 makes it compile-time impossible.
5. **BUG-004** (HPG cash flow all-zeros — missing fallback): resolved by P-4 scenario coverage at L2 with industry-variant scenarios.

---

## 8. Open Questions (sign-off required)

From `11-open-questions.md` — 10 questions, all with recommended defaults:

**Approving all 10 recommended defaults unblocks Phase 0 and Phase 1 immediately.**

Top 3 that actually require a decision (not just rubber-stamp):
1. **Q-2**: Split `sector` barrel into 2 modules or keep as 1? (Recommended: split)
2. **Q-6**: Is `analysis` a module or an application use case? (Recommended: use case)
3. **Q-4**: Investigate `backtesting` duplicate registrar before Phase 1 contract write.

---

## 9. User Trust Layer (non-technical summary)

After Phase 5, the user can open `apps/mcp-server/dashboard/index.html` in a browser and see:
- Three panels: Primitives, Modules, Microservices — each with green/yellow/red health badges.
- Click any card → plain-language stories: "System computed RSI for HPG. Result: overbought (72.4). Signal sent."
- If any badge is red → the system is warning about something. Read the card.
- Coverage ≥80% on every card → trust the stories.

The user does not read TypeScript. The user does not read metric names. The user reads stories.
