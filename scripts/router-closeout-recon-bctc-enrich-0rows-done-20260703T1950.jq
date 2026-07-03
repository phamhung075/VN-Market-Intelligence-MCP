# Router dev-team tick closeout (fire-election 2026-07-03T19:07Z): RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL in_progress[] -> done_verified[].
# ops recon a4b7da6c34f0c3457 COMPLETE (PLAN-only, no code change) + PO triage aaaa1d01c75e090af RETURN NOTHING + router RAW-verified (2026-07-03T19:50Z).
#
# RECON DELIVERABLE (verified evidence, credible): VPS bctc discovery returns 0 URLs for all tickers; 328 queue items stuck
#   deferred_infra since 2026-06-16 (~293 NULL source_url); VPS proxy last push 2026-06-16 18:02Z (396.6h stale); the VPS
#   fallback script discover-bctc-urls-browser.py HANGS on SSC (State Securities Commission / Tong Cuc Thong Ke) API HTTP 503
#   + 60s retry loop, exceeding mcp-server's 5s discovery timeout -> exception swallowed -> returns [] -> queue never progresses.
#   Secondary/orthogonal: ~50 "[bctcPdfPull] ENRICH 0-rows" alerts for Q4-2025 tickers (PDFs fetched but 0 financial tables =
#   B02-TCTD parser defect or blank PDFs).
#
# ROUTER CORRECTION (RAW-verified ground truth): ops Path-A hypothesis "FPT/GVR/MBB are NOT HOSE-listed (trade HNX/UPCOM)" is
#   FALSE. docs/data/system-map.json exchange field: FPT/BID/VHM/VIC/SSI = HOSE; the reported ~18 tickers (ACB BID DHG EIB D2D
#   GAS GVR HCM HSG MBB NKG POW SSI VCI VHM VIC VPB VRE) are all HOSE/VN30 blue chips, and the pipeline routes them to HSX
#   Strategy-0 discovery PRECISELY because it classifies them HOSE. Therefore the real primary cause is: HSX Strategy-0
#   (discoverHosePdfUrls) returns 0 URLs for LEGITIMATELY-HOSE-listed tickers (cause TBD -- HSX disclosure-portal endpoint change
#   ~2026-06-16 or scraper defect, NOT off-exchange), compounded by the SSC-503 fallback hang. The BUG telegram 3234 + ops
#   notebook carried the falsified "not-listed" theory -- SUPERSEDED by this closeout.
#
# PO DEDUP (aaaa1d01c75e090af RETURN NOTHING -- disposed 67 telegram reports, signal sau-2026-07-03T19:16:47Z NEW->READ):
#   root causes map to EXISTING backlog, no new distinct work -- discovery: B-05-FU-SSC-503-RETRY (BACKLOG), FIX-VPS-SSC-INSIDER-502
#   (TODO), FIX-BCTC-QUEUE-MAXAGE-GATE (BACKLOG), BCTC-ENRICHER-OLD-QUARTERS (DEFERRED), FACTORY-INFRA-split-ssc-fetchers (BACKLOG);
#   extraction: FIX-BCTC-BANK-SCALAR-MAPPING (BACKLOG), FIX-BCTC-BANK-FORM-CLASSIFIER-BOLD-STRIP (TODO), FIX-BCTC-BANK-SUMMARY-MAPPING
#   (DONE). Router mints NO new task (respects PO triage authority + no-duplication).
#
# ROUTER DIRECTIVE for whoever executes the discovery fix (record so it does not chase the falsified theory): tickers ARE HOSE --
#   (a) fix the SSC-503 fallback to fail-fast (<5s, no 60s retry) [B-05-FU-SSC-503-RETRY / FIX-VPS-SSC-INSIDER-502];
#   (b) investigate WHY HSX Strategy-0 returns 0 URLs for HOSE tickers (endpoint/scraper) -- the true primary, currently only
#       partially covered; may warrant a focused SPIKE at next planning if (a) does not restore discovery;
#   (c) CRITICAL: pipeline dead 17 days (since 2026-06-16). Elevate discovery-fix items to HIGH at next dev-team planning tick.
#
# Guards: error if B-05 not in in_progress[]; error if already in done_verified[]. Type-guard array elements.
# Usage: jq --arg now "$NOW" -f scripts/router-closeout-recon-bctc-enrich-0rows-done-20260703T1950.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.in_progress | map(select(type=="object" and .id=="RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL"))[0]) as $t
| if $t == null then error("RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL not in in_progress[] -- refuse to close out")
  elif ((.task_board.done_verified | map(select(type=="object" and .id=="RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL")) | length) > 0) then error("already in done_verified[] -- refuse dup")
  else . end
