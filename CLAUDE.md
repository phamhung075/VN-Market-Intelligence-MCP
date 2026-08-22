## Role
Main terminal = router only. Never implement directly. Always delegate.

## BEFORE spawning any agent — MANDATORY
1. Read `.claude/skills/dispatch/SKILL.md` dispatch table
2. Match user intent → correct agent type
2.5 PRE-CLAIM — Step 0a (session-presence) + Phase A (orphan-adoption) + Phase A.5 (presence roster) + Step 2.4 (cowork-slot collision probe, cowork-slot agents only) + Phase B (claim gate) per `.claude/skills/dispatch-claim/CARD.md`.
     Full claim call + claimed/re-entrant/peer-collision outcomes: CARD.md (hot path); full spec: sibling SKILL.md.
3. Spawn that agent with `run docs/agents/<agent>/flow/main.md`
   (pass `$CLAUDE_CODE_SESSION_ID` in spawn prompt as coordination parameter)

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
- Detect then reduce debt, dead code, remove garbage, trash data, hardcode
- Reusable scripts → `scripts/` NEVER `/tmp`; then add pointer in owning flow doc → `docs/policies/dev-standards.md` § Script Persistence

## MCP Tools — call_tool wrapper ONLY
The `vn-market` server is intentionally NOT registered in `.mcp.json` (cleaned out) to keep the tool surface small — its [generated count — see docs/data/tool-registry.json] tools are NOT loaded directly. The server still exists as a downstream of the `gateway` MCP server.
`https://zenmidi.com/gateway/mcp` is the correct canonical `.mcp.json` gateway URL — confirmed by the user 2026-08-22. Do NOT repoint it to a localhost/loopback shortcut (e.g. `http://127.0.0.1:4040/...`) even as an outage workaround — that breaks parity with every other session/agent reading the same committed `.mcp.json`. If the gateway is unreachable, the bug is in the local TLS bridge (`launchd/com.vn-market.socat-tls-bridge.plist`, socat on `127.0.0.1:443` → `127.0.0.1:4040`) — fix that, never the URL.
Reach EVERY vn-market tool through the `gateway` wrapper:
```
mcp__gateway__call_tool(server="vn-market", tool="<tool_name>", arguments={...})
```
- `<tool_name>` is the bare name (e.g. `task_claim`, `send_telegram`, `get_market_snapshot`) — NOT the `mcp__vn-market__` prefix.
- Discover tools via the gateway: `list_server_tools("vn-market")` or `search_tools("<keyword>")`.
- NEVER call `mcp__vn-market__*` directly — that connection is off; the call will fail.
- Preflight reference for all 6 tool-call error classes → `docs/standards/gateway-call-contract.md`

## Skills (slash commands)
- **/cron-cowork-team** — re-arm cowork master dispatcher after every session restart → `.claude/skills/cron-cowork-team/SKILL.md`
- **/cron-detect-loop** — re-arm anomaly-detection→dev-team-planning loop (4 crons) after every session restart → `.claude/skills/cron-detect-loop/SKILL.md`
- **/cron-standalone-team** — re-arm the (4 standalone crons) (db-data-integrity, agent-father, claude-manager-helper, code-janitor) after every session restart → `.claude/skills/cron-standalone-team/SKILL.md`

## System Data — Never Hardcode
All structural data (services, agents, zones, channels, sources, watchlist) lives in `docs/data/system-map.json`.
Query with jq — never hardcode values. Full patterns: `.claude/skills/system-map-query/SKILL.md`

## Orch-State Hot File — Write Contract
EVERY write to `docs/data/orch/orch-state.json` MUST route via `scripts/orch-apply.sh`:
`jq '<transform>' docs/data/orch/orch-state.json | bash scripts/orch-apply.sh`
NEVER raw `mv`/`cp`/`>`/full-doc overwrite. Validates (Zod + dup-key), CAS-guards, atomic rename.
Full spec: `docs/policies/dev-standards.md` CANONICAL:SSOT-W1-ORCH-APPLY-WRAPPER.

## Agent type does not exist → dispatch skill
There is no `dev-team` agent type, no `orchestrator` agent type.
Every intent maps to a real agent in `.claude/skills/dispatch/SKILL.md`.
If unsure: spawn `po` — it knows what to do next.
