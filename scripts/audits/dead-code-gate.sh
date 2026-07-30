#!/usr/bin/env bash
# scripts/audits/dead-code-gate.sh — FACTORY-GUARD-CI-DEADCODE-IMPL
#
# CI-time "dead-code" guardrail. Closes the gap identified in
# docs/architecture-briefs/2026-07-24-factory-guard-ci-dead-code-gate.md: zero
# CI coverage anywhere (knip/ts-prune/vulture/deadcode) for 4 recurring dead-
# artifact shapes found live in this repo. Zero-tolerance (fix-now, same
# pattern as scripts/audits/metric-mask-lint.sh — NOT baseline/ratchet like
# size-lint-justification.sh), 4 cheap structural (git ls-files/grep) checks
# — no per-symbol unused-export analysis (deferred, see brief §2).
#
# Checks 1/2/4 operate on TRACKED files only (`git ls-files --cached`), so a
# merely-gitignored-but-uncommitted file is never flagged — only a
# staged/committed offender is (mirrors the "tracked-file ban" wording in the
# design brief §2, checks 1/2/4, verbatim):
#   1. Tracked *.bak / *.backup / *.patch file — banned.
#   2. Any tracked path with a `_deprecated/` path segment — banned. Git
#      history is the rollback reference (FACTORY-INTERFACE-delete-bak-files
#      precedent, same brief §2 rationale) — a graveyard folder adds zero
#      safety over `git log`/`git show` while diluting every grep.
#   4. `//go:build ignore` on any tracked `*.go` file — banned (archived-but-
#      compiled-out code; zero legitimate use found at design time).
#
# Check 3 — Go/TS "twin scaffold" — DEVIATES from the board-row note's literal
# phrasing ("any apps/<svc>/ with a Go cmd/server/ at its root MUST NOT also
# carry a top-level package.json and src/"). That literal rule fails
# immediately and permanently against the LIVE apps/news-fetch service, which
# legitimately carries all 3 structural elements today: a WIP parallel Go
# port (own news-fetch-go-lint CI job + composition-root-logic-gate coverage,
# per the FACTORY-GUARD-CI-TSBOUNDARIES-IMPL CANONICAL note — same
# design-brief day, 2026-07-24) sitting alongside the live TS/Bun service
# that its Dockerfile actually builds and runs
# (`COPY --from=bun-builder /app/src ./src`, `CMD ["bun","run","src/index.ts"]`).
# TS is the deployed artifact there; Go is an in-progress parallel
# implementation — not orphaned dead code, so it must not be flagged.
#
# The confirmed dead instance this check is purpose-built for
# (apps/technical-analysis — already independently deleted 2026-07-28,
# commit 099afddd3, by a separate task before this gate was even dispatched)
# had a discriminating trait the board note's directory-shape-only phrasing
# dropped: its Dockerfile `COPY`d only `cmd/ pkg/ api/` — ZERO `src/`
# reference of any kind, because the TS tree was never wired into the build
# at all. This check generalizes that exact confirmed signal instead of bare
# directory shape:
#   3. An apps/<svc>/ with a tracked Go `cmd/server/` AND a tracked top-level
#      `package.json` AND a tracked top-level `src/` — banned ONLY IF that
#      service's Dockerfile does not reference `src` anywhere (no Dockerfile
#      at all also fails this — conservative default, nothing deploys either
#      tree). A Dockerfile that does reference `src` (i.e. TS is the thing
#      actually being built/deployed, e.g. news-fetch) is exempted — the twin
#      is a live WIP dual-implementation, not a stray unbuilt scaffold.
#
# Usage:
#   bash scripts/audits/dead-code-gate.sh --check    # CI mode: exit 0 pass / 1 fail, no writes
#
# Env overrides (test-only; unset in normal/CI use):
#   DEAD_CODE_GATE_PATHSPEC_OVERRIDE   space-separated git pathspecs — scopes
#     checks 1/2/4 to a disposable fixture subtree instead of the whole repo
#     (mirrors metric-mask-lint.sh's *_INCLUDE_OVERRIDE idiom). Fixture files
#     must still be `git add -f`'d (staged) — an untracked file is correctly
#     never flagged by these "tracked-file" checks.
#   DEAD_CODE_GATE_APPS_OVERRIDE       space-separated apps/<svc>-shaped dir
#     paths — scopes check 3 to only these dirs instead of auto-discovering
#     every apps/*/ with a tracked cmd/server/.
#
# Owning flow: docs/policies/dev-standards.md § Script Persistence
# Detail ref: docs/architecture-briefs/2026-07-24-factory-guard-ci-dead-code-gate.md
set -u

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "[dead-code-gate] ERROR cannot resolve PROJECT_ROOT"; exit 2; }
cd "$PROJECT_ROOT" || exit 2

if [ -n "${DEAD_CODE_GATE_PATHSPEC_OVERRIDE:-}" ]; then
  # shellcheck disable=SC2206
  SCAN_PATHSPECS=($DEAD_CODE_GATE_PATHSPEC_OVERRIDE)
