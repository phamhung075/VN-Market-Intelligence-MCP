# Metrics — Microservice Tier

**Parent:** `../2026-05-22-deep-module-ddd-with-dashboards.md`
**Date:** 2026-05-22  **Author:** Architect

---

## Maturity Scale (same across all tiers)

- **L0** = current broken state  
- **L1** = minimal compliance (started)  
- **L2** = target baseline  
- **L3** = strong  
- **L4** = excellent (full automation)

---

## S-1 — Composition Root Centralization

**What it measures:** Whether all DI wiring for the microservice happens in exactly one file (the composition root), and nowhere else.

**Measurement procedure:**
1. Identify composition root: `apps/<service>/src/index.ts` or `apps/<service>/src/bootstrap.ts`.
2. Count files in `apps/<service>/src/` that instantiate concrete infrastructure classes (SQLite adapters, HTTP clients) outside the composition root.
3. Pass at L2: zero instantiation outside the composition root file.
4. Command: `grep -rn "new.*Repository\|new.*Store\|new.*Client\|new.*Adapter" apps/<service>/src/ --include="*.ts" | grep -v "index.ts\|bootstrap.ts"` — any result is a violation.

| Level | Definition |
|---|---|
| L0 | Concrete instantiation scattered across use cases, tool handlers, scheduler jobs (current mcp-server state) |
| L1 | 50%+ of instantiation consolidated; remainder tracked as debt |
| L2 | All DI wiring in one composition root file; no instantiation elsewhere |
| L3 | Composition root has tests verifying all ports are satisfied before server starts |
| L4 | Composition root file size limited (max 200 lines); over-budget alerts in CI |

**Owner:** Developer at rewire; Architect reviews.  
**When measured:** Phase 4 (L2 gate); CI at L4.

---

## S-2 — Module Composition Score

**What it measures:** Whether `apps/<service>/` contains zero business logic — only orchestration and module composition.

**Measurement procedure:**
1. Scan `apps/<service>/src/application/` and `apps/<service>/src/interface/` for inline domain calculations.
2. Any domain logic not delegated to a module is a violation.
3. Allowed in app layer: HTTP handler wiring, DTO mapping from HTTP request to module input, error response formatting.
4. Violation example: calling `computeRSI(prices)` inline in a use case instead of calling the `technical-analysis` module.

| Level | Definition |
|---|---|
| L0 | App layer contains domain logic (current: mcp-server interface layer imports domain/services directly) |
| L1 | Some domain logic moved to modules; >20% still in app layer |
| L2 | Zero business logic in `apps/<service>/src/`; 100% delegated to modules |
| L3 | App layer has integration tests that mock all modules at module boundary |
| L4 | Import-graph analyzer verifies app layer has zero direct domain imports |

**Owner:** Developer at Phase 4; QA at L3 integration tests.  
**When measured:** Phase 4 (L2 gate); L4 in Phase 6.

---

## S-3 — E2E Scenario Coverage

**What it measures:** Whether at least one end-to-end scenario exercises each microservice's full HTTP surface (request → module composition → response).

**Measurement procedure:**
1. List all HTTP routes in `apps/<service>/src/interface/`.
2. Count routes with at least 1 scenario JSON in `apps/<service>/scenarios/`.
3. E2E scenario uses in-memory port adapters (no real DB, no external API keys).
4. Scenario must exercise the full stack: HTTP handler → use case → module → primitive (via in-memory adapter).

| Level | Definition |
|---|---|
| L0 | No E2E scenarios for the microservice |
| L1 | ≥1 E2E scenario for the main "happy path" use case |
| L2 | ≥1 E2E scenario per HTTP route (happy path + 1 error) |
| L3 | ≥3 E2E scenarios per route; composition trace visible in dashboard |
| L4 | E2E coverage tracked per route; missing scenarios block deployment |

**Owner:** Developer writes scenarios; QA validates; dashboard displays coverage.  
**When measured:** Phase 4 (L2 gate); Phase 5 (L3); Phase 6 (L4).

---

## S-4 — Deployment Health

**What it measures:** Whether the microservice has a working Dockerfile, health-check endpoint, and observability instrumentation.

