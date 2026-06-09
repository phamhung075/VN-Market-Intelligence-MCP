#!/usr/bin/env bash
# ci-native-gate-watch.sh — CI-RED-RECONCILE gate watcher (router-owned).
#
# Polls a GitHub Actions "CI" run until its `bun test` job finishes, then prints
# the AUTHORITATIVE bun NATIVE summary (the only absolute we gate on):
#     NNN pass / NNN skip / NNN fail   (+ "Ran N tests across M files")
# bun OMITS the fail/error lines when they are 0 — absence => 0, handled here.
#
# Optionally tallies per-victim (fail) counts for EXACT task-id prefixes so a
# gate decision is jitter-robust (the +/-3 ESM-cache nondeterminism band cannot
# resolve a small delta; a named fail->pass flip can). ALWAYS pass the exact
# prefix (e.g. "Task 1423a"), NEVER the numeric stem ("Task 1423") — sibling
# clusters (1423b/1423e) contaminate the tally. (Lesson: C5 gate 2026-06-09.)
#
# Usage:
#   scripts/ci-native-gate-watch.sh <run_id> [victim_prefix ...]
#   scripts/ci-native-gate-watch.sh --sha <sha7> [victim_prefix ...]
#
# Pointer: docs/policies/dev-standards.md § Script Persistence (CI gate watcher).
set -uo pipefail

POLL=25            # seconds between polls
MAX_WAIT=900       # hard cap (15 min) — bun test is ~305s, full run ~6-8 min

run_id=""
if [[ "${1:-}" == "--sha" ]]; then
  sha="$2"; shift 2
  for _ in $(seq 1 12); do
    run_id=$(gh run list --branch main --limit 8 --json databaseId,headSha,workflowName \
      --jq ".[] | select(.headSha|startswith(\"$sha\")) | select(.workflowName==\"CI\") | .databaseId" | head -1)
    [[ -n "$run_id" ]] && break
    sleep 5
  done
  [[ -z "$run_id" ]] && { echo "ERROR: no CI run found for sha $sha"; exit 2; }
else
  run_id="$1"; shift
fi
victims=("$@")

echo "WATCH run=$run_id  victims=[${victims[*]:-none}]"

# 1) poll until the run completes
waited=0
while :; do
  st=$(gh run view "$run_id" --json status,conclusion --jq '.status' 2>/dev/null)
  [[ "$st" == "completed" ]] && break
  (( waited >= MAX_WAIT )) && { echo "ERROR: run $run_id still $st after ${MAX_WAIT}s"; exit 3; }
  sleep "$POLL"; waited=$((waited+POLL))
done

# 2) locate the bun test job
job_id=$(gh run view "$run_id" --json jobs \
  --jq '.jobs[] | select(.name|test("bun|test";"i")) | .databaseId' | head -1)
[[ -z "$job_id" ]] && job_id=$(gh run view "$run_id" --json jobs --jq '.jobs[0].databaseId')
echo "bun_job=$job_id"

log=$(mktemp)
gh run view --job="$job_id" --log > "$log" 2>/dev/null

# 3) native summary (trailing-space anchored; errors line omitted => 0)
echo "--- native summary ---"
grep -E " (pass|fail|skip|error)$" "$log" | tail -6
ran=$(grep -oE "Ran [0-9]+ tests across [0-9]+ files" "$log" | tail -1)
nfail=$(grep -oE " [0-9]+ fail$" "$log" | tail -1 | grep -oE "[0-9]+"); nfail=${nfail:-0}
nerr=$(grep -oE " [0-9]+ error$" "$log" | tail -1 | grep -oE "[0-9]+"); nerr=${nerr:-0}
echo "native_fail=$nfail native_errors=$nerr fail_plus_error=$((nfail+nerr))  | $ran"

# 4) per-victim exact-prefix (fail) tally
if (( ${#victims[@]} )); then
  echo "--- per-victim (fail) tally — each must be 0 to confirm flip ---"
  for v in "${victims[@]}"; do
    c=$(grep -F "(fail)" "$log" | grep -cF "$v")
    echo "$v : (fail)=$c"
  done
fi
rm -f "$log"
