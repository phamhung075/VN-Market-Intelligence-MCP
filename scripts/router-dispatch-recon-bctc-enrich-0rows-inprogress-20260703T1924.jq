# Router dev-team tick (fire-election 2026-07-03T19:07Z, actual 19:24Z): dispatch RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL
# backlog[] -> in_progress[] (owner=ops, infra-vps) + backfill FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD router-closeout audit fields.
#
# WHY DISPATCH (high-value, main task free WIP=0, /goal "take backlog if main free" + standing "spawn ops for infra"):
#   CRITICAL auditor report 3438: bctc-discover stale 396.6h (>24h SLA), 36 pending rows, pipeline blocked, last push 2026-06-16.
#   Corroborated by ~50 NEW telegram reports (ENRICH 0-rows FAIL-LOUD across ~18 Q4-2025 tickers: ACB BID DHG EIB D2D GAS
#   GVR HCM HSG MBB NKG POW SSI VCI VHM VIC VPB VRE + low-confidence GVR/MBB) + Tier-2 B-05 WARN 3483 (age 635min>SLA 607min).
#   Task RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL owner=ops handler=infra-vps (PO-assigned, created 19:00Z). Dispatch table:
#   "service down / latency / pipeline failure (react, fix)" -> ops. Spawn ops run_in_background=true for VPS PDF-extractor/
#   PDF-Extract-Kit/OCR liveness recon.
#
# PDFPULL BACKFILL: FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD already in done_verified (promoted 101d78a48) but router-closeout
#   fields were left empty (verified_by/verified_at/signoff_note null) — NOT a regression (committed empty at 101d78a48,
#   same at HEAD, working tree clean). Router RAW-verified this tick: qa gate commit 5a8bab990 (3 qa docs ONLY: DJ +
#   notebook + TASK_REPORT; orch-state/code untouched; 0 UUID leak on added lines); code fix 8bc0b5b5 (module _isRunning
#   overlap guard, try/finally wrap, additive skippedReason); qa DoD full: tsc 0 err, new test 3/0, 6 import-suites 66/0,
#   full suite 62 fail < 348 ceiling (0 changed-domain regressions), DDD+security+mock-guard PASS. Backfill audit trail only.
#
# Guards: error if B-05 recon not in backlog[]; error if already in in_progress[]; error if pdfpull not in done_verified[].
# Usage: jq --arg now "$NOW" -f scripts/router-dispatch-recon-bctc-enrich-0rows-inprogress-20260703T1924.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.backlog | map(select(type=="object" and .id=="RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL"))[0]) as $t
| if $t == null then error("RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL not in backlog[] — refuse to dispatch")
  elif ((.task_board.in_progress | map(select(type=="object" and .id=="RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL")) | length) > 0) then error("already in in_progress[] — refuse dup")
  elif ((.task_board.done_verified | map(select(type=="object" and .id=="FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD")) | length) == 0) then error("pdfpull not in done_verified[] — backfill target missing, refuse")
  else . end
# --- B-05 recon: backlog -> in_progress (owner=ops) ---
| .task_board.in_progress += [
    ($t + {
      status: "IN_PROGRESS",
      owner: "ops",
      dev_agent: "ops",
      handler: "infra-vps",
      dispatched_by: "router",
      dispatched_at: $now,
      dispatch_note: "[router 2026-07-03T19:24Z / fire-tick 19:07Z] dev-team tick — dispatch ops run_in_background. CRITICAL bctc-discover/enrich pipeline stall: auditor report 3438 (stale 396.6h >24h SLA, 36 pending, last push 2026-06-16) corroborated by ~50 NEW ENRICH 0-rows FAIL-LOUD reports (~18 Q4-2025 tickers, bctc_table_rows=0 AND bctc_md_tables=0, root=B02-TCTD parse failure or extraction/OCR pipeline stall) + Tier-2 B-05 WARN 3483. Ops brief: SSH VPS, probe PDF-extractor/PDF-Extract-Kit/OCR service liveness + bctc-discover crawler + queue drain; determine whether stall is extraction-service-down vs parse-code-defect vs data-coverage; report root cause + remediation (recon/PLAN — no unbudgeted code change). Escalate code defect -> po/dev-mcp-server or dev-pdf-extractor via signal."
    })
  ]
| .task_board.backlog |= map(select(type != "object" or .id != "RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL"))
# --- pdfpull: backfill router-closeout audit fields on the existing done_verified record ---
| .task_board.done_verified |= map(
    if (type=="object" and .id=="FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD") then
      . + {
        verified_by: "router",
        verified_at: $now,
        signoff_note: "[router 2026-07-03T19:24Z backfill] Promotion 101d78a48 flipped review->done_verified (qa_verdict PASS, qa_agent a2b934f0e811f8d3f, qa_commit 5a8bab990) but left router-closeout fields empty — NOT a regression (committed empty at 101d78a48, identical at HEAD, working tree clean). Router RAW-verified this tick: qa gate 5a8bab990 = 3 qa docs ONLY (decision-journal sprint-FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD-qa.md + qa.md notebook + reports/TASK_REPORT_FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD.md 5968B); orch-state/code untouched; 0 raw-UUID on added lines. Code fix 8bc0b5b5 = module-scope _isRunning overlap guard on bctcPdfPullJob.ts (try/finally re-indent of pre-existing body + early-return guard + additive skippedReason; byte-identical shape to breadthHistoryPersisterJob.ts). qa DoD: bun tsc --noEmit 0 errors; new test 3 pass/0 fail; 6 suites importing bctcPdfPullJob.js 66 pass/0 fail; full suite 62 fail/14236 pass < ceiling 348 (0 changed-domain regressions, all 62 mapped to pre-existing pollNews/VPS/vps_push_log flake, none import bctcPdfPullJob); DDD (scheduler/ outermost layer) + security (0 env, mock-guard exit 0) PASS. Sole caller startScheduler.ts:361 reads only .downloaded, unaffected by additive field. Parent SPIKE-BCTC-DISCOVER-PIPELINE-DEAD. Audit-trail backfill only — task remains DONE_VERIFIED."
      }
    else . end
  )
# --- head: in_progress on B-05 recon ---
| .head += {
    status: "in_progress",
    active_task_id: "RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL",
    next_agent: "ops",
    next_action: "ops executing RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL (CRITICAL bctc pipeline stall, infra-vps recon). On ops complete: router RAW-verify recon findings + route remediation (po/dev-mcp-server/dev-pdf-extractor per root cause) or promote if PLAN-only recon done. Parallel: PO triaging 65 NEW telegram reports (dedup to B-05 / FIX-BCTC-FULL-BATCH-CONTAMINATION / FIX-MCP-MEMORY-CODE-LEAK / FU-RAG-DEPLOY-MEMORY) + memory signal sau-2026-07-03T19:16:47Z. FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD done_verified audit-backfill applied.",
    updated_at: $now,
    updated_by: "router",
    note: "19:24Z (fire-tick 19:07Z): dispatch ops for RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL (CRITICAL, backlog->in_progress, WIP=1). Spawn PO for 65-report triage. pdfpull audit-backfill."
  }
