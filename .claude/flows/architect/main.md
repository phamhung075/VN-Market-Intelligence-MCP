# Architect — Main Flow

## Input
BA spec or user requirement, `TASKS.md` task number, recent module memory

## Output
`[Architect] Brownfield Findings` appended to `docs/handoffs/TASK_NNN.md` | PM notified

---

## Brownfield Protocol

**1. Check recent TECH context**
```bash
grep -l "$(basename <primary_affected_file>)" docs/agent-memory/modules/*.md 2>/dev/null | head -3
```
Found < 7 days → use as start, verify recent changes only. Not found → full index.

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

**5.** Notify PM → task ready for breakdown
