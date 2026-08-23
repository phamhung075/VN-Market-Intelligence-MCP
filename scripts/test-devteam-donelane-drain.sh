#!/usr/bin/env bash
# test-devteam-donelane-drain.sh — hermetic gate for the done[]-lane
# DONE_VERIFIED producer (Done-Lane Drain).
#
# OWNING TASK: FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION (P0)
# OWNING BRIEF: docs/architecture-briefs/2026-08-08-donelane-doneverified-producer.md
# OWNING FLOW: docs/agents/dev-team/flow/main.md
#   § Review-Lane QA-Drain / § Review-Lane SECONDARY-Drain
#
# ROOT CAUSE UNDER TEST: `task_board.done[]` had ZERO consumers. Nothing
# systematically produced the `DONE_VERIFIED` token, and `deps_satisfied()`
# (scripts/lib/devteam-eligibility.jq) is satisfied ONLY by the exact string
# `DONE_VERIFIED` — plain `DONE` starves every successor forever. 8 rows were
# measured starved on 2026-07-30, 4 of them P0. The fix (brief §1, candidate
# (a)) widens the candidate lane of the two EXISTING review[] drains from
# `review[]` alone to `review[] ∪ done[]`, so a finished-but-unverified row
# reaches the same already-proven consumers (QA's independent verify-committed
# for the next_agent=="qa" subset; resolved_secondary_dispatch_target's owner
# triage for the rest).
#
# HARD INVARIANTS ASSERTED HERE (each one is a real, named regression risk):
#   I1  done[] status=="DONE" + next_agent=="qa" reaches qa[] (AC-2).
#   I2  `claimed_by` stays the LITERAL "dev-team (review-lane qa-drain)" for a
#       done-origin row — main.md's dispatch-loop query exact-matches that
#       string; a source-tagged value would silently drop done-origin rows out
#       of the BGFAN-1 spawn fan-out (brief §2 Component 1).
#   I3  the two source lanes' index sets are INDEPENDENT — `idx` is only unique
#       WITHIN one array, so a shared index list would delete the wrong row
#       from the other lane.
#   I4  the producer NEVER writes DONE_VERIFIED on its own authority (AC-3) —
#       it only ever moves DONE -> QA / stamps in place.
#   I5  a done[] row with NO next_agent is not silently invisible (AC-4) — the
#       SECONDARY drain stamps it with the "po" fallback target.
#   I6  status=="DONE_VERIFIED" rows already sitting in done[] are NEVER picked
#       by either drain (they are already terminal-verified).
#   I7  review[]-origin behaviour is byte-unchanged (no regression).
#   I8  scripts/orch-cold-evict.sh never evicts a status=="DONE" row from
#       done[] (brief §2 Component 6) — an unverified row must not be silently
#       moved out of reach of the drain that was just built for it.
#
# USAGE: bash scripts/test-devteam-donelane-drain.sh
#        exit 0 = all cases pass; exit 1 = a case failed (gate is RED).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
QA_DRAIN="$REPO_ROOT/scripts/devteam-review-claim-qa-drain.jq"
SEC_DRAIN="$REPO_ROOT/scripts/devteam-review-claim-secondary-drain.jq"
REPORT="$REPO_ROOT/scripts/audits/devteam-review-lane-drain-report.sh"
STARVE_REPORT="$REPO_ROOT/scripts/audits/devteam-deps-satisfied-sole-failure-report.sh"
COLD_EVICT="$REPO_ROOT/scripts/orch-cold-evict.sh"

cd "$REPO_ROOT"   # both .jq files use `include "scripts/lib/devteam-eligibility"`

PASS=0
FAIL=0
check() {
  local name="$1" got="$2" want="$3"
  if [ "$got" = "$want" ]; then
    echo "[test] PASS: $name (got=$got)"
    PASS=$((PASS + 1))
  else
    echo "[test] FAIL: $name — got=$got want=$want" >&2
    FAIL=$((FAIL + 1))
  fi
}

