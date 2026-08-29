#!/usr/bin/env bash
# scripts/agents-flow/cowork-dispatch-collision-probe.test.sh
#
# Regression test for FIX-COWORK-PUBLISHED-MARKER-TTL-28H-EXCEEDS-24H-DAILY-CADENCE
# (Axis D + Axis C) and FIX-COWORK-DISPATCH-AXISD-AGEBOUND-PERIODKEY (period-key guard).
# Architect brief (read in full before editing):
#   docs/architecture-briefs/2026-08-23-fix-cowork-published-marker-ttl-cadence-mismatch-design.md
#
# NOTE ON WHAT THIS FILE TESTS: Step 2.4's FR-3 collision probe
# (.claude/skills/dispatch-claim/SKILL.md) is prose pseudocode a router AGENT interprets at
# dispatch time — there is no standalone `.sh`/`.ts` implementation to source (confirmed:
# TASK-COWORK-MUTEX-002, the test-harness task, was never picked up out of backlog[]; this file
# did not exist before the 08-26 task). `collision_probe()` below is a byte-faithful bash+jq mirror of
# the revised FR-3 block (CADENCE_SEC_BY_BASIS table, exact `cowork-slot:<slot_id>` match, prefix
# `published:<slot_id>:` match gated by PERIOD-KEY comparison then owner-roster membership, with
# the 08-26 claimed_at AGE fallback retained only for the indeterminate case) — kept
# in lockstep with SKILL.md by hand; any future FR-3 edit must update both. No live MCP calls are
# made (same "no real side-effecting MCP calls" convention as cowork-tick-preflight.test.sh) —
# `held` rows and the presence roster are constructed fixture data, and cowork-schedule.json is
# an isolated tmp copy (same isolated-tmp-fixture pattern as context-bloat-backstop.test.sh), not
# the live docs/data/cowork-schedule.json.
#
# Coverage (brief §4 + FIX-COWORK-DISPATCH-AXISD-AGEBOUND-PERIODKEY §new):
#   T1   Daily, marker keyed YESTERDAY, claimed 24h+1s ago -> MUST NOT block (AC-1/AC-6;
#        prior-period by period-key — old age logic agreed, key guard now carries it)
#   T1b  Daily, marker keyed YESTERDAY, claimed NOW-86050s (INSIDE the 5m50s band where
#        AGE_SEC=86050 < CADENCE_SEC=86400) -> MUST NOT block (THE defect regression:
#        period-key guard clears it where claimed_at arithmetic read it as current — the
#        live 2026-08-26T19:47:35Z case; old logic BLOCKS this, negative control below)
#   T2   Daily, marker keyed TODAY, claimed now, owner present -> MUST still block (AC-2,
#        no regression of the double-publish guard TASK-COWORK-MUTEX-001 provides)
#   T2b  Daily, marker keyed TODAY, claimed NOW-86401s (age >= cadence) -> MUST still block
#        (period-key guard wins over the age arithmetic that would have FALSE-CLEARED a
#        current-period marker — the band's inverse direction, no regression)
#   T3   Weekly, digest-sunday periodKey LAST WEEK, claimed 7d+1s ago -> MUST NOT block
#        (AC-1, closes the brief §2 latent weekly-scale defect)
#   T3b  Weekly, digest-sunday periodKey LAST WEEK, claimed NOW-603600s (7d - 20min, INSIDE
#        the weekly band) -> MUST NOT block (weekly-scale defect regression)
#   T4   Stale-owner, current period (tnb-audit, vn_date, keyed TODAY-VN), claimed now but
#        owner_client_session absent from the roster -> MUST NOT block (AC-3/AC-5)
#   T5   Unmapped slot (publish_date_basis=null) — byte-identical PRE-FIX prefix-match behavior:
#        a stale marker still blocks (regression guard: the fix is scope-bound to the 8 slots
#        docs/data/cowork-schedule.json marks with a non-null basis, per SKILL.md's own comment)
#   T6   Exact `cowork-slot:<slot_id>` match (untouched code path) still blocks unconditionally —
#        proves the match SHAPE itself (not just the staleness test) is otherwise unchanged
#   T7   Saturday-anchor weekly (fb-weekend, vn_date_saturday_anchor), marker keyed CURRENT
#        weekend PERIOD_SAT, claimed now, owner present -> MUST still block (4th basis covered)
#   T8   Saturday-anchor weekly, marker keyed LAST weekend's Saturday, claimed 7d+1s ago ->
#        MUST NOT block (prior weekend by period-key)
#
# Negative control (non-vacuousness of T1b/T2b/T3b): `age_only_probe()` mirrors the PRE-FIX
# 08-26 FR-3 logic (pure claimed_at AGE_SEC >= CADENCE_SEC -> prior). Run against the T1b/T2b/T3b
# fixture rows it must produce the OLD (wrong) outcome: T1b BLOCKS (false-block defect), T2b
# CLEARS (false-clear defect), T3b BLOCKS (weekly false-block defect) — proving the three new
# cases genuinely discriminate the period-key fix and would have caught the live regression.
#
# Run:
#   bash scripts/agents-flow/cowork-dispatch-collision-probe.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: FIX-COWORK-PUBLISHED-MARKER-TTL-28H-EXCEEDS-24H-DAILY-CADENCE /
#              FIX-COWORK-DISPATCH-AXISD-AGEBOUND-PERIODKEY
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
    { "slot_id": "fb-weekend",           "publish_date_basis": "vn_date_saturday_anchor" },
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

