#!/usr/bin/env bash
# scripts/agents-flow/cowork-tick-postflight.test.sh
#
# Regression test for UC-CDC-P7 Phase 2b — cowork-tick-postflight.sh's 3 sub-steps
# (last_fired batch write / cycle-snapshot assembly / docs/signals/processed/ retention
# sweep), run against isolated tmp fixtures (never the real project data).
#
# Run:
#   bash scripts/agents-flow/cowork-tick-postflight.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: UC-CDC-P7
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
POSTFLIGHT_SH="$SCRIPT_DIR/cowork-tick-postflight.sh"

if [ ! -f "$POSTFLIGHT_SH" ]; then
  echo "ERROR: postflight script not found at $POSTFLIGHT_SH" >&2
  exit 1
fi

PASS=0
FAIL=0

check() {
  local label="$1" cond="$2"
  if [ "$cond" = "true" ]; then
    echo "PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label"
    FAIL=$((FAIL + 1))
  fi
}

# ── Isolated fixture root — a real (but throwaway) git repo, so the retention
#    sweep's `git rm` path is exercised for real, not just the non-git fallback. ──
TMPDIR_TEST=$(mktemp -d /private/tmp/cowork-postflight-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

mkdir -p "$TMPDIR_TEST/docs/data" "$TMPDIR_TEST/docs/signals/processed"
git -C "$TMPDIR_TEST" init -q
git -C "$TMPDIR_TEST" config user.email "test@example.com"
git -C "$TMPDIR_TEST" config user.name "test"

cat > "$TMPDIR_TEST/docs/data/cowork-schedule.json" <<'JSON'
{"slots":[{"slot_id":"news-scout-offhours","last_fired":null},{"slot_id":"market-watcher-eod","last_fired":null}]}
JSON
# Permanent, never-swept anchor file — `git rm` prunes now-empty LEADING directories
# (verified: removing the last tracked file under docs/signals/processed/ also deletes
# docs/signals/ itself if nothing else lives there). This anchor keeps both directories
# alive across every retention-sweep test below, matching real production shape (processed/
# always holds files from other agents too, never goes fully empty from one sweep).
echo '{"from":"other-agent","note":"never matched by the cowork-team-* glob, never swept"}' > "$TMPDIR_TEST/docs/signals/processed/.keep-other-agent.json"
git -C "$TMPDIR_TEST" add docs/data/cowork-schedule.json docs/signals/processed/.keep-other-agent.json
git -C "$TMPDIR_TEST" commit -q -m "fixture: schedule + anchor"

export ROOT="$TMPDIR_TEST"
export SCHED_FILE="$TMPDIR_TEST/docs/data/cowork-schedule.json"
export SIGNALS_DIR="$TMPDIR_TEST/docs/signals"

# ── T1: last_fired step — verbatim delegation to cowork-write-last-fired.js ────────────
export FIRED_AT="2026-08-14T06:00:00Z"
OUT=$(bash "$POSTFLIGHT_SH" news-scout-offhours)
RC=$?
check "T1 exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T1 stdout parses as JSON" "$(printf '%s' "$OUT" | jq -e . >/dev/null 2>&1 && echo true || echo false)"
check "T1 last_fired.ran=true" "$([ "$(printf '%s' "$OUT" | jq -r '.last_fired.ran')" = "true" ] && echo true || echo false)"
check "T1 last_fired.result.ok=true" "$([ "$(printf '%s' "$OUT" | jq -r '.last_fired.result.ok')" = "true" ] && echo true || echo false)"
UPDATED_FIRED=$(jq -r '.slots[] | select(.slot_id=="news-scout-offhours") | .last_fired' "$SCHED_FILE")
check "T1 schedule.json actually updated (real write, not narrated)" "$([ "$UPDATED_FIRED" = "2026-08-14T06:00:00Z" ] && echo true || echo false)"
check "T1 sibling slot untouched" "$([ "$(jq -r '.slots[] | select(.slot_id=="market-watcher-eod") | .last_fired' "$SCHED_FILE")" = "null" ] && echo true || echo false)"

# ── T2: last_fired step — zero slot_id args (silent-exit path, nothing to stamp) ───────
export SKIP_SNAPSHOT=1
export SKIP_RETENTION=1
OUT=$(bash "$POSTFLIGHT_SH")
RC=$?
check "T2 exit=0 even with zero args" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T2 last_fired.ran=false (nothing to stamp)" "$([ "$(printf '%s' "$OUT" | jq -r '.last_fired.ran')" = "false" ] && echo true || echo false)"
unset SKIP_SNAPSHOT
unset SKIP_RETENTION

# ── T3: last_fired step — unknown slot_id (caller bug) surfaces as non-fatal ok:false ──
export SKIP_SNAPSHOT=1
export SKIP_RETENTION=1
OUT=$(bash "$POSTFLIGHT_SH" totally-unknown-slot-id)
RC=$?
check "T3 exit=0 (non-fatal even on caller-bug slot id)" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T3 last_fired.ok=false surfaced" "$([ "$(printf '%s' "$OUT" | jq -r '.last_fired.ok')" = "false" ] && echo true || echo false)"
unset SKIP_SNAPSHOT
unset SKIP_RETENTION
unset FIRED_AT

# ── T4: snapshot step — stage files present -> assembles cycle-snapshot-<tick>.json ────
export SKIP_RETENTION=1
export FILE_TICK="09:15"
echo '{"market_context":{"regime_status":"bull"}}' > "$TMPDIR_TEST/docs/data/.cycle-snapshot-09:15.mc.stage"
echo '{"macro":"snapshot"}' > "$TMPDIR_TEST/docs/data/.cycle-snapshot-09:15.macro.stage"
OUT=$(bash "$POSTFLIGHT_SH" news-scout-offhours 2>/dev/null)
check "T4 snapshot.ran=true" "$([ "$(printf '%s' "$OUT" | jq -r '.snapshot.ran')" = "true" ] && echo true || echo false)"
check "T4 snapshot.ok=true" "$([ "$(printf '%s' "$OUT" | jq -r '.snapshot.ok')" = "true" ] && echo true || echo false)"
check "T4 cycle-snapshot-09:15.json written to disk" "$([ -f "$TMPDIR_TEST/docs/data/cycle-snapshot-09:15.json" ] && echo true || echo false)"
check "T4 assembled snapshot has market_context.regime_status" "$([ "$(jq -r '.market_context.regime_status' "$TMPDIR_TEST/docs/data/cycle-snapshot-09:15.json")" = "bull" ] && echo true || echo false)"
check "T4 stage files cleaned up after assembly" "$([ ! -f "$TMPDIR_TEST/docs/data/.cycle-snapshot-09:15.mc.stage" ] && echo true || echo false)"
rm -f "$TMPDIR_TEST/docs/data/cycle-snapshot-09:15.json"
unset SKIP_RETENTION FILE_TICK

# ── T5: snapshot step — stage files absent -> graceful skip, non-fatal ─────────────────
export SKIP_RETENTION=1
export FILE_TICK="23:45"
OUT=$(bash "$POSTFLIGHT_SH" 2>/dev/null)
check "T5 exit=0 with missing stage files" "$([ $? -eq 0 ] && echo true || echo false)"
check "T5 snapshot.ran=false (stage files missing)" "$([ "$(printf '%s' "$OUT" | jq -r '.snapshot.ran')" = "false" ] && echo true || echo false)"
unset SKIP_RETENTION FILE_TICK

# ── T6: retention sweep — stamped + aged-out processed/cowork-team-*.json IS removed ───
export SKIP_SNAPSHOT=1
STAMPED_OLD="$TMPDIR_TEST/docs/signals/processed/cowork-team-2020-01-01T00:00:00Z.json"
echo '{"from":"cowork-team","_processed":{"processedAt":"2020-01-02T00:00:00Z"}}' > "$STAMPED_OLD"
git -C "$TMPDIR_TEST" add "docs/signals/processed/cowork-team-2020-01-01T00:00:00Z.json"
git -C "$TMPDIR_TEST" commit -q -m "fixture: aged stamped signal"
touch -t 202001010000 "$STAMPED_OLD" 2>/dev/null || touch -d "2020-01-01" "$STAMPED_OLD" 2>/dev/null || true
OUT=$(bash "$POSTFLIGHT_SH")
check "T6 retention.deleted=1" "$([ "$(printf '%s' "$OUT" | jq -r '.retention.deleted')" -eq 1 ] && echo true || echo false)"
check "T6 file actually removed from disk" "$([ ! -f "$STAMPED_OLD" ] && echo true || echo false)"
# git rm STAGES the deletion (index) — it does not commit (same contract as the existing
# scripts/audits/purge-legacy-processed-signals.sh --live precedent: "git rm'd N file(s).
# Review with git status, then commit with explicit paths"). A clean `git status --porcelain`
# would mean the file was `rm -f`'d outside git's index (untracked-deletion dirty-tree class
# this whole codebase specifically avoids) — so the CORRECT assertion is "staged for deletion"
# (`D ` in porcelain short-status), not "no status at all".
check "T6 removal used git rm (staged deletion 'D ', never a bare untracked-deletion)" "$([ "$(git -C "$TMPDIR_TEST" status --porcelain -- "docs/signals/processed/cowork-team-2020-01-01T00:00:00Z.json")" = "D  docs/signals/processed/cowork-team-2020-01-01T00:00:00Z.json" ] && echo true || echo false)"
git -C "$TMPDIR_TEST" commit -q -m "test cleanup: commit T6's staged deletion"
unset SKIP_SNAPSHOT

# ── T7: retention sweep — UNSTAMPED processed/ file, even if old, is NEVER touched ─────
export SKIP_SNAPSHOT=1
UNSTAMPED_OLD="$TMPDIR_TEST/docs/signals/processed/cowork-team-2020-02-02T00:00:00Z.json"
echo '{"from":"cowork-team"}' > "$UNSTAMPED_OLD"
touch -t 202001010000 "$UNSTAMPED_OLD" 2>/dev/null || touch -d "2020-01-01" "$UNSTAMPED_OLD" 2>/dev/null || true
OUT=$(bash "$POSTFLIGHT_SH")
check "T7 unstamped file survives (retention.deleted=0)" "$([ "$(printf '%s' "$OUT" | jq -r '.retention.deleted')" -eq 0 ] && echo true || echo false)"
check "T7 unstamped file still on disk" "$([ -f "$UNSTAMPED_OLD" ] && echo true || echo false)"
rm -f "$UNSTAMPED_OLD"
unset SKIP_SNAPSHOT

# ── T8: retention sweep — recent stamped file (within window) is NEVER touched ─────────
export SKIP_SNAPSHOT=1
RECENT="$TMPDIR_TEST/docs/signals/processed/cowork-team-recent.json"
echo '{"from":"cowork-team","processedAt":"2026-08-14T00:00:00Z"}' > "$RECENT"
OUT=$(bash "$POSTFLIGHT_SH")
check "T8 recent stamped file survives" "$([ -f "$RECENT" ] && echo true || echo false)"
rm -f "$RECENT"
unset SKIP_SNAPSHOT

# ── T9: retention sweep — LIVE inbox (docs/signals/ root, NOT processed/) is NEVER
#     touched, no matter how old or stamped — the sweep's whole safety design is that it
#     only ever looks inside processed/. ──
export SKIP_SNAPSHOT=1
LIVE_OLD="$TMPDIR_TEST/docs/signals/cowork-team-2020-03-03T00:00:00Z.json"
echo '{"from":"cowork-team","_processed":{"processedAt":"2020-01-02T00:00:00Z"}}' > "$LIVE_OLD"
touch -t 202001010000 "$LIVE_OLD" 2>/dev/null || touch -d "2020-01-01" "$LIVE_OLD" 2>/dev/null || true
bash "$POSTFLIGHT_SH" >/dev/null
check "T9 live-inbox file (docs/signals/ root) never touched by the sweep" "$([ -f "$LIVE_OLD" ] && echo true || echo false)"
rm -f "$LIVE_OLD"
unset SKIP_SNAPSHOT

# ── T10: SKIP_RETENTION=1 disables the sweep entirely (test-isolation seam) ────────────
export SKIP_SNAPSHOT=1
export SKIP_RETENTION=1
OUT=$(bash "$POSTFLIGHT_SH")
check "T10 retention.ran=false when SKIP_RETENTION=1" "$([ "$(printf '%s' "$OUT" | jq -r '.retention.ran')" = "false" ] && echo true || echo false)"
unset SKIP_SNAPSHOT SKIP_RETENTION

# ── T11: full CLI contract — all 3 top-level keys always present ───────────────────────
export SKIP_SNAPSHOT=1
export SKIP_RETENTION=1
OUT=$(bash "$POSTFLIGHT_SH" news-scout-offhours)
check "T11 has last_fired key" "$(printf '%s' "$OUT" | jq 'has("last_fired")')"
check "T11 has snapshot key" "$(printf '%s' "$OUT" | jq 'has("snapshot")')"
check "T11 has retention key" "$(printf '%s' "$OUT" | jq 'has("retention")')"
unset SKIP_SNAPSHOT SKIP_RETENTION

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
