# Open Questions — PO Sign-Off Required

**Parent:** `../2026-05-22-deep-module-ddd-with-dashboards.md`
**Date:** 2026-05-22  **Author:** Architect

Each question is either a decision that blocks a phase from starting or a scope decision that changes the estimate. Recommend defaults are provided — PO can approve defaults to unblock without reading the details.

---

## Q-1 — `packages/` directory creation: approve monorepo restructure?

**Blocking:** Phase 2 cannot start without this.

**Decision needed:** Create `packages/primitives/<name>/` and `packages/modules/<name>/` top-level directories alongside the existing `packages/shared-types/`, `packages/shared-db/`, `packages/shared-config/`.

This requires updating `pnpm-workspace.yaml` to include `packages/primitives/*` and `packages/modules/*` as workspace packages.

**Risk:** Low. The existing `packages/` structure already uses pnpm workspaces. Adding two new workspace scopes does not affect any existing service.

**Recommended default:** Approve. Create the workspace scopes in Phase 0 clean-up, before Phase 1 starts.

**Architect recommendation:** APPROVE.

---

## Q-2 — `sector` module: split into `sector-analytics` + `market-context` or keep as one module?

**Blocking:** Phase 3 `sector` work cannot start without scope decision.

**Decision needed:**  
- Option A (recommended): Split into `sector-analytics` (sector comparison, rotation, correlation) + `market-context` (supply chain, legal risk, climate, energy, pharma, credit flow, leadership, crisis). 11 modules total → 12 modules.  
- Option B: Keep as one `sector` module but enforce bounded context cohesion via contract.md. Faster but makes M-1 (cohesion) permanently L1 for this module.

**Risk of Option A:** Renaming imports across ~14 tool handler files. Architect estimates ~3-4h dev time for the rename.  
**Risk of Option B:** `sector` remains architecturally unsound; harder to test in isolation; M-1 will never reach L2.

**Recommended default:** Option A (split). The `market-context` bounded contexts (legal risk, climate, pharma, etc.) have nothing to do with sector rotation analytics. They need to be separated to be independently testable.

**Architect recommendation:** APPROVE Option A.

---

## Q-3 — dashboard location: `apps/mcp-server/dashboard/` or `docs/dashboards/`?

**Blocking:** Phase 5 sandbox build location decision. Not blocking Phase 1 pilot (use mcp-server-local for pilot).

**Decision needed:**  
- Option A: `apps/mcp-server/dashboard/` — co-located with the service; one service's dashboard. Easy to start.  
- Option B: Top-level `docs/dashboards/` — cross-service from Day 1; enables `apps/kinh-dich-service/`, `apps/technical-analysis/` dashboards under the same master index.

**Impact on sandbox-kit:** If Option B, `sandbox-kit` is already in `packages/primitives/` so it can serve all services without moving. Only the output location of `render.ts` changes.

**Recommended default:** Start with Option A for Phase 1 pilot. Migrate to Option B in Phase 5 when multi-service coverage is needed. `render.ts` can accept an `--output-dir` flag to switch.

**Architect recommendation:** APPROVE Option A for Phase 1; revisit at Phase 5 start.

---

## Q-4 — `backtesting` duplicate registrar: intentional or bug?

**Blocking:** Phase 1 CONTRACT.md for `backtesting` cannot be written without knowing if `registerBacktestTools` and `registerBacktestQueryTools` are genuinely distinct.

**Decision needed:** Dev-mcp-server (or a code-janitor task) to verify whether these two registrars import from the same underlying `backtestTools.js` and whether both are needed.  
- If duplicate: remove one registrar before writing CONTRACT.md.  
- If intentional (read vs write tools): document the separation in CONTRACT.md.

**Risk of proceeding without decision:** CONTRACT.md documents a double-registration that may break the MCP server at startup if both registrars register the same tool name.

**Recommended default:** Dispatch code-janitor to inspect before Phase 1 `backtesting` contract. This is a 30-min investigation, not a sprint task.

**Architect recommendation:** INVESTIGATE FIRST (block Phase 1 `backtesting` work pending answer).

---

## Q-5 — edit-and-rerun sandbox server: local-only or accessible via Claude?

**Blocking:** Phase 6 L3/L4 dashboard interaction spec.

**Decision needed:** The edit-and-rerun interaction requires a small HTTP server (`bun run sandbox-server`). Options:  
- Option A: Local-only — user must run `bun run sandbox-server` in a terminal before clicking "Rerun". Simpler, no network exposure.  
- Option B: The server is auto-started by Claude as a background tool (via ops agent) so the user never touches the terminal.

**Risk of Option A:** User is non-technical — asking them to run a command creates friction. But this is a Phase 6 feature (not until L3/L4), and by then the team can handle auto-start.  
**Risk of Option B:** Background process management adds complexity; Claude agent spawn for every rerun is expensive.

**Recommended default:** Option A for Phase 6. Document that "Rerun" requires the sandbox server running. Auto-start can be added as Phase 7 improvement.

**Architect recommendation:** APPROVE Option A.

