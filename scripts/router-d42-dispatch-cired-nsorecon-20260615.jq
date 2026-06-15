# Router dev-team — Step 3 execute-tier: dispatch the PO BATCH (2 independent lanes, WIP<=2).
#   [1] CI-RED-d20468c0-FIX  -> dev-mcp-server  (code lane; genuine bug, local b47f8846 reproduces all 8; HIGH)
#   [2] F-NSO-SELECTOR       -> ops-vps-fetch   (recon-first lead of the macro accuracy batch; F-BOP-QUERY-RECON sequenced AFTER it)
# Two lanes do NOT contend (apps/mcp-server vs apps/macro-indicators recon). dev-zone in_progress=[] pre-dispatch (RAW-verified).
# PO BATCH (agent a0fcdb8a9a4ba5e72) RAW-verified by router: both tasks READY; F-BOP-QUERY-RECON.sequence_after=F-NSO-SELECTOR (serialized).
# This write (ONE atomic temp->rename): CI-RED + F-NSO-SELECTOR READY->in_progress + dispatch markers; head po->dev (active_task_id=CI-RED primary). 0 new id-lines.
# GUARD: refuse unless head.next_agent=="po" AND CI-RED-d20468c0-FIX status=="READY" AND F-NSO-SELECTOR status=="READY".
# Usage: jq --arg now "$NOW" --arg ci "$CIAGENT" --arg nso "$NSOAGENT" -f scripts/router-d42-dispatch-cired-nsorecon-20260615.jq docs/data/orch/orch-state.json
def CI: "CI-RED-d20468c0-FIX";
def NSO: "F-NSO-SELECTOR";
($ARGS.named.now) as $now
| ($ARGS.named.ci) as $ciAgent
| ($ARGS.named.nso) as $nsoAgent
| ([.task_board.ready[]?,.task_board.backlog[]? | select(type=="object" and ((.id // "")==CI))][0]) as $ci
| ([.task_board.ready[]?,.task_board.backlog[]? | select(type=="object" and ((.id // "")==NSO))][0]) as $nso
| if (.head.next_agent != "po") then error("head.next_agent != po (\(.head.next_agent)) — refuse")
  elif ($ci == null or ($ci.status//"")!="READY") then error("CI-RED-d20468c0-FIX not READY (\($ci.status // "missing")) — refuse")
  elif ($nso == null or ($nso.status//"")!="READY") then error("F-NSO-SELECTOR not READY (\($nso.status // "missing")) — refuse")
  else . end
| def dispatch($id; $to; $agent):
    if (type=="object" and ((.id // "")==$id))
      then (. + {status:"in_progress", dispatched_at:$now, dispatched_to:$to, dispatch_agent_id:$agent})
      else . end;
  .task_board.ready = [ .task_board.ready[]? | dispatch(CI;"dev-mcp-server";$ciAgent) | dispatch(NSO;"ops-vps-fetch";$nsoAgent) ]
| .task_board.backlog = [ .task_board.backlog[]? | dispatch(CI;"dev-mcp-server";$ciAgent) | dispatch(NSO;"ops-vps-fetch";$nsoAgent) ]
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: CI,
    next_agent: "dev",
    note: "STEP-3 DISPATCH x2 (PO BATCH a0fcdb8a9a4ba5e72, router RAW-verified READY + dev-zone in_progress=[] pre-dispatch). [1] CI-RED-d20468c0-FIX -> dev-mcp-server (agent \($ciAgent)): GENUINE bug (router isolation-probe: local b47f8846 reproduces all 8 fails / 4 files; origin/main d20468c0 run 27516556457 RED). Visible root = FIX-BCTC-ENRICHER-PLACEHOLDER-URL TC-4: bctcQueueEnricher orphan-placeholder-reset arm NULLs source_url vs regression-guard expecting placeholder PRESERVED — reconcile rule vs contract + inspect the other 3 files (1138-market-portfolio-observability, 1352a-scheduler-job-wrappers-macro-marketscan, 239c-macro-refresh-integration). DoD: bun test green on 4 files + commit explicit-path; verification_gate=ci_green_on_subsequent_push (SHA != d20468c0). HIGH. [2] F-NSO-SELECTOR -> ops-vps-fetch (agent \($nsoAgent)): RECON-FIRST lead of the macro accuracy batch. Transport OK (proxy UP, NSO index ~85867 bytes) but NSO WordPress bai-top selector stale -> 0 article rows. ops curls live NSO/GSO on Vinahost VPS, captures new HTML structure + working selector + recipe -> recon doc; THEN dev-macro-indicators implements in cache_vmt_nso.go + parsers_vmt_gso_indicators.go. F-BOP-QUERY-RECON SEQUENCED AFTER this (sequence_after=F-NSO-SELECTOR; same owner/zone, NEVER parallel). MEDIUM. === Two lanes independent (mcp-server code vs macro-indicators recon) -> WIP<=2 OK. On dev-mcp-server return -> router RAW-verify gates (on-main, files in-zone, foreign-capture none, independent uncached bun test 4-files green) -> head dev->ops REBUILD mcp-server (force-recreate single svc, NEVER compose down) -> live CI re-verify (push SHA != d20468c0 turns origin green) -> done_verified. On ops-vps-fetch recon return -> head -> dev-macro-indicators implements F-NSO-SELECTOR, then F-BOP-QUERY-RECON recon. F-BOP-ENCODING stays done (done_verified WITHHELD pending F-BOP-QUERY-RECON real-data restoration). === HELD (unchanged): S2 07-06 methodology brief (agent-father); F3 cronJobCount (dev-mcp-server low); VMT-3a-PMI blocked-probe5; FIX-SBV-FX-VPS-FETCHER-UNHEALTHY + FIX-NEWS-VPS-CRASH-LOOP + OPS-POLLNEWS-NIGHT-ZERO + tinyproxy ACL-open hardening (ops/infra lane); 2x context-bloat (maintenance lane); FIX-FB-POSTER-NOARG-MARKET-TOOLS; Monday 2026-06-15 market-day gate (ARCH-CRON G1/G2/G3 + F-EOD LIVE re-verify); release batch CTG/VCB/D2D BLOCKED on undeployed bug #2776 (signal #6120); origin-divergence 133-ahead/6-behind DEFERRED (not a code bug). Commit explicit path only."
  }
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
