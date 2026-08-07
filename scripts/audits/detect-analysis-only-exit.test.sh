#!/usr/bin/env bash
# scripts/audits/detect-analysis-only-exit.test.sh
#
# Regression fixture for scripts/audits/detect-analysis-only-exit.sh
# (FIX-LEAF-AGENT-ANALYSIS-ONLY-EXIT-NARRATES-INSTEAD-OF-EXECUTING, AC-5).
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

echo ""
echo "=== $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