---

## Q-6 — `analysis` module scope: keep as separate module or merge into `market-data`?

**Blocking:** Phase 3 module layout.

**Decision needed:** The `analysis` module (`sequential_market_analysis`) is currently a thin wrapper that calls TA, macro, and news tools sequentially. It is arguably an application-layer use case (composing modules) rather than a bounded-context module of its own.  
- Option A: Keep as `modules/analysis` — a "meta-analysis" module that composes TA + macro + news primitives.  
- Option B: Move to an application use case in `apps/mcp-server/src/application/usecases/sequentialAnalysis.ts` — it is orchestration, not a bounded context.

**Impact:** Option B means one fewer module in `packages/modules/`. The domain type leak (`AnalysisThought`) is resolved in either option by creating the DTO translator.

**Recommended default:** Option B (application use case). `sequential_market_analysis` is orchestration logic, not a domain capability with its own ubiquitous language. It belongs in the application layer.

**Architect recommendation:** APPROVE Option B.

---

## Q-7 — `system` module scope: keep tools like `registerSmartCompactTool` at all?

**Blocking:** Phase 3 `system` barrel split.

**Decision needed:** Some tools in the `system` barrel are agent-internal tools (`registerSmartCompactTool`, `registerCoordinationTools`) that are called by Claude agents, not by the user. These are not domain tools — they are infrastructure for the agent-team's internal operations.  
- Option A: Keep in `system-ops` module but clearly mark as "agent-internal" in contract.md.  
- Option B: Extract to a separate `modules/agent-tools` bounded context.

**Recommended default:** Option A for now (reduce split complexity). Mark as agent-internal in contract.md. Revisit in Phase 6.

**Architect recommendation:** APPROVE Option A.

---

## Q-8 — Phase timeline: prioritize coverage speed or architecture correctness?

**Blocking:** Sprint planning. Does not block Phase 0-1.

**Decision needed:** Phases 2-4 run in parallel (Track A/B/C). The faster path (14-18 sprints total) requires parallel agent work which carries higher risk. The safer path (21-29 sprints, sequential) is slower but lower risk.

**Recommended default:** Parallel Tracks A/B/C starting after Phase 1 validation, BUT with a gate: no more than 2 primitives extracted per sprint in the first 3 Phase 2 sprints (validation window). If no regressions, ramp to 8 per sprint.

**Architect recommendation:** APPROVE parallel tracks with 3-sprint ramp-up gate.

---

## Q-9 — Language decision for Go microservices in the three-tier model

**Context:** `apps/stock-price` and `apps/alert-engine` are written in Go. The three-tier model and sandbox-kit are TypeScript/Bun-based. Go services cannot directly use the TypeScript sandbox-kit.

**Decision needed:** Apply the three-tier model to Go services or leave them out of scope?  
- Option A: Out of scope for Go services. Apply three-tier only to TypeScript services. Go services are already correctly scoped (single-concern).  
- Option B: Apply principles (not tooling) to Go services — write Go-native scenario JSON tests; no TypeScript sandbox-kit for Go.

**Recommended default:** Option A. Go services (`stock-price`, `alert-engine`) are already correctly scoped microservices with DDD layers. They do not have the megabarrel problem. Exclude from this refactor's scope.

**Architect recommendation:** APPROVE Option A (Go services out of scope).

---

## Q-10 — `frontend` app: in scope or out of scope?

**Context:** `apps/frontend` exists in the repo. It is not listed in the current ARCHITECTURE.md services. Status unknown.

**Decision needed:** Is `apps/frontend` a deployed service or a stub/experiment?

**Recommended default:** Out of scope until ops/dev confirms status. If it is a deployed service, add to ARCHITECTURE.md and classify separately.

**Architect recommendation:** INVESTIGATE — 10-minute check by ops agent before Phase 0 completes.

---

## Sign-Off Summary (for PO)

| Q | Question | Recommended default | Blocks |
|---|---|---|---|
| Q-1 | Create `packages/primitives/` + `packages/modules/` workspace | APPROVE | Phase 2 |
| Q-2 | Split `sector` into 2 modules | APPROVE Option A | Phase 3 |
| Q-3 | Dashboard location | APPROVE Option A (migrate Phase 5) | Phase 5 |
| Q-4 | Backtesting duplicate registrar | INVESTIGATE FIRST | Phase 1 backtesting |
| Q-5 | Edit-and-rerun server | APPROVE Option A (local only) | Phase 6 |
| Q-6 | `analysis` module scope | APPROVE Option B (app use case) | Phase 3 |
| Q-7 | `system` agent tools | APPROVE Option A (agent-internal label) | Phase 3 |
| Q-8 | Phase timeline | APPROVE parallel with 3-sprint ramp | Sprint planning |
| Q-9 | Go services scope | APPROVE Option A (out of scope) | Phase 2 |
| Q-10 | `frontend` app status | INVESTIGATE | Phase 0 close |

**Approving all 10 recommended defaults unblocks Phase 0 and Phase 1 immediately.**
