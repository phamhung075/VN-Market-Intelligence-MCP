# Router dev-team tick closeout (fire-election 2026-07-03T21:07Z): SPIKE-HSX-STRATEGY0-0URLS in_progress[] -> done_verified[].
# dev-mcp-server a042aae2d57de5af5 COMPLETE (read-only SPIKE; findings doc 4a20063ba + decision journal 46a7c6c0c) + router RAW-verified (2026-07-03T21:33Z).
#
# SPIKE VERDICT: PREMISE FALSIFIED. HSX Strategy-0 is NOT broken for current/recent quarters. RAW-verified evidence (not trusting return msg):
#   - findings doc docs/spikes/SPIKE-HSX-STRATEGY0-0URLS.md (195L; Question/Approach/3 Findings/Recommended/Code-ref); 0 UUID on added lines.
#   - Finding 1: live re-test (curl + `bun run` of UNMODIFIED prod fetchHsxBctcUrls/discoverHosePdfUrls) returned valid PDF URLs for all 8 named
#     tickers at Q4-2025/Q1-2026. Corroborated by INDEPENDENT same-day architect brief docs/architecture-briefs/2026-07-03-bctc-discover-pipeline-dead.md
#     (18.6KB, RAW-verified present). The "0 URLs" claim traces to an ops recon whose own log shows quarter:4 (numeric) not the required "Q4" (string)
#     -> likely test-harness bug, NOT a network/parse failure.
#   - Finding 2: the ONLY real un-ticketed gap is for OLDER quarters — fetchMediafileUrls() has no pagination beyond pageIndex=1 + fileType
#     "application/pdf" MIME-style drift on pre-2016 hsx.vn filings (confirmed live back to 2015 for FPT). Additive + optional, not an incident fix.
#   - Finding 3: the 328 deferred_infra rows = STATIC by-design-excluded population from a 2026-06-08 triage decision (PREDATES the 06-16 incident),
#     structurally excluded from all 3 enricher SELECT arms regardless of Strategy-0 health -> the real red herring.
#   - Board RAW-verified: the actual 06-16-incident actionable backlog is ALREADY done_verified via FIX-BCTC-ENRICHER-STUCK-BACKLOG +
#     FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD (both confirmed DONE_VERIFIED in done_verified[]).
#
# SUPERSEDES: the router's prior "ROUTER CORRECTION" (RECON closeout 2026-07-03T19:50Z + B-05 signoffs) that framed HSX Strategy-0 0-URLs as the
#   PRIMARY unfixed discovery root. That framing was itself derived from the same falsified ops recon. The SPIKE's live re-test + independent architect
#   corroboration is stronger evidence -> the "Strategy-0-broken" framing is RETIRED for current quarters. Honest restatement: the pipeline was NOT
#   dead-by-Strategy-0; current-quarter discovery works; only the OLDER-quarter historical backfill (293 static rows) has a real (additive, optional) gap.
#
# NO CODE CHANGE (read-only SPIKE) -> NO qa merge gate. Deliverable = findings doc + proposal. Routed to PO for sprint decision (3-part recommendation).
#
# Guards: error if SPIKE not in in_progress[]; error if already in done_verified[]. Type-guard array elements.
# Usage: jq --arg now "$NOW" -f scripts/router-promote-spike-hsx-strategy0-done-20260703T2133.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.in_progress | map(select(type=="object" and .id=="SPIKE-HSX-STRATEGY0-0URLS"))[0]) as $t
| if $t == null then error("SPIKE-HSX-STRATEGY0-0URLS not in in_progress[] -- refuse to close out")
  elif ((.task_board.done_verified | map(select(type=="object" and .id=="SPIKE-HSX-STRATEGY0-0URLS")) | length) > 0) then error("already in done_verified[] -- refuse dup")
  else . end
