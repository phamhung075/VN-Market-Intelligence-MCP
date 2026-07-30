#!/usr/bin/env bash
# scripts/audits/shared-package-import-check.sh — FACTORY-GUARD-CI-SHAREDPKG-IMPL
#
# CI-time "shared-package-import" guardrail. Closes the gap identified in
# docs/architecture-briefs/2026-07-24-factory-guard-ci-shared-package-import-check.md:
# zero CI coverage anywhere (knip/depcheck/unimported/ts-prune) for a
# `packages/*` workspace member with ZERO real consumers anywhere in the repo
# — the exact "phantom package" shape already found once and pruned
# (FACTORY-SHARED-prune-phantom-primitives, packages/primitives/technical-analysis).
#
# Two independent checks:
#
#   1. Orphan-importer check (BLOCKING, baseline/ratchet — brief §3):
#      for every packages/*/package.json declaring a `@vn-market/`-scoped
#      `name`, grep apps/**+packages/** (own package dir excluded) for a real
#      import specifier (`from '@vn-market/<pkg>'` / `require('@vn-market/<pkg>')`)
#      or a package.json dependency entry (`"@vn-market/<pkg>": ...`).
#        - >=1 real importer found -> PASS, regardless of baseline membership
#          (a package gaining a consumer makes its baseline entry stale —
#          not auto-pruned, mirrors size-lint-justification.sh's manual
#          `--update` idiom).
#        - 0 importers + package listed in
#          docs/data/shared-package-import-baseline.json -> PASS (prints
#          BASELINE: <pkg> — tracked by FACTORY-SHARED-wire-or-prune-shared-packages).
#        - 0 importers + NOT baseline-listed -> FAIL. This is the actual
#          regression-prevention value: blocks a brand-new phantom package
#          from ever landing again without a human keep-or-cut decision.
#      Deliberately scoped to apps/**+packages/** only, NOT docs/** — this
#      repo's own architecture briefs discuss these package names by name in
#      prose (e.g. "@vn-market/shared-types|shared-config|shared-db"); if the
#      scan included docs/, that discussion text would itself be misread as a
#      "real importer" and permanently mask the very debt this gate exists to
#      catch. Only executable/manifest surfaces count as real usage evidence.
#
#   2. Symbol-collision check (ADVISORY ONLY, non-blocking — brief §3):
#      for every top-level `export interface|type|const|function <Name>` in
#      packages/shared-*/index.ts, grep apps/**/*.ts (excl. __tests__/tests/
#      *.test.ts/vendor) for the SAME exported symbol name declared
#      independently. A hit never fails --check — it prints an
#      `ADVISORY:` line only. Full AST structural diffing to make this
#      blocking is explicitly deferred (brief §3: no TS AST tool is wired
#      into any bash-only audit script in this repo; a regex field-diff would
#      false-positive on reorder/JSDoc/optional-marker churn).
#
# EXPLICITLY OUT OF SCOPE (reserved for FACTORY-SHARED-wire-or-prune-shared-packages,
# still BACKLOG): this script never edits packages/shared-*/ contents, never
# wires a new consumer, never deletes a package, never reconciles a field.
# It only observes and reports.
#
# Usage:
#   bash scripts/audits/shared-package-import-check.sh --check    # CI mode: exit 0 pass / 1 fail, no writes
#   bash scripts/audits/shared-package-import-check.sh --update   # regenerate docs/data/shared-package-import-baseline.json
#                                                                   #   from live repo state (run manually after
#                                                                   #   FACTORY-SHARED-wire-or-prune-shared-packages
#                                                                   #   wires or prunes a package — entries drop
#                                                                   #   out automatically once real importers exist
#                                                                   #   or the package is deleted)
#
# Env overrides (test-only; unset in normal/CI use):
#   SHAREDPKG_CHECK_BASELINE_OVERRIDE       default: $PROJECT_ROOT/docs/data/shared-package-import-baseline.json
#   SHAREDPKG_CHECK_PACKAGES_GLOB_OVERRIDE  default: 'packages/*/package.json'
#                                           (space-separated git pathspecs — lets tests scope package
#                                           discovery to a disposable fixture subtree instead of the
#                                           whole repo)
#   SHAREDPKG_CHECK_SEARCH_INCLUDE_OVERRIDE default: 'apps/**/*.ts' 'apps/**/package.json'
#                                           'packages/**/*.ts' 'packages/**/package.json'
#                                           (space-separated git pathspecs — scopes the check-1
#                                           importer search to a disposable fixture subtree)
#
# Owning flow: docs/policies/dev-standards.md § Script Persistence
# Detail ref: docs/architecture-briefs/2026-07-24-factory-guard-ci-shared-package-import-check.md
set -u

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "[shared-package-import-check] ERROR cannot resolve PROJECT_ROOT"; exit 2; }
cd "$PROJECT_ROOT" || exit 2

