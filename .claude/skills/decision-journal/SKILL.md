---
name: decision-journal
description: >
  Sprint footprint writer. Appends a structured STEP block (WHY a decision was
  made) to the per-sprint decision journal file. Called by all task-executing
  agents after any non-trivial decision step. NEVER narrate reasoning on terminal.
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
- Hard cap: 12 lines per STEP block.
- Triggering condition: any step carrying a non-trivial decision (option choice,
  failure adaptation, confidence judgment, plan deviation). Skip mechanical
  bootstrap sub-steps (project-root resolution, notebook read).

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
