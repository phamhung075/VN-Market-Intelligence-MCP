# Board flip: FIX-BCTC-D3C-RECONCILE-JOB REVIEW -> DONE_VERIFIED
#
# QA round 1. Router already independently RAW-verified: board row genuine
# (review[]/REVIEW/next_agent=qa, 8 files match), full new job file read
# (query WHERE status='pek_triggered' AND last_attempt<-5min; report_id
# re-derived via (action_code,sort_key), no report_id column on
# bctc_vps_queue; OR-across-3-tables success check, not simplified),
# sortKey normalizer byte-for-byte match vs buildFiscalPeriod(), MAX_RECONCILE_
# ATTEMPTS=8/reconcile_attempts column genuinely separate from pre-existing
# attempts column (idempotent guarded ALTER TABLE), cron registration (58
# JOB_TABLE entries, CRONS.bctcExtractReconcile wired through the generic
# scheduleCron()/wrapRun() loop), sendTelegramBug reuse confirmed via git
# show 989654f22, own tsc/mock-guard run, own 14/14-test run (56 expect()),
# own re-run of the 2 closest D3B siblings (41/41), system-map/cron-registry/
# project-stats counters, notebook 67L, DJ-GATE-1 (dev-mcp-server-S36) present.
# Did NOT re-derive any of that — fresh-eyes focus on 5 dispatcher-named
# judgment points, ALL independently re-verified by reading the actual source
# (not trusting the status_note's paraphrase):
#
# (1) Re-fire-vs-passive policy: SOUND, endorsed. Independently read
#     pushBctcLayoutHandler.ts's write path — DELETE FROM bctc_layout_units/
#     bctc_page_zones WHERE report_id=? runs inside the SAME db.transaction()
#     as the re-INSERT, confirming the idempotency claim is real (a wasted
#     re-fire on an already-in-flight 202 row costs one HTTP round-trip +
#     a harmless atomic replace, not a duplicate/corrupt row). Confirmed via
#     the PekTriggerOutcome union (pekExtractTrigger.ts) that bctc_vps_queue
#     genuinely has no column distinguishing 202-in-flight from 503/502-
#     never-started, so a passive-only policy would strand the entire 503/502
#     class until MAX_RECONCILE_ATTEMPTS silently exhausts them WITHOUT EVER
#     RETRYING — a second silent-failure class. Uniform re-fire, bounded by
#     the same 8-pass/~4h cap, is the correct resolution of the QA-flagged
#     D3B open point.
# (2) Cross-file ownership: grepped 'pek_triggered' and 'enrich_failed'
#     repo-wide. bctcExtractReconcileJob.ts is confirmed the ONLY writer that
#     moves a row OUT of pek_triggered (vpsHealthPoller/freshnessSlaMonitorJob/
#     bctcQueueEnricherJob only read it for membership checks; bctcQueueEnricherJob
#     explicitly documents staying hands-off pek_triggered rows). enrich_failed
#     IS separately read+reset by bctcQueueEnricherJob.ts's PRE-EXISTING
#     (FIX-BCTC-ENRICHER-STUCK-BACKLOG, 2026-07-02, not touched by this task)
#     Arm-2 grace-period retry: status IN ('url_not_found','enrich_failed') AND
#     last_attempt<-7d AND attempts<6 -> resets source_url/status='pending' for
#     rediscovery. This does not violate this task's OWNERSHIP claim (D3C still
#     owns the pek_triggered->enrich_failed write exclusively) but a genuine
#     downstream gap was found: neither this reset path nor bctcPdfPullJob's
#     'UPDATE ... SET status=pek_triggered' (on the row's next real pull cycle)
#     ever zeroes reconcile_attempts, so a row recycled through Arm-2 re-enters
#     pek_triggered carrying its old (near-8) counter and can re-exhaust to
#     enrich_failed on the very next reconciliation pass instead of getting a
#     fresh ~4h budget. NON-BLOCKING for this task: (a) it mirrors an identical
#     pre-existing gap already accepted for the `attempts` column (also never
#     reset on Arm-2 recycle) — not a novel regression, (b) worst case is an
#     earlier-than-ideal fail-loud re-terminalization, not silent data loss or
#     a false 'done', (c) the fix belongs in bctcPdfPullJob.ts/bctcQueueEnricherJob.ts,
#     both out of this task's file scope and both from already-approved prior
#     tasks. Recommend a small follow-up backlog task: reset reconcile_attempts
#     (and attempts) to 0 at the point a recycled row re-enters 'pending'/
#     'pek_triggered'.
# (3) financial_reports UNIQUE constraint: CONFIRMED. bctc-schema.ts's
#     financial_reports CREATE TABLE (executed via schema-financial-reports.ts's
#     db.exec(SQLITE_DDL)) carries UNIQUE(action_code, sort_key) — the exact
#     pair the reconcile job's `WHERE action_code=? AND sort_key=?` .get()
#     targets, and the same pair ensureFinancialReportShellRow's own
#     ON CONFLICT(action_code, sort_key) targets (D1's stable-id upsert this
#     task depends on). No duplicate-row risk; .get() cannot return an
#     "arbitrary" row among duplicates because duplicates are structurally
#     prevented by the constraint.
# (4) Regression sweep: independently ran the FULL 105-file *bctc*/*pek*
#     per-file-isolation corpus myself (new scripts/qa-bctc-pek-test-sweep.sh,
#     modeled on scripts/ci-per-file-isolation.sh's proven never-bare-bun-test
#     pattern) rather than trusting the claim wholesale: 1153 pass / 4 skip /
#     8 fail, all 8 fails isolated to 1294b-bctc-fallback.test.ts (grepped —
#     zero references to bctc_vps_queue/reconcile_attempts/pek_triggered/
#     bctcExtractReconcile; confirmed pre-existing/unrelated real-network
#     standalone timeout). Pass/fail counts and fail-attribution match the
#     dev-mcp-server claim exactly; skip count differs by 1 (4 vs claimed 5,
#     immaterial to the fail-attribution conclusion, not chased further).
# (5) docs/architecture/microservice/mcp-server/financial-reports.md invariant
#     #8: read against the actual code — accurate on every clause (fold-4-
#     outcomes-into-pek_triggered, bctcExtractReconcileJob as sole exit path,
#     the OR-across-3-tables success check, uniform re-fire + idempotency
#     rationale, no report_id column requiring re-derivation on every pass).
#
# Standard gate: tsc clean (own run), mock-guard PASS (own run, 5 files), DDD
# clean (scheduler imports only infrastructure; schedulerJobTable.ts's
# pre-existing IJobRunRepository domain-interface import confirmed via git
# diff to predate this task, not part of this diff), no process.env/secrets
# in touched files, no fabricated data (control-flow + schema + synthetic
# test fixtures only).
#
# DJ-GATE-1: sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md STEP dev-mcp-server-S36
# task-id-stamped, present before this review — satisfied.
#
# GUARD: refuse unless FIX-BCTC-D3C-RECONCILE-JOB is in review[] with status
# REVIEW. .head is idle/null (not pointing at this task) — per standing guard
# convention (D3B precedent script), this is a BOARD-ONLY move: .head is left
# untouched rather than blindly overwritten.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/qa-fix-bctc-d3c-reconcile-job-done-verified.jq \
#          docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FIX-BCTC-D3C-RECONCILE-JOB")][0]) as $t
| if $t == null then error("FIX-BCTC-D3C-RECONCILE-JOB not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FIX-BCTC-D3C-RECONCILE-JOB status != REVIEW (got \($t.status)) — refuse")
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
    qa_note: "APPROVED. Router already independently RAW-verified board row/diff/tsc/mock-guard/own-test-run/2-sibling-regression/counters/notebook/DJ-GATE-1 — did not re-derive those, focused on 5 dispatcher-named fresh-eyes points, all independently re-verified from source. (1) Re-fire-vs-passive: SOUND — read pushBctcLayoutHandler.ts directly, confirmed DELETE-before-INSERT runs inside the same db.transaction() as the re-INSERT (genuine idempotency, not a paraphrase); bctc_vps_queue structurally cannot distinguish 202-in-flight from 503/502-never-started, so uniform re-fire (bounded by the same 8-pass cap) is the only policy that guarantees eventual convergence for the 503/502 class. (2) Cross-file ownership: bctcExtractReconcileJob.ts confirmed (repo-wide grep) as the ONLY writer moving rows OUT of pek_triggered. Found and flagged NON-BLOCKING: bctcQueueEnricherJob.ts's pre-existing (2026-07-02, untouched by this task) Arm-2 grace-period retry recycles enrich_failed rows back to pending after 7d without ever zeroing reconcile_attempts (or the pre-existing attempts column, same gap already accepted there) — a recycled row can re-exhaust to enrich_failed almost immediately on its second pek_triggered episode instead of getting a fresh ~4h budget. Not a regression from this task (mirrors an identical pre-existing gap), not silent/data-corrupting (worst case: earlier fail-loud re-terminalization), and the fix belongs in files outside this task's scope (bctcPdfPullJob.ts/bctcQueueEnricherJob.ts, both from already-approved prior tasks) — recommend a small backlog follow-up to reset reconcile_attempts+attempts on Arm-2 recycle. (3) financial_reports UNIQUE(action_code, sort_key) CONFIRMED present in bctc-schema.ts's CREATE TABLE (executed via schema-financial-reports.ts db.exec(SQLITE_DDL)) — same pair the job's lookup and D1's ON CONFLICT both target; no arbitrary-row risk. (4) Independently ran the full 105-file *bctc*/*pek* per-file-isolation sweep myself (new scripts/qa-bctc-pek-test-sweep.sh): 1153 pass / 4 skip / 8 fail, all 8 fails isolated to the pre-existing unrelated 1294b-bctc-fallback.test.ts standalone timeout (grep-confirmed zero symbol overlap) — pass/fail/attribution match the claim exactly (skip count off by 1, immaterial). (5) financial-reports.md invariant #8 read against actual code — accurate on every clause. Standard gate: own tsc clean, own mock-guard PASS (5 files), DDD clean (scheduler imports infra only; schedulerJobTable.ts's IJobRunRepository domain-interface import confirmed via git diff to predate this task), no secrets/process.env, no fabricated data. DJ-GATE-1 satisfied (sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md STEP dev-mcp-server-S36, task-id-stamped)."
  }) as $done
| .task_board.review = [$rv[] | select(.id != "FIX-BCTC-D3C-RECONCILE-JOB")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "qa"