# ── Date-relative period keys (fixture must agree with the mirror's derivation) ─
# The FR-3 period-key guard compares the marker's embedded suffix against the CURRENT
# period key derived from publish_date_basis + now — so fixture keys are computed from NOW,
# not hardcoded, exactly like CURRENT_PERIOD_KEY_BY_BASIS in SKILL.md (BSD/macOS date on the
# dev host; GNU equivalents noted in SKILL.md).
NOW=$(date -u +%s)
TODAY_UTC=$(date -u -r "$NOW" +%Y-%m-%d)
YESTERDAY_UTC=$(date -u -r "$((NOW - 86400))" +%Y-%m-%d)
TODAY_VN=$(TZ=Asia/Ho_Chi_Minh date -r "$NOW" +%Y-%m-%d)
# Current ISO week Mon..Sun range (same periodKey shape digest-predict uses: "YYYY-MM-DD/YYYY-MM-DD")
ISO_DOW=$(date -u -r "$NOW" +%u)          # 1=Mon..7=Sun
MON_TS=$((NOW - (ISO_DOW - 1) * 86400))
CUR_WEEK_KEY="$(date -u -r "$MON_TS" +%Y-%m-%d)/$(date -u -r "$((MON_TS + 6 * 86400))" +%Y-%m-%d)"
PREV_WEEK_KEY="$(date -u -r "$((MON_TS - 7 * 86400))" +%Y-%m-%d)/$(date -u -r "$((MON_TS - 86400))" +%Y-%m-%d)"
# PERIOD_SAT — Saturday of the current VN weekend (weekly-recap.md:47 rule: Sunday -> yesterday)
VN_DOW=$(TZ=Asia/Ho_Chi_Minh date -r "$NOW" +%w)   # 0=Sun
if [ "$VN_DOW" = "0" ]; then CUR_SAT_TS=$((NOW - 86400)); else CUR_SAT_TS=$NOW; fi
CUR_SAT=$(TZ=Asia/Ho_Chi_Minh date -r "$CUR_SAT_TS" +%Y-%m-%d)
PREV_SAT=$(TZ=Asia/Ho_Chi_Minh date -r "$((CUR_SAT_TS - 7 * 86400))" +%Y-%m-%d)

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

    # CURRENT_PERIOD_KEY_BY_BASIS mirror — the period-key the CURRENT dispatch would claim,
    # derived from publish_date_basis + now (same derivations as SKILL.md; jq strftime is UTC,
    # vn_* shift by +7h; ISO week = Mon..Sun range, %u = 1=Mon..7=Sun):
    def current_period_key_for($basis):
      if   $basis == "utc_date" then ($now | strftime("%Y-%m-%d"))
      elif $basis == "vn_date"  then (($now + 7*3600) | strftime("%Y-%m-%d"))
      elif $basis == "iso_week_period" then
        (($now | strftime("%u")) | tonumber) as $dow
        | (($now - (($dow - 1) * 86400)) | strftime("%Y-%m-%d")) as $mon
        | (($now - (($dow - 1) * 86400) + 6 * 86400) | strftime("%Y-%m-%d")) as $sun
        | ($mon + "/" + $sun)
      elif $basis == "vn_date_saturday_anchor" then
        (($now + 7*3600)) as $vn
        | if (($vn | strftime("%w")) == "0") then (($vn - 86400) | strftime("%Y-%m-%d"))
          else ($vn | strftime("%Y-%m-%d")) end
      else null
      end;

    ( ($schedule[0].slots[] | select(.slot_id == $slot_id) | .publish_date_basis) // null ) as $basis
    | cadence_for($basis) as $cadence
    | current_period_key_for($basis) as $current_key
    | reduce $held[] as $row
        (null;
          if . != null then .
          elif $row.task_id == ("cowork-slot:" + $slot_id) then $row
          elif ($row.task_id | startswith("published:" + $slot_id + ":")) then
            if $cadence == null then
              $row   # unmapped slot — byte-identical PRE-FIX prefix-match behavior
            else
              ($row.task_id | ltrimstr("published:" + $slot_id + ":")) as $period_key
              | if ($current_key != null and $period_key != $current_key) then
                  null   # AXIS D (period-key) — prior/future-period marker; the embedded
                         # suffix string is unambiguous where claimed_at age is not
                         # (FIX-COWORK-DISPATCH-AXISD-AGEBOUND-PERIODKEY). Keep scanning.
                elif ($current_key == null or $period_key == "") then
                  # Indeterminate (derivation failed / empty suffix) — 08-26 AGE fallback,
                  # never weaker than pre-fix:
                  (($now - $row.claimed_at)) as $age
                  | if $age >= $cadence then
                      null   # prior-period by age, keep scanning
                    elif ($roster_ids | index($row.owner_client_session)) == null then
                      null   # AXIS C — stale owner, keep scanning
                    else
                      $row
                    end
                elif ($roster_ids | index($row.owner_client_session)) == null then
                  null   # AXIS C — current-period marker, stale owner, keep scanning
                else
                  $row   # current-period (key matches), owner present -> collision
                end
            end
          else
            null
          end
        )
    '
}

