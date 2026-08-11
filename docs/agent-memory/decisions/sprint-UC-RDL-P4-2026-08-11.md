# UC-RDL-P4 Sprint Decision Journal — 2026-08-11

## Task ID
UC-RDL-P4 (sprint container) + RDL-P4-DISPATCH-TOOL-DEV (developer task)

## Context
- Architect design complete: `docs/handoffs/UC-RDL-P4-BA-spec.md`
- Brownfield findings include 10 design decisions (D-1..D-10)
- PO rulings captured: Q1 (cutover DoD), Q2 (rebuild sequencing)
- UC-RDL-P4B-DOC-CUTOVER already minted in backlog (FR-7 split)

## Considered
1. **Decomposition granularity:** Single task vs. multi-task split
   - Architect note: "likely one atomic developer task given tight interdependency between usecase + tool wrapper"
   - Files involved: serverSessionId extraction + taskClaimTool edit + dispatchPreflight usecase + dispatchPreflightTool interface + coordinationTools registration + test suite + tool-registry regeneration
   - **Finding:** All 7 files are tightly coupled, must ship together. No meaningful split points that preserve independent ~2h tasks.

2. **WIP limit enforcement**
   - Current WIP: 2 (at limit)
   - **Decision:** Mint task as READY, not in_progress, to preserve hard WIP constraint
   - Developer picks up when existing in_progress slots clear

3. **UC-RDL-P4B-DOC-CUTOVER status**
   - Already in backlog with depends_on:["UC-RDL-P4"]
   - **No change needed** — separation is PO Q1 ruling, already captured in board row

## Decision
**Single READY task:** RDL-P4-DISPATCH-TOOL-DEV (size M)
- All 7 files listed in architect's file table
- Handoff document captures design decisions D-1..D-10
- Non-goals #1-4 and edge cases EC-1..EC-10 documented
- Integration round-trip verification deferred per EC-10

## Rationale
- Architect explicitly flagged "likely one atomic task" — confirmed by tight coupling analysis
- All design decisions ratified by PO (Q1/Q2 rulings in UC-RDL-P4 row itself)
- Zero new domain-layer files; no edits to coordinationStore.ts or coordination/index.ts (PO correction verified live)
- FR-7 doc cutover explicitly FORBIDDEN this wave (PO Q1), split to UC-RDL-P4B-DOC-CUTOVER (already exists)

## Deferred / Documented for Follow-up
- **Integration round-trip** (claimed:true / re-entrant / peer-collision) vs. running container
  - Gated on ops-approved rebuild with sibling FIX-ORPHAN row
  - PO Q2 sequencing: coordinate rebuild, not implementation
  
- **D-6: orphans/roster field-shape divergence**
  - Flagged for UC-RDL-P4B-DOC-CUTOVER implementer
  - Raw LockRow[] (owner_agent/claimed_at/epoch expires_at) vs. aliased shape from tool layer
  - Cannot assume drop-in compatibility
  
- **D-7: TaskKind enum triplication**
  - Pre-existing, now 3 copies (taskClaimTool, taskListHeldTool, dispatchPreflightTool)
  - Out of L-bound, deferred to separate consolidation task if it bites again
  
- **D-9: EC-1 roster toggle**
  - No include_roster param in V1
  - Deferred to router-dispatch-locking-P15 if separately minted

## Status: No Change From Plan
All decomposition decisions align with architect's recommendation and PO rulings.
