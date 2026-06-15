# po-s63-bctc-p0-promote-macro-spec-close-triage.jq
#
# Single-pass dev-team :07 triage (2026-06-15T18:30Z tick). Three atomic mutations:
#
#  (1) CLOSE the planning-complete SPEC tracking row BA-VN-MACRO-TOOLING:
#      in_progress -> done. Its whole pre-coding pipeline (BA spec 11d318ea -> architect
#      design 675891163d/9dbfcbbb -> pm breakdown 983af548 [20 tasks] -> probes f70d1b5a ->
#      probe-fold 9dbfcbbb) is COMPLETE and router RAW-reverified; the 20-task WAVE plan lives
#      in active_sprints[VN-MACRO-TOOLING]. This row consumed ZERO dev WIP (po_dispatch_note
#      "NO dev WIP consumed while held"); it is a planning deliverable, not a coding lane.
#      done_verified=false + a deferred note: the SPEC is shipped, but WAVE-1 dev fan-out
#      (tracked in active_sprints) is the next-phase coding work, dispatched on a later tick.
#      Closing it frees the in_progress slot it occupied.
#
#  (2) PROMOTE the #1 READY P0 FIX-BCTC-ENRICH-SILENT-0ROWS: ready -> in_progress with
#      dispatch stamps. TRUE root of the user-facing get_bctc_full(VCB/CTG)='Chua co du lieu
#      BCTC' outage + the cowork bctc-analyst '#2776' release-block (CTG/VCB/D2D). LEAD
#      route_to=dev-pdf-extractor (B02-TCTD bank-form parse/OCR), co_owner=dev-mcp-server
#      (enrich fail-loud). dev-pdf-extractor is a DISTINCT specialist lane not occupied by the
#      one remaining live coding task (ARCH-CRON-SCHEDULER-RELIABILITY = architect-design phase,
#      dev-mcp-server NOT yet coding it). Live SLA-BREACH corroboration: get_agent_signals
#      6225 'bctc source stale 2191min vs 360 threshold' confirms the outage is live NOW.
#
#  (3) UPDATE .head: directive consumed -> active_task_id=FIX-BCTC-ENRICH-SILENT-0ROWS now
#      IN_PROGRESS (dispatched, not awaiting-promotion), next_agent=dev-team for the fan-out.
#
# Idempotent: re-run mutates nothing (relocate guarded by done-membership; promote guarded by
# in_progress-membership). Harness: CONSERVATION (TOTAL across the 6 board arrays unchanged =
# pure relocation; in_progress net 0, ready -1, done +1) + HARD-CONSTRAINT (ARCH-CRON +
# all 4 review[] rows + active_sprints[VN-MACRO-TOOLING] byte-untouched).
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ);
#   jq --arg now "$NOW" -f scripts/po-s63-bctc-p0-promote-macro-spec-close-triage.jq \
#      docs/data/orch/orch-state.json
# (atomic temp -> [ -s ] -> jq empty -> conservation -> hard-constraint -> rename;
#  commit orch-state by EXPLICIT PATH; PUSH HELD — PO deferred call post-2026-06-16 gates.)

def macro_id: "BA-VN-MACRO-TOOLING";
def p0_id:    "FIX-BCTC-ENRICH-SILENT-0ROWS";

# already-applied guards (idempotency)
def macro_already_done: ([.task_board.done[].id] | index(macro_id)) != null;
def p0_already_in_progress: ([.task_board.in_progress[].id] | index(p0_id)) != null;

# ---- mutation (1): close the planning-complete SPEC row ----
( if macro_already_done then .
  else
    .task_board.done += [
      ( .task_board.in_progress[] | select(.id == macro_id)
        | .status = "SPEC-COMPLETE"
        | .lane = "done"
        | .done_at = $now
        | .done_by = "po"
        | .done_verified = false
        | .done_verified_deferred_note =
            "SPEC planning pipeline COMPLETE + router RAW-reverified (BA 11d318ea -> arch 675891163d/9dbfcbbb -> pm 983af548 [20 tasks] -> probes f70d1b5a -> probe-fold 9dbfcbbb). The 20-task WAVE plan is tracked in active_sprints[VN-MACRO-TOOLING]; WAVE-1 dev fan-out (6 zero-dep) is the next-phase CODING work, dispatched a later tick once a coding lane is free. This row consumed ZERO dev WIP while parked (po_dispatch_note). Closed here to free the in_progress slot; sprint-level done_verified gates on the macro skill switch-on (is_estimate=false) at VMT-7-REGISTER, NOT on this SPEC row."
        | .po_spec_close_note = "Closed by po-s63 dev-team :07 triage 2026-06-15T18:30Z to free the in_progress slot for the #1 user-facing P0 FIX-BCTC-ENRICH-SILENT-0ROWS. BA-VN-MACRO-TOOLING was a planning-complete SPEC tracking row (owner=ba, type=SPEC), not an active coding lane."
      )
    ]
    | .task_board.in_progress |= map(select(.id != macro_id))
  end )

