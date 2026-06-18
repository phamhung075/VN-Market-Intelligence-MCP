---
sprint: ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP
task_id: TASK-AUTO-PUSH-A
branch: task/auto-push-a-fleet-worktree-script
size: S
zone: scripts/
depends_on: []
blocks: ["TASK-AUTO-PUSH-B-PO", "TASK-AUTO-PUSH-B-DT"]
---

## TLDR

Create `scripts/fleet-worktree-push.sh`: a generic shell script that implements the proven worktree-isolation recipe for pushing accumulated commits to origin when the main working tree is dirty. Guards against non-chore commits in the behind-set and orch-state.json conflicts. Runs isolated in a temporary worktree; main tree untouched.

## [PM] Planning Context

- **Zone:** scripts/ (root-level cross-service tooling, generic developer)
- **Acceptance Criteria:**
  - [ ] Script file `scripts/fleet-worktree-push.sh` created with full implementation per brief §1 + §4
  - [ ] Threshold `PUSH_THRESHOLD=20` injected as a tunable variable in script header (comments note it can be adjusted without rebuild)
  - [ ] Worktree path uses timestamped directory (e.g. `/tmp/fleet-push-wt-<timestamp>`) to avoid collision
  - [ ] Script calls `git worktree prune` on exit to avoid stale worktree accumulation
  - [ ] Divergence-reconcile logic: classify behind-set via `git log HEAD..origin/main` for chore vs non-chore; abort if any non-chore detected (send BUG telegram)
  - [ ] orch-state.json conflict handling: if merge conflicts, keep HEAD via `--ours` (cloud chores are additive only)
  - [ ] Pre-push tsc gate: runs `pnpm --filter vn-market check` inside worktree; exits 1 if non-zero (sends BUG telegram, does not push)
  - [ ] Success/failure notifications sent to Telegram WORK channel (success: `[fleet-push] pushed N commits to origin/main`; failure: `[fleet-push] ABORT: <reason>` sent to BUG channel)
  - [ ] Script is idempotent: can be run multiple times safely (worktree cleanup always executes on exit)
  - [ ] No direct git operations on main working tree (only the worktree is touched)

- **Files to read first:**
  - `docs/architecture-briefs/2026-06-18-auto-push-threshold-backstop.md` §1 (proven recipe), §4 (divergence-reconcile + guards)
  - Memory entries: `feedback_push_blocked_by_perpetual_dirty_tree.md`, `feedback_red_prepush_strands_fleet.md`
  - Sibling script examples: `scripts/docker-cleanup.sh`, `scripts/ci-per-file-isolation.sh` (pattern style)

- **Files to create:**
  - `scripts/fleet-worktree-push.sh` — complete push orchestration script

- **Files to modify:** (none)

- **Dependencies:**
  - None (this is the foundation; TASK-AUTO-PUSH-B-PO and TASK-AUTO-PUSH-B-DT depend on it)

- **Knowledge needed:**
  - Shell script best practices (bash 4+, set -e, error handling)
  - Git worktree mechanics: `git worktree add`, `git worktree remove`, `git worktree prune`
  - Git log filtering: `git log HEAD..origin/main --oneline` (behind-set classification)
  - Pre-commit hook pattern: `pnpm --filter vn-market check` exit codes
  - Telegram integration: `send_telegram(channel="work", message="...")` call signature (from vn-market MCP tools)
  - Symlink patterns for node_modules (tsc hook requires it)

## Implementation Notes

**Script structure (template):**

```bash
#!/bin/bash
set -e

PUSH_THRESHOLD=${PUSH_THRESHOLD:-20}
WT_PATH="/tmp/fleet-push-wt-$(date +%s)"

# Step 1: Check ahead count
ahead=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
if [ "$ahead" -le "$PUSH_THRESHOLD" ]; then
  exit 0  # Nothing to do
fi

# Step 2: Check behind count (divergence)
behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
if [ "$behind" -gt 0 ]; then
  # Classify behind-set for non-chore commits
  non_chore=$(git log HEAD..origin/main --oneline | grep -v '^[a-f0-9]* chore(' | grep -v '^[a-f0-9]* ci(' | wc -l | tr -d ' ')
  if [ "$non_chore" -gt 0 ]; then
    send_telegram(channel="bug", message="[fleet-push] ABORT: origin has ${non_chore} non-chore commits. Manual reconcile required.")
    exit 1
  fi
fi

# Step 3: Create isolated worktree
git worktree add "$WT_PATH" HEAD

# Step 4: Merge (if behind-set exists, all chores)
if [ "$behind" -gt 0 ]; then
  git -C "$WT_PATH" merge origin/main --no-edit || {
    if git -C "$WT_PATH" diff --name-only --diff-filter=U | grep -q 'orch-state.json'; then
      git -C "$WT_PATH" checkout --ours docs/data/orch/orch-state.json
      git -C "$WT_PATH" add docs/data/orch/orch-state.json
      git -C "$WT_PATH" merge --continue --no-edit
    else
      git worktree remove "$WT_PATH" 2>/dev/null || true
      send_telegram(channel="bug", message="[fleet-push] ABORT: merge conflict in non-orch-state file.")
      exit 1
    fi
  }
fi

# Step 5: Symlink node_modules (tsc hook dependency)
ln -s "$(pwd)/node_modules" "$WT_PATH/node_modules" 2>/dev/null || true

# Step 6: Pre-push tsc check
cd "$WT_PATH"
if ! pnpm --filter vn-market check; then
  cd - >/dev/null
  git worktree remove "$WT_PATH" 2>/dev/null || true
  send_telegram(channel="bug", message="[fleet-push] ABORT: pnpm check failed (red tree)")
  exit 1
fi
cd - >/dev/null

# Step 7: Push
git -C "$WT_PATH" push origin HEAD:main || {
  git worktree remove "$WT_PATH" 2>/dev/null || true
  send_telegram(channel="bug", message="[fleet-push] ABORT: git push failed.")
  exit 1
}

# Step 8: Cleanup
git worktree remove "$WT_PATH" 2>/dev/null || true
git worktree prune

# Step 9: Notify success
send_telegram(channel="work", message="[fleet-push] pushed ${ahead} commits to origin/main")
```

