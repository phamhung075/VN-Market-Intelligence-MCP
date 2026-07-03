# Router dev-team tick closeout (fire-election 2026-07-03T20:07Z): B-05-FU-SSC-503-RETRY in_progress[] -> done_verified[].
# dev-vps-crawls COMPLETE (a817b5139 code+test, 33353a814 report/journal/notebook) + qa gate a25e4cbe18cc2a731 PASS (dfe2e8304)
#   + router RAW-verified (2026-07-03T20:56Z).
#
# QA VERDICT: PASS. Independent re-run evidence (not trusting dev/qa claims — router re-confirmed dev's + qa read qa's):
#   - test_discover_bctc_ssc_fastfail.py 7/7 PASS ; test_discover_bctc_title_classifier.py 35/35 PASS (0 regression)
#   - py_compile clean ; mock-guard PASS ; 0 UUID/secret on both gated commits + on qa commit dfe2e8304.
#   - Structural (whole-file grep): single bounded _ssc_get(SSC_SEARCH_URL, timeout=_SSC_STEP1_TIMEOUT_SECONDS) with
#     _SSC_STEP1_TIMEOUT_SECONDS=4 (vps-scripts/discover-bctc-urls-browser.py:914,917); import time + 2-attempt retry loop
#     + _SSC_STEP1_RETRY_WAIT all fully removed (0 hits). 4s cap has genuine 1s margin under caller's 5000ms discovery
#     timeout (apps/mcp-server .../bctcQueueEnricherJob.ts:57 + bctcDiscovery.ts:351 both confirmed 5_000).
#
# HONEST SCOPE (recorded so no one over-reads this fix): unfreezes the ~328-item bctc queue LIFECYCLE only (503/timeout now
#   returns None fast -> discovery returns [] within budget instead of silent hang). Does NOT restore SSC/HOSE discovery
#   SUCCESS -- real external SSC outage + separate PRIMARY = HSX Strategy-0 discoverHosePdfUrls() 0-URLs for legitimately-HOSE
#   tickers (SPIKE prepped, not dispatched). Pipeline has been DEAD 17 days (since 2026-06-16).
#
# QA NON-BLOCKING OBSERVATION (recorded as backlog candidate, does NOT block gate): vps-scripts/discover-bctc-urls-browser.py:1068
#   step2/3b download POST still uses timeout=60 -- a genuinely different code path (only reached after step1 succeeds within
#   budget; caller hard-aborts whole call at 5s regardless). Hygiene follow-up: FIX-VPS-SSC-STEP2-TIMEOUT-BOUND (BACKLOG).
#
# Guards: error if B-05 not in in_progress[]; error if already in done_verified[]. Type-guard array elements.
# Usage: jq --arg now "$NOW" -f scripts/router-promote-b05-ssc-failfast-done-20260703T2056.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.in_progress | map(select(type=="object" and .id=="B-05-FU-SSC-503-RETRY"))[0]) as $t
| if $t == null then error("B-05-FU-SSC-503-RETRY not in in_progress[] -- refuse to promote")
  elif ((.task_board.done_verified | map(select(type=="object" and .id=="B-05-FU-SSC-503-RETRY")) | length) > 0) then error("already in done_verified[] -- refuse dup")
  else . end
| .task_board.done_verified += [
    ($t + {
      status: "DONE_VERIFIED",
      done_verified: true,
      verified_by: "router",
      verified_at: $now,
      qa_agent: "qa",
      qa_verdict: "PASS",
      dev_agent: "dev-vps-crawls",
      signoff_note: "[router 2026-07-03T20:56Z / fire-tick 20:07Z] dev-vps-crawls COMPLETE (a817b5139 code+test, 33353a814 report/journal) + qa gate PASS (dfe2e8304) + router RAW-verified. FIX: vps-scripts/discover-bctc-urls-browser.py step1 SSC fetch now bounded _SSC_STEP1_TIMEOUT_SECONDS=4 (strictly < caller 5000ms discovery timeout), 60s retry loop + import time + _SSC_STEP1_RETRY_WAIT fully removed -> 503/timeout returns None FAST, discovery returns [] within budget (honest fast-fail, no silent hang). EVIDENCE (independent re-run): fastfail 7/7 + title-classifier 35/35 PASS, py_compile clean, mock-guard PASS, 0 UUID/secret on all 3 commits. HONEST SCOPE: unfreezes ~328-item queue LIFECYCLE only -- does NOT restore SSC/HOSE discovery SUCCESS (external SSC outage + PRIMARY = HSX Strategy-0 0-URLs for HOSE tickers, SPIKE prepped). Pipeline DEAD 17 days since 2026-06-16. DEPLOY to Vinahost VPS = ops follow-up (repo file edited here, code-only DoD). QA non-blocking: line 1068 step2 timeout=60 (different path, caller-aborted at 5s) -> FIX-VPS-SSC-STEP2-TIMEOUT-BOUND backlog candidate."
    })
  ]
| .task_board.in_progress |= map(select(type != "object" or .id != "B-05-FU-SSC-503-RETRY"))
| .head += {
    status: "idle",
    active_task_id: null,
    next_agent: null,
    next_action: "B-05-FU-SSC-503-RETRY done_verified (dev+qa PASS, router RAW-verified). dev WIP=0 -- idle. CRITICAL for next dev-team planning: bctc discovery pipeline DEAD 17 days (since 2026-06-16); B-05 unfreezes queue LIFECYCLE only, does NOT restore discovery SUCCESS. Elevate to HIGH: SPIKE HSX Strategy-0 discoverHosePdfUrls() 0-URLs for legitimately-HOSE tickers (PRIMARY root, timebox 120m, zone apps/mcp-server/) + FIX-VPS-SSC-INSIDER-502. New backlog candidate (QA non-blocking): FIX-VPS-SSC-STEP2-TIMEOUT-BOUND (line 1068 timeout=60 on step2 download, hygiene). Other backlog PLAN-ONLY: FIX-BCTC-FULL-BATCH-CONTAMINATION (architect-first), FEAT-SEVERITY-OVERRIDE-SURFACING, FIX-AGENT-NOTEBOOK-UUID-PROVENANCE, FIX-MACRO-SNAPSHOT-REGIME-PARSE-DRIFT, FIX-MCP-MEMORY-CODE-LEAK. Ops follow-up: deploy B-05 fix to Vinahost VPS. Router: release SF-1 + dev-team fire-election at jump:end.",
    updated_at: $now,
    updated_by: "router",
    note: "20:56Z (fire-tick 20:07Z): B-05-FU-SSC-503-RETRY in_progress->done_verified (dev-vps-crawls + qa PASS, router RAW-verified). dev WIP=0 -- idle. dev-team tick closeout -> release SF-1 + fire-election."
  }
