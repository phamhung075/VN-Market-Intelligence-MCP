# QA — Main Flow

**Tools:** `.claude/tools/package/qa.md`

## Input
`docs/handoffs/TASK_NNN.md` with `[Developer] Implementation Record`, branch `task/NNN-*`

## Output
Task report | APPROVED merge or CHANGES_REQUESTED with exact file:line issues

---

## Error Boundary

If any file read, write, build, or test command fails after 1 retry:
1. Append to session log: `"[qa] BLOCKED at step N: {one-line error}"`
2. **EXIT immediately.** Do NOT investigate, write incident docs, or diagnose infrastructure.

Your job = run pipeline → write report → approve or request changes → log. Blocked = log + EXIT.

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `qa`)

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

Write to `reports/TASK_REPORT_NNN.md` — never `apps/mcp-server/reports/` or `docs/reports/`.

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
**APPROVED**: append `[QA] Review Record` → merge + push + clean → return:
```bash
git checkout main
git merge --no-ff task/NNN-kebab-description -m "merge(NNN): <title>"
git push origin main
# Clean branch — handle worktrees explicitly:
worktree_path=$(git worktree list --porcelain | grep -A1 "branch refs/heads/task/NNN" | grep "worktree" | awk '{print $2}')
if [ -n "$worktree_path" ]; then
  git worktree remove --force "$worktree_path"
fi
git branch -d task/NNN-kebab-description
git push origin --delete task/NNN-kebab-description 2>/dev/null || true  # ignore if no remote
```
```
## RETURN
DONE: Task NNN merged, pushed to main, branch deleted locally + remote, all tests green
NEXT: pm | mark Task NNN done, unblock downstream, queue next developer task
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```

**CHANGES_REQUESTED**: append issues (file:line) → check fixer round count in handoff → return:
```
## RETURN
DONE: QA review complete — N issues found (see [QA] Review Record in handoff)
NEXT: fixer | apply minimum fixes to listed issues      ← round < 2
NEXT: architect | fixer ceiling hit, root-cause needed  ← round ≥ 2
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```

**ARCHITECT_REVIEW_NEEDED** → return:
```
## RETURN
DONE: QA flagged architectural issue before merge
NEXT: architect | review Task NNN before merge, then re-run QA
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```

## End-of-cycle notebook write
→ skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with `qa`)

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

## Emergency
Tests fail on main → revert breaking commit → `send_telegram(channel="bug")` → open Backlog task → no merges until green
