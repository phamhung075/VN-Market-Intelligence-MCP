#!/usr/bin/env bash
# scripts/git-hooks/pre-commit.test.sh
#
# Permanent regression suite for scripts/git-hooks/pre-commit (FIX-COMMIT-PATH-PEER-
# INDEX-SWEEP-GUARD-HOOK). Makes the row's own verification_gate replayable instead of
# a one-time manual check — protects against a future git version silently changing
# the `next-index-*.lock` internal naming this design depends on (verified only on
# git 2.49.0/macOS at implementation time; the row's spec recommends also running this
# once on Linux/CI before treating the AC as durably satisfied).
#
# ISOLATION: every scenario runs inside its own mktemp scratch repo with a git-init'd
# working tree and the REAL scripts/git-hooks/pre-commit script symlinked into
# .git/hooks/ (same mechanism scripts/git-hooks/install.sh uses) — NEVER touches the
# live project repo or its .git/.
#
# Coverage (mirrors brief §2.1/2.2/2.3/2.4/2.6 exactly):
#   T1  bare commit sweeps a peer's staged file (defect reproduced) → WARN fires
#       (stderr banner + .git/sweep-guard.log line), commit still lands, BOTH files
#       included — default mode never blocks.
#   T2  pathspec-scoped commit, even after `git add -A`, excludes a peer's staged
#       file — completely silent (no stderr, no log line), peer file stays staged.
#   T3  directory/dot pathspec (`-- some-dir/`, `-- .`) is a KNOWN, DOCUMENTED
#       non-goal (brief §2.3) — asserts the loophole exists (still silently sweeps),
#       so a future accidental narrowing of scope is caught as a behavior CHANGE,
#       not silently assumed away.
#   T4  `git rebase` replay of an already-pathspec-scoped commit does not re-trigger
#       a false WARN (brief §2.4) — rebase reconstructs from a scratch index too.
#   T5  GIT_SWEEP_GUARD_MODE=reject blocks a bare commit (non-zero exit), index left
#       untouched — nothing committed, peer file recoverable, actor's own file still
#       staged (fix path is a single retry with an explicit pathspec).
#   T6  UNKNOWN $GIT_INDEX_FILE shape fails OPEN + LOUD (AC-3) — invoked directly
#       (git itself never produces this shape; this exercises the hook's own
#       internal-error branch in isolation).
#
# Run:
#   bash scripts/git-hooks/pre-commit.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-HOOK
# Owning brief: docs/architecture-briefs/2026-07-21-commit-path-peer-index-sweep-guard.md
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SRC="$SCRIPT_DIR/pre-commit"

if [ ! -f "$HOOK_SRC" ]; then
  echo "ERROR: pre-commit hook not found at $HOOK_SRC" >&2
  exit 1
fi

PASS=0
FAIL=0

new_repo() {
  # Creates a fresh scratch repo, symlinks the REAL hook in, seeds a base commit.
  local dir
  dir="$(mktemp -d "${TMPDIR:-/tmp}/sweep-guard-test.XXXXXX")"
  (
    cd "$dir" || exit 1
    git init -q .
    git config user.email test@local
    git config user.name test
    mkdir -p .git/hooks
    ln -sf "$HOOK_SRC" .git/hooks/pre-commit
    echo base > seed.txt
    git add seed.txt
    git commit -qm seed -- seed.txt   # pathspec-scoped so bootstrap itself never trips the guard
  )
  printf '%s' "$dir"
}

# ── T1: bare commit sweeps a peer's staged file ────────────────────────────────
D1="$(new_repo)"
(
  cd "$D1" || exit 1
  echo mine > mine.txt
  echo PEER-WIP > peer.txt
  git add mine.txt peer.txt
  git commit -qm "bare commit" 2>stderr.log
)
files1="$(cd "$D1" && git show --name-only --format="" HEAD | sort | tr '\n' ' ')"
log1_exists="no"; [ -f "$D1/.git/sweep-guard.log" ] && log1_exists="yes"
warn1_exists="no"; grep -q "sweep-guard" "$D1/stderr.log" 2>/dev/null && warn1_exists="yes"
if [[ "$files1" == *"peer.txt"* && "$files1" == *"mine.txt"* && "$log1_exists" == "yes" && "$warn1_exists" == "yes" ]]; then
  echo "PASS T1: bare commit swept peer.txt (files=[$files1]), WARN banner + log fired, commit still landed"
  PASS=$((PASS + 1))
else
  echo "FAIL T1: files=[$files1] log_exists=$log1_exists warn_stderr=$warn1_exists"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D1"

# ── T2: pathspec-scoped commit excludes peer, even after `git add -A` ──────────
D2="$(new_repo)"
(
  cd "$D2" || exit 1
  echo mine2 > mine2.txt
  echo PEER-WIP2 > peer2.txt
  git add -A
  git commit -qm "pathspec commit" -- mine2.txt 2>stderr.log
)
files2="$(cd "$D2" && git show --name-only --format="" HEAD | sort | tr '\n' ' ')"
staged2="$(cd "$D2" && git diff --cached --name-only | tr '\n' ' ')"
log2_exists="no"; [ -f "$D2/.git/sweep-guard.log" ] && log2_exists="yes"
stderr2_empty="yes"; [ -s "$D2/stderr.log" ] && stderr2_empty="no"
if [[ "$files2" != *"peer2.txt"* && "$staged2" == *"peer2.txt"* && "$log2_exists" == "no" && "$stderr2_empty" == "yes" ]]; then
  echo "PASS T2: pathspec commit excluded peer2.txt (files=[$files2]), left staged=[$staged2], completely silent"
  PASS=$((PASS + 1))
