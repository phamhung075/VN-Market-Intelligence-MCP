# Scratch test artifact — FIX-AUDITOR-COMMIT-MUTEX-SKIP

Throwaway append-only session artifact created to exercise
`scripts/auditor-notebook-commit.sh` against the real gateway (no mocks).
Kept per task instructions (append-only sessions dir; test evidence).

Scenarios verified live, each showing a paired `commit-mutex:main`
claim+release (confirmed via `task_list_held` before/after) and the correct
marker line:

1. **Success** — real edit, no contention → `[auditor-commit] mutex-paired commit <sha> paths=1`, lock released.
2. **No-op** — re-run with zero diff on the named path → `[auditor-commit] SKIP no-staged-changes paths=1`, exit 0, lock released (claimed then released even though nothing was committed).
3. **Contended** — a peer session held `commit-mutex:main` (ttl=60) → `[auditor-commit] SKIP mutex-claim-failed contended holder=... — retry next tick`, exit 1, working-tree edit preserved uncommitted. After the peer released, re-running the identical command succeeded and picked up the pending edit.
4. **Foreign-path guard** — a peer file was pre-staged in the shared index before the script ran → the script staged only its own named path, detected the foreign staged file via `git diff --cached --name-only`, ran `git restore --staged` on it (never touching the peer's working tree or content), and committed only the intended path. The foreign file was left untouched/unstaged afterward.

Re-verified after a bug fix (`commit_rc=$?` was captured through a negated `if ! git commit; then` — always read back as the `!` construct's own status, not git's real exit code; fixed to capture directly on the line after the plain `git commit` call).
