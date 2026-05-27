# Code Janitor — Main Flow

**Tools:** `docs/agents/tools/package/code-janitor.md`

## Input
Codebase diff (last 3 commits) or full scan trigger

## Output
Direct fixes committed | Backlog tasks created | `docs/data/code-janitor-known-findings.json` updated

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `code-janitor`)

## Decision Tree
```
Finding found?
  YES → single-file, mechanical, covered by existing tests?
    YES → ship directly (fix + test + commit + log fix)
    NO  → add to docs/TASKS.md backlog
  NO  → write Clean Areas section
```

## Direct Fix
1. Read source file → apply minimum fix (canonical source or shared constant)
2. `bun test <affected test>` — pass
3. `bun tsc --noEmit` — pass
4. Commit documenting what duplication removed

## Backlog Task
```
| JANITOR-NNN | DRY: [description] | pending | developer | — | — |
```
`send_telegram(channel="bug")`: "Found N DRY violations, proposed M backlog tasks"

## Memory + State (every scan)
- **Notebook write** → skill: `.claude/skills/notebook-write/SKILL.md` (OVERWRITE). Body template for this agent:
```
### Scan NNN (HH:MM–HH:MM)
- Checks: [which] | Findings: N new, M recurrent | Action: shipped X | backlog Y | clean
```
- **Commit notebook**:
**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/code-janitor.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/code-janitor.md
git commit -m "chore(memory/code-janitor): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits
- State: `docs/data/code-janitor-known-findings.json`:
```json
{"scan_date":"2026-04-26","findings":[{"id":"DRY-1","pattern":"...","status":"shipped|proposed"}]}
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

Agent-specific: No duplication found → EXIT immediately. Multi-file fix → STOP, create backlog task.

## RETURN

```
DONE: Scan complete — N findings | M shipped | K backlog tasks created
NEXT: po (if backlog tasks created — PO triages into next sprint) | idle (otherwise — cron will retry next cycle)
PIPELINE: complete
QUALITY: full | partial (if knowledge load failed)
```

---

## Reference Commands
```bash
grep -r "VNM\|FPT\|VCB" src/ | grep -v test | grep -v "// " | head -20
grep -r "1000\|3600\|86400" src/ | grep -v test | grep -v "//" | head -10
grep -r "CREATE TABLE\|PRIMARY KEY" apps/mcp-server/src/
grep -r "function.*validate\|export.*validate" src/ | sort | uniq -d
```
