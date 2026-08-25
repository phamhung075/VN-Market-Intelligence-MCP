# PO triage-20260825T1230Z — Write C: unrouted-type evidence + durable-inbox CLEAR.
# CLEAR is SUBTRACTIVE by envelope_id (never a blind = []) and covers ONLY the
# 17 envelopes whose type has a live Pipeline-A routing row. The 12 whose type
# does not are HELD BACK deliberately: scripts/audits/guard-signal-type-coverage.sh
# derives its live-type set from this same array, so clearing an unrouted type
# turns the CI signal-type-coverage-guard GREEN with the routing table untouched
# — green-because-the-input-was-deleted is indistinguishable from green-because-fixed.
($now) as $NOW
| ($routed) as $ROUTED

# ── (1) Structural row gets today's measured evidence ───────────────────────
| .task_board.backlog |= map(
    if .id == "FIX-SIGNALTYPE-OPEN-NAMESPACE-VS-CLOSED-ALLOWLIST-5TH-INSTANCE" then
      .occurrence_count = 6
      | .updated_at = $NOW
      | .updated_by = "po"
      | .po_evidence_20260825T1230Z = "6th INSTANCE, and this one isolates the producer. Measured live at 2026-08-25T12:40Z by hand-replaying the guard's read-only extractor against the Pipeline-A type column of docs/agents/po/flow/triage-signals.md (28 routed types) — the mutating script itself was deliberately NOT run, per FIX-GUARD-SIGNAL-TYPE-COVERAGE-CHECK-FLAG-MISLEADING-NOT-DRYRUN. Inbox depth 29, 15 distinct types, 7 UNROUTED: root-cause-confirmed, root-cause-corrected, root-cause-mechanism-found, wiring-gap-measured, flow-wiring-gap-controlled, cowork-tick-telemetry, notebook_undroppable_remainder_over_cap_breach. THE FINDING: SIX of those seven come from ONE producer, cowork-team, and every one is a fresh type minted for a single report — root-cause-confirmed / root-cause-corrected / root-cause-mechanism-found are three type names for THREE CONSECUTIVE REVISIONS OF THE SAME INVESTIGATION (07:42Z / 07:58Z / 12:15Z, all on the cycle-snapshot key derivation), not three kinds of signal. That is the open-namespace failure in its purest observable form: the producer is naming the CONTENT, not the KIND, so a closed allowlist can never converge no matter how many table rows agent-father adds. The 7th (notebook_undroppable_remainder_over_cap_breach) is the ordinary rename case and is already separately filed as FIX-SIGNAL-TYPE-ROUTING-GAP-notebook-undroppable-remainder-over-cap-breach. DESIGN INPUT, not a scope change: whatever this row lands must handle a producer that mints a new type per REPORT, not merely a producer that occasionally adds a type. All 12 envelopes carrying these 7 types were HELD BACK from this tick's inbox CLEAR so the CI guard stays honestly red — note they were fully TRIAGED (folded/minted) first, so the hold-back costs nothing but inbox depth."
    else . end
  )

# ── (2) Durable-inbox CLEAR — subtractive by envelope_id, routed types only ──
| .dev_team_idle_chain.pending_triage_inbox |= map(
    . as $e | select((($ROUTED | index($e.type)) == null))
  )
| .dev_team_idle_chain._updated_at = $NOW
| .dev_team_idle_chain._updated_by = "po"
| .dev_team_idle_chain.pending_triage_inbox_cleared_at = $NOW
| .dev_team_idle_chain.pending_triage_inbox_cleared_by = "po/triage-20260825T1230Z"
| .dev_team_idle_chain.last_po_triage_by = "po"
| .dev_team_idle_chain.pending_triage_inbox_hold_back_20260825T1240Z = {
    held: 12,
    cleared: 17,
    depth_before: 29,
    depth_after: 12,
    reason: "12 envelopes HELD BACK from the CLEAR, all fully triaged (folded or minted) first — held ONLY because their type has no Pipeline-A routing row in docs/agents/po/flow/triage-signals.md, and scripts/audits/guard-signal-type-coverage.sh derives its live-type set from this very array. Clearing them would turn the CI signal-type-coverage-guard green with the routing table untouched. Held types: root-cause-confirmed, root-cause-corrected, root-cause-mechanism-found, wiring-gap-measured, flow-wiring-gap-controlled, cowork-tick-telemetry, notebook_undroppable_remainder_over_cap_breach. Owning rows: FIX-SIGNALTYPE-OPEN-NAMESPACE-VS-CLOSED-ALLOWLIST-5TH-INSTANCE (structural, architect) and FIX-SIGNAL-TYPE-ROUTING-GAP-notebook-undroppable-remainder-over-cap-breach (the one non-cowork case). Release these the moment the table rows land."
  }