# ── age_only_probe — PRE-FIX 08-26 mirror (negative control for T1b/T2b/T3b) ──
# Same inputs as collision_probe; implements ONLY the old claimed_at arithmetic
# (AGE_SEC >= CADENCE_SEC -> prior-period skip), no period-key comparison.
age_only_probe() {
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
              $row
            else
              (($now - $row.claimed_at)) as $age
              | if $age >= $cadence then
                  null
                elif ($roster_ids | index($row.owner_client_session)) == null then
                  null
                else
                  $row
                end
            end
          else
            null
          end
        )
    '
}

# ── T1: Daily prior-period by period-key — MUST NOT block (AC-1/AC-6) ────────
CLAIMED_AT_T1=$((NOW - 86401))   # 24h + 1s ago
HELD_T1=$(jq -n --arg tid "published:chef-evening:$YESTERDAY_UTC" --argjson ca "$CLAIMED_AT_T1" \
  '[{task_id: $tid, owner_client_session: "sess-yesterday-chef-evening", claimed_at: $ca}]')
RESULT_T1=$(collision_probe "chef-evening" "$HELD_T1" '[]' "$NOW")
check "T1 AC-1/AC-6: daily marker keyed YESTERDAY (claimed 24h+1s ago) does NOT block" \
  "$([ "$RESULT_T1" = "null" ] && echo true || echo false)"

