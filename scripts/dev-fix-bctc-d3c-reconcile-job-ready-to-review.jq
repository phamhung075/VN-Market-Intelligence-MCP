# Board flip: FIX-BCTC-D3C-RECONCILE-JOB READY -> REVIEW
#
# dev-mcp-server implementation complete. New bctcExtractReconcileJob.ts
# resolves bctc_vps_queue 'pek_triggered' rows (written unconditionally by
# FIX-BCTC-D3B, committed 850ced6ee) to a genuine done/enrich_failed verdict —
# closes the architecturally-urgent gap D3B opened (no prior code path ever
# moved a row out of pek_triggered).
#
# Full implementation detail (design decisions, test breakdown, verification
# results) in status_note below — mirrors this task's own decision-journal
# entry (docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md
# STEP dev-mcp-server-S36) and notebook (docs/agent-memory/notebooks/dev-mcp-server.md).
#
# No pre-existing dev-side "ready->review" jq script was found in scripts/ for
# any of D1/D2/D3A/D3B's own transitions (checked: qa-fix-bctc-d3a-*/
# qa-fix-bctc-d3b-*-done-verified.jq are QA-side review->done_verified scripts
# only) — this one is written fresh, following the exact guard-refuse-unless-
# correct-lane-and-status convention those QA-side scripts use.
#
# GUARD: refuse unless FIX-BCTC-D3C-RECONCILE-JOB is in ready[] with status
# READY. Router's PRE-CLAIM/dispatch already points next_agent at
# dev-mcp-server for this leaf task specifically (not a parent umbrella task),
# so .head is left untouched here — board-only move, same convention as the
# D3A/D3B QA-side scripts.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/dev-fix-bctc-d3c-reconcile-job-ready-to-review.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ARGS.named.now) as $now
| (.task_board.ready // []) as $rd
| ([$rd[] | select(type=="object" and .id=="FIX-BCTC-D3C-RECONCILE-JOB")][0]) as $t
| if $t == null then error("FIX-BCTC-D3C-RECONCILE-JOB not in ready[] — refuse")
  elif ($t.status != "READY") then error("FIX-BCTC-D3C-RECONCILE-JOB status != READY (got \($t.status)) — refuse")
  else . end
| ($t + {
    status: "REVIEW",
    started_at: $now,
    updated_at: $now,
    updated_by: "dev-mcp-server",
    next_agent: "qa",
    commit: "pending",
    files: [
      "apps/mcp-server/src/scheduler/financial-reports/bctcExtractReconcileJob.ts",
      "apps/mcp-server/src/scheduler/cronConfig.ts",
      "apps/mcp-server/src/scheduler/schedulerJobTable.ts",
      "apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts",
      "apps/mcp-server/src/__tests__/bctc-extract-reconcile-job.test.ts",
      "docs/architecture/microservice/mcp-server/financial-reports.md",
      "docs/data/system-map.json",
      "docs/data/cron-registry.json"
    ],
    status_note: "New bctcExtractReconcileJob.ts (interface/scheduler, mirrors bctcPdfPullJob.ts's deps-injection/makeProductionDeps()/runXJob(opts) shape + _isRunning overlap guard). Each tick: SELECT bctc_vps_queue WHERE status='pek_triggered' AND last_attempt < datetime('now','-5 minutes'); for each row re-derives report_id via (action_code, sort_key) lookup against financial_reports (the queue row carries NO report_id column at all — this lookup is the ONLY path, not a defensive fallback). Success check (explicit OR-across-three per design doc, not simplified to layout_units alone): (bctc_layout_units WHERE report_id=? AND quarantined=0 count>0) OR (bctc_table_rows count>0) OR (bctc_md_tables count>0). Success -> status=done. Exhausted MAX_RECONCILE_ATTEMPTS (new const=8, mirrors MAX_404_ATTEMPTS's convention/location, value gives a ~4h budget at the 30-min cadence — 2x the design doc's own >=4-passes/~2h minimum recommendation) -> status=enrich_failed, fail-loud Telegram BUG via sendTelegramBug (the SAME mechanism the pre-D3B synchronous 0-row gate used before D3B deleted it from bctcPdfPullJob.ts — grepped out of git show 989654f22, reused not reinvented). Under cap -> stays pek_triggered, reconcile_attempts++ (NEW dedicated column on bctc_vps_queue, idempotent guarded ALTER TABLE in schema-financial-reports.ts — deliberately SEPARATE from the existing attempts column, which already carries unrelated pre-download fetch-failure semantics for bctcPdfPullJob's own MAX_404_ATTEMPTS gate; reusing it would either falsely fast-track a row toward enrich_failed via an inherited nonzero count, or require a reset-to-0 write that corrupts attempts' own meaning). New cron CRONS.bctcExtractReconcile = 5,35 * * * * (design doc's own suggested offset), registered in schedulerJobTable.ts JOB_TABLE array (58 entries now, was 57) — wired automatically via the array's existing generic scheduleCron(j.cron, () => jobRunRepo.wrapRun(j.name, j.runner), j.options) consumption loop, confirmed by reading it, not assumed. RE-FIRE-VS-PASSIVE DECISION (QA-flagged open point at D3B, mine to resolve): adopted the uniform ALWAYS-re-fire-on-still-zero policy (bounded by the SAME MAX_RECONCILE_ATTEMPTS cap, no separate re-fire budget) recommended in the dispatch prompt, after independently re-deriving the rationale rather than rubber-stamping it: bctc_vps_queue has NO column recording which of D3B's 4 folded trigger outcomes (202/503/502x2) fired for a given row, so a never-started 503/502 row and a genuinely-in-flight 202 row are structurally indistinguishable at this layer. A passive-only re-check policy would leave the entire 503/502 class stuck at pek_triggered until MAX_RECONCILE_ATTEMPTS silently exhausts them into enrich_failed WITHOUT EVER HAVING ACTUALLY RETRIED — a second silent-failure class stacked on the one D3B/D3C exist to close. The flip-side cost (wastefully re-firing an already-in-flight 202 row) is bounded and acceptable: pushBctcLayoutHandler.ts's DELETE-before-INSERT write pattern makes repeat /pek-extract calls for the same report_id idempotent. TESTS: new bctc-extract-reconcile-job.test.ts, 14 tests / 56 expect() calls — empty queue no-op; grace-window row untouched; 3 success tests each satisfying the OR-check via a DIFFERENT single table in isolation (bctc_layout_units-only, bctc_table_rows-only, bctc_md_tables-only, confirming the OR is real not vacuous); quarantined-only layout units correctly do NOT count as success; under-cap still-zero -> stays pek_triggered + reconcile_attempts++ + re-fire call verified (reportId/pdfPath asserted against the real shell row); re-fire correctly SKIPPED (but attempt counter still advances) when no financial_reports row is resolvable yet; exhausted-attempts -> enrich_failed + bug notification fired exactly once (message content asserted, incl. report_id) + a parallel case with NO report_id ever resolved (message explicitly says UNRESOLVED); sendBugFn throwing does not block the enrich_failed status transition (fail-loud, non-fatal notify, mirrors the OLD 0-row gate's own contract); a dedicated report_id-re-derivation test (queue row inserted BEFORE the shell row, via a separate call, proving no in-memory coupling between the two writes — this is the reconciliation job's core correctness property since the queue schema has no report_id column); an overlap-guard test (second concurrent invocation early-returns already_running, mirrors FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD.test.ts's own pattern). VERIFICATION: bun tsc --noEmit clean. scripts/audits/mock-guard.sh --files PASS on all 5 touched/new files. Full BCTC-scoped per-file sweep (105 files matching *bctc*/*pek* under src/__tests__/, incl. this new test file — bun test <file> individually per file, NEVER bare bun test per this sandbox's documented hang pattern): 1153 pass / 8 fail / 5 skip — all 8 fails are 1294b-bctc-fallback.test.ts (grepped for bctc_vps_queue/reconcile_attempts/pek_triggered/bctcExtractReconcile — zero matches; same standalone real-network-timeout hang already root-caused at S30/S31/S33/S35, unrelated fetchParseAndStoreBctc OCR-fallback surface, never touches bctc_vps_queue). toolCount=183 unchanged (dry-run gen-project-stats.ts probe) — no MCP tool file touched. Gate-2d cron.schedule literal-grep probe is (still, pre-existing, same drift class S31/S35 already reported) stale: a prior refactor centralized all cron registration through a scheduleCron() wrapper, so the literal cron.schedule string now appears in exactly 1 file (startupHelpers.ts, the wrapper's own implementation) regardless of job count — reported the real JOB_TABLE entry-count delta (57->58) instead of trusting the stale-pattern grep's wrong number. Live server-boot probe: module load + DB init (incl. the new reconcile_attempts idempotent migration) + tool registration (183) + full JOB_TABLE/bespoke scheduler registration all clean, zero import/migration errors; final httpServer.listen() hit the same pre-existing EADDRINUSE on :3000 (a live Docker container predating this task) as every prior S31-S35 probe — that live instance's /health (toolCount=183) and /api/bctc-inspect routes both still respond cleanly post-diff. DOCS: docs/architecture/microservice/mcp-server/financial-reports.md (+2 Scheduler-Jobs rows for bctcPdfPullJob+bctcExtractReconcileJob, since the file omitted bctcPdfPullJob even pre-D3B — added the minimum needed for my own addition to read coherently, did NOT attempt a full staleness rewrite of the file's older push-based-era invariant #5, out of this task's scope) + new invariant #8 documenting the full pek_triggered state machine end-to-end; docs/data/system-map.json#project.microservices[id=mcp-server].crons (SSOT, 65->66) + docs/data/cron-registry.json (backward-compat mirror, schedulerFileCount 64->65) both updated, both re-validated as well-formed JSON via jq -e. docs/data/project-stats.json#cronJobCount deliberately NOT regenerated — its generator (scripts/gen-project-stats.ts) uses the SAME stale literal-cron.schedule-grep source of truth (confirmed by reading the script header), so running it would just write a differently-wrong number; not this task's scope to fix the generator itself. Not committed — router RAW-verifies diff/tests/tsc/mock-guard independently and commits, per this session's established D1/D2/D3A/D3B dispatch discipline."
  }) as $review
| .task_board.ready = [$rd[] | select(.id != "FIX-BCTC-D3C-RECONCILE-JOB")]
| .task_board.review = ((.task_board.review // []) + [$review])
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "dev-mcp-server"
