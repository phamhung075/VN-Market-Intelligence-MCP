> Parent: [./edit.md](./edit.md)

# Agent Father — Edit: Apply Phase (Steps 5–8)

**5a. Claim cross-cutting task lock** → load skill: `.claude/skills/task-lock/SKILL.md`

`owner_client_session` is REQUIRED (no default — coordinationTools.ts:104-110, P1-FINAL/TASK_1980).
Resolve the ACTUAL value of your session's `CLAUDE_CODE_SESSION_ID` (Bash: `echo
$CLAUDE_CODE_SESSION_ID`) and reuse that SAME resolved value for 5a/7b/8b below — NEVER write the
literal text `$CLAUDE_CODE_SESSION_ID` inside a `call_tool` argument (an LLM-issued call is a direct
function call, not a shell command, so the variable is not expanded; session memory:
`feedback_llm_issued_call_tool_does_not_expand_session_id_variable`).
```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:               "task:" + task_id,
  task_kind:              "sprint-task",
  owner_agent:            "agent-father",
  owner_client_session:   "<resolved CLAUDE_CODE_SESSION_ID>",
  ttl_seconds:            3600,
  payload:     '{"task_title":"' + change_description + '","files":' + JSON.stringify(target_files) + '}'
})
if not result.claimed:
  → Apply migration check per `.claude/skills/task-lock/SKILL.md` § On claim-fail
```

**Gateway-less exception (confirmed live 2026-08-06/2026-08-07 — matches `keep.md`'s own
self-healed note):** `.claude/agents/agent-father.md`'s tool grant is `Read, Edit, Write, Bash`
(no `mcp__gateway__call_tool` binding), so `call_tool(...)` above (and the matching
`task_heartbeat`/`task_release` calls at 7b/8b) is unreachable for a spawned agent-father
session. Fallback: replicate `claimTask()`/`heartbeatTask()`/`releaseTask()`'s exact SQL
verbatim (`apps/mcp-server/src/infrastructure/db/coordinationStore.ts`) via
`docker exec <mcp-server-container> bun -e "..."` against `COORDINATION_DB_PATH` (`task_locks`
table) — same statements the MCP tools run, not a business-logic bypass. Live-verify no
conflicting row exists first (`SELECT * FROM task_locks WHERE task_id = ?`) before the `INSERT
OR IGNORE`. If docker is also unreachable, fall back further to `commit-boundary/SKILL.md`'s
"Solo operation" exception (orch-state `.head.wip ≤ 1`) and skip the lock — log the gap in the
notebook, do not silently skip logging it.

**5. Apply edits**

Use `Edit` tool (not Write) for existing files. For each edit:
- Match `old_string` exactly from the file (read first)
- Apply `new_string` per guide pattern
- Update `version` date to today

Order of operations for consistency:
1. Agent definition first (source of truth)
2. Flow files second (must match definition)
3. Tool package third (if tools changed)
4. Registration files last (roster, CLAUDE.md, dispatch)

**6. Cascade check**

If the edit changed any of these, propagate:

| Changed | Cascade To |
|---------|-----------|
| `name` | ALL files — rename agent .md, flow dir, tool package, notebook, roster, CLAUDE.md, dispatch |
| `flow.default` or `flow.catalog` | Verify new paths exist, create if needed |
| `knowledge.always_load` | Verify referenced files exist |
| `inter_agent.recv/send` | Check partner agent's send/recv matches |
| `permissions.channels` | Verify roster matches |
| `tools` (frontmatter) | Verify tool package matches |

**7. Validate post-edit**

Re-read all edited files and run checks:
- [ ] YAML frontmatter still valid (5 required fields)
- [ ] All `knowledge.always_load` paths resolve
- [ ] All `flow.catalog` paths resolve
- [ ] `inter_agent` routing is symmetric with partner agents
- [ ] Version date updated to today

**7b. Heartbeat lock** → `call_tool(server="vn-market", tool="task_heartbeat", arguments={task_id: "task:" + task_id, owner_client_session: "<same resolved value as Step 5a>"})`
if hb.ok == false: → stolen-lock protocol per skill

**8. Diff summary**

Produce human-readable summary:
```
## Changes Applied to <agent_name>

### Files Modified
- `.claude/agents/<name>.md` — <what changed>
- `docs/agents/<name>/flow/main.md` — <what changed>

### Guide References
- Section 5.6: constraints must include tdd_mandatory for dev agents
- Section 6.2: every dev flow needs TDD step

### Cascade Updates
- (none) | Updated partner agent X routing
```

**8b. Release lock** → `call_tool(server="vn-market", tool="task_release", arguments={task_id: "task:" + task_id, owner_client_session: "<same resolved value as Step 5a>"})`

---

**Notebook commit** — append to `docs/agent-memory/notebooks/agent-father.md`:
```
### Edit (<agent_name>) HH:MM
- Change: <one-line summary>
- Files modified: N
- Cascade: <none | list>
- Validation: N/5 passed
- Decision: <why this change was made, guide ref>
```
**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/agent-father.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/agent-father.md
git commit -m "chore(memory/agent-father): notebook YYYY-MM-DD" -- docs/agent-memory/notebooks/agent-father.md
```

**Notebook write** → skill: `.claude/skills/notebook-write/SKILL.md`

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

## RETURN

```
DONE: Edited agent <agent_name> — N files modified, M cascade updates
NEXT: qa (smoke-test edited agent invocation if behaviour change is testable) | idle (otherwise — next agent-father cron will sweep)
PIPELINE: complete
QUALITY: full | partial
```