# ── T1b: THE DEFECT — prior-period marker inside the 5m50s band — MUST NOT block ──
CLAIMED_AT_T1b=$((NOW - 86050))   # 23h54m10s ago: AGE_SEC=86050 < CADENCE_SEC=86400 (live band)
HELD_T1b=$(jq -n --arg tid "published:chef-evening:$YESTERDAY_UTC" --argjson ca "$CLAIMED_AT_T1b" \
  '[{task_id: $tid, owner_client_session: "sess-live-agent", claimed_at: $ca}]')
ROSTER_T1b='["sess-live-agent"]'   # owner IS present — Axis C cannot rescue; only the
                                   # period-key guard can clear this (live 2026-08-26 case)
RESULT_T1b=$(collision_probe "chef-evening" "$HELD_T1b" "$ROSTER_T1b" "$NOW")
check "T1b FIX-COWORK-DISPATCH-AXISD-AGEBOUND-PERIODKEY: YESTERDAY-keyed marker claimed NOW-86050s (inside 5m50s band) does NOT block" \
  "$([ "$RESULT_T1b" = "null" ] && echo true || echo false)"

# ── T2: Daily current-period, owner present — MUST still block (AC-2) ────────
HELD_T2=$(jq -n --arg tid "published:chef-evening:$TODAY_UTC" --argjson ca "$NOW" \
  '[{task_id: $tid, owner_client_session: "sess-today-chef-evening", claimed_at: $ca}]')
ROSTER_T2='["sess-today-chef-evening"]'
RESULT_T2=$(collision_probe "chef-evening" "$HELD_T2" "$ROSTER_T2" "$NOW")
check "T2 AC-2: genuinely-live current-period daily marker (TODAY key) still blocks (no regression)" \
  "$([ "$(printf '%s' "$RESULT_T2" | jq -r '.task_id // "null"')" = "published:chef-evening:$TODAY_UTC" ] && echo true || echo false)"

# ── T2b: Current-period marker with age >= cadence — MUST still block ─────────
HELD_T2b=$(jq -n --arg tid "published:chef-evening:$TODAY_UTC" --argjson ca "$((NOW - 86401))" \
  '[{task_id: $tid, owner_client_session: "sess-today-chef-evening", claimed_at: $ca}]')
RESULT_T2b=$(collision_probe "chef-evening" "$HELD_T2b" "$ROSTER_T2" "$NOW")
check "T2b: current-period marker (TODAY key) claimed NOW-86401s still blocks (period-key beats age — no false-clear)" \
  "$([ "$(printf '%s' "$RESULT_T2b" | jq -r '.task_id // "null"')" = "published:chef-evening:$TODAY_UTC" ] && echo true || echo false)"

# ── T3: Weekly prior-period (digest-sunday) — MUST NOT block (AC-1) ───────────
CLAIMED_AT_T3=$((NOW - 604801))   # 7d + 1s ago
HELD_T3=$(jq -n --arg tid "published:digest-sunday:$PREV_WEEK_KEY" --argjson ca "$CLAIMED_AT_T3" \
  '[{task_id: $tid, owner_client_session: "sess-last-week-digest", claimed_at: $ca}]')
RESULT_T3=$(collision_probe "digest-sunday" "$HELD_T3" '[]' "$NOW")
check "T3 AC-1: weekly marker keyed LAST WEEK (claimed 7d+1s ago) does NOT block (§2 latent case closed)" \
  "$([ "$RESULT_T3" = "null" ] && echo true || echo false)"

# ── T3b: Weekly band — LAST-WEEK key inside the 20-min weekly band — MUST NOT block ──
CLAIMED_AT_T3b=$((NOW - 603600))   # 7d - 20min: inside the 604800s weekly cadence
HELD_T3b=$(jq -n --arg tid "published:digest-sunday:$PREV_WEEK_KEY" --argjson ca "$CLAIMED_AT_T3b" \
  '[{task_id: $tid, owner_client_session: "sess-live-digest", claimed_at: $ca}]')
