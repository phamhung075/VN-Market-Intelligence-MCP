# Router dev-team tick closeout (SPIKE dispatched under fire-election 21:37Z): SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO in_progress[] -> done_verified[].
# dev-mcp-server ae71803f569669728 COMPLETE (read-only SPIKE; findings doc 43453950b, 252L) + router RAW-verified (2026-07-03T22:22Z).
#
# RAW-verified evidence (not trusting return msg):
#   - findings doc docs/spikes/SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO.md (252L; Question/Approach/Findings/Residual-owner-map/Recommended-remediation/Code-refs); 0 UUID on added lines.
#   - commit 43453950b scoped to exactly 1 file (+252). Tree clean.
#
# SPIKE VERDICT: MIXED (dominant shared bucket 7/8 + one genuine residual 1/8).
#   - Bucket A "never refined" (VHM,REE,VIC,VNM,VRE,HSG,MWG): live get_bctc_refined probe = zero refined_units + zero table_rows
#     (vs healthy controls GVR/HPG = hundreds of rows). Served total_assets=0 is the STALE parse-time value; agentic-refine
#     pipeline was simply never run against these 7. Sub-signatures: REE+VNM already owned (FIX-REE-BS-SECTION-REGEX,
#     SPIKE-BCTC-COLUMN-SEPARATED-LAYOUT); VRE/MWG new recoverable "code 270 vs 280" grand-total anchor ambiguity (data legible
#     in raw OCR, mis-anchored); VHM dual consolidated+parent-only complication; VIC/HSG not sub-classified within timebox.
#   - Bucket B POW (residual, genuinely NEW): refine completed FULLY (28/28 units, 166 table_rows) but grand-total rows
#     (code 270/440) dropped mid-transcription despite correct page window — verified in refined markdown unit-0004.
#
# CONSOLIDATED remediation proposed (NO per-ticker dup FIX) -> routed to PO for sprint decision:
#   1. Operational agentic-refine-repass + reingest-bctc-report.ts (proven runbook, ZERO new code) for VHM/VIC/VRE/HSG/MWG (5).
#   2. No action REE/VNM (keep existing tickets as-is).
#   3. NEW architect-first SPIKE candidate SPIKE-BCTC-REFINE-TOTAL-ROW-TRANSCRIPTION-DROP for POW-class transcription gap.
#   4. Rejected: per-ticker regex-branch patch (anti-pattern PO already rejected in FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT).
#
# NO CODE CHANGE (read-only SPIKE) -> NO qa merge gate. Deliverable = findings doc + proposal.
#
# Guards: error if SPIKE not in in_progress[]; error if already in done_verified[]. Type-guard array elements.
# Usage: jq --arg now "$NOW" -f scripts/router-promote-spike-bctc-nonbank-zero-done-20260703T2222.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.in_progress | map(select(type=="object" and .id=="SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO"))[0]) as $t
| if $t == null then error("SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO not in in_progress[] -- refuse to close out")
  elif ((.task_board.done_verified | map(select(type=="object" and .id=="SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO")) | length) > 0) then error("already in done_verified[] -- refuse dup")
  else . end
| .task_board.done_verified += [
    ($t + {
      status: "DONE_VERIFIED",
      done_verified: true,
      verified_by: "router",
      verified_at: $now,
      spike_verdict: "MIXED_7of8_NEVER_REFINED_PLUS_1_POW_TRANSCRIPTION_DROP",
      dev_agent: "dev-mcp-server",
      deliverables: ["docs/spikes/SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO.md@43453950b"],
      signoff_note: "[router 2026-07-03T22:22Z] dev-mcp-server read-only SPIKE COMPLETE (findings 43453950b, 252L) + router RAW-verified (doc substantive, 0 UUID, commit scoped to 1 file, tree clean). VERDICT: MIXED. Bucket A 'never refined' 7/8 (VHM,REE,VIC,VNM,VRE,HSG,MWG) -- live get_bctc_refined = zero refined_units+table_rows vs GVR/HPG controls (hundreds); total_assets=0 is stale parse-time value, agentic-refine never run on these 7. REE+VNM already owned; VRE/MWG new recoverable code-270-vs-280 grand-total anchor ambiguity; VHM dual consolidated+parent complication; VIC/HSG unclassified in timebox. Bucket B POW (NEW residual) -- refine completed 28/28 units/166 rows but grand-total rows 270/440 dropped mid-transcription (verified unit-0004). CONSOLIDATED remediation (NO per-ticker dup FIX): (1) operational agentic-refine-repass + reingest-bctc-report.ts (proven runbook, zero new code) for VHM/VIC/VRE/HSG/MWG; (2) no action REE/VNM; (3) NEW architect-first SPIKE-BCTC-REFINE-TOTAL-ROW-TRANSCRIPTION-DROP for POW class; (4) rejected per-ticker regex patch (FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT anti-pattern). No code change -> no qa gate. ROUTED TO PO for consolidated remediation sprint decision (SPIKE = proposal, not merge)."
    })
  ]
| .task_board.in_progress |= map(select(type != "object" or .id != "SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO"))
| .head += {
    status: "idle",
    active_task_id: null,
    next_agent: null,
    next_action: "SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO done_verified (MIXED verdict: 7/8 never-refined + POW transcription-drop residual; router RAW-verified findings 43453950b). dev WIP=0 -- idle. ROUTED TO PO (background) for consolidated remediation decision: (1) operational agentic-refine-repass + reingest-bctc-report.ts for VHM/VIC/VRE/HSG/MWG (zero new code); (2) no action REE/VNM (existing tickets); (3) mint NEW architect-first SPIKE-BCTC-REFINE-TOTAL-ROW-TRANSCRIPTION-DROP for POW class; (4) NO per-ticker regex patch. PENDING next dev-team RUN tick drain: docs/signals/bctc-analyst-20260703T215200Z.json (GVR ESC-4 deep_dive_result -> PO: verdict LEGITIMATE non-op income, recommend ESC-4 whitelist GVR by content-hash; guard esc-deepdive:GVR:Q1-2026:ESC-4 held ~24h). PLAN-ONLY (fold into PO): scripts/agents-flow/dev-team-tick-preflight.sh _step_sf1_claim() NOT re-entrant -- on self-held SF-1 it returns 'peer holds it' (mislabel); fix to mirror _step_fire_election() self-hold check (compare current_holder.owner_client_session==session -> heartbeat+re-entrant, not SKIP). Latent (SKIP correct while tick in-flight). Other backlog PLAN-ONLY unchanged: FIX-VPS-SSC-INSIDER-502, FIX-VPS-SSC-STEP2-TIMEOUT-BOUND, FIX-BCTC-FULL-BATCH-CONTAMINATION (architect-first), FEAT-SEVERITY-OVERRIDE-SURFACING, FIX-AGENT-NOTEBOOK-UUID-PROVENANCE, FIX-MACRO-SNAPSHOT-REGIME-PARSE-DRIFT, FIX-MCP-MEMORY-CODE-LEAK, VERIFY-BCTC-STRATEGY0-QUARTER-PARAM-CONTRACT, BCTC-ENRICHER-OLD-QUARTERS. Router releases SF-1 + fire-election at closeout; next dev-team cron tick RUNs fresh (SF-1 free).",
    updated_at: $now,
    updated_by: "router",
    note: "22:22Z: SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO in_progress->done_verified (MIXED verdict; router RAW-verified findings 43453950b). dev WIP=0 -- idle. Routed to PO for consolidated remediation. Closeout -> release SF-1 + fire-election + task:SPIKE lock."
  }
