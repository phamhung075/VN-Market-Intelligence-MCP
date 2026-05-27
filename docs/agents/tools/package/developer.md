# Tool Package — Developer

**Location:** `docs/agents/tools/package/developer.md`
**Load when:** agent starts

## File System Tools

| Tool | Purpose |
|------|---------|
| Read | Read file contents, source code, config files |
| Edit | Modify existing files (preferred over Write for changes) |
| Write | Create new files or complete file rewrites |
| Glob | Find files by pattern matching (e.g., `**/*.ts`) |
| Grep | Semantic/regex search in file contents |
| Bash | Execute shell commands (git, npm, build, test) |

## MCP Tools

| Tool | Purpose |
|------|---------|
| `mcp__semble__search` | Semantic code search across codebase |
| `mcp__semble__find_related` | Find related code pieces (functions, classes, imports) |

## Constraints & Permissions

- **TDD mandatory:** RED (failing test) → GREEN (pass) → REFACTOR
- **DDD strict:** domain layer never imports infrastructure
- **No `--no-verify`:** Always run pre-commit hooks
- **Max parallel tasks:** 1 (serial execution)
- **Read handoff first:** Always check TASK_NNN.md before coding

## Usage

**File tools:** Use native Claude Code tools
```bash
# Read existing file
Read file: /path/to/file.ts

# Edit with minimal diff
Edit: old_string → new_string

# Create new test file
Write: /path/to/test.ts with content
```

**MCP semantic search:** For exploring unfamiliar code
```bash
mcp__semble__search(query="find all alert handlers", limit=10)
mcp__semble__find_related(file="/path/to/file.ts", type="imports")
```

## Knowledge Loaded at Start

- `docs/policies/dev-standards.md` — code style, module structure, DDD
- `docs/protocols/fail-loud-protocol.md` — error reporting
- `docs/standards/cron-jobs.md` — scheduler job patterns (lazy-load)
- `docs/standards/mcp-tools.md` — MCP tool reference (lazy-load)

## Task-Lock Coordination Tools (Phase 3 Ready)

Tool ready — flow-level sprint-task claim/heartbeat wiring lands in Phase 3 (not yet active in flows).

```
// Sprint-task claim pattern (Phase 3)
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "task:1954b",
  task_kind:   "sprint-task",
  owner_agent: "dev-mcp-server",
  ttl_seconds: 3600,
  payload:     '{"task_title":"BCTC write-chain consolidation","zone":"apps/mcp-server"}'
})
if result.claimed == false: SKIP — held by result.current_holder.owner_agent
```

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `task_claim` | Claim sprint-task lock | `task_id, task_kind, owner_agent, ttl_seconds?, payload?` |
| `task_heartbeat` | Renew held lock every 5 min | `task_id` |
| `task_release` | Release on completion | `task_id` |
| `task_list_held` | List/audit current locks | `kind?, owner_agent?, expired?` |

Full protocol: `docs/protocols/task-lock-protocol.md` | Skill: `.claude/skills/task-lock/SKILL.md`

---

## Channel Permissions

| Channel | Access | Rules |
|---------|--------|-------|
| work | write | task_complete_notification_only |
| bug | write | errors_only |
| market | none | — |
