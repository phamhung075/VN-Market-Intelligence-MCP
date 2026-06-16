# po-s86-bctc-durability-arch-dispatch-backlog-hold.jq
# Single-pass tick triage (2026-06-16T10:30Z dev-team dispatch tick, 0 signals):
#   M1 DISPATCH: relocate ARCH-BCTC-PIPELINE-DURABILITY ready[] -> in_progress[]
#       as an ARCHITECT SPIKE (NOT a dev coding lane -> 0 coding-WIP consumed),
#       stamping dispatch_at / next_agent=architect / dispatch_note. This is the
#       single highest-leverage move: its children[] gate the 4 BCTC FIX tasks.
#   M2 HOLD-ANNOTATE (in-place, ready[] rows stay READY): stamp a per-task
#       hold_reason + held_on + held_by on the 7 remaining ready[] tasks so the
#       backlog is NOT silently stalled tick-after-tick. Two hold classes:
#         (a) design-gated on the ARCH brief now dispatched (4 BCTC children)
#         (b) shared-root cowork double-fire, needs design/BA pass (Root A/B/C)
#   Idempotent: M1 guarded by in_progress membership (re-run relocates 0);
#               M2 guarded by held_by marker presence (re-run annotates 0).
# Harness: CONSERVATION (ready -1, in_progress +1, others byte-stable, total
#   unchanged) + PLACEMENT (ARCH row in in_progress with next_agent=architect;
#   each of the 7 holds still in ready[] carrying hold_reason).
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/po-s86-bctc-durability-arch-dispatch-backlog-hold.jq \
#   docs/data/orch/orch-state.json
# (atomic temp -> [ -s ] -> jq empty -> conservation -> placement -> rename;
#  commit orch-state by EXPLICIT PATH; PUSH HELD — PO out-of-band call.)

(.task_board.ready) as $ready
| ($ready | map(select(.id == "ARCH-BCTC-PIPELINE-DURABILITY"))) as $arch_match
| (([.task_board.in_progress[].id] | index("ARCH-BCTC-PIPELINE-DURABILITY")) != null) as $arch_already

# --- hold-reason map (per-task disposition, written verbatim to the board) ---
| {
    "FIX-HNX-SESSION-COOKIE":
      "design-gated: child of ARCH-BCTC-PIPELINE-DURABILITY (dispatched architect 2026-06-16) — implements the durable HNX-session / discovery contract; dispatch as coding lane only AFTER brief lands.",
    "FIX-SSC-C111-EMPTY-FALLBACK":
      "design-gated: child of ARCH-BCTC-PIPELINE-DURABILITY — c3-fallback parse rule must conform to the brief's enrich fail-loud contract; paired-resolve with HNX-session fix. Hold until brief.",
    "FIX-BCTC-ZERO-URL-ALERT":
      "design-gated: child of ARCH-BCTC-PIPELINE-DURABILITY — implements the durable zero-result alerting contract the brief defines; do NOT hand-roll an alert path before the contract. Hold until brief.",
    "FIX-BCTC-FRESHNESS-GATE":
      "design-gated: child of ARCH-BCTC-PIPELINE-DURABILITY — implements the active last_success_age freshness gate per the brief's monitoring contract. Hold until brief.",
    "FIX-GATHERER-DOUBLEFIRE-DISPATCHER":
      "shared-root HOLD (Root A of offhours manual×cloud double-fire): thin stub, no fix_spec/files; cluster A/B/C must get a single design/BA pass so dedup+defer semantics are solved ONE way, not three. Not dispatched (no dev-ready spec).",
    "FIX-NEWSSCOUT-SIBLING-DEDUP-CACHE":
      "shared-root HOLD (Root B): SELF_SIGNALS_CACHE concurrent-sibling visibility — same dedup root as Root C; needs design/BA decomposition before a developer can implement. Not dispatched (no dev-ready spec).",
    "FIX-MARKETWATCHER-GW-CORROBORATION-GATE":
      "shared-root HOLD (Root C): Step-0-GW sibling-success corroboration gate — pairs with Root B's concurrency model; needs design/BA pass. Not dispatched (no dev-ready spec)."
  } as $holds

# --- M1: relocate ARCH SPIKE ready -> in_progress (idempotent) ---
| if $arch_already or ($arch_match | length) == 0 then .
  else
    .task_board.in_progress += [
      $arch_match[0]
      + {
          status: "IN_PROGRESS",
          next_agent: "architect",
          dispatch_at: $now,
          dispatch_by: "po",
          dispatch_note: ("DISPATCHED architect SPIKE 2026-06-16 dev-team tick — durable BCTC pipeline hardening brief (2nd-recurrence BCTC-VPS-PIPELINE-STALE escalation). NOT a dev coding lane (0 coding-WIP). Unblocks 5 children: HNX-SESSION-COOKIE, SSC-C111-EMPTY-FALLBACK, BCTC-ZERO-URL-ALERT, BCTC-FRESHNESS-GATE, + ENRICH-SILENT-0ROWS (already review). Output: docs/architecture-briefs/ contract enumeration.")
        }
    ]
    | .task_board.ready |= map(select(.id != "ARCH-BCTC-PIPELINE-DURABILITY"))
  end

# --- M2: annotate the 7 held ready[] rows in-place (idempotent on held_by) ---
| .task_board.ready |= map(
    if ($holds[.id] != null) and (.held_by == null) then
      . + {
        held_on: $now,
        held_by: "po",
        hold_reason: $holds[.id]
      }
    else . end
  )

# --- metadata bump ---
| .task_board.updated_at = $now
| .task_board.updated_by = "po"
