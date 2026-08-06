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

---

## [Developer] Implementation Record

- **Files modified:** `docs/agents/system-auditor/flow/main.md` (Step 0b gains 0b.1/0b.2/0b.3 detection sub-steps; Notebook Write/Commit block relocated to run immediately after tier checks, ahead of Anomaly Reporting/OUTPUT-CONTRACT; Notebook Append Gate condition (b) rewired to read `$MARKERS_FILE` directly; size-justification header delta appended), `docs/WORK.md` (one-liner), `docs/agent-memory/notebooks/developer.md`, `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer-4.md` (journal STEP developer-S69), `scripts/dev-fix-auditor-durability-step0b-detection-to-review.jq` (new, task_board lane-move script).
- **Tests written:** none — no companion `.test.sh` exists for this flow-spec `.md` file (confirmed via repo-wide grep before starting; this agent's own file scope is `docs/agents/*/flow/**/*.md`, not `apps/`, so the TDD/bun-test contract is structurally N/A). Verification was live-bash instead: Step 0b.1's `find -mmin +20` sweep run against the real repo correctly found all 6 real pre-existing orphaned `.auditor-cycle-markers-*.tmp` files; a fresh(5min)/stale(30min) synthetic fixture pair confirmed the boundary (first attempt had a TZ bug in the fixture script itself, caught and fixed — `find -mmin` logic was never wrong); Step 0b.2's `jq 'try (...| fromdateiso8601) catch empty'` epoch-gap logic confirmed against fresh(10min→no-flag)/stale(9h→flag)/missing-file(→skip) fixtures; the new Notebook Append Gate `grep -cE` regex confirmed matching exactly the 5 non-`ABORT` `[emit-signal]` marker forms `scripts/audit-output-contract.sh` itself counts toward `signal_queue_rows_written`, 0 false matches. `bash -n` clean on all 3 new bash blocks.
- **Git commits:** `92ef5b3a2` (main.md + WORK.md), `af9ad098c` (memory: notebook + journal), `b2e5a6dec` (jq lane-move script). `docs/data/orch/orch-state.json` status flip (IN_PROGRESS → REVIEW, `in_progress[]` → `review[]`) applied via `scripts/orch-apply.sh` and landed in git history absorbed into a concurrent peer commit (`1a818dd41`, a `qa`-agent commit) — a known, accepted artifact of this shared hot-file's concurrent-writer model (file-level atomic write landed correctly; verified live post-write and confirmed present in `HEAD`).
- **tsc status:** N/A — no `apps/` TS/Go touched (zone `cross-service/`, pure `.md`/`.jq`).
- **Full suite:** N/A for the same reason; zero regression risk to `apps/mcp-server` runtime code (no source touched).
- **Docs updated:** `docs/agents/system-auditor/flow/main.md` (primary), `docs/WORK.md` (changelog one-liner). Deliberately did NOT touch `docs/agents/system-auditor/audit-dimensions.md` — that file is at its own hard 200L cap with an explicit "should split rather than grow further" maintainer note, and this task's own scope stated `Files to create: None`, so a full D-CYCLE dimension write-up (which would need either a cap breach or a new sibling file) is deferred/flagged for a follow-on, not actioned here. main.md's own inline documentation is self-contained (cites its architecture brief directly).
- **Graphify:** skipped — no Skill-tool path available to this spawned developer agent (same structural constraint noted on several recent sibling entries in `docs/WORK.md`).
- **Simplicity gate:** PASS — Q1 scope clean (no flag/config knob beyond what the 6 ACs require; the Tier-1 dual-source OR check is required by AC1's generic "schedule check" requirement, not speculative), Q2 no single-use abstractions (all inline bash, no new function/wrapper), Q3 senior-test clean (no indirection layers, no Manager/Handler-style wrapper), Q4 ratio <50% overhead (nearly every added line directly documents or implements a required check/reorder).