TMP="$(mktemp -d -t devteam-donelane-drain-XXXXXX)"
# shellcheck disable=SC2329  # invoked via `trap cleanup EXIT INT TERM` below
cleanup() { rm -rf "$TMP" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

NOW="2026-08-08T00:00:00Z"
EMPTY_DETAIL="$TMP/detail-empty.json"
echo '{"items": {}}' > "$EMPTY_DETAIL"

# run_qa_drain <orch-fixture> [take_budget] -> output document on stdout
run_qa_drain() {
  local orch="$1" budget="${2:-1}"
  jq --arg now "$NOW" --argjson take_budget "$budget" \
     --slurpfile detail "$EMPTY_DETAIL" -f "$QA_DRAIN" "$orch"
}

# run_sec_drain <orch-fixture> -> output document on stdout
run_sec_drain() {
  local orch="$1"
  jq --arg now "$NOW" --slurpfile detail "$EMPTY_DETAIL" -f "$SEC_DRAIN" "$orch"
}

# board <lanes-json> -> a minimally-shaped orch-state document
board() {
  jq -n --argjson lanes "$1" \
    '{head: {status: "idle", active_task_id: null, next_agent: null},
      task_board: ({backlog: [], ready: [], in_progress: [], qa: [],
                    review: [], done: [], done_verified: []} + $lanes)}'
}

# ─────────────────────────────────────────────────────────────────────────────
# STATIC PROOFS — the shipped scripts must actually name done[] as a source
# ─────────────────────────────────────────────────────────────────────────────
check "qa-drain names done[] as a candidate lane (>=1 ref)" \
  "$([ "$(grep -c 'task_board\.done' "$QA_DRAIN")" -ge 1 ] && echo yes || echo no)" "yes"
check "secondary-drain names done[] as a candidate lane (>=1 ref)" \
  "$([ "$(grep -c 'task_board\.done' "$SEC_DRAIN")" -ge 1 ] && echo yes || echo no)" "yes"
check "qa-drain claimed_by literal is present (I2 exact-match contract)" \
  "$([ "$(grep -c '"dev-team (review-lane qa-drain)"' "$QA_DRAIN")" -ge 1 ] && echo yes || echo no)" "yes"
# AC-3 static half: the DONE_VERIFIED token must not appear in either drain
# script's EXECUTABLE body (comment lines are stripped — both headers cite the
# token when explaining the defect they close, which is not a write).
check "AC-3: neither drain script's code ever writes the DONE_VERIFIED token" \
  "$(cat "$QA_DRAIN" "$SEC_DRAIN" | grep -v '^[[:space:]]*#' | grep -c 'DONE_VERIFIED')" "0"
check "AC-6 regression instrument exists and is executable" \
  "$([ -x "$STARVE_REPORT" ] && echo yes || echo no)" "yes"

# ─────────────────────────────────────────────────────────────────────────────
# CASE 1 (I1/I2/I4) — done[] DONE + next_agent==qa reaches qa[]
# ─────────────────────────────────────────────────────────────────────────────
F1="$TMP/case1.json"
board '{
  "done": [
    {"id":"DONE-QA-ROW","status":"DONE","next_agent":"qa","priority":"P0","updated_at":"2026-07-28T20:39:40Z"}
  ]
}' > "$F1"
OUT1="$(run_qa_drain "$F1" 10)"

check "C1 done-origin row moved into qa[]" \
  "$(echo "$OUT1" | jq -r '.task_board.qa | map(.id) | join(",")')" "DONE-QA-ROW"
check "C1 done-origin row removed from done[]" \
  "$(echo "$OUT1" | jq -r '.task_board.done | length')" "0"
check "C1 status flipped DONE -> QA (never DONE_VERIFIED)" \
  "$(echo "$OUT1" | jq -r '.task_board.qa[0].status')" "QA"
check "C1 claimed_by is the EXACT dispatch-loop match string (I2)" \
  "$(echo "$OUT1" | jq -r '.task_board.qa[0].claimed_by')" "dev-team (review-lane qa-drain)"
check "C1 claimed_at stamped with \$now" \
  "$(echo "$OUT1" | jq -r '.task_board.qa[0].claimed_at')" "$NOW"
check "C1 audit-trail field drain_source_lane=done" \
  "$(echo "$OUT1" | jq -r '.task_board.qa[0].drain_source_lane')" "done"
check "C1 no DONE_VERIFIED written anywhere (I4/AC-3)" \
  "$(echo "$OUT1" | jq -r '[.. | strings | select(. == "DONE_VERIFIED")] | length')" "0"

