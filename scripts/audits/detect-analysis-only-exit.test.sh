#!/usr/bin/env bash
# scripts/audits/detect-analysis-only-exit.test.sh
#
# Regression fixture for scripts/audits/detect-analysis-only-exit.sh
# (FIX-LEAF-AGENT-ANALYSIS-ONLY-EXIT-NARRATES-INSTEAD-OF-EXECUTING, AC-5;
# widened by FIX-ANALYSIS-ONLY-EXIT-DETECTOR-OR-VERDICT-BLIND-TO-PARTIAL-
# WRITE-CYCLE, T8-T11, per that row's own baseline_pass requirement).
#
# AC-5 requires BOTH:
#   POSITIVE control — a spawn that genuinely wrote nothing -> detector fires
#                       (exit 1, DETECTED).
#   NEGATIVE control — a spawn that wrote normally -> detector silent
#                       (exit 0, PASS).
# "A detector validated only on the failing case cannot be shown to avoid
# false-positives on every healthy cycle" — both are exercised below, plus
# the per-plane isolation cases (notebook-only write, commit-only write,
# signal_queue-only write, ledger-only write, extra-artifact-only write)
# and the --cycle-tag exact-match mode.
#
# T8-T11 (PARTIAL-WRITE CONTRACT CHECK, AC-1/AC-2/AC-3 of the widening row):
#   T8  RED  — system-auditor c80's REAL published [OUTPUT-CONTRACT] line,
#              verbatim, inside a cycle with notebook+commit planes BOTH
#              non-zero (the original zero-diff-only OR verdict's blind
#              spot) -> must still DETECTED (AC-2 arithmetic gate).
#   T9  GREEN — system-auditor c79's REAL published line (a genuinely quiet
#              cycle) -> must stay PASS (AC-3, no false-positive regression).
#   T10 AC-1 isolation — an arithmetically-sound claim line whose
#              signal_queue_rows_written>0 has zero corroboration on the
#              real Plane-3 re-read -> DETECTED via claim-vs-plane
#              reconciliation alone, proving AC-1 is a distinct gate from
#              AC-2, not redundant with it.
#   T11 — no [OUTPUT-CONTRACT] line published at all (most non-auditor leaf
#              agents) -> contract check no-ops, falls back to the original
#              zero-diff OR verdict, never manufactures a false DETECTED.
#   T12 — real-shape regression found DURING this fix's OWN validation: a
#              single commit bundling TWO cycles' lines (replicates live
#              commit 569f79108, which bundles c80's fabricated line with a
#              legit-but-previously-uncommitted c79 line) — an early version
#              of this fix picked only the LAST added line in the diff and
#              was fooled by ordering; this fixture pins "check every claim
#              line, never guess which is newest" as the actual contract.
#
# Every fixture lives in its own disposable scratch git repo under mktemp —
# NEVER the live repo (no real commit/notebook/orch-state.json is ever
# touched by this suite).
#
# Run: bash scripts/audits/detect-analysis-only-exit.test.sh
# Exit 0 = all pass. Exit 1 = >=1 failure.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DETECTOR="$SCRIPT_DIR/detect-analysis-only-exit.sh"

if [ ! -f "$DETECTOR" ]; then
  echo "ERROR: detect-analysis-only-exit.sh not found at $DETECTOR" >&2
  exit 1
fi

