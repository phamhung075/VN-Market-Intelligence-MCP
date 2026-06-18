---
sprint: ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP
task_id: TASK-AUTO-PUSH-B-PO
branch: task/auto-push-b-po-flow-step
size: S
zone: docs/agents/po/
depends_on: ["TASK-AUTO-PUSH-A"]
blocks: []
---

## TLDR

Add a new **Step PUSH-BACKSTOP** to `docs/agents/po/flow/main.md` that runs at every PO tick exit (all branches of the § No-Task Guard section). The step checks if unpushed commits exceed PUSH_THRESHOLD (20), verifies safety guards are clear (no dirty critical files, no held commit-mutex), and if safe, invokes `scripts/fleet-worktree-push.sh`. If unsafe, logs a skip message to Telegram WORK channel.

## [PM] Planning Context

- **Zone:** docs/agents/po/ (agent flow documentation; agent-father owns edits via agent-md-factory skill)
- **Acceptance Criteria:**
  - [ ] New section "## Step PUSH-BACKSTOP" added to § No-Task Guard section in `docs/agents/po/flow/main.md`
  - [ ] Step runs at EVERY exit path from the no-task guard (i.e., inserted before the final `JUMP TO end` on the all-empty path, AND appended to every other return path that exits the PO flow — sprint-kickoff.md, review-ba-spec.md, sprint-signoff.md)
  - [ ] Threshold check: `ahead=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)` followed by `if [ "$ahead" -gt "${PUSH_THRESHOLD:-20}" ]`
  - [ ] Safety Guard 1: check for dirty critical files: `git diff --name-only | grep -E 'docs/data/orch/orch-state\.json|docs/agent-memory/notebooks/'`
  - [ ] Safety Guard 2: check for held commit-mutex: `call_tool(server="vn-market", tool="task_list_held", arguments={kind: "commit-mutex"}); if count > 0 → skip`
  - [ ] If `ahead > PUSH_THRESHOLD` AND safety guards pass → invoke `bash scripts/fleet-worktree-push.sh`
  - [ ] If safety guard blocks → send Telegram WORK message: `[po] PUSH-BACKSTOP: ahead=${ahead} > ${PUSH_THRESHOLD:-20} but safety guard BLOCKED — bg agents hold uncommitted mutations. Will retry next tick.`
  - [ ] Documentation: brief comment explaining Option-B rationale (PO is the semantic owner of push decisions; reuses existing 15-min tick cadence, adds no new always-on component)
  - [ ] Word count ~80–120 lines (step definition + guards + dispatch)

- **Files to read first:**
  - `docs/agents/po/flow/main.md` L94-107 (§ No-Task Guard; all exit paths marked `JUMP TO end`)
  - `docs/architecture-briefs/2026-06-18-auto-push-threshold-backstop.md` §3.2 (Step PUSH-BACKSTOP spec)
  - `.claude/skills/agent-md-factory/SKILL.md` (agent .md editing pattern — MANDATORY before editing any agent .md)

- **Files to modify:**
  - `docs/agents/po/flow/main.md` (add Step PUSH-BACKSTOP in no-task-guard section)

- **Dependencies:**
  - TASK-AUTO-PUSH-A (script must exist and be functional)

- **Knowledge needed:**
  - PO flow structure and exit paths (read the full flow first)
  - Bash scripting: variable interpolation, git commands, MCP tool calls
  - Agent .md editing protocol via agent-md-factory (non-negotiable per project rules)
  - Telegram tool call signature: `send_telegram(channel="work", message="...")`
  - Task tool call signature: `task_list_held(kind="commit-mutex")` returns `{count: N, ...}`

## Implementation Notes

**Section template (insert in § No-Task Guard, before final return/JUMP):**

```markdown
## Step PUSH-BACKSTOP — Auto-push when ahead > threshold

**Rationale:** Option-B from ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP: threshold-checked push fires inside the PO's post-triage tick (existing 15-min cadence), avoiding the need for a new cron/launchd/RemoteTrigger. The worktree-isolated script ensures no conflict with dirty main working tree where bg agents may hold uncommitted board mutations. Runs at every PO tick exit, regardless of whether tasks were processed.

**Trigger & Safety Guards:**

```bash
ahead=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
if [ "$ahead" -gt "${PUSH_THRESHOLD:-20}" ]; then
  # Guard 1: Is orch-state dirty (bg agent mid-write)?
  dirty_critical=$(git diff --name-only | grep -E 'docs/data/orch/orch-state\.json|docs/agent-memory/notebooks/')
  
  # Guard 2: Is commit-mutex held?
  held=$(call_tool(server="vn-market", tool="task_list_held", arguments={kind: "commit-mutex"}))
  
  if [ -z "$dirty_critical" ] && [ "$held.count" -eq 0 ]; then
    # Safe to push
    bash scripts/fleet-worktree-push.sh
  else
    # Safety guard blocked — skip this tick
    send_telegram(channel="work", message="[po] PUSH-BACKSTOP: ahead=${ahead} > ${PUSH_THRESHOLD:-20} but safety guard BLOCKED — bg agents hold uncommitted mutations. Will retry next tick.")
  fi
fi
```

**Placement strategy:**
- Insert at the END of the § No-Task Guard section, immediately before the final `JUMP TO end` on the "all empty AND channels clean" path.
- ALSO: after each non-idle branch returns to PO (sprint-kickoff.md, review-ba-spec.md, sprint-signoff.md step returns). This ensures the check runs on every exit, not just the idle path.

**Critical note:** This must use the agent-md-factory skill for editing (DO NOT hand-edit the .md file). The agent-md-factory creates a temporary copy, validates formatting, and safely replaces the file. See `.claude/skills/agent-md-factory/SKILL.md` for the invocation pattern.

## Verification Gate

After merge and container rebuild:
1. Simulate ahead > 20 by adding dummy commits (do not push)
2. Run one PO tick (let the 15-min scheduled tick fire, or manually run the PO flow)
3. Verify the step detects ahead > 20
4. Verify safety guards are clear (tree clean, no commit-mutex held)
5. Verify script `scripts/fleet-worktree-push.sh` is invoked and succeeds
6. Verify Telegram WORK channel receives success notification: `[fleet-push] pushed N commits to origin/main`
7. Verify `git rev-list --count origin/main..HEAD` now returns 0

Then test safety guard blocking:
1. Add a dummy commit (ahead > 20) + a dirty notebook file (not committed)
2. Run PO tick
3. Verify the step detects ahead > 20 BUT logs skip message due to dirty critical files
4. Verify Telegram WORK channel receives block message: `[po] PUSH-BACKSTOP: ahead=21 > 20 but safety guard BLOCKED...`
