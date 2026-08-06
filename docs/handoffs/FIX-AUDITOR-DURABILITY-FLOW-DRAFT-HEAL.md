---
sprint: FIX-SYSTEM-AUDITOR-CYCLE-FINDINGS-NOT-SELF-PERSISTED
branch: fix/auditor-durability-flow-draft-heal
size: S
zone: cross-service/
depends_on:
  - FIX-AUDITOR-DURABILITY-STEP0B-DETECTION
  - FIX-AUDITOR-DURABILITY-SKILL-DRAFT-PERSIST
blocks:
  - FIX-AUDITOR-DURABILITY-VERIFY
---

## TLDR
Call notebook-write skill with draft persistence enabled. Extend Step 0b to sweep for stale draft files (.auditor-cycle-draft-*.md) and mechanically append their content to the notebook before proceeding. Complete the self-healing repair path: lost cycles deterministically recovered via script/skill logic, no model re-composition needed.

## [PM] Planning Context

**Zone:** cross-service/

**Acceptance Criteria:**
  - [ ] Notebook-write call in flow/main.md uses draft-persistence variant (pass draft_scratch_file parameter)
  - [ ] Step 0b extended to sweep for orphaned .auditor-cycle-draft-*.md files
  - [ ] Stale draft files (mtime > 20 min, TBD: consistent with marker sweep window) identified and appended
  - [ ] Orphaned draft content appended to notebook mechanically (no model re-composition)
  - [ ] Appended content committed before proceeding to new cycle
  - [ ] Draft files rm -f'd after append and commit
  - [ ] Dedup: avoid appending same draft twice on successive retries (use dedup-ledger or similar)

**Files to read first:**
  - docs/agents/system-auditor/flow/main.md (full, focus on Notebook Write section and Step 0b)
  - .claude/skills/notebook-write/SKILL.md (from prior task, to understand the draft-persistence parameter)
  - docs/architecture-briefs/2026-08-06-fix-system-auditor-cycle-notebook-persistence-lifecycle.md (§3b.2)

**Files to modify:**
  - docs/agents/system-auditor/flow/main.md
    - Notebook Write section: pass draft_scratch_file parameter to notebook-write skill call
    - Step 0b: add stale-draft-file sweep (complement to stale-marker sweep from Task 1)
      - find orphaned draft files
      - Append content to notebook using existing notebook-write skill
      - Commit appended content
      - rm -f the draft files

**Files to create:** None

**Knowledge needed:**
  - docs/policies/dev-standards.md
  - docs/architecture-briefs/2026-08-06-fix-system-auditor-cycle-notebook-persistence-lifecycle.md § 3b.2
  - .claude/skills/notebook-write/SKILL.md usage patterns
  - auditor-notebook-commit.sh pattern (already used in flow for hardened commits)

**Implementation notes:**
- Notebook-write call should pass: draft_scratch_file="docs/agent-memory/.auditor-cycle-draft-${FIRE_TICK}.md"
  - FIRE_TICK variable should already be available in the flow (set in Step 0d or similar)
  - If not available, derive from current timestamp (e.g., date -u +%Y-%m-%dT%H:%MZ)
- Step 0b stale-draft sweep:
  - Use find to locate .auditor-cycle-draft-*.md files (same directory as markers: docs/agent-memory/)
  - Extract FIRE_TICK from filename
  - For each stale draft:
    - Read its content
    - Call notebook-write skill to append it to the real notebook
    - Use existing auditor-notebook-commit.sh to commit the appended content
    - Check dedup-ledger to avoid re-appending same draft on retries
    - rm -f the draft file after successful append+commit
- Timing: mtime > 20 min is the test window (consistent with stale-marker sweep)
  - This ensures in-progress cycles are not accidentally repaired mid-cycle
- Self-heal sequence in Step 0b:
  1. Check for stale markers (from Task 1)
  2. Check for stale draft files
  3. If draft found, append its content to notebook and commit
  4. Continue with current cycle

**Related architecture brief:** docs/architecture-briefs/2026-08-06-fix-system-auditor-cycle-notebook-persistence-lifecycle.md

**Parent task:** FIX-SYSTEM-AUDITOR-CYCLE-FINDINGS-NOT-SELF-PERSISTED (plan_only, decomposed into 4 child tasks)
