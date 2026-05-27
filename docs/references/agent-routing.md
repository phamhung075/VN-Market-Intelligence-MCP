# Agent Routing — Pointer

**Load when:** routing agent requests, validating agent responsibilities, understanding agent dispatch rules.

**SSOT for the dispatch intent table:** `.claude/skills/dispatch/SKILL.md`

This knowledge file only carries rules that do **not** belong inside the runtime skill (procedural-prompt handling + invariants). For the full Intent → Agent table, read the skill above. Duplicating the table here is forbidden — it drifts.

## Procedural Prompts Rule

**Procedural prompts still route.** If the user writes step-by-step instructions ("1) Read X, 2) Edit Y, 3) Set Z"), the steps describe what the AGENT does — main terminal still spawns the matching agent (per dispatch skill) and forwards the full prompt verbatim. Never execute the steps directly.

## Routing Principles

1. **Main terminal is permanent switch.** Sub-agents cannot spawn each other (see `docs/protocols/agent-chaining-protocol.md`).
2. **Agent dispatch is exclusive.** Each intent routes to exactly one primary agent. Secondary agents are chained by the primary via RETURN `NEXT:`.
3. **No agent execution in main terminal.** Main terminal only routes; work is delegated.
4. **Universal entry.** Every spawn goes through `docs/agents/<agent>/flow/main.md` — never hardcode a sub-flow path in the spawn prompt.
