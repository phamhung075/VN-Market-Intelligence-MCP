---
sprint: ORCH-DASH-DECISION-DRILLDOWN
branch: task/orch-dash-f1-skill-injection
size: S
zone: docs/agents/
depends_on: []
blocks: [ARCH-ORCH-F2]
---

## TLDR

Add optional `**task-id:**` field to the decision-journal STEP format and inject the field value from current-scope task_id at the journal-write step in developer, architect, qa, and cowork agent flows. No backfill; parser must tolerate absent task-id. Output becomes the test fixture for F2's parseJournalFile function.

## [PM] Planning Context

- **Acceptance Criteria:**
  - [ ] AC-F1-1: `.claude/skills/decision-journal/SKILL.md` § Write Entry template shows `**task-id:**` line between header and `**what-done:**`
  - [ ] AC-F1-2: § Rules block documents `task-id` as optional; parser must skip entries without it
  - [ ] AC-F1-3: `docs/agents/developer/flow/main.md` — journal-write step injects `task_id: "<task_id>"` when task_id in scope
  - [ ] AC-F1-4: `docs/agents/architect/flow/main.md` — same injection (ARCH-* tasks carry task_id)
  - [ ] AC-F1-5: `docs/agents/qa/flow/main.md` — same injection (if journal-write exists; add if missing)
  - [ ] AC-F1-6: Audit any other agent flow (cowork: unified-agent, chef, market-watcher, news-scout, fb-market-poster) that calls decision-journal/SKILL.md § Write Entry; update to pass task-id when in scope
  - [ ] AC-F1-7: A manually-authored STEP with the new task-id line parses correctly in F2 test fixture T1 (by_task routing)
  - [ ] AC-F1-8: All flow modifications committed atomically in one commit with message referencing ARCH-ORCH-F1 + SKILL.md update

- **Files to read first:**
  - `.claude/skills/decision-journal/SKILL.md` — current template and rules (lines 52-75)
  - `docs/agents/developer/flow/main.md` — find "decision-journal" calls; identify the Step number
  - `docs/agents/architect/flow/main.md` — same search
  - `docs/agents/qa/flow/main.md` — same search
  - `docs/agents/unified-agent/flow/main.md`, `docs/agents/chef/flow/main.md`, etc. — cowork agents with journal writes

- **Files to create:**
  - None (pure SKILL.md + flow updates)

- **Files to modify:**
  - `.claude/skills/decision-journal/SKILL.md` — § Write Entry template: add `**task-id:** <task_id or omit>` line between `### STEP` header and `**what-done:**`; update § Rules to document field
  - `docs/agents/developer/flow/main.md` — locate journal-write step; inject `task_id: "<current_task_id>"` parameter (conditional on task_id being in scope)
  - `docs/agents/architect/flow/main.md` — same injection
  - `docs/agents/qa/flow/main.md` — same injection (verify journal-write exists; add Step if missing)
  - `docs/agents/cowork-team/flow/main.md`, `docs/agents/unified-agent/flow/main.md`, `docs/agents/chef/flow/main.md`, `docs/agents/market-watcher/flow/main.md`, `docs/agents/news-scout/flow/main.md`, `docs/agents/fb-market-poster/flow/main.md` — audit for journal-write calls; inject task_id when applicable

- **Dependencies:** None (F1 is tier-1)

- **Knowledge needed:**
  - `docs/agents/pm/init.md` (PM agent definition)
  - `.claude/skills/decision-journal/SKILL.md` (current STEP format)
  - `.claude/skills/caveman/SKILL.md` (status-only communication)

---

## Architecture Reference

Full design in `docs/handoffs/ORCH-DASH-DECISION-DRILLDOWN-ARCH.md` § F1.

**Updated STEP format (F1 output, consumed as F2 parser fixture):**
```markdown
### STEP <agent-id>-S<N> · <agent-id> · <ISO-timestamp>
**task-id:** <task_id or omit if no task in scope>
**what-done:** <one sentence>
**what-considered:**
- <bullet>
**why-decision:** <one sentence>
**why-change:** <one sentence>
```

**Injection pattern (all flows):**
When calling decision-journal/SKILL.md § Write Entry, include:
```bash
task_id="<TASK_ID_VALUE>"  # empty string if no task in scope
# ... then in the journal write step, pass task_id to the skill
```

**Parser contract (F2 fixture):**
- If `**task-id:**` line present and non-empty → entry goes into `by_task[task_id][]`
- If absent or empty → entry goes into `sprint_bucket[sprint_id][]`
- Parser must not throw on missing task-id line; field is optional

**No backfill or re-parsing:** Existing decision journal entries without task-id are left as-is. F2 parser handles both old (no task-id) and new (with task-id) entries.

---

## Implementation Notes

- **SKILL.md template update:** Between `### STEP` header and `**what-done:**`, insert one new line with `**task-id:** <task_id or omit>`. Document in § Rules that the field is optional and may be omitted.
  
- **Flow injection:** Each flow's journal-write step currently looks like:
  ```
  Run skill: .claude/skills/decision-journal/SKILL.md § Write Entry
  ```
  After F1, it becomes:
  ```
  Run skill: .claude/skills/decision-journal/SKILL.md § Write Entry
  [pass task_id: "<TASK_ID>" if task_id in scope]
  ```
  The exact mechanism (parameter binding vs env var) is agent-father's choice.

- **Cowork agent audit:** Cowork agents run on fixed schedule and may not have a task_id in scope. Agent-father must determine which flows have journal-write steps and decide: (a) inject empty task_id if no task in scope (goes to sprint_bucket), or (b) skip injection entirely (old behavior, entries land in sprint_bucket anyway).

---

## Sign-off Criteria

- SKILL.md template visibly includes `**task-id:**` line
- Developer, Architect, QA flows all stamp task_id at journal-write
- A new STEP entry written after F1 lands appears in F2 parser T1 test fixture in `by_task[<task_id>][]`
- No existing decision journal entries are modified or lost
- Single atomic commit: `chore(agent-father): ARCH-ORCH-F1 — decision-journal task-id field + flow injection`
