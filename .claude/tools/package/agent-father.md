# Tool Package — Agent Father

**Location:** `.claude/tools/package/agent-father.md`
**Load when:** agent starts

## File System Tools

| Tool | Purpose |
|------|---------|
| Read | Read agent definitions, flows, guide sections, knowledge files |
| Write | Create new agent files, flow files, notebooks, tool packages |
| Edit | Update existing agent definitions, flows, registration files |
| Glob | Find all agent files, flow directories, notebooks, tool packages |
| Grep | Search guide sections by heading, find patterns across agent files |
| Bash | Git operations, directory creation, file existence checks |

## MCP Tools

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `task_claim` | Claim sprint-task lock in edit-apply.md step 5a | `task_id, task_kind, owner_agent, ttl_seconds?, payload?` |
| `task_heartbeat` | Renew lock after cascade validation (step 7b) | `task_id` |
| `task_release` | Release after diff summary (step 8b) | `task_id` |
| `task_list_held` | Audit fleet locks during compliance sweeps | `kind?, owner_agent?, expired?` |

## Task-Lock Coordination Tools (Phase 3 — ACTIVE)

Flow-level wiring per `.claude/flows/agent-father/edit-apply.md` steps 5a/7b/8b (see also `docs/architecture-briefs/2026-05-21-task-lock-phase3-devteam.md` § 2 + 4.8).

Skill: `.claude/skills/task-lock/SKILL.md` (lazy-load when implementing locks).
Protocol: `docs/protocols/task-lock-protocol.md`.

## Constraints & Permissions

- **Guide enforcer:** All agent content must trace to `docs/AGENT_CREATION_GUIDE.md`
- **Non-functional:** Does not write production code (*.ts, *.py) or fix bugs
- **Read-only guide:** Never modifies `docs/AGENT_CREATION_GUIDE.md` itself
- **Zone-scoped writes:** Only creates/edits agent definitions, flows, tool packages, notebooks
- **Registration authority:** Edits roster, CLAUDE.md routing, dispatch table for agent entries only
- **Auto-fix boundary:** Only mechanical fixes (missing fail_loud, stale version dates, missing roster entries). Structural issues require user decision.

## Usage

**Guide section loading (token-efficient):**
```bash
# Load TOC only (30 lines, ~80 tokens)
Read: docs/AGENT_CREATION_GUIDE.md offset=1 limit=30

# Find specific section by heading
Grep: "^## 5\." docs/AGENT_CREATION_GUIDE.md

# Load one section (e.g., YAML Frontmatter)
Read: docs/AGENT_CREATION_GUIDE.md offset=<start> limit=<section_length>
```

**Agent ecosystem discovery:**
```bash
# All agent definitions
Glob: .claude/agents/*.md

# All flow directories
Glob: .claude/flows/*/

# All tool packages
Glob: .claude/tools/package/*.md

# All notebooks
Glob: docs/agent-memory/notebooks/*.md
```

**Compliance checking:**
```bash
# Check YAML frontmatter fields
Grep: "^name:|^color:|^description:|^tools:|^model:" .claude/agents/<agent>.md

# Check fail-loud protocol reference
Grep: "fail-loud-protocol" .claude/agents/<agent>.md

# Check Error Boundary in flow
Grep: "Error Boundary" .claude/flows/<agent>/*.md
```

## Channel Permissions

| Channel | Access | Rules |
|---------|--------|-------|
| work | write | agent_lifecycle_notifications_only |
| bug | write | guide_violations_and_structural_errors |
| market | none | never |
