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
| `signal type=improvement_approved_md` (from PO via signal file) | `docs/agents/agent-father/flow/edit.md` | **C-1 input contract (mandatory):** Read the proposal doc at `payload` path. Extract structured fields ONLY — `## target_agent` (kebab-case) and `## target_files` list. DO NOT parse free-text `## Proposed Change` prose to derive the target. FAIL-LOUD reject (set proposal `status=REJECTED`, write `send_telegram(channel="bug", message="[agent-father] FAIL-LOUD: improvement_approved_md rejected — target_agent absent or invalid: {id}")`, EXIT) if: (a) `## target_agent` field is missing or empty; (b) `target_agent` value is not a valid kebab-case agent id matching a file in `.claude/agents/`; (c) `## target_files` is missing or empty. Pass `agent_name={target_agent}` and `change_description` (derived from `## Proposed Change` prose plus the exact `target_files` list as the edit scope) into `edit.md`. **C-2 status lifecycle:** after `edit.md` completes cleanly, update proposal `status=IMPLEMENTING` (NOT DONE). Set `status=DONE` ONLY after the next system-auditor freshness/audit tick re-checks the original weakness and confirms the Success Signal is met — fill `success_verified_by: system-auditor` + `success_verified_date: {date}`. Verify the edited file is in `target_files[]`; if not, treat as a mis-targeted edit — rollback via `git checkout` and set `status=DRAFT` with a note, then FAIL-LOUD BUG alert. |

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

**DJ-GATE-1** (before any task DONE/REVIEW flip): run skill `.claude/skills/decision-journal/SKILL.md` § Write Entry — gate: `docs/protocols/agent-chaining-protocol.md` § Journal-before-DONE Gate.

**Skills available to this agent (lazy-load — load only when the task requires it):**
- Create or improve skills (SKILL.md authoring + eval loop) → skill: `.claude/skills/skill-creator/SKILL.md` (trigger: task explicitly requires writing a new SKILL.md file or iterating on an existing one — not for routine agent lifecycle edits)
