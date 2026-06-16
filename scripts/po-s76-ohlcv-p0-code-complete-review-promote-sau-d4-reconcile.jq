# po-s76-ohlcv-p0-code-complete-review-promote-sau-d4-reconcile.jq
#
# RECOVERY-TRIAGE single-pass triple-mutation reconcile (2026-06-16):
#
#   FINDING 1 — OHLCV-P0 code-complete-but-unpromoted (dispatcher tick never ran):
#     The dev-team worker that held lock task:FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0
#     shipped ALL 7 SUBTASKs to main HEAD (a719c138 SUBTASK-1 .. 8f087043 SUBTASK-7,
#     regression suite RAW-verified 29 pass / 0 fail) then went quiet WITHOUT advancing
#     the board lane; its lock then EXPIRED (04:03:05Z). So a P0's complete code sat
#     stranded in ready[]. The task is CODE-COMPLETE but NOT done_verified: its
#     verification_gate is LIVE post-rebuild RAW (rebuild mcp-server + RUN the SUBTASK-6
#     repair script against the named-volume DB to fix the 77 already-corrupt 06-16 rows
#     + RAW get_technical_indicators check on MARKET). That is a qa rebuild+live gate, not
#     a sign-off PO can grant from green unit tests.
#     -> RELOCATE ready[] -> review[] with code-complete provenance + next_agent=qa + the
#        live/rebuild/repair gate carried verbatim. NOT done_verified.
#
#   FINDING 3 — sau-d4 signals reconcile (both rows, id sau-d4-202606160300):
#     Row A "held lock ... has no orch-state task_board row" — STALE/false-positive: the
#       task IS in the board (ready[], now relocating to review[]); the auditor held-lock
#       check fired against an already-expired lock whose task is boarded.
#     Row B "active=TS2367 held=OHLCV mismatch" — reconciled: the head was correctly
#       repointed (po-s74) to the TS2367 push-unblocker while a dev-team worker still held
#       the OHLCV lock mid-implementation; both states were legitimate, now converged.
#     -> flip BOTH NEW -> RESOLVED with ground-truth resolution notes.
#
#   HEAD (Finding 2) is intentionally LEFT ON FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367
#     (the SOLE tsc-red, RAW-confirmed sole error this run; strands the 118-ahead fleet
#     push incl. the OHLCV commits) — dispatch-to-ba is the router's spawn action, this
#     script does NOT move the head. A reconcile note is stamped on .head so the next
#     reader knows the OHLCV drift is resolved and head-on-TS2367 is deliberate.
#
# Idempotent: OHLCV relocate guarded by review[] membership; signal flips guarded by
# status!="RESOLVED". Re-run mutates 0.
#
# Harness (caller): atomic temp -> [ -s ] -> jq empty -> CONSERVATION
#   (ready -1, review +1, in_progress/done/done_verified byte-unchanged, total unchanged;
#    signal NEW count -2) -> CAS mtime -> rename. Commit orch-state by EXPLICIT PATH.
#   PUSH HELD until TS2367 green (red pre-push hook strands fleet).
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s76-ohlcv-p0-code-complete-review-promote-sau-d4-reconcile.jq \
#      docs/data/orch/orch-state.json

def OHLCV: "FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0";

# --- guard: is OHLCV already in review[]? (idempotency) ---
(.task_board.review | any(.id == OHLCV)) as $already_in_review

# --- pull the OHLCV row out of ready[] (if present), enrich for review ---
| (.task_board.ready[]? | select(.id == OHLCV)) as $ohlcv_row
| .task_board.ready |= map(select(.id != OHLCV))

