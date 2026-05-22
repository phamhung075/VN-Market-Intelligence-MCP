# Validation Rituals

**Parent:** `../2026-05-22-deep-module-ddd-with-dashboards.md`
**Date:** 2026-05-22  **Author:** Architect

---

## 1. Measurement Cadence

| Metric group | Cadence | Trigger |
|---|---|---|
| P-1, P-2, P-5, M-1, M-3, M-5, S-5 (structural) | Per PR | ESLint + import-graph check on every PR |
| P-4, M-4, S-3 (scenario coverage) | Per PR (Phase 6); per sprint (Phase 2-5) | `bun run trace` in CI |
| P-3 (reusability) | Monthly | Architect reviews caller count |
| P-6, M-6 (docs freshness) | Per PR (Phase 6); weekly (Phase 1-5) | Git log freshness check |
| S-1, S-2 (composition root) | Per PR | Import-graph analyzer |
| S-4 (deployment health) | Nightly | system-auditor tier-1 cycle |
| X-1 (bug count) | Per sprint close | Architect notebook + PM sprint summary |
| X-2 (tech debt) | Per sprint close | Architect notebook |
| X-3 (doc freshness) | Weekly | Architect freshness check |
| X-4 (sandbox uptime) | Per PR (Phase 6); weekly (Phase 5) | `bun run dashboard` |

---

## 2. Owner Per Metric

| Metric | Author | Reviewer | Enforcer |
|---|---|---|---|
| P-1 SRP | developer | Architect | ESLint (L4) |
| P-2 Port-Driven | developer | Architect | CI import-graph (L4) |
| P-3 Reusability | Architect | — | Master dashboard (L4) |
| P-4 Scenario Coverage | developer | QA | CI coverage gate (L4) |
| P-5 Shape Compliance | developer | Architect | AST lint (L4) |
| P-6 Docs Completeness | developer | Architect | CI staleness check (L4) |
| P-7 Dashboard Presence | developer | QA | Dashboard CI build (L4) |
| M-1 BC Cohesion | Architect (design) + developer | Architect | Import-graph lint (L4) |
| M-2 Primitive Composition | developer | Architect | Static inline-logic counter (L4) |
| M-3 No Cross-Module Imports | developer | QA | Module-boundary lint (L4) |
| M-4 Scenario Coverage | developer | QA | Dashboard coverage gate (L4) |
| M-5 Shape Compliance | developer | Architect | AST lint (L4) |
| M-6 Docs Completeness | developer | Architect | CI staleness check (L4) |
| M-7 Dashboard Presence | developer | QA | Dashboard CI build (L4) |
| S-1 Composition Root | developer | Architect | CI scan (L4) |
| S-2 Module Composition | developer | Architect | Import-graph analyzer (L4) |
| S-3 E2E Scenario Coverage | developer | QA | CI per-route gate (L4) |
| S-4 Deployment Health | ops/developer | system-auditor | system-auditor nightly (L4) |
| S-5 No Domain Leakage | developer | Architect | TypeScript path aliases (L4) |
| S-6 Dashboard Presence | developer | QA | Dashboard CI build (L4) |
| X-1 Bug Count | Architect | PM | Git log auto-extract (L4) |
| X-2 Tech Debt | Architect | PM | Notebook auto-extract (L4) |
| X-3 Doc Freshness | Architect | — | CI freshness check (L4) |
| X-4 Sandbox Uptime | QA | — | `bun run dashboard` in CI (L4) |

---

## 3. Escalation Triggers

These are automatic escalation rules — they do not require human judgment to activate:

| Trigger | Condition | Action | Agent |
|---|---|---|---|
| Metric regression | Any metric drops a level (e.g., L2 → L1) between sprints | PM blocks sprint task assignment on affected module; Architect called for root-cause brief | architect |
| Coverage drop | P-4 or M-4 drops below 80% | Red banner injected in dashboard; PR blocked | QA |
| Domain import detected | Interface layer imports from domain/services directly | PR rejected; developer notified with specific file + line | QA (CI gate) |
| Health endpoint failure | `/health` returns non-200 or DB unhealthy for >15 min | BUG channel alert; system-auditor dispatches to ops | system-auditor |
| Contract.md stale | Source changed >7 days ago without contract.md update | PR comment warning; becomes PR blocker at L4 | CI (L4) |
| Sandbox broken | `bun run dashboard` exits non-zero | BUG channel alert; PR blocked at L4 | QA / CI |
| Bug re-occurrence | git log shows fix commit for the same bug/module a second time | PM escalates to Architect for structural review before any new fix | PM (policy from memory: recurring bug escalation rule) |

---

## 4. Master Dashboard as User Trust Layer

The user is non-technical and cannot read TypeScript. The master dashboard is their trust interface.

**What the user sees after each sprint:**
1. Open `apps/mcp-server/dashboard/index.html` in browser (no setup, static HTML).
2. Three panels: Primitives (N green/yellow/red), Modules (N green/yellow/red), Microservices (N green/yellow/red).
3. Click any card → see what the system does in plain language.
4. If any card is RED → system is alerting about something. Read the card to understand what.
5. Coverage badge ≥80% → trust the stories. Red banner → do not fully trust that module's stories yet.

**What the user does NOT need to understand:**
- TypeScript code
- DDD layers
- Metric names (P-1, M-3, S-5)
- Phase numbers

**Agent responsibility:** After each sprint that advances a phase, dev-team posts a one-line summary to the WORK channel: "kinhdich module dashboard now live — see apps/mcp-server/dashboard/kinhdich.html". The user opens it and can validate that stories match expectations.

---

## 5. Measurement Procedure Summary (Quick Reference)

To measure any metric in the field without this document:

```bash
# P-1 SRP — count exports
grep -c "^export function\|^export class" packages/primitives/<name>/src/index.ts

# P-2 Port-Driven — detect infra imports
grep -rn "from.*infrastructure\|Bun\.env\|process\.env\|new.*Repository" packages/primitives/<name>/src/

# P-3 Reusability — count callers
grep -rn "from.*packages/primitives/<name>" apps/ packages/modules/ | wc -l

# M-3 No cross-module imports
grep -rn "from.*packages/modules/" packages/modules/<name>/src/

# S-5 No domain leakage
grep -rn "from.*domain/services" apps/<service>/src/interface/ apps/<service>/src/application/

# S-1 Composition root check
grep -rn "new.*Repository\|new.*Store\|new.*Adapter" apps/<service>/src/ | grep -v "bootstrap.ts\|index.ts"

# X-4 Sandbox uptime
cd apps/mcp-server && bun run dashboard
```
