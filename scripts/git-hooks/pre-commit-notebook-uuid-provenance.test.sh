#!/usr/bin/env bash
# scripts/git-hooks/pre-commit-notebook-uuid-provenance.test.sh
#
# Permanent regression suite for the agent-notebook heading-line session-UUID
# provenance guard added to scripts/git-hooks/pre-commit
# (_check_notebook_uuid_provenance / _notebook_uuid_line_verdict). Separate
# file from pre-commit.test.sh / pre-commit-auditor-heartbeat.test.sh to keep
# unrelated concerns independently reviewable/replayable — same "REAL hook
# symlinked into a scratch repo" isolation pattern as those suites.
#
# Owning task : FIX-AGENT-NOTEBOOK-UUID-PROVENANCE
# Owning brief: docs/architecture-briefs/2026-08-05-fix-agent-notebook-uuid-provenance-guard.md
# Spec        : .claude/skills/notebook-write/SKILL.md § AC-1
#
# Coverage:
#   T1  ADDED heading line embeds a full session UUID (RULE 1) in default
#       mode=warn -> commit still lands, stderr banner fires, docs/signals/
#       gets one aggregated write.
#   T2  same as T1 but GIT_NOTEBOOK_UUID_PROVENANCE_MODE=reject -> commit
#       BLOCKED (non-zero exit), HEAD unchanged.
#   T3  ADDED heading's first token is a bare 8-hex fragment (RULE 2, the
#       confirmed live 'ad265f86' shape) -> WARN only, commit lands even
#       under mode=reject (Rule 2 never hard-blocks, by design).
#   T4  legitimate 'c<NNN>' incrementing counter heading (including a
#       hypothetical all-hex-representable 'c12345') -> ZERO guard output,
#       commit lands cleanly (negative control — proves the counter-shape
#       exclusion runs BEFORE the hex-fragment check).
#   T5  legitimate fixed non-hex source label heading ('## d4-auto - <ts>')
#       -> ZERO guard output (negative control, SKILL.md AC-1 peer
#       convention this row explicitly protects).
#   T6  escape hatch 'notebook-uuid-lint-allow: <reason>' on an otherwise
#       RULE-1-matching line suppresses the guard entirely, even under
#       mode=reject.
#   T7  a short git SHA (7-8 hex chars) cited in BODY PROSE below a heading
#       (not on the heading line itself) -> ZERO guard output — proves the
#       heading-line scoping (not a blanket body-prose scan) avoids the
#       documented git-short-SHA false-positive class.
#   T8  a full UUID mentioned in BODY PROSE below a heading (not on the
#       heading line itself) -> ZERO guard output — same heading-line
#       scoping, negative control for the body-prose class more broadly.
#   T9  commit that touches a non-notebook file only -> complete no-op (no
#       stderr, no exit-code effect) — regression guard against the new
#       check leaking into unrelated commits.
#   T10 a RETAINED (already-committed, unmodified) heading line containing a
#       full UUID is never re-flagged by an unrelated LATER commit that only
#       appends a new section below it — proves the guard is scoped to
#       ADDED lines in THIS commit's diff, not a whole-file scan (this is
#       the mechanism that keeps pre-existing corpus debt, e.g.
#       tran-ngoc-bau.md's real collision-note history, from blocking every
#       future commit to that same file).
#
# Run:
#   bash scripts/git-hooks/pre-commit-notebook-uuid-provenance.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
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
  dir="$(mktemp -d "${TMPDIR:-/tmp}/nb-uuid-guard-test.XXXXXX")"
  (
    cd "$dir" || exit 1
    git init -q .
    git config user.email test@local
    git config user.name test
    mkdir -p .git/hooks docs/agent-memory/notebooks docs/signals
    ln -sf "$HOOK_SRC" .git/hooks/pre-commit
    echo base > seed.txt
    git add seed.txt
    git commit -qm seed -- seed.txt
  )
  printf '%s' "$dir"
}