# ─────────────────────────────────────────────────────────────────────────────
# CASE 2 (I7) — review[]-origin behaviour unchanged
# ─────────────────────────────────────────────────────────────────────────────
F2="$TMP/case2.json"
board '{
  "review": [
    {"id":"REV-QA-ROW","status":"REVIEW","next_agent":"qa","priority":"P1","updated_at":"2026-08-01T00:00:00Z"}
  ]
}' > "$F2"
OUT2="$(run_qa_drain "$F2" 10)"
check "C2 review-origin row still drains to qa[]" \
  "$(echo "$OUT2" | jq -r '.task_board.qa | map(.id) | join(",")')" "REV-QA-ROW"
check "C2 review-origin row removed from review[]" \
  "$(echo "$OUT2" | jq -r '.task_board.review | length')" "0"
check "C2 drain_source_lane=review" \
  "$(echo "$OUT2" | jq -r '.task_board.qa[0].drain_source_lane')" "review"
check "C2 claimed_by unchanged for review origin" \
  "$(echo "$OUT2" | jq -r '.task_board.qa[0].claimed_by')" "dev-team (review-lane qa-drain)"

# ─────────────────────────────────────────────────────────────────────────────
# CASE 3 (I3) — MIXED batch: independent index sets, combined [rank, age] order
# review idx0 must NOT be deleted because done idx0 was picked, and vice versa.
# ─────────────────────────────────────────────────────────────────────────────
F3="$TMP/case3.json"
board '{
  "review": [
    {"id":"REV-KEEP-P3","status":"REVIEW","next_agent":"qa","priority":"P3","updated_at":"2026-08-01T00:00:00Z"},
    {"id":"REV-TAKE-P0","status":"REVIEW","next_agent":"qa","priority":"P0","updated_at":"2026-08-02T00:00:00Z"}
  ],
  "done": [
    {"id":"DONE-TAKE-P0","status":"DONE","next_agent":"qa","priority":"P0","updated_at":"2026-07-28T00:00:00Z"},
    {"id":"DONE-KEEP-P2","status":"DONE","next_agent":"qa","priority":"P2","updated_at":"2026-07-29T00:00:00Z"}
  ]
}' > "$F3"
OUT3="$(run_qa_drain "$F3" 2)"
check "C3 batch of 2 picks both P0s, oldest-first across BOTH lanes" \
  "$(echo "$OUT3" | jq -r '.task_board.qa | map(.id) | join(",")')" "DONE-TAKE-P0,REV-TAKE-P0"
check "C3 review[] keeps ONLY the unpicked review row (I3 — no cross-lane idx bleed)" \
  "$(echo "$OUT3" | jq -r '.task_board.review | map(.id) | join(",")')" "REV-KEEP-P3"
check "C3 done[] keeps ONLY the unpicked done row (I3)" \
  "$(echo "$OUT3" | jq -r '.task_board.done | map(.id) | join(",")')" "DONE-KEEP-P2"
check "C3 both picked rows share one claimed_at batch stamp" \
  "$(echo "$OUT3" | jq -r '[.task_board.qa[].claimed_at] | unique | length')" "1"
check "C3 head narrates the highest-ranked pick" \
  "$(echo "$OUT3" | jq -r '.head.active_task_id')" "DONE-TAKE-P0"
check "C3 head.next_agent=qa" \
  "$(echo "$OUT3" | jq -r '.head.next_agent')" "qa"

# ─────────────────────────────────────────────────────────────────────────────
# CASE 4 (I6) — DONE_VERIFIED / non-qa / BLOCKED rows in done[] are untouched
# ─────────────────────────────────────────────────────────────────────────────
F4="$TMP/case4.json"
board '{
  "done": [
    {"id":"DV-ROW","status":"DONE_VERIFIED","next_agent":"qa","priority":"P0","updated_at":"2026-07-01T00:00:00Z"},
    {"id":"DONE-NONQA","status":"DONE","next_agent":"po","priority":"P0","updated_at":"2026-07-01T00:00:00Z"},
    {"id":"DONE-BLOCKED","status":"BLOCKED","next_agent":"qa","priority":"P0","updated_at":"2026-07-01T00:00:00Z"}
  ]
}' > "$F4"
OUT4="$(run_qa_drain "$F4" 10)"
check "C4 qa-drain is a NO-OP when done[] holds only ineligible rows" \
  "$(echo "$OUT4" | jq -S -c . | md5 -q 2>/dev/null || echo "$OUT4" | jq -S -c . | md5sum | cut -d' ' -f1)" \
  "$(jq -S -c . "$F4" | md5 -q 2>/dev/null || jq -S -c . "$F4" | md5sum | cut -d' ' -f1)"
