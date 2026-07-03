# Decision Journal — Sprint FIX-AUDITOR-COMMIT-MUTEX-SKIP · developer

**Sprint goal:** Route system-auditor's T1 notebook commit through ONE blessed script that
claims/releases commit-mutex + uses explicit pathspec only, so the claim can never be
skipped by flow-step drift (consolidates DEFERRED FIX-AUDITOR-COMMIT-NONEXPLICIT-PATHSPEC).
**Agent:** developer
**Started:** 2026-07-03T00:40:00Z

---

### STEP developer-S1 · developer · 2026-07-03T00:45:00Z
**task-id:** FIX-AUDITOR-COMMIT-MUTEX-SKIP
**what-done:** Chose script design: `scripts/auditor-notebook-commit.sh` claims `commit-mutex:main`
before any git op, arms `trap ... EXIT` on successful claim only, stages+commits ONLY the
explicit paths passed as argv (never -A/-u/.), prints a distinct `[auditor-commit]` marker
per outcome class (success/no-op/claim-failed/foreign-abort/usage-error).
**what-considered:**
- Only path: mirror `.claude/skills/commit-mutex/SKILL.md` Steps 1/3/4 exactly (claim →
  add explicit → foreign-check-restore → commit → release), minus the push step (system-
  auditor's notebook commit has never pushed — that's `fleet-worktree-push.sh`'s job).
**why-decision:** The bug class is "narrated prose steps get skipped by the model" — the
fix must be executed code with no LLM-narratable branch point between claim and commit,
which a single bash script with a bash-native `trap` guarantees mechanically.
**why-change:** no change from PO scoping.

### STEP developer-S2 · developer · 2026-07-03T01:10:00Z
**task-id:** FIX-AUDITOR-COMMIT-MUTEX-SKIP
**what-done:** Found + fixed a portability bug during live testing: `mapfile -t arr < <(cmd)`
is not available on this host's `/bin/bash` (macOS system bash 3.2, no bash4+ anywhere in
PATH) — first live test run failed with `mapfile: command not found`.
**what-considered:**
- Only path: replace with a `while IFS= read -r f; do ...; done < <(git diff --cached --name-only)`
  loop — works identically on bash 3.2+, no new dependency.
**why-decision:** The script must run in the actual agent-flow shell environment (host bash),
not assume a container's bash4 — precedent script `fleet-worktree-push.sh` documents
"bash 4+ required" but that assumption is untested on this host; safer to write this new
script portable to what is actually installed.
**why-change:** deviation from initial draft (used mapfile), caught by live test before commit.

### STEP developer-S3 · developer · 2026-07-03T01:40:00Z
**task-id:** FIX-AUDITOR-COMMIT-MUTEX-SKIP
**what-done:** Verified all 4 outcome classes live against the real gateway (no mocks):
success, no-op-skip, mutex-contended-skip-then-retry-succeeds, foreign-path-restore. Each
cross-checked via `task_list_held(kind="commit-mutex")` before/after to confirm the claim/
release pair actually happened (not just narrated). `task_claim` rejects `ttl_seconds<60`
(Zod min) — confirmed default TTL=90 is safely above the floor.
**what-considered:**
- Only path: PO's test plan explicitly specified live scratch-path testing over a stubbed
  unit-test harness (unlike `dev-team-tick-preflight.test.sh`'s mocked pattern) — this is a
  mutex-correctness script, so proving the REAL mcp-server round-trips the claim/release is
  the higher-value evidence for an S-sized fix.
**why-decision:** Real claim/release pairing is the actual invariant being fixed; a stub
would only prove the bash control-flow, not that the mutex round-trip is real.
**why-change:** no change from PO scoping (test method was explicitly specified).

### STEP developer-S4 · developer · 2026-07-03T01:55:00Z
**task-id:** FIX-AUDITOR-COMMIT-MUTEX-SKIP
**what-done:** Wired `docs/agents/system-auditor/flow/main.md`'s notebook commit step to
call the script + branch on its marker output (kept the edit to one block, replacing the
6-step narrated "Executed protocol" with the script invocation + verdict handling). Did NOT
touch the separate D-IMPROVE emit commit step (lines ~417-427, different files/call site,
not implicated in either recurring-bug report) — out of scope per the backlog `files` list.
**what-considered:**
- Only path: task/backlog `files` field explicitly scopes to exactly these two files.
**why-decision:** Minimal-diff mandate + explicit scope in the backlog entry.
**why-change:** no change from plan. Did NOT flip `docs/data/orch/orch-state.json` task_board
status per explicit dispatcher override in this task's CONSTRAINTS (reporting status in the
final RETURN message instead of writing the board).
