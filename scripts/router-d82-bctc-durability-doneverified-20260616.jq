# Router 2026-06-16 — BCTC pipeline-durability lane review -> done_verified (LIVE gate GREEN, router-run RAW).
#
# Two FIXes co-landed in apps/mcp-server @ commit b560ab68 (brief 2026-06-16-bctc-pipeline-durability.md, Contract 1+2).
# Router did NOT relay the ops/dev sub-agent badges (honors feedback_router_verify_raw_not_badges): it caught a prior
# force-recreate NO-OP first (stale image, code not live — feedback_force_recreate_no_build_stale_image), forced a REAL
# `docker compose build` + force-recreate (--no-deps, no peer disruption), then re-ran every gate FIRST-HAND.
#
# REBUILD IDENTITY (router-run RAW, epoch-compared — tz-proof):
#   image sha256:7e2abc78 .Created 2026-06-16T12:15:46Z (epoch 1781612146) POSTDATES commit b560ab68 (1781611382) by 764s.
#   container /app/src grep: F1 BCTC-ZERO-URL-ALERT=7 ensureBctcHealthStateTable=3; F2 queueGuardSql=9
#   FIX-BCTC-FRESHNESS-GATE=6; vn-bctc-fetch passive:true=0 (removed). health=healthy restarts=0, 13 containers Up.
#
# GUARD: refuse unless BOTH tids uniquely in review[] AND neither already in done_verified[]. CONSERVATION: total UNCHANGED.
# HEAD: reset from the stale dispatch pointer (active_task_id=FIX-BCTC-ZERO-URL-ALERT, rebuild_required=true) to idle/non-
#   dispatching + rebuild_required=false so the next dev-team tick falls to Step 1 triage. Remaining review[] (4 items, NOT
#   ours) each stay on their own gate — NOT auto-flipped.
# Usage: jq --arg now "$NOW" -f scripts/router-d82-bctc-durability-doneverified-20260616.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ["FIX-BCTC-ZERO-URL-ALERT","FIX-BCTC-FRESHNESS-GATE"] as $tids
| . as $root
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ($tids | map(. as $id | ($root.task_board.review        | map(select(.id==$id)) | length))) as $inreview
| ($tids | map(. as $id | ($root.task_board.done_verified | map(select(.id==$id)) | length))) as $indv
| if ($inreview | any(. != 1)) then error("a target tid not uniquely in review[] — refuse: " + ($inreview|tostring))
  elif ($indv | any(. > 0)) then error("a target tid already in done_verified[] — refuse")
  else . end