# ── T1: full UUID on an ADDED heading line, default mode=warn ──────────────────
D1="$(new_repo)"
NB1="docs/agent-memory/notebooks/example-agent.md"
(
  cd "$D1" || exit 1
  printf '# Example Agent — Notebook\n\n## c1 · 2026-08-05T18:00:00Z (session=ad265f86-1234-4a5b-8c6d-9e0f1a2b3c4d leaked)\nbody\n' > "$NB1"
  git add "$NB1"
  git commit -qm "notebook write" -- "$NB1" 2>stderr.log
  echo $? > exit.log
)
exit1="$(cat "$D1/exit.log" 2>/dev/null)"
warn1="no"; grep -q "notebook-uuid-provenance-guard.*WARN" "$D1/stderr.log" 2>/dev/null && warn1="yes"
committed1="$(cd "$D1" && git show HEAD:"$NB1" 2>/dev/null | grep -c "ad265f86-1234")"
if [[ "$exit1" == "0" && "$warn1" == "yes" && "$committed1" == "1" ]]; then
  echo "PASS T1: full-UUID heading line WARN fired, commit still landed (default mode)"
  PASS=$((PASS + 1))
else
  echo "FAIL T1: exit=$exit1 warn=$warn1 committed=$committed1 stderr=[$(cat "$D1/stderr.log" 2>/dev/null)]"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D1"

# ── T2: same as T1, GIT_NOTEBOOK_UUID_PROVENANCE_MODE=reject -> BLOCKED ────────
D2="$(new_repo)"
NB2="docs/agent-memory/notebooks/example-agent.md"
(
  cd "$D2" || exit 1
  printf '# Example Agent — Notebook\n\n## c1 · 2026-08-05T18:00:00Z (session=ad265f86-1234-4a5b-8c6d-9e0f1a2b3c4d leaked)\nbody\n' > "$NB2"
  git add "$NB2"
  GIT_NOTEBOOK_UUID_PROVENANCE_MODE=reject git commit -qm "notebook write" -- "$NB2" 2>stderr.log
  echo $? > exit.log
)
exit2="$(cat "$D2/exit.log" 2>/dev/null)"
reject2="no"; grep -q "notebook-uuid-provenance-guard.*REJECT" "$D2/stderr.log" 2>/dev/null && reject2="yes"
head2="$(cd "$D2" && git log --format=%s -1)"
if [[ "$exit2" != "0" && "$reject2" == "yes" && "$head2" == "seed" ]]; then
  echo "PASS T2: mode=reject BLOCKED the full-UUID commit (exit=$exit2), HEAD still at seed"
  PASS=$((PASS + 1))
else
  echo "FAIL T2: exit=$exit2 reject=$reject2 head=$head2 stderr=[$(cat "$D2/stderr.log" 2>/dev/null)]"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D2"

# ── T3: bare 8-hex first-token (RULE 2) -> WARN only, lands even under reject ──
D3="$(new_repo)"
NB3="docs/agent-memory/notebooks/system-auditor.md"
(
  cd "$D3" || exit 1
  printf '# System Auditor — Notebook\n\n## ad265f86 · 2026-07-29T06:09:36Z\nbody\n' > "$NB3"
  git add "$NB3"
  GIT_NOTEBOOK_UUID_PROVENANCE_MODE=reject git commit -qm "notebook write" -- "$NB3" 2>stderr.log
  echo $? > exit.log
)
exit3="$(cat "$D3/exit.log" 2>/dev/null)"
warn3="no"; grep -q "notebook-uuid-provenance-guard.*ad265f86" "$D3/stderr.log" 2>/dev/null && warn3="yes"
reject3_word="no"; grep -q "REJECT.*ad265f86\|ad265f86.*REJECT" "$D3/stderr.log" 2>/dev/null && reject3_word="yes"
if [[ "$exit3" == "0" && "$warn3" == "yes" && "$reject3_word" == "no" ]]; then
  echo "PASS T3: bare-hex token ('ad265f86') WARN fired, commit landed even under mode=reject (Rule 2 never hard-blocks)"
  PASS=$((PASS + 1))
else
  echo "FAIL T3: exit=$exit3 warn=$warn3 reject_word=$reject3_word stderr=[$(cat "$D3/stderr.log" 2>/dev/null)]"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D3"

# ── T4: legit c<NNN> counter (incl. all-hex-representable c12345) -> zero output ─
D4="$(new_repo)"
NB4="docs/agent-memory/notebooks/example-agent.md"
(
  cd "$D4" || exit 1
  printf '# Example Agent — Notebook\n\n## c12345 · 2026-08-05T18:00:00Z\nbody\n' > "$NB4"
  git add "$NB4"
  GIT_NOTEBOOK_UUID_PROVENANCE_MODE=reject git commit -qm "notebook write" -- "$NB4" 2>stderr.log
  echo $? > exit.log
)
exit4="$(cat "$D4/exit.log" 2>/dev/null)"
stderr4_empty="yes"; grep -q "notebook-uuid-provenance-guard" "$D4/stderr.log" 2>/dev/null && stderr4_empty="no"
if [[ "$exit4" == "0" && "$stderr4_empty" == "yes" ]]; then
  echo "PASS T4: legit 'c12345' counter (all-hex-representable chars) produced ZERO guard output — counter-shape exclusion runs before hex-fragment check"
  PASS=$((PASS + 1))
