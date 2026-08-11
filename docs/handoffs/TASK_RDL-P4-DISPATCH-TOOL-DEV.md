---
sprint: UC-RDL-P4
task_id: RDL-P4-DISPATCH-TOOL-DEV
branch: task/RDL-P4-dispatch-tool-dev
size: M
zone: apps/mcp-server/
depends_on: []
blocks: []
type: FEATURE
priority: P1
---

## TLDR

Implement the composite `dispatch_preflight` MCP tool (FR-1..FR-6/FR-8/FR-9 only — FR-7 doc cutover is split into UC-RDL-P4B-DOC-CUTOVER, forbidden this wave). The tool consolidates the router's Phase 0a/A/A.5/B preflight (presence claim/renew → orphan probe → roster read → optional intent claim) into a single server-side gateway call, eliminating 4 MCP round-trips and their race windows. Architect design complete; developer follows the file-level design decisions D-1..D-10 and builds per the provided file table.

## [PM] Planning Context

### Zone
`apps/mcp-server/` — exact directory per architect.

### Acceptance Criteria
- [ ] All 7 files created/modified per architect's file table (section 6, D-10 onwards):
  - serverSessionId.ts (NEW) — shared `SERVER_SESSION_ID` const
  - taskClaimTool.ts (EDIT) — import serverSessionId, remove inline IIFE
  - dispatchPreflight.ts (NEW) — usecase, composition + orchestration
  - dispatchPreflightTool.ts (NEW) — interface tool wrapper, Zod schema
  - coordinationTools.ts (EDIT) — register 7th tool, update header comment "6"->"7"
  - dispatchPreflight.test.ts (NEW) — all 6 test groups (FR-9)
  - tool-registry.json (REGENERATE) — run `bun scripts/gen-tool-registry.ts`, totalCount 183→184
