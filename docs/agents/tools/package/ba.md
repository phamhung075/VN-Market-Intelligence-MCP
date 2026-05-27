# Tool Package — Business Analyst (BA)

**Location:** `docs/agents/tools/package/ba.md`
**Load when:** agent starts

## File System Tools

| Tool | Purpose |
|------|---------|
| Read | Read requirements, specs, user stories, acceptance criteria |
| Edit | Update specification documents, user story acceptance criteria |
| Write | Create new requirements docs, specification files |
| Glob | Find all requirements and specification files |
| Grep | Search for acceptance criteria, requirements dependencies |
| Bash | Git operations, documentation audits |

## MCP Tools

| Tool | Purpose |
|------|---------|
| `mcp__semble__search` | Find related requirements, feature implications |
| `mcp__semble__find_related` | Trace requirement through implementation |

## Constraints & Permissions

- **Requirements authority:** Owns acceptance criteria and spec clarity
- **Stakeholder proxy:** Represents user needs and business goals
- **Spec-driven:** All developer work traces back to written requirements
- **QA collaboration:** Works with QA to ensure spec completeness

## Usage

**Requirements workflow:**
```bash
# Find all acceptance criteria for feature
mcp__semble__search(query="acceptance criteria payment flow", limit=15)

# Trace spec to implementation
mcp__semble__find_related(file="/docs/specs/FEATURE_NNN.md", type="references")

# Read user story
Read: /docs/requirements/USER_STORY_NNN.md

# Update acceptance criteria
Edit: acceptance_criteria section with new conditions
```

## Knowledge Loaded at Start

- `docs/{policies,protocols,standards,references}/stock-classification.md` — domain concepts (sectors, tiers)
- `docs/policies/alert-policy.md` — business rules and alert definitions (lazy-load)
- `docs/GLOSSARY_VI.md` — Vietnamese financial terminology (lazy-load)
- `docs/standards/mcp-tools.md` — tool capabilities context

## Channel Permissions

| Channel | Access | Rules |
|---------|--------|-------|
| work | write | requirements_clarification_only |
| market | write | user_story_validation |
| bug | read | impact_assessment |

## Task-Lock Coordination Tools (Phase 3 — ACTIVE)

Flow-level wiring per BA flow (see also `docs/architecture-briefs/2026-05-21-task-lock-phase3-devteam.md` § 1 TTL table).

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `task_claim` | Claim sprint-task lock for spec writing (TTL=1800) | `task_id, task_kind, owner_agent, ttl_seconds?, payload?` |
| `task_heartbeat` | Renew held lock at flow-step boundaries | `task_id` |
| `task_release` | Release on completion (owner-session scoped) | `task_id` |

Skill: `.claude/skills/task-lock/SKILL.md` (lazy-load when implementing locks).
Protocol: `docs/protocols/task-lock-protocol.md`.

## Quality Gates

Before marking requirements complete:
1. Acceptance criteria are SMART (Specific, Measurable, Achievable, Relevant, Time-bound)
2. Dependencies on other features are documented
3. Edge cases are listed (validation failures, edge data, etc.)
4. QA sign-off on spec clarity
5. No ambiguous terms (define or reference GLOSSARY_VI.md)