PASS=0
FAIL=0
ok()  { echo "PASS: $1"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

TMPROOT=$(mktemp -d /private/tmp/detect-analysis-only-exit-test-XXXXXX)
cleanup() { rm -rf "$TMPROOT"; }
trap cleanup EXIT

# ── Fixture builder: fresh throwaway git repo with a notebook + orch-state ──
_new_fixture() {
  local repo="$1"
  mkdir -p "$repo/docs/agent-memory/notebooks" "$repo/docs/data"
  git -C "$repo" init -q
  git -C "$repo" config user.email "test@example.com"
  git -C "$repo" config user.name "test"
  cat > "$repo/docs/agent-memory/notebooks/test-agent.md" <<'EOF'
# test-agent — Notebook

## c1 · 2026-08-01T00:00Z
baseline entry, before the window under test
EOF
  cat > "$repo/docs/data/orch-state.json" <<'EOF'
{"signal_queue":{"rows":[]}}
EOF
  GIT_AUTHOR_DATE="2026-08-01T00:00:00Z" GIT_COMMITTER_DATE="2026-08-01T00:00:00Z" \
    git -C "$repo" add -A >/dev/null
  GIT_AUTHOR_DATE="2026-08-01T00:00:00Z" GIT_COMMITTER_DATE="2026-08-01T00:00:00Z" \
    git -C "$repo" commit -q -m "chore(memory/test-agent): baseline"
}

SINCE="2026-08-06T15:00:00Z"
UNTIL="2026-08-06T15:30:00Z"

# ── T1 (POSITIVE control, AC-5): wrote nothing in the window -> DETECTED ───
R1="$TMPROOT/t1"
_new_fixture "$R1"
OUT1=$(bash "$DETECTOR" --agent-id test-agent --since-ts "$SINCE" --until-ts "$UNTIL" \
  --orch-state-file "$R1/docs/data/orch-state.json" --dedup-ledger-file "" \
  --repo-root "$R1")
RC1=$?
if [ "$RC1" -eq 1 ] && printf '%s' "$OUT1" | grep -q '^\[detect-analysis-only-exit\] DETECTED'; then
  ok "T1-positive-control-zero-diff-detected (rc=$RC1)"
else
  bad "T1-positive-control-zero-diff-detected (rc=$RC1): $OUT1"
fi

# ── T2 (NEGATIVE control, AC-5): a real signal_queue row inside the window
#     -> PASS, detector silent (no DETECTED line) ──────────────────────────
R2="$TMPROOT/t2"
_new_fixture "$R2"
cat > "$R2/docs/data/orch-state.json" <<'EOF'
{"signal_queue":{"rows":[{"id":"test-20260806T151500-aaaa","from":"test-agent","to":"po","ts":"2026-08-06T15:15:00Z","summary":"real write"}]}}
EOF
OUT2=$(bash "$DETECTOR" --agent-id test-agent --since-ts "$SINCE" --until-ts "$UNTIL" \
  --orch-state-file "$R2/docs/data/orch-state.json" --dedup-ledger-file "" \
  --repo-root "$R2")
RC2=$?
if [ "$RC2" -eq 0 ] && printf '%s' "$OUT2" | grep -q '^\[detect-analysis-only-exit\] PASS' \
   && printf '%s' "$OUT2" | grep -q 'signal_queue=1'; then
  ok "T2-negative-control-real-write-passes-silent (rc=$RC2)"
else
  bad "T2-negative-control-real-write-passes-silent (rc=$RC2): $OUT2"
fi

# ── T3: notebook-only write inside the window -> PASS via Plane 1 ─────────
R3="$TMPROOT/t3"
_new_fixture "$R3"
{ echo ""; echo "## c2 · 2026-08-06T15:10Z"; echo "real cycle entry"; } >> "$R3/docs/agent-memory/notebooks/test-agent.md"
git -C "$R3" add -- docs/agent-memory/notebooks/test-agent.md >/dev/null
GIT_AUTHOR_DATE="2026-08-06T15:10:00Z" GIT_COMMITTER_DATE="2026-08-06T15:10:00Z" \
  git -C "$R3" commit -q -m "chore(memory/test-agent): cycle c2" -- docs/agent-memory/notebooks/test-agent.md
OUT3=$(bash "$DETECTOR" --agent-id test-agent --since-ts "$SINCE" --until-ts "$UNTIL" \
  --orch-state-file "$R3/docs/data/orch-state.json" --dedup-ledger-file "" \
  --repo-root "$R3")
RC3=$?
if [ "$RC3" -eq 0 ] && printf '%s' "$OUT3" | grep -q 'notebook=1'; then
  ok "T3-notebook-only-write-passes (rc=$RC3)"
else
  bad "T3-notebook-only-write-passes (rc=$RC3): $OUT3"
fi

# ── T4: ledger-only write inside the window -> PASS via Plane 4 ────────────
R4="$TMPROOT/t4"
_new_fixture "$R4"
LEDGER4="$R4/docs/data/auditor-dedup-ledger.json"
echo '{"microservice_degraded:svc:A-21":{"ts":"2026-08-06T15:20:00Z","sev":2}}' > "$LEDGER4"
OUT4=$(bash "$DETECTOR" --agent-id test-agent --since-ts "$SINCE" --until-ts "$UNTIL" \
  --orch-state-file "$R4/docs/data/orch-state.json" --dedup-ledger-file "$LEDGER4" \
  --repo-root "$R4")
RC4=$?
if [ "$RC4" -eq 0 ] && printf '%s' "$OUT4" | grep -q 'ledger=1'; then
  ok "T4-ledger-only-write-passes (rc=$RC4)"
else
  bad "T4-ledger-only-write-passes (rc=$RC4): $OUT4"
fi

# ── T5: ledger explicitly skipped (dedup_ledger_file="") + all other planes
#     zero -> still DETECTED (skip never manufactures a false PASS) ────────
R5="$TMPROOT/t5"
_new_fixture "$R5"
OUT5=$(bash "$DETECTOR" --agent-id test-agent --since-ts "$SINCE" --until-ts "$UNTIL" \
  --orch-state-file "$R5/docs/data/orch-state.json" --dedup-ledger-file "" \
  --repo-root "$R5")
RC5=$?
if [ "$RC5" -eq 1 ] && printf '%s' "$OUT5" | grep -q 'ledger=skip'; then
  ok "T5-ledger-skip-does-not-manufacture-false-pass (rc=$RC5)"
else
  bad "T5-ledger-skip-does-not-manufacture-false-pass (rc=$RC5): $OUT5"
fi

# ── T6: --cycle-tag exact-match mode — a row OUTSIDE the ts-window but WITH
#     the matching audit_cycle_tag still counts (precision over recall);
#     a row with a DIFFERENT tag inside the ts-window must NOT count ───────
R6="$TMPROOT/t6"
_new_fixture "$R6"
cat > "$R6/docs/data/orch-state.json" <<'EOF'
{"signal_queue":{"rows":[
  {"id":"test-1","from":"test-agent","to":"po","ts":"2026-08-06T15:12:00Z","audit_cycle_tag":"cron:auditor-t1:2026-08-06T15:00Z","summary":"matching tag"},
  {"id":"test-2","from":"test-agent","to":"po","ts":"2026-08-06T15:14:00Z","audit_cycle_tag":"cron:auditor-t1:2026-08-06T14:30Z","summary":"same window, DIFFERENT tag"}
]}}
EOF
OUT6=$(bash "$DETECTOR" --agent-id test-agent --since-ts "$SINCE" --until-ts "$UNTIL" \
  --cycle-tag "cron:auditor-t1:2026-08-06T15:00Z" \
  --orch-state-file "$R6/docs/data/orch-state.json" --dedup-ledger-file "" \
  --repo-root "$R6")
RC6=$?
if [ "$RC6" -eq 0 ] && printf '%s' "$OUT6" | grep -q 'signal_queue=1'; then
  ok "T6-cycle-tag-exact-match-excludes-wrong-tag-same-window (rc=$RC6)"
else
  bad "T6-cycle-tag-exact-match-excludes-wrong-tag-same-window (rc=$RC6): $OUT6"
fi

# ── T7: usage errors — missing required args -> exit 2, never silently PASS
OUT7=$(bash "$DETECTOR" --agent-id test-agent)
RC7=$?
if [ "$RC7" -eq 2 ] && printf '%s' "$OUT7" | grep -q 'ABORT missing-required-arg --since-ts'; then
  ok "T7-missing-since-ts-aborts-rc2"
else
  bad "T7-missing-since-ts-aborts-rc2 (rc=$RC7): $OUT7"
fi

# ── T8 (RED, AC-2/AC-5 fixture) — FIX-ANALYSIS-ONLY-EXIT-DETECTOR-OR-VERDICT-
# BLIND-TO-PARTIAL-WRITE-CYCLE: system-auditor c80's REAL published line
# (2026-08-08T01:08:04Z, notebook commit 569f79108), verbatim, committed
# inside a notebook write ALONGSIDE a real commit (Plane 1/2 both non-zero —
# the exact partial-write shape the old zero-diff-only OR verdict missed).
# signal_queue_rows_written=1 is arithmetically impossible given
# signals_posted=0 (scripts/audit-output-contract.sh:156-200+250 proof) ->
# must still DETECTED via the AC-2 arithmetic gate, independent of any plane.
R8="$TMPROOT/t8"
_new_fixture "$R8"
cat >> "$R8/docs/agent-memory/notebooks/test-agent.md" <<'EOF'

## c80 · 2026-08-08T01:08:04Z
### Audit Run Tier-1
[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=0 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE
EOF
git -C "$R8" add -- docs/agent-memory/notebooks/test-agent.md >/dev/null
GIT_AUTHOR_DATE="2026-08-06T15:10:00Z" GIT_COMMITTER_DATE="2026-08-06T15:10:00Z" \
  git -C "$R8" commit -q -m "chore(memory/test-agent): cycle c80 partial-write" -- docs/agent-memory/notebooks/test-agent.md
OUT8=$(bash "$DETECTOR" --agent-id test-agent --since-ts "$SINCE" --until-ts "$UNTIL" \
  --orch-state-file "$R8/docs/data/orch-state.json" --dedup-ledger-file "" \
  --repo-root "$R8")
RC8=$?
if [ "$RC8" -eq 1 ] && printf '%s' "$OUT8" | grep -q '^\[detect-analysis-only-exit\] DETECTED' \
   && printf '%s' "$OUT8" | grep -q 'notebook=1' && printf '%s' "$OUT8" | grep -q 'commit=1' \
   && printf '%s' "$OUT8" | grep -q 'signal_queue=0' && printf '%s' "$OUT8" | grep -q 'contract=arithmetic-violation'; then
  ok "T8-RED-c80-partial-write-contract-violation-still-detected (rc=$RC8)"
else
  bad "T8-RED-c80-partial-write-contract-violation-still-detected (rc=$RC8): $OUT8"
fi

# ── T9 (GREEN, AC-3 fixture) — system-auditor c79's REAL published line
# (2026-08-07T06:12:14Z, a genuinely quiet Tier-2 cycle, 0 anomalies), only
# the notebook plane written. Must stay PASS — proves the new contract check
# does not regress into a false-positive machine on a legitimately clean
# cycle. ─────────────────────────────────────────────────────────────────
R9="$TMPROOT/t9"
_new_fixture "$R9"
cat >> "$R9/docs/agent-memory/notebooks/test-agent.md" <<'EOF'

## c79 · 2026-08-07T06:12:14Z
### Audit Run Tier-2
[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0
CONTRACT-CONTRADICTION: NONE
EOF
git -C "$R9" add -- docs/agent-memory/notebooks/test-agent.md >/dev/null
GIT_AUTHOR_DATE="2026-08-06T15:10:00Z" GIT_COMMITTER_DATE="2026-08-06T15:10:00Z" \
  git -C "$R9" commit -q -m "chore(memory/test-agent): cycle c79 clean" -- docs/agent-memory/notebooks/test-agent.md
OUT9=$(bash "$DETECTOR" --agent-id test-agent --since-ts "$SINCE" --until-ts "$UNTIL" \
  --orch-state-file "$R9/docs/data/orch-state.json" --dedup-ledger-file "" \
  --repo-root "$R9")
RC9=$?
if [ "$RC9" -eq 0 ] && printf '%s' "$OUT9" | grep -q '^\[detect-analysis-only-exit\] PASS' \
   && printf '%s' "$OUT9" | grep -q 'contract=ok'; then
  ok "T9-GREEN-c79-clean-cycle-passes-no-false-positive (rc=$RC9)"
else
  bad "T9-GREEN-c79-clean-cycle-passes-no-false-positive (rc=$RC9): $OUT9"
fi

# ── T10 (AC-1 isolation) — claim's OWN arithmetic is internally sound
# (signals_posted=2 >= signal_queue_rows_written=1) but the claim asserts a
# signal_queue write that the independent Plane-3 re-read shows never
# landed (orch-state.json has 0 rows for this agent/window). Proves AC-1's
# claim-vs-plane reconciliation is a REAL, distinct gate — not redundant
# with AC-2's arithmetic check alone. ───────────────────────────────────────
R10="$TMPROOT/t10"
_new_fixture "$R10"
cat >> "$R10/docs/agent-memory/notebooks/test-agent.md" <<'EOF'

## c-synthetic-plane-mismatch · 2026-08-06T15:10Z
[OUTPUT-CONTRACT] signals_posted=2 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=0 | dedup_skipped=0
CONTRACT-CONTRADICTION: NONE
EOF
git -C "$R10" add -- docs/agent-memory/notebooks/test-agent.md >/dev/null
GIT_AUTHOR_DATE="2026-08-06T15:10:00Z" GIT_COMMITTER_DATE="2026-08-06T15:10:00Z" \
  git -C "$R10" commit -q -m "chore(memory/test-agent): cycle synthetic plane-mismatch" -- docs/agent-memory/notebooks/test-agent.md
OUT10=$(bash "$DETECTOR" --agent-id test-agent --since-ts "$SINCE" --until-ts "$UNTIL" \
  --orch-state-file "$R10/docs/data/orch-state.json" --dedup-ledger-file "" \
  --repo-root "$R10")
RC10=$?
if [ "$RC10" -eq 1 ] && printf '%s' "$OUT10" | grep -q '^\[detect-analysis-only-exit\] DETECTED' \
   && printf '%s' "$OUT10" | grep -q 'contract=plane-mismatch'; then
  ok "T10-AC1-claim-vs-plane-mismatch-detected-independent-of-arithmetic (rc=$RC10)"
else
  bad "T10-AC1-claim-vs-plane-mismatch-detected-independent-of-arithmetic (rc=$RC10): $OUT10"
fi

# ── T11 — no [OUTPUT-CONTRACT] line at all in-window (most non-auditor leaf
# agents) -> contract=absent, never manufactures a false DETECTED; verdict
# falls back to the original zero-diff OR alone (notebook=1 -> PASS, same
# shape as T3). ─────────────────────────────────────────────────────────────
R11="$TMPROOT/t11"
_new_fixture "$R11"
{ echo ""; echo "## c2 · 2026-08-06T15:10Z"; echo "real cycle entry, no contract line published"; } >> "$R11/docs/agent-memory/notebooks/test-agent.md"
git -C "$R11" add -- docs/agent-memory/notebooks/test-agent.md >/dev/null
GIT_AUTHOR_DATE="2026-08-06T15:10:00Z" GIT_COMMITTER_DATE="2026-08-06T15:10:00Z" \
  git -C "$R11" commit -q -m "chore(memory/test-agent): cycle c2 no-contract-line" -- docs/agent-memory/notebooks/test-agent.md
OUT11=$(bash "$DETECTOR" --agent-id test-agent --since-ts "$SINCE" --until-ts "$UNTIL" \
  --orch-state-file "$R11/docs/data/orch-state.json" --dedup-ledger-file "" \
  --repo-root "$R11")
RC11=$?
if [ "$RC11" -eq 0 ] && printf '%s' "$OUT11" | grep -q '^\[detect-analysis-only-exit\] PASS' \
   && printf '%s' "$OUT11" | grep -q 'contract=absent'; then
  ok "T11-no-contract-line-published-does-not-manufacture-false-detect (rc=$RC11)"
else
  bad "T11-no-contract-line-published-does-not-manufacture-false-detect (rc=$RC11): $OUT11"
fi

# ── T12 (real-shape regression, found DURING this fix's own validation) —
# a SINGLE commit bundling TWO cycles' [OUTPUT-CONTRACT] lines, replicating
# the EXACT live shape of commit 569f79108: c80's fabricated line lands
# PHYSICALLY FIRST in the file/diff (newest_first notebook, freshly inserted
# at the top), c79's legit-but-stale line (a prior cycle whose own write
# never got committed separately — folded in here) lands physically SECOND.
# An earlier version of this fix picked only the LAST added
# [OUTPUT-CONTRACT] line in the diff (assuming "last write wins") and was
# fooled into reading c79's legit line instead of c80's fabricated one —
# this fixture is what caught that bug: checking EVERY claim line in-window
# (scripts/lib/output-contract-invariant.sh) is what actually fixes it. ────
R12="$TMPROOT/t12"
_new_fixture "$R12"
cat > "$R12/docs/agent-memory/notebooks/test-agent.md" <<'EOF'
## c77 · 2026-08-01T00:00Z
baseline entry, before the window under test
EOF
git -C "$R12" add -A >/dev/null
GIT_AUTHOR_DATE="2026-08-01T00:00:00Z" GIT_COMMITTER_DATE="2026-08-01T00:00:00Z" \
  git -C "$R12" commit -q -m "chore(memory/test-agent): baseline" -- docs/agent-memory/notebooks/test-agent.md
cat > "$R12/docs/agent-memory/notebooks/test-agent.md" <<'EOF'
## c80 · 2026-08-06T15:20Z
### fabricated cycle (physically FIRST — newest_first insert)
[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=0 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE

## c79 · 2026-08-06T15:15Z
### legit stale cycle, never separately committed, folded in here
[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0
CONTRACT-CONTRADICTION: NONE

## c77 · 2026-08-01T00:00Z
baseline entry, before the window under test
EOF
git -C "$R12" add -- docs/agent-memory/notebooks/test-agent.md >/dev/null
GIT_AUTHOR_DATE="2026-08-06T15:20:00Z" GIT_COMMITTER_DATE="2026-08-06T15:20:00Z" \
  git -C "$R12" commit -q -m "chore(memory/test-agent): cycle c80 bundled-with-stale-c79" -- docs/agent-memory/notebooks/test-agent.md
OUT12=$(bash "$DETECTOR" --agent-id test-agent --since-ts "$SINCE" --until-ts "$UNTIL" \
  --orch-state-file "$R12/docs/data/orch-state.json" --dedup-ledger-file "" \
  --repo-root "$R12")
RC12=$?
if [ "$RC12" -eq 1 ] && printf '%s' "$OUT12" | grep -q '^\[detect-analysis-only-exit\] DETECTED' \
   && printf '%s' "$OUT12" | grep -q 'contract=arithmetic-violation'; then
  ok "T12-bundled-commit-fabricated-line-not-masked-by-later-legit-line (rc=$RC12)"
else
  bad "T12-bundled-commit-fabricated-line-not-masked-by-later-legit-line (rc=$RC12): $OUT12"
fi

echo ""
echo "=== $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
