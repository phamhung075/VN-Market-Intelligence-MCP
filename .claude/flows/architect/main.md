# Architect — Main Flow

**Tools:** `.claude/tools/package/architect.md`

## Input
BA spec or user requirement, `docs/TASKS.md` task number, recent agent notebooks (`docs/agent-memory/notebooks/*.md`)

## Output
`[Architect] Brownfield Findings` appended to `docs/handoffs/TASK_NNN.md` | PM notified

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `architect`)

## Brownfield Protocol

**1. Check recent TECH context**
Check recent agent notebooks (`docs/agent-memory/notebooks/*.md`) for recent work on affected files.
Found recent notebook entry → use as start, verify changes only. Not found → full index.

**2. Index codebase**
```bash
find apps/mcp-server/src/domain -name "*.ts" | head -20
find apps/mcp-server/src/application -name "*.ts" | head -20
find apps/mcp-server/src/infrastructure -name "*.ts" | head -20
find apps/mcp-server/src/interface -name "*.ts" | head -20
grep -r "export interface.*Repository" apps/mcp-server/src/domain/
grep -r "implements.*Repository" apps/mcp-server/src/infrastructure/
ls apps/mcp-server/src/application/usecases/
ls apps/mcp-server/src/interface/mcp/
```
Rule: existing interface covers need → extend, never duplicate.

**3. Produce technical design**
- Files to read/modify/create (specific paths)
- DDD layer assignment (which layer each class)
- Interface/implementation split (ports + adapters)
- Test strategy (unit/integration/e2e)
- Risk flags (security, memory, perf, DDD violations)

**4. Append to handoff file** `docs/handoffs/TASK_NNN.md`:
```markdown
## [Architect] Brownfield Findings

- **Verified paths:**
  - `/path/src/domain/service.ts:40-120` — description
- **Reuse patterns:**
  - Extend X rather than duplicate
- **Design decisions:**
  - Layer: domain service in `src/domain/services/`
  - Dependency injection: inject via constructor
- **Scan clean:** true ✓
```

### Header update (required every cycle)
Before the end-of-cycle skill writes the notebook, update line 3 of `docs/agent-memory/notebooks/architect.md`:
```
**Last updated:** $(date -u +"%Y-%m-%d %H:%M UTC") | **Sprint:** <current_sprint>
```
Use `date -u` exclusively — same UTC source as the session log guard (1865a).

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

**5.** Update docs/TASKS.md status → return:
```
## RETURN
DONE: Technical design complete, brownfield findings written to docs/handoffs/TASK_NNN.md
NEXT: pm | break design into atomic tasks and create developer handoffs
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```
