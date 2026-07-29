#!/usr/bin/env bash
# scripts/git-hooks/pre-commit-auditor-heartbeat.test.sh
#
# Permanent regression suite for the auditor-heartbeat shape/sole-writer guard
# added to scripts/git-hooks/pre-commit (task FIX-AUDITOR-HEARTBEAT-OUT-OF-
# CONTRACT-AGENT-WRITE-TIER1). Separate file from pre-commit.test.sh (T1-T6,
# the pre-existing commit-path peer-index sweep guard) to keep the two
# unrelated concerns independently reviewable/replayable — same "REAL hook
# symlinked into a scratch repo" isolation pattern as that suite.
#
# Sole-writer + shape invariant under test (full spec:
# docs/policies/dev-standards.md CANONICAL:SSOT-AUDITOR-HEARTBEAT-SOLE-WRITER):
#   docs/data/auditor-tier1-last-healthy.json  MUST carry {last_healthy_at,
#     checks:{docker_ps,health_3000,health_3001,disk,mem_creep,launchd_agents}}
#     with ALL 6 checks == "PASS" — anything else (missing checks, wrong key
#     set, a non-PASS value) is REJECTED unconditionally (not just warned).
#   docs/data/auditor-tier{2,3}-last-healthy.json MUST stay bare
#     {last_healthy_at} — a "checks" key here means the tier-1 shape bled
#     into a tier-2/3 "audit completed" (not "healthy") marker. REJECTED.
#   This guard runs BEFORE the pre-existing sweep-guard mode dispatch and is
#   NEVER controlled by GIT_SWEEP_GUARD_MODE — always-reject, both directions.
#
# Coverage:
#   T1  tier-1 bare {last_healthy_at} only (the exact regression this task
#       fixes — main.md's out-of-contract Tier-2/3-shaped write landing on
#       the tier-1 filename) -> commit BLOCKED, loud stderr, HEAD unchanged.
#   T2  tier-1 full correct shape (all 6 checks PASS) -> commit ALLOWED.
#   T3  tier-1 shape present but one check != "PASS" (e.g. "FAIL") -> BLOCKED
#       (never claim green from a non-PASS entry).
#   T4  tier-2 file carrying a "checks" key (tier-1 shape/semantic bleed) ->
#       commit BLOCKED.
#   T5  tier-2 file with the correct bare shape -> commit ALLOWED (baseline,
#       proves the guard does not false-positive on the legitimate tier-2/3
#       writer's own normal output).
#   T6  commit that does not touch any of the 3 heartbeat files at all ->
#       guard is a complete no-op (no stderr, no exit-code effect) —
#       regression guard against the new check leaking into unrelated commits.
#
# Run:
#   bash scripts/git-hooks/pre-commit-auditor-heartbeat.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: FIX-AUDITOR-HEARTBEAT-OUT-OF-CONTRACT-AGENT-WRITE-TIER1
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SRC="$SCRIPT_DIR/pre-commit"

if [ ! -f "$HOOK_SRC" ]; then
  echo "ERROR: pre-commit hook not found at $HOOK_SRC" >&2
  exit 1
fi

PASS=0
FAIL=0

new_repo() {
  local dir
  dir="$(mktemp -d "${TMPDIR:-/tmp}/auditor-hb-guard-test.XXXXXX")"
  (
    cd "$dir" || exit 1
    git init -q .
    git config user.email test@local
    git config user.name test
    mkdir -p .git/hooks docs/data
    ln -sf "$HOOK_SRC" .git/hooks/pre-commit
    echo base > seed.txt
    git add seed.txt
    git commit -qm seed -- seed.txt
  )
  printf '%s' "$dir"
}

GOOD_TIER1='{
  "last_healthy_at": "2026-07-29T07:27:02Z",
  "checks": {
    "docker_ps": "PASS",
    "health_3000": "PASS",
    "health_3001": "PASS",
    "disk": "PASS",
    "mem_creep": "PASS",
    "launchd_agents": "PASS"
  }
}'

BARE_TIER1='{
  "last_healthy_at": "2026-07-29T06:11:29Z"
}'

BAD_CHECK_TIER1='{
  "last_healthy_at": "2026-07-29T07:27:02Z",
  "checks": {
    "docker_ps": "PASS",
    "health_3000": "PASS",
    "health_3001": "PASS",
    "disk": "PASS",
    "mem_creep": "FAIL",
    "launchd_agents": "PASS"
  }
}'

TIER2_WITH_CHECKS='{
  "last_healthy_at": "2026-07-29T06:39:36Z",
  "checks": {
    "docker_ps": "PASS"
  }
}'

GOOD_TIER2='{
  "last_healthy_at": "2026-07-29T06:39:36Z"
}'

# ── T1: bare tier-1 shape (the exact live regression) -> BLOCKED ───────────────
D1="$(new_repo)"
commit1_exit=0
(
  cd "$D1" || exit 1
  printf '%s' "$BARE_TIER1" > docs/data/auditor-tier1-last-healthy.json
  git add docs/data/auditor-tier1-last-healthy.json
  git commit -qm "bad tier1 write" -- docs/data/auditor-tier1-last-healthy.json 2>stderr.log
) || commit1_exit=$?
head1="$(cd "$D1" && git log --oneline | wc -l | tr -d ' ')"
stderr1="$(cat "$D1/stderr.log" 2>/dev/null)"
if [[ "$commit1_exit" -ne 0 && "$head1" == "1" && "$stderr1" == *"heartbeat-guard"* && "$stderr1" == *"REJECT"* ]]; then
  echo "PASS T1: bare tier-1 shape BLOCKED (exit=$commit1_exit), HEAD unchanged, loud stderr"
  PASS=$((PASS + 1))
