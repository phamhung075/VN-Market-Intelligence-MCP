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
# ── FIX-AUDITOR-NOTEBOOK-COMMIT-PLANE-CROSSCHECK-GATE (2026-08-14) additions ──
# scripts/auditor-notebook-commit.sh §2b (see that script's header). The §2a
# backstop above (and the AC-1/AC-2 detector in scripts/audits/detect-
# analysis-only-exit.sh) both key off a literal `[OUTPUT-CONTRACT]` line the
# current flow doc never actually writes INTO the notebook (only into the
# RETURN block, computed AFTER the notebook commit per the 2026-08-06
# reorder — full mechanism proof: docs/architecture-briefs/2026-08-14-
# auditor-write-plane-divergence-root-cause.md §4) — making that backstop
# structurally unreachable every cycle since. The three functions below read
# a DIFFERENT pair of already-mandatory, reachable-by-construction facts
# instead: the notebook template's own "Anomalies: N new" line (flow/
# main.md:1129, present in every committed cycle section) and the real
# `[emit-signal] OK...` line count in $MARKERS_FILE (mechanically populated
# by emit-audit-signal.sh's own call site, not a separate narratable step).
# Same "one algorithm, one file" precedent as the rest of this file.
#
#   oc_extract_declared_anomaly_count_from_diff
#     Reads unified diff text (e.g. `git diff --cached -- <notebook path>`)
#     on STDIN. Echoes the integer N from the FIRST diff-ADDED line matching
#     `^\+.*Anomalies: [0-9]+ new` (the notebook template's own mandatory
#     line, flow/main.md:1129), or "0" if no such added line exists. Anchored
#     on the diff-add prefix so an unchanged context line or a removed line
#     can never contribute — only what THIS commit is actually adding counts
#     as "declared" for the plane cross-check.
#
#   oc_count_real_emit_signals <markers_file>
#     Echoes the count of lines in <markers_file> matching
#     `^\[emit-signal\] (OK|OK-escalation-bypass|SKIP-dedup|OK e3-only|OK
#     no-telegram) ` — the exact same marker-line alternation the Notebook
#     Append Gate (flow/main.md:1079) and scripts/audit-output-contract.sh
#     already use for "was anything real emitted this cycle", not a new
#     pattern. Prints "0" (never errors) when the file is missing/empty —
#     that is a legitimate "nothing emitted yet" state, not a fault.
#
#   oc_check_emit_vs_claim_plane <declared_n> <real_signals_n>
#     Returns 0 (sound — either no new-anomaly claim was made, or at least
#     one real emit-signal backs it) or 1 (violation — declared_n > 0 AND
#     real_signals_n == 0: a nonzero "Anomalies: N new" claim landing with
#     ZERO corroborating emit-signal evidence, the exact shape proven live
#     across all 10 catalogued occurrences, brief §6). The `declared_n > 0`
#     guard means a genuine ALL_GREEN cycle (declared_n == 0) never engages
#     this check — same threshold semantics as the Notebook Append Gate's
#     own condition (a), flow/main.md:1078/1081.
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

# oc_extract_declared_anomaly_count_from_diff — see header (FIX-AUDITOR-
# NOTEBOOK-COMMIT-PLANE-CROSSCHECK-GATE section).
oc_extract_declared_anomaly_count_from_diff() {
  local n
  n=$(grep -E '^\+.*Anomalies: [0-9]+ new' | grep -oE 'Anomalies: [0-9]+' | head -1 | grep -oE '[0-9]+')
  printf '%s' "${n:-0}"
}

# oc_count_real_emit_signals <markers_file> — see header.
oc_count_real_emit_signals() {
  local markers_file="${1:-}" n
  if [ -z "$markers_file" ] || [ ! -f "$markers_file" ]; then
    printf '0'
    return 0
  fi
  n=$(grep -cE '^\[emit-signal\] (OK|OK-escalation-bypass|SKIP-dedup|OK e3-only|OK no-telegram) ' "$markers_file" 2>/dev/null)
  printf '%s' "${n:-0}"
}

# oc_check_emit_vs_claim_plane <declared_n> <real_signals_n> — see header.
# rc 0 = sound, rc 1 = violation (declared>0 AND real_signals==0).
oc_check_emit_vs_claim_plane() {
  local declared_n="${1:-0}" real_n="${2:-0}"
  if [ "$declared_n" -gt 0 ] 2>/dev/null && [ "$real_n" -eq 0 ] 2>/dev/null; then
    return 1
  fi
  return 0
}