else
  SCAN_PATHSPECS=('.')
fi

usage() {
  echo "Usage: $0 --check"
}

# ── Check 1: tracked *.bak / *.backup / *.patch ─────────────────────────────
check1_bak_backup_patch() {
  local matches
  matches=$(git ls-files --cached -- "${SCAN_PATHSPECS[@]}" 2>/dev/null | grep -E '\.(bak|backup|patch)$' || true)
  [ -z "$matches" ] && return 0
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    echo "  [dead-code-gate] BAK/BACKUP/PATCH tracked: $f"
  done <<< "$matches"
  return 1
}

# ── Check 2: tracked _deprecated/ path segment ──────────────────────────────
check2_deprecated_dirs() {
  local matches
  matches=$(git ls-files --cached -- "${SCAN_PATHSPECS[@]}" 2>/dev/null | grep -E '(^|/)_deprecated/' || true)
  [ -z "$matches" ] && return 0
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    echo "  [dead-code-gate] _deprecated/ path: $f"
  done <<< "$matches"
  return 1
}

# ── Check 3: Go/TS twin scaffold, Dockerfile-src-blind only ────────────────
check3_twin_scaffold() {
  local svc_dirs=() svc has_pkgjson has_src has_docker_src_ref fail=0

  if [ -n "${DEAD_CODE_GATE_APPS_OVERRIDE:-}" ]; then
    # shellcheck disable=SC2206
    svc_dirs=($DEAD_CODE_GATE_APPS_OVERRIDE)
  else
    while IFS= read -r d; do
      [ -z "$d" ] && continue
      svc_dirs+=("$d")
    done < <(git ls-files --cached -- 'apps/*/cmd/server/*' 2>/dev/null | sed -E 's#^(apps/[^/]+)/cmd/server/.*#\1#' | sort -u)
  fi

  for svc in "${svc_dirs[@]}"; do
    [ -z "$svc" ] && continue
    has_pkgjson=""
    has_src=""
    git ls-files --cached -- "$svc/package.json" 2>/dev/null | grep -q . && has_pkgjson=1
    git ls-files --cached -- "$svc/src" 2>/dev/null | grep -q . && has_src=1
    { [ -n "$has_pkgjson" ] && [ -n "$has_src" ]; } || continue

    has_docker_src_ref=""
    if [ -f "$svc/Dockerfile" ] && grep -qE '\bsrc\b|src/' "$svc/Dockerfile" 2>/dev/null; then
      has_docker_src_ref=1
    fi
    if [ -n "$has_docker_src_ref" ]; then
      continue   # TS side is the deployed artifact (e.g. news-fetch) — WIP dual-stack, not orphaned.
    fi

    echo "  [dead-code-gate] Go/TS twin scaffold, TS side unbuilt: $svc (tracked cmd/server + package.json + src/, Dockerfile has zero src reference)"
    fail=1
  done
  return $fail
}

# ── Check 4: //go:build ignore on tracked *.go ──────────────────────────────
# NOTE: filter-after-list (grep '\.go$'), NOT a second `-- ... '*.go'` pathspec
# appended to SCAN_PATHSPECS — git pathspecs OR together, they don't
# intersect, so `git ls-files -- . '*.go'` would list EVERY tracked file
# (union with '.'), not just *.go ones. Same pattern as checks 1/2 above.
check4_go_build_ignore() {
  local matches f fail=0
  matches=$(git ls-files --cached -- "${SCAN_PATHSPECS[@]}" 2>/dev/null | grep -E '\.go$' || true)
  [ -z "$matches" ] && return 0
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ -f "$f" ] || continue
    if grep -qE '^//go:build ignore$' "$f" 2>/dev/null; then
      echo "  [dead-code-gate] //go:build ignore tracked: $f"
      fail=1
    fi
  done <<< "$matches"
  return $fail
}

cmd_check() {
  local rc=0 r

  echo "[dead-code-gate] Check 1/4 — tracked *.bak/*.backup/*.patch..."
  check1_bak_backup_patch; r=$?; [ "$r" -ne 0 ] && rc=1

  echo "[dead-code-gate] Check 2/4 — tracked _deprecated/ paths..."
  check2_deprecated_dirs; r=$?; [ "$r" -ne 0 ] && rc=1

  echo "[dead-code-gate] Check 3/4 — Go/TS twin scaffold..."
  check3_twin_scaffold; r=$?; [ "$r" -ne 0 ] && rc=1

  echo "[dead-code-gate] Check 4/4 — //go:build ignore..."
  check4_go_build_ignore; r=$?; [ "$r" -ne 0 ] && rc=1

  if [ "$rc" -ne 0 ]; then
    echo "[dead-code-gate] FAIL"
    return 1
  fi
  echo "[dead-code-gate] PASS — 0 offenders across all 4 checks"
  return 0
}

MODE="${1:-}"
case "$MODE" in
  --check) cmd_check; exit $? ;;
  *) usage; exit 2 ;;
esac
