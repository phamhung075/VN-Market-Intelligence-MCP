---
sprint: FIX-SYSTEM-AUDITOR-CYCLE-FINDINGS-NOT-SELF-PERSISTED
branch: fix/auditor-durability-verify
size: S
zone: cross-service/
depends_on:
  - FIX-AUDITOR-DURABILITY-STEP0B-DETECTION
  - FIX-AUDITOR-DURABILITY-SKILL-DRAFT-PERSIST
  - FIX-AUDITOR-DURABILITY-FLOW-DRAFT-HEAL
blocks: []
---

## TLDR
Create scripts/audits/verify-auditor-cycle-marker-sweep.sh regression test. Verify all detection and repair paths: stale marker detection, stale draft healing, missing-cycle detection. Include both positive tests (detection works) and negative tests (no false alarms). Synthetic-fixture pattern, mirrors verify-notebook-immutability-gate.sh.

## [PM] Planning Context

**Zone:** cross-service/

**Acceptance Criteria:**
  - [ ] Positive test: stale marker file (> 20 min) → WARN signal emitted to signal_queue
  - [ ] Positive test: stale marker file (> 20 min) → telegram sent to #work channel
  - [ ] Positive test: stale draft file (> 20 min) → content appended to notebook
  - [ ] Positive test: stale draft file (> 20 min) → appended content committed
  - [ ] Positive test: missing audit cycle (scheduled but not fired) → WARN signal emitted
  - [ ] Negative test: fresh marker file (< 20 min) → no false alarm
  - [ ] Negative test: fresh draft file (< 20 min) → no false alarm
  - [ ] Negative test: recently-completed cycle (within schedule window) → no false alarm
  - [ ] Script runs successfully in CI/isolation (no live dependencies on external state)

**Files to read first:**
  - scripts/audits/verify-notebook-immutability-gate.sh (synthetic-fixture pattern reference)
  - docs/agents/system-auditor/flow/main.md (to understand flow execution and output)
  - docs/architecture-briefs/2026-08-06-fix-system-auditor-cycle-notebook-persistence-lifecycle.md (test scenarios)

**Files to create:**
  - scripts/audits/verify-auditor-cycle-marker-sweep.sh
    - Synthetic fixture setup: create test marker files with various mtimes
    - Synthetic fixture setup: create test draft files with various mtimes
    - Synthetic fixture setup: mock schedule state (last_fired timestamps)
    - Execute system-auditor Step 0b detection logic (or call flow in test mode)
    - Verify positive tests: signals emitted, files cleaned up, content appended
    - Verify negative tests: no false alarms on fresh files or recent cycles
    - Cleanup: remove synthetic fixtures

**Knowledge needed:**
  - docs/policies/dev-standards.md
  - scripts/audits/verify-notebook-immutability-gate.sh (existing test pattern)
  - bash date manipulation (touch -d, stat -f on macOS, etc.)
  - jq (to check signal_queue entries)
  - grep (to verify notebook content)

**Implementation notes:**
- Synthetic-fixture pattern (like verify-notebook-immutability-gate.sh):
  1. Set up a temporary test directory or use PROJECT_ROOT in a controlled way
  2. Create synthetic marker files with mtime set to > 20 min in the past
  3. Create synthetic draft files with mtime set to > 20 min in the past
  4. Create synthetic draft files with mtime < 20 min (should not trigger)
  5. Run the Step 0b detection logic
  6. Verify expected signals were emitted (check signal_queue or call post_agent_signal)
  7. Verify expected files were cleaned up (rm -f'd)
  8. Verify expected content was appended to notebook
  9. Cleanup
- Test timeline:
  - Stale markers/drafts: mtime = now - 25 minutes (exceeds 20 min threshold)
  - Fresh markers/drafts: mtime = now - 10 minutes (below threshold)
  - Recent cycle: last_fired within expected schedule window (should not trigger missing-cycle alarm)
- Dedup verification: run step 0b twice on same stale markers/drafts, verify signal only emitted once (dedup-ledger working)
- File path pattern: use $(PROJECT_ROOT)/docs/agent-memory/.auditor-cycle-* (same as real flow)
- Signal verification: check that post_agent_signal calls were made with correct severity (WARN) and dedup_key format ("auditor-cycle-loss:<FIRE_TICK>")

**Testing checklist:**
  - Run locally on dev machine (macOS: use `stat -f %m`, Linux: use `stat -c %Y`)
  - Run in CI environment to ensure portability
  - Verify no interference with live auditor cycles (synthetic fixtures use isolated timestamps/names)

**Related architecture brief:** docs/architecture-briefs/2026-08-06-fix-system-auditor-cycle-notebook-persistence-lifecycle.md

**Parent task:** FIX-SYSTEM-AUDITOR-CYCLE-FINDINGS-NOT-SELF-PERSISTED (plan_only, decomposed into 4 child tasks)