**Key constraints (from brief §4.3):**
- NEVER use `git stash`, `git reset`, `git checkout` on the main tree.
- NEVER use `--force` or `--force-with-lease` on the push.
- NEVER rebase on the main tree (use merge instead).
- The worktree is a temporary sandbox; always clean it up on exit.

**Testing strategy:**
1. **Steady-state test:** Add a dummy commit locally (do not push), then manually run the script. Verify it detects ahead > PUSH_THRESHOLD and pushes.
2. **Dirty-tree test:** Add a dummy commit + a dirty file (e.g. edit a notebook, don't commit). Run the script again. Verify it still pushes (worktree is clean, main tree doesn't matter).
3. **Behind-set test:** Simulate a cloud chore commit by manually adding a chore commit to origin (or mock it). Verify the script merges it without aborting.
4. **Non-chore behind-set test:** Simulate a real commit in origin (a non-chore). Verify the script aborts with BUG telegram.
5. **Red-tree test:** Introduce a TypeScript error in apps/mcp-server/ (e.g. remove a type). Run the script. Verify it aborts with BUG telegram (never pushes).

## Verification Gate

After merge, run one PO tick or manually invoke the script with ahead > 20 (add dummy commits if needed). Verify:
1. Script detects ahead count > PUSH_THRESHOLD
2. Worktree is created and isolated
3. Pre-push tsc check passes
4. Push to origin succeeds
5. `git rev-list --count origin/main..HEAD` returns 0 after push
6. Telegram WORK channel receives success notification
7. Main working tree remains dirty (untouched by script)

Then verify safety guards:
1. Add a dirty notebook file (don't commit it) + force ahead > 20
2. Hold commit-mutex (PO step will skip due to guard, not script itself)
3. Verify the PO step logs skip message to WORK channel

## [Developer] Implementation Record

- **Files modified:** none
- **Files created:**
  - `scripts/fleet-worktree-push.sh` — 185 lines; full worktree-isolated push recipe per brief §1 + §4; PUSH_THRESHOLD=20 tunable header variable; timestamped WT_PATH; cleanup trap; divergence-reconcile (non-chore abort); orch-state.json --ours conflict resolution; node_modules symlink; pnpm tsc gate; Telegram work/bug notifications; --dry-run flag
- **Tests written:** N/A (shell script — DoD specifies shellcheck + no-op path proof, not bun tests)
- **Git commits:** (see impl_commit below)
- **tsc status:** N/A (shell script, not TypeScript)
- **Full suite:** N/A
- **Docs updated:** `docs/handoffs/TASK-AUTO-PUSH-A.md` — this record appended
- **Graphify:** skipped (no docs impacted beyond handoff update)
- **shellcheck:** clean (exit 0) — SC1091 + SC2329 suppressed with inline directives (documented in script comments)
- **No-op path proof:** `bash scripts/fleet-worktree-push.sh` with ahead=9 <= threshold=20 → exits 0 "nothing to do", no worktree created, no git ops
- **Abort path proof:** `PUSH_THRESHOLD=0 bash scripts/fleet-worktree-push.sh --dry-run` → correctly detected 2 non-chore commits in behind-set, printed ABORT + telegram(bug) message, exited 1, worktree cleanup confirmed (no stale /tmp/fleet-push-wt-*)

## [QA] Review Record

- **QA cycle:** cycle-294 · 2026-06-18
- **Impl commit:** 26807a41
- **Verdict:** APPROVED
- **shellcheck:** exit 0 (independently re-confirmed)
- **No-op path:** `bash scripts/fleet-worktree-push.sh` ahead=11 ≤ 20 → exit 0, no worktree created
- **Divergence-abort path:** `PUSH_THRESHOLD=0 bash scripts/fleet-worktree-push.sh --dry-run` → exit 1, 2 non-chore detected, DRY-RUN bug telegram printed, no worktree leak
- **Worktree leak:** none after both runs (ls /tmp/fleet-push-wt-* = no matches)
- **No push during testing:** confirmed (--dry-run + threshold above current ahead count used)
- **AC all green:** script created 237L/755, PUSH_THRESHOLD=20 tunable, timestamped WT_PATH, cleanup trap EXIT INT TERM, divergence-reconcile non-chore abort, orch-state.json --ours, pnpm tsc gate, Telegram work/bug, no --force push, no hardcoded credentials, dev-standards pointer added
- **bg-agent safety guards:** correctly scoped to TASK-AUTO-PUSH-B-PO per brief §4.1 (PO flow fires before script); not a script-level AC for this task
- **DDD:** N/A (bash script)
- **Security:** PASS (no hardcoded credentials; env vars only)
- **Task Report:** `reports/TASK_REPORT_TASK-AUTO-PUSH-A.md`
- **DJ:** `docs/agent-memory/decisions/sprint-ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP-qa.md`
