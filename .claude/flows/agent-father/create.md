# Agent Father — Create Flow (Thin Dispatcher)

**Tools:** `.claude/tools/package/agent-father.md`

## Input

- `agent_name` — kebab-case identifier (e.g., `dev-portfolio-tracker`)
- `agent_type` — one of: `cowork` | `dev` | `dev-microservice`
- `purpose` — one-sentence description of what the agent does

## Output

New agent files created + registered in roster/CLAUDE.md/dispatch. Files:
- `.claude/agents/<agent_name>.md`
- `.claude/flows/<agent_name>/<flow>.md` (cycle.md for cowork, main.md for dev) — or shared `microservice-main.md` for dev-microservice
- `.claude/tools/package/<agent_name>.md`
- `docs/agent-memory/notebooks/<agent_name>.md`

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

Agent-specific: **Cleanup** half-created files on failure. Incomplete agent is worse than no agent.

---

## Steps

**0a. Resolve project root** → skill: `.claude/skills/project-root/SKILL.md`

**0b. Read notebook** → `docs/agent-memory/notebooks/agent-father.md`

## Step 1 — Validate Input

- `agent_name` must be kebab-case, no spaces, no uppercase
- `agent_type` must be one of: cowork, dev, dev-microservice
- Verify agent does NOT already exist: `Glob .claude/agents/<agent_name>.md`
- If agent exists → RETURN with `PIPELINE: blocked`, message: "Agent already exists. Use edit flow."

## Step 2 — Load Guide Sections by Type

Load guide TOC first (lines 1-30), then load sections relevant to agent type:

| Agent Type | Guide Parts to Load |
|------------|---------------------|
| cowork | `guide-agent-definition.md` + `guide-flows.md` (6.1) + `guide-error-signals.md` (14) |
| dev | `guide-agent-definition.md` + `guide-flows.md` (6.2) |
| dev-microservice | `guide-agent-definition.md` + `guide-flows.md` (6.2) |

Read each part file fully — they are self-contained. Recipes are in the index (`docs/AGENT_CREATION_GUIDE.md`).

## Step 3 — Read 2 Reference Agents of Same Type

| Type | Reference Agents |
|------|-----------------|
| cowork | `news-scout.md` + `market-watcher.md` |
| dev | `developer.md` + `qa.md` |
| dev-microservice | `dev-mcp-server.md` + `dev-technical-analysis.md` |

Read each fully to understand real patterns. These are exemplars, not templates — adapt structure, don't copy blindly.

## Steps 4-7 — Scaffold 4 Files

→ Run sub-flow: `.claude/flows/agent-father/scaffold-files.md`

Output: agent definition + flow file(s) + notebook + tool package. All on disk; not yet registered.

## Step 8 — Register in 3 Locations

→ Run sub-flow: `.claude/flows/agent-father/register-agent.md`

Output: roster + CLAUDE.md + dispatch SKILL all updated. Agent is now discoverable.

## Step 9 — Validate Completeness

Run 7 verification checks:
1. Agent definition file exists and has valid YAML frontmatter (name, color, description, tools, model)
2. Flow file(s) exist and each has Error Boundary + RETURN block (skip for dev-microservice using shared flow)
3. Tool package file exists
4. Notebook file exists
5. All `knowledge.always_load` paths resolve (files exist)
6. `flow.default` path resolves
7. Agent appears in roster, CLAUDE.md, and dispatch (dispatch row optional for dev-microservice)

If any check fails → log which check failed → attempt fix → if still failing, include in RETURN as `QUALITY: partial`.

---

**Notebook commit** — append to `docs/agent-memory/notebooks/agent-father.md`:
```
### Create (<agent_name>) HH:MM
- Type: <agent_type>
- Files created: N
- Registration: roster + CLAUDE.md + dispatch
- Validation: N/7 passed
- Decision: <why this type/model/color was chosen>
```
**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/agent-father.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/agent-father.md
git commit -m "chore(memory/agent-father): notebook YYYY-MM-DD"
```

**Notebook write** → skill: `.claude/skills/notebook-write/SKILL.md`

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

## RETURN

```
DONE: Created agent <agent_name> (<agent_type>) — N files written, registered in 3 locations
NEXT: qa (smoke-test the new agent invocation if a test target exists) | idle (otherwise — next agent-father cron will sweep)
PIPELINE: complete
QUALITY: full | partial
```
