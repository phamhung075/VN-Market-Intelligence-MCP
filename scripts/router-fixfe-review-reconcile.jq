# Router board reconcile: FIX-FE-CHART-PRICE-DOMAIN in_progress[REVIEW] -> review[REVIEW] bucket move.
# dev-frontend (agent a1862e2c) committed 366bd297 (data-driven Y-domain + generic sanitizePrices) and
# self-promoted the task to status REVIEW + head.next_agent=qa, but left the task OBJECT in the
# in_progress[] array (status flipped, bucket not moved) and set head.status="REVIEW" (non-standard —
# head.status enum is in_progress|idle). This corrects the bucket (frees the dev WIP slot for accurate
# accounting) and normalizes head.status to "in_progress" (pipeline active, next_agent=qa). No status
# regression (stays REVIEW), no re-dispatch. RAW-verified by router: commit 366bd297 is HEAD with the 4
# frontend files; independent `tsc --noEmit` => exit 0; sanitizePrices is predicate-based (close===0&&vol===0
# drop + >10x-median forward-fill clamp) with ZERO per-ticker hardcode; Y-domain = min/max over
# candle∪MA∪BB * (1±0.06) via autoscaleInfoProvider. NOTE: frontend container is 41h stale (pre-change
# image) — ops MUST rebuild (--no-deps --force-recreate) BEFORE qa live multi-ticker acceptance.
# GUARD: refuse unless FIX-FE in in_progress[] with status REVIEW (exactly the dev-promoted state).
# Pointer: docs/agents/dev-team/flow/main.md (Step 0b reconcile on pipeline forward).
# Usage: jq --arg now "$NOW" -f scripts/router-fixfe-review-reconcile.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.in_progress // []) as $ip
| ([$ip[] | select(type=="object" and .id=="FIX-FE-CHART-PRICE-DOMAIN")][0]) as $fe
| if $fe == null then error("FIX-FE-CHART-PRICE-DOMAIN not in in_progress[] — refuse")
  elif ($fe.status != "REVIEW") then error("FIX-FE status != REVIEW (got \($fe.status)) — refuse")
  else . end
# remove FIX-FE from in_progress[]
| .task_board.in_progress = [$ip[] | select((type=="object" and .id=="FIX-FE-CHART-PRICE-DOMAIN") | not)]
# append to review[] (preserve task fields, stamp the reconcile + RAW-verify provenance)
| .task_board.review = ((.task_board.review // []) + [
    ($fe + {
      status: "REVIEW",
      next_agent: "qa",
      moved_to_review_at: $now,
      moved_by: "router",
      review_note: "Bucket reconcile (dev-frontend flipped status REVIEW but left task in in_progress[]). Dev pass RAW-verified GREEN: commit 366bd297 HEAD, independent tsc --noEmit exit 0, generic predicate sanitize + data-driven Y-domain. PREREQ: ops must rebuild frontend container (41h stale, --no-deps --force-recreate) BEFORE qa live multi-ticker acceptance (SHB/VCB/FPT: Y not zero-anchored, candles >=~50% pane, BB width <±15%)."
    })
  ])
# normalize head: status REVIEW -> in_progress (valid pipeline state), keep FIX-FE + next_agent=qa
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "FIX-FE-CHART-PRICE-DOMAIN",
    next_agent: "qa",
    note: "FIX-FE dev GREEN & RAW-verified (366bd297, tsc 0, generic all-ticker). Frontend container 41h stale -> ops rebuild --no-deps in flight; qa live multi-ticker acceptance (SHB/VCB/FPT) AFTER rebuild, then done_verified closes user chart bug end-to-end."
  }
