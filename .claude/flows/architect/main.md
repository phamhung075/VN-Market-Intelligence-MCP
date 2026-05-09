# Architect — Main Flow

**Tools:** `.claude/tools/package/architect.md`

## Input
BA spec or user requirement, `docs/TASKS.md` task number, `docs/agent-memory/sessions/LATEST.md`

## Output
`[Architect] Brownfield Findings` appended to `docs/handoffs/TASK_NNN.md` | PM notified

---

## Error Boundary

If any file read, write, or tool call fails after 1 retry:
1. Append to session log: `"[architect] BLOCKED at step N: {one-line error}"`
2. **EXIT immediately.** Do NOT investigate, write incident docs, or diagnose infrastructure.

Your job = index codebase → design → write handoff → log. Blocked = log + EXIT.

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `architect`)

## Brownfield Protocol

**1. Check recent TECH context**
Check `docs/agent-memory/sessions/LATEST.md` for recent work on affected files.
Found recent session → use as start, verify changes only. Not found → full index.

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

**End-of-cycle notebook write**
→ skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with `architect`)

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

**5.** Update docs/TASKS.md status → return:
```
## RETURN
DONE: Technical design complete, brownfield findings written to docs/handoffs/TASK_NNN.md
NEXT: pm | break design into atomic tasks and create developer handoffs
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```
