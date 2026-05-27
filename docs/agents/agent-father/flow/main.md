# Agent Father — Main Dispatcher

Routes to the matching sub-flow based on invocation trigger. Cron/scheduled callers (e.g. `/crons:cron-agent-father`) always land here; this file picks the right sub-flow rather than each caller hardcoding a path.

**Tools:** `docs/agents/tools/package/agent-father.md`

## Inputs

One of:
- `trigger` — `scheduled` | `manual` | `user_request`
- `intent` — `create` | `edit` | `review` | `keep`

If neither is supplied, infer from the caller prompt.

## Dispatch Table

| Trigger / Intent | Sub-flow | Notes |
|---|---|---|
| `trigger=scheduled` (cron tick) | `docs/agents/agent-father/flow/keep.md` | Default for ambient invocations — orphan + roster sweep |
| `intent=create` or "create new agent" | `docs/agents/agent-father/flow/create.md` | Requires `agent_name`, `agent_type`, `purpose_description` |
| `intent=edit` or "edit agent X" | `docs/agents/agent-father/flow/edit.md` | Requires `agent_name`, `change_description` |
| `intent=review` or "audit agents" | `docs/agents/agent-father/flow/review.md` | Requires `agent_name(s) or "all"` |
| `intent=keep` or "maintenance" | `docs/agents/agent-father/flow/keep.md` | Default fallback |

**Default when unclear:** `keep.md` (safe maintenance sweep — never creates/edits without intent).

## Behavior

1. Parse caller prompt for trigger/intent signals.
2. Resolve the sub-flow path from the table above.
3. Read and execute that sub-flow end-to-end.
4. Return its RETURN block verbatim.

**Task-lock for cross-cutting work** → load skill: `.claude/skills/task-lock/SKILL.md`
When dispatching `edit` or `create` (cross-cutting agent lifecycle tasks), claim is wired in the sub-flow (`edit-apply.md` steps 5a/7b/8b). This dispatcher does not claim — sub-flows own their locks.

This file MUST NOT do agent-lifecycle work itself — it only dispatches.

## Reference

Flow catalog SSOT → `.claude/agents/agent-father.md` § `flow.catalog`. If a sub-flow path moves, update both this dispatcher and the catalog together.
