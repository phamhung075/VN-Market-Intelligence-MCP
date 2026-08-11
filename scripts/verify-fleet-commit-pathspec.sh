#!/usr/bin/env bash
# scripts/verify-fleet-commit-pathspec.sh
#
# FIX-COMMITCONVENTION-MANDATES-BARE-COMMIT-CONTRADICTS-LIVE-SWEEPGUARD-HARDBLOCK — AC-3
# persisted fleet-wide regression proof (opt-IN allowlist, per memory
# feedback_fleetwide_gate_validated_on_one_file_optout_allowlist: never validate a
# fleet-wide claim on one file with a directory/glob OPT-OUT list — scan the WHOLE
# corpus and require every exclusion to be an explicit, justified, opt-IN entry below).
#
# Asserts: no live instructional site in docs/agents/, docs/policies/, docs/protocols/,
# .claude/skills/ tells an agent to run `git commit -m` with NEITHER a trailing
# `-- <paths>` pathspec on the same physical invocation NOR a line-continuation /
# heredoc-close that resolves to one within a bounded lookahead window. A bare
# `git commit -m "..."` (index-only, no pathspec) is hard-rejected by the live
# scripts/git-hooks/pre-commit sweep guard once a session's pooled bare-commit warn
# count passes threshold=3 (docs/policies/commit-convention.md is the canonical spec).
#
# NOTE: uses only bash 3.2-compatible constructs (no `declare -A`) — this repo's
# default `/bin/bash` on the dev host is 3.2.57, no associative-array support.
#
# Usage: bash scripts/verify-fleet-commit-pathspec.sh
# Exit 0 = clean (prints PASS + count). Exit 1 = >=1 unresolved bare-commit site found.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

CORPUS=(docs/agents docs/policies docs/protocols .claude/skills)
LOOKAHEAD=10

# Opt-IN allowlist: exact file:line pairs confirmed NOT to be live bare-commit
# instructions (prose describing/warning about the rejected bare form, or a
# labelled illustrative FORBIDDEN block) — each entry carries a one-line
# justification. This is a deliberate, reviewed, per-site list — NEVER a
# directory/glob opt-out. (plain array of "key|justification" — bash-3.2 safe)
ALLOWLIST=(
  "docs/agents/developer/flow/main.md:104|prose warning that the bare form is rejected, not an instruction to run it"
  "docs/agents/dev-frontend/flow/main.md:101|prose warning that the bare form is rejected, not an instruction to run it"
  "docs/protocols/docker-deployment-runbook.md:153|prose warning that the bare form is rejected (added alongside the AC-3 fix)"
  "docs/policies/dev-standards.md:805|prose citing the mandated pattern inline inside a NON-GOAL note, not itself a runnable instruction line"
  "docs/policies/dev-standards.md:1465|prose lead-in sentence ('Shell mechanism — always use...') describing the requirement; the actual instruction is the fenced code block 2 lines below, which carries the real trailing pathspec"
  "docs/protocols/head-lock-self-cure.md:144|prose: 'Usage: replace ... with ...' substitution guidance, not a runnable instruction"
  ".claude/skills/commit-boundary/SKILL.md:71|labelled # FORBIDDEN illustrative block, correctly excluded per feedback_fleetwide_gate_validated_on_one_file_optout_allowlist"
)

is_allowlisted() {
  local key="$1" entry entry_key
  for entry in "${ALLOWLIST[@]}"; do
    entry_key="${entry%%|*}"
    if [[ "$entry_key" == "$key" ]]; then
      return 0
    fi
  done
  return 1
}

fail=0
hits=0
while IFS=: read -r file line _rest; do
  key="$file:$line"
  hits=$((hits + 1))
  if is_allowlisted "$key"; then
    continue
  fi
  match_line="$(sed -n "${line}p" "$file")"
  # inline pathspec on the match line itself
  if [[ "$match_line" == *" -- "* ]]; then
    continue
  fi
  # bounded lookahead for a resolving pathspec (line-continuation or heredoc close)
  end=$((line + LOOKAHEAD))
  window="$(sed -n "${line},${end}p" "$file")"
  if echo "$window" | grep -q -- ' -- '; then
    continue
  fi
  echo "FAIL: $key — bare 'git commit -m' with no trailing pathspec resolved within ${LOOKAHEAD} lines"
  echo "  > $match_line"
  fail=1
done < <(grep -rn 'git commit -m' "${CORPUS[@]}")

if [[ "$fail" -eq 0 ]]; then
  echo "PASS: AC-3 fleet-wide commit-pathspec regression proof clean — ${hits} sites scanned, ${#ALLOWLIST[@]} allowlisted, corpus: ${CORPUS[*]}"
  exit 0
else
  echo "AC-3 FAILED — see FAIL lines above."
  exit 1
fi