else
  echo "FAIL T4: exit=$exit4 stderr_empty=$stderr4_empty stderr=[$(cat "$D4/stderr.log" 2>/dev/null)]"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D4"

# ── T5: legit fixed non-hex source label ('## d4-auto - <ts>') -> zero output ──
D5="$(new_repo)"
NB5="docs/agent-memory/notebooks/example-agent.md"
(
  cd "$D5" || exit 1
  printf '# Example Agent — Notebook\n\n## d4-auto - 2026-08-05T18:00:00Z\nbody\n' > "$NB5"
  git add "$NB5"
  GIT_NOTEBOOK_UUID_PROVENANCE_MODE=reject git commit -qm "notebook write" -- "$NB5" 2>stderr.log
  echo $? > exit.log
)
exit5="$(cat "$D5/exit.log" 2>/dev/null)"
stderr5_empty="yes"; grep -q "notebook-uuid-provenance-guard" "$D5/stderr.log" 2>/dev/null && stderr5_empty="no"
if [[ "$exit5" == "0" && "$stderr5_empty" == "yes" ]]; then
  echo "PASS T5: legit fixed source label 'd4-auto' produced ZERO guard output"
  PASS=$((PASS + 1))
else
  echo "FAIL T5: exit=$exit5 stderr_empty=$stderr5_empty stderr=[$(cat "$D5/stderr.log" 2>/dev/null)]"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D5"

# ── T6: escape hatch suppresses even a RULE-1 match under mode=reject ──────────
D6="$(new_repo)"
NB6="docs/agent-memory/notebooks/example-agent.md"
(
  cd "$D6" || exit 1
  printf '# Example Agent — Notebook\n\n## c1 · 2026-08-05T18:00:00Z (session=ad265f86-1234-4a5b-8c6d-9e0f1a2b3c4d intentional, forensic record) notebook-uuid-lint-allow: incident recovery note\nbody\n' > "$NB6"
  git add "$NB6"
  GIT_NOTEBOOK_UUID_PROVENANCE_MODE=reject git commit -qm "notebook write" -- "$NB6" 2>stderr.log
  echo $? > exit.log
)
exit6="$(cat "$D6/exit.log" 2>/dev/null)"
stderr6_empty="yes"; grep -q "notebook-uuid-provenance-guard" "$D6/stderr.log" 2>/dev/null && stderr6_empty="no"
if [[ "$exit6" == "0" && "$stderr6_empty" == "yes" ]]; then
  echo "PASS T6: 'notebook-uuid-lint-allow:' escape hatch suppressed the full-UUID match even under mode=reject"
  PASS=$((PASS + 1))
else
  echo "FAIL T6: exit=$exit6 stderr_empty=$stderr6_empty stderr=[$(cat "$D6/stderr.log" 2>/dev/null)]"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D6"

# ── T7: short git SHA cited in BODY PROSE (not the heading line) -> zero output ─
D7="$(new_repo)"
NB7="docs/agent-memory/notebooks/example-agent.md"
(
  cd "$D7" || exit 1
  printf '# Example Agent — Notebook\n\n## c1 · 2026-08-05T18:00:00Z\nFixed in commit ad265f86, verified clean.\n' > "$NB7"
  git add "$NB7"
  GIT_NOTEBOOK_UUID_PROVENANCE_MODE=reject git commit -qm "notebook write" -- "$NB7" 2>stderr.log
  echo $? > exit.log
)
exit7="$(cat "$D7/exit.log" 2>/dev/null)"
stderr7_empty="yes"; grep -q "notebook-uuid-provenance-guard" "$D7/stderr.log" 2>/dev/null && stderr7_empty="no"
if [[ "$exit7" == "0" && "$stderr7_empty" == "yes" ]]; then
  echo "PASS T7: short-SHA citation in BODY PROSE (not heading line) produced ZERO guard output — heading-line scoping confirmed"
  PASS=$((PASS + 1))
