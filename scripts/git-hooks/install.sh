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
# FIX-AUDITOR-NOTEBOOK-COMPOSE-COMMITMSG-MARKER-GATE (2026-08-26): added commit-msg
# (the notebook-compose actuator forcing function, PILOT-SCOPED to
# docs/agent-memory/notebooks/system-auditor.md — see the hook's own header
# comment + docs/architecture-briefs/2026-08-26-fix-auditor-notebook-compose-
# tier1-adoption-gap-and-commitmsg-forcing-function.md §Child A). commit-msg is
# the only hook that receives the proposed commit message ($1); pre-commit fires
# before git obtains it and cannot see the marker.
for hook in pre-push pre-commit post-commit commit-msg; do
  src="$HOOKS_SRC/$hook"
  dst="$HOOKS_DST/$hook"
  chmod +x "$src"
  ln -sf "$src" "$dst"
  echo "[install-hooks] linked $hook -> $src"
done
echo "[install-hooks] done"
