# =============================================================================
# scripts/po-s148-epic-parent-postdecomp-wip-reconcile.jq
# =============================================================================
# PO board-hygiene reconcile (idempotent): relocate 2 decomposed epic-parent rows
# that LINGER in in_progress[] after their pm-decomposition phase completed, holding
# the entire WIP<=2 concurrency budget and starving their own children in ready[].
#
# Reusable pattern for "an epic-wrapper parent was dispatched to pm for decomposition,
# pm minted the children into ready[] (+ any successor into backlog[]) and reset .head
# to idle, but nothing moved the PARENT out of in_progress[] — so a done-with-its-phase
# holder permanently consumes a WIP slot (the post-decomposition half of the
# epic-wrapper-closeout gap; feedback_epic_wrapper_closeout_gap_no_auto_revisit).
# Relocate each to backlog+BLOCKED epic-hold: frees the WIP slot NOW, is inert to every
# auto-pickup lane (BOUNDED-1/SLS require status in {BACKLOG,TODO}; BLOCKED excluded),
# is doubly protected by the is_epic_wrapper gate (inline children[] added), preserves
# every ruling/gate field, and stays dispatchable to owner=pm for closeout once children
# are all terminal." Same relocate-by-ground-truth shape as po-s142.
#
# GROUND TRUTH (RAW-verified 2026-07-22 by po, dev-team WIP-reconcile ask):
#   R1  DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING  in_progress -> backlog (BLOCKED)
#         Decomposition COMPLETE: pm minted 8 children T1-T8 (commit 95e0ba8a1,
#         2026-07-21) + sequenced/promoted T6 (commit d651b0eab, 2026-07-22 03:52).
#         LIVE children: T1,T2,T3,T4,T5,T7,T8 in ready[] (TODO), T6 in review[] (REVIEW).
#         Row body last touched 00:52Z by pm/decomposition; status_note "Decomposed into
#         8 atomic tasks T1-T8; T6 ships first". Parent's dispatched work (decomposition)
#         is DONE — remaining role is epic holder awaiting children. NOT abandoned,
#         NOT done-but-unflipped. Sat in_progress ~21h holding a WIP slot.
#   R2  FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD             in_progress -> backlog (BLOCKED)
#         Decomposition COMPLETE: pm minted 6 FR children into ready[] + minted the
#         fix_spec(b)/AC2 successor FIX-SPRINT-TASK-HEARTBEAT-LOCK into backlog[]
#         (commits fd401f51e, 638ecdc91). po_ruling HARD PRECONDITION (successor must
#         EXIST before parent may flip DONE) is SATISFIED — successor is live in backlog,
#         P0, depends=[FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD], origin_ticket matches.
#         architect_ruling itself endorses backlog+BLOCKED as "paused pending external
#         precondition" (precedent TASK_2005). NOT abandoned. Sat in_progress ~23h.
#
# The dev-team's "children never landed on the board / possible decomposition data-loss"
# premise was a jq false-NEGATIVE: `.task_board | to_entries[] | .value[]` throws
# "Cannot iterate over string" on the scalar lane keys (_updated_at, last_triaged_at,
# ...) and returns an incomplete/empty scan. The children DO exist as top-level rows in
# ready[]/review[] (not as inline .children of the parent). Verified array-safe.
#
# NOT flipped to done (children incomplete — wrong). NOT reset to ready as abandoned
# (would re-trigger decomposition — wrong). Relocated to a parked epic-hold state.
#
# STATUS/LANE COHERENCE (orchStateSchema.ts LANE_ALLOWED_STATUSES — HARD-FAIL):
#   backlog[] allows {BACKLOG, BLOCKED}. BLOCKED is the canonical "paused pending
#   precondition" sub-state (mandatory blocked_reason). TaskSchema is .passthrough()
#   so children[]/epic_hold/depends[] extra fields validate.
#
# Idempotent: each relocation guarded by SOURCE (in_progress) membership; children[]
# derived LIVE from the board at apply time (reflects real decomposition, no drift).
# Re-run mutates 0 (guards false once rows are already out of in_progress).
# Conservation: in_progress -2, backlog +2 (task_total unchanged).
#
# Args:  --arg now <ISO8601-UTC>
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/po-s148-epic-parent-postdecomp-wip-reconcile.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# =============================================================================