| {
    "FIX-BCTC-FRESHNESS-GATE": {
      root_cause:"vn-bctc-fetch health used passive:true — always reported healthy regardless of data freshness, masking the 34h+ silent BCTC-VPS outage (queue went stale with no alert).",
      fix_summary:"Replace passive:true with active freshness in DEFAULT_FRESHNESS_CONFIGS: health_status derived from MAX(last_attempt) WHERE status='done' in bctc_vps_queue, maxAgeMs=24h; queueGuardSql earnings-window guard returns 'idle' (not 'unhealthy') on empty-queue + no done in 7d (honest off-season quiet). Generic across all 5 VPS services.",
      fix_commit:"b560ab68",
      rebuild_evidence:"Router-run RAW (NOT relayed): real `docker compose build mcp-server` + force-recreate --no-deps. image sha256:7e2abc78 .Created 2026-06-16T12:15:46Z (epoch 1781612146) POSTDATES commit (1781611382) by 764s; container /app/src queueGuardSql=9 FIX-BCTC-FRESHNESS-GATE=6, vn-bctc-fetch passive:true=0; health=healthy restarts=0, 13 containers Up (no peer disruption).",
      live_gate_evidence:"Router-run RAW (NOT relayed) via get_vps_service_health + direct named-volume market.db read. vps_service_health written POST-rebuild (polled_at 2026-06-16T12:20:01.400Z > rebuild 12:15:53Z) => NEW active code executed. vn-bctc-fetch health_status=healthy, last_successful_run=2026-06-15 22:40:49 == MAX(last_attempt WHERE status='done') in bctc_vps_queue EXACTLY (active-path fingerprint; old passive code produced NO freshness value); response_time_ms=0 (DB freshness check, not HTTP); verdict correct (age ~13.6h < 24h). Idle-guard observed LIVE & generic: vn-foreign-flow + vn-price-fetch (no done rows) report 'idle' not false-healthy/false-unhealthy. STALE->unhealthy branch not live-observable (vn-bctc-fetch currently fresh); test-verified in FIX-BCTC-FRESHNESS-GATE.test.ts — NOT faking a stale row (no-fake-data goal).",
      generic_verified:"/goal#2 PASS — freshness logic applies to all 5 VPS services uniformly via DEFAULT_FRESHNESS_CONFIGS (queueGuardSql/queueGuardRecentMs defaults); no per-service/per-ticker literal. Live: 5 services evaluated, each idle/healthy verdict correct for its data state."
    },
    "FIX-BCTC-ZERO-URL-ALERT": {
      root_cause:"When the enricher returned 0 discovered URLs for ALL tickers cycle after cycle (the 34h+ silent BCTC-VPS outage), nothing alerted — the outage stayed invisible until a human noticed stale BCTC.",
      fix_summary:"Persist a consecutive-zero-URL cycle counter in bctc_health_state (SQLite KV); increment when urlsPopulated=0 AND itemsProcessed>0; reset to 0 on any urlsPopulated>0; skip itemsProcessed=0 (legit idle, no false increment). Fire ONE earnings-window-guarded aggregate BUG telegram when counter>=2, deduped <=1/6h.",
      fix_commit:"b560ab68",
      rebuild_evidence:"same rebuild as paired fix: image sha256:7e2abc78 .Created 12:15:46Z > commit b560ab68; container /app/src BCTC-ZERO-URL-ALERT=7 ensureBctcHealthStateTable=3.",
      live_gate_evidence:"Router-run RAW (NOT relayed): bctc_health_state table PRESENT in live named-volume market.db (created), counter row empty => default 0 — CORRECT live state for a healthy pipeline (recentDone7d=18, queue active, no zero-URL streak => no false alert). prod-wiring verified at code level: real sendTelegramBug fallback (opts.sendBugFn ?? import telegram.js), no-arg prod call safe via '= {}' default, call site startScheduler.ts:349; 14/14 fault-path tests green with 50 genuine assertions (counter 0->1->2, alert fires once, message contains BCTC-ZERO-URL-ALERT/'consecutive enricher cycles', reset-on-URL, dedup<6h, itemsProcessed=0 no-increment, aggregate-not-per-ticker).",
      monitored_gate:"ACTUAL alert FIRE is a condition-gated safety net: needs 2 consecutive enricher cycles returning 0 URLs for ALL tickers during an active earnings window — NOT forceable without sabotaging the live crawler (rejected: no-fake-data + reckless on prod). MONITORED — a real fire surfaces on BUG channel during the next genuine BCTC-VPS outage in an earnings window. done_verified basis: code live + table present + no-false-positive-live + real prod-wiring + green fault suite.",
      generic_verified:"/goal#2 PASS — counter + alert aggregate across ALL tickers ('N consecutive cycles returned 0 URLs for ALL tickers'), no per-ticker allowlist/literal; earnings-window guard is calendar-derived, not a date literal."
    }
  } as $ev
| ([.task_board.review[] | select(.id as $i | ($tids|index($i))!=null)]) as $moved
| .task_board.review = [ .task_board.review[] | select(.id as $i | ($tids|index($i))==null) ]
| .task_board.done_verified = ( .task_board.done_verified + [
      $moved[] | . + { status:"DONE_VERIFIED", done_verified_ts:$now, done_verified_by:"dev-team" } + $ev[.id]
    ] )
| .head = {
    status:"idle", updated_at:$now, updated_by:"dev-team",
    active_task_id:null, next_agent:null, rebuild_required:false,
    note:("ROUTER " + $now + " — BCTC pipeline-durability PROMOTED review->done_verified on LIVE gate GREEN (router-run RAW, NOT relayed). Caught a prior force-recreate NO-OP (stale image) first; real `docker compose build` -> image 7e2abc78 .Created 12:15:46Z > commit b560ab68; container /app/src markers present; vn-bctc-fetch passive:true removed. Contract 2 live: vps_service_health post-rebuild verdict last_successful_run==bctc_vps_queue MAX(done) 2026-06-15 22:40:49, healthy (13.6h<24h), idle-guard generic across services. Contract 1 live: bctc_health_state present, counter 0 (no false-fire on healthy pipeline); actual fire = MONITORED earnings-window gate. Head idle -> next tick Step 1 triage. Remaining review[]: FIX-SIGNAL-CONFIDENCE-DEFAULT-50, ARCH-SHIP-WAVE-REAUDIT, FIX-ALERT-ENGINE-RSI-SINGLEDIGIT, FIX-BCTC-ENRICH-SILENT-0ROWS (each own gate). PUSH held (PO out-of-band). Active coding lane=0.")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
