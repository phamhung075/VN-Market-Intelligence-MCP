# po-s139 — SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO consolidated-remediation mint
# (router-dispatched PO decision on the done_verified read-only SPIKE, findings
#  doc 43453950b: docs/spikes/SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO.md).
#
# Single-pass id-guarded MINT of 3 PLAN-ONLY rows → .task_board.backlog[]
# (skip any id already present in ANY task_board array lane → re-run mints 0):
#
#   M1  OPS-BCTC-REFINE-REPASS-NONBANK-5T  (SPIKE item 1 ACCEPTED)
#       operational agentic-refine-repass + reingest for VHM/VIC/VRE/HSG/MWG —
#       ZERO new code, proven CTG runbook. REE+VNM deliberately EXCLUDED
#       (own dedicated tickets: FIX-REE-BS-SECTION-REGEX / SPIKE-BCTC-COLUMN-
#       SEPARATED-LAYOUT) = SPIKE item 2 ACCEPTED (no-mint, keep as-is).
#   M2  SPIKE-BCTC-REFINE-TOTAL-ROW-TRANSCRIPTION-DROP  (SPIKE item 3 ACCEPTED)
#       architect-first SPIKE for the POW-class grand-total-row transcription drop.
#   M3  FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT  (router latent candidate ACCEPTED)
#       _step_sf1_claim() not re-entrant on own held SF-1 → phantom-peer-SKIP.
#
# SPIKE item 4 (REJECT any per-ticker regex branch on balanceSheetExtractor.ts)
# is a standing GUARDRAIL — no row; baked as generic_mandate on M1 + M2.
#
# All rows status=BACKLOG (backlog-lane SHG invariant). PLAN-ONLY: NOT promoted
# to ready[], head untouched — dev-team cron loop drains + dispatches.
#
# Atomic write done by scripts/orch-apply.sh (Zod + dup-key + CAS-mtime + rename).
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s139-bctc-nonbank-total-assets-spike-remediation-mint.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

# --- existing ids across every task_board array lane (dedup guard) ---
([.task_board | to_entries[] | select(.value | type == "array") | .value[]
  | select(type == "object") | .id]) as $ids