check "C4 qa[] still empty" \
  "$(echo "$OUT4" | jq -r '.task_board.qa | length')" "0"

# ─────────────────────────────────────────────────────────────────────────────
# CASE 5 (I5/AC-4) — SECONDARY drain stamps a done[] row IN PLACE
# ─────────────────────────────────────────────────────────────────────────────
F5="$TMP/case5.json"
board '{
  "done": [
    {"id":"DONE-NULL-NEXT","status":"DONE","next_agent":null,"priority":"P1","updated_at":"2026-07-21T19:29:49Z"}
  ]
}' > "$F5"
OUT5="$(run_sec_drain "$F5")"
check "C5 done[] row stays in done[] (no lane move)" \
  "$(echo "$OUT5" | jq -r '.task_board.done | map(.id) | join(",")')" "DONE-NULL-NEXT"
check "C5 status unchanged (never auto-promoted, AC-3)" \
  "$(echo "$OUT5" | jq -r '.task_board.done[0].status')" "DONE"
check "C5 null next_agent resolves to the po fallback (AC-4)" \
  "$(echo "$OUT5" | jq -r '.task_board.done[0].secondary_dispatch_target')" "po"
check "C5 secondary_claimed_by stamped" \
  "$(echo "$OUT5" | jq -r '.task_board.done[0].secondary_claimed_by')" "dev-team (review-lane secondary-drain)"
check "C5 secondary drain never touches .head" \
  "$(echo "$OUT5" | jq -r '.head.status')" "idle"
check "C5 no DONE_VERIFIED written (AC-3)" \
  "$(echo "$OUT5" | jq -r '[.. | strings | select(. == "DONE_VERIFIED")] | length')" "0"

# ─────────────────────────────────────────────────────────────────────────────
# CASE 6 — SECONDARY drain: oldest-first across the COMBINED pool, one/tick,
#          and it must stamp the row in the lane it actually lives in.
# ─────────────────────────────────────────────────────────────────────────────
F6="$TMP/case6.json"
board '{
  "review": [
    {"id":"REV-SEC-NEW","status":"REVIEW","next_agent":"ops","updated_at":"2026-08-05T00:00:00Z"}
  ],
  "done": [
    {"id":"DONE-SEC-OLD","status":"DONE","next_agent":"architect","updated_at":"2026-07-01T00:00:00Z"}
  ]
}' > "$F6"
OUT6="$(run_sec_drain "$F6")"
check "C6 oldest across BOTH lanes wins (done-origin here)" \
  "$(echo "$OUT6" | jq -r '.task_board.done[0].secondary_dispatch_target')" "architect"
check "C6 exactly ONE row claimed per tick" \
  "$(echo "$OUT6" | jq -r '[.. | objects | select(has("secondary_claimed_at"))] | length')" "1"
check "C6 the review[] row was NOT stamped this tick" \
  "$(echo "$OUT6" | jq -r '.task_board.review[0] | has("secondary_claimed_at")')" "false"

# ─────────────────────────────────────────────────────────────────────────────
# CASE 7 — both drains are total no-ops on an empty board (re-run safe)
# ─────────────────────────────────────────────────────────────────────────────
F7="$TMP/case7.json"
board '{}' > "$F7"
check "C7 qa-drain no-op on empty board" \
  "$(run_qa_drain "$F7" 10 | jq -S -c .)" "$(jq -S -c . "$F7")"
check "C7 secondary-drain no-op on empty board" \
  "$(run_sec_drain "$F7" | jq -S -c .)" "$(jq -S -c . "$F7")"

