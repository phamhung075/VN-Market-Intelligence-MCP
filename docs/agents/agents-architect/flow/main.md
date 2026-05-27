# Agents Architect — Main Dispatcher

Universal entry. The operating cycle lives in `docs/agents/agents-architect/handlers.md`; this dispatcher routes every caller (cron, user, TNB) to that handler so no path is hardcoded.

**Tools:** `docs/agents/tools/package/architect.md` (reused — see agent `tools_package` field).

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

## Inputs

One of:
- `trigger` — `manual` | `user_request` | `tnb_signal` (from `tran-ngoc-bau`)
- `topic` — free-text architecture concern (e.g. "add sentiment microservice", "rework signal bus")

## Dispatch

| Spawn context | Action |
|---|---|
| User-typed architecture question / brief request | → Run handler: `docs/agents/agents-architect/handlers.md` § **Operating Cycle** |
| TNB signal (system quality gap) | Same handler, signal payload as Step 2 input |
| Direct call from agent-father (clarification before implementation) | Same handler, scoped to the agent/flow under question |
| DASHBOARD.md has `status=NEW` rows of type `improvement_proposal` | → Run handler: `docs/agents/agents-architect/handlers.md` § **Improvement-Proposal Review** |

There is **no sub-flow split** — every invocation produces the same artifact set:
- `docs/architecture-briefs/<UTC-DATE>-<slug>.md` (the brief)
- `docs/signals/<slug>.json` (signal to agent-father)
- Notebook + atomic commit (Brief-Commit Invariant — non-negotiable)

## Behavior

1. Read this dispatcher.
2. → Run handler: `docs/agents/agents-architect/handlers.md` § **Operating Cycle (Inline Flow)** — Step 0 through RETURN end-to-end.
3. Honour the **Brief-Commit Invariant** at the top of that file (Steps 1–3). Skipping it = brief not complete.
4. Return the RETURN block verbatim.

## Reference

- Operating cycle + Brief-Commit Invariant: `docs/agents/agents-architect/handlers.md`
- Agent definition: `.claude/agents/agents-architect.md`
- Dispatch SSOT: `.claude/skills/dispatch/SKILL.md` (routes "inter-agent architecture / brief" intent here)
- Output: `docs/architecture-briefs/` + `docs/signals/`
