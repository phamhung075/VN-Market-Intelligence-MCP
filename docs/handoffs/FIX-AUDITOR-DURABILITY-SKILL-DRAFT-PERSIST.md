---
sprint: FIX-SYSTEM-AUDITOR-CYCLE-FINDINGS-NOT-SELF-PERSISTED
branch: fix/auditor-durability-skill-draft-persist
size: S
zone: cross-service/
depends_on:
  - FIX-AUDITOR-DURABILITY-STEP0B-DETECTION
blocks:
  - FIX-AUDITOR-DURABILITY-FLOW-DRAFT-HEAL
---

## TLDR
Extend .claude/skills/notebook-write/SKILL.md to support optional draft-scratch-file persistence. When enabled, composed notebook section persisted to .auditor-cycle-draft-<FIRE_TICK>.md before real commit. Make opt-in so existing callers unaffected. Enables deterministic recovery of lost cycles without model re-composition.

## [PM] Planning Context

**Zone:** cross-service/

**Acceptance Criteria:**
  - [ ] Skill adds optional draft_scratch_file parameter
  - [ ] When draft_scratch_file enabled, composed content persisted immediately after composition
  - [ ] Draft file path: .auditor-cycle-draft-<FIRE_TICK>.md (in docs/agent-memory/)
  - [ ] Draft persisted BEFORE actual notebook write and commit steps
  - [ ] Existing callers unaffected (opt-in, no change to current behavior without parameter)
  - [ ] Pattern reusable (not system-auditor-specific; any cowork agent with same long-flow-tail risk can opt in)

**Files to read first:**
  - .claude/skills/notebook-write/SKILL.md (full)
  - docs/architecture-briefs/2026-08-06-fix-system-auditor-cycle-notebook-persistence-lifecycle.md (§3b.2)
  - docs/agents/system-auditor/flow/main.md (to understand where the skill is called)

**Files to modify:**
  - .claude/skills/notebook-write/SKILL.md
    - Add optional draft_scratch_file parameter (or similar name)
    - After composition, if draft_scratch_file is set, write composed content to that file
    - Before proceeding to write/commit, persist draft

**Files to create:** None

**Knowledge needed:**
  - docs/policies/dev-standards.md
  - docs/architecture-briefs/2026-08-06-fix-system-auditor-cycle-notebook-persistence-lifecycle.md § 3b.2
  - .claude/skills/notebook-write/SKILL.md existing pattern

**Implementation notes:**
- Add parameter: draft_scratch_file (optional, null by default for backward compatibility)
- When composing the notebook section, after composition is complete but before calling write/commit:
  - If draft_scratch_file is set: write the composed content to that file
  - Use same tmp-file discipline as existing .auditor-cycle-markers-*.tmp pattern (same directory)
  - Pattern: if draft_scratch_file="docs/agent-memory/.auditor-cycle-draft-2026-08-06T09:52Z.md", write the composed text there
- The real notebook write/commit then proceeds as normal
- Make this pattern generic/additive so it doesn't break existing calls to the skill
- Document in skill that this enables resilience against mid-flow termination: "Persisting draft content as soon as composed allows Step 0b stale-file sweeps to recover lost cycles without requiring the model to remember and re-compose the analysis"

**Related architecture brief:** docs/architecture-briefs/2026-08-06-fix-system-auditor-cycle-notebook-persistence-lifecycle.md

**Parent task:** FIX-SYSTEM-AUDITOR-CYCLE-FINDINGS-NOT-SELF-PERSISTED (plan_only, decomposed into 4 child tasks)
