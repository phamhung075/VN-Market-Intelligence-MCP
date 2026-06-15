# po-s66-head-ssot-collapse-reconcile.jq
#
# DURABLE single-head-SSOT reconcile. Origin: signal
#   dev-team-20260615T2128Z-head-drift-po-s64-vs-task-board-head (RECURRING ROOT).
#
# PROBLEM (recurring, not one-off): orch-state carried TWO head pointers that
#   divergent writers updated independently:
#     - TOP-LEVEL `.head`  (written by po-s64, router-d1-claim, dev-team flow Step 0b)
#     - `.task_board.head` (written by po-s65 + two po-s54 scripts)
#   The dispatch SSOT that EVERY consumer reads is TOP-LEVEL `.head`:
#     - docs/agents/dev-team/flow/main.md Step 0b: `HEAD=$(jq -c '.head' ...)`
#     - docs/standards/orch-state-access.md §2: `.head` routing fields
#     - scripts/router-d1-claim.jq: "sets `.head`"
#   So po-s65 writing `.task_board.head` left top-level `.head` stale -> any
#   flow-resume mis-tracks.
#
# DECISION: TOP-LEVEL `.head` is the SINGLE canonical head SSOT (option a from the
#   signal — matches the flow read site + po-s64, lowest blast radius).
#   `.task_board.head` is DEPRECATED -> collapsed to a non-routing stub that points
#   readers back to the canonical field and makes any future write to it obviously
#   wrong (the durable schema fix; script-write-discipline fixed in the 3 writers).
#
# WHAT THIS PASS DOES (idempotent):
#   1. RECONCILE top-level `.head` -> the most-recent real dispatch
#      (FIX-ERRAUDIT-W1-MCP-P0, next_agent=ba, po-s65's intended value at
#      21:23:56Z — the live pipeline head; po-s64's BCTC-OCR stays tracked via its
#      own in_progress row + router lock, independent of the head pointer).
#   2. COLLAPSE `.task_board.head` -> deprecation stub (canonical_moved_to=".head").
#   3. FLIP the head-drift signal row NEW -> RESOLVED with disposition.
#
# Idempotent: head reconcile is a set; stub is a set; signal flip is CAS-guarded on
#   status=="NEW". Re-run = same bytes (modulo $now stamps).
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s66-head-ssot-collapse-reconcile.jq \
#      docs/data/orch/orch-state.json > /tmp/os.json \
#     && [ -s /tmp/os.json ] && jq empty /tmp/os.json \
#     && mv /tmp/os.json docs/data/orch/orch-state.json
#   (commit orch-state by EXPLICIT PATH only.)

def SIGNAL_ID: "dev-team-20260615T2128Z-head-drift-po-s64-vs-task-board-head";

# --- 1. canonical top-level .head = most-recent real dispatch (po-s65 intent) ---
.head = {
    status:         "active",
    updated_at:     $now,
    updated_by:     "po-s66",
    active_task_id: "FIX-ERRAUDIT-W1-MCP-P0",
    next_agent:     "ba",
    note: ("HEAD SSOT COLLAPSE + RECONCILE (po-s66, signal head-drift-po-s64-vs-task-board-head). "
        + "Top-level .head is now the SINGLE canonical dispatch SSOT (all consumers — dev-team flow Step 0b, "
        + "orch-state-access.md §2, router-d1-claim — read it). RECONCILED to the most-recent real dispatch: "
        + "FIX-ERRAUDIT-W1-MCP-P0 (next_agent=ba, dispatched 2026-06-15T21:23:56Z by po-s65, which had wrongly "
        + "written .task_board.head and left top-level .head stale at FIX-BCTC-BANK-PDF-OCR-RASTERIZE/po-s64 20:17:53Z). "
        + "FIX-BCTC-BANK-PDF-OCR-RASTERIZE stays in_progress (dev-pdf-extractor) tracked via its own in_progress row + "
        + "router lock — independent of this pointer; not blocked. ARCH-CRON-SCHEDULER-RELIABILITY architect-design lane "
        + "untouched. WIP<=2 honored (no dispatch change, pointer-only reconcile). DURABLE FIX: .task_board.head DEPRECATED "
        + "-> non-routing stub; 3 writer scripts (po-s65, po-s54-macro-accuracy-pair-promote, po-s54-vn-macro-ba-dispatch) "
        + "retargeted to top-level .head; canonical rule documented in orch-state-access.md §4. PUSH HELD (PO deferred call). "
        + "Commit orch-state by EXPLICIT PATH.")
  }

# --- 2. collapse .task_board.head -> deprecation stub (non-routing) ---
| .task_board.head = {
    status:                "deprecated",
    canonical_moved_to:    ".head",
    deprecated_at:         $now,
    deprecated_by:         "po-s66",
    active_task_id:        null,
    next_agent:            null,
    note: ("DEPRECATED — do NOT read or write this field. The canonical head SSOT is TOP-LEVEL .head "
        + "(read by dev-team flow Step 0b, orch-state-access.md §2, router-d1-claim). This field formerly "
        + "drifted from top-level .head because po-s65/po-s54 scripts wrote here while the flow read top-level .head "
        + "(signal head-drift-po-s64-vs-task-board-head). Any new script writing .task_board.head is a BUG — "
        + "write .head instead. Kept as a stub (not removed) so a legacy reader sees the redirect rather than a phantom "
        + "active_task_id.")
  }

# --- 3. flip the head-drift signal row NEW -> RESOLVED (CAS-guarded) ---
| .signal_queue.rows |= map(
    if (.id == SIGNAL_ID and .status == "NEW") then
      .status      = "RESOLVED"
    | .resolved_at = $now
    | .resolved_by = "po-s66"
    | .disposition = "DURABLE — single-head SSOT collapsed"
    | .resolution  = ("Canonical head SSOT = TOP-LEVEL .head (option a; matches dev-team flow Step 0b + "
        + "orch-state-access.md §2 + router-d1-claim, the existing read sites). LIVE DIVERGENCE RECONCILED: "
        + "top-level .head set to the most-recent real dispatch FIX-ERRAUDIT-W1-MCP-P0 (next_agent=ba, "
        + "po-s65 intent at 21:23:56Z); the stale FIX-BCTC-BANK-PDF-OCR-RASTERIZE pointer (po-s64) is superseded "
        + "(that task stays in_progress, tracked by its own row+lock). DURABLE FIX (recurring-root, not one-off): "
        + "(1) .task_board.head collapsed to a non-routing DEPRECATED stub redirecting to .head; "
        + "(2) the 3 scripts that wrote .task_board.head retargeted to top-level .head "
        + "(po-s65-error-audit-3wave-mint-dispatch.jq, po-s54-macro-accuracy-pair-promote.jq, "
        + "po-s54-vn-macro-ba-dispatch.jq — the last already mirrored, now single-write); "
        + "(3) canonical-head rule + 'never write .task_board.head' guard documented in "
        + "docs/standards/orch-state-access.md §4. No architect schema decision needed — the read SSOT already "
        + "existed; this aligns the writers to it. Reconcile script: scripts/po-s66-head-ssot-collapse-reconcile.jq.")
      else . end)

| ._updated_at = $now
| ._updated_by = "po-s66"
| .updated_at  = $now
| .updated_by  = "po-s66"
