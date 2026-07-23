#!/usr/bin/env bash
# notebook-linecap-sweep.sh — TE-T17 (code-janitor 6h cron backstop)
#
# ROOT-CAUSE FIX: the notebook-auto-prune.sh PostToolUse hook only fires on the
# Write|Edit tool-call matcher (.claude/settings.local.json). Any notebook write
# landed via a different path — Bash heredoc/append, direct `mv`, etc — never
# triggers it, so a governed notebook can grow unbounded (ops.md hit 1197L,
# ~6x the 200L cap, before this sweep existed — the 07-11 Docker-incident
# heredoc dumps bypassed the hook entirely).
#
# This sweep is write-path-agnostic: it re-checks EVERY governed notebook on a
# fixed cadence (wired into code-janitor's existing 6h cron), independent of
# HOW the file grew. It reuses the exact same tested prune logic as the
# PostToolUse hook by feeding it synthetic PostToolUse JSON per over-cap file —
# no duplicated pruning logic, single source of truth for the drop-oldest algo.
#
# Owning flow: docs/agents/code-janitor/flow/main.md § Notebook Line-Cap Sweep
# Policy SSOT: docs/policies/dev-standards.md § Script Persistence
# Detail ref: docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-17
#
# Env overrides (test-only — sandbox the sweep without touching real notebooks):
#   NOTEBOOK_SWEEP_DIR      default: $PROJECT_ROOT/docs/agent-memory/notebooks
#   NOTEBOOK_SWEEP_PATTERN  default: *.md (glob passed to find -name)
#
# Exit: always 0 (best-effort housekeeping, matches memory-prune-sweep.sh
# convention). stdout: one [notebook-linecap-sweep] marker line per file
# over cap, ending with a SUMMARY line.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_ROOT="$(git -C "$REPO_ROOT" rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-$REPO_ROOT}")"

NOTEBOOKS_DIR="${NOTEBOOK_SWEEP_DIR:-$PROJECT_ROOT/docs/agent-memory/notebooks}"
NOTEBOOK_PATTERN="${NOTEBOOK_SWEEP_PATTERN:-*.md}"
PRUNE_HOOK="$PROJECT_ROOT/scripts/agents-flow/notebook-auto-prune.sh"

echo "[notebook-linecap-sweep] START dir=$NOTEBOOKS_DIR pattern=$NOTEBOOK_PATTERN cap=200"

[ -d "$NOTEBOOKS_DIR" ] || { echo "[notebook-linecap-sweep] SKIP reason=notebooks-dir-missing path=$NOTEBOOKS_DIR"; exit 0; }
[ -f "$PRUNE_HOOK" ] || { echo "[notebook-linecap-sweep] SKIP reason=prune-hook-missing path=$PRUNE_HOOK"; exit 0; }

checked=0
over_cap=0
pruned=0

while IFS= read -r -d '' f; do
  checked=$((checked + 1))
  line_count="$(wc -l < "$f" 2>/dev/null | tr -d ' ')"
  [ -z "$line_count" ] && continue
  [ "$line_count" -le 200 ] && continue

  over_cap=$((over_cap + 1))
  base="$(basename "$f")"
  echo "[notebook-linecap-sweep] OVER-CAP path=docs/agent-memory/notebooks/$base lines=$line_count cap=200"

  # Reuse the PostToolUse hook's own prune logic verbatim — single source of truth,
  # write-path-agnostic (this sweep is the backstop for the paths the hook's
  # Write|Edit matcher structurally cannot see, e.g. Bash heredoc writes).
  hook_input="$(printf '{"tool_input":{"file_path":"%s"}}' "$f")"
  printf '%s' "$hook_input" | bash "$PRUNE_HOOK" >/dev/null 2>&1 || true

  new_count="$(wc -l < "$f" 2>/dev/null | tr -d ' ')"
  if [ -n "$new_count" ] && [ "$new_count" -lt "$line_count" ]; then
    pruned=$((pruned + 1))
    echo "[notebook-linecap-sweep] PRUNED path=docs/agent-memory/notebooks/$base lines=${line_count}->${new_count}"
  else
    echo "[notebook-linecap-sweep] NO-CHANGE path=docs/agent-memory/notebooks/$base lines=$line_count reason=safe-fail-see-docs-signals-notebook-unparseable-or-single-section-breach"
  fi
done < <(find "$NOTEBOOKS_DIR" -maxdepth 1 -type f -name "$NOTEBOOK_PATTERN" -print0 2>/dev/null)

echo "[notebook-linecap-sweep] SUMMARY checked=$checked over_cap=$over_cap pruned=$pruned"
exit 0
