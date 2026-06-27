# po-s107-ohlcv-vnm-garbage-annotate-bump.jq
#
# TARGETED TRIAGE (on-disk only; router RAW-confirmed the live finding 20260618T223046Z).
# The PO is gateway-blind — this script ONLY mutates the on-disk board. The router will
# RAW-verify this board edit then (a) execute the interim one-row DB repair on the named
# volume and (b) dispatch the durable writer-fix per next_agent.
#
# RAW GROUND TRUTH the router probed:
#   - get_technical_indicators(VNM) serves GARBAGE NOW: MA20=3,680,960 (~62x), BB Upper=35,257,301.
#   - Single bad row in named-vol daily_ohlcv (code=VNM, date=2026-06-01):
#       open=59,200 high=72,500,000 low=59,200 close=72,500,000 volume=0 data_env=NULL
#     ~1225x inflation (NOT a clean x1000), volume=0, data_env=NULL -> a WRITER wrote a bad bar.
#   - VNM-only, 1 row; no other ticker > 5M -> NOT fleet-wide; NOT a regression of a done task.
#   - Dedups to the UNBUILT FIX-OHLCV-SCALE-X1000-AUTO-REPAIR (the write-time auto-repair meant
#     to catch exactly this scale class).
#
# Mutations (all IN-PLACE on backlog[273]; idempotent via the live_garbage_evidence marker):
#   M1 ANNOTATE FIX-OHLCV-SCALE-X1000-AUTO-REPAIR with the RAW live bad row + the fact that a
#      served metric is ACTIVELY garbage right now.
#   M2 BUMP priority P3 -> P1 (a served metric is wrong NOW; [no-fake-data] is a STANDING GOAL;
#      LOW user_impact no longer holds — it is a live garbage-serve, raise to HIGH).
#   M3 WIDEN the scope/verification_gate so the fix is NOT keyed to a "clean x1000" only:
#      the live bar is a ~1225x non-clean-multiple vol=0 data_env=NULL bar -> the auto-repair
#      must reject/repair an implausible-magnitude bar regardless of being a clean power-of-1000,
#      AND identify which writer emitted a vol=0 / data_env=NULL bar (fix the WRITER per
#      [feedback_ohlcv_startup_purge_defeated_by_backfill_seeder], not just the residue).
#   M4 RECORD the interim router/ops action item (one-row surgical DB repair) in the task note,
#      since the named volume is reachable ONLY by the gateway/docker-capable router.
#   M5 PROMOTE backlog -> ready (status=READY, next_agent=dev-mcp-server) — WIP=0, slot free,
#      respects WIP<=2. po does NOT spawn; router dispatches via next_agent.
#
# Conservation: backlog -1, ready +1, all other lanes byte-stable. CONSERVATION + PLACEMENT +
# IDEMPOTENCY guards in the harness. Atomic temp -> [ -s ] -> jq empty -> guards -> rename.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#        jq --arg now "$NOW" -f scripts/po-s107-ohlcv-vnm-garbage-annotate-bump.jq \
#           docs/data/orch/orch-state.json

def TID: "FIX-OHLCV-SCALE-X1000-AUTO-REPAIR";

# Already promoted (in ready or beyond)? -> no-op (idempotent).
( [ .task_board.ready[]?, .task_board.in_progress[]?, .task_board.review[]?,
    .task_board.done[]?, .task_board.done_verified[]? ]
  | map(select(type=="object" and .id==TID)) | length ) as $already
