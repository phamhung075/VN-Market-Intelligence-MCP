#!/usr/bin/env bash
# scripts/audits/detect-analysis-only-exit.test.sh
#
# Regression fixture for scripts/audits/detect-analysis-only-exit.sh
# (FIX-LEAF-AGENT-ANALYSIS-ONLY-EXIT-NARRATES-INSTEAD-OF-EXECUTING, AC-5;
# widened by FIX-ANALYSIS-ONLY-EXIT-DETECTOR-OR-VERDICT-BLIND-TO-PARTIAL-
# WRITE-CYCLE, T8-T11; widened again by FIX-ANALYSIS-ONLY-EXIT-DETECTOR-
# INVERSE-PARTIAL-MISSED-NOTEBOOK-WRITE-PASSES, T13-T15 + corrected
# assertions on T2/T4/T6 — see that row's own AC-4/AC-5).
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
# CORRECTED T2/T4/T6 (FIX-ANALYSIS-ONLY-EXIT-DETECTOR-INVERSE-PARTIAL-
# MISSED-NOTEBOOK-WRITE-PASSES, AC-1/AC-4): T2 (signal_queue-only write) and
# T4 (ledger-only write) used to assert PASS — that assertion validated the
# exact defect this widening fixes (confirmed live 12x: a plane OTHER than
# notebook non-zero, notebook itself silently missing, used to defeat
# `all_zero` and PASS). Both now assert DETECTED via the new
# `mandatory_status=violation` gate (AC-4's RED-1/RED-2). T6 (--cycle-tag
# mode) is the same correction, and doubles as this row's AC-5 "does
# --cycle-tag mode share the blind spot" investigation — answered
# empirically: yes, closed by the same fix (Plane 1/mandatory-plane logic
# is independent of which Plane-3 matching mode is in use).
#
# T13-T15 (FIX-ANALYSIS-ONLY-EXIT-DETECTOR-INVERSE-PARTIAL-MISSED-NOTEBOOK-
# WRITE-PASSES, AC-1/AC-2/AC-4):
#   T13 — corrected NEGATIVE control: notebook AND signal_queue both
#              written (the actually-healthy version of what T2 used to
#              represent) -> stays PASS.
#   T14 GREEN — an agent whose `docs/agents/<id>/init.md` declares
#              `memory.notebook: none` (real live shape:
#              `docs/agents/refine_bctc_md/init.md:110`) -> same
#              notebook=0/signal_queue=1 shape as T2/RED-1, but PASSes,
#              because auto-derivation reads THIS agent's own contract, not
#              the artifact under test — guards AC-1's false-positive risk.
#   T15 — explicit `--mandatory-plane` caller override replaces
#              auto-derivation verbatim (the CLI contract
#              `docs/architecture-briefs/2026-08-12-fix-cowork-delivery-
#              proof-gate-artifact-conjunction-design.md` §2.2 already
#              anticipates for the sibling exogenous-gate row).
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

# ── T2 (RED-1, AC-4, FIX-ANALYSIS-ONLY-EXIT-DETECTOR-INVERSE-PARTIAL-
# MISSED-NOTEBOOK-WRITE-PASSES) — a real signal_queue row inside the window,
# notebook=0. This is the EXACT fixture that used to be this suite's own
# "negative control ... PASS" assertion (pre-fix) — confirmed live 12x
# (system-auditor/unified-agent/ops/news-scout) as the INVERSE partial-write
# blind spot the owning row exists to close: the notebook plane the fixture
# agent's contract mandates (auto-derived default, no `docs/agents/test-
# agent/init.md` in this scratch repo -> conservative mandatory=1) reads 0
# while signal_queue is genuinely non-zero. Must now DETECTED via
# `mandatory_status=violation`, independent of `all_zero` (signal_queue=1
# alone used to defeat `all_zero` and PASS this exact shape). ─────────────
R2="$TMPROOT/t2"
_new_fixture "$R2"
cat > "$R2/docs/data/orch-state.json" <<'EOF'
{"signal_queue":{"rows":[{"id":"test-20260806T151500-aaaa","from":"test-agent","to":"po","ts":"2026-08-06T15:15:00Z","summary":"real write"}]}}
EOF
OUT2=$(bash "$DETECTOR" --agent-id test-agent --since-ts "$SINCE" --until-ts "$UNTIL" \
  --orch-state-file "$R2/docs/data/orch-state.json" --dedup-ledger-file "" \
  --repo-root "$R2")
