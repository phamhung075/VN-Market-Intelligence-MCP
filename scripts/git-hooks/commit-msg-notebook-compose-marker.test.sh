#!/usr/bin/env bash
# scripts/git-hooks/commit-msg-notebook-compose-marker.test.sh
#
# Permanent regression suite for scripts/git-hooks/commit-msg — the
# notebook-compose actuator forcing-function guard (PILOT-SCOPED to
# docs/agent-memory/notebooks/system-auditor.md). Same "REAL hook symlinked
# into a scratch repo" isolation pattern as
# pre-commit-notebook-uuid-provenance.test.sh / pre-commit-auditor-heartbeat.test.sh.
#
# Owning task : FIX-AUDITOR-NOTEBOOK-COMPOSE-COMMITMSG-MARKER-GATE
# Owning brief: docs/architecture-briefs/2026-08-26-fix-auditor-notebook-compose-tier1-adoption-gap-and-commitmsg-forcing-function.md §Child A
# Parent      : FIX-AUDITOR-NOTEBOOK-COMPOSE-ACTUATOR-BUILT-TESTED-NEVER-WIRED
#
# Coverage:
#   T1 marker present (any of the 4 observed real shapes: '[OK ...]',
#      '[WARN ...]', '[notebook-compose OK]', '[[notebook-compose] OK ...]')
#      -> PASS silent, exit 0, no stderr, in EITHER mode.
#   T2 no marker, default mode=warn -> WARN on stderr, exit 0 (commit lands).
#   T3 no marker, GIT_NOTEBOOK_COMPOSE_MARKER_MODE=reject -> REJECT on
#      stderr, exit 1 (commit BLOCKED, HEAD unchanged).
#   T4 no marker but a 'notebook-compose-marker-allow: <reason>' trailer is
#      present -> PASS silent even under mode=reject (escape hatch for the
#      legitimate AC-5-style data-repair/renumber bypass class, precedent
#      35be008d0).
#   T5 commit does not touch docs/agent-memory/notebooks/system-auditor.md at
#      all -> complete no-op, exit 0, no stderr (negative control — proves
#      the guard is PILOT-scoped to this one file, not fleet-wide).
#
# Run:
#   bash scripts/git-hooks/commit-msg-notebook-compose-marker.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SRC="$SCRIPT_DIR/commit-msg"

if [ ! -f "$HOOK_SRC" ]; then
  echo "ERROR: commit-msg hook not found at $HOOK_SRC" >&2
  exit 1
fi

PASS=0
FAIL=0

NB="docs/agent-memory/notebooks/system-auditor.md"

new_repo() {
  local dir
  dir="$(mktemp -d "${TMPDIR:-/tmp}/commitmsg-marker-guard-test.XXXXXX")"
  (
    cd "$dir" || exit 1
    git init -q .
    git config user.email test@local
    git config user.name test
    mkdir -p .git/hooks docs/agent-memory/notebooks
    ln -sf "$HOOK_SRC" .git/hooks/commit-msg
    echo base > seed.txt
    git add seed.txt
    git commit -qm seed -- seed.txt
  )
  printf '%s' "$dir"
}

# ── T1: marker present, all 4 observed shapes, default mode=warn ───────────────
D1="$(new_repo)"
(
  cd "$D1" || exit 1
  shapes_ok=1
  i=0
  for shape in "[OK reason]" "[WARN reason]" "[notebook-compose OK]" "[[notebook-compose] OK reason]"; do
    i=$((i + 1))
    echo "content $i" >> "$NB"
    git add "$NB"
    git commit -qm "chore(memory/system-auditor): notebook c$i ${shape}" -- "$NB" 2>"stderr_t1_$i.log"
    rc=$?
    err="$(cat "stderr_t1_$i.log" 2>/dev/null)"
    if [[ "$rc" != "0" || -n "$err" ]]; then
      shapes_ok=0
      echo "  T1 sub-failure on shape '${shape}': rc=$rc stderr=[$err]" >&2
    fi
  done
  echo "$shapes_ok" > t1_result.log
)
t1="$(cat "$D1/t1_result.log" 2>/dev/null)"
if [[ "$t1" == "1" ]]; then
  echo "PASS T1: all 4 observed marker shapes accepted silently (exit 0, no stderr)"
  PASS=$((PASS + 1))
