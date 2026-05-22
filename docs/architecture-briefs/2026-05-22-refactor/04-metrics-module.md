# Metrics — Module Tier

**Parent:** `../2026-05-22-deep-module-ddd-with-dashboards.md`
**Date:** 2026-05-22  **Author:** Architect

---

## Maturity Scale (same across all tiers)

- **L0** = current broken state  
- **L1** = minimal compliance (started)  
- **L2** = target baseline (acceptable for production)  
- **L3** = strong  
- **L4** = excellent (full automation, lint enforcement)

---

## M-1 — Bounded Context Cohesion

**What it measures:** Whether all primitives composed by the module belong to the same domain capability. A module with sub-contexts from 3 different domains fails this metric.

**Measurement procedure:**
1. List all primitives imported by `packages/modules/<name>/`.
2. For each primitive, assign a domain label (kinh-dich / TA / BCTC / macro / alert / news / portfolio / sector / cross-cutting).
3. Pass if all primitives share the same or directly-adjacent domain label.
4. Fail if primitives span 2+ unrelated domains.
5. Concrete example of current failure: `sector` module imports `climateImpactMapper`, `legalRiskDetector`, `pharmaEventMapper` — three domains unrelated to sector analytics.

| Level | Definition |
|---|---|
| L0 | Module contains primitives/logic from 3+ unrelated domain areas (current `sector`, `system` state) |
| L1 | Reduced to 2 domain areas; split plan documented |
| L2 | All primitives belong to one domain (or directly adjacent sub-domain) |
| L3 | contract.md declares bounded context in one sentence with explicit domain boundary |
| L4 | Import graph linter flags cross-domain imports automatically |

**Owner:** Architect at module design; QA at PR review.  
**When measured:** At module extraction (Phase 3); nightly at L4.

---

## M-2 — Primitive Composition Score

**What it measures:** Percentage of domain logic that flows through composed primitives rather than being written inline in the module.

**Measurement procedure:**
1. Scan `packages/modules/<name>/src/` for business logic not calling a primitive (e.g., raw calculation loops, direct data transforms not delegated to a primitive).
2. Target: 0 lines of business logic outside primitive calls.
3. Allowed in module: DI wiring, input validation at module boundary, orchestration of 2+ primitives.
4. Violation: any computation that should be a primitive (e.g., inline RSI formula in the `technical-analysis` module instead of calling `ta-rsi-calculator`).

| Level | Definition |
|---|---|
| L0 | Module contains all domain logic inline; no primitives |
| L1 | Some primitives extracted; >30% of domain logic still inline |
| L2 | 100% of domain logic delegated to primitives; module only orchestrates |
| L3 | Module unit tests mock at primitive boundary only; no test touches internal logic |
| L4 | Static analysis measures inline-logic count; 0 inline logic lines enforced at CI |

**Owner:** Developer at build; Architect at review.  
**When measured:** Phase 3 module extraction (L2 gate); CI continuously at L4.

---

## M-3 — No Cross-Module Imports

**What it measures:** Whether the module imports from any other `packages/modules/` sibling.

**Measurement procedure:**
1. `grep -rn "from.*packages/modules/" packages/modules/<name>/src/` — any match is a violation.
2. Allowed: imports from `packages/primitives/` and `packages/shared-types/`.
3. Not allowed: imports from `packages/modules/other-module/`.
4. Cross-module communication must happen at the application layer (use cases in `apps/`).

| Level | Definition |
|---|---|
| L0 | Module imports from sibling module (e.g., `alerts` module imports from `news-analysis` module) |
| L1 | 1-2 cross-module imports remain; tracked as tech debt |
| L2 | Zero cross-module imports; any cross-cutting logic moved to a shared primitive |
| L3 | Import boundaries tested: module builds in isolation (no sibling module in project) |
| L4 | Module-boundary lint rule in CI; zero-tolerance |

**Owner:** Developer at extraction; QA at PR.  
**When measured:** At extraction (L2 gate); every PR (L4 gate).

---

## M-4 — Module Scenario Coverage

**What it measures:** Percentage of the module's public application service methods covered by at least one scenario JSON.

**Measurement procedure:**
1. Count public methods in `packages/modules/<name>/src/index.ts`.
2. Count scenario files in `packages/modules/<name>/scenarios/`.
3. Each scenario JSON exercises one module-level use case (may compose multiple primitive calls).
4. Target: ≥1 happy-path + ≥1 error scenario per public method.

