# TASK_AF-ORCH-F1A-F4 — Flows + SKILL + Journal Rewrite + Task Schema

**Sprint:** ORCH-TASK-CANON  
**Owner:** agent-father  
**Type:** SPRINT-S  
**Status:** TODO  
**Created:** 2026-06-06T20:30:00Z  
**Zone:** `docs/agents/ + .claude/skills/`  
**Size:** M  
**Priority:** high  
**Depends:** []

---

## Summary

Merge F1a (flow edits to enforce canonical task shape) and F4 (decision-journal SKILL fixes + journal rewrite) into one atomic commit. Create new `docs/standards/task-schema.md` as human-readable reference for TypeScript interface. Fix decision-journal SKILL resolver bug, implement per-agent journal file paths, update all flow files to emit canonical `{id,title,owner,status,zone,created_at}` task shape, and rewrite `docs/agent-memory/decisions/sprint-2026-06-06.md` freeform blocks to canonical journal-step format.

---

## Files to Modify

### New Files
- `docs/standards/task-schema.md` — Canonical task schema prose + examples + invariants (CREATED: see TASK_000.md)

### Flows + Schema (F1a items — flows now emit canonical shape)
- `docs/agents/pm/flow/main.md` — update task JSON template at L58 to include `zone` + `created_at` fields
- `docs/agents/po/flow/sprint-kickoff.md` — convert all task-creation blocks to canonical `{id, title, owner, status, zone, created_at}` (currently `{id, summary, priority}` antipattern)
- `docs/agents/po/flow/triage-signals.md` — fix repair_task_request + zone_missing_tier3 blocks to emit canonical shape
- `docs/agents/po/flow/channel-audit.md` — fix task entries in audit output to canonical shape
- `docs/agents/ba/flow/main.md` — fix backlog output to canonical shape

### Skills (F4 items — decision-journal SKILL fixes + per-agent journal paths)
- `.claude/skills/decision-journal/SKILL.md` — **Three fixes required:**
  1. **§ Resolve Sprint ID** (line 17–21): Fix jq expression from `entries[0].id` to `entries[] | select(.status == "active") | .sprint_id` (resolver bug)
  2. **§ Journal Path** (line 20–21): Change from `sprint-${SPRINT_ID}.md` to `sprint-${SPRINT_ID}-${AGENT_ID}.md` (per-agent files)
  3. **§ Cap Check** (new): Add CAP-REACHED sentinel append + bug telegram + continuation file `sprint-${SPRINT_ID}-${AGENT_ID}-2.md` logic
  4. **§ Commit Rule** (git add): Update path from `sprint-<id>.md` to `sprint-<id>-<agent-id>.md`
  5. **§ Header**: Add `AGENT_ID` as a required variable (must be set by caller from `agent.id`)

- `.claude/skills/anomaly-task-bridge/SKILL.md` — update backlog append to emit canonical `{id,title,owner,status,zone,created_at}` not freeform

### Flows Using Decision-Journal SKILL
- `docs/agents/dev-team/flow/` (triage sub-flows) — ensure journal-write calls use SKILL § Write Entry format (not freeform `## STEP` blocks)

### Decision Journal Rewrite (F4 item)
- `docs/agent-memory/decisions/sprint-2026-06-06.md` — rewrite freeform STEP blocks to canonical format:
  ```
  ### STEP <label> · <agent-id> · <timestamp>Z
  **task-id:** <task-id-or-ambient>
  **what-done:** [description]
  **what-considered:** [bullet list]
  **why-decision:** [rationale]
  **why-change:** [context]
  ```
  Example STEP to rewrite: PO channel-audit note on line 16–17 ("report 3055 CTG...") → structured STEP under task audit-slot-3 or ambient.

---

## Acceptance Criteria

1. **Resolver bug fixed:** `jq '.sprint_goal.entries[] | select(.status == "active") | .sprint_id'` returns `"ORCH-TASK-CANON"` (smoke test on live orch-state)
   
