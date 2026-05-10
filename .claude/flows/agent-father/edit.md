# Agent Father — Edit Flow

**Tools:** `.claude/tools/package/agent-father.md`

## Input

- `agent_name` — existing agent to edit (kebab-case)
- `change_description` — what needs to change and why

## Output

Updated agent file(s) + diff summary showing all changes made with guide references.

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

Agent-specific: **Rollback** partial edits (git checkout). Never leave agent in inconsistent state.

---

## Steps

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
- `.claude/flows/<agent_name>/*.md` — all flows (Glob first to discover)
- `.claude/tools/package/<agent_name>.md` — tool package (if exists)
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

**5. Apply edits**

Use `Edit` tool (not Write) for existing files. For each edit:
- Match `old_string` exactly from the file (read first)
- Apply `new_string` per guide pattern
- Update `version` date to today

Order of operations for consistency:
1. Agent definition first (source of truth)
2. Flow files second (must match definition)
3. Tool package third (if tools changed)
4. Registration files last (roster, CLAUDE.md, dispatch)

**6. Cascade check**

If the edit changed any of these, propagate:

| Changed | Cascade To |
|---------|-----------|
| `name` | ALL files — rename agent .md, flow dir, tool package, notebook, roster, CLAUDE.md, dispatch |
| `flow.default` or `flow.catalog` | Verify new paths exist, create if needed |
| `knowledge.always_load` | Verify referenced files exist |
| `inter_agent.recv/send` | Check partner agent's send/recv matches |
| `permissions.channels` | Verify roster matches |
| `tools` (frontmatter) | Verify tool package matches |

**7. Validate post-edit**

Re-read all edited files and run checks:
- [ ] YAML frontmatter still valid (5 required fields)
- [ ] All `knowledge.always_load` paths resolve
- [ ] All `flow.catalog` paths resolve
- [ ] `inter_agent` routing is symmetric with partner agents
- [ ] Version date updated to today

**8. Diff summary**

Produce human-readable summary:
```
## Changes Applied to <agent_name>

### Files Modified
- `.claude/agents/<name>.md` — <what changed>
- `.claude/flows/<name>/main.md` — <what changed>

### Guide References
- Section 5.6: constraints must include tdd_mandatory for dev agents
- Section 6.2: every dev flow needs TDD step

### Cascade Updates
- (none) | Updated partner agent X routing
```

---

**Notebook commit** — append to `docs/agent-memory/notebooks/agent-father.md`:
```
### Edit (<agent_name>) HH:MM
- Change: <one-line summary>
- Files modified: N
- Cascade: <none | list>
- Validation: N/5 passed
- Decision: <why this change was made, guide ref>
```
```bash
git add docs/agent-memory/notebooks/agent-father.md
git commit -m "chore(memory/agent-father): notebook YYYY-MM-DD"
```

**Notebook write** → skill: `.claude/skills/notebook-write/SKILL.md`

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

## RETURN

```
DONE: Edited agent <agent_name> — N files modified, M cascade updates
NEXT: user | review changes
PIPELINE: complete
QUALITY: full | partial
```
