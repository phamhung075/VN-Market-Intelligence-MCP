---
name: decision-journal
description: >
  Sprint footprint writer. Appends a structured STEP block (WHY a decision was
  made) to the per-sprint decision journal file. MANDATORY: every task-executing
  agent writes at minimum one entry per task it completes, stamped with that
  task's task-id, written before marking the task REVIEW/DONE. Additional
  entries for extra in-task decisions are still encouraged. NEVER narrate
  reasoning on terminal.
---

## DECISION JOURNAL RULE

> **DECISION JOURNAL RULE:** Reasoning and decision rationale MUST be written to
> the sprint footprint file (`docs/agent-memory/decisions/sprint-<sprint-id>.md`),
> NOT narrated on the terminal. Terminal output is STATUS-ONLY: RETURN block +
> caveman status lines. Any "why I chose X", "I considered Y", "I changed from
> Z to W" reasoning goes to the journal file exclusively.

**Boundary:**
- Journal = WHY (decision trail, per step, during sprint)
- Notebook = WHAT WAS LEARNED (cross-cycle memory, per agent)
- Handoff = WHAT TO DO / WHAT WAS DONE (role payload, per task)
- No duplication: handoff `[Developer] Implementation Record` says WHAT was
  built; journal says WHY the implementation approach was chosen.

---

## § Resolve Sprint ID

```bash
SPRINT_ID=$(jq -r '.sprint_goal.entries[0].id // empty' \
  docs/data/orch/orch-state.json 2>/dev/null)
[ -z "$SPRINT_ID" ] && SPRINT_ID=$(date -u +"%Y-%m-%d")
JOURNAL_PATH="docs/agent-memory/decisions/sprint-${SPRINT_ID}.md"
```

---

## § Init File (if not exists)

If `$JOURNAL_PATH` does not exist, write the header ONCE using the Write tool:

```markdown
# Decision Journal — Sprint <sprint-id>

**Sprint goal:** <one-line from orch-state.json .sprint_goal.entries[0].description, or "no goal set">
**Started:** <ISO-timestamp: date -u +"%Y-%m-%dT%H:%M:%SZ">

---
```

---

## § Write Entry

Compose the STEP block in memory (12L max), then append to `$JOURNAL_PATH`.
Use Edit tool append pattern OR read-full + Write. Entry format:

```markdown
### STEP <agent-id>-S<N> · <agent-id> · <ISO-timestamp>
**task-id:** <task_id if a sprint task is in scope, e.g. ARCH-ORCH-F1 — omit this line entirely if no task in scope>
**what-done:** <one sentence — the concrete action taken>
**what-considered:**
- <option/data point 1>
- <option/data point 2 — 2-4 bullets; if only one path: "only option: <reason>">
**why-decision:** <one sentence — decisive reason the chosen option won>
**why-change:** <one sentence — why this differs from prior plan, or "no change from plan">
```

**Rules:**
- `step-id`: `<agent-id>-S<N>` — N increments per agent per sprint.
- `ISO-timestamp`: `date -u +"%Y-%m-%dT%H:%M:%SZ"` at moment of writing.
- `task-id`: MANDATORY when the agent is completing a task_board task. Include
  the line `**task-id:** <TASK_ID>` between the `### STEP` header and
  `**what-done:**` (e.g. `ARCH-ORCH-F1`). Omit the line entirely only when no
  task is in scope (cowork cycle with no claimed task, ambient maintenance,
  etc.) — entries without `task-id` land in the sprint fallback bucket. Parser
  must not throw on absent `task-id`.
- Hard cap: 12 lines per STEP block (task-id line counts toward this cap when present).
- Triggering condition (task_board tasks): MANDATORY — write at minimum ONE
  entry per task you complete, stamped with that task's task-id, immediately
  before marking the task REVIEW/DONE. If the work was routine, use
  `what-considered: "only path: <reason>"` and `why-change: "no change from
  plan"`. Additional entries for in-task decisions (option choice, failure
  adaptation, confidence judgment, plan deviation) are still encouraged.
- Triggering condition (non-task steps): any non-trivial decision (option
  choice, failure adaptation, confidence judgment). Skip mechanical bootstrap
  sub-steps (project-root resolution, notebook read).

**Injection pattern for calling flows:**
When calling this skill's § Write Entry, pass the active task_id:
```
Run skill: .claude/skills/decision-journal/SKILL.md § Write Entry
[task_id: "<TASK_ID>" if a sprint task is in scope, else omit]
```
The skill writes the `**task-id:**` line only when task_id is provided and non-empty.

---

## § Cap Check

Before appending, verify line count:

```bash
LINES=$(wc -l < "$JOURNAL_PATH" | tr -d ' ')
if [ "$LINES" -gt 600 ]; then
  echo "### CAP-REACHED · $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$JOURNAL_PATH"
  # Stop — do not append further entries this sprint
  exit 0
fi
```

If cap reached: append `### CAP-REACHED` sentinel and silently stop. This is
an ops concern, not a flow blocker.

---

## § Commit Rule

Decision journal entries are NOT committed individually. They accumulate during
the sprint and are committed as part of the agent's end-of-cycle notebook
commit — one atomic commit:

```bash
git add docs/agent-memory/decisions/sprint-<id>.md \
        docs/agent-memory/notebooks/<agent-id>.md
git commit -m "chore(memory/<agent-id>): notebook + decision journal YYYY-MM-DD"
```
