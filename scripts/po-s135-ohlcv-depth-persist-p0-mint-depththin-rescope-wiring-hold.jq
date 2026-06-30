# po-s135 — INDICATOR-PROGRAM DEPTH-UNBLOCK triage (single-pass quad-mutation, idempotent)
#
# Origin 2026-06-30 (po-s135): router FOCUSED TRIAGE — the P1 momentum dashboard shipped
# end-to-end (tool->MCP->REST->frontend) but all 4 cards return honest-NULL. PO RAW-probed
# LIVE depth via gateway get_price_history days=730: VCB/SSI/MWG/HPG ALL return EXACTLY 49
# bars, ALL starting 2026-04-23 (uniform floor across watchlist AND non-watchlist names ->
# retention/purge WRITER signature, NOT a coverage gap). daily_ohlcv (mcp-server, read by
# get_price_history + TA repo + momentum tools) is depth-starved; the 2yr OHLCV-BACKFILL-P0
# did NOT persist. ROC-12-1 needs ~252-273 bars, 52w-high 252, MA200 200, RS-12m ~252 ->
# 49 bars fail ALL THREE -> roc/RS/52w NULL. (sector-rotation reads a SEPARATE table
# market_prices snapshot, 1 day -> distinct DEPTH_THIN owned by FIX-DEPTHTHIN-A.)
#
# Mutations:
#   M1 MINT  FIX-OHLCV-DEPTH-PERSIST-DAILY-OHLCV-2YR -> ready[] (P0 SPRINT-M, architect-first)
#            — the indicator-program critical path; supersedes the unverified depth gap of
#            OHLCV-BACKFILL-P0 (its done_verified live-check only probed shallow consumers).
#   M2 RESCOPE FIX-DEPTHTHIN-A in-place (stays backlog): P3->P2, target >=63 sessions, mark
#            DISTINCT-FROM the daily_ohlcv P0 (it owns market_prices_history / sector-rotation
#            + RRG only — a different table in a different service).
#   M3 HOLD  IND-P1-MOMENTUM-CONSUMER-WIRING in-place (stays backlog): add the P0 to depends[]
#            + hold_reason — wiring agents to read indicators is pointless while every reading
#            is NULL; gate on depth-P0 GREEN (+ FIX-FOREIGN-FLOW-COVERAGE for the foreign leg).
#   M4 ANNOTATE IND-ROADMAP-LEDGER.next_wave_ranking in-place: live_depth_correction — the
#            ranking assumed "126d backfilled" but live is ~49d; depth-P0 is a HARD prereq for
#            ranks 2/5/7/16; rank-1 VN-YIELD-CURVE is depth-INDEPENDENT -> parallel-eligible.
#
# Idempotent: M1 id-guard across ALL lanes; M2 guard .rescoped_by=="po-s135"; M3 guard
#             .held_by=="po-s135"; M4 guard .next_wave_ranking|has("live_depth_correction").
# Conservation: ready +1; backlog LENGTH byte-stable (M2/M3/M4 in-place); all other lanes
#               byte-stable; total +1.
# Head DELIBERATELY untouched (cleanly idle; dev-team triage adopts ready[] — PO does NOT spawn).
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/po-s135-ohlcv-depth-persist-p0-mint-depththin-rescope-wiring-hold.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# (orch-apply.sh does Zod + dup-key + CAS + atomic rename; PUSH HELD — fleet-push timer pushes.)

. as $root
# ---- id-presence guard for M1 (across every task-bearing flat lane) ----
| ([ $root.task_board | to_entries[] | .value | if type=="array" then .[] else empty end
     | if type=="object" then .id else . end ]) as $all_ids
| ($all_ids | index("FIX-OHLCV-DEPTH-PERSIST-DAILY-OHLCV-2YR")) as $p0_exists
# ---- M1: mint object ----
| ({
    id: "FIX-OHLCV-DEPTH-PERSIST-DAILY-OHLCV-2YR",
    status: "READY",
    type: "SPRINT-M",
    size: "M",
    priority: "P0",
    blocking: true,
    user_prioritized: true,
    zone: "apps/mcp-server/",
    owner: "architect",
    next_agent: "architect",
    sprint: "MARKET-INDICATOR-DEPTH-P0",
    title: "daily_ohlcv persists only ~49 bars (uniform 2026-04-23 floor across ALL tickers) despite OHLCV-BACKFILL-P0 (2yr) — root-cause the WRITER/retention/backfill-lookback and persist >=252 bars (target ~504/2yr). Indicator-program CRITICAL PATH: unblocks roc/RS/52w momentum cards + volatility/breadth gauges + the OHLCV-derived next-wave indicators.",
    supersedes_depth_gap_of: "OHLCV-BACKFILL-P0",
    live_evidence: "PO RAW-probe 2026-06-30T07:5xZ via gateway get_price_history days=730: VCB/SSI/MWG/HPG ALL return EXACTLY 49 bars, ALL starting 2026-04-23 (uniform floor = retention/purge signature; SSI+MWG are NON-watchlist yet present => NOT a coverage gap). get_roc_momentum tickers:[] null_reason=insufficient_cross_section; get_relative_strength market_rs_composite=null low_sample_warning=true; foreign_accum z=null. daily_ohlcv is shared volume market_data:/app/data DB_PATH=/app/data/market.db read by mcp-server get_price_history AND the TA repo AND the momentum tools.",
    root_cause_hypotheses: "(1) startup purge trims daily_ohlcv on boot (known lesson: OHLCV startup-purge defeats the backfill seeder — fix the WRITER not the residue); (2) a scheduled retention DELETE keeps only last-N rows; (3) ohlcvHistoryBackfillJob.ts per-ticker lookback defaults ~50 bars. RAW-confirm via SELECT code,COUNT(*),MIN(date),MAX(date) FROM daily_ohlcv GROUP BY code on the LIVE named volume. FIX the WRITER/retention durably; NEVER flat-seed.",
    required_depth: "52w-high-proximity=252 bars; ROC-12-1=~252-273; MA200 & %>MA200=200; RS-12m=~252; Z-score/percentile headroom (rv_252d-drawdown, RRG, risk-decomp) => target 2yr (~504). FLOOR=252, TARGET=504.",
    verification_gate: "After fix+rebuild+RESTART: (a) get_price_history VCB days=730 >=252 (target ~504) bars; (b) GROUP BY code shows >=252 across the traded universe; (c) get_roc_momentum + get_relative_strength + compute52WProximity return NON-NULL with real tickers[]. PERSISTENCE proven by RE-PROBE AFTER a container restart (not merely post-backfill) — the restart re-probe is the durable gate, because the failure mode is purge-on-boot.",
    generic_mandate: "Fix the retention/writer durably for the full traded universe (do NOT special-case the watchlist); re-run the existing ohlcvHistoryBackfillJob to refill; prove cross-restart persistence.",
    unblocks: ["IND-P1-MOMENTUM-CONSUMER-WIRING","IND-P1-SECTOR-RRG","IND-P1-RISK-DECOMPOSITION","IND-P1-REGIONAL-DECOUPLING","IND-P2-PARTICIPATION-BREADTH","momentum cards roc/RS/52w","P0 gauges breadth/volatility depth"],
    depends: [],
    created_by: "po-s135",
    created_at: $now,
    updated_at: $now
  }) as $p0_task
