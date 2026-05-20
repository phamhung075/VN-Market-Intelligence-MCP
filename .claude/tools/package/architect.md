# Tool Package — Architect

**Location:** `.claude/tools/package/architect.md`
**Load when:** agent starts

## File System Tools

| Tool | Purpose |
|------|---------|
| Read | Read architecture docs, design decisions, module structure |
| Edit | Update architecture documentation, design patterns |
| Write | Create new design documents, RFC files |
| Glob | Find all architecture and design docs |
| Grep | Search for design patterns, layer violations, dependency issues |
| Bash | Analyze module dependencies, build verification |

## MCP Tools

| Tool | Purpose |
|------|---------|
| `mcp__semble__search` | Semantic search for architectural patterns |
| `mcp__semble__find_related` | Map interdependencies between modules/services |

## Constraints & Permissions

- **DDD authority:** Enforces domain/application/infrastructure layer separation
- **System design:** Owns 9-service microservices architecture
- **Escalation handler:** Called when recurring bugs detected (≥2 fixes on same module)
- **Root-cause analysis:** Investigates architectural regressions
- **No direct implementation:** Recommends fixes; developer executes

## Usage

**Architecture review workflow:**
```bash
# Find layer violations
mcp__semble__search(query="infrastructure importing from domain", limit=20)

# Map module dependencies
mcp__semble__find_related(file="/src/services/ta/domain.ts", type="imports")

# Read DDD structure
Read: docs/architecture/ddd-layers.md

# Write design decision
Write: docs/architecture/RFC_NNNN_title.md
```

## Knowledge Loaded at Start

- `reference_ddd_microservices.md` — DDD layer pattern and testing tiers
- `project_architecture_migration.md` — current 9-service Docker architecture
- `project_4layer_architecture.md` — server cron + Claude schedule + Cowork + CLI layers
- `docs/standards/mcp-tools.md` — MCP interface and tool categories

## Channel Permissions

| Channel | Access | Rules |
|---------|--------|-------|
| work | write | architecture_decisions_only |
| bug | read | root_cause_investigation |
| market | read | trend_analysis |

## Task-Lock Coordination Tools (Phase 3 — ACTIVE)

Flow-level wiring per `.claude/flows/architect/main.md` (see also `docs/architecture-briefs/2026-05-21-task-lock-phase3-devteam.md` § 1 TTL table).

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `task_claim` | Claim sprint-task lock for long brownfield scans (TTL=3600) | `task_id, task_kind, owner_agent, ttl_seconds?, payload?` |
| `task_heartbeat` | Renew held lock at flow-step boundaries | `task_id` |
| `task_release` | Release on completion (owner-session scoped) | `task_id` |

Skill: `.claude/skills/task-lock/SKILL.md` (lazy-load when implementing locks).
Protocol: `docs/protocols/task-lock-protocol.md`.

## Escalation Criteria

Called by PM when:
- ≥2 fix commits on same module within sprint
- Architectural regression detected (layer violation)
- Cross-service dependency issues
- Performance degradation tied to design choice

Delivers:
1. Root-cause analysis (why the pattern broke)
2. Design fix recommendation
3. Testing strategy (unit/integration/e2e scope)
4. Handoff to developer for implementation
