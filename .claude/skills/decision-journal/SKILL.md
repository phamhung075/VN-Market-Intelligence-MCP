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

Dual-axis (FIX-DECISION-JOURNAL-SKILL-CAPCHECK-LINE-ONLY-NO-BYTE-ROLLOVER): a
line-only check lets a journal sit under 600L but well over the byte cap
(dense/long lines) and never roll, while `context-bloat-backstop.sh` fires
`context_bloat_breach` on that same file every cycle. `LINE_CAP` is read from
`docs/data/file-size-caps.json` (SSOT, pattern
`docs/agent-memory/decisions/sprint-*.md`) — `BYTE_CAP` is always
`LINE_CAP * 60`, the SAME 60-bytes/line derivation `context-bloat-backstop.sh`
uses for that detector (TE-T24), never a second hardcoded `36000`.

```bash
LINE_CAP="$(jq -r '.caps[] | select(.pattern=="docs/agent-memory/decisions/sprint-*.md") | .cap' \
  docs/data/file-size-caps.json 2>/dev/null | head -1)"
case "$LINE_CAP" in ''|*[!0-9]*) LINE_CAP=600 ;; esac  # SSOT unreadable/malformed → long-standing default
BYTE_CAP=$((LINE_CAP * 60))  # same derivation as context-bloat-backstop.sh (TE-T24) — never a 2nd hardcode

LINES=$(wc -l < "$JOURNAL_PATH" | tr -d ' ')
BYTES=$(wc -c < "$JOURNAL_PATH" | tr -d ' ')
if [ "$LINES" -gt "$LINE_CAP" ] || [ "$BYTES" -gt "$BYTE_CAP" ]; then
  echo "### CAP-REACHED · $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$JOURNAL_PATH"
  send_telegram(channel="bug", message="[decision-journal] sprint-${SPRINT_ID}-${AGENT_ID} CAP-REACHED (lines=$LINES/$LINE_CAP bytes=$BYTES/$BYTE_CAP) — mandatory entries silently dropped; archive sprint journal")
  # Roll to next continuation file. Numeric suffix increments off whatever JOURNAL_PATH
  # already is (base file = implicit index 1) — NOT a hardcoded -2/-3 pair, so a
  # breaching -2.md rolls to -3.md, -3.md to -4.md, unbounded — new writes go here
  # until this session ends.
  BASE="docs/agent-memory/decisions/sprint-${SPRINT_ID}-${AGENT_ID}"
  CUR_N=$(echo "$JOURNAL_PATH" | sed -nE "s#^${BASE}-([0-9]+)\.md\$#\1#p")
  [ -z "$CUR_N" ] && CUR_N=1
  JOURNAL_PATH="${BASE}-$((CUR_N + 1)).md"
fi
```

## § Commit Rule

Entries accumulate. Commit once per cycle:
```bash
git add docs/agent-memory/decisions/sprint-<id>-<agent-id>.md \
        docs/agent-memory/notebooks/<agent-id>.md
git commit -m "chore(memory/<agent-id>): notebook + journal YYYY-MM-DD" \
  -- docs/agent-memory/decisions/sprint-<id>-<agent-id>.md docs/agent-memory/notebooks/<agent-id>.md
```