else
  echo "FAIL T7: exit=$exit7 stderr_empty=$stderr7_empty stderr=[$(cat "$D7/stderr.log" 2>/dev/null)]"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D7"

# ── T8: full UUID mentioned in BODY PROSE (not the heading line) -> zero output ─
D8="$(new_repo)"
NB8="docs/agent-memory/notebooks/example-agent.md"
(
  cd "$D8" || exit 1
  printf '# Example Agent — Notebook\n\n## c1 · 2026-08-05T18:00:00Z\nPeer session ad265f86-1234-4a5b-8c6d-9e0f1a2b3c4d handled this tick.\n' > "$NB8"
  git add "$NB8"
  GIT_NOTEBOOK_UUID_PROVENANCE_MODE=reject git commit -qm "notebook write" -- "$NB8" 2>stderr.log
  echo $? > exit.log
)
exit8="$(cat "$D8/exit.log" 2>/dev/null)"
stderr8_empty="yes"; grep -q "notebook-uuid-provenance-guard" "$D8/stderr.log" 2>/dev/null && stderr8_empty="no"
if [[ "$exit8" == "0" && "$stderr8_empty" == "yes" ]]; then
  echo "PASS T8: full-UUID mention in BODY PROSE (not heading line) produced ZERO guard output — heading-line scoping confirmed"
  PASS=$((PASS + 1))
else
  echo "FAIL T8: exit=$exit8 stderr_empty=$stderr8_empty stderr=[$(cat "$D8/stderr.log" 2>/dev/null)]"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D8"

# ── T9: commit touching a non-notebook file only -> complete no-op ─────────────
D9="$(new_repo)"
(
  cd "$D9" || exit 1
  echo "unrelated content ad265f86-1234-4a5b-8c6d-9e0f1a2b3c4d" > unrelated.txt
  git add unrelated.txt
  GIT_NOTEBOOK_UUID_PROVENANCE_MODE=reject git commit -qm "unrelated" -- unrelated.txt 2>stderr.log
  echo $? > exit.log
)
exit9="$(cat "$D9/exit.log" 2>/dev/null)"
stderr9_empty="yes"; [ -s "$D9/stderr.log" ] && stderr9_empty="no"
if [[ "$exit9" == "0" && "$stderr9_empty" == "yes" ]]; then
  echo "PASS T9: non-notebook file commit is a complete no-op for this guard"
  PASS=$((PASS + 1))
else
  echo "FAIL T9: exit=$exit9 stderr_empty=$stderr9_empty stderr=[$(cat "$D9/stderr.log" 2>/dev/null)]"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D9"

# ── T10: retained full-UUID heading is never re-flagged by a LATER commit that ──
# only APPENDS a new section below it (diff-scoped, not a whole-file rescan).
D10="$(new_repo)"
NB10="docs/agent-memory/notebooks/example-agent.md"
(
  cd "$D10" || exit 1
  # First commit intentionally lands the full-UUID line WITHOUT the guard
  # (mode default warn, never blocks) — simulates pre-existing corpus debt.
  printf '# Example Agent — Notebook\n\n## c1 · 2026-08-05T18:00:00Z (session=ad265f86-1234-4a5b-8c6d-9e0f1a2b3c4d leaked)\nbody1\n' > "$NB10"
  git add "$NB10"
  git commit -qm "first (debt) write" -- "$NB10" >/dev/null 2>&1

  # Second commit only APPENDS a new, clean section — the old UUID line is
  # untouched (not part of this commit's added-line diff).
  printf '\n## c2 · 2026-08-05T19:00:00Z\nbody2\n' >> "$NB10"
  git add "$NB10"
  GIT_NOTEBOOK_UUID_PROVENANCE_MODE=reject git commit -qm "second (clean append)" -- "$NB10" 2>stderr.log
  echo $? > exit.log
)
exit10="$(cat "$D10/exit.log" 2>/dev/null)"
stderr10_empty="yes"; grep -q "notebook-uuid-provenance-guard" "$D10/stderr.log" 2>/dev/null && stderr10_empty="no"
if [[ "$exit10" == "0" && "$stderr10_empty" == "yes" ]]; then
  echo "PASS T10: retained pre-existing full-UUID heading not re-flagged by a later append-only commit — diff-scoped, not a whole-file rescan"
  PASS=$((PASS + 1))
else
  echo "FAIL T10: exit=$exit10 stderr_empty=$stderr10_empty stderr=[$(cat "$D10/stderr.log" 2>/dev/null)]"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D10"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
