---
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
phase: P1.5
branch: task/1987-p15-af-2-devteam-adoption
size: M
zone: docs/agents/dev-team/
depends_on: [TASK_1980, TASK_1981, TASK_1985]
blocks: [TASK_1988]
---

## TLDR

Extend dev-team Step 0a (signal drain + board sync) to read orphan-signal rows for adoptable sprint-tasks. When an orphan-signal is found with `original_task_kind="sprint-task"` and `redispatch_count < N_MAX=3`, the adopter claims the original task_id, performs tree-hygiene (revert uncommitted live-effect edits), reads the git SHA checkpoint from the signal payload, resumes work from that commit, and flips the orch-state board via `scripts/orch-apply.sh` to re-assign the task.

## [PM] Planning Context

**Architect Brief Section:** §6.5.3 + §6.5.5 + §6.5.6 + §8 (Concrete Follow-On Tasks: P1.5-AF-2)

**Zone:** docs/agents/dev-team/

**Acceptance Criteria:**

- [ ] dev-team Step 0a (signal drain): after reading `agent_signals`, also call `task_list_held(kind="orphan-signal", owner_agent="dev-team")`
- [ ] For each returned signal with `original_task_kind="sprint-task"` and `redispatch_count < N_MAX=3`:
  - Claim the original `task_id` (stale-steal succeeds — reaper deleted the original)
  - **DoD-P15-1 GATE (load-bearing):** BEFORE doing any resume work:
    - Run `git status --porcelain` in the task zone (the zone field from the orphan-signal payload or inferred from task_id)
    - For every UNCOMMITTED tracked file (per git status output, lines starting with ` M` or similar, not `??`), run `git checkout -- <file>` to revert to last committed state
    - Leave untracked files in place (e.g., `.DS_Store`, build artifacts, `node_modules/` if not tracked)
    - Surface the list of reverted files in a board note (see board flip below)
    - This is the tree-hygiene PRECONDITION; SHA=resume POINT (next step)
  - Read checkpoint from `signal.payload.last_payload`:
    - `git_sha`: last commit SHA the dead session left
    - Any other task_kind-specific checkpoint (period key for cowork-slot, etc.)
  - **DoD-P15-3 carry-forward:** Read `signal.payload.redispatch_count` and include it in the re-claim call (if carrying to a re-spawn of dev-agent, pass via spawn prompt or checkpoint). Adopter's responsibility to thread the counter forward.
  - Resume work: `git log --oneline -5 $git_sha` to verify the checkpoint is valid; then proceed from `$git_sha` (do NOT re-run already-committed steps per §6.5.5)
  - After successful adoption: flip board via `scripts/orch-apply.sh` (NEVER raw write) to update `assigned_to` and leave `status=in_progress` (the task was already in progress; re-assign only)
- [ ] **DoD-P15-2:** Adopter uses read-only `task_list_held` to check if a `published:<kind>:<period>` artifact already exists (for cowork-slot or cron-tick adoptions), NOT `task_heartbeat`/`task_claim` (create-if-absent masks never-fired publish)
- [ ] After successful adoption: release the orphan-signal row via `task_release("orphan-signal:<task_id>")`
- [ ] For signals with `redispatch_count >= N_MAX=3`: skip (router P1.5-AF-1 handles escalation); do not re-dispatch
- [ ] **DoD-P15-6:** The Step 0a flow text MUST include the honest-bound line verbatim: "zero live sessions = zero execution; the reaper only makes work ADOPTABLE, it never self-heals execution"
- [ ] Board flip via `scripts/orch-apply.sh` (atomic write per docs/standards/orch-state-access.md + docs/policies/dev-standards.md CANONICAL:SSOT-W1-ORCH-APPLY-WRAPPER)

**DoD Locks Baked (PO-S7/S8/S9):**
- DoD-P15-1 — adopter MUST `git status --porcelain` + `git checkout -- <file>` every uncommitted live-effect edit BEFORE resuming; leave untracked, surface reverted list in board note; scoped to single-host shared-tree topology
- DoD-P15-2 — read-only `task_list_held` probe for published artifacts (not task_heartbeat/claim)
- DoD-P15-3 — adopter carries-forward redispatch_count into re-claim payload
- DoD-P15-6 — honest-bound line in the flow doc

**Files to read first:**
- `docs/agents/dev-team/flow/main.md` Step 0a (signal drain section)
- `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md:§6.5.3..§6.5.6` (adoption contract, resume specs, tree-hygiene spec)
- Project memory: `feedback_dead_worker_uncommitted_live_file_revert` (why tree-hygiene is needed)
- Project memory: `feedback_guaranteed_slot_week_key_double_post` (why published-artifact dedup uses task_list_held)

**Files to modify:**
- `docs/agents/dev-team/flow/main.md` (Step 0a signal drain → add orphan-signal adoption loop)

**Files to create:**
- None (adoption logic integrates into existing Step 0a)

**Dependencies:**
- TASK_1981 (P1 regression must pass)
- TASK_1985 (listHeldTasks must support kind + owner_agent filter)

**Knowledge needed:**
- Git status parsing (identify uncommitted tracked files vs. untracked artifacts)
- git checkout -- <file> semantics (revert to HEAD in the shared tree)
- orch-apply.sh atomic write pattern (jq transform → pipe → bash orch-apply.sh)
- Brief §6.5.5 resume-contract table (when to use git SHA vs. period key vs. published artifact)

## Context

Dev-team is the execution agent. When it comes online (Step 0a), it first drains any pending signals (agent_signals), then checks for adoptable orphaned work (orphan-signals). If it finds a dead dev-team session's sprint-task, it resumes from the durable checkpoint — but NOT before cleaning up any uncommitted live-effect trash left behind.

Tree-hygiene is critical because the shared working tree is on the host and survives the session death. A dead worker's uncommitted edits (schema changes, hook modifications, config tweaks) are already LIVE and corrupt until reverted. The checkpoint SHA is blind to this live state; tree-hygiene is the precondition.

## Success Signal

- Acceptance test: dev-team reads an orphan-signal for a sprint-task with `redispatch_count=1`, claims it, reverts uncommitted files, continues from the git SHA checkpoint, and flips the board
- Regression: dev-team still processes agent_signals as before (Step 0a signal drain unchanged except for the new orphan-signal loop)
- Manual test: dead dev session leaves a modified file in its task zone, new dev-team session adopts, runs tree-hygiene, verifies the file is reverted, resumes from checkpoint
- Board verification: adopted task shows `assigned_to` updated + reverted-files list in status note
