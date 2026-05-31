#!/usr/bin/env bash
# Self-contained cowork-team dispatcher tick handler — blackout-safe.
# Runs matcher 3x. On unanimous slots:[] -> writes silent telemetry + commits.
# On ANY non-empty slots or disagreement -> writes /tmp/FIRE_PENDING.txt, NO commit, exit 3.
set -u
ROOT=/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP
cd "$ROOT" || exit 9
rm -f /tmp/FIRE_PENDING.txt

NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
ACTUAL_M=$(date -u +%M | sed 's/^0//'); ACTUAL_M=${ACTUAL_M:-0}
M=$(( (ACTUAL_M / 15) * 15 ))
NOMINAL=$(date -u +%Y%m%dT%H)$(printf '%02d' $M)00Z
FIRE_TIME=$(date -u +%Y%m%dT%H%M00Z)

R1=$(node scripts/agents-flow/cowork-match-slots.js 2>&1)
R2=$(node scripts/agents-flow/cowork-match-slots.js 2>&1)
R3=$(node scripts/agents-flow/cowork-match-slots.js 2>&1)

# Extract slots array from each
S1=$(printf '%s' "$R1" | grep -o '"slots":\[[^]]*\]' | head -1)
S2=$(printf '%s' "$R2" | grep -o '"slots":\[[^]]*\]' | head -1)
S3=$(printf '%s' "$R3" | grep -o '"slots":\[[^]]*\]' | head -1)
DRIFT=$(printf '%s' "$R1" | grep -o '"drift_min":[0-9]*' | grep -o '[0-9]*' | head -1)
DRIFT=${DRIFT:-0}

EMPTY='"slots":[]'

if [ "$S1" = "$EMPTY" ] && [ "$S2" = "$EMPTY" ] && [ "$S3" = "$EMPTY" ]; then
  OUT="docs/signals/cowork-team-${FIRE_TIME}.json"
  cat > "$OUT" <<JSON
{
  "from": "cowork-team",
  "to": "dev-team",
  "type": "cowork-fire",
  "payload": {
    "fire_time": "${FIRE_TIME}",
    "nominal_tick": "${NOMINAL}",
    "matched_slots": [],
    "won_slots": [],
    "held_by_other": [],
    "all_held": false,
    "spawned": [],
    "silent": true,
    "drift_min": ${DRIFT},
    "errors": [],
    "note": "Auto-silent (stdout-blackout safe). Matcher slots:[] UNANIMOUS x3 at clock ${NOW}, nominal floors to ${NOMINAL}. NO match -> no lock, no spawn, nothing in flight. Next NON-silent: 16:00Z off-hours fan-out (news-scout-offhours + market-watcher-offhours, cron 0 */4). Next chef: evening 19:37Z conditional / morning 2026-05-30 05:23Z guaranteed."
  },
  "priority": "low",
  "createdAt": "${FIRE_TIME}"
}
JSON
  git add "$OUT" >/dev/null 2>&1
  git -c user.name='report-analyzer' -c user.email='report-analyzer@local' \
    commit -q -m "chore(pipeline-state): cowork-team ${NOMINAL} tick — SILENT (auto, matcher slots:[] x3 unanimous), no fan-out due" -- "$OUT" >/dev/null 2>&1
  CommitRC=$?
  COMMITSHA=$(git rev-parse --short HEAD 2>/dev/null)
  printf 'RESULT=SILENT\nNOMINAL=%s\nFIRE_TIME=%s\nOUT=%s\nCOMMIT_RC=%s\nHEAD=%s\nDRIFT=%s\n' \
    "$NOMINAL" "$FIRE_TIME" "$OUT" "$CommitRC" "$COMMITSHA" "$DRIFT" > /tmp/cowork_result.txt
  exit 0
else
  printf 'RESULT=FIRE_OR_DISAGREE\nNOMINAL=%s\nFIRE_TIME=%s\nS1=%s\nS2=%s\nS3=%s\nR1=%s\n' \
    "$NOMINAL" "$FIRE_TIME" "$S1" "$S2" "$S3" "$R1" > /tmp/FIRE_PENDING.txt
  cp /tmp/FIRE_PENDING.txt /tmp/cowork_result.txt
  exit 3
fi
