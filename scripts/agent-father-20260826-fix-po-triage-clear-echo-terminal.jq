# scripts/agent-father-20260826-fix-po-triage-clear-echo-terminal.jq
# Task: FIX-PO-TRIAGE-INBOX-CLEAR-ECHO-PIPE-MANGLES-JSON-UNDER-ZSH-SILENT-NOOP
# agent-father terminal-state handoff after landing the echo->printf fix
# (commit 9434b1b73) in docs/agents/po/flow/triage-signals.md.
#
# Moves the row in_progress[] -> review[], stubbed to the complement of
# docs/data/orch/archive/backlog-detail.json's newly-appended cold entry
# (id="FIX-PO-TRIAGE-INBOX-CLEAR-ECHO-PIPE-MANGLES-JSON-UNDER-ZSH-SILENT-NOOP",
# detail_ref_added_by stamped there) — the full row (desc/ac/occurrence
# history/original giant status_note) exceeds
# scripts/orch-row-prose-ceiling-check.mjs's net-new-growth guard when
# crossing from in_progress[] (unscanned lane) into review[] (scanned lane),
# same class the FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION
# row-move (commit 60a10e802) hit and resolved the same way.
#
# related[] corrected in the same write: the umbrella id PO's status_note
# cited (FIX-SIGNAL-TYPE-ROUTING-GAP-cowork-fire) does not exist on the
# board (checked all lanes) — replaced with the real sibling
# FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED (left open,
# untouched, out of scope this hop).
#
# .head reset to idle in the SAME write (feedback_router_lane_move_must_
# reset_head_same_write) — active_task_id was pinned to this row.
#
# Usage: jq -f scripts/agent-father-20260826-fix-po-triage-clear-echo-terminal.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

.task_board.in_progress |= map(select(.id != "FIX-PO-TRIAGE-INBOX-CLEAR-ECHO-PIPE-MANGLES-JSON-UNDER-ZSH-SILENT-NOOP"))
| .task_board.review += [{
    "id": "FIX-PO-TRIAGE-INBOX-CLEAR-ECHO-PIPE-MANGLES-JSON-UNDER-ZSH-SILENT-NOOP",
    "type": "FIX",
    "status": "REVIEW",
    "priority": "P0",
    "size": "S",
    "zone": "docs/agents/po/flow/",
    "owner": "po",
    "next_agent": "po",
    "title": "PO's documented durable-inbox CLEAR block uses `echo \"$json\" | jq`, which zsh's echo corrupts on any payload containing a \\n escape — the CLEAR then silently no-ops behind its own `|| true` and the inbox never drains",
    "created_at": "2026-08-23T12:10:00Z",
    "created_by": "po/triage-20260823T1157Z",
    "dedup_key": "flow-actuator-defect:docs/agents/po/flow/triage-signals.md|durable-inbox-clear|echo-pipe",
    "files": ["docs/agents/po/flow/triage-signals.md"],
    "related": ["FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED", "FIX-QA-VC-LANEMOVE-PROSE-ONLY-NO-ORCHAPPLY-ACTUATOR"],
    "detail_ref": "docs/data/orch/archive/backlog-detail.json#FIX-PO-TRIAGE-INBOX-CLEAR-ECHO-PIPE-MANGLES-JSON-UNDER-ZSH-SILENT-NOOP",
    "dispatch_lane": "po",
    "promoted_at": "2026-08-25T20:00:30Z",
    "promoted_by": "po (triage-20260825T1937Z)",
    "claimed_at": "2026-08-26T00:48:57Z",
    "claimed_by": "dev-team (ready-lane consumer)",
    "po_manual_dispatch_flagged_at": "2026-08-24T23:58:30Z",
    "po_manual_dispatch_flagged_by": "po (manual-dispatch-sweep)",
    "po_manual_dispatch_class": "DRS-STRANDED-OFF-ALLOWLIST",
    "po_manual_dispatch_note": "po (manual-dispatch-sweep) surfaced DRS-STRANDED-OFF-ALLOWLIST candidate — folding into this tick's BATCH. FALL-THROUGH: rank-0 candidate FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED is unstampable (prose ceiling, occurrence 3 folded onto FIX-PO-MANUAL-DISPATCH-SWEEP-STAMP-REJECTED-BY-PROSE-CEILING-ON-ITS-OWN-TOP-CANDIDATE).",
    "occurrence_count": 2,
    "updated_at": "2026-08-26T00:59:33Z",
    "updated_by": "agent-father",
    "status_note": "TITLE CORRECTION (not renaming — head-pinned, orchStateSchema.ts superRefine enforces head->row referential integrity): this is a FAIL-LOUD ABORT, not a SILENT-NOOP. orch-apply refuses the empty candidate on the control-character parse failure and leaves the live file untouched — no partial drain occurs; impact is still total (CLEAR can never succeed under zsh) but the failure mode is strictly better than the title states. FIXED 2026-08-26 (commit 9434b1b73): both echo\"$var\"|jq call sites (lines 53-54) -> printf '%s' \"$var\"|jq; swept whole file, no other occurrence. Pre-fix zsh repro reproduced the exact live parse error; post-fix repro + full 2-line block dry-run (2-envelope fixture, one payload with a literal \\n) both pass. RELATED CORRECTED: the umbrella id previously cited here (FIX-SIGNAL-TYPE-ROUTING-GAP-cowork-fire) does not exist on the board (checked all lanes) — replaced with the real sibling FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED (same file, routing-table section, genuinely non-conflicting; left untouched in backlog[] this hop — its own status_note spans 10+ historical ticks and a dozen+ unrouted-type gaps, most since superseded by unrelated commits, so terminal-shaping it here risked a false verdict on scope not independently re-measured). Full original desc/AC/occurrence history relocated to detail_ref — row exceeded orch-row-prose-ceiling-check net-new-growth guard crossing in_progress[] (unscanned) -> review[] (scanned). next_agent=po to exercise the fixed CLEAR block on next live tick and confirm the 15-envelope inbox actually drains."
  }]
| .head = {
    "status": "idle",
    "updated_at": "2026-08-26T00:59:33Z",
    "updated_by": "agent-father",
    "active_task_id": null,
    "next_agent": null
  }
