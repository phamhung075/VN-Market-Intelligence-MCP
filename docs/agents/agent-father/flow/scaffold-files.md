# Agent Father — Scaffold Agent Files

**Parent flow:** `docs/agents/agent-father/flow/create.md` (Steps 4-7)

Generate the 4 required files for a new agent. Run AFTER intake/validation (create.md Steps 1-3) is complete.

## Step 4 — Generate Agent Definition `.md`

Create `.claude/agents/<agent_name>.md` with ALL required sections per guide:

```yaml
---
name: <agent_name>
color: <pick unused or appropriate color>
description: <Role>. <purpose>.
tools: <appropriate tool list for type>
model: <haiku|sonnet|opus — sonnet default>
---
```

Body sections checklist (verify each exists before writing):
- [ ] `agent.id` + `agent.name` + `agent.version` + `agent.description`
- [ ] `identity.mindset` + `identity.skills` (dev and dev-microservice)
- [ ] `capabilities` (list of measurable capabilities)
- [ ] `responsibilities` (list of concrete deliverables)
- [ ] `not_my_job` (what belongs to other agents — name which)
- [ ] `permissions.tools_packages` + `permissions.channels`
- [ ] `constraints` (type-specific: tdd_mandatory for dev, etc.)
- [ ] `boundary_rules.scope` + `on_error` + `forbidden_outputs`
- [ ] `knowledge.always_load` (fail-loud-protocol.md MANDATORY)
- [ ] `knowledge.lazy_load` (domain-specific triggers)
- [ ] `KNOWLEDGE LOAD FAILURE PROTOCOL` (inline block)
- [ ] `flow.default` + `flow.catalog`
- [ ] `tools_package` pointer
- [ ] `memory.notebook` + `memory.session_log` + `memory.append_every_cycle`
- [ ] `inter_agent.recv` + `inter_agent.send` (shorthand for dev, verbose for cowork)

For cowork agents, also add:
- [ ] `signals.consumes` + `signals.produces`
- [ ] `schedule` (cron expression)

For dev-microservice agents, also add:
- [ ] `zone` (apps/<service>/)
- [ ] `tech_stack`
- [ ] `test_command` + `type_check`
- [ ] `database.owns` + `database.reads`
- [ ] `doc_maintenance`

## Step 5 — Generate Flow File(s)

Create `docs/agents/<agent_name>/flow/` directory, then:

| Type | Flow File | Template Source |
|------|-----------|----------------|
| cowork | `cycle.md` | `docs/guides/guide-flows.md` Section 6.1 |
| dev | `main.md` | `docs/guides/guide-flows.md` Section 6.2 |
| dev-microservice | (shares `docs/agents/developer/flow/microservice-main.md`) | Section 6.2 + microservice additions |

Every dev/cowork flow file MUST contain:
- [ ] `# <Agent Name> — <Flow Name> Flow` header
- [ ] `**Tools:** docs/agents/tools/package/<agent_name>.md`
- [ ] `## Input` / `## Output`
- [ ] `## Error Boundary` (before any steps)
- [ ] Step 0a (project-root) + Step 0b (notebook read)
- [ ] Numbered main steps with clear actions
- [ ] Session log step
- [ ] Notebook write → skill reference
- [ ] Doc self-heal → skill reference
- [ ] `## RETURN` block with DONE/NEXT/PIPELINE/QUALITY

For dev-microservice agents: skip creating new flow file — `flow.default` points to the shared `docs/agents/developer/flow/microservice-main.md`.

## Step 6 — Scaffold Notebook

Create `docs/agent-memory/notebooks/<agent_name>.md`:
```markdown
# <Agent Name> — Notebook

**Last updated:** <today>
**Sprint:** N/A (new agent)

## Last Session Summary
New agent. No prior sessions.

## Lessons Learned
(none yet)

## Cross-Team Notes
(none yet)

## Carry-Over
(none yet)
```

## Step 7 — Create Tool Package

Create `docs/agents/tools/package/<agent_name>.md` following the pattern from reference agents read in Step 3. Include:
- File System Tools table (if dev team)
- MCP Tools section (if cowork team)
- Constraints & Permissions
- Channel Permissions table

Output: 4 files created on disk (agent + flow + notebook + tool package). Feed Step 8 (register-agent.md) for visibility wiring.
