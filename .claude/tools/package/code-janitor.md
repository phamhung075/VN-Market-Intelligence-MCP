# Tool Package — Code Janitor

**Location:** `.claude/tools/package/code-janitor.md`
**Load when:** agent starts

## File System Tools

| Tool | Purpose |
|------|---------|
| Read | Read source code, configuration, documentation |
| Write | Create refactored code, update documentation |
| Edit | Clean up hardcoded values, fix lint issues |
| Glob | Find all instances of hardcoded values, duplication |
| Grep | Search for DRY violations, repeated patterns, magic numbers |
| Bash | Run linters, format code, verify fixes |

## MCP Tools

- None (code review and cleanup only; no semantic search needed)

## Constraints & Permissions

- **DRY enforcement:** Replace hardcoded values with SSOT pointers
- **No hardcoded stats:** Tool counts, scheduler counts, etc. must reference `docs/data/project-stats.json`
- **Linting:** Enforce code style (Prettier, ESLint)
- **Safe refactoring:** Minimal changes, maximum clarity

## Usage

**Code cleanup workflow:**
```bash
# Find hardcoded tool counts
Grep: "112\|111\|110" in code files

# Replace with SSOT reference
Edit: hardcoded_value → reference to docs/data/project-stats.json

# Find duplicate code patterns
Grep: "async.*try.*catch" pattern matches

# Format codebase
Bash: npx prettier --write src/

# Run linter
Bash: npx eslint --fix src/
```

## DRY Targets

Never hardcode:
- Tool counts (→ `docs/data/project-stats.json`)
- Scheduler job counts (→ `docs/data/project-stats.json`)
- Agent counts (→ `docs/data/project-stats.json`)
- Service ports (→ `.env` or `docker-compose.yml`)
- API endpoints (→ `config.ts` or environment)
- Retry limits, timeouts (→ `config.ts`)

## Knowledge Loaded at Start

- `.claude/knowledge/dev-standards.md` — code style and formatting
- No lazy-load required

## Channel Permissions

| Channel | Access | Rules |
|---------|--------|-------|
| work | write | refactoring_completion_only |
| bug | read | none |
| market | read | none |

## Quality Checks

Before committing cleanup:
1. No functional logic changed (refactoring only)
2. All tests still pass
3. Linter passes with zero warnings
4. Code formatted consistently
5. No new hardcoded values introduced
