---
sprint: FIX-DEVTEAM-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-DESTINATION
branch: task/FIX-DRS-SWEEP-007-classify-verify
size: S
zone: cross-service/
depends_on: [FIX-DRS-SWEEP-002-CLASSIFIER]
blocks: [FIX-DRS-SWEEP-008-DEV-STANDARDS]
---

## TLDR
Create new synthetic test script `scripts/audits/agent-father-board-drain-classify-verify.sh` to validate the correctness of the `classify_board_drain_row` classifier from FIX-DRS-SWEEP-002. Tests all 5 classifier branches with positive/negative controls; never touches live files. Merge-blocking regression gate on classifier correctness.

## [PM] Planning Context

- **Zone:** cross-service/
- **Acceptance Criteria:**
  - [ ] New file `scripts/audits/agent-father-board-drain-classify-verify.sh` created
  - [ ] Script is SYNTHETIC-only: reads `scripts/lib/agent-father-board-drain-eligibility.jq` source via `bun run` (or equivalent jq runner), never touches live `docs/data/orch/orch-state.json`
  - [ ] Tests all 5 classifier branches per brief §4 (not exhaustive, but covers each branch):
    - Branch 1: XS/S + owned-prefix files only + NOT supervised → SAFE_AUTO ✓
    - Branch 2: any dev-team/po/agent-father/dispatch-skill file present → NEEDS_RATIFY ✓ (regardless of size)
    - Branch 3: supervised:true → NEEDS_RATIFY ✓ (regardless of files)
    - Branch 4: empty files[] → NEEDS_RATIFY ✓
    - Branch 5: size M+ → NEEDS_RATIFY ✓
  - [ ] Positive control: a synthetic minimal row matching SAFE_AUTO criteria classifies correctly
  - [ ] Negative controls: 4 distinct rows, each failing one gate, all classify NEEDS_RATIFY
  - [ ] Output: clear test results (pass/fail per branch), exit 0 on all pass, exit 1 on any fail
  - [ ] No dependencies on live board state (synthetic test data embedded or generated, never read orch-state.json)
  - [ ] Script is idempotent and can be run as a CI merge gate

- **Files to read first:**
  - `docs/architecture-briefs/2026-08-09-agent-father-board-drain-and-ops-batch-widen.md` §4 (synthetic verifier spec, 5 branches listed)
  - `scripts/lib/agent-father-board-drain-eligibility.jq` (the classifier implementation being tested)
  - Similar test scripts in `scripts/audits/` (e.g., other verify scripts for pattern reference)

- **Files to create:**
  - `scripts/audits/agent-father-board-drain-classify-verify.sh` — synthetic test harness

- **Files to modify:** None

- **Dependencies:** FIX-DRS-SWEEP-002-CLASSIFIER (tests this classifier)

- **Knowledge needed:**
  - Brief §4: the 5 classifier branches, what counts as SAFE_AUTO vs NEEDS_RATIFY
  - Bash test harness patterns (assertions, exit codes)
  - jq invocation (bun run or native jq)
  - Synthetic test data construction (don't need real board rows, create minimal test fixtures)

**Note:** This is a non-blocking test/verification script, but CI should fail-gate on this script's exit code before allowing board-drain to ship. Flagged as merge-blocking in brief §4.

---

## RETURN
Task specification ready for developer. This validates the classifier correctness before any developer runs it live. Blocking: FIX-DRS-SWEEP-008-DEV-STANDARDS (which cites this script as a CANONICAL pointer).