RC2=$?
if [ "$RC2" -eq 1 ] && printf '%s' "$OUT2" | grep -q '^\[detect-analysis-only-exit\] DETECTED' \
   && printf '%s' "$OUT2" | grep -q 'signal_queue=1' \
   && printf '%s' "$OUT2" | grep -q 'mandatory=notebook' \
   && printf '%s' "$OUT2" | grep -q 'mandatory_status=violation'; then
  ok "T2-RED1-signalqueue-nonzero-notebook-zero-detected (rc=$RC2)"
else
  bad "T2-RED1-signalqueue-nonzero-notebook-zero-detected (rc=$RC2): $OUT2"
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

# ── T4 (RED-2, AC-4, FIX-ANALYSIS-ONLY-EXIT-DETECTOR-INVERSE-PARTIAL-
# MISSED-NOTEBOOK-WRITE-PASSES) — ledger-only write inside the window,
# notebook=0. Same shape as T2/RED-1, via Plane 4 instead of Plane 3
# (confirmed live: news-scout 2026-08-07T04:00Z, ledger=1/notebook=0,
# PASSed pre-fix). Must now DETECTED via `mandatory_status=violation`. ────
R4="$TMPROOT/t4"
_new_fixture "$R4"
LEDGER4="$R4/docs/data/auditor-dedup-ledger.json"
echo '{"microservice_degraded:svc:A-21":{"ts":"2026-08-06T15:20:00Z","sev":2}}' > "$LEDGER4"
OUT4=$(bash "$DETECTOR" --agent-id test-agent --since-ts "$SINCE" --until-ts "$UNTIL" \
  --orch-state-file "$R4/docs/data/orch-state.json" --dedup-ledger-file "$LEDGER4" \
  --repo-root "$R4")
RC4=$?
if [ "$RC4" -eq 1 ] && printf '%s' "$OUT4" | grep -q '^\[detect-analysis-only-exit\] DETECTED' \
   && printf '%s' "$OUT4" | grep -q 'ledger=1' \
   && printf '%s' "$OUT4" | grep -q 'mandatory_status=violation'; then
  ok "T4-RED2-ledger-nonzero-notebook-zero-detected (rc=$RC4)"
else
  bad "T4-RED2-ledger-nonzero-notebook-zero-detected (rc=$RC4): $OUT4"
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
#     a row with a DIFFERENT tag inside the ts-window must NOT count. Also
#     doubles as AC-5's "does --cycle-tag mode have the same inverse-partial
#     blind spot" evidence (owning row's own investigation requirement,
#     answered empirically, not assumed): notebook=0 in this fixture, so the
#     mandatory-plane check must still force DETECTED even though Plane 3
#     is in --cycle-tag mode, not ts-window mode — proving the fix applies
#     unconditionally to both Plane-3 matching modes (Plane 1/mandatory-
#     plane logic is completely independent of --cycle-tag). The
#     `signal_queue=1` assertion is retained unchanged — it is what proves
#     the wrong-tag row was correctly excluded, orthogonal to the overall
#     verdict. ─────────────────────────────────────────────────────────────
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
if [ "$RC6" -eq 1 ] && printf '%s' "$OUT6" | grep -q '^\[detect-analysis-only-exit\] DETECTED' \
   && printf '%s' "$OUT6" | grep -q 'signal_queue=1' \
   && printf '%s' "$OUT6" | grep -q 'mandatory_status=violation'; then
  ok "T6-cycle-tag-exact-match-excludes-wrong-tag-AND-ac5-blind-spot-closed (rc=$RC6)"
