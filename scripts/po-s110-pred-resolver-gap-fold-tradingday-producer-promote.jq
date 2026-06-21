# po-s110: fold the 2026-06-21 router-live diagnosis of the dashboard "Dự báo AI &
# Kết quả" (prediction-claims) feature into the EXISTING PRED-RESOLVER-GAP-FIX
# (dedup — NOT a new mint), enrich it with the two sharpened root-causes the prior
# framing missed, then PROMOTE backlog[]->ready[] (WIP=0, slot free, spec complete).
#
# Single-pass, idempotent:
#   M1 FOLD+ENRICH the existing PRED-RESOLVER-GAP-FIX row in-place:
#        - append a `.folded_evidence` marker (guards M1 idempotency)
#        - escalate the resolver "fetch actual_price" leg to the REAL mechanism
#          (calendar-vs-trading-day mismatch: exact-date OHLCV equality fails on
#           weekend/holiday resolution_date -> nearest-trading-day <= date match)
#        - add the PRODUCER leg (create_prediction_claim: calendar-day
#          resolution_date + neutral/null-target default = unscoreable claims)
#        - add a same-DB LIVE re-verify gate (self-confirming-test trap)
#        - PO product call on neutral predictions captured in `.product_decision`
#   M2 PROMOTE the row backlog[]->ready[] (status=READY + promotion stamps +
#        next_agent), skipped if id already in ANY non-backlog lane.
#   M3 REPOINT canonical top-level .head at the task's first agent ONLY if head
#        is idle (active_task_id==null) AND the promote happened this run.
#
# Idempotent: M1 marker-guarded (.folded_evidence), M2 guarded by non-backlog
# membership, M3 guarded by head.active_task_id==null -> re-run mutates 0.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s110-pred-resolver-gap-fold-tradingday-producer-promote.jq \
#     docs/data/orch/orch-state.json
#   (atomic temp -> [ -s ] -> jq empty -> conservation -> rename;
#    commit orch-state by EXPLICIT PATH)

def TID: "PRED-RESOLVER-GAP-FIX";

def in_nonbacklog($s):
  ( [ $s.task_board.ready[]?, $s.task_board.in_progress[]?,
      $s.task_board.review[]?, $s.task_board.done[]?,
      $s.task_board.done_verified[]? ] | map(.id) | index(TID) ) != null;

