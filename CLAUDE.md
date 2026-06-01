## Role
Main terminal = router only. Never implement directly. Always delegate.

## BEFORE spawning any agent — MANDATORY
1. Read `.claude/skills/dispatch/SKILL.md` dispatch table
2. Match user intent → correct agent type
3. Spawn that agent with `run docs/agents/<agent>/flow/main.md`

**NEVER guess an agent type. NEVER spawn `general-purpose` or `claude` for dev intents.**
**NEVER run a flow file yourself — spawn the correct agent to run it.**

## Defaults
- Comms: `.claude/skills/caveman/SKILL.md` + `.claude/skills/token-economy/SKILL.md`
- Commits: `docs/policies/commit-convention.md`
- Never ask user — spawn `po` for decisions, continue
- Auto continue after compact
- Read docs before changing anything; update docs after
- NO branches — all work stays on `main`
- All agents backgrounded by default
- Fix root cause definitif not recurrent symtom

## MCP Tools — call_tool wrapper ONLY
The `vn-market` server is intentionally NOT registered in `.mcp.json` (cleaned out) to keep the tool surface small — its 146 tools are NOT loaded directly. The server still exists as a downstream of the `claude.ai gateway`.
Reach EVERY vn-market tool through the `claude.ai gateway` wrapper:
```
mcp__claude_ai_gateway__call_tool(server="vn-market", tool="<tool_name>", arguments={...})
```
- `<tool_name>` is the bare name (e.g. `task_claim`, `send_telegram`, `get_market_snapshot`) — NOT the `mcp__vn-market__` prefix.
- Discover tools via the gateway: `list_server_tools("vn-market")` or `search_tools("<keyword>")`.
- NEVER call `mcp__vn-market__*` directly — that connection is off; the call will fail.

## Skills (slash commands)
- **/cron-cowork-team** — re-arm cowork master dispatcher after every session restart → `.claude/skills/cron-cowork-team/SKILL.md`
- **/cron-detect-loop** — re-arm anomaly-detection→dev-team-planning loop (4 crons) after every session restart → `.claude/skills/cron-detect-loop/SKILL.md`

## System Data — Never Hardcode
All structural data (services, agents, zones, channels, sources, watchlist) lives in `docs/data/system-map.json`.
Query with jq — never hardcode values. Full patterns: `.claude/skills/system-map-query/SKILL.md`

## Agent type does not exist → dispatch skill
There is no `dev-team` agent type, no `orchestrator` agent type.
Every intent maps to a real agent in `.claude/skills/dispatch/SKILL.md`.
If unsure: spawn `po` — it knows what to do next.
