# po-s108-idle-wip-promote-groom-terminal-backlog.jq
#
# Single-pass IDLE-WIP triage + bulk backlog GROOM-to-ground-truth.
#
# Context (2026-06-19 dev-team throughput tick): WIP=0 (ready=0/in_progress=0,
# wip_max=2) during VN market hours with a 298-row backlog. Router flagged a "P0
# with idle capacity" promotion gap. RAW-verify showed the flagged P0
# (FIX-BCTC-LIAB-PRIOR-PERIOD) is status:DONE (merged 29245173, 5 RED->GREEN
# tests) — a STALE DONE row sitting in backlog[], NOT a promotion gap. The real
# gap = 50 terminal-status rows (38 DONE / 7 SUPERSEDED / 4 done_verified /
# 1 resolved) inflating the backlog count. Two genuinely-actionable HIGH tasks
# fill the idle slots.
#
# Mutations (all idempotent, atomic):
#   M1  PROMOTE VERIFY-COWORK-MACRO-SNAPSHOT-ENVELOPE backlog[]->ready[] (status
#       READY + promotion stamp + next_agent=cowork-team). LIVE MARKET-channel
#       risk (raw JSON envelope leak). Skipped if id already in a non-backlog lane.
#   M2  PROMOTE BPE-ARCH-1 backlog[]->ready[] (status READY + promotion stamp +
#       next_agent=architect). Recurring-bug-escalation SPIKE, no blocker.
#       Skipped if id already in a non-backlog lane.
#   M3  REPOINT canonical top-level .head at M1's first agent (cowork-team) ONLY
#       if head is idle (active_task_id==null) AND M1 promoted.
#   M4  GROOM: relocate every backlog[] row carrying a terminal status out of
#       backlog into its correct closed lane:
#         DONE / SUPERSEDED   -> done[]          (closed, kept verbatim)
#         done_verified       -> done_verified[]
#         resolved            -> done_verified[]
#       Guarded against dup (skip if id already present in the target lane).
#
# Harness gates (scripts/test-po-s108...sh — see header): CONSERVATION
# (backlog == pre - 2promotes - G groomed; ready == pre + (#promoted);
# done == pre + #DONE/#SUPERSEDED groomed; done_verified == pre + #dv/#resolved
# groomed; in_progress/review byte-stable; TOTAL across all lanes unchanged) +
# IDEMPOTENCY (re-run mutates 0).
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s108-idle-wip-promote-groom-terminal-backlog.jq \
#     docs/data/orch/orch-state.json
# Atomic: temp -> [ -s ] -> jq empty -> conservation -> rename.
# Commit orch-state by EXPLICIT PATH. PUSH HELD — PO out-of-band.

def lane_ids(p): (p // []) | map(if type=="object" then .id else . end);

# --- precompute membership of the non-backlog lanes (for promote dedup) ---
( lane_ids(.task_board.ready)
+ lane_ids(.task_board.in_progress)
+ lane_ids(.task_board.review)
+ lane_ids(.task_board.done)
+ lane_ids(.task_board.done_verified) ) as $nonbacklog
|
def is_terminal: (.status // "") | test("DONE|done_verified|RESOLVED|SUPERSEDED|resolved"; "i");

# classify a terminal row's target lane by its status string
def target_lane:
  (.status // "") as $s
  | if   ($s | test("done_verified|resolved"; "i")) then "done_verified"
    else "done"  # DONE + SUPERSEDED
    end;

# --- M1/M2 promotion specs ---
{
  "VERIFY-COWORK-MACRO-SNAPSHOT-ENVELOPE": "cowork-team",
  "BPE-ARCH-1": "architect"
} as $promote_map
|

# rows to promote (present in backlog, terminal-safe i.e. NOT already terminal, not already in a non-backlog lane)
([ .task_board.backlog[]
   | select(($promote_map[.id] != null))
   | select((.id as $i | ($nonbacklog | index($i))) | not)
   | .id ]) as $to_promote
|

# build promoted ready entries (stamped)
([ .task_board.backlog[]
   | .id as $rid
   | select(($to_promote | index($rid)) != null)
   | . + {
       status: "READY",
       next_agent: $promote_map[.id],
       promoted_at: $now,
       promoted_by: "po-s108",
       promotion_note: "idle-wip fill (WIP=0, wip_max=2, market hours) — genuinely-actionable HIGH, no blocker, not superseded"
     } ]) as $promoted_entries
|

# --- M4 groom: terminal rows in backlog, deduped against their target lane ---
(lane_ids(.task_board.done) | map(select(. != null))) as $done_ids
| (lane_ids(.task_board.done_verified) | map(select(. != null))) as $dv_ids
|
([ .task_board.backlog[]
   | select(is_terminal)
   | select(($promote_map[.id] // null) == null)   # never groom a row we're promoting (none are terminal, but belt+braces)
   | select(
       (target_lane) as $tl
       | .id as $i
       | if $tl == "done"
         then ($done_ids | index($i)) | not
         else ($dv_ids | index($i)) | not end
     )
   | .id ]) as $to_groom
|

([ .task_board.backlog[] | .id as $rid | select(($to_groom | index($rid)) != null) | select((.|target_lane)=="done") ]) as $groom_to_done
| ([ .task_board.backlog[] | .id as $rid | select(($to_groom | index($rid)) != null) | select((.|target_lane)=="done_verified") ]) as $groom_to_dv
|

# --- apply mutations ---
.task_board.ready = (.task_board.ready + $promoted_entries)
| .task_board.done = (.task_board.done + $groom_to_done)
| .task_board.done_verified = (.task_board.done_verified + $groom_to_dv)
| .task_board.backlog = ([ .task_board.backlog[]
    | .id as $rid
    | select((($to_promote | index($rid)) == null) and (($to_groom | index($rid)) == null)) ])
# M3 head repoint — only if idle AND M1 promoted
| ( if ((.head.active_task_id == null)
        and (($to_promote | index("VERIFY-COWORK-MACRO-SNAPSHOT-ENVELOPE")) != null))
    then .head = {
        status: "dispatching",
        active_task_id: "VERIFY-COWORK-MACRO-SNAPSHOT-ENVELOPE",
        next_agent: "cowork-team",
        next_action: "raw-verify live get_macro_snapshot envelope; fix cowork parse if raw JSON leaks to MARKET",
        wip: (.task_board.ready | map(select(.status=="READY")) | length),
        wip_max: (.head.wip_max // 2),
        updated_at: $now,
        updated_by: "po-s108",
        note: "idle-wip fill: promoted VERIFY-COWORK-MACRO-SNAPSHOT-ENVELOPE (LIVE MARKET-channel risk) + BPE-ARCH-1 (architect SPIKE); groomed terminal backlog rows to closed lanes"
      }
    else . end )
