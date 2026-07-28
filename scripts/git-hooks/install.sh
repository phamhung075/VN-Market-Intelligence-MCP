#!/usr/bin/env bash
# Install repo-tracked git hooks into .git/hooks via symlinks so future
# updates to scripts/git-hooks/* are picked up automatically.
set -e
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOKS_SRC="$REPO_ROOT/scripts/git-hooks"
HOOKS_DST="$REPO_ROOT/.git/hooks"

mkdir -p "$HOOKS_DST"
# FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-HOOK (2026-07-28): added pre-commit (the
# universal commit-path sweep guard, brief §4.1) and its post-commit SHA-correlation
# companion (brief §4.1). Same tracked-source-plus-symlink pattern as pre-push —
# re-running this script (fresh clone / .git rebuild, .git/hooks is untracked) picks
# up all three.
for hook in pre-push pre-commit post-commit; do
  src="$HOOKS_SRC/$hook"
  dst="$HOOKS_DST/$hook"
  chmod +x "$src"
  ln -sf "$src" "$dst"
  echo "[install-hooks] linked $hook -> $src"
done
echo "[install-hooks] done"
