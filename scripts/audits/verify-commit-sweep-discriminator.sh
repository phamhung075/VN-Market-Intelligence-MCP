#!/usr/bin/env bash
# CANONICAL SCRIPT — verification harness for FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD
#
# Proves, in a throwaway repo, the two empirical claims the sweep-guard design rests on:
#   C1  a BARE `git commit -m <msg>` absorbs a peer's staged content it never staged itself
#   C2  a PATHSPEC-scoped `git commit -m <msg> -- <files>` structurally cannot, and
#       $GIT_INDEX_FILE's basename distinguishes the two race-free from inside a pre-commit
#       hook (bare => "index"/"index.lock"; pathspec => "next-index-<pid>.lock", because git
#       resolves the pathspecs into a scratch index BEFORE invoking the hook, while holding
#       index.lock for the whole transaction).
#
# Owning row     : FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD (task_board.ready)
# Owning brief   : docs/architecture-briefs/2026-07-21-commit-path-peer-index-sweep-guard.md
# First verified : 2026-07-21 by architect (scratch repo), independently reproduced same day
#                  by router — both runs agree on both claims.
#
# NEVER run against the live repo. Operates only inside a self-created temp dir, which it
# removes on exit. Exits non-zero if EITHER claim fails to reproduce — if that happens the
# hook design in the brief is invalid and must not be implemented as specified.

set -euo pipefail

SB="$(mktemp -d "${TMPDIR:-/tmp}/sweep-discriminator.XXXXXX")"
trap 'rm -rf "$SB"' EXIT
cd "$SB"

git init -q .
git config user.email probe@local
git config user.name probe

cat > .git/hooks/pre-commit <<'EOF'
#!/bin/bash
# $GIT_DIR is NOT reliably exported into the hook env (observed empty on git 2.x/macOS),
# which is itself worth knowing for the real guard: it must not depend on $GIT_DIR either.
# Hooks always run with CWD at the top of the working tree, so a relative path is safe.
basename "$GIT_INDEX_FILE" > .git/observed-index-basename
exit 0
EOF
chmod +x .git/hooks/pre-commit

echo base > seed.txt
git add seed.txt
git commit -qm seed

fail=0

# ---- C1: bare commit sweeps the peer -------------------------------------------------
echo mine > mine.txt
echo PEER-WIP > peer.txt
git add mine.txt peer.txt
git commit -qm "bare commit"
bare_basename="$(cat .git/observed-index-basename)"
bare_files="$(git show --name-only --format="" HEAD | sort | tr '\n' ' ')"

echo "C1 bare      : GIT_INDEX_FILE basename = ${bare_basename}"
echo "C1 bare      : files landed            = ${bare_files}"
if [[ "$bare_files" == *"peer.txt"* ]]; then
  echo "C1 PASS — bare commit swept the peer's staged file (defect reproduced)"
else
  echo "C1 FAIL — bare commit did NOT sweep; the premise of the row no longer holds"; fail=1
fi
case "$bare_basename" in
  index|index.lock) echo "C1 PASS — discriminator reads the real shared index" ;;
  *) echo "C1 FAIL — unexpected basename '${bare_basename}'; discriminator invalid"; fail=1 ;;
esac

# ---- C2: pathspec commit is structurally immune --------------------------------------
git reset -q --hard HEAD~1
git clean -qfd
echo mine2 > mine2.txt
echo PEER-WIP2 > peer2.txt
git add mine2.txt peer2.txt
git commit -qm "pathspec commit" -- mine2.txt
ps_basename="$(cat .git/observed-index-basename)"
ps_files="$(git show --name-only --format="" HEAD | sort | tr '\n' ' ')"
still_staged="$(git diff --cached --name-only | tr '\n' ' ')"

echo "C2 pathspec  : GIT_INDEX_FILE basename = ${ps_basename}"
echo "C2 pathspec  : files landed            = ${ps_files}"
echo "C2 pathspec  : still staged            = ${still_staged}"
if [[ "$ps_files" != *"peer2.txt"* && "$still_staged" == *"peer2.txt"* ]]; then
  echo "C2 PASS — peer content excluded from the commit and left staged, intact"
else
  echo "C2 FAIL — pathspec scoping did not protect the peer"; fail=1
fi
case "$ps_basename" in
  next-index-*.lock) echo "C2 PASS — git pre-resolved a scratch index before the hook ran" ;;
  *) echo "C2 FAIL — unexpected basename '${ps_basename}'; hook cannot tell the cases apart"; fail=1 ;;
esac

echo
if (( fail )); then
  echo "VERDICT: FAIL — sweep-guard design premise did NOT reproduce on this git version."
  echo "         git version: $(git --version)"
  exit 1
fi
echo "VERDICT: PASS — both claims reproduce. git version: $(git --version)"
