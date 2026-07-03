# Router dev-team tick (fire-election 2026-07-03T20:07Z): dispatch B-05-FU-SSC-503-RETRY ready[] -> in_progress[] (owner=dev-vps-crawls).
# PO ad2eb2ab0dafcb3f7 RETURN BATCH (1 FIX, scope-corrected from inverted 60s-retry spec -> fail-fast <5s) + promoted backlog->ready (po-s138).
# Router RAW-verified (2026-07-03T20:22Z): ready[] has status=READY next_agent=dev-vps-crawls zone=vps-crawls/ scope_corrected=true; 0 backlog dup; head idle untouched;
#   0 raw-UUID on PO files + orch-state added lines; fix target vps-scripts/discover-bctc-urls-browser.py is repo-tracked.
#
# FIX SCOPE (PO-corrected): in _ssc_curl_search() step1 of vps-scripts/discover-bctc-urls-browser.py, bound the SSC curl with a hard
#   wall-clock cap STRICTLY UNDER the mcp-server discovery timeout (read the caller value from apps/mcp-server first; e.g. curl --max-time 4)
#   and REMOVE the 60s retry/backoff; on 503/timeout return None FAST so discovery returns [] within budget (honest fast-fail, NOT silent hang).
#   Unfreezes the ~328-item queue lifecycle. Does NOT restore HOSE discovery SUCCESS (separate PRIMARY = HSX Strategy-0 0-URLs -> SPIKE next).
#
# Guards: error if not in ready[]; error if already in in_progress[].
# Usage: jq --arg now "$NOW" -f scripts/router-dispatch-b05-ssc-failfast-inprogress-20260703T2022.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.ready | map(select(type=="object" and .id=="B-05-FU-SSC-503-RETRY"))[0]) as $t
| if $t == null then error("B-05-FU-SSC-503-RETRY not in ready[] -- refuse to dispatch")
  elif ((.task_board.in_progress | map(select(type=="object" and .id=="B-05-FU-SSC-503-RETRY")) | length) > 0) then error("already in in_progress[] -- refuse dup")
  else . end
| .task_board.in_progress += [
    ($t + {
      status: "IN_PROGRESS",
      owner: "dev-vps-crawls",
      dev_agent: "dev-vps-crawls",
      dispatched_by: "router",
      dispatched_at: $now,
      dispatch_note: "[router 2026-07-03T20:22Z / fire-tick 20:07Z] dev-team Step 3 execution. PO scope-corrected FIX (was inverted 60s-retry -> now fail-fast <5s bound under mcp discovery timeout). Spawn dev-vps-crawls run_in_background. Target vps-scripts/discover-bctc-urls-browser.py _ssc_curl_search(): read mcp-server caller discovery-timeout, set curl --max-time strictly under it, remove 60s retry/backoff, return None fast on 503/timeout. Accept: _ssc_curl_search() returns <5s on simulated 503; discovery returns [] fast; an affected queue item leaves deferred_infra. On dev complete: router RAW-verify + route to qa gate. Honesty: unfreezes queue lifecycle only -- does NOT restore HOSE discovery (PRIMARY = HSX Strategy-0 0-URLs, SPIKE prepped next)."
    })
  ]
| .task_board.ready |= map(select(type != "object" or .id != "B-05-FU-SSC-503-RETRY"))
| .head += {
    status: "in_progress",
    active_task_id: "B-05-FU-SSC-503-RETRY",
    next_agent: "dev-vps-crawls",
    next_action: "dev-vps-crawls executing B-05-FU-SSC-503-RETRY (SSC-503 fail-fast bound under mcp discovery timeout, vps-scripts/discover-bctc-urls-browser.py). On complete: router RAW-verify diff (curl --max-time < caller timeout, 60s retry removed, fast None on 503) + accept criteria, then route to qa gate -> promote. NEXT (prepped, not dispatched): SPIKE HSX Strategy-0 discoverHosePdfUrls() 0-URLs for HOSE tickers (PRIMARY root, pipeline stays dead until fixed; timebox 120m, zone apps/mcp-server/). Deploy of the VPS fix to Vinahost = ops follow-up (repo file edited here).",
    updated_at: $now,
    updated_by: "router",
    note: "20:22Z (fire-tick 20:07Z): B-05-FU-SSC-503-RETRY ready->in_progress (WIP=1, owner dev-vps-crawls). PO BATCH scope-corrected inverted spec. SF-1 + fire-election held through execution."
  }
