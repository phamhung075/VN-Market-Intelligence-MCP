#!/usr/bin/env bash
# scripts/audits/rebuild-raw-verify-check.sh — FACTORY-GUARD-CI-RAWVERIFY-IMPL
#
# CI-time / pre-push-time "rebuild-raw-verify attestation" guardrail. Closes
# the gap identified in
# docs/architecture-briefs/2026-07-24-factory-guard-ci-rebuild-raw-verify-hook.md:
# PUSH-AUTONOMY-1 §5 (docs/policies/dev-standards.md) mandates a post-push
# RAW-live REALDATA verification whenever a commit touches serving code, but
# there was ZERO mechanical enforcement that it ever happens — compliance
# evidence at design time: exactly 2 VERIFY-*-REALDATA board rows ever, across
# 54 commits touching apps/**/src/**|pkg/** serving code since §5 was pinned;
# concrete miss `e3386bdfa` ("remove DEFAULT-50 confidence mask, wire real
# severity/finding confidence" — exactly this bug class) shipped with zero
# attestation anywhere in its message and no companion VERIFY-*-REALDATA row.
#
# This is a FORWARD-ONLY attestation check on the diff of a push/PR range —
# NOT a source-file-pattern sweep like the size-lint/metric-mask/dead-code/
# no-hardcode/shared-package siblings, so there is no existing-file baseline
# to grandfather. Zero-tolerance from day 1 (same conclusion as the zero-
# tolerance siblings, different reasoning: not "small enough to fix now," but
# "there is nothing to fix, only to gate going forward" — brief §3).
#
# TRIGGER (evidence-scoped, composes the two already-designed sibling
# primitives rather than inventing a third pattern — brief §3): a file
# matches if BOTH:
#   (a) it is under a DB-write/route-serving DDD layer:
#       apps/*/src/infrastructure/**, apps/*/src/interface/**,
#       apps/*/pkg/interface/http/**, apps/*/pkg/infrastructure/**
#       (the same tiers FACTORY-GUARD-CI-depguard-tier-boundaries fences), AND
#   (b) an ADDED line (`git diff` `+` line) in that file, within the pushed
#       range, matches the metric-mask-lint sibling's own field regex
#       (scripts/audits/metric-mask-lint.sh IDENT_ERE:
#       `(confidence|score|impact|magnitude|probability)[A-Za-z0-9_]*`,
#       case-insensitive) — reused verbatim, not reinvented.
#
# DEVIATION (verify-live, narrower than the board-row note's literal "a file
# under <layer>" phrasing): test files colocated INSIDE these trigger layers
# (apps/mcp-server/src/infrastructure/**/__tests__/*.test.ts,
# apps/*/pkg/infrastructure/*_test.go, apps/*/pkg/interface/http/*_test.go —
# confirmed live via `find`, 2026-07-30) are excluded from the trigger corpus.
# A test assertion like `expect(result.confidence).toBe(0.8)` is not a serving-
# code change and would otherwise fire on nearly every infra/interface test
# edit, defeating the "evidence-scoped, not maximal" design intent (brief §3)
# — same test/vendor exclusion idiom metric-mask-lint.sh itself already
# applies to its OWN field-regex scan, reused here for the identical reason.
#
# On trigger, require ONE of (brief §3 / mechanism):
#   (i)   `git log <base-sha>..<head-sha> --format=%B` contains
#         `raw-verify|raw verified|realdata` (case-insensitive) — GLOBAL,
#         excuses every trigger point in the range;
#   (ii)  the range touches `docs/agent-memory/decisions/**` or
#         `reports/TASK_REPORT_*.md` with an ADDED line matching the SAME
#         token above — GLOBAL, excuses every trigger point in the range;
#   (iii) an inline `raw-verify-allow: <reason>` annotation on the SAME line
#         as the trigger, or the line immediately preceding it (mirrors the
#         `metric-mask-allow:`/`size-justification:` escape-hatch idiom) —
#         PER-TRIGGER-POINT, excuses only that one occurrence.
# None found -> FAIL, printing every un-excused file:line trigger + a fix
# hint pointing at PUSH-AUTONOMY-1 §5.
#
# No trigger anywhere in the range -> PASS trivially (this is the common
# case for the overwhelming majority of pushes).
#
# Fail-open posture: an invalid/absent base or head SHA (zero-SHA new-branch
# case, or a `git diff`/`git log` failure — e.g. a shallow clone missing the
# base commit, or a `pull_request` event where `github.event.before` is
# empty) PASSes (exit 0) with a WARN, never blocks a push on an inability to
# compute the diff. Same posture as the pre-push hook's own tsc-check fail-
# open branches (scripts/git-hooks/pre-push) — this script is called FROM
# that hook only when its own diff computation already succeeded, so this
# guard is defense-in-depth for the OTHER caller (the CI backstop job, which
# may see a `pull_request` event or a shallow-fetch edge case the hook never
# hits).
#
# Usage:
#   bash scripts/audits/rebuild-raw-verify-check.sh <base-sha> <head-sha>
#
# Exit codes: 0 = pass (incl. fail-open/no-trigger cases), 1 = fail
# (un-attested trigger point(s) found), 2 = usage error.
#
# Owning flow: docs/policies/dev-standards.md § Script Persistence
# Detail ref: docs/architecture-briefs/2026-07-24-factory-guard-ci-rebuild-raw-verify-hook.md
set -u

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "[rebuild-raw-verify-check] ERROR cannot resolve PROJECT_ROOT"; exit 2; }
cd "$PROJECT_ROOT" || exit 2

