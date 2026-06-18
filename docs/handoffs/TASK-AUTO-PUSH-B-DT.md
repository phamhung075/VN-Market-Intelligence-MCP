---
sprint: ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP
task_id: TASK-AUTO-PUSH-B-DT
branch: task/auto-push-b-dt-fallback
size: XS
zone: docs/agents/dev-team/
depends_on: ["TASK-AUTO-PUSH-A"]
blocks: []
---

## TLDR

Add a fallback **Step PUSH-BACKSTOP** to `docs/agents/dev-team/flow/post-cycle.md` (Step 4.9, before the "Cycle Elapsed Announce"). This is the secondary location for the auto-push check, active when dev-team runs without a PO spawn. Uses identical guard logic and script invocation as the primary PO step.

## [PM] Planning Context

- **Zone:** docs/agents/dev-team/ (agent flow documentation; agent-father owns edits via agent-md-factory skill)
- **Acceptance Criteria:**
  - [ ] New step "PUSH-BACKSTOP" added to Step 4.9 in `docs/agents/dev-team/flow/post-cycle.md`, inserted before the "Cycle Elapsed Announce" section
  - [ ] Identical guard logic and safety checks as TASK-AUTO-PUSH-B-PO (threshold, dirty-critical-files, commit-mutex)
  - [ ] Uses same `PUSH_THRESHOLD` variable (defaults to 20)
  - [ ] Invokes `bash scripts/fleet-worktree-push.sh` if safe
  - [ ] Logs skip to Telegram WORK if guard blocks
  - [ ] Brief comment: "Fallback: PO is primary owner of push decisions. If PO unavailable in this tick, dev-team checks and fires the backstop."
  - [ ] Word count ~40–60 lines (smaller since it's fallback/secondary)

- **Files to read first:**
  - `docs/agents/dev-team/flow/post-cycle.md` (full flow, focusing on Step 4.9 area)
  - `docs/architecture-briefs/2026-06-18-auto-push-threshold-backstop.md` §3.2 (alternate location rationale)
  - `.claude/skills/agent-md-factory/SKILL.md` (agent .md editing — MANDATORY)

- **Files to modify:**
  - `docs/agents/dev-team/flow/post-cycle.md` (add PUSH-BACKSTOP at Step 4.9 position)

- **Dependencies:**
  - TASK-AUTO-PUSH-A (script must exist)
  - TASK-AUTO-PUSH-B-PO (reference implementation; parallel task but both must ship)

- **Knowledge needed:**
  - dev-team flow structure and Step 4.9 location
  - Bash script invocation within flow docs
  - MCP tool call patterns (same as B-PO)
  - Agent .md editing via agent-md-factory

## Implementation Notes

**Section to add (Step 4.9 fallback):**

```markdown
### Step 4.9 — PUSH-BACKSTOP (fallback)

**Context:** PO is the primary owner of "push to origin" decisions (Step PUSH-BACKSTOP in `docs/agents/po/flow/main.md`). If dev-team executes without a PO spawn in this cycle, this fallback ensures the threshold check still runs.

**Guard & Dispatch:**

```bash
ahead=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
if [ "$ahead" -gt "${PUSH_THRESHOLD:-20}" ]; then
  dirty_critical=$(git diff --name-only | grep -E 'docs/data/orch/orch-state\.json|docs/agent-memory/notebooks/')
  held=$(call_tool(server="vn-market", tool="task_list_held", arguments={kind: "commit-mutex"}))
  
  if [ -z "$dirty_critical" ] && [ "$held.count" -eq 0 ]; then
    bash scripts/fleet-worktree-push.sh
  else
    send_telegram(channel="work", message="[dev-team] PUSH-BACKSTOP fallback: ahead=${ahead} > 20 but safety guard BLOCKED. Will retry when PO runs.")
  fi
fi
```

**Placement:** Insert immediately before the "Cycle Elapsed Announce" section (Step 4.9 position per the brief). This ensures the check runs just before dev-team logs the cycle-end message.

**Important:** Use agent-md-factory skill to edit the .md file (required by project rules for all agent .md modifications).

## Verification Gate

Easiest way to test this:
1. Stop/disable the PO agent (temporarily)
2. Add dummy commits (ahead > 20)
3. Run dev-team flow manually (it runs its post-cycle step)
4. Verify the fallback PUSH-BACKSTOP detects ahead > 20 and invokes the script
5. Verify Telegram notification is sent
6. Verify push succeeds

Alternatively:
1. Examine logs from a dev-team cycle that ran without a concurrent PO spawn
2. Verify PUSH-BACKSTOP step logs indicate it checked and either pushed or was blocked
