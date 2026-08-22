#!/usr/bin/env bash
# scripts/agents-flow/decision-journal-archive.test.sh — Regression test for
# decision-journal-archive.sh
#
# Sandboxes the script against a temp fixture tree (ORCH_STATE / ORCH_ARCHIVE_DIR /
# DECISIONS_DIR / ARCHIVE_DECISIONS_DIR env overrides, DJA_GIT_MV=0) so it NEVER
# touches the live docs/agent-memory/decisions or docs/data/orch trees. Covers:
#   - longest-match id derivation on a live prefix-collision shape
#     (CLOSED id is a literal string-prefix of an ACTIVE id)
#   - stdin-mode scoping (only ids piped in are eligible, even if other ids are closed)
#   - --all backfill mode (derives closed set from cold archive + hot stub)
#   - bare sprint-<id>.md AND agent-suffixed sprint-<id>-<agent>.md forms
#   - unknown/no-orch-record files left in place and counted
#   - status-based selection is NOT mtime-based (old active stays, new closed moves)
#   - idempotency: already-archived destination is skipped, never overwritten
#   - config-error exit codes

set -u

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "FAIL: cannot determine PROJECT_ROOT"; exit 1; }

SCRIPT="$PROJECT_ROOT/scripts/agents-flow/decision-journal-archive.sh"
SANDBOX="$(mktemp -d 2>/dev/null)"
[ -z "$SANDBOX" ] && { echo "FAIL: mktemp -d failed"; exit 1; }

cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

DECISIONS_DIR="$SANDBOX/decisions"
ARCHIVE_DECISIONS_DIR="$SANDBOX/archive-decisions"
ORCH_STATE="$SANDBOX/orch-state.json"
ORCH_ARCHIVE_DIR="$SANDBOX/orch-archive"
SIGNALS_DIR="$SANDBOX/signals"
mkdir -p "$DECISIONS_DIR" "$ORCH_ARCHIVE_DIR" "$SIGNALS_DIR"

