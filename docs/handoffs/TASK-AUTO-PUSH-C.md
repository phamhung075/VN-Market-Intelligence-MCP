---
sprint: ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP
task_id: TASK-AUTO-PUSH-C
branch: task/auto-push-c-cron-note
size: XS
zone: docs/standards/
depends_on: []
blocks: []
---

## TLDR

Add a brief note to `docs/standards/cron-jobs.md` documenting that the ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP implementation chose **Option-B: threshold-checked push inside existing PO tick**, NOT a new cron/launchd/RemoteTrigger. This clarifies the cron inventory and prevents future confusion.

## [PM] Planning Context

- **Zone:** docs/standards/ (documentation; agent-father owns standard updates)
- **Acceptance Criteria:**
  - [ ] New entry added to `docs/standards/cron-jobs.md` under an appropriate section (e.g., "Maintenance" or "Infrastructure")
  - [ ] Entry title: "Push backstop (Option-B: PO tick, no new cron)"
  - [ ] Entry content clarifies:
    - Threshold-checked push via PO flow Step PUSH-BACKSTOP (primary) + dev-team post-cycle fallback
    - Fires when `git rev-list --count origin/main..HEAD > PUSH_THRESHOLD` (default N=20)
    - Uses worktree-isolated script `scripts/fleet-worktree-push.sh`
    - Option-B chosen: reuses existing 15-min PO tick cadence; adds zero new always-on components
    - No launchd plist, no cron entry, no RemoteTrigger needed
    - Brief rationale: avoids cron inventory debt; cleaner integration with existing PO responsibilities
  - [ ] Word count ~60–100 words (brief, to-the-point)

- **Files to read first:**
  - `docs/standards/cron-jobs.md` (current inventory structure; find appropriate insertion point)
  - `docs/architecture-briefs/2026-06-18-auto-push-threshold-backstop.md` §2 (Options Evaluation — why Option-B was chosen)

- **Files to modify:**
  - `docs/standards/cron-jobs.md` (add one entry for Push Backstop)

- **Dependencies:** (none — this is documentation, no code dependency)

- **Knowledge needed:**
  - Familiarity with cron inventory format in the current .md file
  - High-level understanding of ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP design

## Implementation Notes

**Sample entry (adjust to match existing .md style):**

```markdown
### Push Backstop (Option-B: PO Tick, No New Cron)

**Component:** `scripts/fleet-worktree-push.sh` + `docs/agents/po/flow/main.md` Step PUSH-BACKSTOP + `docs/agents/dev-team/flow/post-cycle.md` fallback

**Cadence:** Runs inside PO tick (every ~15 min) + dev-team post-cycle fallback (if PO unavailable)

**Trigger:** When `git rev-list --count origin/main..HEAD > PUSH_THRESHOLD` (default 20 commits)

**Action:** Invokes worktree-isolated push script if safety guards pass (no dirty critical files, no held commit-mutex)

**Rationale:** Option-B chosen over dedicated cron/launchd (Option-A): reuses existing PO tick cadence, adds zero new always-on components, and avoids cron inventory debt. Worktree isolation ensures compatibility with dirty main working tree where background agents may hold uncommitted mutations.

**References:** ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP (brief: docs/architecture-briefs/2026-06-18-auto-push-threshold-backstop.md)
```

**Insertion points to consider:**
- Under a "Maintenance" section (if one exists)
- Under an "Infrastructure" section
- At the end of the cron inventory, before any closing notes

Read the current `docs/standards/cron-jobs.md` structure to choose the most natural location.

## Verification Gate

After merge:
1. Read `docs/standards/cron-jobs.md` and verify the new entry is present and clearly formatted
2. Verify the entry accurately reflects Option-B design (PO tick, no new cron)
3. Verify references to ARCH brief and script paths are correct
4. Confirm the entry integrates well with the rest of the document structure
