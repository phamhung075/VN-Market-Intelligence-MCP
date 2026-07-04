---
sprint: SYSTEMIC-REMAKE-P1
branch: task/P1-DETECTOR-CLOSURE-TASK-ARCHIVE
size: S
zone: docs/agents/pm/
depends_on: ["P1-DETECTOR-CLOSURE-TRIAGE-SIGNALS"]
blocks: []
---

## TL;DR
Wire task-archive cleanup in PM flow: on task reaching DONE_VERIFIED, if it carries origin_signal_id, flip that signal_queue row READ→RESOLVED via already-specced CLOSE protocol (.claude/skills/signal-dashboard/SKILL.md §CLOSE).

## [PM] Planning Context

**Zone:** docs/agents/pm/

**Target:** `docs/agents/pm/flow/task-archive.md`

**Mechanism:** On a task reaching `DONE_VERIFIED`, if it carries `origin_signal_id`, flip that `signal_queue` row `READ→RESOLVED` via the already-specced CLOSE protocol (`signal-dashboard/SKILL.md` §CLOSE). No manual step — wired as part of task completion.

**Files to read first:**
- `docs/agents/pm/flow/task-archive.md` (current structure, where to add signal closure)
- `.claude/skills/signal-dashboard/SKILL.md` §CLOSE (CLOSE protocol implementation)
- `docs/agents/pm/init.md` (PM task-archive responsibilities)

**Files to modify:**
- `docs/agents/pm/flow/task-archive.md` — Add signal-closure logic when archiving DONE_VERIFIED task with origin_signal_id

**Files to create:**
- None

**Dependencies:** P1-DETECTOR-CLOSURE-TRIAGE-SIGNALS (must complete first to ensure tasks are created with origin_signal_id field)

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- `.claude/skills/signal-dashboard/SKILL.md` (CLOSE protocol)

**Acceptance Criteria (machine-checkable):**

1. Synthetic: task carrying origin_signal_id reaches DONE_VERIFIED → referenced signal_queue row flips to RESOLVED in the SAME commit (atomic)
2. jq '.signal_queue.rows[] | select(.id == "<origin_signal_id>") | .status' == "RESOLVED"
3. No manual edit needed — CLOSE happens automatically on task archive

