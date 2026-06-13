# Decompose FU-ORIGIN-LAG-PUSH-DISCIPLINE into 4 agent-father tasks

def generate_subtask_id: "FU-ORIGIN-LAG-PUSH-" + .;
def now: now | strftime("%Y-%m-%dT%H:%M:%SZ");

# Create the 4 subtasks based on brief §6
def create_subtasks:
  [
    {
      id: "FU-ORIGIN-LAG-PUSH-A-MUTEX-PUSH",
      parent_id: "FU-ORIGIN-LAG-PUSH-DISCIPLINE",
      type: "TASK",
      title: "Update .claude/skills/commit-mutex/SKILL.md: add Step 3d-PUSH + bump TTL to 90s",
      desc: "Add Step 3d-PUSH (rebase-retry guard) inside critical section immediately after Step 3c (git commit) and before Step 3d (post-commit verify). Bounded to 2 total push attempts (1 initial + 1 rebase-retry). Abort on rebase conflict with bug-telegram. Also bump TTL from 60s to 90s in acquire block and quick-reference section. This is the SSOT location for all gateway-capable agent push paths.",
      owner: "agent-father",
      priority: "P1",
      zone: "skills/commit-mutex",
      status: "ready",
      depends: [],
      size: "M",
      acceptance_criteria: "Step 3d-PUSH inserted after Step 3c with exact guard block from brief §3.3 / TTL bumped to 90s in acquire+quick-ref / no other changes / skill deployable / no syntax errors",
      created_at: now,
      created_by: "pm"
    },
    {
      id: "FU-ORIGIN-LAG-PUSH-B-BOUNDARY-PUSH",
      parent_id: "FU-ORIGIN-LAG-PUSH-DISCIPLINE",
      type: "TASK",
      title: "Update .claude/skills/commit-boundary/SKILL.md: add RULE 4 (push guard)",
      desc: "Add RULE 4 (PUSH after RULE 3) to commit-boundary for agents-architect and agent-father no-gateway commits. Same bounded rebase-retry guard as mutex Step 3d-PUSH. On rebase conflict: git rebase --abort, log to notebook. One-liner form acceptable given lower concurrency (wip ≤ 1 enforced upstream), but full conflict-detect + abort must still be implemented.",
      owner: "agent-father",
      priority: "P1",
      zone: "skills/commit-boundary",
      status: "ready",
      depends: ["FU-ORIGIN-LAG-PUSH-A-MUTEX-PUSH"],
      size: "S",
      acceptance_criteria: "RULE 4 added after RULE 3 with rebase-retry guard / conflict abort implemented / no post-task_release step needed (no mutex) / skill deployable",
      created_at: now,
      created_by: "pm"
    },
    {
      id: "FU-ORIGIN-LAG-PUSH-C-GENERIC-PUSH",
      parent_id: "FU-ORIGIN-LAG-PUSH-DISCIPLINE",
      type: "TASK",
      title: "Update .claude/skills/commit/SKILL.md: replace bare push with rebase-retry guard",
      desc: "Replace the current bare `git push origin main` in Step 3 with the bounded guard block from brief §3.3. Same retry semantics: 1 initial push attempt, 1 rebase-retry if non-fast-forward, abort on conflict with bug-telegram, commit preserved locally.",
      owner: "agent-father",
      priority: "P1",
      zone: "skills/commit",
      status: "ready",
      depends: ["FU-ORIGIN-LAG-PUSH-A-MUTEX-PUSH"],
      size: "S",
      acceptance_criteria: "Bare push replaced with full guard block / conflict handling and bug-telegram present / same retry semantics as §3.3 / no other changes / skill deployable",
      created_at: now,
      created_by: "pm"
    },
    {
      id: "FU-ORIGIN-LAG-PUSH-D-PO-FLOW-FIX",
      parent_id: "FU-ORIGIN-LAG-PUSH-DISCIPLINE",
      type: "TASK",
      title: "Fix docs/agents/po/flow/main.md: replace inline commit block with skill reference",
      desc: "Lines 134-139 contain an inline notebook-commit block (git add + git commit only). This diverges from declared commit-mutex pattern and never pushes. Replace with canonical skill reference already present elsewhere in the file: `→ skill: .claude/skills/commit-mutex/SKILL.md` with own_paths and intent parameters. This leverages the mutex + push from Task A automatically.",
      owner: "agent-father",
      priority: "P1",
      zone: "agents/po/flow",
      status: "ready",
      depends: ["FU-ORIGIN-LAG-PUSH-A-MUTEX-PUSH"],
      size: "S",
      acceptance_criteria: "Inline commit block deleted / skill reference inserted with own_paths=[docs/agent-memory/notebooks/po.md] / intent set / push inheritance verified by reading deployed Task A / no logic change to po flow",
      created_at: now,
      created_by: "pm"
    }
  ];

# Update the ready task and append subtasks to the board
.task_board.ready |= 
  (
    .[0] as $parent |
    (
      .[0] |= . + {
        "status": "in_progress",
        "decomposed_at": now,
        "decomposed_by": "pm",
        "subtask_ids": ["FU-ORIGIN-LAG-PUSH-A-MUTEX-PUSH", "FU-ORIGIN-LAG-PUSH-B-BOUNDARY-PUSH", "FU-ORIGIN-LAG-PUSH-C-GENERIC-PUSH", "FU-ORIGIN-LAG-PUSH-D-PO-FLOW-FIX"]
      }
    )
  ) |
# Move the parent to in_progress
.task_board.in_progress = (create_subtasks) + .task_board.in_progress |
.task_board.ready |= .[1:] |
# Update metadata
.task_board._updated_at = now |
.task_board._updated_by = "pm"
