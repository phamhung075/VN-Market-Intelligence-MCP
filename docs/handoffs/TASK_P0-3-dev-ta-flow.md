---
sprint: pilot-p0
branch: task/p0-3-dev-ta-flow
size: S
zone: .claude/
depends_on: []
blocks: []
pilot: technical-analysis
phase: 0
---

## TLDR
Create or verify `flows/dev-technical-analysis/main.md` as the dispatcher entry point for the dev-technical-analysis agent. This flow MUST include G12 hard rule: "Do not mark task DONE until sandbox dashboard shows all TA scenarios green." Create the agent file `.claude/agents/dev-technical-analysis.md` if it does not exist, using agent-md-factory standards.

## [PM] Planning Context
- **Zone:** `.claude/flows/` + `.claude/agents/`
- **Acceptance Criteria:**
  - [ ] File `flows/dev-technical-analysis/main.md` exists (create if missing)
  - [ ] Flow file includes explicit step: "Do not mark task DONE until sandbox dashboard shows all TA scenarios green" (per G12)
  - [ ] Agent file `.claude/agents/dev-technical-analysis.md` exists with YAML frontmatter (name, color, description, tools, model)
  - [ ] Both files follow agent-md-factory standards (lazy-load guards, error boundaries, DDD compliance)
  - [ ] Flow can be invoked via `run .claude/flows/dev-technical-analysis/main.md` without errors
- **Files to read first:**
  - `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G12 (hard rule requirement)
  - `.claude/flows/dev-mcp-server/main.md` (reference dispatcher structure)
  - `.claude/agents/dev-mcp-server.md` (reference agent file structure)
  - `.claude/skills/agent-md-factory/SKILL.md` (factory standards for agent creation)
- **Files to create:**
  - `.claude/flows/dev-technical-analysis/main.md` (dispatcher — if missing)
  - `.claude/agents/dev-technical-analysis.md` (agent file — if missing)
- **Files to modify:**
  - None (create new only)
- **Dependencies:** None (agent-father is factory authority)
- **Knowledge needed:**
  - Agent creation standard: `.claude/skills/agent-md-factory/SKILL.md`
  - Dispatcher pattern: `.claude/flows/<agent>/main.md` SSOT entry
  - G12 requirement: charter §G12 (dashboard green before marking task done)

## Details
This task is **owned by agent-father** because it is the factory authority for agent creation and file templates. Agent-father creates agent files using the canonical template pattern defined in agent-md-factory skill.

If the files already exist, agent-father must verify:
1. Flow file has G12 rule stated explicitly
2. Agent file has correct YAML frontmatter
3. Both are syntactically valid (no parse errors when loaded)

If files are missing, agent-father creates them following factory standards. The developer zone (`dev-technical-analysis`) will use this flow dispatcher during Phases 1-3.

## RETURN block
When task is complete:
```
DONE: dev-technical-analysis agent flow created/verified
  - Flow file: .claude/flows/dev-technical-analysis/main.md
  - Agent file: .claude/agents/dev-technical-analysis.md
  - G12 rule present: YES
  - Factory compliance: PASS
FILES:
  - .claude/flows/dev-technical-analysis/main.md
  - .claude/agents/dev-technical-analysis.md
NEXT: po
```