| Level | Definition |
|---|---|
| L0 | No module-level scenarios |
| L1 | At least 1 scenario for the most-used method |
| L2 | All public methods: ≥1 happy-path scenario + ≥1 error/edge scenario |
| L3 | ≥3 scenario variants per public method; all scenarios exercise composition (verify primitive calls) |
| L4 | Module scenario coverage % tracked in master dashboard; drop from baseline blocks PR |

**Owner:** Developer writes scenarios; QA validates; dashboard shows coverage.  
**When measured:** Phase 3 (L2); Phase 5 coverage push (L3); L4 in Phase 6.

---

## M-5 — Shape Compliance

**What it measures:** Whether the module's `index.ts` barrel exports only application service methods and DTOs (no domain types, no primitive internals).

**Measurement procedure:**
1. Parse exports from `packages/modules/<name>/src/index.ts`.
2. Allowed: application service functions (or class with public methods), input/output DTO types.
3. Disallowed: domain entity types, primitive internals, infrastructure references.
4. Example current violation: `sector` barrel exposing `supplyChainAnalyzer` function directly (internal domain logic, not application service).

| Level | Definition |
|---|---|
| L0 | Module barrel exports internal domain types and primitive functions directly |
| L1 | Barrel cleaned for 50% of exports; remaining tagged for Phase 4 |
| L2 | Only application service + DTOs exported; no domain type leaks |
| L3 | Shape conformance documented in contract.md for the module |
| L4 | Shape validated by AST lint tool in CI |

**Owner:** Architect specifies shape; developer implements; CI enforces.  
**When measured:** Phase 3 (L2); L4 in Phase 6.

---

## M-6 — Documentation Completeness

**What it measures:** Whether `contract.md` exists at module level with bounded context declaration, service API, DTOs, boundary statement.

**Measurement procedure:**
1. `ls packages/modules/<name>/contract.md` — existence check.
2. Must contain: bounded context (1 sentence), list of application service methods, input/output DTO shapes, what module does NOT do, which primitives it composes.
3. Staleness: same git-log check as primitive tier.

| Level | Definition |
|---|---|
| L0 | No contract.md for module |
| L1 | contract.md stub with bounded context sentence only |
| L2 | contract.md covers all 5 required sections |
| L3 | contract.md updated in same commit as any public API change |
| L4 | CI staleness check + contract-links reviewed in PR template |

**Owner:** Developer authors; Architect approves; CI enforces staleness at L4.  
**When measured:** Phase 1 (contract write); continuously at L4.

---

## M-7 — Dashboard Presence

**What it measures:** Whether the module has a sandbox dashboard rendering its scenario compositions.

**Measurement procedure:**
1. `ls packages/modules/<name>/scenarios/` — has scenario files.
2. `sandbox-kit` renderer produces `packages/modules/<name>/dashboard.html`.
3. Module card with composition trace appears in master dashboard.
4. Three-level zoom: clicking a module card shows which primitives were called in which order.

| Level | Definition |
|---|---|
| L0 | No module sandbox |
| L1 | Scenarios exist; not rendered |
| L2 | Module dashboard renders with composition trace (primitive call sequence visible) |
| L3 | Dashboard shows actual vs expected output diff per scenario; edit-and-rerun works |
| L4 | Module dashboard auto-rebuilds on CI; broken render blocks deployment |

**Owner:** Developer builds sandbox; QA verifies composition trace accuracy.  
**When measured:** Phase 2 (L2 gate); Phase 5 (L3); Phase 6 (L4).

---

## Summary Table

| Metric | L2 is... | L4 enforcement |
|---|---|---|
| M-1 Bounded Context Cohesion | All primitives in one domain | Import graph lint rule |
| M-2 Primitive Composition Score | 100% domain logic via primitives | Static inline-logic counter |
| M-3 No Cross-Module Imports | Zero sibling module imports | Module-boundary lint rule |
| M-4 Scenario Coverage | All methods: happy + error scenarios | Dashboard coverage gate |
| M-5 Shape Compliance | App services + DTOs only | AST lint tool |
| M-6 Docs Completeness | contract.md with all 5 sections | CI staleness check |
| M-7 Dashboard Presence | Scenarios + composition trace rendered | Dashboard CI build gate |