ROSTER_T3b='["sess-live-digest"]'
RESULT_T3b=$(collision_probe "digest-sunday" "$HELD_T3b" "$ROSTER_T3b" "$NOW")
check "T3b: weekly marker keyed LAST WEEK claimed NOW-603600s (inside weekly band) does NOT block (weekly-scale defect closed)" \
  "$([ "$RESULT_T3b" = "null" ] && echo true || echo false)"

# ── T4: Stale-owner, current period (tnb-audit) — MUST NOT block (AC-3/AC-5) ─
HELD_T4=$(jq -n --arg tid "published:tnb-audit:$TODAY_VN" --argjson ca "$NOW" \
  '[{task_id: $tid, owner_client_session: "sim-dead-session", claimed_at: $ca}]')
RESULT_T4=$(collision_probe "tnb-audit" "$HELD_T4" '[]' "$NOW")   # empty roster — sim-dead-session absent
check "T4 AC-3/AC-5: current-period marker (TODAY-VN key) with no matching session-presence row does NOT block" \
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

# ── T7: Saturday-anchor weekly (fb-weekend), CURRENT weekend — MUST block ────
HELD_T7=$(jq -n --arg tid "published:fb-weekend:$CUR_SAT" --argjson ca "$NOW" \
  '[{task_id: $tid, owner_client_session: "sess-this-weekend-fb", claimed_at: $ca}]')
ROSTER_T7='["sess-this-weekend-fb"]'
RESULT_T7=$(collision_probe "fb-weekend" "$HELD_T7" "$ROSTER_T7" "$NOW")
check "T7: saturday-anchor weekly (fb-weekend) CURRENT-weekend marker (PERIOD_SAT key) still blocks" \
  "$([ "$(printf '%s' "$RESULT_T7" | jq -r '.task_id // "null"')" = "published:fb-weekend:$CUR_SAT" ] && echo true || echo false)"

# ── T8: Saturday-anchor weekly, LAST weekend — MUST NOT block ────────────────
HELD_T8=$(jq -n --arg tid "published:fb-weekend:$PREV_SAT" --argjson ca "$((NOW - 604801))" \
  '[{task_id: $tid, owner_client_session: "sess-last-weekend-fb", claimed_at: $ca}]')
RESULT_T8=$(collision_probe "fb-weekend" "$HELD_T8" '[]' "$NOW")
check "T8: saturday-anchor weekly LAST-weekend marker (previous Saturday key) does NOT block" \
  "$([ "$RESULT_T8" = "null" ] && echo true || echo false)"

# ── Negative control: the 3 new cases FAIL under the pre-fix 08-26 age logic ──
NEG_T1b=$(age_only_probe "chef-evening" "$HELD_T1b" "$ROSTER_T1b" "$NOW")
NEG_T2b=$(age_only_probe "chef-evening" "$HELD_T2b" "$ROSTER_T2" "$NOW")
NEG_T3b=$(age_only_probe "digest-sunday" "$HELD_T3b" "$ROSTER_T3b" "$NOW")
check "NEG-1 non-vacuous: pre-fix age logic BLOCKS the T1b fixture (false-block defect reproduced)" \
  "$([ "$(printf '%s' "$NEG_T1b" | jq -r '.task_id // "null"')" = "published:chef-evening:$YESTERDAY_UTC" ] && echo true || echo false)"
check "NEG-2 non-vacuous: pre-fix age logic CLEARS the T2b fixture (false-clear defect reproduced)" \
  "$([ "$NEG_T2b" = "null" ] && echo true || echo false)"
check "NEG-3 non-vacuous: pre-fix age logic BLOCKS the T3b fixture (weekly false-block reproduced)" \
  "$([ "$(printf '%s' "$NEG_T3b" | jq -r '.task_id // "null"')" = "published:digest-sunday:$PREV_WEEK_KEY" ] && echo true || echo false)"

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