else
  bad "T6-cycle-tag-exact-match-excludes-wrong-tag-AND-ac5-blind-spot-closed (rc=$RC6): $OUT6"
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

# ── T13 (corrected NEGATIVE control, AC-5 of the owning row) — a genuinely
# healthy cycle: the mandatory notebook plane IS written AND a real
# signal_queue row landed. Replaces the concept T2 used to carry pre-fix
# (T2 is now RED-1, above) with a fixture that actually satisfies the new
# mandatory-plane contract — must stay PASS. Proves the fix does not turn
# into a false-positive machine on a normal multi-plane cycle. ────────────
R13="$TMPROOT/t13"
_new_fixture "$R13"
{ echo ""; echo "## c2 · 2026-08-06T15:10Z"; echo "real cycle entry, healthy multi-plane write"; } >> "$R13/docs/agent-memory/notebooks/test-agent.md"
git -C "$R13" add -- docs/agent-memory/notebooks/test-agent.md >/dev/null
GIT_AUTHOR_DATE="2026-08-06T15:10:00Z" GIT_COMMITTER_DATE="2026-08-06T15:10:00Z" \
  git -C "$R13" commit -q -m "chore(memory/test-agent): cycle c2 healthy" -- docs/agent-memory/notebooks/test-agent.md
cat > "$R13/docs/data/orch-state.json" <<'EOF'
{"signal_queue":{"rows":[{"id":"test-20260806T151500-bbbb","from":"test-agent","to":"po","ts":"2026-08-06T15:15:00Z","summary":"real write"}]}}
EOF
OUT13=$(bash "$DETECTOR" --agent-id test-agent --since-ts "$SINCE" --until-ts "$UNTIL" \
  --orch-state-file "$R13/docs/data/orch-state.json" --dedup-ledger-file "" \
  --repo-root "$R13")
RC13=$?
if [ "$RC13" -eq 0 ] && printf '%s' "$OUT13" | grep -q '^\[detect-analysis-only-exit\] PASS' \
   && printf '%s' "$OUT13" | grep -q 'notebook=1' && printf '%s' "$OUT13" | grep -q 'signal_queue=1' \
   && printf '%s' "$OUT13" | grep -q 'mandatory_status=ok'; then
  ok "T13-healthy-notebook-plus-signalqueue-passes (rc=$RC13)"
else
  bad "T13-healthy-notebook-plus-signalqueue-passes (rc=$RC13): $OUT13"
fi

# ── T14 (GREEN control, AC-4, FIX-ANALYSIS-ONLY-EXIT-DETECTOR-INVERSE-
# PARTIAL-MISSED-NOTEBOOK-WRITE-PASSES) — an agent whose contract does NOT
# mandate a notebook write. Fixture mirrors the real live agent this
# exact shape is confirmed on, `docs/agents/refine_bctc_md/init.md:110`
# ("notebook: none ... Leaf subagent — stateless per invocation. No
# persistent notebook."): a `docs/agents/<agent-id>/init.md` with a
# `memory:` block whose `notebook:` field reads the literal `none`.
# notebook=0, signal_queue=1 — the EXACT SAME shape as T2/RED-1, but here
# it must stay PASS, because auto-derivation correctly reads this agent's
# OWN contract (not the artifact under test) and finds no notebook
# mandate at all. Guards AC-1's own false-positive risk. ──────────────────
R14="$TMPROOT/t14"
_new_fixture "$R14"
# _new_fixture seeds a "test-agent" notebook; this fixture's agent-id is
# distinct ("green-agent") specifically so no notebook file/history exists
# for it at all — the realistic shape for a genuinely notebook-less agent.
mkdir -p "$R14/docs/agents/green-agent"
cat > "$R14/docs/agents/green-agent/init.md" <<'EOF'
agent:
  id: green-agent
  memory:
    notebook: none
    append_every_cycle: false
    note: "Leaf subagent — stateless per invocation. No persistent notebook."
