#!/usr/bin/env bash
# scripts/agents-flow/cowork-dispatch-collision-probe.test.sh
#
# Regression test for FIX-COWORK-PUBLISHED-MARKER-TTL-28H-EXCEEDS-24H-DAILY-CADENCE.
# Architect brief (read in full before editing):
#   docs/architecture-briefs/2026-08-23-fix-cowork-published-marker-ttl-cadence-mismatch-design.md
#
# NOTE ON WHAT THIS FILE TESTS: Step 2.4's FR-3 collision probe
# (.claude/skills/dispatch-claim/SKILL.md) is prose pseudocode a router AGENT interprets at
# dispatch time — there is no standalone `.sh`/`.ts` implementation to source (confirmed:
# TASK-COWORK-MUTEX-002, the test-harness task, was never picked up out of backlog[]; this file
# did not exist before this task). `collision_probe()` below is a byte-faithful bash+jq mirror of
# the revised FR-3 block (CADENCE_SEC_BY_BASIS table, exact `cowork-slot:<slot_id>` match, prefix
# `published:<slot_id>:` match gated by AGE_SEC/CADENCE_SEC then owner-roster membership) — kept
# in lockstep with SKILL.md by hand; any future FR-3 edit must update both. No live MCP calls are
# made (same "no real side-effecting MCP calls" convention as cowork-tick-preflight.test.sh) —
# `held` rows and the presence roster are constructed fixture data, and cowork-schedule.json is
# an isolated tmp copy (same isolated-tmp-fixture pattern as context-bloat-backstop.test.sh), not
# the live docs/data/cowork-schedule.json.
#
# Coverage (brief §4):
#   T1  Daily 4h-overlap (chef-evening, utc_date, 86400s cadence), marker backdated 24h+1s
#       -> MUST NOT block (AC-1/AC-6, the exact production-blocked case)
#   T2  Daily, within-cadence, owner present in roster -> MUST still block (AC-2, no regression
#       of the double-publish guard TASK-COWORK-MUTEX-001 provides)
#   T3  Weekly 24h-overlap (digest-sunday, iso_week_period, 604800s cadence), marker backdated
#       7d+1s -> MUST NOT block (AC-1, closes the brief §2 latent weekly-scale defect)
#   T4  Stale-owner, current period (tnb-audit, vn_date, 86400s cadence), claimed_at=now but
#       owner_client_session absent from the roster -> MUST NOT block (AC-3/AC-5)
#   T5  Unmapped slot (publish_date_basis=null) — byte-identical PRE-FIX prefix-match behavior:
#       a stale marker still blocks (regression guard: the fix is scope-bound to the 8 slots
#       docs/data/cowork-schedule.json marks with a non-null basis, per SKILL.md's own comment)
#   T6  Exact `cowork-slot:<slot_id>` match (untouched code path) still blocks unconditionally —
#       proves the match SHAPE itself (not just the staleness test) is otherwise unchanged
#
# Run:
#   bash scripts/agents-flow/cowork-dispatch-collision-probe.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: FIX-COWORK-PUBLISHED-MARKER-TTL-28H-EXCEEDS-24H-DAILY-CADENCE
set -uo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required" >&2
  exit 1
fi

