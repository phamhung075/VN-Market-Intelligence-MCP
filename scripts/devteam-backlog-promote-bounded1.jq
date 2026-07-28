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
# PICKUP-BOUNDED1; formula corrected 2026-07-22 —
# UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK): proceed ONLY if WIP < 1
# (i.e. WIP==0). WIP is `len(.task_board.in_progress)` ONLY — ready[] is a
# STAGING queue (promoted-but-not-yet-claimed work), not a concurrency
# signal; counting it (the pre-2026-07-22 formula was
# `len(ready)+len(in_progress)`) let a saturated ready[] lane (36 rows live
# 2026-07-21, most placed there by PM/architect decomposition, not by this
# script) permanently starve this gate — instance 9 on the count-threshold-
# gate class, see docs/agent-memory/decisions/sprint-UNBLOCK-DEVTEAM-
# DISPATCH-GATE-DEADLOCK-po.md. This lane is INTENTIONALLY capped at 1 task
# in flight — do NOT raise this to wip_max=2 (that is the existing, separate
# router/PO WIP budget for supervised/manual dispatch + the Supervised-Lane
# Sweep + the Ready-Lane Consumer; this auto-pickup lane is bounded
# independently and more conservatively). If WIP >= 1 this script is a
# NO-OP (outputs the input document unchanged) — safe to re-run every tick
# without side effects.
#
# Selection (mirrors po-s108's promote intent, generalized):
#   - candidate lane: .task_board.backlog[]
#   - status in {BACKLOG, TODO} (both statuses are observed co-resident in
#     the backlog[] lane today — pre-existing SHG lane-coherence migration
#     drift; the coherence check treats this as a non-blocking WARNING, see
#     scripts/orch-apply.sh header)
#   - `is_bounded1_eligible($detail_items; $status_map)` — see
#     scripts/lib/devteam-eligibility.jq for the full definition and every
#     gate's FIX-ID provenance (supervised / epic-wrapper / depends_on /
#     detail-deferred / non-dev-owner / plan-only / non-dev-next_agent).
#     Prior to UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (2026-07-22)
#     this file carried its OWN copy of every one of those predicates —
#     consolidated into the shared library per the design principle adopted
#     from SPIKE-BOUNDED1-ELIGIBILITY-CONTRACT-REVIEW ("one shared
#     detail-resolution contract vs hole-by-hole patches"): 4+ near-miss
#     defects in ~5 days came from exactly this kind of hand-copied logic
#     silently diverging across files.
#   - A row that is gated here AND is ALSO effective_plan_only is picked up
#     instead by the Supervised-Lane Sweep (SLS) —
#     scripts/devteam-backlog-promote-supervised-lane-sweep.jq — see
#     docs/agents/dev-team/flow/main.md § Supervised-Lane Sweep. A row
#     already sitting in `ready[]` with a resolved next_agent (e.g. PM/
#     architect epic-decomposition children, never routed through THIS
#     backlog->ready promotion at all) is picked up by the Ready-Lane
#     Consumer (RLC) — scripts/devteam-backlog-claim-ready-lane-consumer.jq.
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
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>; ALWAYS
# invoked from the project root — see scripts/lib/devteam-eligibility.jq
# header for why the `include` path below depends on that):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" \
#     --slurpfile detail docs/data/orch/archive/backlog-detail.json \
#     --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) \
#     -f scripts/devteam-backlog-promote-bounded1.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# `--slurpfile archive` (FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-
# MISSING, 2026-07-28): threaded into dep_status_map($archive) below so a
# depends_on entry whose predecessor was cold-evicted to
# docs/data/orch/archive/YYYY-MM.json (DONE_VERIFIED) still resolves
# SATISFIED instead of permanently MISSING — see
# scripts/lib/devteam-eligibility.jq dep_status_map($archive) header for the
# full root-cause + normalization contract.
#
# Pointer: docs/agents/dev-team/flow/main.md § Idle-capacity backlog pickup
# (BOUNDED-1), inserted at the head-idle fall-through before Step 1 PO triage.

include "scripts/lib/devteam-eligibility";

if (wip_in_progress >= 1) then
  .   # BOUNDED-1 GATE: WIP (in_progress only) >= 1 — refuse to promote (no-op, idempotent re-run-safe)
else
  (detail_items_from($detail)) as $detail_items
  | dep_status_map($archive) as $status_map
  | ( [ .task_board.backlog
      | to_entries[]
      | select(.value.status == "BACKLOG" or .value.status == "TODO")
      | select(.value | is_bounded1_eligible($detail_items; $status_map))
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
            promotion_note: ("BOUNDED-1 idle-capacity backlog pickup — WIP (in_progress) was 0; promoted top-priority "
              + "unsupervised depends_on-eligible BACKLOG/TODO row (priority_rank=" + ($picked.rank | tostring) + ")")
          }) as $ready_entry
      | .task_board.ready = ((.task_board.ready // []) + [$ready_entry])
      | .task_board.backlog = [ .task_board.backlog | to_entries[]
          | select(.key != $picked.idx) | .value ]
      | .task_board.last_triaged_at = $now
      | .task_board.last_triaged_by = "dev-team (bounded-1 auto-pickup)"
    end
end
