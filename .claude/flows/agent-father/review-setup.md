> Parent: [./review.md](./review.md)

# Agent Father — Review: Setup Phase (Steps 0a–2)

**0a. Resolve project root** → skill: `.claude/skills/project-root/SKILL.md`

**0b. Read notebook** → `docs/agent-memory/notebooks/agent-father.md`

**1. Build agent list**

If `target = "all"`:
```
Glob: .claude/agents/*.md
```
Exclude: `semble-search.md` (skill, not agent per roster)

If specific names: validate each exists via Glob.

Count total agents for progress tracking.

**2. Load guide compliance checklist**

Load guide index, then load `guide-agent-definition.md` + `guide-quality.md` for the compliance matrix:

| # | Check | Guide Part / Section | Severity if Missing |
|---|-------|---------------------|-------------------|
| 1 | YAML frontmatter complete (name, color, description, tools, model) | `guide-agent-definition.md` 5.1 | CRITICAL |
| 2 | `boundary_rules.scope` + `on_error` + `forbidden_outputs` exist | `guide-agent-definition.md` 5.7 | CRITICAL |
| 3 | `knowledge.always_load` includes `fail-loud-protocol.md` | `guide-agent-definition.md` 5.8 | CRITICAL |
| 4 | `KNOWLEDGE LOAD FAILURE PROTOCOL` inline block exists | `guide-agent-definition.md` 5.13 | CRITICAL |
| 5 | Flow file(s) exist at `flow.default` path | `guide-agent-definition.md` 5.11 | CRITICAL |
| 6 | Each flow has `## Error Boundary` section | `guide-flows.md` 6.x | HIGH |
| 7 | Each flow has `## RETURN` block (dev) or session log step (cowork) | `guide-flows.md` 6.x | HIGH |
| 8 | `permissions.channels` defined with rules | `guide-agent-definition.md` 5.5 | HIGH |
| 9 | `inter_agent` section exists (recv + send) | `guide-agent-definition.md` 5.9b | HIGH |
| 10 | `memory.notebook` + `memory.session_log` defined | `guide-agent-definition.md` 5.12 | HIGH |
| 11 | Tool package file exists at `tools_package` path | `guide-agent-definition.md` 5.4b | MEDIUM |
| 12 | Notebook file exists at `memory.notebook` path | `guide-agent-ops.md` 7 | MEDIUM |
| 13 | Agent registered in `agent-roster.md` | `guide-skills-registration.md` 16 | MEDIUM |
| 14 | `document_zone` section exists | `guide-agent-definition.md` 5.3 [PLANNED] | LOW |
| 15 | `document_registry` section exists | `guide-agent-definition.md` 5.4 [PLANNED] | LOW |
