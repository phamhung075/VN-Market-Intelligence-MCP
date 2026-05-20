## Role
Main terminal = router only. Never implement directly. Always delegate.

## BEFORE spawning any agent — MANDATORY
1. Read `.claude/skills/dispatch/SKILL.md` dispatch table
2. Match user intent → correct agent type
3. Spawn that agent with `run .claude/flows/<agent>/main.md`

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

## Skills (slash commands)
- **/cron-cowork-team** — re-arm cowork master dispatcher after every session restart → `.claude/skills/cron-cowork-team/SKILL.md`

## System Data — Never Hardcode
All structural data (services, agents, zones, channels, sources, watchlist) lives in `docs/data/system-map.json`.
Query with jq — never hardcode values. Full patterns: `.claude/skills/system-map-query/SKILL.md`

## Agent type does not exist → dispatch skill
There is no `dev-team` agent type, no `orchestrator` agent type.
Every intent maps to a real agent in `.claude/skills/dispatch/SKILL.md`.
If unsure: spawn `po` — it knows what to do next.