| .task_board.ready = (
    (.task_board.ready // [])
    + (if $p0_exists == null then [ $p0_task ] else [] end)
  )
# ---- M2 + M3: in-place edits over backlog[] (type-guarded) ----
| .task_board.backlog = (
    (.task_board.backlog // []) | map(
      if type=="object" and .id=="FIX-DEPTHTHIN-A-PRICE-HISTORY-RETENTION-10D" then
        (if (.rescoped_by? // "") == "po-s135" then .
         else . + {
           priority: "P2",
           rescoped_by: "po-s135",
           rescoped_at: $now,
           target_depth: ">=63 trading sessions (5d sector-rotation + ~63d RRG tail)",
           distinct_from: "FIX-OHLCV-DEPTH-PERSIST-DAILY-OHLCV-2YR",
           momentum_depth_note: "THIS task owns market_prices_history (stock-price service, snapshot table read by get_sector_rotation) retention only. The daily_ohlcv (mcp-server) depth that starves roc/RS/52w/MA200 is a SEPARATE table owned by the P0 FIX-OHLCV-DEPTH-PERSIST-DAILY-OHLCV-2YR — do NOT conflate."
         } end)
      elif type=="object" and .id=="IND-P1-MOMENTUM-CONSUMER-WIRING" then
        (if (.held_by? // "") == "po-s135" then .
         else . + {
           held_by: "po-s135",
           held_at: $now,
           depends: (((.depends // []) | if type=="array" then . else [.] end)
                     + (["FIX-OHLCV-DEPTH-PERSIST-DAILY-OHLCV-2YR"]
                        - ((.depends // []) | if type=="array" then . else [.] end))),
           hold_reason: "Wiring agents to READ the 4 momentum tools delivers ZERO analytical value while roc/RS/52w/foreign_accum all return NULL (PO RAW-verified live 2026-06-30). GATE on FIX-OHLCV-DEPTH-PERSIST-DAILY-OHLCV-2YR GREEN (roc/RS/52w real) + FIX-FOREIGN-FLOW-COVERAGE (the foreign_accum leg). Wire AFTER the readings are real."
         } end)
      elif type=="object" and .id=="IND-ROADMAP-LEDGER" then
        (if (.next_wave_ranking? and (.next_wave_ranking | has("live_depth_correction"))) then .
         else (.next_wave_ranking //= {})
              | .next_wave_ranking += { live_depth_correction: {
                  recorded_by: "po-s135",
                  recorded_at: $now,
                  live_daily_ohlcv_depth: "~49 bars (uniform 2026-04-23 floor) — NOT the 126d this ranking assumed; the 2yr OHLCV-BACKFILL-P0 did NOT persist.",
                  hard_prereq_gate: "FIX-OHLCV-DEPTH-PERSIST-DAILY-OHLCV-2YR (P0) is a HARD prerequisite for ranks 2 (SECTOR-RRG ~63d), 5 (RISK-DECOMP), 7 (REGIONAL-DECOUPLING 60d), 16 (PARTICIPATION-BREADTH 200d) — all consume daily_ohlcv depth.",
                  depth_independent_parallel: "rank 1 IND-P1-VN-YIELD-CURVE is depth-INDEPENDENT (TradingEconomics macro, no OHLCV) — the ONLY next-wave indicator not gated by daily_ohlcv depth; it can proceed in PARALLEL with the depth P0.",
                  sequencing: "depth-P0 (critical path) || VN-YIELD-CURVE (parallel, depth-independent); ALL other OHLCV-derived indicators + IND-P1-MOMENTUM-CONSUMER-WIRING gate on depth-P0 GREEN."
                } }
         end)
      else . end
    )
  )
# ---- metadata bump (root keys are underscore-prefixed; root schema is .strict()) ----
| ._updated_at = $now
| ._updated_by = "po-s135"