2. **SKILL per-agent path:** `.claude/skills/decision-journal/SKILL.md` § Journal Path uses `${AGENT_ID}` variable; at least one agent calls SKILL with `AGENT_ID` set
   
3. **CAP-REACHED guard:** SKILL § Cap Check appends sentinel + telegrams on 600L overflow; continuation file rollover implemented
   
4. **Task shape audit:** `jq '[.task_board.active_sprints[].tasks[] | select(has("zone") | not)] | length'` = 0 (all active tasks have zone)
   - `jq '[.task_board.active_sprints[].tasks[] | select(has("id") | not or .id == "")] | length'` = 0 (all have non-empty id)
   - `jq '[.task_board.active_sprints[].tasks[] | select(has("title") | not or .title == "")] | length'` = 0
   - `jq '[.task_board.active_sprints[].tasks[] | select(has("owner") | not or .owner == "")] | length'` = 0
   - `jq '[.task_board.active_sprints[].tasks[] | select(has("created_at") | not)] | length'` = 0

5. **No banned fields:** `jq '[.task_board.active_sprints[].tasks[] | select(has("desc") or has("label") or has("summary") or has("resolved_id"))] | length'` = 0

6. **Journal entries structured:** `docs/agent-memory/decisions/sprint-2026-06-06.md` parsed by `parseJournalFile(content, "2026-06-06")` returns `steps.length >= 2`

7. **Zero new freeform task rows:** After deploy, any NEW task created by po/pm/ba flows must have canonical shape (verified by one-off jq scan of orch-state backlog post-fix)

---

## Technical Notes

- **Decision-Journal SKILL:** All agents that call this SKILL (currently: dev-team, news-scout, bctc-analyst, cowork-team, and others) must have `AGENT_ID` available in their calling context. The SKILL must declare it as a required input variable.
  
- **Per-agent journal files:** Legacy single-file `sprint-${SPRINT_ID}.md` (no agent suffix) remains readable by `journalStore.ts` glob in F2 (back-compat). New writes go to per-agent pattern only.

- **Task-schema.md:** Link from TypeScript JSDoc in F2. This file is NOT a second source of truth — it is the rendered/readable version of the `OrchStateTaskBoardTask` interface.

- **No TypeScript changes in F1a-F4:** This is a docs-only sprint. The TypeScript interface rename happens in F2. F1a-F4 prepares the JSON data shape via flow edits + rewrite.

---

## Blockers / Risks

- **R-4 (from architect brief):** Per-agent journal path breaks if `AGENT_ID` not set in SKILL calling context. Mitigation: make `AGENT_ID` a required variable in SKILL header; audit all flow callers before commit.

- **Parallel flow edits (F1a, F4):** If both touch the same file (e.g., dev-team flow uses SKILL), serialize edits or verify no conflict.

---

## Commit Message

```
chore(doc,skill): ORCH-TASK-CANON F1a-F4 — canonical task schema + decision-journal per-agent paths + resolver fix

- Add docs/standards/task-schema.md (human-readable TypeScript interface contract)
- Fix decision-journal SKILL resolver bug (entries[0].id → select(.status=="active"))
- Implement per-agent journal file paths (sprint-${SPRINT_ID}-${AGENT_ID}.md)
- Add CAP-REACHED sentinel + continuation file (600L guard)
- Update all flows to emit canonical {id,title,owner,status,zone,created_at} task shape
- Rewrite sprint-2026-06-06.md freeform blocks to canonical STEP format
- Audit: zero banned fields, all active tasks have zone/id/title/owner/created_at
```

---

## Handoff Notes

This task has NO downstream code dependencies — it is pure documentation + SKILL + flow edits. However, it MUST be committed before F1B runs, because F1B migration script will assume the resolver bug is fixed and will read the canonical sprint ID from the active sprint entry.

After this commit lands and is verified, F1B (jq migration) can proceed.
