# Agents Architect — Main Dispatcher

Universal entry for the agents-architect agent. The full operating cycle is defined **inline** in the agent definition file (see Reference below) — this dispatcher exists so callers always use `run .claude/flows/agents-architect/main.md`, never a hardcoded path.

**Tools:** `.claude/tools/package/architect.md` (reused — see agent file `tools_package` field)

## Inputs

One of:
- `trigger` — `manual` | `user_request` | `tnb_signal` (from `tran-ngoc-bau`)
- `topic` — free-text description of the architecture concern (e.g. "add sentiment microservice", "rework signal bus")

## Dispatch

| Spawn context | Entry |
|---|---|
| User-typed architecture question / brief request | Run the inline cycle in `.claude/agents/agents-architect.md` § Operating Cycle (Steps 0–6) |
| TNB signal (system quality gap) | Same inline cycle, with the signal payload as Step 2 input |
| Direct call from agent-father (clarification needed before implementation) | Same inline cycle, scoped to the agent/flow under question |

There is **no sub-flow split** because every invocation produces the same artifact set:
- `docs/architecture-briefs/<UTC-DATE>-<slug>.md` (the brief)
- `docs/signals/<slug>.json` (signal to agent-father)
- Notebook + atomic commit (Brief-Commit Invariant — non-negotiable)

## Behavior

1. Read this dispatcher.
2. Jump to `.claude/agents/agents-architect.md` § **Operating Cycle (Inline Flow)** — execute Step 0 through RETURN end-to-end.
3. Honour the **Brief-Commit Invariant** (Steps 1–3 of that section in the agent file). Skipping it = brief not complete.
4. Return the block defined at the bottom of the inline flow.

## Reference

- Agent definition + inline cycle: `.claude/agents/agents-architect.md`
- Dispatch SSOT: `.claude/skills/dispatch/SKILL.md` (routes "inter-agent architecture / brief" intent here)
- Output protocol: `docs/architecture-briefs/` + `docs/signals/`