# --- candidate mints (PLAN-ONLY backlog rows) ---
| ([
    {
      id: "OPS-BCTC-REFINE-REPASS-NONBANK-5T",
      title: "OPS — agentic-refine repass + reingest 5 non-bank Q1-2026 reports (VHM/VIC/VRE/HSG/MWG) to recover total_assets=0; ZERO new code, proven CTG runbook",
      owner: "bctc-analyst",
      status: "BACKLOG",
      zone: "multi",
      priority: "high",
      type: "FIX",
      next_agent: "bctc-analyst",
      created_at: $now,
      generic_mandate: "Do NOT add any per-ticker regex branch to balanceSheetExtractor.ts — rejected anti-pattern (FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT). The agentic-refine + LABEL-CANONICAL aggregator machinery already handles 270-vs-280; it just needs to be RUN against these 5 reports, not re-invented at parse-time.",
      verification_gate: "RAW-verify LIVE post-reingest: get_bctc_full for all 5 tickers returns plausible NONZERO total_assets (>= equity_total) with confidence>0 and no '[CORRUPT DATA — SKIP]'.",
      status_note: "OPERATIONAL data-recovery, NO code change — SPIKE item 1 ACCEPTED. Per SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO (done_verified, findings doc 43453950b): these 5 serve total_assets=0 because the agentic refine pipeline was NEVER run (0 bctc_refined_units + 0 bctc_table_rows). Source data confirmed RECOVERABLE (not corrupt): VRE/MWG show the grand-total legible under code 280 vs a distinct 270 sub-section; VHM has a dual consolidated+parent-only PDF needing 1 architect follow-up on page-anchoring. Runbook = docs/agents/dev-mcp-server/flow/main.md CANONICAL BCTC finalize re-ingest: get_bctc_pending_refine -> refine_bctc_md leaf-worker windows -> push_bctc_refined_unit -> finalize_bctc_refine -> bun scripts/migrations/reingest-bctc-report.ts --report-id <id> --apply. Owner split: bctc-analyst (transcription) -> dev-mcp-server (reingest run), mirroring W5-FU-CTG-REFINE-96e36139. report_ids: VHM a3a41225 / VIC 1f53ef33 / VRE 0ce3b2ed / HSG ae1f30bf / MWG d713095f. WATCH-FOR: if the POW-class grand-total-row-drop (SPIKE-BCTC-REFINE-TOTAL-ROW-TRANSCRIPTION-DROP) recurs on >=2 of these 5 during the repass, escalate that SPIKE from investigate-first to must-fix-before-repass. REE+VNM EXCLUDED (own tickets)."
    },
    {
      id: "SPIKE-BCTC-REFINE-TOTAL-ROW-TRANSCRIPTION-DROP",
      title: "SPIKE (architect-first) — grand-total balance-sheet rows (270/440) silently dropped during agentic-refine transcription even when the page window is correctly bounded (POW class)",
      owner: "architect",
      status: "BACKLOG",
      zone: "multi",
      priority: "medium",
      type: "SPIKE",
      mode: "spike",
      timebox: 120,
      next_agent: "architect",
      created_at: $now,
      generic_mandate: "Determine the DROP LOCUS, do NOT patch a per-ticker branch. Two candidate loci: (a) refine_bctc_md leaf-worker prompt/instructions (likely NOT apps/mcp-server zone — agent-flow/prompt concern) or (b) a markdown-ingest step inside apps/mcp-server (refinedMarkdownParser.ts) silently swallowing a row that WAS transcribed.",
      status_note: "SPIKE item 3 ACCEPTED (architect-first, timeboxed, BEFORE any FIX). Per SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO Bucket B: POW is genuinely NEW — refine ran to completion (28/28 units DONE, 166 table_rows) but codes 270 (TONG CONG TAI SAN) + 440 (TONG CONG NGUON VON) are absent from BOTH bctc_table_rows AND the underlying refined markdown itself. Reproduced live via get_bctc_refined unit-0004 (pages [5,6], window_status=DONE, confidence=0.7): the bolded grand-total boundary line is skipped while the rest of the page transcribes correctly and the window range is objectively correct. This is a transcription/ingest COMPLETENESS gap, not a code/label-matching bug (bctcScalarAggregator's LABEL-CANONICAL resolver has nothing to find). POW unit-0004 output is directly reusable as the reproduction fixture — no new data collection needed. DISTINCT-FROM SPIKE-BCTC-REFINE-MAXWINDOW-TRUNCATION (that is window-boundary truncation cutting off rows; this is a row dropped WITHIN a correctly-bounded window). Architect determines locus (a) vs (b) then splits into the right zone (agent-flow OR apps/mcp-server)."
    },
    {
      id: "FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT",
      title: "FIX — dev-team-tick-preflight.sh _step_sf1_claim() not re-entrant on session's OWN held SF-1: reads only .claimed -> phantom 'peer holds it' SKIP for the full 90min TTL when current_holder.owner_client_session==self",
      owner: "developer",
      status: "BACKLOG",
      zone: "cross-service",
      priority: "low",
      type: "FIX",
      next_agent: "developer",
      created_at: $now,
      status_note: "Router-detected latent candidate ACCEPTED (non-urgent). scripts/agents-flow/dev-team-tick-preflight.sh _step_sf1_claim() (~L120-142) is NOT re-entrant: on a session's OWN held SF-1 it inspects only .claimed and returns 'peer holds it' -> SKIP with detail 'SF-1 held by peer session', even when current_holder.owner_client_session == self. FIX: mirror _step_fire_election() (~L161-189) which DOES compare current_holder.owner_client_session and heartbeats on self-hold. LATENT: SKIP is the CORRECT outcome while a tick is genuinely in-flight; real harm case = SF-1 self-held while session is free -> phantom-peer-SKIP for the full 90min TTL = a dead-drive window. Zone cross-service (scripts/agents-flow/, NOT apps/). Owner developer/general."
    }
  ] | map(select(.id as $id | ($ids | index($id)) | not))) as $mints

# --- M1..M3: append id-guarded mints to backlog + stamp board metadata ---
| .task_board.backlog += $mints
| .task_board._updated_at = $now
| .task_board._updated_by = "po"
