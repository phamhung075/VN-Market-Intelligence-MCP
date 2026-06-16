# po-s78 — RSI-SINGLEDIGIT + ZERO-PRICE-RACE disposition reconcile after OHLCV-P0 done_verified
#
# Context (2026-06-16T04:36Z): FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 (the ROOT cause) is now
# done_verified (qa cycle-276 + po-s77 sign-off): code+CI+deploy+live-data ALL RAW-verified GREEN,
# pending only the next-session BEHAVIORAL gate. This pass reconciles the two dependent rows.
#
# Mutation 1 (IN-PLACE on review[] FIX-ALERT-ENGINE-RSI-SINGLEDIGIT):
#   KEEP in review (do NOT promote to done_verified yet). Its own gate_red_disposition_note already
#   states: re-evaluate for done_verified ONLY after the P0 closes AND the same 2026-06-16-style
#   behavioral gate is RAW-GREEN. The P0 root is now CLOSED + HEALED (the DATA half of that gate is
#   green: canonical RSI VHM 35.7/VIC 36.2/VJC 27.3, no single-digit, no 100.0), but the BEHAVIORAL
#   half (next morning-briefing 01:00Z + first TA scan 02:15Z show majors mid-band, generic, match
#   canonical within 0.1pt) is provable only next session. Stamp a po-s78 disposition update recording
#   the root-fix state + the remaining behavioral half so the next dev-team tick can flip it on a green gate.
#   Idempotent: skipped if po_s78_disposition already present.
#
# Mutation 2 (IN-PLACE on backlog[] FIX-ALERT-OPEN-ZERO-PRICE-RACE):
#   KEEP HELD. depends[] = [RSI-SINGLEDIGIT, OHLCV-P0]. OHLCV-P0 now done_verified (one dep cleared);
#   RSI-SINGLEDIGIT still review-pending-the-shared-behavioral-gate. Its own hold_reason targets a
#   "clean post-fix market open" — exactly the behavioral gate that hasn't run. Update hold_reason to
#   reflect the partial dependency clearance + the single remaining release condition (behavioral gate GREEN),
#   so the next tick auto-releases backlog->ready when the gate observes a clean open.
#   Idempotent: skipped if po_s78_hold_update already present.
#
# Both are in-place field updates — NO lane moves. Harness CONSERVATION guard asserts all 6 lane
# lengths byte-unchanged. Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s78-rsi-singledigit-zeroprice-gate-reconcile.jq docs/data/orch/orch-state.json
# (atomic temp -> [ -s ] -> jq empty -> conservation -> invariant -> rename; commit orch-state by EXPLICIT PATH; PUSH HELD — router's call.)

# --- Mutation 1: RSI-SINGLEDIGIT disposition update (in place, idempotent) ---
.task_board.review |= map(
  if (.id // "") == "FIX-ALERT-ENGINE-RSI-SINGLEDIGIT" and (has("po_s78_disposition") | not)
  then . + {
    po_s78_disposition: {
      decision: "KEEP-IN-REVIEW — root fixed+deployed+healed, behavioral half pending next session",
      by: "po-s78",
      at: $now,
      root_status: "FIXED — FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 now done_verified (qa cycle-276 + po-s77 sign-off). The upstream synthetic seed candle + x1000/div1000 unit corruption that poisoned canonical RSI is killed at source (pushPricesHandler), guarded (FR-G2/G3 + ohlcvSanityCheckEarly cron), repaired (77 corrupt rows deleted 02:13Z), and deployed (image 1c6f739c @04:29Z, 13 containers healthy).",
      data_half_green: "router RAW 2026-06-16T04:33Z: canonical get_technical_indicators VHM 35.7 / VIC 36.2 / VJC 27.3 — real mid-band/oversold, NO single-digit, NO RSI=100.0, full 6-figure BB price. This task's own MIN_CANDLES=35 guard (commit c9892200, already rebuilt+live 2026-06-15T08:02Z) stands as the symptom mitigation; with canonical now un-poisoned, 'alert-engine matches canonical' is once again a coherent gate.",
      behavioral_half_pending: "SAME next-session gate as the P0 (shared): the next morning-briefing (01:00Z) + first TA scan (02:15Z) of the NEXT VN session must show the alert-engine TA-Alert RSI for majors at real mid-band (no single-digit, no 100.0), matching canonical get_technical_indicators within 0.1pt, GENERIC all tickers, with NO 'gia 0 duoi BB' false breakouts on MARKET. Provable only next session on the dev-team :07 tick after the queue refills post-rebuild.",
      done_verified_release_condition: "flip review->done_verified on the NEXT dev-team tick that RAW-observes the behavioral gate GREEN (clean post-fix market open). Until then HOLD in review — done_verified withheld per non-zero-values plausibility + behavioral-gate discipline. NOT a re-dispatch (code complete + rebuilt + live); a sign-off-on-observation only.",
      gate_red_superseded: "the 2026-06-16 RED verdict (canonical itself poisoned) is now SUPERSEDED — its named superseding task (OHLCV-P0) closed; the RED cause is gone."
    }
  }
  else . end
)

# --- Mutation 2: ZERO-PRICE-RACE hold update (in place, idempotent) ---
| .task_board.backlog |= map(
  if (.id // "") == "FIX-ALERT-OPEN-ZERO-PRICE-RACE" and (has("po_s78_hold_update") | not)
  then . + {
    po_s78_hold_update: {
      decision: "KEEP-HELD — one dep cleared, single remaining release condition = shared behavioral gate GREEN",
      by: "po-s78",
      at: $now,
      dep_state: "depends[] = [FIX-ALERT-ENGINE-RSI-SINGLEDIGIT, FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0]. OHLCV-P0 = done_verified NOW (one dep CLEARED). RSI-SINGLEDIGIT = review, pending the shared next-session behavioral gate. The seed-bar that was this task's actual gia=0 / partial-window source is now KILLED + deployed by the P0 (stop/mark+exclude the synthetic flat zero-vol O=H=L=C seed bar), so part of this task's mechanism may already be subsumed.",
      remaining_release_condition: "release backlog->ready ONLY after the NEXT VN session's market open (01:00Z briefing + 02:15Z + 02:00Z open scans) is RAW-observed CLEAN — i.e. the shared behavioral gate GREEN: NO gia=0 BB-breakout, NO single-digit open-window RSI self-normalizing later, NO new synthetic seed bar. If that open is clean, RE-SCOPE FIRST (the P0 seed-bar kill may have already eliminated this task's race surface — verify the open-window gia=0 path still reproduces before dispatching; possibly fold/close as subsumed rather than dispatch).",
      hold_holds: "Do NOT promote to ready[] this pass. The behavioral gate has not run post-rebuild."
    }
  }
  else . end
)
