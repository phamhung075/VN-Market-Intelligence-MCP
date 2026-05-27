> Parent: [./edit.md](./edit.md)

# Agent Father — Edit: Prepare Phase (Steps 0a–4)

**0a. Resolve project root** → skill: `.claude/skills/project-root/SKILL.md`

**0b. Read notebook** → `docs/agent-memory/notebooks/agent-father.md`

**1. Validate target agent exists**

```
Glob: .claude/agents/<agent_name>.md
```
If not found → RETURN with `PIPELINE: blocked`, message: "Agent not found. Use create flow."

**2. Read current state**

Read all agent files fully:
- `.claude/agents/<agent_name>.md` — definition
- `docs/agents/<agent_name>/flow/*.md` — all flows (Glob first to discover)
- `docs/agents/tools/package/<agent_name>.md` — tool package (if exists)
- `docs/agent-memory/notebooks/<agent_name>.md` — notebook (if exists)

Note current `version` date for update.

**3. Identify relevant guide sections**

Based on `change_description`, determine which guide sections govern the change:

| Change Type | Guide Part to Load |
|------------|-------------------|
| YAML frontmatter (name, color, tools, model) | `guide-agent-definition.md` (5.1) |
| Identity/capabilities/responsibilities | `guide-agent-definition.md` (5.2) |
| Permissions/channels | `guide-agent-definition.md` (5.5) |
| Constraints | `guide-agent-definition.md` (5.6) |
| Boundary rules | `guide-agent-definition.md` (5.7) |
| Knowledge (always_load/lazy_load) | `guide-agent-definition.md` (5.8) + `guide-lazy-load.md` (4) |
| Inter-agent routing | `guide-agent-definition.md` (5.9b) |
| Flow steps | `guide-flows.md` (6.1 cowork / 6.2 dev) |
| Signals | `guide-error-signals.md` (14) |
| Error boundary | `guide-error-signals.md` (13) |
| Quality patterns | `guide-quality.md` (18) |

Read the relevant part file fully — each is self-contained.

**4. Produce EDIT PLAN**

Before making any changes, produce a structured plan:

```
## Edit Plan for <agent_name>

| # | File | Section | Current Value | Proposed Value | Guide Ref |
|---|------|---------|---------------|----------------|-----------|
| 1 | agents/<name>.md | constraints | tdd: false | tdd: true | Section 5.6 |
| 2 | flows/<name>/main.md | Step 3 | (missing) | Add TDD step | Section 6.2 |

### Cascade Effects
- [ ] Does this change affect inter_agent routing? → update partner agents
- [ ] Does this change affect roster entry? → update agent-roster.md
- [ ] Does this change affect dispatch? → update dispatch/SKILL.md
- [ ] Does this change affect CLAUDE.md routing? → update CLAUDE.md
- [ ] Does this change rename the agent? → rename ALL files + update ALL references
```
