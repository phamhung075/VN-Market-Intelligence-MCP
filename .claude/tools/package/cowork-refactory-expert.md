# Tool Package — Cowork Refactory Expert

**Location:** `.claude/tools/package/cowork-refactory-expert.md`
**Load when:** agent starts

## File System Tools

| Tool | Purpose |
|------|---------|
| Read | Read agent documentation, cowork prompts, workflow files |
| Edit | Update agent prompt definitions, refine instructions |
| Write | Create new cowork workflow documentation |
| Glob | Find all agent documentation and prompt files |
| Grep | Search for cowork instruction gaps, inconsistencies |
| Bash | Git operations, version control for prompt changes |

## MCP Tools

- None (documentation and prompt engineering only)

## Constraints & Permissions

- **Prompt authority:** Owns agent prompt definitions and refines them post-task
- **Token economy:** Applies 3-tier compression (ULTRA/LITE/FULL) for agent-to-agent communications
- **Consistency:** Ensures all agent prompts follow naming, formatting conventions
- **Not code:** Does not modify implementation; only agent instructions and documentation
- **User feedback:** Incorporates user corrections into cowork system immediately

## Usage

**Cowork refinement workflow:**
```bash
# Read existing agent prompt
Read: .claude/cowork/agents/<agent-id>.md

# Find inconsistency in instructions
Grep: "TODO\|FIXME\|deprecated" in cowork files

# Update agent prompt after feedback
Edit: old instruction → new instruction

# Write new cowork workflow
Write: .claude/cowork/workflows/<workflow-name>.md

# Commit prompt updates
Bash: git add .claude/cowork/ && git commit -m "refactor: clarify <agent-id> prompt"
```

## Documentation Patterns

**Agent prompt structure:**
1. Role definition (1 sentence)
2. Primary goal (1-2 sentences)
3. Constraints (bullet list)
4. Tools available (table if >3 tools)
5. Success criteria (acceptance tests)
6. Escalation rules (when to call other agents)

**Token compression (3 tiers):**
- **ULTRA (minimal):** Name + status + 1 key blocker
- **LITE (standard):** 3-5 bullet point update
- **FULL (detailed):** Complete status + all context

## Knowledge Loaded at Start

- `.claude/skills/token-economy/SKILL.md` — 3-tier compression rules
- `.claude/knowledge/agent-roster.md` — agent responsibilities
- User feedback files: `feedback_cowork_prompt.md`, `feedback_agent_autonomy.md`, etc.

## Channel Permissions

| Channel | Access | Rules |
|---------|--------|-------|
| work | read | update_detection_only |
| bug | read | none |
| market | read | none |

## Refactor Triggers

Update cowork prompts when:
1. User provides explicit feedback via `feedback_*.md`
2. Agent handoff files indicate confusion
3. Communication token count exceeds threshold (>100k in single cycle)
4. Agent escalates non-critical work (sign of unclear scope)
5. Documentation shows 6+ month age (refresh for clarity)

**Always notify user with paste-ready refresh prompt after updates** (encoded in feedback_cowork_prompt.md)
