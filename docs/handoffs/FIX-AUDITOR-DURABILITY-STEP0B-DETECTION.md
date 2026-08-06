---
sprint: FIX-SYSTEM-AUDITOR-CYCLE-FINDINGS-NOT-SELF-PERSISTED
branch: fix/auditor-durability-step0b-detection
size: M
zone: cross-service/
depends_on: []
blocks:
  - FIX-AUDITOR-DURABILITY-SKILL-DRAFT-PERSIST
  - FIX-AUDITOR-DURABILITY-FLOW-DRAFT-HEAL
---

## TLDR
Enhance system-auditor Step 0b with schedule-based missing-cycle detection and stale-marker orphan sweep. Reorder Notebook Write step to run earlier. Addresses po_occurrence_7 correction: detector must catch both [won election then died] and [died before election].

## [PM] Planning Context

**Zone:** cross-service/

**Acceptance Criteria:**
  - [ ] Step 0b detects missing audit cycles via schedule check (last_fired + interval vs now)
  - [ ] Step 0b sweeps for orphaned marker files (mtime > 20 min), emits WARN signal + telegram, rm -f stale markers
  - [ ] Notebook-write section repositioned to run after tier checks, before output-contract/anomaly-reporting
  - [ ] Structure prepared in Step 0b for stale-draft-file sweep (integration in FIX-AUDITOR-DURABILITY-FLOW-DRAFT-HEAL)
  - [ ] All detection uses existing dedup-ledger pattern to avoid duplicate signals on retries
  - [ ] Negative tests pass: fresh markers < 20 min, recent cycles within schedule window → no false alarms

**Files to read first:**
  - docs/agents/system-auditor/flow/main.md (full, 965L)
  - docs/architecture-briefs/2026-08-06-fix-system-auditor-cycle-notebook-persistence-lifecycle.md (§3a, §3b.1)
  - .claude/skills/notebook-read/SKILL.md (existing pattern for dedup-ledger)

**Files to modify:**
  - docs/agents/system-auditor/flow/main.md
    - Step 0b (notebook-read section): add schedule-based missing-cycle detection + stale-marker orphan sweep
    - Reorder Notebook Write section to run after tier checks, before anomaly-reporting/DASHBOARD/output-contract
    - Prepare structure for stale-draft-file sweep in Step 0b (TBD in next task)

**Files to create:** None

**Knowledge needed:**
  - docs/policies/dev-standards.md
  - docs/architecture-briefs/2026-08-06-fix-system-auditor-cycle-notebook-persistence-lifecycle.md § Root Cause (§2) + § Structural Fix (§3a, §3b.1)
  - Existing dedup-ledger pattern (used elsewhere in system-auditor.md for signal dedup)
  - Cron schedule format (*/30 for Tier-1, 0 */4 for Tier-2)

**Implementation notes:**
- Schedule-based detection: Check if a cycle should have fired based on cron schedule and last_fired timestamp
  - Tier-1: */30 (every 30 min), should fire within 30 min windows
  - Tier-2: 0 */4 (every 4 hours), should fire within 4h windows
  - Use current time vs expected fire tick from schedule to detect gaps
- Stale-marker sweep: Use `find "$PROJECT_ROOT/docs/agent-memory" -maxdepth 1 -name '.auditor-cycle-markers-*.tmp' -mmin +20`
  - Extract FIRE_TICK from filename (pattern: .auditor-cycle-markers-<FIRE_TICK>.tmp)
  - Emit post_agent_signal with severity WARN, dedup_key "auditor-cycle-loss:<FIRE_TICK>"
  - Send telegram to #work channel naming the lost tick
  - rm -f the stale marker file
- Notebook-write reorder: Pure reordering, move the "## Notebook Write" section to run right after tier checks conclude
  - All tier checks sections stay in place (Tier-1, Tier-2, Tier-3)
  - Move notebook-write BEFORE the "## Anomaly Reporting / DASHBOARD Append" section
  - No content changes, only position
- Negative testing: Ensure fresh markers (< 20 min old) do not trigger alarms; recent cycles within expected schedule window do not trigger missing-cycle warnings

**Related architecture brief:** docs/architecture-briefs/2026-08-06-fix-system-auditor-cycle-notebook-persistence-lifecycle.md

**Parent task:** FIX-SYSTEM-AUDITOR-CYCLE-FINDINGS-NOT-SELF-PERSISTED (plan_only, now decomposed into 4 child tasks)
