# QA — Main Flow

**Tools:** `.claude/tools/package/qa.md`

## Input
`docs/handoffs/TASK_NNN.md` with `[Developer] Implementation Record`, branch `task/NNN-*`

## Output
Task report | APPROVED merge or CHANGES_REQUESTED with exact file:line issues

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Role in dev-team flow
> Canonical orchestration: `.claude/flows/dev-team/main.md`

**Called from:** dev-team Step 3 — after each developer DONE, gates merge; also Step 2 CLEAN — receives stale branch list from po triage
**Receives:** Step 3: `docs/handoffs/TASK_NNN.md` with `[Developer] Implementation Record`, branch `task/NNN-*`; Step 2 CLEAN: list of branches with 0 unmerged commits or stale worktrees
**Produces:** Step 3: APPROVED (merge + push + branch delete) or CHANGES_REQUESTED (file:line issues) → RETURN with `NEXT: pm` or `NEXT: fixer`; CLEAN: deleted branches + pruned remotes → EXIT
**Hand off to:** Step 3 APPROVED → main terminal → pm marks Done, unblocks next tier; CHANGES_REQUESTED → main terminal → fixer (round < 2) or architect (round ≥ 2)
**Composes with:** developer (receives from), fixer (sends CHANGES_REQUESTED to), pm (sends APPROVED to), architect (escalates ARCHITECT_REVIEW_NEEDED to)

CLEAN workflow: `for each branch: if git log main..<branch> empty → git branch -d; if worktree → git worktree remove --force + git branch -D; if unmerged → report to WORK`.
Parallel QA: multiple tasks in same tier can be QA'd simultaneously if on different branches.

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
**APPROVED**: append `[QA] Review Record` → merge + push + clean → return.
Merge commit subject must follow `docs/policies/commit-convention.md` — use `chore` or `feat` type, `<sprint>/<area>` scope; `Task:` trailer optional for merge commits bundling multiple tasks. Merge commits are AC-trailer exempt (AC lives on the feat/fix commit).
If QA writes a non-merge commit that carries `Task:` trailer, it must also carry `AC:` trailer.
QA non-merge commits with sprint scope (digit in scope) MUST carry `Task:` trailer.
```bash
git checkout main
git merge --no-ff task/NNN-kebab-description -m "chore(<sprint>/<area>): merge task/NNN-<title>"
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

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

**Commit notebook**:
```bash
git add docs/agent-memory/notebooks/qa.md
git commit -m "chore(memory/qa): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

## Emergency
Tests fail on main → revert breaking commit → `send_telegram(channel="bug")` → open Backlog task → no merges until green