# ── Isolated test fixture root (never the real project data) ─────────────────
TMPDIR_TEST=$(mktemp -d /private/tmp/cowork-collision-probe-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

SCHEDULE_FIXTURE="$TMPDIR_TEST/cowork-schedule.json"
cat > "$SCHEDULE_FIXTURE" <<'JSON'
{
  "slots": [
    { "slot_id": "chef-evening",         "publish_date_basis": "utc_date" },
    { "slot_id": "digest-sunday",        "publish_date_basis": "iso_week_period" },
    { "slot_id": "tnb-audit",            "publish_date_basis": "vn_date" },
    { "slot_id": "market-watcher-eod",   "publish_date_basis": null }
  ]
}
JSON

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

# ── collision_probe — bash+jq mirror of SKILL.md Step 2.4 FR-3 (see header note) ─────────────
# Args: $1 = slot_id (TARGET_SLOTS is always a single slot in this fixture — FR-2 resolution is
#            out of scope for this file, already covered pre-fix), $2 = held rows (JSON array),
#            $3 = roster_session_ids (JSON array of strings), $4 = now (unix epoch seconds)
# Stdout: the colliding row as JSON, or the literal string "null" if no collision.
collision_probe() {
  local slot_id="$1" held_json="$2" roster_json="$3" now="$4"

  jq -n \
    --arg slot_id "$slot_id" \
    --argjson held "$held_json" \
    --argjson roster_ids "$roster_json" \
    --argjson now "$now" \
    --slurpfile schedule "$SCHEDULE_FIXTURE" \
    '
    def cadence_for($basis):
      if   $basis == "utc_date" or $basis == "vn_date" then 86400
      elif $basis == "iso_week_period" or $basis == "vn_date_saturday_anchor" then 604800
      else null
      end;

    ( ($schedule[0].slots[] | select(.slot_id == $slot_id) | .publish_date_basis) // null ) as $basis
    | cadence_for($basis) as $cadence
    | reduce $held[] as $row
        (null;
          if . != null then .
          elif $row.task_id == ("cowork-slot:" + $slot_id) then $row
          elif ($row.task_id | startswith("published:" + $slot_id + ":")) then
            if $cadence == null then
              $row   # unmapped slot — byte-identical PRE-FIX prefix-match behavior
            else
              (($now - $row.claimed_at)) as $age
              | if $age >= $cadence then
                  null   # AXIS D — prior-period marker, keep scanning
                elif ($roster_ids | index($row.owner_client_session)) == null then
                  null   # AXIS C — current-period marker, stale owner, keep scanning
                else
                  $row   # current-period, owner present -> collision
                end
            end
          else
            null
          end
        )
    '
}

NOW=$(date -u +%s)

# ── T1: Daily 4h-overlap — MUST NOT block (AC-1/AC-6) ─────────────────────────
CLAIMED_AT_T1=$((NOW - 86401))   # 24h + 1s ago — one second past the daily cadence boundary
HELD_T1=$(jq -n --arg tid "published:chef-evening:2026-08-25" --argjson ca "$CLAIMED_AT_T1" \
  '[{task_id: $tid, owner_client_session: "sess-yesterday-chef-evening", claimed_at: $ca}]')
RESULT_T1=$(collision_probe "chef-evening" "$HELD_T1" '[]' "$NOW")
check "T1 AC-1/AC-6: daily marker backdated 24h+1s (chef-evening) does NOT block" \
  "$([ "$RESULT_T1" = "null" ] && echo true || echo false)"

# ── T2: Daily, within-cadence, owner present — MUST still block (AC-2) ───────
CLAIMED_AT_T2=$NOW
HELD_T2=$(jq -n --arg tid "published:chef-evening:2026-08-26" --argjson ca "$CLAIMED_AT_T2" \
  '[{task_id: $tid, owner_client_session: "sess-today-chef-evening", claimed_at: $ca}]')
ROSTER_T2='["sess-today-chef-evening"]'
RESULT_T2=$(collision_probe "chef-evening" "$HELD_T2" "$ROSTER_T2" "$NOW")
check "T2 AC-2: genuinely-live current-period daily marker still blocks (no regression)" \
  "$([ "$(printf '%s' "$RESULT_T2" | jq -r '.task_id // "null"')" = "published:chef-evening:2026-08-26" ] && echo true || echo false)"

# ── T3: Weekly 24h-overlap (digest-sunday) — MUST NOT block (AC-1) ────────────
CLAIMED_AT_T3=$((NOW - 604801))   # 7d + 1s ago — one second past the weekly cadence boundary
HELD_T3=$(jq -n --arg tid "published:digest-sunday:2026-W34" --argjson ca "$CLAIMED_AT_T3" \
  '[{task_id: $tid, owner_client_session: "sess-last-week-digest", claimed_at: $ca}]')
RESULT_T3=$(collision_probe "digest-sunday" "$HELD_T3" '[]' "$NOW")
check "T3 AC-1: weekly marker backdated 7d+1s (digest-sunday) does NOT block (§2 latent case closed)" \
  "$([ "$RESULT_T3" = "null" ] && echo true || echo false)"

# ── T4: Stale-owner, current period (tnb-audit) — MUST NOT block (AC-3/AC-5) ─
CLAIMED_AT_T4=$NOW
HELD_T4=$(jq -n --arg tid "published:tnb-audit:2026-08-26" --argjson ca "$CLAIMED_AT_T4" \
  '[{task_id: $tid, owner_client_session: "sim-dead-session", claimed_at: $ca}]')
RESULT_T4=$(collision_probe "tnb-audit" "$HELD_T4" '[]' "$NOW")   # empty roster — sim-dead-session absent
check "T4 AC-3/AC-5: current-period marker with no matching session-presence row does NOT block" \
  "$([ "$RESULT_T4" = "null" ] && echo true || echo false)"

# ── T5: Unmapped slot — byte-identical PRE-FIX behavior (regression guard) ────
CLAIMED_AT_T5=$((NOW - 999999))   # far outside any conceivable cadence — still must block
HELD_T5=$(jq -n --arg tid "published:market-watcher-eod:2026-08-01" --argjson ca "$CLAIMED_AT_T5" \
  '[{task_id: $tid, owner_client_session: "sess-old-market-watcher", claimed_at: $ca}]')
RESULT_T5=$(collision_probe "market-watcher-eod" "$HELD_T5" '[]' "$NOW")
check "T5 regression guard: unmapped slot (publish_date_basis=null) still blocks pre-fix (scope-bound fix)" \
  "$([ "$(printf '%s' "$RESULT_T5" | jq -r '.task_id // "null"')" = "published:market-watcher-eod:2026-08-01" ] && echo true || echo false)"

# ── T6: Exact cowork-slot:<slot_id> match — untouched code path still blocks ──
HELD_T6=$(jq -n '[{task_id: "cowork-slot:chef-evening", owner_client_session: "sess-cowork-dispatcher", claimed_at: 0}]')
RESULT_T6=$(collision_probe "chef-evening" "$HELD_T6" '[]' "$NOW")
check "T6 match-shape unchanged: exact cowork-slot: match still blocks unconditionally" \
  "$([ "$(printf '%s' "$RESULT_T6" | jq -r '.task_id // "null"')" = "cowork-slot:chef-evening" ] && echo true || echo false)"

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
