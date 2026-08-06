#!/usr/bin/env bash
# scripts/audits/po-mint-orchapply-actuator-verify.sh
#
# Regression verifier for FIX-PO-BATCH-MINT-NO-WRITE-ACTUATOR, spec'd inline at
# docs/agents/po/flow/main.md:173 and shipped as follow-up task
# FIX-PO-MINT-ACTUATOR-REGRESSION-VERIFIER-SCRIPT.
#
# ROOT CAUSE this guards against: sprint-kickoff.md/channel-audit.md/
# market-group.md/telegram-reports.md each used to instruct a `.task_board`/
# `.sprint_goal` mutation in PROSE (or a bare JSON literal fenced example) with
# NO `scripts/orch-apply.sh` pipe anywhere nearby — the write never actually
# landed on disk (commit 3ce726a6e fixed all 4; this script is the AC-3
# "actual closure test" so the class cannot silently regress).
#
# TWO COMPLEMENTARY CHECKS (same "runtime guard + source guard, neither closes
# the other's blind spot" split already used by verify-market-db-journal-
# mode.sh / verify-market-db-journal-source-guard.sh in this repo):
#
#   CHECK 1 (fine-grained, per fenced code block): any ```...``` block whose
#     jq filter mutates `.task_board`/`.sprint_goal` (a line inside the block
#     containing BOTH one of those two path roots AND a `+=`/`|=` jq
#     operator) MUST also contain the literal string `orch-apply.sh`
#     somewhere in the SAME block. Catches literal write code shipped
#     without its actuator pipe, regardless of what the surrounding prose
#     says.
#
#   CHECK 2 (coarser, per markdown section): a prose line OUTSIDE any fenced
#     block that names a write-intent verb (Append/Add/Create/Write/Update/
#     Open/Commit/Mint, case-insensitive — the live corpus mixes "Append"/
#     "append") alongside a board-mutation target (`docs/data/orch/
#     orch-state.json`, `.task_board.<lane>[]`, or `.sprint_goal.entries[]`)
#     is a "board-mutation instruction". Its ENCLOSING markdown section
#     (bounded by the nearest heading at-or-above it and the next heading of
#     ANY level below it — this repo's docs use `##`/`###` per logical step,
#     see market-group.md's 3b/3c/3d) MUST contain `orch-apply.sh` somewhere.
#     Section-scoped (not line/fence-proximity-scoped) deliberately: several
#     legitimate docs describe one actuator once and then say "same actuator
#     as <sibling step>" for the next 1-2 steps in the SAME section
#     (market-group.md 3c/3d; sprint-signoff.md's Reject bullet references
#     the Approve bullet 24 lines above it in the same `##` section) rather
#     than repeating the jq literally — a same-line/nearest-fence-only check
#     would false-positive on that legitimate cross-reference shape. Check 1
#     is the precise backstop for anything that DOES carry literal mutating
#     jq: if a section-shared cross-reference ever hides a real per-block
#     regression, Check 1 catches it independently. An anchor line that
#     ALREADY carries `orch-apply.sh` on the SAME line is never flagged
#     (`scripts-registry.md`'s and `main.md`'s own inline-rule idiom).
#
# SCOPE — opt-IN allowlist, fleet-wide by default, no per-file exemption list
# (feedback_fleetwide_gate_validated_on_one_file_optout_allowlist: a
# hand-picked subset of "files we know are the offenders" is exactly the
# shape that lets an unlisted file regress silently). Default target is the
# WHOLE `docs/agents/po/flow/*.md` corpus, always — the "opt-in" is the glob
# itself (everything matching it is in scope), never a name-by-name allowlist
# of files to check or skip.
#
# LIVE RESULT at authoring time (2026-08-06), fleet-wide against all 15
# files, NOT hand-picked: 13/15 PASS clean, including all 4 files
# FIX-PO-BATCH-MINT-NO-WRITE-ACTUATOR (commit 3ce726a6e) fixed
# (sprint-kickoff.md, channel-audit.md, market-group.md, telegram-reports.md)
# plus main.md, manual-dispatch-sweep.md, supervised-goahead.md,
# sprint-signoff.md, scripts-registry.md, push-backstop.md, review-ba-spec.md,
# triage-tnb.md, zone-routing.md. `scripts-registry.md` passes on its own
# merits, not via an exclusion: every one of its `.jq -f <file>` entries ends
# its `Usage:` clause in `| bash scripts/orch-apply.sh` on the SAME line as
# the mutation description.
#
# 2/15 FAIL — a REAL, NOT-YET-FIXED instance of the SAME defect class,
# structurally out of THIS task's scope (docs/agents/ is agent-father's zone
# per the PO ARTIFACT-CLASS ROUTING RULING 2026-07-21T18:42Z, not
# developer's/scripts/), left failing deliberately rather than tuned away —
# doing otherwise would reproduce the exact "validated on one file" failure
# this checker exists to avoid:
#   triage-signals.md          lines 18/22/23/37/43 (zone_missing_tier3,
#                               repair_task_request, ci_red, signal_feedback
#                               rows — table-cell prose, "append"/"mint"/
#                               "commit" the board row, never a literal
#                               orch-apply.sh pipe anywhere in the file)
#   triage-signals-longtail.md lines 15/18/20 (context_bloat_breach,
#                               ops_followup_request, triage-persist-request
#                               rows — same shape, same file family)
# Filed as follow-up via this task's RETURN/handoff for agent-father to wire
# the same actuator pipe into these two docs' mint rows — NOT fixed in this
# commit (out of zone + scope for this P2 S/M task).
#
# Usage:
#   bash scripts/audits/po-mint-orchapply-actuator-verify.sh
#
# Env override (test-only; unset in normal use): space-separated list of
# literal file paths to scan instead of the live corpus (mirrors the
# *_INCLUDE_OVERRIDE idiom used by no-hardcode-allowlist-scan.sh /
# verify-market-db-journal-source-guard.sh, adapted to plain paths since this
# checker targets docs, not git-tracked source).
#   PO_MINT_ACTUATOR_VERIFY_INCLUDE_OVERRIDE
#
# Owning flow: docs/agents/po/flow/main.md § Regression verifier
# Exit 0 = PASS (no violations). Exit 1 = FAIL (>=1 violation, printed).
# Exit 2 = usage/environment error.
#
# shellcheck disable=SC2094 # every `$f` use below is READ-ONLY (the two
# `while ... done < "$f"` scans and the `sed -n ... "$f" | grep` line lookup)
# — this script never writes a scanned file.