| if $already > 0 then .
  else
    ( [ .task_board.backlog[] | select(type=="object" and .id==TID) ][0] ) as $row
    | if $row == null then .   # not found -> leave board untouched
      else
        ( $row
          + { status: "READY",
              priority: "P1",
              blocking: false,
              user_impact: "HIGH — get_technical_indicators(VNM) is serving GARBAGE NOW (MA20 ~62x inflated, BB Upper 35.2M vs price 59,200). Violates [no-fake-data] STANDING GOAL: a served metric is actively wrong. Supersedes the prior LOW assessment (no longer 'incident already healed' — there is a live un-repaired instance).",
              live_garbage_evidence: {
                probed_at: "2026-06-18T22:30:46Z",
                probed_by: "router (gateway-RAW)",
                served_metric: "get_technical_indicators(code=VNM)",
                served_garbage: { "MA5": 59200, "MA20": 3680960, "MACD_line": -703066, "BB_Upper": 35257301, "BB_Mid": 3680960, "BB_Lower": -27895381, "price": 59200 },
                bad_row: { table: "daily_ohlcv", code: "VNM", date: "2026-06-01", open: 59200, high: 72500000, low: 59200, close: 72500000, volume: 0, data_env: null },
                analysis: "~1225x inflation (NOT a clean x1000); volume=0 + data_env=NULL = abnormal, a WRITER emitted a bad bar. Row is inside 20-day window, outside 5-day -> poisons MA20/BB, leaves MA5 clean. Math verified: (19*~59k + 72.5M)/20 ~= 3.68M = reported MA20 exactly.",
                contamination_scope: "VNM-only, exactly 1 row; no other ticker has high/close/open > 5M (router scanned all of daily_ohlcv). NOT fleet-wide.",
                dedup_verdict: "Live un-repaired instance of the UNBUILT FIX-OHLCV-SCALE-X1000-AUTO-REPAIR. NOT a regression: FIX-OHLCV-STRANDED-ROWS-REPAIR-P1 (DONE_VERIFIED) was a one-time sweep this row post-dates/missed; OHLCV-UNIT-CONTAM closed; ARCH-OHLCV-WRITER-SSOT-DURABLE is design-only DONE."
              },
              scope: ( $row.scope
                + " | LIVE-WIDENED 2026-06-18 (po-s107): the live VNM 2026-06-01 bar is NOT a clean x1000 — it is a ~1225x, volume=0, data_env=NULL bar. The auto-repair MUST therefore reject/repair an IMPLAUSIBLE-MAGNITUDE bar (high/close vastly exceeding the DB prior real close AND a plausible daily band) regardless of being a clean power-of-1000, AND must treat volume=0 + data_env=NULL as a strong abnormal-bar signal. Per [feedback_ohlcv_startup_purge_defeated_by_backfill_seeder]: TRACE WHICH WRITER emitted a vol=0/data_env=NULL/72.5M bar into daily_ohlcv and fix that writer (the root), not only the write-time normalizer residue." ),
              verification_gate: ( $row.verification_gate
                + " | (e) LIVE: after the durable writer-fix ships + rebuild, get_technical_indicators(VNM) returns plausible MA20/BB (band-consistent with price ~59k), and a synthetic vol=0/data_env=NULL/implausible-magnitude bar (e.g. 72.5M vs prior ~59k) is rejected-or-repaired at write-time, NOT landed-and-flagged. (f) ROOT: the specific writer that emitted the live bad bar is identified and hardened (write-no-row / leave-gap, never a flat/inflated stub)." ),
              interim_action: {
                owner: "router/ops (gateway+docker-capable — named volume is NOT reachable by gateway-blind dev agents)",
                why: "stop serving garbage NOW, independent of the durable writer-fix",
                recommended: "WARRANTED — DELETE the single poisoned row (do not invent a value): DELETE FROM daily_ohlcv WHERE code='VNM' AND trade_date='2026-06-01' AND close=72500000 AND volume=0; (the matched-on-garbage predicate makes it surgical + safe). Leaving an honest 1-day gap is correct per [feedback_ohlcv_startup_purge_defeated_by_backfill_seeder] (illiquid/abnormal -> honest gap, never a fabricated bar). Then re-probe get_technical_indicators(VNM) to confirm MA20/BB return to a price-consistent band.",
                note: "If the real 2026-06-01 VNM bar is recoverable from a clean fetch source, the durable-fix dev may re-fetch it; the interim repair only removes the garbage so the served metric is no longer wrong while the writer-fix is built."
              },
              next_agent: "dev-mcp-server",
              promoted_by: "po-s107",
              promoted_at: $now,
              promote_reason: "Live served metric is GARBAGE NOW + [no-fake-data] STANDING GOAL violated -> P3->P1 bump; WIP=0 (slot free, respects WIP<=2); zone apps/mcp-server/ owner dev-mcp-server (OHLCV write/normalize owner per dispatch table)."
            } ) as $promoted
        | .task_board.backlog |= map(select((type=="object" and .id==TID) | not))
        | .task_board.ready = ( (.task_board.ready // []) + [ $promoted ] )
        # RETARGET (SSOT-W1-HEAD-METADATA-COLLAPSE): dispatch routing moved from .task_board.head
        # to canonical top-level .head (orch-state-access.md §4; dev-team flow Step-0b read site).
        | .head = {
            status: "ready",
            active_task_id: TID,
            next_agent: "dev-mcp-server",
            updated_at: $now,
            updated_by: "po-tick-20260618T223046Z",
            note: "po-s107: live VNM OHLCV garbage (get_technical_indicators(VNM) MA20 ~62x inflated) traced to 1 bad row daily_ohlcv VNM 2026-06-01 (72.5M, vol=0, data_env=NULL). Promoted FIX-OHLCV-SCALE-X1000-AUTO-REPAIR backlog->ready P3->P1, widened scope to implausible-magnitude/abnormal-bar reject + WRITER trace. Interim: router/ops one-row surgical DB delete (recorded in task.interim_action). Router: RAW-verify this edit, run interim repair, dispatch dev-mcp-server."
          }
      end
  end
| .task_board._updated_by = "po-tick-20260618T223046Z"
| .task_board._updated_at = $now
| ._updated_by = "po-tick-20260618T223046Z"
| ._updated_at = $now
