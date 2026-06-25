# po-s113-bctc-sla-freshness-sibling-sequence.jq
# Single-pass DUAL in-place annotation (NO lane moves, NO priority change, NO new tasks).
#
# Context (2026-06-25 router signal router-bctc-sla-esc-20260625-0148, already RESOLVED by
# the prior pass that bumped FIX-BCTC-SLA-THRESHOLD-360 P3->P1 + promoted backlog->ready):
# the signal asked whether the SIBLING FIX-BCTC-SLA-FRESHNESS-EXCLUDE-TERMINAL (same file
# freshnessSlaChecker.ts, same freshness-age logic) should ride along / merge.
#
# PO decision: do NOT merge and do NOT bump. The two are DISTINCT:
#   - THRESHOLD-360 fixes the 3 RECURRENCE roots (legacy get_sla_status config divergence,
#     168h too-tight inter-quarter gap, push-age->host-down inference).
#   - FRESHNESS-EXCLUDE-TERMINAL is an orthogonal METRIC-SEMANTICS change (exclude url_not_found
#     terminal rows from freshness age) with its OWN verification gate; its own spec says it
#     "can be closed no-op" if THRESHOLD-360's done_verified shows SLA stable with terminal rows.
# So: SEQUENCE it AFTER THRESHOLD-360 (same file => avoid file-contention by serializing),
# keep it P3 backlog, let THRESHOLD-360's done_verified decide if it's needed at all.
#
# M1: annotate FRESHNESS-EXCLUDE-TERMINAL in backlog[] with sequence_after + po_sequence_note
#     (idempotent: marker-guarded on po_sequence_note==null).
# M2: annotate THRESHOLD-360 (wherever it lives) with po_sibling_decision (idempotent: guarded
#     on po_sibling_decision==null).
# CONSERVATION: every lane LENGTH byte-stable (pure in-place field edits).

def annotate_freshness:
  if .id == "FIX-BCTC-SLA-FRESHNESS-EXCLUDE-TERMINAL"
     and (.po_sequence_note == null)
  then
    .sequence_after = "FIX-BCTC-SLA-THRESHOLD-360"
    | .po_sequence_note = ("po-s113 " + $now
        + ": NOT merged into THRESHOLD-360 (router 06-25 asked). Distinct metric-semantics change, own verification gate. Sequenced AFTER THRESHOLD-360 (same file freshnessSlaChecker.ts -> serialize to avoid contention). MAY CLOSE NO-OP if THRESHOLD-360 done_verified shows SLA stable with terminal rows present. Kept P3 backlog; not promoted (would race same file).")
  else . end;

def annotate_threshold:
  if .id == "FIX-BCTC-SLA-THRESHOLD-360"
     and (.po_sibling_decision == null)
  then
    .po_sibling_decision = ("po-s113 " + $now
        + ": sibling FIX-BCTC-SLA-FRESHNESS-EXCLUDE-TERMINAL kept P3 backlog, sequenced AFTER this task (NOT merged) — orthogonal metric-semantics, may close no-op once this task's done_verified shows off-season SLA stable.")
  else . end;

.task_board.backlog |= map(annotate_freshness)
| .task_board.ready       |= map(annotate_threshold)
| .task_board.in_progress |= map(annotate_threshold)
| .task_board.backlog     |= map(annotate_threshold)
