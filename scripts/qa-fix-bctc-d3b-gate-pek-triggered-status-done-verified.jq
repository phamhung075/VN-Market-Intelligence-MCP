# Board flip: FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS REVIEW -> DONE_VERIFIED
#
# QA round 1. Router already independently RAW-verified: full diff of
# bctcPdfPullJob.ts (0-row gate genuinely removed, triggerPekExtractionForReport
# called with shell row id after upsert, all 4 outcomes fold into one
# unconditional status='pek_triggered' write, shellRow-undefined edge case
# still advances non-fatally, dead enrichFailed/sendBugFn fields removed),
# full diff of the 3 status-enum consumers (vpsHealthPoller/freshnessSlaMonitorJob/
# bctcQueueEnricherJob — all add pek_triggered to active-lists, Arm-2 sweep
# correctly left untouched), repo-wide grep confirming exactly 3 consumer
# files exist, 76/76 targeted tests (231 expect()), tsc clean, mock-guard PASS
# on all 10 touched files, notebook 49L, DJ-GATE-1 present (dev-mcp-server-S35).
# Did NOT re-derive any of that — fresh-eyes focus on 5 judgment points:
#
# (1) Outcome-folding soundness: read pekExtractTrigger.ts's PekTriggerOutcome
#     union (queued/202, market_hours/503, pdf_extractor_error/502,
#     unreachable/502). D3C (not yet built, design doc §D3 lines 70-74) checks
#     ONLY bctc_layout_units row-counts to decide done/enrich_failed —
#     row-count is the sole ground-truth PEK-success signal regardless of
#     which of the 4 outcomes fired, so correctness IS preserved: D3C will
#     eventually converge to the right verdict no matter which outcome
#     occurred. Flagged (non-blocking) a real efficiency gap for D3C's own
#     future design: market_hours/pdf_extractor_error/unreachable mean PEK
#     never started or errored — those rows can NEVER land real rows without
#     an ACTIVE re-fire, whereas a queued/202 row is already in-flight and
#     re-firing it is safe-but-wasteful (per the design doc's own
#     DELETE-before-INSERT idempotency note). Because folding makes these
#     cases indistinguishable from the DB status column alone, D3C's
#     reconciliation loop MUST adopt a uniform "always re-fire on each
#     still-zero pass" policy (not passive re-check) to guarantee eventual
#     convergence for the 503/502 cases. This was already an explicitly open
#     PM decision point in the design doc itself (§D3 line 73) — D3B's
#     implementation doesn't foreclose a correct D3C design, it narrows D3C
#     to one specific correct shape. Recommend this note travel into D3C's
#     dispatch. Per-outcome detail (pekStatus/body/error) is not
#     unrecoverably lost — pekExtractTrigger.ts already logs it loudly via
#     log.error at trigger time.
# (2) Read the FULL bctc-pdf-pull-job.test.ts diff (not skim). TC-14 uses a
#     genuine SELECT-from-financial_reports read-back to assert the PEK call
#     used the real shell-row id. TC-15/16 correctly scope to testing THIS
#     job's own unconditional-write behavior via injected outcome stubs (the
#     HTTP call itself is D3A's already-approved test surface) with real
#     getQueueRow DB reads for assertions. TC-17 is the strongest: forces a
#     REAL sqlite failure (DROP TABLE financial_reports) rather than a mocked
#     rejection, then asserts pekCalled===false AND the row still lands on
#     pek_triggered via a real DB read — genuinely proves the
#     catch/non-fatal/skip-but-advance edge case end-to-end, not a tautology.
# (3) Read FIX-BCTC-ENRICH-SILENT-0ROWS.test.ts's full rewrite. SUPERSEDED
#     header + section comments explicitly map all 8 historic ACs to
#     successors: AC-1/2/3/5/6 (0-row+sendBugFn+enrichFailed-counter+
#     genericity) -> merged into 1 "0-row scenario" test with explicit
#     rationale (sendBugFn/enrichFailed no longer exist as fields; ticker
#     genericity is moot since the code path no longer branches on ticker at
#     all). AC-4/4b/8 (multi-row / md-tables-only / VCB-112-row
#     non-regression) -> merged into 1 "multi-row scenario" test with
#     explicit rationale (row-count no longer branches the outcome, so the 3
#     historic variants are now provably redundant with each other). AC-7 (no
#     header at all) -> dedicated "no legacy-pipeline header produced" test.
#     Zero ACs vanish with no successor or rationale.
# (4) D3C-dependency risk (status_note's own flag): confirmed accurately
#     stated as review-window-acceptable — cross-checked project standing
#     policy (nothing rebuilds/deploys without a separate user-gated ops
#     step) and confirmed D3C is already correctly parked in backlog[] with
#     depends:[D3B], blocked_note says it auto-promotes to ready[] once D3B
#     lands DONE_VERIFIED — not a dangling risk, a correctly-sequenced next
#     dispatch.
# (5) No-fake-data lens: diff touches only bctc_vps_queue.status enum +
#     control-flow + test fixtures (synthetic UUIDs/tickers, standard
#     convention) — zero market-data synthesis.
#
# DJ-GATE-1: sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md STEP dev-mcp-server-S35
# (line 337) task-id-stamped, present before this review — satisfied.
#
# GUARD: refuse unless FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS is in review[]
# with status REVIEW. .head.active_task_id currently points at the PARENT
# umbrella task (FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION), not this leaf
# sub-task — per standing guard convention (D1/D2/D3a/SERVE-GATE precedent
# scripts), this is a BOARD-ONLY move: .head is left untouched rather than
# blindly overwritten to a mismatched pointer.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/qa-fix-bctc-d3b-gate-pek-triggered-status-done-verified.jq \
#          docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS")][0]) as $t
| if $t == null then error("FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS status != REVIEW (got \($t.status)) — refuse")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    done_verified: true,
    next_agent: "pm",
    updated_at: $now,
    updated_by: "qa",
    commit: "pending",
    qa_verdict: "APPROVED",
    qa_verified_at: $now,
    qa_verified_by: "qa",
    qa_note: "APPROVED. Router already independently RAW-verified diff/tests(76/76,231 expect())/tsc/mock-guard(10 files)/3-consumer-file diffs/repo-wide grep — did not re-verify those, focused on 5 dispatcher-named fresh-eyes points. (1) Outcome-folding soundness: PekTriggerOutcome's 4 variants (queued/market_hours/pdf_extractor_error/unreachable) all fold to pek_triggered; traced that D3C's future bctc_layout_units row-count check is correctness-preserving regardless of which outcome fired (row-count is the sole ground-truth signal for all 4). Flagged non-blocking: because folding makes never-started (503/502) indistinguishable from already-in-flight (202) at the DB-column level, D3C's reconciliation loop must adopt a uniform always-re-fire-on-still-zero policy (not passive re-check) to guarantee eventual convergence for the 503/502 cases — already an explicitly open PM decision in the design doc itself (§D3 line 73); recommend this note travel into D3C's dispatch. Per-outcome detail not unrecoverably lost (pekExtractTrigger.ts already logs it via log.error). (2) Read bctc-pdf-pull-job.test.ts's full diff: TC-14 uses a real SELECT-from-financial_reports read-back for the shell-row id; TC-15/16 correctly test this job's own unconditional-write logic via injected outcome stubs + real getQueueRow DB reads; TC-17 forces a REAL sqlite failure (DROP TABLE financial_reports, not a mocked throw) and proves the catch/non-fatal/skip-but-advance edge case end-to-end via real DB reads — the strongest of the 4, genuinely non-tautological. (3) Read FIX-BCTC-ENRICH-SILENT-0ROWS.test.ts's full rewrite: SUPERSEDED header explicitly maps every historic AC-1..AC-8 to either a successor test or a stated merge-rationale — AC-1/2/3/5/6 -> 1 test (sendBugFn/enrichFailed fields provably no longer exist; ticker-genericity moot, code path no longer branches on ticker), AC-4/4b/8 -> 1 test (row-count no longer branches the outcome, so the 3 historic row-count variants are now provably redundant with each other), AC-7 -> its own dedicated test. Zero ACs vanish silently. (4) D3C-dependency risk (status_note's own explicit flag): confirmed accurately review-window-acceptable — cross-checked project standing policy (nothing rebuilds/deploys without a separate user-gated ops step) and confirmed D3C already correctly sits in backlog[] depends:[D3B], set to auto-promote to ready[] once this lands DONE_VERIFIED — a correctly-sequenced next dispatch, not a dangling risk. (5) No-fake-data lens: diff touches only bctc_vps_queue.status enum + control-flow + test fixtures (synthetic UUIDs/tickers, standard repo convention) — zero market-data synthesis. DJ-GATE-1 satisfied (sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md STEP dev-mcp-server-S35, task-id-stamped, line 337)."
  }) as $done
| .task_board.review = [$rv[] | select(.id != "FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "qa"