else
  echo "FAIL T1: exit=$commit1_exit head=$head1 stderr=[$stderr1]"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D1"

# ── T2: correct full tier-1 shape (all PASS) -> ALLOWED ─────────────────────────
D2="$(new_repo)"
commit2_exit=0
(
  cd "$D2" || exit 1
  printf '%s' "$GOOD_TIER1" > docs/data/auditor-tier1-last-healthy.json
  git add docs/data/auditor-tier1-last-healthy.json
  git commit -qm "good tier1 write" -- docs/data/auditor-tier1-last-healthy.json 2>stderr.log
) || commit2_exit=$?
head2="$(cd "$D2" && git log --oneline | wc -l | tr -d ' ')"
if [[ "$commit2_exit" -eq 0 && "$head2" == "2" ]]; then
  echo "PASS T2: correct full tier-1 shape ALLOWED (exit=$commit2_exit), HEAD=$head2"
  PASS=$((PASS + 1))
else
  echo "FAIL T2: exit=$commit2_exit head=$head2 stderr=[$(cat "$D2/stderr.log" 2>/dev/null)]"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D2"

# ── T3: tier-1 shape present but one check != PASS -> BLOCKED ──────────────────
D3="$(new_repo)"
commit3_exit=0
(
  cd "$D3" || exit 1
  printf '%s' "$BAD_CHECK_TIER1" > docs/data/auditor-tier1-last-healthy.json
  git add docs/data/auditor-tier1-last-healthy.json
  git commit -qm "non-green tier1 write" -- docs/data/auditor-tier1-last-healthy.json 2>stderr.log
) || commit3_exit=$?
head3="$(cd "$D3" && git log --oneline | wc -l | tr -d ' ')"
if [[ "$commit3_exit" -ne 0 && "$head3" == "1" ]]; then
  echo "PASS T3: tier-1 shape with a non-PASS check BLOCKED (exit=$commit3_exit)"
  PASS=$((PASS + 1))
else
  echo "FAIL T3: exit=$commit3_exit head=$head3"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D3"

# ── T4: tier-2 file carrying a "checks" key -> BLOCKED ──────────────────────────
D4="$(new_repo)"
commit4_exit=0
(
  cd "$D4" || exit 1
  printf '%s' "$TIER2_WITH_CHECKS" > docs/data/auditor-tier2-last-healthy.json
  git add docs/data/auditor-tier2-last-healthy.json
  git commit -qm "tier2 shape bleed" -- docs/data/auditor-tier2-last-healthy.json 2>stderr.log
) || commit4_exit=$?
head4="$(cd "$D4" && git log --oneline | wc -l | tr -d ' ')"
stderr4="$(cat "$D4/stderr.log" 2>/dev/null)"
if [[ "$commit4_exit" -ne 0 && "$head4" == "1" && "$stderr4" == *"heartbeat-guard"* ]]; then
  echo "PASS T4: tier-2 file with a checks key BLOCKED (exit=$commit4_exit)"
  PASS=$((PASS + 1))
else
  echo "FAIL T4: exit=$commit4_exit head=$head4 stderr=[$stderr4]"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D4"

# ── T5: tier-2 correct bare shape -> ALLOWED (no false positive) ───────────────
D5="$(new_repo)"
commit5_exit=0
(
  cd "$D5" || exit 1
  printf '%s' "$GOOD_TIER2" > docs/data/auditor-tier2-last-healthy.json
  git add docs/data/auditor-tier2-last-healthy.json
  git commit -qm "good tier2 write" -- docs/data/auditor-tier2-last-healthy.json 2>stderr.log
) || commit5_exit=$?
head5="$(cd "$D5" && git log --oneline | wc -l | tr -d ' ')"
if [[ "$commit5_exit" -eq 0 && "$head5" == "2" ]]; then
  echo "PASS T5: correct bare tier-2 shape ALLOWED (exit=$commit5_exit)"
  PASS=$((PASS + 1))
else
  echo "FAIL T5: exit=$commit5_exit head=$head5 stderr=[$(cat "$D5/stderr.log" 2>/dev/null)]"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D5"

# ── T6: unrelated commit (no heartbeat files touched) -> complete no-op ────────
D6="$(new_repo)"
commit6_exit=0
(
  cd "$D6" || exit 1
  echo unrelated > unrelated.txt
  git add unrelated.txt
  git commit -qm "unrelated change" -- unrelated.txt 2>stderr.log
) || commit6_exit=$?
head6="$(cd "$D6" && git log --oneline | wc -l | tr -d ' ')"
stderr6_empty="yes"; [ -s "$D6/stderr.log" ] && stderr6_empty="no"
if [[ "$commit6_exit" -eq 0 && "$head6" == "2" && "$stderr6_empty" == "yes" ]]; then
  echo "PASS T6: unrelated commit unaffected (exit=$commit6_exit), guard silent"
  PASS=$((PASS + 1))
else
  echo "FAIL T6: exit=$commit6_exit head=$head6 stderr_empty=$stderr6_empty"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D6"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