else
  echo "FAIL T2: files=[$files2] staged=[$staged2] log_exists=$log2_exists stderr_empty=$stderr2_empty"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D2"

# ── T3: directory/dot pathspec is a KNOWN non-goal — documents, does not "fix" ──
# Adversarial shape: a peer's foreign file staged INSIDE the same directory the
# actor names on the commit line. `-- sub3/` and `-- .` route through the SAME
# scratch-index code path as an exact-file pathspec (SCOPED per the discriminator)
# but still sweep every sibling under that path — verified in brief §2.3. None of
# the 3 real occurrences used this form, so it is not required to satisfy the
# row's verification_gate, but this test exists so a future accidental narrowing
# of scope is caught as a behavior CHANGE, not silently assumed away.
D3="$(new_repo)"
(
  cd "$D3" || exit 1
  mkdir -p sub3
  echo mine3 > sub3/mine3.txt
  echo PEER-WIP3 > sub3/peer3.txt
  git add sub3/mine3.txt sub3/peer3.txt
  git commit -qm "dir pathspec sweeps sibling" -- sub3/ 2>stderr.log
)
files3="$(cd "$D3" && git show --name-only --format="" HEAD | sort | tr '\n' ' ')"
if [[ "$files3" == *"sub3/peer3.txt"* && "$files3" == *"sub3/mine3.txt"* ]]; then
  echo "PASS T3: directory pathspec -- sub3/ swept sibling peer3.txt (files=[$files3]) — documented non-goal confirmed, not silently closed"
  PASS=$((PASS + 1))
else
  echo "FAIL T3: files=[$files3] — expected directory pathspec to STILL sweep a sibling (§2.3 known loophole); if this now fails, the loophole was unexpectedly closed — update brief §2.3 before treating this as a fix"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D3"

# ── T4: rebase replay of an already-scoped commit does not false-WARN ──────────
D4="$(new_repo)"
(
  cd "$D4" || exit 1
  base_branch="$(git branch --show-current)"   # whatever `git init` named the default branch (main/master) — never hardcode
  git checkout -qb feature
  echo f1 > f1.txt
  git add f1.txt
  git commit -qm "pathspec on feature" -- f1.txt
  git checkout -q "$base_branch"
  echo m1 > m1.txt
  git add m1.txt
  git commit -qm "pathspec on base" -- m1.txt
  git checkout -q feature
  rm -f .git/sweep-guard.log
  git rebase -q "$base_branch" >rebase.log 2>&1
)
log4_exists="no"; [ -f "$D4/.git/sweep-guard.log" ] && log4_exists="yes"
# Captured into a variable (not piped live into grep -q) — a live pipe here is racy
# under `set -o pipefail`: `git log --oneline | grep -q` can SIGPIPE `git log` the
# instant grep finds its match and quits early, and pipefail then reports that
# SIGPIPE (128+13=141) as the pipeline's exit status even though grep itself found
# the line — a false FAIL, observed flaky on this exact line during implementation.
rebase4_ok="no"
log4_out="$(cd "$D4" && git log --oneline 2>/dev/null)"
[[ "$log4_out" == *"pathspec on feature"* ]] && rebase4_ok="yes"
if [[ "$log4_exists" == "no" && "$rebase4_ok" == "yes" ]]; then
  echo "PASS T4: rebase replay of a pathspec-scoped commit produced no sweep-guard.log entry (no false WARN)"
  PASS=$((PASS + 1))
else
  echo "FAIL T4: log_exists=$log4_exists rebase_completed=$rebase4_ok"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D4"

# ── T5: GIT_SWEEP_GUARD_MODE=reject blocks, index left untouched ───────────────
D5="$(new_repo)"
commit5_exit=0
(
  cd "$D5" || exit 1
  echo mine5 > mine5.txt
  echo PEER-WIP5 > peer5.txt
  git add mine5.txt peer5.txt
  GIT_SWEEP_GUARD_MODE=reject git commit -qm "bare commit rejected" 2>stderr.log
) || commit5_exit=$?
staged5="$(cd "$D5" && git diff --cached --name-only | tr '\n' ' ')"
head5="$(cd "$D5" && git log --oneline | wc -l | tr -d ' ')"
if [[ "$commit5_exit" -ne 0 && "$staged5" == *"mine5.txt"* && "$staged5" == *"peer5.txt"* && "$head5" == "1" ]]; then
  echo "PASS T5: GIT_SWEEP_GUARD_MODE=reject blocked the commit (exit=$commit5_exit), both files remain staged=[$staged5], HEAD unchanged"
  PASS=$((PASS + 1))
else
  echo "FAIL T5: exit=$commit5_exit staged=[$staged5] head_count=$head5"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D5"

# ── T6: UNKNOWN $GIT_INDEX_FILE shape fails OPEN + LOUD ─────────────────────────
D6="$(new_repo)"
exit6=0
out6="$(cd "$D6" && GIT_INDEX_FILE="/tmp/not-a-real-index-shape" bash "$HOOK_SRC" 2>&1)" || exit6=$?
if [[ "$exit6" -eq 0 && "$out6" == *"INTERNAL"* && "$out6" == *"unrecognized GIT_INDEX_FILE shape"* ]]; then
  echo "PASS T6: unrecognized GIT_INDEX_FILE shape failed OPEN (exit=$exit6) and LOUD (stderr mentions it)"
  PASS=$((PASS + 1))
else
  echo "FAIL T6: exit=$exit6 output=[$out6]"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D6"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