PASS_COUNT=0
FAIL_COUNT=0
ok()  { echo "PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
bad() { echo "FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

old_ts() { # $1 = days ago -> touch -t compatible timestamp
  date -v-"$1"d +%Y%m%d%H%M 2>/dev/null || date -d "$1 days ago" +%Y%m%d%H%M
}

run_dja() { # $1 = mode ("--all" or ""), $2 = stdin ids (newline-separated string or "")
  local mode="$1" ids="$2"
  if [ "$mode" = "--all" ]; then
    # NOTE: these pre-existing runs exercise the ARCHIVING logic (longest-match,
    # active-guard, idempotency), not the AC-1 leg(a) safety valve added below —
    # DJA_ALLOW_ALL_UNGATED=1 keeps their pre-gate behavior/assertions intact.
    # The valve itself is covered by dedicated Run 8/9/10 fixtures further down.
    ORCH_STATE="$ORCH_STATE" ORCH_ARCHIVE_DIR="$ORCH_ARCHIVE_DIR" \
      DECISIONS_DIR="$DECISIONS_DIR" ARCHIVE_DECISIONS_DIR="$ARCHIVE_DECISIONS_DIR" \
      DJA_SIGNALS_DIR="$SIGNALS_DIR" \
      DJA_GIT_MV=0 DJA_ALLOW_ALL_UNGATED=1 bash "$SCRIPT" --all
  else
    printf '%s\n' "$ids" | \
      ORCH_STATE="$ORCH_STATE" ORCH_ARCHIVE_DIR="$ORCH_ARCHIVE_DIR" \
      DECISIONS_DIR="$DECISIONS_DIR" ARCHIVE_DECISIONS_DIR="$ARCHIVE_DECISIONS_DIR" \
      DJA_SIGNALS_DIR="$SIGNALS_DIR" \
      DJA_GIT_MV=0 bash "$SCRIPT"
  fi
}

# =============================================================================
# Fixture: orch-state.json (hot) — 1 hot-closed stub, 1 active, 1 active whose id
# is a literal string-extension of a closed id (the live OHLCV-UNIT-CONTAM /
# OHLCV-UNIT-CONTAM-WHOLEROW-LT1000 collision shape)
# =============================================================================
cat > "$ORCH_STATE" <<'EOF'
{
  "task_board": {
    "active_sprints": [
      { "id": "ACTIVE-ZETA", "tasks": [] },
      { "id": "PREFIX-COLLIDE-EXTENDED", "tasks": [] }
    ],
    "closed_sprints": [
      { "id": "CLOSED-ALPHA", "title": "alpha", "closed_at": "2026-07-01T00:00:00Z" },
      { "id": "PREFIX-COLLIDE", "title": "collide", "closed_at": "2026-07-01T00:00:00Z" }
    ]
  }
}
EOF

# =============================================================================
# Fixture: cold archive (docs/data/orch/archive/2026-07.json shape) — ids only
# discoverable via .closed_sprints[], .closed_sprint_goals[].sprint_id, and
# .done_tasks[].sprint — none of these appear in the hot file
# =============================================================================
cat > "$ORCH_ARCHIVE_DIR/2026-07.json" <<'EOF'
{
  "closed_sprints": [
    { "id": "CLOSED-BETA", "title": "beta" }
  ],
  "closed_sprint_goals": [
    { "sprint_id": "CLOSED-DELTA", "status": "DONE" }
  ],
  "done_tasks": [
    { "task_id": "T1", "sprint": "CLOSED-GAMMA" }
  ]
}
EOF

# =============================================================================
# Fixture journal files
# =============================================================================
echo "alpha journal"    > "$DECISIONS_DIR/sprint-CLOSED-ALPHA-po.md"
echo "beta journal"     > "$DECISIONS_DIR/sprint-CLOSED-BETA.md"              # bare form
echo "gamma journal"    > "$DECISIONS_DIR/sprint-CLOSED-GAMMA-qa.md"
echo "delta journal"    > "$DECISIONS_DIR/sprint-CLOSED-DELTA-architect.md"
echo "zeta journal"     > "$DECISIONS_DIR/sprint-ACTIVE-ZETA-dev.md"
echo "collide journal"  > "$DECISIONS_DIR/sprint-PREFIX-COLLIDE-po.md"
echo "collide-ext jrnl" > "$DECISIONS_DIR/sprint-PREFIX-COLLIDE-EXTENDED-qa.md"
echo "unknown journal"  > "$DECISIONS_DIR/sprint-NOORCH-UNKNOWN.md"

# Retention-window-is-NOT-mtime-based fixtures: an OLD active journal must stay,
# a freshly-touched closed journal must still move.
echo "old active"  > "$DECISIONS_DIR/sprint-ACTIVE-ZETA-old-agent.md"
touch -t "$(old_ts 400)" "$DECISIONS_DIR/sprint-ACTIVE-ZETA-old-agent.md"
echo "fresh closed" > "$DECISIONS_DIR/sprint-CLOSED-ALPHA-fresh-agent.md"
touch -t "$(old_ts 0)" "$DECISIONS_DIR/sprint-CLOSED-ALPHA-fresh-agent.md"

# =============================================================================
# Run 1: stdin mode — only CLOSED-ALPHA + PREFIX-COLLIDE piped in scope
# (CLOSED-BETA/GAMMA/DELTA are closed but NOT in this run's stdin scope)
# =============================================================================
OUT1="$(run_dja "" "$(printf 'CLOSED-ALPHA\nPREFIX-COLLIDE\n')" 2>&1)"
RC1=$?
echo "$OUT1"

# AC-4: exit 2, not 0 — sprint-NOORCH-UNKNOWN.md is a genuine no_orch_record
# this run (never resolves against any known id), so the third-state branch fires.
if [ "$RC1" -eq 2 ]; then ok "run1-exit-2-ac4-third-state"; else bad "run1-exit-2-ac4-third-state (rc=$RC1)"; fi

if [ -f "$ARCHIVE_DECISIONS_DIR/sprint-CLOSED-ALPHA-po.md" ] && [ ! -f "$DECISIONS_DIR/sprint-CLOSED-ALPHA-po.md" ]; then
  ok "run1-in-scope-closed-agent-suffixed-archived"
else
  bad "run1-in-scope-closed-agent-suffixed-archived"
fi

if [ -f "$ARCHIVE_DECISIONS_DIR/sprint-PREFIX-COLLIDE-po.md" ] && [ ! -f "$DECISIONS_DIR/sprint-PREFIX-COLLIDE-po.md" ]; then
  ok "run1-longest-match-shorter-closed-id-archived"
else
  bad "run1-longest-match-shorter-closed-id-archived"
fi

if [ -f "$DECISIONS_DIR/sprint-PREFIX-COLLIDE-EXTENDED-qa.md" ]; then
  ok "run1-longest-match-longer-active-id-kept-in-place"
else
  bad "run1-longest-match-longer-active-id-kept-in-place (prefix-collision false-positive move)"
fi

if [ -f "$DECISIONS_DIR/sprint-ACTIVE-ZETA-dev.md" ]; then
  ok "run1-active-sprint-journal-kept"
else
  bad "run1-active-sprint-journal-kept"
fi

if [ -f "$DECISIONS_DIR/sprint-CLOSED-BETA.md" ]; then
  ok "run1-closed-but-out-of-stdin-scope-kept (bare form)"
else
  bad "run1-closed-but-out-of-stdin-scope-kept (bare form)"
fi

if [ -f "$DECISIONS_DIR/sprint-CLOSED-GAMMA-qa.md" ] && [ -f "$DECISIONS_DIR/sprint-CLOSED-DELTA-architect.md" ]; then
  ok "run1-closed-but-out-of-stdin-scope-kept (archive-only ids)"
else
  bad "run1-closed-but-out-of-stdin-scope-kept (archive-only ids)"
fi

if [ -f "$DECISIONS_DIR/sprint-NOORCH-UNKNOWN.md" ]; then
  ok "run1-no-orch-record-left-in-place"
else
  bad "run1-no-orch-record-left-in-place (guessed a move)"
fi

if echo "$OUT1" | grep -q "no_orch_record=1"; then
  ok "run1-summary-reports-no-orch-record-count"
else
  bad "run1-summary-reports-no-orch-record-count"
fi

# Retention-window-is-NOT-mtime-based assertions
if [ -f "$DECISIONS_DIR/sprint-ACTIVE-ZETA-old-agent.md" ]; then
  ok "run1-old-mtime-active-journal-kept (status not age gates selection)"
else
  bad "run1-old-mtime-active-journal-kept (status not age gates selection)"
fi

if [ -f "$ARCHIVE_DECISIONS_DIR/sprint-CLOSED-ALPHA-fresh-agent.md" ]; then
  ok "run1-fresh-mtime-closed-journal-archived (status not age gates selection)"
else
  bad "run1-fresh-mtime-closed-journal-archived (status not age gates selection)"
fi

# =============================================================================
# Run 2: --all backfill mode — picks up the remaining closed ids
# (CLOSED-BETA / CLOSED-GAMMA / CLOSED-DELTA), still respects active guard
# =============================================================================
OUT2="$(run_dja "--all" "" 2>&1)"
RC2=$?
echo "$OUT2"

# AC-4: exit 2 — same still-unresolved NOORCH-UNKNOWN fixture persists into --all mode.
if [ "$RC2" -eq 2 ]; then ok "run2-exit-2-ac4-third-state"; else bad "run2-exit-2-ac4-third-state (rc=$RC2)"; fi

if [ -f "$ARCHIVE_DECISIONS_DIR/sprint-CLOSED-BETA.md" ] && [ ! -f "$DECISIONS_DIR/sprint-CLOSED-BETA.md" ]; then
  ok "run2-all-mode-archived-hot-closed-stub-bare-form"
else
  bad "run2-all-mode-archived-hot-closed-stub-bare-form"
fi

if [ -f "$ARCHIVE_DECISIONS_DIR/sprint-CLOSED-GAMMA-qa.md" ] && [ -f "$ARCHIVE_DECISIONS_DIR/sprint-CLOSED-DELTA-architect.md" ]; then
  ok "run2-all-mode-archived-cold-archive-only-ids"
else
  bad "run2-all-mode-archived-cold-archive-only-ids"
fi

if [ -f "$DECISIONS_DIR/sprint-ACTIVE-ZETA-dev.md" ] && [ -f "$DECISIONS_DIR/sprint-PREFIX-COLLIDE-EXTENDED-qa.md" ] && [ -f "$DECISIONS_DIR/sprint-ACTIVE-ZETA-old-agent.md" ]; then
  ok "run2-all-mode-still-respects-active-guard"
else
  bad "run2-all-mode-still-respects-active-guard"
fi

if [ -f "$DECISIONS_DIR/sprint-NOORCH-UNKNOWN.md" ]; then
  ok "run2-all-mode-still-leaves-unknown-in-place"
else
  bad "run2-all-mode-still-leaves-unknown-in-place"
fi

# =============================================================================
# Run 3: idempotent re-run of --all — nothing left eligible to move, clean no-op
# =============================================================================
OUT3="$(run_dja "--all" "" 2>&1)"
RC3=$?
echo "$OUT3"

# AC-4: exit 2 — NOORCH-UNKNOWN is still unresolved (idempotent no-op on the
# archiving side does not change the third-state branch's own verdict).
if [ "$RC3" -eq 2 ]; then ok "run3-idempotent-rerun-exit-2-ac4"; else bad "run3-idempotent-rerun-exit-2-ac4 (rc=$RC3)"; fi

if echo "$OUT3" | grep -q "archived=0"; then
  ok "run3-idempotent-rerun-zero-new-archives"
else
  bad "run3-idempotent-rerun-zero-new-archives"
fi

# =============================================================================
# Run 4: already-archived destination collision — SKIP-EXISTS, source untouched,
# destination not clobbered (idempotency safety net for a forced collision)
# =============================================================================
echo "dup source"      > "$DECISIONS_DIR/sprint-CLOSED-ALPHA-dup-agent.md"
echo "dup dest sentinel" > "$ARCHIVE_DECISIONS_DIR/sprint-CLOSED-ALPHA-dup-agent.md"
OUT4="$(run_dja "" "CLOSED-ALPHA" 2>&1)"
echo "$OUT4"

if grep -q "SKIP-EXISTS" <<<"$OUT4"; then
  ok "run4-collision-skip-exists-logged"
else
  bad "run4-collision-skip-exists-logged"
fi

if [ -f "$DECISIONS_DIR/sprint-CLOSED-ALPHA-dup-agent.md" ]; then
  ok "run4-collision-source-untouched"
else
  bad "run4-collision-source-untouched"
fi

if grep -q "dup dest sentinel" "$ARCHIVE_DECISIONS_DIR/sprint-CLOSED-ALPHA-dup-agent.md" 2>/dev/null; then
  ok "run4-collision-destination-not-clobbered"
else
  bad "run4-collision-destination-not-clobbered"
fi

# =============================================================================
# Run 5: config errors — exit 1, no crash
# =============================================================================
MISSING_STATE="$SANDBOX/does-not-exist.json"
ORCH_STATE="$MISSING_STATE" ORCH_ARCHIVE_DIR="$ORCH_ARCHIVE_DIR" \
  DECISIONS_DIR="$DECISIONS_DIR" ARCHIVE_DECISIONS_DIR="$ARCHIVE_DECISIONS_DIR" \
  DJA_SIGNALS_DIR="$SIGNALS_DIR" \
  DJA_GIT_MV=0 bash "$SCRIPT" --all >/dev/null 2>&1
RC5=$?
if [ "$RC5" -eq 1 ]; then
  ok "run5-missing-orch-state-exits-1"
else
  bad "run5-missing-orch-state-exits-1 (rc=$RC5)"
fi

MISSING_DECISIONS="$SANDBOX/does-not-exist-dir"
ORCH_STATE="$ORCH_STATE" ORCH_ARCHIVE_DIR="$ORCH_ARCHIVE_DIR" \
  DECISIONS_DIR="$MISSING_DECISIONS" ARCHIVE_DECISIONS_DIR="$ARCHIVE_DECISIONS_DIR" \
  DJA_SIGNALS_DIR="$SIGNALS_DIR" \
  DJA_GIT_MV=0 bash "$SCRIPT" --all >/dev/null 2>&1
RC6=$?
if [ "$RC6" -eq 1 ]; then
  ok "run6-missing-decisions-dir-exits-1"
else
  bad "run6-missing-decisions-dir-exits-1 (rc=$RC6)"
fi

# =============================================================================
# Run 7: --dry-run — reports WOULD-ARCHIVE, mutates NOTHING (no mv, no mkdir dest)
# =============================================================================
rm -rf "$ARCHIVE_DECISIONS_DIR"
echo "dry candidate" > "$DECISIONS_DIR/sprint-CLOSED-BETA-dryagent.md"
OUT7="$(ORCH_STATE="$ORCH_STATE" ORCH_ARCHIVE_DIR="$ORCH_ARCHIVE_DIR" \
  DECISIONS_DIR="$DECISIONS_DIR" ARCHIVE_DECISIONS_DIR="$ARCHIVE_DECISIONS_DIR" \
  DJA_SIGNALS_DIR="$SIGNALS_DIR" \
  DJA_GIT_MV=0 bash "$SCRIPT" --all --dry-run 2>&1)"
echo "$OUT7"

if [ -f "$DECISIONS_DIR/sprint-CLOSED-BETA-dryagent.md" ]; then
  ok "run7-dry-run-source-untouched"
else
  bad "run7-dry-run-source-untouched"
fi

if [ ! -e "$ARCHIVE_DECISIONS_DIR" ]; then
  ok "run7-dry-run-no-destination-created"
else
  bad "run7-dry-run-no-destination-created"
fi

if echo "$OUT7" | grep -q "WOULD-ARCHIVE file=sprint-CLOSED-BETA-dryagent.md"; then
  ok "run7-dry-run-reports-would-archive"
else
  bad "run7-dry-run-reports-would-archive"
fi

# =============================================================================
# Run 8 — AC-1 leg(a) safety valve: --all in LIVE (non-dry-run) mode with NO
# override REFUSES (non-zero exit, zero files moved, refusal names the
# would-move count + the override var). FIX-DJA-ALL-SAFETY-VALVE-ARMED-HAZARD.
# =============================================================================
echo "gate candidate" > "$DECISIONS_DIR/sprint-CLOSED-BETA-gate-agent.md"

OUT8="$(ORCH_STATE="$ORCH_STATE" ORCH_ARCHIVE_DIR="$ORCH_ARCHIVE_DIR" \
  DECISIONS_DIR="$DECISIONS_DIR" ARCHIVE_DECISIONS_DIR="$ARCHIVE_DECISIONS_DIR" \
  DJA_SIGNALS_DIR="$SIGNALS_DIR" \
  DJA_GIT_MV=0 bash "$SCRIPT" --all 2>&1)"
RC8=$?
echo "$OUT8"

if [ "$RC8" -ne 0 ]; then ok "run8-ungated-live-all-refuses-nonzero-exit"; else bad "run8-ungated-live-all-refuses-nonzero-exit (rc=$RC8)"; fi

if [ -f "$DECISIONS_DIR/sprint-CLOSED-BETA-gate-agent.md" ]; then
  ok "run8-ungated-live-all-source-untouched"
else
  bad "run8-ungated-live-all-source-untouched"
fi

if [ ! -e "$ARCHIVE_DECISIONS_DIR/sprint-CLOSED-BETA-gate-agent.md" ]; then
  ok "run8-ungated-live-all-nothing-archived"
else
  bad "run8-ungated-live-all-nothing-archived"
fi

if echo "$OUT8" | grep -q "REFUSED"; then
  ok "run8-ungated-live-all-refusal-message-present"
else
  bad "run8-ungated-live-all-refusal-message-present"
fi

if echo "$OUT8" | grep -Eq "REFUSED.*DJA_ALLOW_ALL_UNGATED"; then
  ok "run8-refusal-message-names-override-var"
else
  bad "run8-refusal-message-names-override-var"
fi

if echo "$OUT8" | grep -Eq "REFUSED.*[0-9]+ journal"; then
  ok "run8-refusal-message-names-wouldmove-count"
else
  bad "run8-refusal-message-names-wouldmove-count"
fi

# =============================================================================
# Run 9 — override unlocks live mode (leg a) exactly as pre-gate behavior
# =============================================================================
OUT9="$(ORCH_STATE="$ORCH_STATE" ORCH_ARCHIVE_DIR="$ORCH_ARCHIVE_DIR" \
  DECISIONS_DIR="$DECISIONS_DIR" ARCHIVE_DECISIONS_DIR="$ARCHIVE_DECISIONS_DIR" \
  DJA_SIGNALS_DIR="$SIGNALS_DIR" \
  DJA_GIT_MV=0 DJA_ALLOW_ALL_UNGATED=1 bash "$SCRIPT" --all 2>&1)"
RC9=$?
echo "$OUT9"

# AC-4: exit 2 — NOORCH-UNKNOWN is STILL unresolved at this point in the fixture
# lifecycle; the override unlocks the AC-1 gate, it does not touch AC-4's verdict.
if [ "$RC9" -eq 2 ]; then ok "run9-override-live-all-succeeds"; else bad "run9-override-live-all-succeeds (rc=$RC9)"; fi

if [ -f "$ARCHIVE_DECISIONS_DIR/sprint-CLOSED-BETA-gate-agent.md" ] && [ ! -f "$DECISIONS_DIR/sprint-CLOSED-BETA-gate-agent.md" ]; then
  ok "run9-override-live-all-archives-eligible-file"
else
  bad "run9-override-live-all-archives-eligible-file"
fi

# =============================================================================
# Run 10 — AC-2: --dry-run SUMMARY line is IDENTICAL with/without the override
# (the valve gates ONLY the live-mode path, never the preview path)
# =============================================================================
echo "dry gate candidate" > "$DECISIONS_DIR/sprint-CLOSED-GAMMA-drygate-agent.md"

OUT10_NOOVERRIDE_SUMMARY="$(ORCH_STATE="$ORCH_STATE" ORCH_ARCHIVE_DIR="$ORCH_ARCHIVE_DIR" \
  DECISIONS_DIR="$DECISIONS_DIR" ARCHIVE_DECISIONS_DIR="$ARCHIVE_DECISIONS_DIR" \
  DJA_SIGNALS_DIR="$SIGNALS_DIR" \
  DJA_GIT_MV=0 bash "$SCRIPT" --all --dry-run 2>&1 | grep '^\[decision-journal-archive\] SUMMARY')"

OUT10_OVERRIDE_SUMMARY="$(ORCH_STATE="$ORCH_STATE" ORCH_ARCHIVE_DIR="$ORCH_ARCHIVE_DIR" \
  DECISIONS_DIR="$DECISIONS_DIR" ARCHIVE_DECISIONS_DIR="$ARCHIVE_DECISIONS_DIR" \
  DJA_SIGNALS_DIR="$SIGNALS_DIR" \
  DJA_GIT_MV=0 DJA_ALLOW_ALL_UNGATED=1 bash "$SCRIPT" --all --dry-run 2>&1 | grep '^\[decision-journal-archive\] SUMMARY')"

echo "no-override: $OUT10_NOOVERRIDE_SUMMARY"
echo "override:    $OUT10_OVERRIDE_SUMMARY"

if [ "$OUT10_NOOVERRIDE_SUMMARY" = "$OUT10_OVERRIDE_SUMMARY" ] && [ -n "$OUT10_NOOVERRIDE_SUMMARY" ]; then
  ok "run10-dryrun-summary-unchanged-regardless-of-override"
else
  bad "run10-dryrun-summary-unchanged-regardless-of-override"
fi

if [ -f "$DECISIONS_DIR/sprint-CLOSED-GAMMA-drygate-agent.md" ]; then
  ok "run10-dryrun-still-mutates-nothing"
else
  bad "run10-dryrun-still-mutates-nothing"
fi

# =============================================================================
# §2.3 CLOSED-ID-DERIVATION CORRECTION — dedicated isolated sandbox (SANDBOX2)
# FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE
# =============================================================================
SANDBOX2="$(mktemp -d 2>/dev/null)"
[ -z "$SANDBOX2" ] && { echo "FAIL: mktemp -d failed (SANDBOX2)"; exit 1; }
trap 'rm -rf "$SANDBOX" "$SANDBOX2"' EXIT

DECISIONS_DIR2="$SANDBOX2/decisions"
ARCHIVE_DECISIONS_DIR2="$SANDBOX2/archive-decisions"
ORCH_STATE2="$SANDBOX2/orch-state.json"
ORCH_ARCHIVE_DIR2="$SANDBOX2/orch-archive"
SIGNALS_DIR2="$SANDBOX2/signals"
mkdir -p "$DECISIONS_DIR2" "$ORCH_ARCHIVE_DIR2" "$SIGNALS_DIR2"

# Three ids resolvable ONLY via the weak `.done_tasks[].sprint` cold-archive
# signal (never a genuine closed_sprints[]/closed_sprint_goals record):
#   WEAK-CLOSED-BUT-OPEN  — blocked by §2.3(a): a hot READY (non-terminal) row
#                           still references it.
#   WEAK-CLOSED-GOAL-LIVE — blocked by §2.3(b): a hot sprint_goal entry status
#                           "active" (non-terminal), zero task refs.
#   WEAK-CLOSED-SAFE      — no blocking condition at all — regression baseline,
#                           must still archive (unaffected behavior).
cat > "$ORCH_STATE2" <<'EOF'
{
  "task_board": {
    "active_sprints": [],
    "closed_sprints": [],
    "backlog": [],
    "ready": [
      { "id": "OPEN-TASK-BLOCKS-WEAK", "status": "READY", "sprint": "WEAK-CLOSED-BUT-OPEN" }
    ]
  },
  "sprint_goal": {
    "entries": [
      { "sprint_id": "WEAK-CLOSED-GOAL-LIVE", "status": "active" }
    ]
  }
}
EOF

cat > "$ORCH_ARCHIVE_DIR2/2026-07.json" <<'EOF'
{
  "done_tasks": [
    { "task_id": "T-WEAK-1", "sprint": "WEAK-CLOSED-BUT-OPEN" },
    { "task_id": "T-WEAK-2", "sprint": "WEAK-CLOSED-GOAL-LIVE" },
    { "task_id": "T-WEAK-3", "sprint": "WEAK-CLOSED-SAFE" }
  ]
}
EOF

echo "weak-open journal"  > "$DECISIONS_DIR2/sprint-WEAK-CLOSED-BUT-OPEN-po.md"
echo "weak-goal journal"  > "$DECISIONS_DIR2/sprint-WEAK-CLOSED-GOAL-LIVE-po.md"
echo "weak-safe journal"  > "$DECISIONS_DIR2/sprint-WEAK-CLOSED-SAFE-po.md"

OUT11="$(ORCH_STATE="$ORCH_STATE2" ORCH_ARCHIVE_DIR="$ORCH_ARCHIVE_DIR2" \
  DECISIONS_DIR="$DECISIONS_DIR2" ARCHIVE_DECISIONS_DIR="$ARCHIVE_DECISIONS_DIR2" \
  DJA_SIGNALS_DIR="$SIGNALS_DIR2" \
  DJA_GIT_MV=0 DJA_ALLOW_ALL_UNGATED=1 bash "$SCRIPT" --all 2>&1)"
echo "$OUT11"

if [ -f "$DECISIONS_DIR2/sprint-WEAK-CLOSED-BUT-OPEN-po.md" ]; then
  ok "run11-s2.3a-nonterminal-hot-ref-blocks-weak-signal-archive"
else
  bad "run11-s2.3a-nonterminal-hot-ref-blocks-weak-signal-archive (archived despite open READY row)"
fi

if [ -f "$DECISIONS_DIR2/sprint-WEAK-CLOSED-GOAL-LIVE-po.md" ]; then
  ok "run11-s2.3b-nonterminal-goal-entry-blocks-weak-signal-archive"
else
  bad "run11-s2.3b-nonterminal-goal-entry-blocks-weak-signal-archive (archived despite active goal entry)"
fi

if [ -f "$ARCHIVE_DECISIONS_DIR2/sprint-WEAK-CLOSED-SAFE-po.md" ] && [ ! -f "$DECISIONS_DIR2/sprint-WEAK-CLOSED-SAFE-po.md" ]; then
  ok "run11-s2.3-regression-baseline-genuinely-safe-id-still-archives"
else
  bad "run11-s2.3-regression-baseline-genuinely-safe-id-still-archives"
fi

if echo "$OUT11" | grep -q "reason=closed-not-in-scope-this-run id=WEAK-CLOSED-BUT-OPEN"; then
  ok "run11-s2.3a-skip-reason-logged"
else
  bad "run11-s2.3a-skip-reason-logged"
fi

if echo "$OUT11" | grep -q "reason=closed-not-in-scope-this-run id=WEAK-CLOSED-GOAL-LIVE"; then
  ok "run11-s2.3b-skip-reason-logged"
else
  bad "run11-s2.3b-skip-reason-logged"
fi

# =============================================================================
# AC-4 THIRD-STATE BRANCH — aggregated signal, dedup by unresolved-id-set hash
# =============================================================================
echo "orphan journal" > "$DECISIONS_DIR2/sprint-TOTALLY-UNKNOWN-ID-po.md"

OUT12="$(ORCH_STATE="$ORCH_STATE2" ORCH_ARCHIVE_DIR="$ORCH_ARCHIVE_DIR2" \
  DECISIONS_DIR="$DECISIONS_DIR2" ARCHIVE_DECISIONS_DIR="$ARCHIVE_DECISIONS_DIR2" \
  DJA_SIGNALS_DIR="$SIGNALS_DIR2" \
  DJA_GIT_MV=0 DJA_ALLOW_ALL_UNGATED=1 bash "$SCRIPT" --all 2>&1)"
RC12=$?
echo "$OUT12"

if [ "$RC12" -eq 2 ]; then ok "run12-ac4-exit-2-on-unresolved-id"; else bad "run12-ac4-exit-2-on-unresolved-id (rc=$RC12)"; fi

SIGNAL_COUNT_1="$(find "$SIGNALS_DIR2" -maxdepth 1 -name 'sprint-registry-unresolved-ids-*.json' 2>/dev/null | wc -l | tr -d ' ')"
if [ "$SIGNAL_COUNT_1" = "1" ]; then
  ok "run12-ac4-writes-exactly-one-signal"
else
  bad "run12-ac4-writes-exactly-one-signal (found $SIGNAL_COUNT_1)"
fi

SIGNAL_FILE_1="$(find "$SIGNALS_DIR2" -maxdepth 1 -name 'sprint-registry-unresolved-ids-*.json' 2>/dev/null | head -1)"
if [ -n "$SIGNAL_FILE_1" ] && grep -q "TOTALLY-UNKNOWN-ID" "$SIGNAL_FILE_1" 2>/dev/null; then
  ok "run12-ac4-signal-payload-names-the-unresolved-id"
else
  bad "run12-ac4-signal-payload-names-the-unresolved-id"
fi

# Re-run with the SAME unresolved set — dedup, no second signal file, still exit 2.
OUT13="$(ORCH_STATE="$ORCH_STATE2" ORCH_ARCHIVE_DIR="$ORCH_ARCHIVE_DIR2" \
  DECISIONS_DIR="$DECISIONS_DIR2" ARCHIVE_DECISIONS_DIR="$ARCHIVE_DECISIONS_DIR2" \
  DJA_SIGNALS_DIR="$SIGNALS_DIR2" \
  DJA_GIT_MV=0 DJA_ALLOW_ALL_UNGATED=1 bash "$SCRIPT" --all 2>&1)"
RC13=$?
echo "$OUT13"

if [ "$RC13" -eq 2 ]; then ok "run13-ac4-repeat-run-still-exit-2"; else bad "run13-ac4-repeat-run-still-exit-2 (rc=$RC13)"; fi

SIGNAL_COUNT_2="$(find "$SIGNALS_DIR2" -maxdepth 1 -name 'sprint-registry-unresolved-ids-*.json' 2>/dev/null | wc -l | tr -d ' ')"
if [ "$SIGNAL_COUNT_2" = "1" ]; then
  ok "run13-ac4-dedup-no-second-signal-for-unchanged-set"
else
  bad "run13-ac4-dedup-no-second-signal-for-unchanged-set (found $SIGNAL_COUNT_2)"
fi

if echo "$OUT13" | grep -q "AC4-SIGNAL dedup-skip"; then
  ok "run13-ac4-dedup-skip-message-logged"
else
  bad "run13-ac4-dedup-skip-message-logged"
fi

# A DIFFERENT unresolved set (second orphan added) must produce a NEW, distinct signal.
echo "second orphan journal" > "$DECISIONS_DIR2/sprint-ANOTHER-UNKNOWN-ID-po.md"
OUT14="$(ORCH_STATE="$ORCH_STATE2" ORCH_ARCHIVE_DIR="$ORCH_ARCHIVE_DIR2" \
  DECISIONS_DIR="$DECISIONS_DIR2" ARCHIVE_DECISIONS_DIR="$ARCHIVE_DECISIONS_DIR2" \
  DJA_SIGNALS_DIR="$SIGNALS_DIR2" \
  DJA_GIT_MV=0 DJA_ALLOW_ALL_UNGATED=1 bash "$SCRIPT" --all 2>&1)"
RC14=$?
echo "$OUT14"

if [ "$RC14" -eq 2 ]; then ok "run14-ac4-changed-set-still-exit-2"; else bad "run14-ac4-changed-set-still-exit-2 (rc=$RC14)"; fi

SIGNAL_COUNT_3="$(find "$SIGNALS_DIR2" -maxdepth 1 -name 'sprint-registry-unresolved-ids-*.json' 2>/dev/null | wc -l | tr -d ' ')"
if [ "$SIGNAL_COUNT_3" = "2" ]; then
  ok "run14-ac4-changed-unresolved-set-writes-a-new-distinct-signal"
else
  bad "run14-ac4-changed-unresolved-set-writes-a-new-distinct-signal (found $SIGNAL_COUNT_3)"
fi

# =============================================================================
# AC-4 clean path — zero no_orch_record this run — no signal, exit 0
# =============================================================================
SANDBOX3="$(mktemp -d 2>/dev/null)"
[ -z "$SANDBOX3" ] && { echo "FAIL: mktemp -d failed (SANDBOX3)"; exit 1; }
trap 'rm -rf "$SANDBOX" "$SANDBOX2" "$SANDBOX3"' EXIT
DECISIONS_DIR3="$SANDBOX3/decisions"
ORCH_ARCHIVE_DIR3="$SANDBOX3/orch-archive"
SIGNALS_DIR3="$SANDBOX3/signals"
ORCH_STATE3="$SANDBOX3/orch-state.json"
mkdir -p "$DECISIONS_DIR3" "$ORCH_ARCHIVE_DIR3" "$SIGNALS_DIR3"
cat > "$ORCH_STATE3" <<'EOF'
{ "task_board": { "active_sprints": [{ "id": "CLEAN-ACTIVE", "tasks": [] }], "closed_sprints": [] } }
EOF
echo "clean journal" > "$DECISIONS_DIR3/sprint-CLEAN-ACTIVE-po.md"

OUT15="$(ORCH_STATE="$ORCH_STATE3" ORCH_ARCHIVE_DIR="$ORCH_ARCHIVE_DIR3" \
  DECISIONS_DIR="$DECISIONS_DIR3" ARCHIVE_DECISIONS_DIR="$SANDBOX3/archive-decisions" \
  DJA_SIGNALS_DIR="$SIGNALS_DIR3" \
  DJA_GIT_MV=0 DJA_ALLOW_ALL_UNGATED=1 bash "$SCRIPT" --all 2>&1)"
RC15=$?
echo "$OUT15"

if [ "$RC15" -eq 0 ]; then ok "run15-ac4-clean-run-exit-0"; else bad "run15-ac4-clean-run-exit-0 (rc=$RC15)"; fi

SIGNAL_COUNT_4="$(find "$SIGNALS_DIR3" -maxdepth 1 -name 'sprint-registry-unresolved-ids-*.json' 2>/dev/null | wc -l | tr -d ' ')"
if [ "$SIGNAL_COUNT_4" = "0" ]; then
  ok "run15-ac4-clean-run-no-signal-written"
else
  bad "run15-ac4-clean-run-no-signal-written (found $SIGNAL_COUNT_4)"
fi

echo "========================================"
echo "Test Results: PASS=$PASS_COUNT FAIL=$FAIL_COUNT"
echo "========================================"

[ "$FAIL_COUNT" -gt 0 ] && exit 1
exit 0
