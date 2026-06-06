---
name: decision-journal
description: >
  Sprint footprint writer. Appends STEP block (decision rationale) to
  docs/agent-memory/decisions/sprint-<id>-<agent-id>.md. MANDATORY: one entry per
  task before REVIEW/DONE, stamped task-id. NEVER narrate reasoning on terminal.
required_inputs:
  - AGENT_ID   # caller must set from agent.id field in agent's init.md
---

## DECISION JOURNAL RULE

Journal = WHY (decision trail). Notebook = WHAT LEARNED. Handoff = WHAT TO DO.
**MANDATORY:** Reasoning goes to `docs/agent-memory/decisions/sprint-<sprint-id>-<agent-id>.md`, NOT terminal. Terminal = STATUS-ONLY (RETURN block + caveman lines).

## § Resolve Sprint ID

```bash
# AGENT_ID must be set by the caller from agent.id in init.md (e.g. "agent-father", "po", "dev-mcp-server")
SPRINT_ID=$(jq -r '.sprint_goal.entries[] | select(.status == "active") | .sprint_id' \
  docs/data/orch/orch-state.json 2>/dev/null | tail -1)
[ -z "$SPRINT_ID" ] && SPRINT_ID=$(date -u +"%Y-%m-%d")
JOURNAL_PATH="docs/agent-memory/decisions/sprint-${SPRINT_ID}-${AGENT_ID}.md"
```

## § Init File

Write header once (if missing):
```markdown
# Decision Journal — Sprint <sprint-id> · <agent-id>

**Sprint goal:** <description from orch-state or "no goal set">
**Agent:** <agent-id>
**Started:** <ISO-timestamp>

---
```

## § Write Entry (≤12L per STEP)

```markdown
### STEP <agent-id>-S<N> · <agent-id> · <ISO-timestamp>
**task-id:** <TASK_ID>  [MANDATORY if sprint task in scope; omit if ambient]
**what-done:** <concrete action, 1 sentence>
**what-considered:**
- <option 1>
- <option 2 — 2–4 bullets; if one path: "only: reason">
**why-decision:** <decisive reason chosen option won>
**why-change:** <why differs from plan, or "no change">
```

**Rules:**
- `step-id` = `<agent-id>-S<N>` (N increments per sprint).
- `task-id` MANDATORY for task_board work (before REVIEW/DONE). Omit for ambient cycles.
- 12L hardcap per STEP (task-id line counts).
- Inject via flow: `Run skill: .claude/skills/decision-journal/SKILL.md § Write Entry [task_id: "..."]`

## § Cap Check

```bash
LINES=$(wc -l < "$JOURNAL_PATH" | tr -d ' ')
if [ "$LINES" -gt 600 ]; then
  echo "### CAP-REACHED · $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$JOURNAL_PATH"
  send_telegram(channel="bug", message="[decision-journal] sprint-${SPRINT_ID}-${AGENT_ID} CAP-REACHED — mandatory entries silently dropped; archive sprint journal")
  # Roll to continuation file — new writes go here until this session ends
  JOURNAL_PATH="docs/agent-memory/decisions/sprint-${SPRINT_ID}-${AGENT_ID}-2.md"
fi
```

## § Commit Rule

Entries accumulate. Commit once per cycle:
```bash
git add docs/agent-memory/decisions/sprint-<id>-<agent-id>.md \
        docs/agent-memory/notebooks/<agent-id>.md
git commit -m "chore(memory/<agent-id>): notebook + journal YYYY-MM-DD"
```