**Measurement procedure:**
1. `ls apps/<service>/Dockerfile` — existence.
2. `curl http://localhost:<port>/health` returns 200 within 3s.
3. Health endpoint reports: status, DB connection state, upstream service reachability.
4. `apps/<service>/src/infrastructure/observability/` has job metrics instrumentation.
5. Docker health check configured in `docker-compose.yml` for the service.

| Level | Definition |
|---|---|
| L0 | Dockerfile exists but health check absent or 503 in current deployment |
| L1 | Health endpoint returns 200; no dependency checks |
| L2 | Health endpoint checks DB + key upstreams; Docker health check configured |
| L3 | Observability metrics per job/route; circuit breaker states exposed on /health |
| L4 | system-auditor auto-reads /health at tier-1 cycle; regression alerts to BUG channel |

**Owner:** Developer deploys; ops monitors; system-auditor automates at L4.  
**When measured:** Per deploy (L2 gate); nightly system-auditor at L4.

---

## S-5 — No Domain Logic Leakage

**What it measures:** Whether the interface layer (tool handlers, HTTP handlers, schedulers) imports from domain services directly rather than through modules.

**Measurement procedure:**
1. `grep -rn "from.*domain/services" apps/<service>/src/interface/` — any match is a violation.
2. `grep -rn "from.*domain/services" apps/<service>/src/application/` — any match is a violation.
3. Only allowed path: `apps/<service>/src/application/` imports from `packages/modules/`.
4. For `apps/mcp-server` specifically: `grep -rn "from.*domain/services/index\|from.*domain/services/" src/interface/mcp/tools/` — current violations exist in all RED modules.

| Level | Definition |
|---|---|
| L0 | Interface layer directly imports from `domain/services/index.ts` (current mcp-server state for 10+ tool handler files) |
| L1 | Direct imports reduced; anti-corruption translators in Phase 3 partially inserted |
| L2 | Zero direct domain imports in interface layer; all calls go through application use cases |
| L3 | Import path for any domain service is physically impossible (domain/ not listed in tsconfig paths available to interface/) |
| L4 | TypeScript path alias configuration blocks cross-layer imports; compile error on violation |

**Owner:** Developer at Phase 3-4; Architect verifies.  
**When measured:** Phase 3 (translator insertion); Phase 4 (barrel shrink) = L2 gate; L4 post-Phase 6.

---

## S-6 — Dashboard Presence

**What it measures:** Whether the microservice has a whole-service sandbox dashboard showing its E2E scenarios.

**Measurement procedure:**
1. `ls apps/<service>/scenarios/` has scenario JSON files.
2. Microservice card appears in master dashboard with E2E trace.
3. Three-level zoom: microservice → module calls → primitive calls, all visible in one dashboard tree.
4. Edit-and-rerun: user can change scenario JSON and click "Rerun" to see new output without code change.

| Level | Definition |
|---|---|
| L0 | No microservice-level sandbox |
| L1 | E2E scenarios exist; not wired to dashboard |
| L2 | Microservice dashboard renders E2E traces; card in master dashboard with health badge |
| L3 | Three-level zoom works (service → module → primitive); composition fully visible |
| L4 | Edit-and-rerun interactive; broken scenarios auto-flagged on CI |

**Owner:** Developer builds; QA verifies three-level zoom; user validates narrative.  
**When measured:** Phase 5 (L2); Phase 6 (L3/L4).

---

## Summary Table

| Metric | L2 is... | L4 enforcement |
|---|---|---|
| S-1 Composition Root Centralization | All DI in one file | CI scan: 0 instantiation outside root |
| S-2 Module Composition Score | Zero business logic in app layer | Import-graph analyzer |
| S-3 E2E Scenario Coverage | ≥1 scenario per HTTP route | PR coverage gate per route |
| S-4 Deployment Health | DB + upstream checks on /health | system-auditor nightly |
| S-5 No Domain Logic Leakage | Zero direct domain imports in interface | TypeScript path aliases |
| S-6 Dashboard Presence | E2E traces + master dashboard card | Dashboard CI build gate |
