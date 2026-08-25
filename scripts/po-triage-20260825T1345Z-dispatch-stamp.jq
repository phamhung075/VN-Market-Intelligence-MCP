# po-triage-20260825T1345Z-dispatch-stamp.jq
# manual-dispatch-sweep Step 2 stamp + the starvation row that same step reproduced.
# Owning flow doc: docs/agents/po/flow/manual-dispatch-sweep.md (Step 2 / Step 3)
# Usage: jq -f scripts/po-triage-20260825T1345Z-dispatch-stamp.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

("2026-08-25T14:01:00Z") as $now

| (.task_board.backlog[] | select(.id == "FIX-COWORK-DELPROOF-1-STEP53-TWOARM-GATE")) |=
    (. + { po_manual_dispatch_flagged_at: $now,
           po_manual_dispatch_flagged_by: "po (manual-dispatch-sweep)",
           po_manual_dispatch_class: "BACKLOG-XOR-GAP",
           po_manual_dispatch_note: "po (manual-dispatch-sweep) 2026-08-25T13:45Z: Step 1 returned 146 eligible candidates. The 3 top-ranked (FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED 34589B, FIX-PO-TRIAGE-INBOX-CLEAR-ECHO-PIPE-MANGLES-JSON-UNDER-ZSH-SILENT-NOOP 12249B, FIX-TRIAGESIGNALS-PIPELINEA-UNROUTED-RECURRINGBUG-AND-SPRINTREGISTRY-DANGLING-IDS 12156B) could NOT be stamped: all are past ORCH_ROW_PROSE_CEILING_BYTES=12000 and the Step-2 stamp is itself net-new prose growth, so orch-apply hard-rejects it. Reproduced live this tick; filed as FIX-PO-MANUALDISPATCH-STEP2-STAMP-BLOCKED-BY-PROSE-CEILING-STARVES-TOP-CANDIDATES. This row is the first STAMPABLE candidate by rank. Prose-gate read before selection per feedback_dispatch_gates_blind_to_prose_status_note_autoclaim_contraindicated_row: status_note is null, no contraindication found." })

| if ([.task_board.backlog[] | select(.id == "FIX-PO-MANUALDISPATCH-STEP2-STAMP-BLOCKED-BY-PROSE-CEILING-STARVES-TOP-CANDIDATES")] | length) == 0
  then .task_board.backlog += [{
    id: "FIX-PO-MANUALDISPATCH-STEP2-STAMP-BLOCKED-BY-PROSE-CEILING-STARVES-TOP-CANDIDATES",
    type: "FIX", size: "S", priority: "P1", status: "BACKLOG",
    zone: "cross-service/", owner: "po", next_agent: "developer",
    created_at: $now, created_by: "po/triage-20260825T1345Z", updated_at: $now, updated_by: "po",
    dedup_key: "orch-prose-ceiling:blocks-po-manual-dispatch-step2-stamp",
    files: ["scripts/orch-row-prose-ceiling-check.mjs", "docs/agents/po/flow/manual-dispatch-sweep.md"],
    title: "The prose-ceiling guard blocks manual-dispatch-sweep Step 2 from stamping any over-ceiling row, and Step 2 is the ONLY dispatch path for the DRS-STRANDED / BACKLOG-XOR-GAP classes — so the highest-priority candidates in those classes are permanently undispatchable, and they are over-ceiling precisely because they are the longest-stranded",
    root_cause: "docs/agents/po/flow/manual-dispatch-sweep.md Step 2 dispatches by writing four additive audit fields (po_manual_dispatch_flagged_at/_by/_class/_note) onto the selected row. That is net-new inline prose growth. scripts/orch-row-prose-ceiling-check.mjs hard-rejects net-new growth on any row already past ORCH_ROW_PROSE_CEILING_BYTES=12000, with no bypass env var by design. The sweep therefore cannot dispatch exactly the rows that have accumulated the most triage prose — and prose accretion is strongly correlated with how long a row has been stranded, which is the condition the sweep exists to cure. The feedback loop runs the wrong way: the longer a row is stranded, the more prose it accretes, the more certainly it becomes undispatchable.",
    evidence: "Reproduced live 2026-08-25T14:00Z by the sweep that hit it. Step 1 returned 146 eligible candidates. Step 2 on the top-ranked row aborted, verbatim: 'orch-row-prose-ceiling-check ABORTED — 1 row(s) with net new inline growth past ORCH_ROW_PROSE_CEILING_BYTES=12000: id=FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED live=34589B -> candidate=34897B' followed by 'orch-apply ABORTED: row prose ceiling check exit 1 — live file untouched'. Candidates ranked 2 and 3 measure 12249B and 12156B, both already over. PO fell through to rank 4 (2890B) to make any dispatch at all this tick. SECOND-ORDER, verified the same tick and load-bearing for the fix: the existing row that owns the adjacent symptom, FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS (ready[]), measures 11967B — 33 bytes under the ceiling. This finding could not be folded onto it, which is why it is a separate row rather than a fold.",
    ac: "(AC-1) The four po_manual_dispatch_* stamp fields must be writable on ANY row regardless of its prose size. They are bounded, machine-written coordination metadata, not narrative — the natural fix is to exempt a small NAMED allowlist of coordination fields from the byte count. Do NOT raise the ceiling (that defeats the guard) and do NOT make the sweep skip over-ceiling rows (that converts an accidental starvation into a designed one). Argue whichever is chosen. (AC-2) Same treatment for the numeric occurrence_count bump that FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS describes — one defect, two symptoms, fix together; shipping only one leaves the class open. (AC-3) POSITIVE CONTROL: replay the exact aborted write above against FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED (34589B) and show it lands. (AC-4) NEGATIVE CONTROL, non-substitutable: a genuine 500-byte narrative append to the same row must STILL abort — an exemption that degrades into a general bypass removes the guard, and there is deliberately no bypass env var today.",
    status_note: "Filed by the sweep that hit it, on its own tick, with the abort output quoted verbatim. Sibling of FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS (ready[], P1, developer) — same guard, same class, different blocked writer; that row could not absorb this because it is 33B from the ceiling itself.",
    dedup_checked: "2026-08-25T14:00Z: scripts/po-board-dedup-search.sh for /prose.?ceiling|occurrence.?bump/ -> 1 hit, FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS, read in full and rejected as a duplicate: it is scoped to the numeric occurrence_count bump on recurrence-tracking rows, names no dispatch path, and does not mention manual-dispatch-sweep or the DRS-STRANDED / BACKLOG-XOR-GAP classes.",
    related: ["FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS", "FIX-PO-MANUAL-DISPATCH-SKIP-STAMP-FIELD-MISMATCH-STARVES-SWEEP"],
    baseline_pass: null
  }] else . end

| .task_board._updated_at = $now
| .task_board._updated_by = "po"
