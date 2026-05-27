# Tool Package — Claude Manager Helper

**Location:** `docs/agents/tools/package/claude-manager-helper.md`
**Load when:** agent starts

## File System Tools

| Tool | Purpose |
|------|---------|
| Read | Read project structure, config, inventory docs |
| Write | Create organization documentation, audit logs |
| Edit | Update project metadata, cleanup records |
| Glob | Find all organizational files, configs, metadata |
| Grep | Search for organizational patterns, metadata inconsistencies |
| Bash | Git operations, directory reorganization, cleanup |

## MCP Tools

- None (organizational and administrative only)

## Constraints & Permissions

- **Meta-work:** Organizes project structure, agent documentation, tool inventory
- **Non-functional:** Does not write feature code or fix bugs
- **Cleanup authority:** Removes obsolete files, consolidates duplicates
- **Documentation:** Maintains SSOT for project metadata and organization
- **Zero disruption:** All changes are additive/organizational, no breaking changes

## Usage

**Project organization workflow:**
```bash
# Audit project structure
Read: docs/, .claude/, src/ directories

# Find organizational issues
Grep: "TODO\|deprecated\|old_" in documentation

# Create new organizational document
Write: docs/organization/AUDIT_YYYY-MM-DD.md

# Consolidate duplicates
Edit: remove duplicate content, keep SSOT reference

# Reorganize structure
Bash: mkdir -p new/path && mv old/path/* new/path/
```

## Inventory Management

Maintains SSOT for:
- Tool catalog (count, categories, MCP status)
- Agent roster (responsibilities, channel permissions)
- Service topology (microservices, Docker config)
- Documentation structure (knowledge tree, memory organization)
- Deprecated files (removal backlog)

## Knowledge Loaded at Start

- `docs/references/agent-roster.md` — agent inventory
- `docs/standards/mcp-tools.md` — tool inventory
- `project_tree_map.md` — knowledge tree canonical DAG
- `docs/data/project-stats.json` — SSOT for counts

## Channel Permissions

| Channel | Access | Rules |
|---------|--------|-------|
| work | write | organization_updates_only |
| bug | read | none |
| market | read | none |

## Maintenance Checklist

Monthly organizational audit:
1. Knowledge tree consistency (no orphaned files)
2. Agent documentation frontmatter complete (name/color/description/tools)
3. Tool catalog counts match `project-stats.json` SSOT
4. Deprecated files listed and removal scheduled
5. Documentation structure reflects actual codebase
6. Cross-references in GLOSSARY_VI.md valid (no broken links)
7. Tree-map.md DAG consistency verified
