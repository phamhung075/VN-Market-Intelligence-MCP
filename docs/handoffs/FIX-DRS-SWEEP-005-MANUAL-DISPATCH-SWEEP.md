---
sprint: FIX-DEVTEAM-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-DESTINATION
branch: task/FIX-DRS-SWEEP-005-manual-dispatch-sweep
size: S
zone: cross-service/
depends_on: [FIX-DRS-SWEEP-002-CLASSIFIER, FIX-DRS-SWEEP-003-BOARD-DRAIN]
blocks: []
---

## TLDR
Update `docs/agents/po/flow/manual-dispatch-sweep.md` and `scripts/lib/po-manual-dispatch-eligibility.jq` to handle the 9-row ops-class DRS-stranded remainder. Add explicit `next_agent != "agent-father"` filter to exclude rows (board-drain owns those). Add new 4th candidate class `AGENT-FATHER-PROPOSAL-PENDING` for rows with draft proposals awaiting PO ratification. Widen Step 2 cap from 1→4 rows/tick (generic + ops-class subset).

## [PM] Planning Context

- **Zone:** cross-service/
- **Acceptance Criteria:**
  - [ ] `scripts/lib/po-manual-dispatch-eligibility.jq`: 
    - No changes to `is_drs_stranded_off_allowlist` predicate itself (other tools depend on its unchanged meaning)
    - Add new predicate `is_agent_father_proposal_pending($detail_items)` (or equivalent name) that checks `board_drain_class == "NEEDS_RATIFY"` and `board_drain_proposal_ref` file exists with `status: DRAFT`
  - [ ] `docs/agents/po/flow/manual-dispatch-sweep.md`:
    - Step 1 (candidate computation): add `select(. | effective_next_agent($detail_items) != "agent-father")` to the DRS-STRANDED-OFF-ALLOWLIST candidate block (narrow, call-site only — not touching the predicate itself)
    - Step 1: add new 4th candidate class `AGENT-FATHER-PROPOSAL-PENDING` with the same shape/staleness guard as existing classes
    - Step 2 (cap): change from `exactly 1 row/tick` to `1 generic (existing) + up to N_OPS=3 additional from ops-class DRS-STRANDED subset + AGENT-FATHER-PROPOSAL-PENDING combined`, priority-ordered
    - Step 3 (BATCH fold): for AGENT-FATHER-PROPOSAL-PENDING rows, PO approval sets proposal `status: APPROVED` (triggering the pre-existing `improvement_approved_md` consumer in agent-father's `main.md`), not the generic BATCH entry shape
  - [ ] No changes to existing BACKLOG-XOR-GAP / READY-XOR classes' 1-row cap
  - [ ] Ops-class rows (ops, ops-mainserver-fetch, ops-vps-fetch, code-janitor) are now routable through this sweep

- **Files to read first:**
  - `docs/architecture-briefs/2026-08-09-agent-father-board-drain-and-ops-batch-widen.md` §3 (ops-class rationale, component B spec, cap arithmetic)
  - `docs/agents/po/flow/manual-dispatch-sweep.md` (current structure, existing candidate classes, Step 2 cap, Step 3 BATCH logic)
  - `scripts/lib/po-manual-dispatch-eligibility.jq` (existing predicates, `is_drs_stranded_off_allowlist`, `flag_reentrant` pattern)
  - `scripts/lib/agent-father-board-drain-eligibility.jq` (the `board_drain_*` fields this task reads)
  - `docs/agents/agent-father/main.md` (C-1/C-2 `improvement_approved_md` consumer, to understand the proposal approval flow)

- **Files to create:** None

- **Files to modify:**
  - `docs/agents/po/flow/manual-dispatch-sweep.md` — Step 1 (new filter + 4th class), Step 2 (cap widen), Step 3 (proposal ratification)
  - `scripts/lib/po-manual-dispatch-eligibility.jq` — new predicate for proposal-pending check

- **Dependencies:** FIX-DRS-SWEEP-002-CLASSIFIER (uses classifier), FIX-DRS-SWEEP-003-BOARD-DRAIN (uses board_drain_* fields it produces)

- **Knowledge needed:**
  - Brief §3.1-3.3: ops-class rationale, 4th candidate class, cap justification, proposal approval lifecycle
  - Brief §2.4: what `board_drain_class` / `board_drain_proposal_ref` fields are set to
  - Existing `improvement_approved_md` flow in agent-father (no changes needed, PO just sets status:APPROVED)
  - jq predicates and call-site filtering patterns
  - File I/O in jq (checking if proposal file exists + reading its status field)

---

## RETURN
Task specification ready for developer. This extends an already-shipped flow with an additive widen and a new candidate class. No blocking dependencies from this task.
