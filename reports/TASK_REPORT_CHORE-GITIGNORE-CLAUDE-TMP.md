## Task Report CHORE-GITIGNORE-CLAUDE-TMP

changed: `.gitignore:16` (+`.claude/tmp/`), 111 `.claude/tmp/orch-hook-proposal-*.json` untracked (index-only, kept on disk)
tests: n/a (repo-hygiene chore, no production code touched) | tsc: n/a | ddd: n/a | security: PASS (no session UUID in any added/committed line — only present in deletion-diff content of the files being removed, which is precisely the leak being fixed)
verdict: APPROVED

### What changed
1. `.gitignore` line 16: added `.claude/tmp/` under the existing `.claude/` block (next to `.claude/worktrees`, `.claude/scheduled_tasks.lock`).
2. Untracked all 111 currently-tracked files under `.claude/tmp/` via `git ls-files -z -- .claude/tmp/ | xargs -0 -r git rm --cached --`. Confirmed count: **111** (matches task description). Files remain on disk (111, unchanged), 0 remain in the git index.
3. Single commit `d786f1d1b` — `chore(cleanup): gitignore .claude/tmp/, untrack 111 hook-proposal snapshots` — 112 files changed (1 `.gitignore` insertion + 111 deletions).

### orch-apply.sh dependency check (the real gate)
`grep -n "\.claude/tmp" scripts/orch-apply.sh` → **no matches**. Read the full script: its own temp file is created via `mktemp "$(dirname "${LIVE_FILE}")/.orch-apply-XXXXXXXX.json"`, i.e. under `docs/data/orch/` (required for the same-filesystem atomic `mv` rename) — it has zero reference to, and zero dependency on, `.claude/tmp/`.

Separately identified the actual writer of `.claude/tmp/orch-hook-proposal-*.json`: `scripts/agents-flow/orch-state-hook-prewrite.mjs` (a PreToolUse hook, lines 98/104), unrelated to `orch-apply.sh`'s own write path.

### Round-trip verification
```
$ jq '.' docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
[orch-validate] Stage 0 + Stage 1 PASS — 104 coherence warning(s) (SHG migration, non-blocking) — .../.orch-apply-XXXXXXXX.json
[orch-apply] OK — candidate applied → .../docs/data/orch/orch-state.json
EXIT_CODE=0
```
Ran twice (once immediately after untracking, once again after the final commit) — both times exit 0 with the same "OK — candidate applied" line and the same 104 pre-existing, non-blocking SHG coherence warnings. `git status --short .claude/tmp/` was empty both times (no stray untracked scratch appeared during the runs; the hook that writes `orch-hook-proposal-*` did not fire from this direct Bash invocation of `orch-apply.sh`). `git check-ignore -v .claude/tmp/` confirms the new rule matches (`.gitignore:16:.claude/tmp/`).

**Confirmed: `scripts/orch-apply.sh` does NOT depend on `.claude/tmp/` being tracked (or existing at all).**

### Notable subtlety (documented for future agents)
First commit attempt used a trailing pathspec: `git commit -m "..." -- .gitignore .claude/tmp/`. This silently **discarded** the staged `git rm --cached` — a path-limited `git commit` re-derives content for the listed paths from **working-tree vs HEAD**, not from the index; since the 111 files were still present on disk with unchanged bytes (by design — `--cached` only touches the index), git treated them as "no change" and re-committed them as tracked, undoing the untrack. Fixed by `git reset --soft HEAD~2` (both commits were fully local/unpushed — confirmed via `git rev-list --left-right --count origin/main...HEAD`) followed by a plain, unscoped `git commit` that correctly picked up the full staged index (111 deletions + `.gitignore`). Final single commit: `d786f1d1b`.

### Security check
`git show HEAD | grep -E '^\+' | grep -c '<full-session-uuid>'` → 0. The only hits for the UUID prefix in the diff are on **removed** (`-`) lines — i.e. content of the files being untracked, which is exactly the leak this task fixes.