command -v jq >/dev/null 2>&1 || { echo "[shared-package-import-check] ERROR jq not found on PATH"; exit 2; }

BASELINE_FILE="${SHAREDPKG_CHECK_BASELINE_OVERRIDE:-$PROJECT_ROOT/docs/data/shared-package-import-baseline.json}"
TRACKED_BY_TASK="FACTORY-SHARED-wire-or-prune-shared-packages"

EXCLUDE_PATTERN='node_modules/|/dist/|\.venv/|PDF-Extract-Kit/|/vendor/'
APP_SCAN_EXCLUDE='(^|/)(__tests__|tests)(/|$)|\.test\.ts$|\.d\.ts$|node_modules/|/dist/|/vendor/'

usage() {
  echo "Usage: $0 --check | --update"
}

# ── Check-1 file lists ───────────────────────────────────────────────────────
list_packages() {
  if [ -n "${SHAREDPKG_CHECK_PACKAGES_GLOB_OVERRIDE:-}" ]; then
    # shellcheck disable=SC2206
    local -a globs=($SHAREDPKG_CHECK_PACKAGES_GLOB_OVERRIDE)
    git ls-files --cached --others --exclude-standard -- "${globs[@]}" 2>/dev/null
  else
    git ls-files --cached --others --exclude-standard -- 'packages/*/package.json' 2>/dev/null
  fi
}

list_search_files() {
  if [ -n "${SHAREDPKG_CHECK_SEARCH_INCLUDE_OVERRIDE:-}" ]; then
    # shellcheck disable=SC2206
    local -a globs=($SHAREDPKG_CHECK_SEARCH_INCLUDE_OVERRIDE)
    git ls-files --cached --others --exclude-standard -- "${globs[@]}" 2>/dev/null | grep -vE "$EXCLUDE_PATTERN" || true
  else
    git ls-files --cached --others --exclude-standard -- \
      'apps/**/*.ts' 'apps/**/package.json' 'packages/**/*.ts' 'packages/**/package.json' 2>/dev/null \
      | grep -vE "$EXCLUDE_PATTERN" || true
  fi
}

# Perf note: candidate file lists (search corpus, app-scan corpus) can run
# into the thousands in this repo. Every helper below batches ALL candidate
# paths into ONE grep invocation (grep -l ... -- "${files[@]}") instead of
# spawning a subprocess per file per package/symbol — a naive per-file loop
# here is O(packages|symbols x files) subprocess forks, which is slow enough
# (multi-minute) to make --check unusable in CI at this repo's file-count
# scale. A single batched grep call per package/symbol keeps this at O(1)
# fork per package/symbol regardless of corpus size.

# load_search_files_cache — populate SEARCH_FILES_CACHE[] once (Check 1).
SEARCH_FILES_CACHE=()
load_search_files_cache() {
  SEARCH_FILES_CACHE=()
  local f
  while IFS= read -r f; do
    [ -n "$f" ] && [ -f "$f" ] && SEARCH_FILES_CACHE+=("$f")
  done < <(list_search_files)
}

