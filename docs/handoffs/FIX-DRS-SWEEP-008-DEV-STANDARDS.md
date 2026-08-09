---
sprint: FIX-DEVTEAM-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-DESTINATION
branch: task/FIX-DRS-SWEEP-008-dev-standards
size: XS
zone: cross-service/
depends_on: [FIX-DRS-SWEEP-006-BOUNDED1-REGRESSION, FIX-DRS-SWEEP-007-CLASSIFY-VERIFY]
blocks: []
---

## TLDR
Update `docs/policies/dev-standards.md` § Script Persistence with two new CANONICAL pointer entries: one for `scripts/lib/agent-father-board-drain-eligibility.jq` (the classifier library) and one for `scripts/audits/agent-father-board-drain-classify-verify.sh` (the synthetic test). Follows existing CANONICAL pattern.

## [PM] Planning Context

- **Zone:** cross-service/
- **Acceptance Criteria:**
  - [ ] New CANONICAL entry for `scripts/lib/agent-father-board-drain-eligibility.jq`:
    - Brief description (classifier library for board-drain row categorization)
    - Usage line (e.g., `include "scripts/lib/agent-father-board-drain-eligibility";`)
    - Owning flow reference: `docs/agents/agent-father/flow/board-drain.md`
    - Placement: after other `scripts/lib/` CANONICAL entries
  - [ ] New CANONICAL entry for `scripts/audits/agent-father-board-drain-classify-verify.sh`:
    - Brief description (synthetic test of classifier correctness)
    - Usage line: `bash scripts/audits/agent-father-board-drain-classify-verify.sh`
    - Test pattern reference (mirrors existing `*-verify.sh` CANONICAL entries)
    - Placement: after other `scripts/audits/*verify*.sh` CANONICAL entries
  - [ ] No modifications to existing entries
  - [ ] Formatting consistent with existing CANONICAL entries (## header, code block, description, owning flow ref, test ref where applicable)
  - [ ] Entries follow the naming/pattern convention established in the file

- **Files to read first:**
  - `docs/policies/dev-standards.md` § Script Persistence (existing CANONICAL entries, patterns)
  - Brief §7 step 8 (notes that this step adds pointers for steps 2 and 7's new scripts)

- **Files to create:** None

- **Files to modify:**
  - `docs/policies/dev-standards.md` — add 2 new CANONICAL entries in § Script Persistence section

- **Dependencies:** FIX-DRS-SWEEP-006-BOUNDED1-REGRESSION (the bounded1-supervised-lane-report is extended by task 006), FIX-DRS-SWEEP-007-CLASSIFY-VERIFY (adds verify script)

- **Knowledge needed:**
  - Existing § Script Persistence patterns in dev-standards.md
  - Brief §7 step 8 description (which scripts are new, which flows own them)
  - CANONICAL pointer conventions (where in the file, format, cross-references)

---

## RETURN
Task specification ready for developer. This is documentation-only housekeeping. No blocking dependencies from this task.
