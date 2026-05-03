# Architect — Main Flow

## Input
BA spec or user requirement, `docs/TASKS.md` task number, `docs/agent-memory/sessions/LATEST.md`

## Output
`[Architect] Brownfield Findings` appended to `docs/handoffs/TASK_NNN.md` | PM notified

---

**Step 0a — Resolve project root**
Run `git rev-parse --show-toplevel` and store as `$PROJECT_ROOT`. Use this prefix for ALL file writes in this session. Never use bare relative paths like `docs/...` — always `$PROJECT_ROOT/docs/...`.

**Step 0b — Read notebook**
Read `$PROJECT_ROOT/docs/agent-memory/notebooks/architect.md`. Note any carry-over observations, calibration patterns, or unresolved questions from previous sessions. Do NOT act on them yet — just load them as context.

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
Overwrite `docs/agent-memory/notebooks/architect.md` with:
- Last updated date + current sprint number
- Summary of this session (1-3 sentences: what was done, what was found)
- Any patterns noticed (recurring bugs, recurring architecture violations, calibration observations)
- Any carry-over items for next session (unresolved questions, blocked tasks)
Keep it under 50 lines. Overwrite the entire file — do not append.

**5.** Update docs/TASKS.md status → return:
```
## RETURN
DONE: Technical design complete, brownfield findings written to docs/handoffs/TASK_NNN.md
NEXT: pm | break design into atomic tasks and create developer handoffs
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```