# has_importer <pattern> <own_dir> — sets HAS_IMPORTER=1/0 + HAS_IMPORTER_FILE.
# Scans SEARCH_FILES_CACHE[] (populated by load_search_files_cache), skipping
# any path under <own_dir> (a package's own files can never count as evidence
# of an external consumer), via a single batched grep -l call.
has_importer() {
  local pattern="$1" own_dir="$2" f
  HAS_IMPORTER=0
  HAS_IMPORTER_FILE=""
  local -a filtered=()
  for f in "${SEARCH_FILES_CACHE[@]}"; do
    case "$f" in
      "$own_dir"/*) continue ;;
    esac
    filtered+=("$f")
  done
  [ "${#filtered[@]}" -eq 0 ] && return 0
  HAS_IMPORTER_FILE="$(grep -lE "$pattern" -- "${filtered[@]}" 2>/dev/null | head -1)"
  [ -n "$HAS_IMPORTER_FILE" ] && HAS_IMPORTER=1
  return 0
}

# ── Check 1: orphan-importer (blocking, baseline/ratchet) ──────────────────
check1_orphan_importer() {
  local fail=0 pkg_json pkg_dir pkg_name short pattern baseline_keys

  baseline_keys=""
  if [ -f "$BASELINE_FILE" ]; then
    baseline_keys="$(jq -r '.entries // {} | keys[]' "$BASELINE_FILE" 2>/dev/null || true)"
  fi

  load_search_files_cache

  while IFS= read -r pkg_json; do
    [ -z "$pkg_json" ] && continue
    [ -f "$pkg_json" ] || continue
    pkg_name="$(jq -r '.name // empty' "$pkg_json" 2>/dev/null)"
    case "$pkg_name" in
      "@vn-market/"*) : ;;
      *) continue ;;
    esac
    pkg_dir="$(dirname "$pkg_json")"
    short="$(basename "$pkg_dir")"

    pattern="(from|require\\()[[:space:]]*['\"]${pkg_name}['\"]|['\"]${pkg_name}['\"][[:space:]]*:"
    has_importer "$pattern" "$pkg_dir"

    if [ "$HAS_IMPORTER" -eq 1 ]; then
      echo "  [shared-package-import-check] PASS: ${pkg_name} — real importer at ${HAS_IMPORTER_FILE}"
      continue
    fi

    if printf '%s\n' "$baseline_keys" | grep -qxF "$short"; then
      echo "  [shared-package-import-check] BASELINE: ${pkg_name} — zero importers, tracked by ${TRACKED_BY_TASK}"
      continue
    fi

    echo "  [shared-package-import-check] FAIL: ${pkg_name} (${pkg_dir}) — zero real importers and not baseline-listed (new phantom package)"
    fail=1
  done < <(list_packages)

  return $fail
}

# ── Check 2: symbol-collision (advisory only, never fails) ─────────────────
# No test-only override here (unlike Check 1's 3 overrides above): this
# check's own DoD case is proven against the LIVE repo directly (the real
# Alert/Signal/McpConfig collisions already exist there) — an override knob
# with zero exercising caller would be untested speculative surface.
list_shared_index_files() {
  git ls-files --cached --others --exclude-standard -- 'packages/shared-*/index.ts' 2>/dev/null
}

list_app_scan_files() {
  git ls-files --cached --others --exclude-standard -- 'apps/**/*.ts' 2>/dev/null | grep -vE "$APP_SCAN_EXCLUDE" || true
}

EXPORT_ERE='^export[[:space:]]+(interface|type|const|function)[[:space:]]+([A-Za-z_][A-Za-z0-9_]*)'

check2_symbol_collision() {
  local shared_file line sym app_pattern app_hit
  local -a app_files=()

  while IFS= read -r f; do
    [ -n "$f" ] && [ -f "$f" ] && app_files+=("$f")
  done < <(list_app_scan_files)

  [ "${#app_files[@]}" -eq 0 ] && return 0

  while IFS= read -r shared_file; do
    [ -z "$shared_file" ] && continue
    [ -f "$shared_file" ] || continue

    while IFS= read -r line; do
      if [[ "$line" =~ $EXPORT_ERE ]]; then
        sym="${BASH_REMATCH[2]}"
        app_pattern="^export[[:space:]]+(interface|type|const|function)[[:space:]]+${sym}([^A-Za-z0-9_]|\$)"
        app_hit="$(grep -lE "$app_pattern" -- "${app_files[@]}" 2>/dev/null | head -1)"
        if [ -n "$app_hit" ]; then
          echo "  [shared-package-import-check] ADVISORY: ${sym} exported in ${shared_file} AND independently exported in ${app_hit} — potential structural drift (non-blocking, see design brief §2/§3)"
        fi
      fi
    done < "$shared_file"
  done < <(list_shared_index_files)

  return 0
}

