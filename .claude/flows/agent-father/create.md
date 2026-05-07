# Agent Father — Create Flow

**Tools:** `.claude/tools/package/agent-father.md`

## Input

- `agent_name` — kebab-case identifier (e.g., `dev-portfolio-tracker`)
- `agent_type` — one of: `cowork` | `dev` | `dev-microservice`
- `purpose` — one-sentence description of what the agent does

## Output

New agent files created + registered in roster/CLAUDE.md/dispatch. Files:
- `.claude/agents/<agent_name>.md`
- `.claude/flows/<agent_name>/<flow>.md` (cycle.md for cowork, main.md for dev)
- `.claude/tools/package/<agent_name>.md`
- `docs/agent-memory/notebooks/<agent_name>.md`

---

## Error Boundary

If ANY file read/write fails after 1 retry:
1. Log to session: `"[agent-father/create] Step N failed: {error}"`
2. **Cleanup:** Delete any half-created files from this run
3. RETURN with `PIPELINE: blocked`
4. Do NOT leave orphaned files — incomplete agent is worse than no agent

---

## Steps

**0a. Resolve project root** → skill: `.claude/skills/project-root/SKILL.md`

**0b. Read notebook** → `docs/agent-memory/notebooks/agent-father.md`

**1. Validate input**
- `agent_name` must be kebab-case, no spaces, no uppercase
- `agent_type` must be one of: cowork, dev, dev-microservice
- Verify agent does NOT already exist: `Glob .claude/agents/<agent_name>.md`
- If agent exists → RETURN with `PIPELINE: blocked`, message: "Agent already exists. Use edit flow."

**2. Load guide sections by type**

Load guide TOC first (lines 1-30), then load sections relevant to agent type:

| Agent Type | Guide Parts to Load |
|------------|---------------------|
| cowork | `guide-agent-definition.md` + `guide-flows.md` (6.1) + `guide-error-signals.md` (14) |
| dev | `guide-agent-definition.md` + `guide-flows.md` (6.2) |
| dev-microservice | `guide-agent-definition.md` + `guide-flows.md` (6.2) |

Read each part file fully — they are self-contained. Recipes are in the index (`docs/AGENT_CREATION_GUIDE.md`).

**3. Read 2 reference agents of same type**

| Type | Reference Agents |
|------|-----------------|
| cowork | `news-scout.md` + `market-watcher.md` |
| dev | `developer.md` + `qa.md` |
| dev-microservice | `dev-mcp-server.md` + `dev-technical-analysis.md` |

Read each fully to understand real patterns. These are exemplars, not templates — adapt structure, don't copy blindly.

**4. Generate agent definition `.md`**

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

**5. Generate flow file(s)**

Create `.claude/flows/<agent_name>/` directory, then:

| Type | Flow File | Template Source |
|------|-----------|----------------|
| cowork | `cycle.md` | `docs/guides/guide-flows.md` Section 6.1 |
| dev | `main.md` | `docs/guides/guide-flows.md` Section 6.2 |
| dev-microservice | `main.md` | `docs/guides/guide-flows.md` Section 6.2 + microservice additions |

Every flow file MUST contain:
- [ ] `# <Agent Name> — <Flow Name> Flow` header
- [ ] `**Tools:** .claude/tools/package/<agent_name>.md`
- [ ] `## Input` / `## Output`
- [ ] `## Error Boundary` (before any steps)
- [ ] Step 0a (project-root) + Step 0b (notebook read)
- [ ] Numbered main steps with clear actions
- [ ] Session log step
- [ ] Notebook write → skill reference
- [ ] Doc self-heal → skill reference
- [ ] `## RETURN` block with DONE/NEXT/PIPELINE/QUALITY

**6. Scaffold notebook**

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

**7. Create tool package**

Create `.claude/tools/package/<agent_name>.md` following the pattern from reference agents read in Step 3. Include:
- File System Tools table (if dev team)
- MCP Tools section (if cowork team)
- Constraints & Permissions
- Channel Permissions table

**8. Register in 3 locations**

| Target | Action |
|--------|--------|
| `.claude/knowledge/agent-roster.md` | Add row to appropriate team table (Analysis Team or Dev Team) |
| `CLAUDE.md` | Add routing entry to Agent Routing table |
| `.claude/skills/dispatch/SKILL.md` | Add row to Dispatch Table |

Read each file first to understand current format before inserting.

**9. Validate completeness**

Run 7 verification checks:
1. Agent definition file exists and has valid YAML frontmatter (name, color, description, tools, model)
2. Flow file(s) exist and each has Error Boundary + RETURN block
3. Tool package file exists
4. Notebook file exists
5. All `knowledge.always_load` paths resolve (files exist)
6. `flow.default` path resolves
7. Agent appears in roster, CLAUDE.md, and dispatch

If any check fails → log which check failed → attempt fix → if still failing, include in RETURN as `QUALITY: partial`.

---

**Session log** → append to `docs/agent-memory/sessions/YYYY-MM-DD-agent-father.md`:
```
### Create (<agent_name>) HH:MM
- Type: <agent_type>
- Files created: N
- Registration: roster + CLAUDE.md + dispatch
- Validation: N/7 passed
- Decision: <why this type/model/color was chosen>
```

**Notebook write** → skill: `.claude/skills/notebook-write/SKILL.md`

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

## RETURN

```
DONE: Created agent <agent_name> (<agent_type>) — N files written, registered in 3 locations
NEXT: user | review new agent, test invocation
PIPELINE: complete
QUALITY: full | partial
```
