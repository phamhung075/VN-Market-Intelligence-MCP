# Router forward-roll (ONE atomic write):
#  (a) CLAIM FIX-FE-CHART-PRICE-DOMAIN backlog[READY] -> in_progress[IN_PROGRESS] (next_agent=dev-frontend),
#      set head. depends [ALLZERO-OHLCV-FETCH] is satisfied (ALLZERO in done_verified[DONE_VERIFIED]).
#      Zone apps/frontend/ — non-colliding (in_progress empty). This is the 2nd half of the user's chart bug
#      (ALLZERO fixed the DATA; FIX-FE sanitizes the SERIES + computes a data-driven non-zero-anchored Y-domain).
#  (b) RECONCILE DOCLANG-T2..T6 backlog[DONE] -> done_verified[DONE_VERIFIED]. These are LEGITIMATELY done:
#      architect scaffold 5d121989 implemented serializer/usecase/wiring/tests; qa Phase-1 review 325c3cfc is
#      substantive (per-AC table + fence-false-green probe + 964-pass/3-pre-existing-fail); ROUTER independently
#      re-ran the doclang suite => 13/13 pass. pm closed the sprint (62cbddce) but its full-file rewrite left
#      T2..T6 mis-bucketed (status DONE while stranded in backlog[]). This corrects the bucket only — no status
#      regression, no re-dispatch (status already DONE so no agent would claim them).
# GUARDS (refuse via error() unless ALL hold):
#   - FIX-FE in ready[] status READY, depends_on==["ALLZERO-OHLCV-FETCH"], zone apps/frontend/
#   - ALLZERO-OHLCV-FETCH present in done_verified[] status DONE_VERIFIED (dependency truly satisfied)
#   - in_progress[] EMPTY (WIP slot free, no zone collision)
#   - ALL FIVE of T2..T6 in backlog[] with status DONE
# NOTE: the board has SEPARATE ready[] and backlog[] arrays — FIX-FE is in ready[], T2..T6 are in backlog[].
# Pointer: docs/agents/dev-team/flow/main.md (Step 0b reconcile + Step 3 router claim before spawn).
# Usage: jq --arg now "$NOW" -f scripts/router-fixfe-claim-doclang-reconcile.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (["DOCLANG-T2-SERIALIZER","DOCLANG-T3-ADAPTERS","DOCLANG-T4-USECASE","DOCLANG-T5-WIRING","DOCLANG-T6-TESTS"]) as $t26
| (.task_board.ready // []) as $rd
| (.task_board.backlog // []) as $bl
| ([$rd[] | select(type=="object" and .id=="FIX-FE-CHART-PRICE-DOMAIN")][0]) as $fe
| ([$bl[] | select(type=="object" and (.id as $i | $t26 | index($i)))]) as $done5
| (((.task_board.done_verified // [])[] | select(type=="object" and .id=="ALLZERO-OHLCV-FETCH") | .status) // "MISSING") as $allzero
| if $fe == null then error("FIX-FE-CHART-PRICE-DOMAIN not in ready[] — refuse")
  elif ($fe.status != "READY") then error("FIX-FE status != READY (got \($fe.status)) — refuse")
  elif (($fe.depends_on // $fe.depends // []) != ["ALLZERO-OHLCV-FETCH"]) then error("FIX-FE depends \(($fe.depends_on // $fe.depends)) != [ALLZERO-OHLCV-FETCH] — refuse")
  elif (($fe.zone // "") != "apps/frontend/") then error("FIX-FE zone \($fe.zone) != apps/frontend/ — refuse")
  elif ($allzero != "DONE_VERIFIED") then error("ALLZERO not done_verified (got \($allzero)) — dependency unmet, refuse")
  elif (((.task_board.in_progress // []) | length) != 0) then error("in_progress[] not empty \((.task_board.in_progress|map(.id?))) — slot busy, refuse")
  elif (($done5 | length) != 5) then error("expected all 5 of T2..T6 in backlog[], found \($done5|length) — refuse")
  elif (([$done5[] | select(.status != "DONE")] | length) != 0) then error("a T2..T6 not in DONE status — refuse reconcile")
  else . end
# (a) claim FIX-FE: remove from backlog, add to in_progress
| .task_board.in_progress = [
    ($fe + {
      status: "IN_PROGRESS",
      claimed_at: $now,
      claimed_by: "router",
      next_agent: "dev-frontend",
      dispatch_note: "Dispatched dev-frontend \($now). 2nd half of the user chart bug (DATA fixed by ALLZERO done_verified; now fix the FRONTEND render). GENERIC all-ticker, no per-ticker hardcode. TWO parts per handoff docs/handoffs/FIX-FE-CHART-PRICE-DOMAIN.md + board .scope/.acceptance: (1) SANITIZE the series BEFORE setData/computeMA/computeBB — drop/forward-fill close===0 && volume===0 rows + clamp obvious 1000x outliers (defense-in-depth behind ALLZERO). (2) DATA-DRIVEN Y-domain — compute price-pane domain from min/max over (candle high/low ∪ MA20 ∪ MA50 ∪ BB+ ∪ BB-), set [min*(1-pad), max*(1+pad)] pad~0.05-0.08, NEVER forced to 0; apply via priceScale autoscaleInfoProvider/explicit min-max. Files: StockChart.tsx, indicators.ts, api.price-history.$ticker.tsx, dashboard.technical.tsx. Accept on SHB~13.8k/VCB~61.6k/FPT~73.5k: Y not zero-anchored, candles >=~50% pane, BB width <±15%, no plot from close=0/1000x row. Run `pnpm --filter frontend check` + typecheck BEFORE commit (RED-PREPUSH strands fleet). Promote -> review (qa) on green + commit."
    })
  ]
# (a2) remove FIX-FE from ready[]
| .task_board.ready = [$rd[] | select((type=="object" and .id=="FIX-FE-CHART-PRICE-DOMAIN") | not)]
# (b) reconcile T2..T6: remove from backlog, append to done_verified with verify fields
| .task_board.backlog = [$bl[] | select((type=="object" and (.id as $i | $t26 | index($i))) | not)]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done5[]
    | . + {
        status: "DONE_VERIFIED",
        verified_at: $now,
        verified_by: "router",
        verify_note: "Bucket reconcile only (was DONE-status stranded in backlog[] after pm full-file rewrite 62cbddce). LEGITIMATELY complete: architect scaffold 5d121989 implemented the serializer/usecase/wiring/tests; qa Phase-1 review 325c3cfc substantive (per-AC table AC1-7+DoD/G12, fence-false-green probe with malformed XML, 964-pass/3-pre-existing-fail confirmed via git-stash HEAD~). Router independently re-ran the doclang suite => 13/13 pass. No status regression, no re-dispatch."
      }])
# (c) set head to the FIX-FE pipeline
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "FIX-FE-CHART-PRICE-DOMAIN",
    next_agent: "dev-frontend",
    note: "FIX-FE-CHART-PRICE-DOMAIN claimed (2nd half of user chart bug; ALLZERO data fix done_verified). dev-frontend: sanitize series + data-driven non-zero-anchored Y-domain, GENERIC all-ticker. Promote -> review (qa) on green pnpm --filter frontend check + commit. DOCLANG Phase 1 (T1-T6) all done_verified — sprint closed."
  }
