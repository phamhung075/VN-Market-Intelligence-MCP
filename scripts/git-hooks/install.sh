#!/usr/bin/env bash
# Install repo-tracked git hooks into .git/hooks via symlinks so future
# updates to scripts/git-hooks/* are picked up automatically.
set -e
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOKS_SRC="$REPO_ROOT/scripts/git-hooks"
HOOKS_DST="$REPO_ROOT/.git/hooks"

mkdir -p "$HOOKS_DST"
for hook in pre-push; do
  src="$HOOKS_SRC/$hook"
  dst="$HOOKS_DST/$hook"
  chmod +x "$src"
  ln -sf "$src" "$dst"
  echo "[install-hooks] linked $hook -> $src"
done
echo "[install-hooks] done"
