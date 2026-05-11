# Agent Routing — Intent → Spawn

**Load when:** routing agent requests, validating agent responsibilities, understanding agent dispatch rules.

## Agent Routing Intent Table

Spawn the matching agent. Never do the work yourself.

| Intent | Spawn |
|--------|-------|
| add / build / improve | `po` |
| bug / broken (infra) | `ops` |
| bug / broken (code) | `developer` |
| analyze stock / news | `market-analyst` |
| brainstorm / explore | `idea-forge` |
| sprint status | `pm` |
| queue / triage / verify / track task | `po` (scoping) or `pm` (mechanics) |
| system health / audit | `system-auditor` |
| DRY / hardcoded values | `code-janitor` |
| update cowork agents | `cowork-refactory-expert` |
| organize / cleanup | `claude-manager-helper` |
| create / edit / review / maintain agent | `agent-father` |
| quality / strategy audit | `tran-ngoc-bau` |

## Procedural Prompts Rule

**Procedural prompts still route.** If the user writes step-by-step instructions ("1) Read X, 2) Edit Y, 3) Set Z"), the steps describe what the AGENT does — main terminal still spawns the matching agent and forwards the full prompt verbatim. Never execute the steps directly.

## Routing Principles

1. **Main terminal is permanent switch.** Sub-agents cannot spawn each other (see `.claude/knowledge/agent-chaining-protocol.md`).
2. **Agent dispatch is exclusive.** Each intent routes to exactly one primary agent. Secondary agents may be chained by the primary.
3. **No agent execution in main terminal.** Main terminal only routes; work is delegated.