set -u
shopt -s nocasematch  # trigger/target verb matching below must be case-insensitive
                       # (the live corpus mixes "Append"/"append", "Create"/"create", etc.)

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "[po-mint-orchapply-actuator-verify] ERROR cannot resolve PROJECT_ROOT"; exit 2; }
cd "$PROJECT_ROOT" || exit 2

if [ -n "${PO_MINT_ACTUATOR_VERIFY_INCLUDE_OVERRIDE:-}" ]; then
  # shellcheck disable=SC2206
  TARGET_FILES=($PO_MINT_ACTUATOR_VERIFY_INCLUDE_OVERRIDE)
else
  # shellcheck disable=SC2206
  TARGET_FILES=(docs/agents/po/flow/*.md)
fi

TRIGGER_ERE='(^|[^A-Za-z])(Append|Add|Create|Write|Update|Open|Commit|Mint)([^A-Za-z]|$)'
TARGET_ERE='docs/data/orch/orch-state\.json|\.task_board\.[A-Za-z_]+\[\]|\.sprint_goal\.entries\[\]'
MUTATE_TARGET_ERE='\.task_board|\.sprint_goal'
MUTATE_OP_ERE='\+=|\|='

TOTAL_FAIL=0
CHECKED_FILES=0

# check1_blocks FILE — per fenced-code-block actuator check.
check1_blocks() {
  local f="$1" fail=0
  local in_fence=0 block_start=0 block_has_mut=0 block_has_apply=0 ln=0

  while IFS= read -r line; do
    ln=$((ln + 1))
    if [[ "$line" =~ ^'```' ]]; then
      if [ "$in_fence" -eq 0 ]; then
        in_fence=1
        block_start=$ln
        block_has_mut=0
        block_has_apply=0
      else
        in_fence=0
        if [ "$block_has_mut" -eq 1 ] && [ "$block_has_apply" -eq 0 ]; then
          echo "  [po-mint-orchapply-actuator-verify] CHECK1 $f:${block_start} — code block mutates .task_board/.sprint_goal but never pipes through orch-apply.sh (block ends line $ln)"
          fail=1
        fi
      fi
      continue
    fi
    if [ "$in_fence" -eq 1 ]; then
      if [[ "$line" == *orch-apply.sh* ]]; then
        block_has_apply=1
      fi
      if [[ "$line" =~ $MUTATE_TARGET_ERE ]] && [[ "$line" =~ $MUTATE_OP_ERE ]]; then
        block_has_mut=1
      fi
    fi
  done < "$f"

  return $fail
}

# check2_sections FILE — per markdown-section actuator check.
check2_sections() {
  local f="$1" fail=0
  local -a heading_lines=()
  local ln=0 total=0

  while IFS= read -r line; do
    ln=$((ln + 1))
    if [[ "$line" =~ ^#+[[:space:]] ]]; then
      heading_lines+=("$ln")
    fi
  done < "$f"
  total=$ln

  local in_fence=0
  ln=0
  while IFS= read -r line; do
    ln=$((ln + 1))
    if [[ "$line" =~ ^'```' ]]; then
      in_fence=$((1 - in_fence))
      continue
    fi
    [ "$in_fence" -eq 1 ] && continue

    if [[ "$line" =~ $TRIGGER_ERE ]] && [[ "$line" =~ $TARGET_ERE ]]; then
      # Same-line escape: the anchor line itself already carries the pipe
      # (scripts-registry.md idiom + main.md's own "Reusable triage scripts"
      # rule paragraph — both state+satisfy the rule in one line).
      if [[ "$line" == *orch-apply.sh* ]]; then
        continue
      fi

      # Compute enclosing section [start, end) — nearest heading <= ln, up to
      # the next heading of ANY level (or EOF).
      local start=1 end=$((total + 1)) h
      for h in "${heading_lines[@]}"; do
        if [ "$h" -le "$ln" ]; then
          start=$h
        fi
      done
      for h in "${heading_lines[@]}"; do
        if [ "$h" -gt "$start" ]; then
          end=$h
          break
        fi
      done

      if ! sed -n "${start},$((end - 1))p" "$f" | grep -q 'orch-apply.sh'; then
        echo "  [po-mint-orchapply-actuator-verify] CHECK2 $f:${ln} — board-mutation instruction (\"$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | cut -c1-100)\") — enclosing section (lines ${start}-$((end - 1))) has NO orch-apply.sh pipe anywhere"
        fail=1
      fi
    fi
  done < "$f"

  return $fail
}

for f in "${TARGET_FILES[@]}"; do
  [ -f "$f" ] || { echo "[po-mint-orchapply-actuator-verify] WARN $f not found, skipping" >&2; continue; }
  CHECKED_FILES=$((CHECKED_FILES + 1))

  r1=0; r2=0
  check1_blocks "$f"; r1=$?
  check2_sections "$f"; r2=$?
  if [ "$r1" -ne 0 ] || [ "$r2" -ne 0 ]; then
    TOTAL_FAIL=1
  fi
done

echo ""
if [ "$TOTAL_FAIL" -eq 0 ]; then
  echo "PASS: po-mint-orchapply-actuator-verify — 0 unpiped board-mutation instructions across ${CHECKED_FILES} files"
  exit 0
else
  echo "FAIL: po-mint-orchapply-actuator-verify — see CHECK1/CHECK2 lines above"
  exit 1
fi
