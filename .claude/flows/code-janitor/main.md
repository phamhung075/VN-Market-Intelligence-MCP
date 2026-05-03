# Code Janitor — Main Flow

## Input
Codebase diff (last 3 commits) or full scan trigger

## Output
Direct fixes committed | Backlog tasks created | `docs/data/code-janitor-known-findings.json` updated

---

**Step 0a — Resolve project root**
Run `git rev-parse --show-toplevel` and store as `$PROJECT_ROOT`. Use this prefix for ALL file writes in this session. Never use bare relative paths like `docs/...` — always `$PROJECT_ROOT/docs/...`.

**Step 0b — Read notebook**
Read `$PROJECT_ROOT/docs/agent-memory/notebooks/code-janitor.md`. Note any carry-over observations, calibration patterns, or unresolved questions from previous sessions. Do NOT act on them yet — just load them as context.

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
- Session log via `append_session_record(agent_name="code-janitor", task_name="Scan NNN", ...)`:
```
### Scan NNN (HH:MM–HH:MM)
- Checks: [which] | Findings: N new, M recurrent | Action: shipped X | backlog Y | clean
```
- State: `docs/data/code-janitor-known-findings.json`:
```json
{"scan_date":"2026-04-26","findings":[{"id":"DRY-1","pattern":"...","status":"shipped|proposed"}]}
```

## End-of-cycle notebook write
Overwrite `docs/agent-memory/notebooks/code-janitor.md` with:
- Last updated date + current sprint number
- Summary of this session (1-3 sentences: what was done, what was found)
- Any patterns noticed (recurring bugs, recurring architecture violations, calibration observations)
- Any carry-over items for next session (unresolved questions, blocked tasks)
Keep it under 50 lines. Overwrite the entire file — do not append.

## Reference Commands
```bash
grep -r "VNM\|FPT\|VCB" src/ | grep -v test | grep -v "// " | head -20
grep -r "1000\|3600\|86400" src/ | grep -v test | grep -v "//" | head -10
grep -r "CREATE TABLE\|PRIMARY KEY" apps/mcp-server/src/
grep -r "function.*validate\|export.*validate" src/ | sort | uniq -d
```
