---
sprint: pilot-p0
branch: task/p0-4-composition-root-plan
size: M
zone: apps/technical-analysis/
depends_on: []
blocks: []
pilot: technical-analysis
phase: 0
---

## TLDR
Audit the current `apps/technical-analysis/` codebase to identify what currently plays the composition-root role (wiring, setup, HTTP interface). Document findings and create a clean rewrite plan in `docs/architecture-briefs/2026-05-22-refactor/p0-4-composition-root-plan.md`. This is **read-only analysis** — no code changes in this phase.

## [PM] Planning Context
- **Zone:** `apps/technical-analysis/` (READ-ONLY)
- **Acceptance Criteria:**
  - [ ] Current `apps/technical-analysis/src/index.ts` audited and documented
  - [ ] Identify all 9 source files and their purpose (architect reported 9 files, no composition-root.ts exists)
  - [ ] Document what currently plays composition-root role (entry point, wiring, DI setup, HTTP interface)
  - [ ] Output file created: `docs/architecture-briefs/2026-05-22-refactor/p0-4-composition-root-plan.md`
  - [ ] Plan includes: current state analysis, proposed clean rewrite outline, file structure (modules → composition-root.ts), interface contract (OpenAPI or equivalent)
  - [ ] Plan is sufficient for Phase 1 dev-technical-analysis to execute composition-root rewrite (G3 goal)
- **Files to read first:**
  - `apps/technical-analysis/src/index.ts` (entry point)
  - `apps/technical-analysis/src/**/*.ts` (all 9 files — read to understand structure)
  - `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G3 (composition-root requirements)
  - `docs/ARCHITECTURE.md` (DDD microservice pattern — composition-root role)
- **Files to create:**
  - `docs/architecture-briefs/2026-05-22-refactor/p0-4-composition-root-plan.md` (analysis + plan)
- **Files to modify:** None
- **Dependencies:** None (read-only, no code changes)
- **Knowledge needed:**
  - DDD pattern: composition-root wires module + adapters, no business logic
  - G3 charter requirement: clean composition-root.ts with only imports + DI bindings + server startup
  - No `if` conditions on data, no calculations, no domain logic in composition root

## Details
This task is **owned by dev-technical-analysis** (zone owner for `apps/technical-analysis/`). The audit discovers what the current brownfield state is, which informs the Phase 1 rewrite task.

The output file must be structured as an architecture brief:
1. **Current State** — describe existing structure, identify composition-root-equivalent, list all 9 files
2. **Issues Found** — note any violations (business logic in startup, cross-module imports, etc.)
3. **Proposed Rewrite** — outline the clean structure per DDD: composition-root.ts → module wiring only
4. **Acceptance Gates** — reference G3 QA verification rules (no business logic, no cross-module imports in composition-root)

This is **phase 0 = planning only**. The actual rewrite is Phase 1 work (blocked on this plan).

## RETURN block
When task is complete:
```
DONE: Phase 0 composition-root audit complete
  - Files audited: 9 (all in apps/technical-analysis/src/)
  - Current structure documented
  - Clean rewrite plan created
FILES:
  - docs/architecture-briefs/2026-05-22-refactor/p0-4-composition-root-plan.md
NEXT: po
```
