---
sprint: FIX-DEVTEAM-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-DESTINATION
branch: task/FIX-DRS-SWEEP-003-board-drain
size: M
zone: cross-service/
depends_on: [FIX-DRS-SWEEP-002-CLASSIFIER]
blocks: [FIX-DRS-SWEEP-004-INIT-COMMIT-ZONE, FIX-DRS-SWEEP-005-MANUAL-DISPATCH-SWEEP, FIX-DRS-SWEEP-006-BOUNDED1-REGRESSION]
---

## TLDR
Create new sub-flow `docs/agents/agent-father/flow/board-drain.md` and integrate into `keep.md` as a new unconditional step (after Step 5b). Implements the two-tier SAFE_AUTO/NEEDS_RATIFY dispatch mechanism for the 34 agent-father DRS-stranded rows. SAFE_AUTO runs `edit.md` prepare+apply (live edits, no orch writes) then lane-moves to review[]. NEEDS_RATIFY runs `edit-prepare.md` plan-only then mints a `docs/improvement-proposals/` DRAFT proposal for PO ratification.

## [PM] Planning Context

- **Zone:** cross-service/
- **Acceptance Criteria:**
  - [ ] New file `docs/agents/agent-father/flow/board-drain.md` created, wired as an unconditional step into `keep.md` (after Step 5b, before `keep.md` exit)
  - [ ] Step D1 (candidate computation):
    - Loads candidates via `agent-father-board-drain-eligibility.jq` (§2.3 predicate)
    - Sorts by `[priority_rank, idx]`
    - Caps exactly N_SAFE=8 SAFE_AUTO and N_RATIFY=3 NEEDS_RATIFY per cycle
    - Excludes rows already carrying `board_drain_claimed_at` (staleness guard, 4h window per brief §2.4)
  - [ ] Step D2 (SAFE_AUTO path):
    - For each SAFE_AUTO row: derives `agent_name` from files[] common prefix (or null if ambiguous)
    - Derives `change_description` from title + detail/desc
    - Calls `edit.md` with both phases (prepare + apply — not plan-only for this tier)
    - On completion: stamps `board_drain_claimed_at`, `board_drain_claimed_by`, `board_drain_class` fields in the board row
    - Calls `orch-apply.sh` to flip status `BACKLOG/TODO → REVIEW`, lane unchanged (row moves to `review[]`), `next_agent: "po"`
  - [ ] Step D3 (NEEDS_RATIFY path):
    - For each NEEDS_RATIFY row: calls `edit-prepare.md` ONLY (no apply, plan-only)
    - Writes the plan into `docs/improvement-proposals/board-drain-<id>.md` with status:DRAFT
    - Reuses `improvement_approved_md` proposal shape/lifecycle verbatim (not a new approval format)
    - Stamps `board_drain_class` and `board_drain_proposal_ref` in the board row
    - Does NOT lane-move the board row (stays in `backlog[]`, now with a visible proposal link)
  - [ ] Error handling: if `edit.md` or `edit-prepare.md` fails mid-flight, log the error but continue (partial SAFE_AUTO apply logs the row with a crash note for PO to review); if orch-apply fails, log and surface as an escalation (orch integrity issue)
  - [ ] No auto-close to DONE: all paths leave rows in `review[]` (SAFE_AUTO) or `backlog[]` (NEEDS_RATIFY) awaiting human sign-off

- **Files to read first:**
  - `docs/architecture-briefs/2026-08-09-agent-father-board-drain-and-ops-batch-widen.md` §2.4 (full flow spec, idempotency, error handling)
  - `docs/agents/agent-father/flow/keep.md` (where to integrate; understand the existing 5b step structure)
  - `docs/agents/agent-father/flow/edit.md` and `edit-prepare.md` (prepare/apply split, input contract)
  - `scripts/lib/agent-father-board-drain-eligibility.jq` (candidate selector + classifier)
  - `scripts/orch-apply.sh` (SSOT write pattern)

- **Files to create:**
  - `docs/agents/agent-father/flow/board-drain.md` — new sub-flow (Steps D1-D3)

- **Files to modify:**
  - `docs/agents/agent-father/flow/keep.md` — add new Step 6 (board-drain call) after existing Step 5b, unconditional (not gated by CADRAT-3 pre-check)

- **Dependencies:** FIX-DRS-SWEEP-002-CLASSIFIER (uses the classifier)

- **Knowledge needed:**
  - Brief §2.4: flow steps, caps, idempotency window, orch-apply usage restrictions
  - Brief §2.2: effective_files, spot-check rows for manual verification
  - `edit.md` / `edit-prepare.md` contracts and input shape
  - `docs/improvement-proposals/` existing proposal shape (reuse, don't invent)
  - `orch-apply.sh` write pattern and field restrictions
  - jq: detail-first/board-fallback, common-path extraction, `orch_apply_row_update` shape

---

## RETURN
Task specification ready for developer. This is the core mechanism for the 34 agent-father rows. Blocking: FIX-DRS-SWEEP-004 (init.md governance change), FIX-DRS-SWEEP-005 (manual-dispatch-sweep needs this complete), FIX-DRS-SWEEP-006 (regression instrument needs this).