| .task_board.done_verified += [
    ($t + {
      status: "DONE_VERIFIED",
      done_verified: true,
      verified_by: "router",
      verified_at: $now,
      spike_verdict: "PREMISE_FALSIFIED_STRATEGY0_NOT_BROKEN",
      dev_agent: "dev-mcp-server",
      deliverables: ["docs/spikes/SPIKE-HSX-STRATEGY0-0URLS.md@4a20063ba", "decision-journal@46a7c6c0c"],
      signoff_note: "[router 2026-07-03T21:33Z / fire-tick 21:07Z] dev-mcp-server read-only SPIKE COMPLETE (findings 4a20063ba + journal 46a7c6c0c) + router RAW-verified. VERDICT: PREMISE FALSIFIED -- HSX Strategy-0 is NOT broken for current/recent quarters. EVIDENCE: (1) live re-test of UNMODIFIED prod fetchHsxBctcUrls/discoverHosePdfUrls returned valid PDF URLs for all 8 named tickers at Q4-2025/Q1-2026; (2) corroborated by independent same-day architect brief docs/architecture-briefs/2026-07-03-bctc-discover-pipeline-dead.md (RAW-verified present); (3) the '0 URLs' claim traces to an ops recon test-harness bug (quarter:4 numeric vs required 'Q4' string), not a network/parse failure; (4) 328 deferred_infra rows = STATIC by-design-excluded population from a 2026-06-08 triage decision predating the 06-16 incident (real red herring); (5) board-verified: the 06-16 actionable backlog is ALREADY done_verified (FIX-BCTC-ENRICHER-STUCK-BACKLOG + FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD). SUPERSEDES the router's prior 'Strategy-0 0-URLs is PRIMARY' correction (that framing came from the same falsified ops recon). Only real remaining gap = OLDER-quarter backfill (fetchMediafileUrls pagination + fileType 'application/pdf' MIME drift; additive/optional). 0 UUID on both commits; findings doc 195L. No code change -> no qa gate. ROUTED TO PO for 3-part decision."
    })
  ]
| .task_board.in_progress |= map(select(type != "object" or .id != "SPIKE-HSX-STRATEGY0-0URLS"))
| .head += {
    status: "idle",
    active_task_id: null,
    next_agent: null,
    next_action: "SPIKE-HSX-STRATEGY0-0URLS done_verified (PREMISE FALSIFIED -- Strategy-0 NOT broken for current quarters; router RAW-verified + independent architect brief corroborated). dev WIP=0 -- idle. CRITICAL FRAMING UPDATE for next dev-team planning: the 'HSX Strategy-0 0-URLs = PRIMARY dead-pipeline root' framing is SUPERSEDED/RETIRED -- current-quarter discovery WORKS; the 06-16 actionable backlog is already fixed (FIX-BCTC-ENRICHER-STUCK-BACKLOG + FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD done_verified). Do NOT re-mint a Strategy-0 discovery fix. Routed to PO (background) for sprint decision: (a) close/downgrade the 'Strategy-0 broken' framing for the 06-16 incident, (b) cheaply re-verify the ops recon probe with a string 'Q4' param to confirm the test-harness bug, (c) OPTIONAL if PO judges the 293-row static historical backfill worth reviving: scope additive fix in fetchMediafileUrls() (pagination beyond pageIndex=1 + accept 'application/pdf' fileType alongside .pdf) + a separate deliberate enricher SELECT-arm queue-policy decision. Other backlog PLAN-ONLY unchanged: FIX-VPS-SSC-INSIDER-502, FIX-VPS-SSC-STEP2-TIMEOUT-BOUND, FIX-BCTC-FULL-BATCH-CONTAMINATION (architect-first), FEAT-SEVERITY-OVERRIDE-SURFACING, FIX-AGENT-NOTEBOOK-UUID-PROVENANCE, FIX-MACRO-SNAPSHOT-REGIME-PARSE-DRIFT, FIX-MCP-MEMORY-CODE-LEAK. Next successful dev-team tick must drain the 2 queued bctc-analyst signals (ESC-4 GVR redispatch + corrupt-cluster). Router: release SF-1 + dev-team fire-election at jump:end.",
    updated_at: $now,
    updated_by: "router",
    note: "21:33Z (fire-tick 21:07Z): SPIKE-HSX-STRATEGY0-0URLS in_progress->done_verified (premise falsified, Strategy-0 not broken; router RAW-verified + architect-corroborated). dev WIP=0 -- idle. Routed to PO. dev-team tick closeout -> release SF-1 + fire-election."
  }