. as $s
| ($now) as $now
# ---- M1: fold + enrich the backlog row in-place (marker-guarded) ----
| .task_board.backlog |= ( map(
    if .id == TID and (has("folded_evidence") | not) then
      . + {
        priority: "P2",
        size: "M",
        folded_evidence: {
          folded_at: $now,
          folded_by: "po",
          source: "router-verified live diagnosis 2026-06-21 (named-vol /app/data/market.db via mcp-server bun:sqlite); dashboard 'Dự báo AI & Kết quả' reported not-working",
          dedup: "FOLDED into PRED-RESOLVER-GAP-FIX (same producer<->resolver contract bug, sharper root); did NOT mint a duplicate. Sibling DISTINCT tasks left untouched: FIX-PREDICTION-SIGNALS-EMPTY (prediction_signals poll write/threshold, different table), FIX-FB-PREDICTION-CALIBRATION-LOOP (poster forward-call ledger), FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP (done_verified, double-post).",
          do_not_touch: "digest-predict weekly slot cron '47 13 * * 0' is WORKING-AS-DESIGNED (weekly cadence) — NOT in scope.",
          live_proof: "prediction_claims = 9 rows, only 4 ever scored 0/1. ids 8,9 (VNINDEX/GAS neutral, due 2026-06-19) have OHLCV (1824.53 / 81200) yet pending forever (neutral leg). ids 6,7 (VIC/GAS bullish, due 2026-05-23) + id 1 (FPT neutral, due 2026-05-16=Saturday) have MISSING OHLCV on the EXACT resolution_date -> stranded -> unresolvable (trading-day leg).",
          root_cause_resolver_refined: "(A) CALENDAR-vs-TRADING-DAY mismatch: predictionResolutionJob.ts evaluateOutcome resolves by EXACT-date OHLCV equality (SELECT close FROM daily_ohlcv WHERE code=? AND date=resolution_date). create_prediction_claim computes resolution_date = creation + horizon_days CALENDAR days (evidenceTools.ts:378-380). When that date is a weekend/holiday there is NO bar -> never matches -> after RETRY_WINDOW_DAYS=5 marked unresolvable. This SUPERSEDES the prior 'actual_price never fetched' framing for ids 6/7 — the bar is missing on the exact date, not unfetched. (B) NEUTRAL unscoreable: evaluateOutcome (~lines 54-90) returns null for direction='neutral' (only bullish close>=target / bearish close<=target are scored).",
          root_cause_producer_new: "create_prediction_claim (evidenceTools.ts) defaults direction='neutral' + target_price=null when caller omits direction/expected_move_pct, AND computes resolution_date in CALENDAR days — so digest-predict (08-prediction-synthesizer) emits neutral/targetless claims with weekend-landing dates that can NEVER be scored. The resolver leg is half the contract; the producer leg is the other half.",
          fix_spec: [
            "RESOLVER: match nearest trading day <= resolution_date (first bar on/after as fallback) instead of exact-date equality, so weekend/holiday resolution_dates resolve against the prior/next available bar.",
            "PRODUCER: compute resolution_date in TRADING days at creation (skip weekends/holidays) so the target date always lands on a bar.",
            "NEUTRAL: per PO product_decision below — add a neutral-band resolution rule AND keep producing neutral claims (do NOT reject them).",
            "Never leave resolution_outcome NULL after resolved_at is set — any terminal path yields a non-NULL verdict or an explicit excluded-from-hitRate status."
          ],
          verification_gate: "SAME-DB LIVE re-verify (NOT green tests only — self-confirming-test trap, [[feedback_contract_from_live_payload_not_schema_comment]]): after fix+rebuild, query named-volume /app/data/market.db and confirm stuck ids 1,6,7,8,9 each carry a non-NULL resolution_outcome (or explicit excluded status), AND a NEW neutral claim with a weekend resolution_date resolves to a verdict. Tests build their own schema and will pass while the live DB stays stuck."
        },
        product_decision: {
          decided_at: $now,
          decided_by: "po",
          question: "product intent for neutral predictions (reject at producer vs add neutral-band resolution rule)",
          decision: "KEEP producing neutral claims; ADD a neutral-band resolution rule. Rationale: a calibrated AI track-record needs honest 'I expect this to stay flat' calls scored as hits/misses — silently dropping neutral predictions would bias the hit-rate toward only directional bets and hide the model's flat-call accuracy, violating the no-fake/full-accountability standing goals. Rule: over the horizon window, |actual_move_pct from creation_price| < NEUTRAL_BAND_PCT (default 2.0%, config not hardcoded) = HIT; |move| >= band = MISS. Requires creation_price to be persisted (already is) and a trading-day-anchored window (covered by the trading-day leg above). For legacy neutral claims with creation_price=NULL (e.g. id 1 FPT), no band can be computed -> mark an explicit terminal 'excluded' status (excluded from hitRate), never NULL.",
          band_default_pct: 2.0
        }
      }
    else . end
  ) )
# ---- M2: promote backlog -> ready (idempotent) ----
| if (in_nonbacklog($s)) then .
  else
    ( [ .task_board.backlog[] | select(.id == TID) ] ) as $hit
    | if ($hit | length) == 0 then .
      else
        .task_board.ready += [ ($hit[0] + {
          status: "READY",
          sprint: "READY",
          next_agent: "dev",
          promoted_at: $now,
          promoted_by: "po",
          promote_note: "WIP=0, head idle, spec complete after po-s110 fold/enrich. Routes to dev (apps/mcp-server) — single zone, no architect split needed (well-scoped resolver+producer contract). qa gate = SAME-DB live re-verify of stuck ids per .folded_evidence.verification_gate."
        }) ]
        | .task_board.backlog |= map(select(.id != TID))
      end
  end
# ---- M3: repoint canonical head iff idle AND promote happened ----
| if ( ([.task_board.ready[]?.id] | index(TID)) != null
       and (.head.active_task_id == null) ) then
    .head = (.head + {
      status: "in_progress",
      active_task_id: TID,
      next_agent: "dev",
      next_action: "Dispatch PRED-RESOLVER-GAP-FIX (dev, apps/mcp-server): fix prediction-claim producer<->resolver contract — nearest-trading-day OHLCV match + trading-day resolution_date + neutral-band rule. qa gate = SAME-DB live re-verify stuck ids 1,6,7,8,9. po-s110.",
      updated_at: $now,
      updated_by: "po",
      wip: ((.head.wip // 0) + 1)
    })
  else . end