else
  echo "FAIL T1: at least one marker shape was flagged — see sub-failure lines above"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D1"

# ── T2: no marker, default mode=warn -> WARN stderr, exit 0 ────────────────────
D2="$(new_repo)"
(
  cd "$D2" || exit 1
  echo "content" >> "$NB"
  git add "$NB"
  git commit -qm "chore(memory/system-auditor): notebook c1 no marker here" -- "$NB" 2>stderr.log
  echo $? > exit.log
)
exit2="$(cat "$D2/exit.log" 2>/dev/null)"
warn2="no"; grep -q "notebook-compose-marker-guard.*WARN" "$D2/stderr.log" 2>/dev/null && warn2="yes"
committed2="$(cd "$D2" && git log --format=%s -1)"
if [[ "$exit2" == "0" && "$warn2" == "yes" && "$committed2" == "chore(memory/system-auditor): notebook c1 no marker here" ]]; then
  echo "PASS T2: no-marker default mode=warn -> WARN stderr fired, commit still landed"
  PASS=$((PASS + 1))
else
  echo "FAIL T2: exit=$exit2 warn=$warn2 committed=[$committed2] stderr=[$(cat "$D2/stderr.log" 2>/dev/null)]"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D2"

# ── T3: no marker, mode=reject -> REJECT stderr, exit 1, HEAD unchanged ────────
D3="$(new_repo)"
head_before3=""
(
  cd "$D3" || exit 1
  echo "content" >> "$NB"
  git add "$NB"
  GIT_NOTEBOOK_COMPOSE_MARKER_MODE=reject git commit -qm "chore(memory/system-auditor): notebook c1 no marker" -- "$NB" 2>stderr.log
  echo $? > exit.log
  git log --format=%s -1 > head_after.log
)
exit3="$(cat "$D3/exit.log" 2>/dev/null)"
reject3="no"; grep -q "notebook-compose-marker-guard.*REJECT" "$D3/stderr.log" 2>/dev/null && reject3="yes"
head3="$(cat "$D3/head_after.log" 2>/dev/null)"
if [[ "$exit3" == "1" && "$reject3" == "yes" && "$head3" == "seed" ]]; then
  echo "PASS T3: no-marker mode=reject -> REJECT stderr fired, commit BLOCKED, HEAD unchanged"
  PASS=$((PASS + 1))
else
  echo "FAIL T3: exit=$exit3 reject=$reject3 head=[$head3] stderr=[$(cat "$D3/stderr.log" 2>/dev/null)]"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D3"

# ── T4: no marker but escape-hatch trailer present, mode=reject -> PASS silent ─
D4="$(new_repo)"
(
  cd "$D4" || exit 1
  echo "content" >> "$NB"
  git add "$NB"
  GIT_NOTEBOOK_COMPOSE_MARKER_MODE=reject git commit -qm "chore(memory/system-auditor): notebook c1 data repair

notebook-compose-marker-allow: AC-5 data-repair renumber, no compose run intended" -- "$NB" 2>stderr.log
  echo $? > exit.log
)
exit4="$(cat "$D4/exit.log" 2>/dev/null)"
err4="$(cat "$D4/stderr.log" 2>/dev/null)"
if [[ "$exit4" == "0" && -z "$err4" ]]; then
  echo "PASS T4: escape-hatch trailer bypasses the guard silently even under mode=reject"
  PASS=$((PASS + 1))
else
  echo "FAIL T4: exit=$exit4 stderr=[$err4]"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D4"

# ── T5: commit does not touch the notebook path -> complete no-op ─────────────
D5="$(new_repo)"
(
  cd "$D5" || exit 1
  echo "unrelated" > other.txt
  git add other.txt
  GIT_NOTEBOOK_COMPOSE_MARKER_MODE=reject git commit -qm "unrelated change, no marker, no notebook touch" -- other.txt 2>stderr.log
  echo $? > exit.log
)
exit5="$(cat "$D5/exit.log" 2>/dev/null)"
err5="$(cat "$D5/stderr.log" 2>/dev/null)"
if [[ "$exit5" == "0" && -z "$err5" ]]; then
  echo "PASS T5: commit not touching the pilot notebook path is a complete no-op"
  PASS=$((PASS + 1))
else
  echo "FAIL T5: exit=$exit5 stderr=[$err5]"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D5"

echo ""
echo "=== commit-msg-notebook-compose-marker.test.sh: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
