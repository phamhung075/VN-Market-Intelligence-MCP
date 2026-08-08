#!/usr/bin/env bash
# scripts/lib/output-contract-invariant.sh
#
# FIX-ANALYSIS-ONLY-EXIT-DETECTOR-OR-VERDICT-BLIND-TO-PARTIAL-WRITE-CYCLE
#
# SHARED "[OUTPUT-CONTRACT] ..." line extraction + AC-2 structural arithmetic
# invariant, sourced by BOTH scripts/audits/detect-analysis-only-exit.sh
# (post-hoc detector, Plane-3 reconciliation, AC-1) and
# scripts/auditor-notebook-commit.sh (pre-commit refusal backstop, AC-4) so
# the extraction regex and the invariant arithmetic live in exactly ONE
# place. A second hand-copied regex in a second script drifting from the
# first is exactly the shape of defect this fix exists to close — see
# scripts/agents-flow/lib/notebook-section-direction.sh for the identical
# precedent/rationale on this repo's own "one algorithm, one file" rule.
#
# BACKGROUND — why this invariant is sound (full proof: this task's board
# row `mechanism_proof_output_contract_line_is_unreachable_by_the_script`,
# and scripts/audit-output-contract.sh:156-200 + :250 directly):
#   `scripts/audit-output-contract.sh` parses one marker line per case arm.
#   EVERY arm that increments `signal_queue_rows_written` also increments
#   `signals_posted` in the SAME arm (OK, OK-escalation-bypass, OK e3-only,
#   OK no-telegram, SKIP-dedup). EVERY arm that increments `dedup_skipped`
#   (only SKIP-dedup) likewise increments `signals_posted` in that same arm.
#   The ONLY post-parse mutation (V1's take-the-max, L249-251) writes back
#   ONLY to `signal_queue_rows_written`, never lowers/raises `signals_posted`.
#   Therefore, for ANY input that script can ever produce:
#     signals_posted >= signal_queue_rows_written
#     signals_posted >= dedup_skipped
#   A published `[OUTPUT-CONTRACT]` line violating either inequality is
#   PROVABLY not that script's own stdout — i.e. hand-composed, in direct
#   violation of docs/agents/system-auditor/flow/main.md:43 and :1153.
#   Confirmed live: system-auditor c80 (2026-08-08T01:08:04Z) published
#   `signals_posted=0 | signal_queue_rows_written=1 | dedup_skipped=1`
#   — 0 >= 1 is false on both counts.
#
# Functions exported (source this file, then call directly):
#
#   oc_extract_all_added_contract_lines_from_text
#     Reads unified diff text (e.g. `git log -p` or `git diff --cached`
#     output) on STDIN. Echoes EVERY line matching the diff-ADDED form
#     `+[OUTPUT-CONTRACT] ...` with the leading `+` marker stripped, one per
#     output line, in the diff's own top-to-bottom order (0 lines if none).
#     Deliberately anchored on the diff-add prefix (`^\+\[OUTPUT-CONTRACT\]`,
#     a single `+`) so it can never false-match a `+++ b/path` file header
#     (which starts `++`) or an unchanged context line (single leading
#     space).
#     Deliberately returns EVERY match, not "the newest" one: a single git
#     commit can legitimately bundle more than one cycle's own notebook
#     section — confirmed live, commit 569f79108a93 (system-auditor c80,
#     2026-08-08) carries BOTH c79's (2026-08-07T06:12:14Z, never separately
#     committed — its write sat uncommitted in the working tree until c80's
#     cycle folded it into the SAME commit alongside c80's own new section)
#     AND c80's own `[OUTPUT-CONTRACT]` line in one diff. Which physical
#     position ("first added" vs "last added") corresponds to "the newest
#     cycle's own claim" depends on the notebook's own newest_first/
#     oldest_first convention, which is NOT fleet-uniform across notebooks
#     and this agent-agnostic detector has no reliable way to know. Checking
#     EVERY line found sidesteps that assumption entirely: a fabricated
#     claim anywhere in the window is real evidence of this defect,
#     regardless of which physical position it landed in.
#
#   oc_parse_counter <line> <key>
#     Echoes the integer value of `key=N` inside an `[OUTPUT-CONTRACT]`
#     line, or "0" when the key is absent entirely (older/shorter
#     contract-line schema — e.g. cycles predating the `dedup_skipped`
#     field, still live in the notebook corpus, see c79 2026-08-07T06:12:14Z).
#
#   oc_check_arithmetic_invariant <signals_posted> <signal_queue_rows_written> <dedup_skipped>
#     Returns 0 (sound — consistent with every reachable output of
#     scripts/audit-output-contract.sh) or 1 (violation — provably
#     hand-composed, AC-2's zero-false-positive gate). Takes bare integers,
#     never touches a file or a persistence plane — this is the "needs no
#     plane lookup at all" gate AC-2 asks for.
#
# Shell: bash 3.2+ (macOS system /bin/bash) — NO mapfile, NO associative
# arrays. Only plain scalar variables / case / grep / cut.

# oc_extract_all_added_contract_lines_from_text — see header.
oc_extract_all_added_contract_lines_from_text() {
  grep '^\+\[OUTPUT-CONTRACT\]' | sed 's/^+//'
}

# oc_parse_counter <line> <key> — see header.
oc_parse_counter() {
  local line="$1" key="$2" val
  val=$(printf '%s' "$line" | grep -o "${key}=[0-9]\+" | head -1 | cut -d= -f2)
  printf '%s' "${val:-0}"
}

# oc_check_arithmetic_invariant <signals_posted> <signal_queue_rows_written> <dedup_skipped>
# — see header. rc 0 = sound, rc 1 = violation.
oc_check_arithmetic_invariant() {
  local sp="${1:-0}" sqr="${2:-0}" ds="${3:-0}"
  if [ "$sp" -lt "$sqr" ] 2>/dev/null; then return 1; fi
  if [ "$sp" -lt "$ds" ] 2>/dev/null; then return 1; fi
  return 0
}
