#!/usr/bin/env bash
# scripts/agents-flow/lib/notebook-section-direction.sh
#
# SHARED "## " section timestamp-key + newest-first/oldest-first direction
# derivation. This is the SAME algorithm scripts/agents-flow/notebook-auto-prune.sh
# has used since FIX-NOTEBOOK-AUTOPRUNE-SAMEDAY-TIE-DROPS-NEWEST /
# FIX-NOTEBOOK-AUTOPRUNE-DIRECTION-UNRESOLVABLE-ZERO-TS-NOTEBOOKS, extracted here
# (FIX-NOTEBOOK-COMPOSE-SCRIPT-ACTUATOR, 2026-08-06) so scripts/notebook-compose.sh
# can call the IDENTICAL logic instead of authoring a second, divergent copy — the
# task's own board row (AC-2) explicitly forbids reimplementing this. notebook-
# auto-prune.sh was refactored in the SAME commit to source this file and call
# these functions instead of its own inline block (see that script's tie-break
# call site) — there is now exactly ONE implementation of this algorithm, not two.
# Zero behavior change verified via scripts/agents-flow/notebook-auto-prune.test.sh
# (still 8/8 after the refactor — see that test file's own run instructions).
#
# Functions exported (source this file, then call directly — no subshell needed):
#
#   nso_ts_key <heading-text>
#     Normalizes an ISO8601/compact/date-only timestamp found anywhere in a
#     single "## " heading line into a fixed-width 17-char all-digit sort key
#     (YYYYMMDDHHMMSSfff, zero-padded/truncated so formats with different
#     precision still compare correctly as plain numeric strings). No
#     parseable timestamp -> prints $NSO_SENTINEL_KEY (sorts last/max, by
#     design — untimestamped rolling headings, e.g. "## Known patterns", must
#     never look "oldest").
#
#   nso_sections_with_ts
#     Reads full file/section content on STDIN, greps "^## " heading lines
#     (with their 1-based line numbers, relative to whatever content it was
#     given), and prints "<line_num>:<ts_key>:<heading text>" per match, in
#     physical top-to-bottom order. One line of output per "## " heading.
#
#   nso_vote_direction
#     Reads nso_sections_with_ts's OWN output shape on STDIN (ALL sections in
#     a file/body, not just a tied subset — the caller decides what subset to
#     feed it) and walks physical top-to-bottom order, casting a
#     "decreasing-key" vs "increasing-key" vote on every ADJACENT pair whose
#     keys differ AND where NEITHER side is the sentinel (a sentinel-vs-real
#     comparison is a phantom vote, not evidence of prepend/append
#     convention — FIX-NOTEBOOK-AUTOPRUNE-DIRECTION-UNRESOLVABLE-ZERO-TS-
#     NOTEBOOKS tertiary hardening). Prints "newest_first" (dec_votes >
#     inc_votes), "oldest_first" (inc_votes > dec_votes), or an empty line
#     (tie / zero signal — caller must fall back to an override table then a
#     documented default).
#
#   nso_resolve_direction <sections-with-ts-blob> <rel-filename> <order-file>
#     Convenience wrapper: nso_vote_direction first (fed <sections-with-ts-
#     blob> literally, not via stdin — pass the captured nso_sections_with_ts
#     output as a single quoted argument); on empty, consults <order-file>'s
#     .overrides[<rel-filename>] (same schema as
#     docs/data/notebook-section-order.json); on empty/missing/unreadable,
#     defaults to "newest_first" (FIX-NOTEBOOK-AUTOPRUNE-DIRECTION-
#     UNRESOLVABLE-ZERO-TS-NOTEBOOKS — never refuses to resolve; a file with
#     zero distinguishing signal anywhere is a permanent condition, not a
#     transient one, so "refuse forever" is strictly worse than a documented,
#     deterministic default). Prints "<direction> <source>" on ONE stdout
#     line, source in {derived, override, default} — the caller decides
#     whether "override"/"default" is worth an informational, non-blocking
#     signal of its own; this library never emits signals itself (payload
#     shape and destination are caller-specific — notebook-auto-prune.sh's
#     docs/signals/ write stays in that script; scripts/notebook-compose.sh
#     prints its own WARN marker line instead — see that script's header).
#
# Shell: bash 3.2+ (macOS system /bin/bash) — NO mapfile, NO associative
# arrays, NO `local -r`. Only plain indexed arrays + `while read` loops (same
# constraint as every other agents-flow script this repo ships).

NSO_SENTINEL_KEY="99999999999999999"

nso_ts_key() {
  local heading="$1" ts_raw ts_digits ts_key
  ts_raw=$(echo "$heading" | grep -oE '[0-9]{4}-?[0-9]{2}-?[0-9]{2}(T[0-9]{2}:?[0-9]{2}(:?[0-9]{2}(\.[0-9]+)?)?Z)?' | tail -1)
  if [ -n "$ts_raw" ]; then
    ts_digits=$(echo "$ts_raw" | tr -dc '0-9')
    ts_key=$(printf '%-17s' "$ts_digits" | tr ' ' '0' | cut -c1-17)
    echo "$ts_key"
  else
    echo "$NSO_SENTINEL_KEY"
  fi
}

nso_sections_with_ts() {
  grep -n "^## " | while IFS=: read -r line_num heading; do
    local key
    key="$(nso_ts_key "$heading")"
    echo "$line_num:$key:$heading"
  done
}

nso_vote_direction() {
  local prev_key="" cur_key dec_votes=0 inc_votes=0 _sec_line _sec_heading direction=""
  while IFS=: read -r _sec_line cur_key _sec_heading; do
    if [ -n "$prev_key" ] && [ "$prev_key" != "$cur_key" ] \
       && [ "$prev_key" != "$NSO_SENTINEL_KEY" ] && [ "$cur_key" != "$NSO_SENTINEL_KEY" ]; then
      if [ "$prev_key" -gt "$cur_key" ]; then
        dec_votes=$((dec_votes + 1))
      else
        inc_votes=$((inc_votes + 1))
      fi
    fi
    prev_key="$cur_key"
  done
  if [ "$dec_votes" -gt "$inc_votes" ]; then
    direction="newest_first"
  elif [ "$inc_votes" -gt "$dec_votes" ]; then
    direction="oldest_first"
  fi
  echo "$direction"
}

nso_resolve_direction() {
  local sections_with_ts="$1" rel_filename="$2" order_file="$3" direction=""
  direction="$(printf '%s\n' "$sections_with_ts" | nso_vote_direction)"
  if [ -n "$direction" ]; then
    echo "$direction derived"
    return 0
  fi
  if [ -n "$order_file" ] && [ -f "$order_file" ]; then
    direction="$(jq -r --arg f "$rel_filename" '.overrides[$f] // empty' "$order_file" 2>/dev/null || true)"
  fi
  if [ "$direction" = "newest_first" ] || [ "$direction" = "oldest_first" ]; then
    echo "$direction override"
    return 0
  fi
  echo "newest_first default"
}
