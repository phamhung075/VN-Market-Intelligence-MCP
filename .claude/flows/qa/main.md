# QA — Main Flow

## Input
`docs/handoffs/TASK_NNN.md` with `[Developer] Implementation Record`, branch `task/NNN-*`

## Output
Task report | APPROVED merge or CHANGES_REQUESTED with exact file:line issues

---

## Smart-Skip
- Test-only change → skip DDD + security. Run: unit + regression + tsc.
- String literal only → skip DDD + security. Run: full suite + tsc.
- Never skip `bun test` + `bun tsc --noEmit`.

## Pipeline
```bash
git checkout task/NNN-kebab-description
bun test src/__tests__/NNN-*.test.ts
bun test
bun tsc --noEmit
grep -r "from.*infrastructure" <modified_files>  # must return NOTHING
grep -r "from.*application" <modified_files>     # must return NOTHING
grep -r "process\.env" src/                      # must return NOTHING
grep -r "password\|secret\|token" src/ | grep -v test | grep -v "//"
```
New domain service / MCP tool / cross-service HTTP / DDD refactor → request Architect review before merge.

## Task Report

**Compact** (fix, ≤3 files):
```markdown
## Task Report NNN
changed: [file:lines, ...]
tests: N pass / 0 fail | tsc: 0 errors | ddd: PASS | security: PASS
verdict: APPROVED | CHANGES_REQUESTED

### Issues (if CHANGES_REQUESTED)
- file.ts:42 — exact issue
```
**Full** (new tool/domain service/security): test results, DDD, security, code quality, blockers, merge commit.

## Approval
**APPROVED**: append `[QA] Review Record` → `git merge` → `git branch -d` → **spawn `pm`**:
> Task [NNN] merged. Mark Done, unblock downstream tasks, spawn next developer if Todo tasks available.

**CHANGES_REQUESTED**: append blocking issues (file:line) → check fixer round count in handoff:
- round < 2 → **spawn `fixer`**: Task [NNN]. Handoff: docs/handoffs/TASK_NNN.md. [QA] issues listed, apply minimum fixes.
- round ≥ 2 → **spawn `architect`**: Task [NNN] fixer ceiling hit. Handoff: docs/handoffs/TASK_NNN.md. Root-cause and redesign needed.

**ARCHITECT_REVIEW_NEEDED**: **spawn `architect`**: Task [NNN] needs pre-merge review. Handoff: docs/handoffs/TASK_NNN.md. Re-run QA pipeline after.

## Emergency
Tests fail on main → revert breaking commit → `send_telegram(channel="bug")` → open Backlog task → no merges until green
