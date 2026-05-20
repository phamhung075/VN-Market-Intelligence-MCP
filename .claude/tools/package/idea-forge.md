# Tool Package — Idea Forge

**Location:** `.claude/tools/package/idea-forge.md`
**Load when:** agent starts

## File System Tools

| Tool | Purpose |
|------|---------|
| Read | Read architecture, codebase structure, current design |
| Glob | Find related modules, services, design patterns |
| Grep | Search for potential improvements, design gaps |

## MCP Tools

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `task_claim` | Claim sprint-task lock for long design cycles (TTL=3600) | `task_id, task_kind, owner_agent, ttl_seconds?, payload?` |
| `task_heartbeat` | Renew held lock at flow-step boundaries | `task_id` |
| `task_release` | Release on completion (owner-session scoped) | `task_id` |

## Task-Lock Coordination Tools (Phase 3 — ACTIVE)

Flow-level wiring per idea-forge flow (see also `docs/architecture-briefs/2026-05-21-task-lock-phase3-devteam.md` § 5).

Skill: `.claude/skills/task-lock/SKILL.md` (lazy-load when implementing locks).
Protocol: `docs/protocols/task-lock-protocol.md`.

## Constraints & Permissions

- **Brainstorm authority:** Generates design ideas and feature concepts
- **Exploration-focused:** Reads and searches; no writing or code changes
- **Context-driven:** Reads current architecture before proposing solutions
- **No implementation:** Generates ideas only; developer/architect executes

## Usage

**Brainstorming workflow:**
```bash
# Read current architecture before ideation
Read: docs/architecture/4-layer-architecture.md

# Understand service topology
Read: docker-compose.yml, src/services/ structure

# Search for related patterns
Grep: "async.*alert\|scheduled.*task" patterns

# Explore potential improvement areas
Read: docs/data/project-stats.json, performance metrics
```

## Brainstorm Process

1. Load current architecture (mandatory before proposing changes)
2. Identify constraints and trade-offs
3. Generate 3-5 alternative approaches
4. Document pros/cons for each
5. Recommend approach with rationale
6. Handoff to PO/Architect for prioritization

## Knowledge Loaded at Start

- `project_4layer_architecture.md` — current 4-layer system design
- `project_architecture_migration.md` — 9-service Docker topology
- `docs/standards/mcp-tools.md` — available tool capabilities
- `docs/data/project-stats.json` — project metrics and scope

## Channel Permissions

| Channel | Access | Rules |
|---------|--------|-------|
| work | read | brainstorm_context_only |
| market | read | none |
| bug | read | none |

## Quality Gates for Ideas

Before submitting brainstorm output:
1. Architecture context was read and understood
2. Idea respects current DDD layer separation
3. Trade-offs documented (speed/complexity/maintenance)
4. Existing similar patterns checked (no reinvention)
5. Connection to user goals or business metrics explicit
6. Feasibility assessment included (estimated effort tier)