# --- append enriched row to review[] only if not already there ---
| .task_board.review |= (
    if $already_in_review then .
    else . + [
      ($ohlcv_row
        | .status = "REVIEW"
        | .next_agent = "qa"
        | .lane_moved_at = $now
        | .lane_moved_by = "po-s76"
        | .code_complete = true
        | .code_complete_evidence = {
            commits: [
              "a719c138 SUBTASK-1 ohlcvWriteService SSOT skeleton",
              "31306d76 SUBTASK-2 Writer D -> writeOhlcvBatch SSOT",
              "ac8e28a6 SUBTASK-3 UPSERT_INTRADAY + pushPricesHandler",
              "866dc899 SUBTASK-4 FR-G2/G3 sanity detectors",
              "647e773e SUBTASK-5 ohlcvSanityCheckEarly cron 00:45 UTC",
              "e4801dcc SUBTASK-6 fast-track repair script",
              "8f087043 SUBTASK-7 regression suite AC-T1..T8"
            ],
            regression_suite: "apps/mcp-server/src/__tests__/FIX-OHLCV-SEED-CANDLE-UNIT-SCALE.test.ts — RAW-verified 29 pass / 0 fail (po-s76, bun test, 2026-06-16)",
            note: "All 7 SUBTASKs committed to main HEAD. dev-team worker held the task lock through implementation then went quiet WITHOUT advancing the board lane; lock then expired 04:03:05Z. po-s76 RAW-re-ran the suite (29/0) before promoting ready->review."
          }
        | .qa_gate = "NOT done_verified — code complete only. qa MUST run the LIVE post-rebuild RAW verification_gate before sign-off: (1) REBUILD mcp-server (rebuild_required); (2) RUN the SUBTASK-6 repair script against the NAMED-VOLUME DB (not host ./data) to repair the 77 already-corrupt 2026-06-16 rows; (3) RAW get_technical_indicators VHM/VIC/VJC (real mid-band RSI, no single-digit) + AAA/ADS/x1000 tickers (not pegged RSI=100.0) via gateway call_tool; (4) BB Price= shows full 6-figure price; (5) named-volume daily_ohlcv has NO 06-16/future candle ~x1000/div1000 off prior real close for ALL 1203 tickers; (6) next 01:00Z briefing + 02:15Z TA scan show NO single-digit RSI / NO RSI=100.0 / NO 'giá 0 dưới BB' false breakouts on MARKET. GREEN gate also unblocks FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (review) + FIX-ALERT-OPEN-ZERO-PRICE-RACE (backlog HELD)."
      )
    ]
    end
  )

# --- stamp head reconcile note (head STAYS on TS2367 — no active_task_id change) ---
| .head.reconcile_note = "po-s76 (2026-06-16): OHLCV-P0 head-drift resolved — its 7-SUBTASK impl shipped to HEAD + 29/0 green, relocated ready->review (qa rebuild+live gate). Head deliberately STAYS on FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367: RAW-confirmed SOLE tsc-red this run (bun tsc --noEmit -> 1 error, TS2367 @ FIX-SIGNAL-CONFIDENCE-DEFAULT-50.test.ts:270); a red pre-push hook strands the 118-ahead fleet push incl. the OHLCV commits, so dispatch-this-to-ba FIRST. po-s76 does NOT move the head; router spawns ba."
| .head.reconciled_at = $now
| .head.reconciled_by = "po-s76"

# --- resolve both sau-d4 signal rows (NEW -> RESOLVED) ---
| .signal_queue.rows |= map(
    if (.id == "sau-d4-202606160300" and .status == "NEW") then
      if (.summary | test("has no orch-state task_board row")) then
        . + {
          status: "RESOLVED",
          resolved_at: $now,
          resolved_by: "po-s76",
          resolution: "STALE/false-positive: the task FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 IS in the board (was ready[], relocated to review[] this run). The auditor held-lock check fired against an ALREADY-EXPIRED lock (expired 04:03:05Z, dev-team owner) whose task is fully boarded. No orphan lock; no action needed beyond the lane promotion."
        }
      else
        . + {
          status: "RESOLVED",
          resolved_at: $now,
          resolved_by: "po-s76",
          resolution: "RECONCILED (not a real mismatch): head.active=FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367 (push-unblocker, set po-s74 01:31Z) and the held lock task:FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 (dev-team, expired 04:03:05Z) were BOTH legitimate concurrent states — the head was repointed to the push-unblocker while a dev-team worker still held the OHLCV lock mid-implementation. OHLCV impl now complete + promoted to review[]; head deliberately stays on TS2367 to clear the fleet push-block. Drift converged."
        }
      end
    else . end
  )
