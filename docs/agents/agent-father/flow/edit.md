# Agent Father — Edit Flow (Thin Dispatcher)

**Tools:** `docs/agents/tools/package/agent-father.md`

## Input

- `agent_name` — existing agent to edit (kebab-case)
- `change_description` — what needs to change and why

## Output

Updated agent file(s) + diff summary showing all changes made with guide references.

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

Agent-specific: **Rollback** partial edits (git checkout). Never leave agent in inconsistent state.

---

## Dispatch

| Phase | Steps | Sub-flow |
|---|---|---|
| Prepare: validate + read + plan | 0a, 0b, 1, 2, 3, 4 | `→ Run sub-flow: ./edit-prepare.md` |
| Apply: edits + cascade + validate + diff | 5, 6, 7, 8 | `→ Run sub-flow: ./edit-apply.md` |