usage() {
  echo "Usage: $0 <base-sha> <head-sha>"
}

BASE="${1:-}"
HEAD="${2:-}"
ZERO_SHA="0000000000000000000000000000000000000000"

if [ -z "$BASE" ] || [ -z "$HEAD" ]; then
  usage
  exit 2
fi

if [ "$BASE" = "$ZERO_SHA" ] || [ "$HEAD" = "$ZERO_SHA" ]; then
  echo "[rebuild-raw-verify-check] PASS (fail-open) — zero-SHA base/head (new-branch / no-prior-commit case), nothing to diff"
  exit 0
fi

# ── Patterns ────────────────────────────────────────────────────────────────
# Trigger DDD layer (brief §3(a)):
TRIGGER_PATH_ERE='^apps/[^/]+/(src/(infrastructure|interface)|pkg/(interface/http|infrastructure))/'
# Test/vendor exclusion (verify-live deviation above; mirrors metric-mask-lint.sh):
EXCLUDE_TEST_ERE='(^|/)(__tests__|tests)(/|$)|\.test\.ts$|_test\.go$|(^|/)test_[^/]*\.py$'
# Field regex — reused VERBATIM from scripts/audits/metric-mask-lint.sh's IDENT_ERE:
FIELD_ERE='(confidence|score|impact|magnitude|probability)[A-Za-z0-9_]*'
# Attestation token regex (brief §3(i)/(ii), same token both places):
ATTEST_ERE='raw-verify|raw verified|realdata'

if ! CHANGED_FILES="$(git diff --name-only "$BASE" "$HEAD" 2>/dev/null)"; then
  echo "[rebuild-raw-verify-check] WARN: git diff --name-only ${BASE}..${HEAD} failed (unknown SHA / shallow clone) — fail-open PASS"
  exit 0
fi

# TRIGGER_POINTS: array of "file<TAB>line<TAB>content" entries.
TRIGGER_POINTS=()

# collect_triggers_for_file <file> — appends every added-line trigger in <file>
# (within BASE..HEAD) to TRIGGER_POINTS. Parses a -U0 unified diff: `cur` tracks
# the new-file line number, starting at each hunk's declared `+c` and
# incrementing once per context/added line (never for removed lines) — the
# standard technique for mapping diff `+` lines back to real file line numbers.
collect_triggers_for_file() {
  local f="$1" cur="" hdr content
  while IFS= read -r dline; do
    case "$dline" in
      "@@ "*)
        hdr="${dline#@@ }"
        hdr="${hdr%% @@*}"
        cur="$(printf '%s' "$hdr" | sed -E 's/^-[0-9]+(,[0-9]+)? \+([0-9]+)(,[0-9]+)?$/\2/')"
        case "$cur" in ''|*[!0-9]*) cur=0 ;; esac
        ;;
      "+++ "*|"--- "*)
        : ;;
      "+"*)
        content="${dline#+}"
        shopt -s nocasematch
        if [[ "$content" =~ $FIELD_ERE ]]; then
          TRIGGER_POINTS+=("${f}"$'\t'"${cur}"$'\t'"${content}")
        fi
        shopt -u nocasematch
        cur=$((cur + 1))
        ;;
      " "*)
        cur=$((cur + 1))
        ;;
      *)
        : ;;
    esac
  done < <(git diff -U0 "$BASE" "$HEAD" -- "$f" 2>/dev/null)
}

while IFS= read -r f; do
  [ -z "$f" ] && continue
  [[ "$f" =~ $EXCLUDE_TEST_ERE ]] && continue
  [[ "$f" =~ $TRIGGER_PATH_ERE ]] || continue
  collect_triggers_for_file "$f"