# ─────────────────────────────────────────────────────────────────────────────
# CASE 8 (I8, Component 6) — orch-cold-evict.sh must never evict status==DONE
# from done[]. Fixture: 12 ancient done[] rows (> KEEP_RECENT_DONE=10, all far
# older than DONE_MAX_AGE_DAYS=7) — 11 at DONE, 1 at DONE_VERIFIED. Pre-fix the
# preview evicts 2; post-fix it must evict ONLY the DONE_VERIFIED one.
# ─────────────────────────────────────────────────────────────────────────────
F8="$TMP/case8.json"
jq -n '
  { head: {status:"idle", active_task_id:null, next_agent:null},
    task_board: {
      backlog: [], ready: [], in_progress: [], qa: [], review: [],
      # 11 DONE rows dated 2026-01-02..2026-01-12 (rank 0..10 after the DESC
      # sort) + 1 DONE_VERIFIED row dated 2026-01-01 (rank 11, the oldest).
      # KEEP_RECENT_DONE=10 -> ranks 10 and 11 are the eviction candidates:
      # rank 10 = OLD-DONE-0 (status DONE), rank 11 = OLD-DV (DONE_VERIFIED).
      # Pre-fix that is 2 evictions; the Component-6 guard must reduce it to 1.
      done: ([range(0;11) | {id: ("OLD-DONE-\(.)"), status: "DONE",
                             created_at: ("2026-01-" + (. + 2 | tostring | if length == 1 then "0" + . else . end) + "T00:00:00Z")}]
             + [{id: "OLD-DV", status: "DONE_VERIFIED", created_at: "2026-01-01T00:00:00Z"}]),
      done_verified: [], active_sprints: [], closed_sprints: []
    },
    sprint_goal: {entries: []},
    signal_queue: {rows: [], archive: []},
    decision_journal: []
  }' > "$F8"

COLD_TMP="$TMP/archive"
mkdir -p "$COLD_TMP"
EVICT_LOG="$TMP/evict.log"
if ORCH_STATE="$F8" ARCHIVE_DIR="$COLD_TMP" bash "$COLD_EVICT" --dry-run > "$EVICT_LOG" 2>&1; then
  EVICT_DONE_N="$(grep -o 'done\[\]              would evict: [0-9]*' "$EVICT_LOG" | grep -o '[0-9]*$')"
else
  EVICT_DONE_N="ERROR($(tail -3 "$EVICT_LOG" | tr '\n' ' '))"
fi
check "C8 cold-evict never evicts a status==DONE row from done[] (only the DONE_VERIFIED one)" \
  "${EVICT_DONE_N:-none}" "1"

# ─────────────────────────────────────────────────────────────────────────────
# CASE 9 (Component 4) — the drain report surfaces the done[] lane
# ─────────────────────────────────────────────────────────────────────────────
check "C9 report script has a DONE-LANE PRIMARY section" \
  "$([ "$(grep -c 'DONE-LANE PRIMARY' "$REPORT")" -ge 1 ] && echo yes || echo no)" "yes"
check "C9 report script has a DONE-LANE SECONDARY section" \
  "$([ "$(grep -c 'DONE-LANE SECONDARY' "$REPORT")" -ge 1 ] && echo yes || echo no)" "yes"
check "C9 report script runs clean against the LIVE board" \
  "$(bash "$REPORT" 99999 >/dev/null 2>&1; echo $?)" "0"

# ─────────────────────────────────────────────────────────────────────────────
# CASE 10 (AC-6) — the starvation regression instrument runs on the live board
# and reports through the REAL scripts/lib/devteam-eligibility.jq predicate.
# ─────────────────────────────────────────────────────────────────────────────
check "C10 starvation report exits 0 on the live board" \
  "$(bash "$STARVE_REPORT" >/dev/null 2>&1; echo $?)" "0"
check "C10 starvation report threads the REAL eligibility lib" \
  "$([ "$(grep -c 'scripts/lib/devteam-eligibility' "$STARVE_REPORT")" -ge 1 ] && echo yes || echo no)" "yes"
check "C10 starvation report emits JSON with per-row unmet-dep reasons" \
  "$(bash "$STARVE_REPORT" --json 2>/dev/null | jq -r 'if (type=="object" and has("starved")) then "ok" else "bad" end')" "ok"

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "[test] ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
