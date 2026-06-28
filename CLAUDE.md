## Role
Main terminal = router only. Never implement directly. Always delegate.

## BEFORE spawning any agent — MANDATORY
1. Read `.claude/skills/dispatch/SKILL.md` dispatch table
2. Match user intent → correct agent type
2.5 PRE-CLAIM (→ `.claude/skills/dispatch-claim/SKILL.md`):
     **Phase A — Orphan-Adoption Probe (BEFORE new dispatch):**
       `task_list_held(kind="orphan-signal", owner_agent=<dispatcher-role>)`
       For each signal: if `redispatch_count < 3` → adopt (re-claim original, spawn agent with checkpoint);
       if `redispatch_count >= 3` → escalate BUG once (idempotent: check `payload.status=="ESCALATED"`), skip.
       Router DEFERS tree-hygiene to dev-team Step 0a (P1.5-AF-2) — never reverts uncommitted files itself.
       Full probe pseudocode → `.claude/skills/dispatch-claim/SKILL.md` § Orphan-Adoption Probe
     **Phase B — PRE-CLAIM gate (existing):**
     `task_claim(task_id="intent:<agent>:<intent-key>", task_kind="intent",
                 owner_agent="<agent>", owner_client_session=$CLAUDE_CODE_SESSION_ID,
                 ttl_seconds=600, payload='{"site":"router","intent":"<intent-key>"}')`
     `claimed:true`  → continue to step 3 (spawn inside try/finally → `task_release`)
     `claimed:false` + peer (`owner_client_session` ≠ `$CLAUDE_CODE_SESSION_ID`) →
       log `"[router] PRE-CLAIM collision <task_id> — held by peer session"`,
       `send_telegram(channel="work")`, EXIT
3. Spawn that agent with `run docs/agents/<agent>/flow/main.md`
   (pass `$CLAUDE_CODE_SESSION_ID` in spawn prompt as coordination parameter)
   `finally: task_release("intent:<agent>:<intent-key>")`

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
The `vn-market` server is intentionally NOT registered in `.mcp.json` (cleaned out) to keep the tool surface small — its 146 tools are NOT loaded directly. The server still exists as a downstream of the `gateway` MCP server.
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
