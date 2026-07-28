#!/usr/bin/env bash
# scripts/lib/archive-glob-cat.sh
#
# FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING (2026-07-28).
#
# Concatenates every monthly cold-archive document
# (docs/data/orch/archive/YYYY-MM.json) to stdout, in ascending
# (chronological) filename order, as a JSON stream suitable for
# `jq --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) ...`
# — jq's slurp mode reads a stream of concatenated top-level JSON values
# into one array, exactly what `dep_status_map($archive)`
# (scripts/lib/devteam-eligibility.jq) expects. Deliberately excludes
# docs/data/orch/archive/backlog-detail.json (different shape, already
# threaded separately everywhere via `--slurpfile detail`).
#
# WHY a dedicated script instead of an inline glob at each call site: the
# naive `--slurpfile archive <(cat docs/data/orch/archive/2026-*.json)`
# idiom breaks two ways this file avoids — (1) zero-match case: an
# unexpanded glob is passed to `cat` literally and errors; (2) shell
# word-splitting of a multi-line `$(ls ...)` capture is bash-vs-zsh
# dependent (verified empirically 2026-07-28: silently produces an EMPTY
# archive under zsh's default no-word-split behavior, with no error —
# a false-negative that would have looked like "the fix does nothing").
# This script uses `find | sort` + a plain `for` loop (no xargs
# empty-input ambiguity, no word-splitting dependency) so it behaves
# identically regardless of the invoking shell.
#
# Never errors/hangs on zero matches — outputs nothing, so the resulting
# `$archive` is `[]` (dep_status_map($archive) then behaves exactly like
# the hot-only 0-arg dep_status_map).
#
# Usage:
#   jq --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) ...
#   ARCHIVE_DIR=/path/to/scratch bash scripts/lib/archive-glob-cat.sh   # test override
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARCHIVE_DIR="${ARCHIVE_DIR:-${REPO_ROOT}/docs/data/orch/archive}"

for f in $(find "${ARCHIVE_DIR}" -maxdepth 1 -name '[0-9][0-9][0-9][0-9]-[0-9][0-9].json' 2>/dev/null | sort); do
  cat "$f"
done