- [ ] Unit tests pass: `bun test apps/mcp-server/src/application/usecases/__tests__/dispatchPreflight.test.ts`
- [ ] Tool-registry regeneration validates: `totalCount` incremented 183→184, `dispatch_preflight` entry in `"system"` group
- [ ] No edits to `coordinationStore.ts` or `coordination/index.ts` (PO correction verified live, non-goal #4)
- [ ] FR-6 independence verified: orphans/roster fetch errors do NOT null out claim result (unit test group 5)
- [ ] Integration round-trip verification (DEFERRED — gated on ops-approved container rebuild per EC-10):
  - claimed:true (fresh session, free claim_task_id)
  - re-entrant self-held (claimed:false + current_holder.owner_client_session matches caller)
  - peer-collision (claimed:false + current_holder.owner_client_session differs, not a DB error)
  - All 3 branches reproduced LIVE against the **running, rebuilt container** before DoD close

### Design Decisions to Follow (architect's D-1..D-10)
- **D-1 (response shape):** `presence.status` = "registered" | "renewed" | "error" | "skipped" (EC-6 adds 4th)
- **D-2 (no `Promise.race` timeout):** skip the `getCycleBootstrap` wrapper; use wall-clock `Date.now()` deltas, Zod layer times each sub-step independently
- **D-3 (presence outcomes):** `registered` = claimed:true; `renewed` = self-held + heartbeat succeeds; `error` = any other outcome + error string; `skipped` = register_presence=false
- **D-4 (claim outcomes):** claimed:true → `{attempted:true, claimed:true}`; self-held → `{attempted:true, claimed:false, current_holder, (no error if heartbeat ok)}` + tool itself calls heartbeatTask; peer-held → `{attempted:true, claimed:false, current_holder}` (no error key); DB error → `{attempted:true, claimed:false, error}` (no current_holder)
- **D-5 (generalize claim params):** `claim_task_id?: string`, `claim_task_kind?: TaskKind = "intent"` — zero new server logic, reuses store's existing task_kind param
- **D-6 (raw LockRow[] — FLAGGED):** return `orphans`/`roster` as raw store output (NOT the aliased `owner`/`created_at`/ISO `expires_at` shape the tool layer produces for `task_list_held` — risk: UC-RDL-P4B-DOC-CUTOVER must read RAW field names)
- **D-7 (TaskKind triplication):** pre-existing, now at 3 copies; acknowledged, out of L-bound, deferred
- **D-8 (tool-registry mechanism):** NEVER hand-edit; run `bun scripts/gen-tool-registry.ts` (atomic write, post-sanity-check), this is the only correct path
- **D-9 (EC-1 roster toggle):** DEFERRED — no `include_roster` param in V1
- **D-10 (SERVER_SESSION_ID extraction):** mandatory per constraint — extract to `serverSessionId.ts`, both tool files import it

### Files to Create
1. `apps/mcp-server/src/interface/mcp/tools/system/coordination/serverSessionId.ts`
   - Purpose: Extract shared `SERVER_SESSION_ID` diagnostic constant (pid + boot timestamp)
   - Reference: D-10, taskClaimTool.ts lines 25-30 current inline IIFE

2. `apps/mcp-server/src/application/usecases/dispatchPreflight.ts`
   - Purpose: Compositor usecase per D-2 (no Promise.race; wall-clock timing; independent sub-step failure handling per FR-6)
   - References: D-1 response shape, D-3 presence mapping, D-4 claim mapping, D-5 param generalization, taskClaimTool.ts / taskListHeldTool.ts / taskHeartbeatTool.ts call patterns (all synchronous)
   - Signature: `dispatchPreflight(dispatcher_role, owner_client_session, register_presence?, claim_task_id?, claim_task_kind?, claim_ttl_seconds?, claim_payload?) → DispatchPreflightResult`

3. `apps/mcp-server/src/interface/mcp/tools/system/coordination/dispatchPreflightTool.ts`
   - Purpose: Interface tool wrapper (Zod schema + server.tool() registration)
   - References: D-1/D-5 (schema literals), D-8 (describe() note: tool does NOT replace the 5 existing coordination tools for non-router callers)
   - Signature: Zod input schema matching FR-1 params, output schema matching DispatchPreflightResult

4. `apps/mcp-server/src/application/usecases/__tests__/dispatchPreflight.test.ts`
   - Purpose: 6-group unit test per FR-9
   - Test harness: reuse `_resetCoordinationDbState()` + `_injectCoordinationDb()` + `ensureCoordinationTable()` from coordinationStore.test.ts
   - Groups (1-4 normal paths, 5-6 edge cases):
     1. Fresh session, free claim → presence.status="registered", claim.claimed=true
     2. Re-entrant (pre-seed rows) → presence.status="renewed", claim.claimed=false + current_holder.owner_client_session===caller
     3. Peer-held claim → claim.claimed=false + current_holder.owner_client_session===peer (differs from #2)
     4. claim_task_id omitted → claim===null, other 3 fields populated
     5. FR-6 independence (seed orphan row unrelated to claim, verify claim still works) — proves sub-steps don't share state
     6. db_unavailable flag mode → presence.status="error", orphans===[], roster===[], claim.error==="db_unavailable" (when claim attempted)

### Files to Modify
1. `apps/mcp-server/src/interface/mcp/tools/system/coordination/taskClaimTool.ts`
   - Change: lines 25-30 replace inline `SERVER_SESSION_ID` IIFE with `import { SERVER_SESSION_ID } from './serverSessionId.js'`
   - Reference: D-10

2. `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts`
   - Line 4: header comment "6 MCP tools" → "7 MCP tools"
   - Add registration call: `registerDispatchPreflightTool(server)` (import from `./coordination/dispatchPreflightTool.js`)
   - Reference: architect section 6 / D-10

### Files to Regenerate
1. `docs/data/tool-registry.json`
   - Command: `bun scripts/gen-tool-registry.ts` (live run, not --dry-run)
   - Outcome: totalCount 183→184, new `"dispatch_preflight"` entry in `"system"` group (alphabetically sorted)
   - Reference: D-8, FR-8

### Knowledge Needed
- Architect's full brownfield findings: `docs/handoffs/UC-RDL-P4-BA-spec.md` (read sections 1-4, design decisions D-1..D-10)
- Precedent layering: `apps/mcp-server/src/application/usecases/getCycleBootstrap.ts` + `.../system/cycleBootstrapTool.ts` (read to understand async usecase + thin wrapper pattern, D-2 callout about Promise.race)
- Coordination module: `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` (functions claimTask/heartbeatTask/listHeldTasks — read to understand they're all synchronous, returns are self-guarded)
- Test harness precedent: `apps/mcp-server/src/infrastructure/__tests__/coordinationStore.test.ts` (reuse _reset, _inject, ensureCoordinationTable; do NOT invent new test infrastructure)
- EC-2 (presence never a gate): explicitly NOT a BLOCKER for orphans/roster/claim — all 4 return normally even if presence fails
- EC-3 (self-held vs peer-held distinguishable): current_holder.owner_client_session field is load-bearing — unit test group 2/3 must verify both cases
- EC-4 (writes can't silent-degrade like reads do): claim field must carry explicit error, distinct from claimed:false
- EC-5 (intent orphans don't exist): ORPHAN_EMIT_ALLOW_LIST excludes "intent" — empirically empty by construction, expected, not a bug
- Non-goal #4: zero edits to claimTask/heartbeatTask/listHeldTasks/releaseTask themselves — pure compositor
- Non-goal #1: no board-state guard / adoption logic server-side — stays client-side (router-dispatch-locking-P3, already shipped)

### Dependencies
- None — architect design is complete, all ratified by PO (Q1/Q2), no blocking prerequisites

### Blockers & Contingencies
- **EC-10 deployment gate:** new tool is inert until ops-gated rebuild. Do NOT treat unit test passing as evidence the tool is live.
- **Live integration test DoD (PO Q1 ruling):** claimed:true / re-entrant / peer-collision all 3 branches must reproduce LIVE against the **running** rebuilt container before `.status → DONE_VERIFIED` (this step is DEFERRED pending build+rebuild cadence, not part of this task's accept).

## Developer Branch Convention
- Branch: `task/RDL-P4-dispatch-tool-dev` (kebab case from task title)
- Commits: per `docs/policies/commit-convention.md` (scope: `feat(mcp-server/dispatch-preflight): ...` or similar), end with `Task: RDL-P4-DISPATCH-TOOL-DEV` trailer
- Commit strategy: one per logical unit is fine (e.g., serverSessionId extraction + taskClaimTool update as one "refactor", then usecases, then tests, then registry)

## Success Criteria (beyond AC above)
- Branch pushes cleanly
- All tests pass (including the 6 groups of dispatchPreflight.test.ts)
- tool-registry.json regenerated, totalCount correct, no hand-edits
- Ready for QA round-trip on actual container rebuild (PO Q2 sequencing: coordinate with FIX-ORPHAN sibling, do not rebuild until both DONE_VERIFIED)