# --- capture source lanes BEFORE mutation ---
(.task_board.in_progress // []) as $ip
| (.task_board.backlog // []) as $bl
# --- derive LIVE child id sets across all array lanes (dynamic; no hardcoded drift) ---
| ([ .task_board | to_entries[] | select(.value|type=="array") | .value[]
     | select(type=="object") | (.id? // "")
     | select(test("^DESIGN-COWORK-FANOUT-T[0-9]")) ] | unique) as $fanout_children
| ([ .task_board | to_entries[] | select(.value|type=="array") | .value[]
     | select(type=="object") | (.id? // "")
     | select(test("^FIX-ORPHAN-FR[0-9]")) ] | unique) as $orphan_children
# --- presence guards (idempotency; jq `and` short-circuits so string rows are safe) ---
| ($ip | any(type=="object" and .id=="DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING")) as $has_fanout
| ($ip | any(type=="object" and .id=="FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD")) as $has_orphan
# --- extract original rows (null if already relocated) ---
| ($ip | map(select(type=="object" and .id=="DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING")) | .[0]) as $fanout_row
| ($ip | map(select(type=="object" and .id=="FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD")) | .[0]) as $orphan_row
# --- stamped BLOCKED epic-hold rows (merge preserves all ruling/gate fields) ---
| (($fanout_row // {}) + {
    status: "BLOCKED",
    children: $fanout_children,
    depends: $fanout_children,
    epic_hold: true,
    blocked_reason: "epic-hold (post-decomposition WIP reclaim): pm decomposition COMPLETE — 8 children DESIGN-COWORK-FANOUT-T1..T8 live (T1-5,7,8 ready/TODO, T6 review/REVIEW). Parent parked pending all children reaching DONE_VERIFIED, then owner=pm closes. Relocated out of in_progress[] to free the WIP<=2 slot it was holding (~21h) so the Ready-Lane Consumer can promote the starving children/CCATO/CI-fix rows.",
    decomposition_verified_at: $now,
    reconciled_by: "po-s148 (epic-parent-postdecomp-wip-reconcile)",
    updated_at: $now,
    updated_by: "po",
    status_note: "BLOCKED epic-hold. Decomposition DONE (children T1-T8 on board; T6 already in review). CLOSURE: flip to DONE only after ALL 8 children reach DONE_VERIFIED. Scope UNCHANGED per po_scope_confirmation_20260721T1842. Auto-close path: FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP (dispatch owner=pm) once children terminal — that sweep must be widened to scan backlog[] BLOCKED wrappers (currently ready[]/in_progress[] only)."
  }) as $fanout_blocked
| (($orphan_row // {}) + {
    status: "BLOCKED",
    children: $orphan_children,
    depends: $orphan_children,
    epic_hold: true,
    blocked_reason: "epic-hold (post-decomposition WIP reclaim): pm decomposition COMPLETE — 6 children FIX-ORPHAN-FR* live in ready[] + fix_spec(b)/AC2 successor FIX-SPRINT-TASK-HEARTBEAT-LOCK minted in backlog[]. Parent parked pending FR children DONE_VERIFIED. Relocated out of in_progress[] to free the WIP<=2 slot it was holding (~23h).",
    decomposition_verified_at: $now,
    successor_gate_satisfied: "FIX-SPRINT-TASK-HEARTBEAT-LOCK live in backlog[] (P0, depends=[FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD], origin_ticket=FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD, parent_fix_spec='fix_spec(b)/AC2') — po_ruling.closure_gate HARD PRECONDITION MET",
    reconciled_by: "po-s148 (epic-parent-postdecomp-wip-reconcile)",
    updated_at: $now,
    updated_by: "po",
    status_note: "BLOCKED epic-hold. Decomposition DONE (6 FR children in ready[]; AC2 successor exists). CLOSURE per po_ruling.q1=B: flip to DONE only after all FR children (fix_spec(a)+(c)/AC1+AC3) land + QA-verify AND successor row exists (already TRUE). supervised+plan_only preserved. Auto-close path: FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP dispatch owner=pm once children terminal (widen that sweep to scan backlog[] BLOCKED wrappers)."
  }) as $orphan_blocked
# --- rebuild lanes: drop the 2 rows from in_progress (keep strings + all other objects) ---
| .task_board.in_progress = ($ip | map(select(
      (type=="string")
      or (.id != "DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING"
          and .id != "FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD")
  )))
# --- append relocated rows to backlog ONLY if they were present in in_progress this run ---
| .task_board.backlog = ( $bl
    + (if $has_fanout then [$fanout_blocked] else [] end)
    + (if $has_orphan then [$orphan_blocked] else [] end) )
# --- board triage stamp ---
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po-s148"