# ---- mutation (2): promote the P0 ready -> in_progress ----
| ( if p0_already_in_progress then .
    else
      .task_board.in_progress += [
        ( .task_board.ready[] | select(.id == p0_id)
          | .status = "IN_PROGRESS"
          | .lane = "in_progress"
          | .dispatched_at = $now
          | .dispatched_by = "po"
          | .dispatch_tick = "dev-team :07 2026-06-15T18:30Z"
          | .po_promote_rationale =
              "#1 READY P0, TRUE root of user-facing get_bctc_full(VCB/CTG)='Chua co du lieu BCTC' + cowork bctc-analyst '#2776' release-block (CTG watchlist bank, 27 cycles BLOCKED). LEAD dev-pdf-extractor (B02-TCTD bank-form parse/OCR) is a DISTINCT specialist lane NOT occupied by the only live coding task (ARCH-CRON-SCHEDULER-RELIABILITY = architect-design phase). BA-VN-MACRO-TOOLING freed (planning-complete SPEC, zero dev WIP). Coding lanes after this promote: ARCH-CRON (architect-design, not coding) + this P0 = 1 active coding lane <= WIP cap. Live corroboration: get_agent_signals 6225 'bctc source stale 2191min vs 360 threshold'. GENERIC mandate (no per-ticker allowlist), fail-loud on 0-rows enrich, done_verified = real VARIED rows vs named-volume market.db (never host ./data, never a badge)."
        )
      ]
      | .task_board.ready |= map(select(.id != p0_id))
    end )

# ---- mutation (3): update .head (directive consumed/advanced) ----
| .head.status = "active"
| .head.updated_at = $now
| .head.updated_by = "po"
| .head.active_task_id = p0_id
| .head.next_agent = "dev-team"
| .head.note =
    "PO TRIAGE 2026-06-15T18:30Z (dev-team :07 tick, off-market VN 01:26). PROMOTED the #1 user-facing P0 FIX-BCTC-ENRICH-SILENT-0ROWS ready->in_progress (now DISPATCHED) -> dev-pdf-extractor leads (B02-TCTD bank-form parse/OCR) + dev-mcp-server pairs (enrich fail-loud). This is the TRUE root of get_bctc_full(VCB/CTG)='Chua co du lieu BCTC' AND the cowork bctc-analyst '#2776' release-block (CTG watchlist bank 27 cycles). FREED the lane by closing BA-VN-MACRO-TOOLING in_progress->done (SPEC-COMPLETE): its whole planning pipeline (BA->arch->pm->probe->probe-fold, all router RAW-reverified) is done + the 20-task WAVE plan lives in active_sprints[VN-MACRO-TOOLING]; that row consumed ZERO dev WIP (planning deliverable, not a coding lane). Coding lanes now: ARCH-CRON-SCHEDULER-RELIABILITY (architect-design phase, NOT coding) + this P0 = 1 active coding lane, within WIP<=2. review[] (4): NONE done_verifiable this tick — FIX-VNSTOCK-TRADINGSTATS-CRASH gate UNMET until 2026-06-16 08:30Z sweep (host-decoy caught ea4d4e74); FIX-SIGNAL-CONFIDENCE-DEFAULT-50 needs organic non-50 confidence_score DB spread (not exposed on tool surface, NO green-badge promote); FIX-ALERT-ENGINE-RSI-SINGLEDIGIT gate = next market-open MARKET echo (off-market now, no new alert-commander alerts); ARCH-SHIP-WAVE-REAUDIT PARKED. Context-bloat signals (claude-manager-helper 108L / ops 90L / ops-vps-fetch 196L) RESOLVED by Pass-5b (1e6b4e2d/3c9751fb/f35d605c) — all under cap, NO janitor. PUSH HELD (PO post-2026-06-16-gates; origin ~57 behind benign cloud-chore). Script: scripts/po-s63-bctc-p0-promote-macro-spec-close-triage.jq."
