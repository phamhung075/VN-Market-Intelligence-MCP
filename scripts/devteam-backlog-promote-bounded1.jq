# scripts/devteam-backlog-promote-bounded1.jq
#
# SYSREMAKE-P2-DEVTEAM-BACKLOG-PICKUP-BOUNDED1 — generalized backlog->ready
# promotion for the dev-team autonomous idle-capacity pickup step.
#
# Root cause (docs/agents/dev-team/flow/main.md head-idle fall-through,
# ~L492): with ready[]=0 and in_progress[]=0 and head.status=="idle", nothing
# in the flow ever promotes a plain BACKLOG/TODO row — the 305-row backlog
# pile is inert to automation. The only two scripts that move work
# (po-s108-idle-wip-promote-groom-terminal-backlog.jq,
# router-d1-claim.jq) are hand-run one-offs with HARDCODED task IDs.
#
# This script generalizes the po-s108 promote half with NO hardcoded IDs.
#
# BOUNDED-1 GATE (user-gated 2026-07-04, SYSREMAKE-P2-DEVTEAM-BACKLOG-
# PICKUP-BOUNDED1): proceed ONLY if WIP < 1 (i.e. WIP==0). WIP is defined as
# len(.task_board.ready) + len(.task_board.in_progress). This lane is
# INTENTIONALLY capped at 1 task in flight — do NOT raise this to wip_max=2
# (that is the existing, separate router/PO WIP budget for supervised/manual
# dispatch; this auto-pickup lane is bounded independently and more
# conservatively). If WIP >= 1 this script is a NO-OP (outputs the input
# document unchanged) — safe to re-run every tick without side effects.
#
# Selection (mirrors po-s108's promote intent, generalized):
#   - candidate lane: .task_board.backlog[]
#   - status in {BACKLOG, TODO} (both statuses are observed co-resident in
#     the backlog[] lane today — pre-existing SHG lane-coherence migration
#     drift; the coherence check treats this as a non-blocking WARNING, see
#     scripts/orch-apply.sh header)
#   - supervised != true — the Phase-1 supervised set (7 rows, held for
#     router-adjudicated dispatch, see .head.note in the live doc) is NEVER
#     auto-promoted by this script
#   - ordered by priority_rank ascending (0=highest: P0/critical,
#     1: P1/high, 2: P2/medium/normal, 3: P3/low, 9: missing/unrecognized —
#     priority values in the wild are a messy mix of "P0".."P3" and
#     "high"/"medium"/"low"/"normal"/"critical"/"NONE", case-insensitive),
#     tiebreak by original backlog[] array index (best-available FIFO proxy —
#     only ~18% of backlog rows carry a created_at timestamp, too sparse to
#     use as the primary sort key)
#   - exactly ONE row promoted per invocation (BOUNDED-1)
#
# Mutation (single row only):
#   backlog[] -> ready[] ; status BACKLOG/TODO -> READY ; stamp promoted_at /
#   promoted_by / promotion_note. Also stamps
#   .task_board.last_triaged_at / .task_board.last_triaged_by.
#
# NO hardcoded task-id literals anywhere in this file (grep-verified).
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/devteam-backlog-promote-bounded1.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Pointer: docs/agents/dev-team/flow/main.md § Idle-capacity backlog pickup
# (BOUNDED-1), inserted at the head-idle fall-through before Step 1 PO triage.

def priority_rank:
  ((.priority // "") | ascii_downcase) as $p
  | if   ($p | test("^p0$|^critical$"))              then 0
    elif ($p | test("^p1$|^high$"))                  then 1
    elif ($p | test("^p2$|^med(ium)?$|^normal$"))    then 2
    elif ($p | test("^p3$|^low$"))                   then 3
    else 9
    end;

def wip: ((.task_board.ready // []) | length) + ((.task_board.in_progress // []) | length);

if (wip >= 1) then
  .   # BOUNDED-1 GATE: WIP>=1 — refuse to promote (no-op, idempotent re-run-safe)
else
  ( [ .task_board.backlog
      | to_entries[]
      | select(.value.status == "BACKLOG" or .value.status == "TODO")
      | select((.value.supervised // false) != true)
      | { idx: .key, row: .value, rank: (.value | priority_rank) }
    ] | sort_by([.rank, .idx])
  ) as $candidates
  | if ($candidates | length) == 0 then
      .   # nothing eligible to promote — no-op
    else
      ($candidates[0]) as $picked
      | ($picked.row.id) as $picked_id
      | ($picked.row + {
            status: "READY",
            promoted_at: $now,
            promoted_by: "dev-team (bounded-1 auto-pickup)",
            promotion_note: ("BOUNDED-1 idle-capacity backlog pickup — WIP was 0; promoted top-priority "
              + "unsupervised BACKLOG/TODO row (priority_rank=" + ($picked.rank | tostring) + ")")
          }) as $ready_entry
      | .task_board.ready = ((.task_board.ready // []) + [$ready_entry])
      | .task_board.backlog = [ .task_board.backlog | to_entries[]
          | select(.key != $picked.idx) | .value ]
      | .task_board.last_triaged_at = $now
      | .task_board.last_triaged_by = "dev-team (bounded-1 auto-pickup)"
    end
end
