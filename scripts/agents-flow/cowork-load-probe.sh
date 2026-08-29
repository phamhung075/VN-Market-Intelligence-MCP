#!/usr/bin/env bash
# scripts/agents-flow/cowork-load-probe.sh
#
# ONE comma-safe, locale-safe 1-minute load-average probe for the cowork fan-out
# gate (spawn-fanout.md Step 5.1 / Step 5.2 re-probe), replacing the inline
# `uptime | awk -F',' ...` expression (FIX-COWORK-FANOUT-LOAD1MIN-COMMA-LOCALE-PARSE,
# cowork-fire 30d983ac).
#
# WHY THIS EXISTS: on a comma-locale host `uptime` prints the load with a COMMA
# decimal separator ("load averages: 2,19 2,05 1,98"). The old inline parse split
# on ',' — so it truncated the first token to its integer part ("2,19" -> "2",
# measured on this host: "4,22" -> "4"), and any per-tick improvisation using
# `tr -d ','` produced concatenation garbage ("2,19" -> "219"), which the Step 5.1
# comparison `LOAD_1MIN > load_per_core_factor * CORES` then read as a huge load,
# silently inverting NORMAL -> DEGRADED (max_parallel 4 -> 2). This script instead
# extracts the FIRST numeric token after "load average(s):" and normalizes only a
# DECIMAL comma to a dot — so "2,19" -> "2.19", "4,22" -> "4.22", never "219".
# Deliberately does NOT pin LC_ALL=C: pinning the locale while keeping any
# comma-splitting parse produces the concatenation-garbage failure mode (po-triage
# 2026-08-25 occurrence-6 remedy note).
#
# FIDELITY CONTRACT:
#   - Emits ONE line: the dot-decimal 1-minute load, e.g. "4.22" / "2.19" / "0.00".
#   - Exit 0 on success. Fail-loud otherwise: exit 2 = `uptime` itself failed,
#     exit 3 = output unparseable — with a diagnostic on stderr and NOTHING on
#     stdout, so the caller can distinguish "unknown load" from a real number and
#     degrade safely (spawn-fanout.md Step 5.1 fail-safe posture, NFR-P1-3).
#   - Locale- and platform-neutral: handles macOS "load averages: 4,22 4,75 5,27"
#     and Linux "load average: 2,19, 2,05, 1,98" in BOTH dot and comma locales.
#
# USAGE:  bash scripts/agents-flow/cowork-load-probe.sh [<uptime-line-fixture>]
#         (optional $1 = exact uptime output line — TEST SEAM ONLY; production
#          call sites run it bare so it probes the real host)
# TEST:   bash scripts/agents-flow/cowork-load-probe.test.sh
# OWNING: docs/agents/cowork-team/flow/spawn-fanout.md (Step 5.1 / Step 5.2 re-probe)

set -uo pipefail

if [ "$#" -ge 1 ]; then
  UPTIME_OUT="$1"
else
  UPTIME_OUT="$(uptime)" || {
    rc=$?
    echo "[cowork-load-probe] ERROR: 'uptime' failed (rc=$rc)" >&2
    exit 2
  }
fi

# Extract the first numeric token after "load average:" / "load averages:"
# (NF==2 guard: the separator must actually be present once). Then normalize a
# DECIMAL comma to a dot, drop any residual junk, and strip one trailing dot
# left over from the Linux comma-separated list ("2,19," -> "2.19." -> "2.19").
LOAD1="$(printf '%s\n' "$UPTIME_OUT" \
  | awk -F'load averages?:' 'NF==2 {print $2}' \
  | awk '{v=$1; gsub(",", ".", v); gsub(/[^0-9.]/, "", v); sub(/\.$/, "", v); print v}')"

# Shape gate: non-empty integer or one-dot decimal ("4", "4.22", "0.00").
# A concatenated digit run ("219") or any other malformed token is rejected here.
if ! printf '%s' "$LOAD1" | grep -Eq '^[0-9]+(\.[0-9]+)?$'; then
  echo "[cowork-load-probe] ERROR: unparseable 1-min load ('${LOAD1:-<empty>}') from uptime line: $UPTIME_OUT" >&2
  exit 3
fi

printf '%s\n' "$LOAD1"