cmd_check() {
  local rc=0 r

  echo "[shared-package-import-check] Check 1/2 — orphan-importer (blocking, baseline/ratchet)..."
  check1_orphan_importer; r=$?; [ "$r" -ne 0 ] && rc=1

  echo "[shared-package-import-check] Check 2/2 — symbol-collision (advisory only, non-blocking)..."
  check2_symbol_collision

  if [ "$rc" -ne 0 ]; then
    echo "[shared-package-import-check] FAIL"
    return 1
  fi
  echo "[shared-package-import-check] PASS"
  return 0
}

cmd_update() {
  local ts pkg_json pkg_dir pkg_name short pattern entries_tmp old_count new_count entries_json

  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  entries_tmp="$(mktemp 2>/dev/null || echo "/tmp/shared-package-import-update-$$.tsv")"
  trap 'rm -f "$entries_tmp"' RETURN
  : > "$entries_tmp"

  load_search_files_cache

  while IFS= read -r pkg_json; do
    [ -z "$pkg_json" ] && continue
    [ -f "$pkg_json" ] || continue
    pkg_name="$(jq -r '.name // empty' "$pkg_json" 2>/dev/null)"
    case "$pkg_name" in
      "@vn-market/"*) : ;;
      *) continue ;;
    esac
    pkg_dir="$(dirname "$pkg_json")"
    short="$(basename "$pkg_dir")"

    pattern="(from|require\\()[[:space:]]*['\"]${pkg_name}['\"]|['\"]${pkg_name}['\"][[:space:]]*:"
    has_importer "$pattern" "$pkg_dir"
    [ "$HAS_IMPORTER" -eq 1 ] && continue

    printf '%s\t%s\n' "$short" "$pkg_name" >> "$entries_tmp"
  done < <(list_packages)

  new_count="$(wc -l < "$entries_tmp" | tr -d ' ')"
  old_count="0"
  [ -f "$BASELINE_FILE" ] && old_count="$(jq -r '.count // 0' "$BASELINE_FILE" 2>/dev/null || echo 0)"

  entries_json="$(jq -R -n \
    --arg task "$TRACKED_BY_TASK" \
    '[inputs | select(length>0) | split("\t") | {(.[0]): {npm_name: .[1], tracked_by: $task}}] | add // {}' \
    < "$entries_tmp")"

  jq -n \
    --arg ssot "docs/data/shared-package-import-baseline.json" \
    --arg generated_at "$ts" \
    --arg generated_by "scripts/audits/shared-package-import-check.sh --update" \
    --argjson count "$new_count" \
    --argjson entries "$entries_json" \
    '{
      _ssot: $ssot,
      _note: "Package-level grandfather baseline for scripts/audits/shared-package-import-check.sh --check (Check 1, orphan-importer). Snapshots every currently-zero-real-importer @vn-market/-scoped packages/*/package.json at --update time. A package drops out automatically once it gains >=1 real importer (re-checked live every --check run, regardless of baseline membership) or is deleted/renamed. Regenerated wholesale each --update (not merged) — see docs/architecture-briefs/2026-07-24-factory-guard-ci-shared-package-import-check.md.",
      _generated_by: $generated_by,
      generated_at: $generated_at,
      count: $count,
      entries: $entries
    }' | jq -S . > "${BASELINE_FILE}.tmp" && mv "${BASELINE_FILE}.tmp" "$BASELINE_FILE"

  echo "[shared-package-import-check] --update WROTE ${BASELINE_FILE} (baseline entries: ${old_count} -> ${new_count})"
  return 0
}

MODE="${1:-}"
case "$MODE" in
  --check) cmd_check; exit $? ;;
  --update) cmd_update; exit $? ;;
  *) usage; exit 2 ;;
esac