| .task_board.done_verified += [
    ($t + {
      status: "DONE_VERIFIED",
      done_verified: true,
      verified_by: "router",
      verified_at: $now,
      recon_verdict: "COMPLETE_WITH_ROUTER_CORRECTION",
      ops_agent: "ops",
      signoff_note: "[router 2026-07-03T19:50Z] ops recon COMPLETE (PLAN-only, 0 code change) + PO triage RETURN NOTHING + router RAW-verified. VERIFIED EVIDENCE: VPS discovery returns 0 URLs all tickers; 328 items deferred_infra since 2026-06-16; VPS proxy last push 396.6h stale; VPS fallback script hangs on SSC API HTTP 503 + 60s retry > mcp 5s timeout -> silent [] -> queue frozen; secondary ~50 ENRICH 0-rows (B02-TCTD parser/blank-PDF). ROUTER CORRECTION (RAW-verified via system-map exchange field): ops Path-A 'FPT/GVR/MBB not HOSE-listed' is FALSE -- FPT/BID/VHM/VIC/SSI=HOSE and the ~18 reported tickers are all HOSE/VN30 blue chips routed to HSX Strategy-0 BECAUSE they are classified HOSE; real primary cause = discoverHosePdfUrls() returns 0 URLs for legitimately-HOSE tickers (HSX endpoint change ~06-16 or scraper defect, NOT off-exchange) + SSC-503 fallback hang. BUG telegram 3234 + ops notebook carried the falsified 'not-listed' theory -- SUPERSEDED by this closeout. PO DEDUP: root causes map to existing backlog (discovery: B-05-FU-SSC-503-RETRY, FIX-VPS-SSC-INSIDER-502, FIX-BCTC-QUEUE-MAXAGE-GATE, BCTC-ENRICHER-OLD-QUARTERS, FACTORY-INFRA-split-ssc-fetchers; extraction: FIX-BCTC-BANK-SCALAR-MAPPING, FIX-BCTC-BANK-FORM-CLASSIFIER-BOLD-STRIP, FIX-BCTC-BANK-SUMMARY-MAPPING DONE) -- NO new task minted. DIRECTIVE for fix executor: tickers ARE HOSE, do NOT chase 'not-listed'; (a) SSC-503 fail-fast <5s, (b) investigate HSX Strategy-0 0-URLs for HOSE tickers (may need focused SPIKE), (c) CRITICAL pipeline dead 17 days -> elevate discovery items to HIGH next planning. ops notebook 1ee40bab3 (session-UUID scrubbed from 82eb874eb during router leak-hygiene)."
    })
  ]
| .task_board.in_progress |= map(select(type != "object" or .id != "RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL"))
| .head += {
    status: "idle",
    active_task_id: null,
    next_agent: null,
    next_action: "RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL done_verified (ops recon COMPLETE + router-corrected: tickers ARE HOSE; primary = HSX Strategy-0 0-URLs + SSC-503 fallback hang; NOT off-exchange). PO RETURN NOTHING -- root causes tracked by existing backlog. dev WIP=0 -- idle. CRITICAL for next dev-team planning: bctc discovery pipeline DEAD 17 days (since 06-16) -> elevate discovery-fix items to HIGH: B-05-FU-SSC-503-RETRY + FIX-VPS-SSC-INSIDER-502 (SSC-503 fail-fast) + investigate HSX Strategy-0 0-URLs for HOSE tickers (candidate focused SPIKE). Other backlog PLAN-ONLY: FIX-BCTC-FULL-BATCH-CONTAMINATION (architect-first), FEAT-SEVERITY-OVERRIDE-SURFACING, FIX-AGENT-NOTEBOOK-UUID-PROVENANCE, FIX-MACRO-SNAPSHOT-REGIME-PARSE-DRIFT, FIX-MCP-MEMORY-CODE-LEAK. DEPLOY-GATED (pending mcp-server rebuild): FIX-LEGAL-RISK ROBUST tier + pdfpull-guard + COLUMN-ORDER finalize_bctc_refine CTG.",
    updated_at: $now,
    updated_by: "router",
    note: "19:50Z (fire-tick 19:07Z): RECON-BCTC-ENRICH-0ROWS in_progress->done_verified (ops recon done, router-corrected HOSE-listing hypothesis, PO NOTHING, no new mint). dev WIP=0 -- idle. dev-team tick closeout -> release SF-1 + fire-election."
  }