EOF
git -C "$R14" add -- docs/agents/green-agent/init.md >/dev/null
GIT_AUTHOR_DATE="2026-08-01T00:00:00Z" GIT_COMMITTER_DATE="2026-08-01T00:00:00Z" \
  git -C "$R14" commit -q -m "chore: seed green-agent init.md" -- docs/agents/green-agent/init.md
cat > "$R14/docs/data/orch-state.json" <<'EOF'
{"signal_queue":{"rows":[{"id":"green-20260806T151500-cccc","from":"green-agent","to":"po","ts":"2026-08-06T15:15:00Z","summary":"real write, no notebook mandate"}]}}
EOF
OUT14=$(bash "$DETECTOR" --agent-id green-agent --since-ts "$SINCE" --until-ts "$UNTIL" \
  --notebook-path "docs/agent-memory/notebooks/green-agent.md" \
  --orch-state-file "$R14/docs/data/orch-state.json" --dedup-ledger-file "" \
  --repo-root "$R14")
RC14=$?
if [ "$RC14" -eq 0 ] && printf '%s' "$OUT14" | grep -q '^\[detect-analysis-only-exit\] PASS' \
   && printf '%s' "$OUT14" | grep -q 'notebook=0' && printf '%s' "$OUT14" | grep -q 'signal_queue=1' \
   && printf '%s' "$OUT14" | grep -q 'mandatory=none' && printf '%s' "$OUT14" | grep -q 'mandatory_status=n/a'; then
  ok "T14-GREEN-agent-without-notebook-mandate-passes-despite-notebook-zero (rc=$RC14)"
else
  bad "T14-GREEN-agent-without-notebook-mandate-passes-despite-notebook-zero (rc=$RC14): $OUT14"
fi

# ── T15 (explicit --mandatory-plane override, AC-1/AC-2 contract check) —
# caller-supplied override must be used VERBATIM, replacing auto-derivation
# entirely (docs/architecture-briefs/2026-08-12-fix-cowork-delivery-proof-
# gate-artifact-conjunction-design.md §2.2's own anticipated contract:
# "Step 5.3 supplies the subset, the script never infers it from the
# artifact under test"). Same notebook=0/signal_queue=1 shape as T2/RED-1
# (which would auto-derive notebook=mandatory and DETECTED), but here the
# caller explicitly declares signal_queue (not notebook) as the mandatory
# plane -> must PASS, since signal_queue=1 satisfies the CALLER's own
# declared contract regardless of what auto-derivation would have picked. ──
R15="$TMPROOT/t15"
_new_fixture "$R15"
cat > "$R15/docs/data/orch-state.json" <<'EOF'
{"signal_queue":{"rows":[{"id":"test-20260806T151500-dddd","from":"test-agent","to":"po","ts":"2026-08-06T15:15:00Z","summary":"real write"}]}}
EOF
OUT15=$(bash "$DETECTOR" --agent-id test-agent --since-ts "$SINCE" --until-ts "$UNTIL" \
  --mandatory-plane signal_queue \
  --orch-state-file "$R15/docs/data/orch-state.json" --dedup-ledger-file "" \
  --repo-root "$R15")
RC15=$?
if [ "$RC15" -eq 0 ] && printf '%s' "$OUT15" | grep -q '^\[detect-analysis-only-exit\] PASS' \
   && printf '%s' "$OUT15" | grep -q 'notebook=0' && printf '%s' "$OUT15" | grep -q 'mandatory=signal_queue' \
   && printf '%s' "$OUT15" | grep -q 'mandatory_status=ok'; then
  ok "T15-explicit-mandatory-plane-override-replaces-auto-derivation (rc=$RC15)"
else
  bad "T15-explicit-mandatory-plane-override-replaces-auto-derivation (rc=$RC15): $OUT15"
fi

echo ""
echo "=== $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
