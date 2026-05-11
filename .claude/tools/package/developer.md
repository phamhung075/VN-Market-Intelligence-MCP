# Tool Package — Developer

**Location:** `.claude/tools/package/developer.md`
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

- `.claude/knowledge/dev-standards.md` — code style, module structure, DDD
- `.claude/knowledge/fail-loud-protocol.md` — error reporting
- `.claude/knowledge/cron-jobs.md` — scheduler job patterns (lazy-load)
- `.claude/knowledge/mcp-tools.md` — MCP tool reference (lazy-load)

## Channel Permissions

| Channel | Access | Rules |
|---------|--------|-------|
| work | write | task_complete_notification_only |
| bug | write | errors_only |
| market | none | — |
