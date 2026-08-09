---
sprint: FIX-DEVTEAM-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-DESTINATION
branch: task/FIX-DRS-SWEEP-002-classifier
size: S
zone: cross-service/
depends_on: [FIX-DRS-SWEEP-001-EFFECTIVE-FILES]
blocks: [FIX-DRS-SWEEP-003-BOARD-DRAIN, FIX-DRS-SWEEP-005-MANUAL-DISPATCH-SWEEP, FIX-DRS-SWEEP-007-CLASSIFY-VERIFY]
---

## TLDR
Create `scripts/lib/agent-father-board-drain-eligibility.jq`, a new shared library that defines `classify_board_drain_row` — a two-tier SAFE_AUTO/NEEDS_RATIFY classifier for agent-father board-drain candidates. Includes a candidate-set selector matching the brief's exact conjunct set. Reuses existing predicates via `include` (never hand-copies).

## [PM] Planning Context

- **Zone:** cross-service/
- **Acceptance Criteria:**
  - [ ] New file `scripts/lib/agent-father-board-drain-eligibility.jq` created
  - [ ] `include "scripts/lib/devteam-eligibility"` at the top (reuse, never duplicate)
  - [ ] Candidate selector (`.task_board.backlog[]/todo[]` | filter) matches brief §2.3 spec exactly: status IN (BACKLOG, TODO), `effective_next_agent == "agent-father"`, `deps_satisfied`, NOT `is_epic_wrapper`, NOT `is_detail_deferred`, NOT `has_unbacked_sequencing_prose`
  - [ ] `classify_board_drain_row($detail_items)` classifies as SAFE_AUTO or NEEDS_RATIFY per brief §2.3 rules:
    - SAFE_AUTO: owned-prefix files only + no deny-prefix files + size XS/S + NOT supervised + non-empty files
    - NEEDS_RATIFY: everything else (empty files, deny-prefix files present, supervised:true, size M+)
  - [ ] All 5 explicit safety rules documented and present (empty files, agent-father self-edit deny, dispatch-critical deny, supervised deny, size M+)
  - [ ] Manual verification: spot-check against 5 real rows from task board (brief §2.2: 2 empty-files, 1 multi-owner, 1 supervised, 1 normal) produces expected verdicts
  - [ ] No hand-copied predicate logic from devteam-eligibility.jq (use `effective_files`, `effective_supervised`, `effective_owner`, etc.)

- **Files to read first:**
  - `docs/architecture-briefs/2026-08-09-agent-father-board-drain-and-ops-batch-widen.md` §2.3 (full classifier spec + 5 spot-check examples + safety rules)
  - `scripts/lib/devteam-eligibility.jq` (existing predicates to include/reuse)
  - `scripts/lib/po-manual-dispatch-eligibility.jq` (similar classifier pattern: `is_design_router_candidate`)

- **Files to create:**
  - `scripts/lib/agent-father-board-drain-eligibility.jq` — new classifier library

- **Files to modify:** None

- **Dependencies:** FIX-DRS-SWEEP-001-EFFECTIVE-FILES (uses the new `effective_files` predicate)

- **Knowledge needed:**
  - Brief §2.3: classifier rules, safety gates, owned/deny prefix lists
  - jq: `include`, predicates as functions, `all()/any()`, string matching
  - Existing `effective_*` predicates and their semantics from devteam-eligibility.jq

---

## RETURN
Task specification ready for developer. Blocking: FIX-DRS-SWEEP-003-BOARD-DRAIN, FIX-DRS-SWEEP-005-MANUAL-DISPATCH-SWEEP (both use this classifier).