done <<< "$CHANGED_FILES"

if [ "${#TRIGGER_POINTS[@]}" -eq 0 ]; then
  echo "[rebuild-raw-verify-check] PASS — no added confidence|score|impact|magnitude|probability line under a DB-write/route-serving DDD layer in ${BASE}..${HEAD}"
  exit 0
fi

echo "[rebuild-raw-verify-check] ${#TRIGGER_POINTS[@]} trigger point(s) found in ${BASE}..${HEAD}:"
for tp in "${TRIGGER_POINTS[@]}"; do
  IFS=$'\t' read -r tf tln tcontent <<< "$tp"
  echo "  ${tf}:${tln} — ${tcontent}"
done

# ── Escape (i): commit-message attestation (global) ─────────────────────────
COMMIT_BODY="$(git log "${BASE}..${HEAD}" --format=%B 2>/dev/null)"
shopt -s nocasematch
if [[ "$COMMIT_BODY" =~ $ATTEST_ERE ]]; then
  shopt -u nocasematch
  echo "[rebuild-raw-verify-check] PASS — commit-message attestation found in ${BASE}..${HEAD} (RAW-verify/RAW verified/REALDATA token)"
  exit 0
fi
shopt -u nocasematch

# ── Escape (ii): docs/agent-memory/decisions/** or reports/TASK_REPORT_*.md
#    added-line attestation (global) ─────────────────────────────────────────
DECISIONS_ATTESTED=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    docs/agent-memory/decisions/*|reports/TASK_REPORT_*.md) : ;;
    *) continue ;;
  esac
  while IFS= read -r dline; do
    case "$dline" in
      "+++ "*|"--- "*) : ;;
      "+"*)
        dcontent="${dline#+}"
        shopt -s nocasematch
        if [[ "$dcontent" =~ $ATTEST_ERE ]]; then
          DECISIONS_ATTESTED=1
        fi
        shopt -u nocasematch
        ;;
      *) : ;;
    esac
  done < <(git diff -U0 "$BASE" "$HEAD" -- "$f" 2>/dev/null)
  [ "$DECISIONS_ATTESTED" -eq 1 ] && break
done <<< "$CHANGED_FILES"

if [ "$DECISIONS_ATTESTED" -eq 1 ]; then
  echo "[rebuild-raw-verify-check] PASS — attestation token found in an added docs/agent-memory/decisions/** or reports/TASK_REPORT_*.md line"
  exit 0
fi

# ── Escape (iii): per-trigger-point inline raw-verify-allow: annotation ──────
# has_inline_allow <file> <line> — 0 (true) iff the SAME line or the
# IMMEDIATELY PRECEDING line (at HEAD) carries a `raw-verify-allow:` comment.
has_inline_allow() {
  local f="$1" ln="$2" prev
  git show "${HEAD}:${f}" 2>/dev/null | sed -n "${ln}p" | grep -q 'raw-verify-allow:' && return 0
  prev=$((ln - 1))
  if [ "$prev" -ge 1 ]; then
    git show "${HEAD}:${f}" 2>/dev/null | sed -n "${prev}p" | grep -q 'raw-verify-allow:' && return 0
  fi
  return 1
}

UNEXCUSED=()
for tp in "${TRIGGER_POINTS[@]}"; do
  IFS=$'\t' read -r tf tln tcontent <<< "$tp"
  if ! has_inline_allow "$tf" "$tln"; then
    UNEXCUSED+=("$tp")
  fi
done

if [ "${#UNEXCUSED[@]}" -eq 0 ]; then
  echo "[rebuild-raw-verify-check] PASS — every trigger point carries a raw-verify-allow: inline annotation"
  exit 0
fi

echo ""
echo "[rebuild-raw-verify-check] FAIL — ${#UNEXCUSED[@]} un-attested trigger point(s):"
for tp in "${UNEXCUSED[@]}"; do
  IFS=$'\t' read -r tf tln tcontent <<< "$tp"
  echo "  ${tf}:${tln} — ${tcontent}"
done
echo ""
echo "[rebuild-raw-verify-check] Fix — attest with ONE of (docs/policies/dev-standards.md PUSH-AUTONOMY-1 §5):"
echo "  1. a RAW-verify / RAW verified / REALDATA token in a commit message in this range"
echo "  2. the same token in an added line under docs/agent-memory/decisions/** or reports/TASK_REPORT_*.md"
echo "  3. an inline 'raw-verify-allow: <reason>' comment on the triggering line (or the line immediately preceding it)"
exit 1
