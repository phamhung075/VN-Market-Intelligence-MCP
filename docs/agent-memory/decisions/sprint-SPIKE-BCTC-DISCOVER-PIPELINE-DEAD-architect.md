# Decision Journal — Sprint SPIKE-BCTC-DISCOVER-PIPELINE-DEAD · architect

**Sprint goal:** Root-cause the 17-day 0-push bctc discover->enqueue->fetch->push pipeline stall (B-05 CRITICAL + B-13 WARN) — pin the EXACT dead stage, emit a precisely-zoned FIX. Recurring-bug-escalation (BCTC area >2 fix cycles).
**Agent:** architect
**Started:** 2026-07-03T06:58:49Z

---

### STEP architect-S1 · architect · 2026-07-03T07:05:00Z
**task-id:** SPIKE-BCTC-DISCOVER-PIPELINE-DEAD
**what-done:** Read prior sibling-task chain (B-05-FIX -> B-05-FU-ENRICHER-LIVENESS -> FIX-BCTC-ENRICHER-STUCK-BACKLOG, all DONE/DONE_VERIFIED) before probing live — found Stage 1 (scheduler) and Stage 2 (enricher URL-discovery) already diagnosed+fixed by the sibling chain (commit 14b955802, QA PASS).
**what-considered:**
- Re-derive Stage 1/2 from scratch vs trust the sibling chain's RAW evidence and probe forward from where it left off — chose trust+extend, since re-deriving would duplicate work the dispatch note explicitly said was already DONE_VERIFIED.
**why-decision:** The SPIKE's own dedup list explicitly excludes Stage-2-adjacent tasks; re-probing Stage 1/2 live (docker-exec status counts + cron_job_runs) took 2 tool calls and CONFIRMED the sibling fix is live-working rather than assuming it — cheap verification, not redundant re-investigation.
**why-change:** No change — this is the SPIKE's own first sub-question.

### STEP architect-S2 · architect · 2026-07-03T07:10:00Z
**task-id:** SPIKE-BCTC-DISCOVER-PIPELINE-DEAD
**what-done:** Probed `bctcPdfPullJob` cron_job_runs history live — found 4 concurrent "running" invocations (started 06:00:01/06:30:00/06:30:01/07:00:01, oldest 65+min in-flight, container confirmed alive/no-restart since 04:38:34Z rebuild) plus a 69.9-min single-run duration at 05:30:00. Cross-checked against container logs: same PDF (HCM, NKG) saved 3-4x within minutes — proof of redundant concurrent reprocessing, not a single stuck process.
**what-considered:**
- Hypothesis A (status-mismatch bug: enricher sets source_url but leaves status stale) — checked `bctcQueueEnricherJob.ts:456` directly, REJECTED (status IS correctly flipped to 'pending').
- Hypothesis B (job-overlap/no-mutex-guard on bctcPdfPullJob) — CONFIRMED via `SqliteJobRunRepository.wrapRun()` (no overlap check) + cron_job_runs timeline + duplicate-PDF-save log evidence + `docker stats` (pdf-extractor 204%CPU/75.3%mem).
**why-decision:** Hypothesis B is the only one consistent with ALL evidence simultaneously (multi-run overlap timeline, duplicate log lines, resource contention, existing isRunning-guard precedent in 3 sibling jobs but absent here).
**why-change:** No change from SPIKE mandate — pins the exact dead stage as required.

### STEP architect-S3 · architect · 2026-07-03T07:13:00Z
**task-id:** SPIKE-BCTC-DISCOVER-PIPELINE-DEAD
**what-done:** Wrote brief (docs/architecture-briefs/2026-07-03-bctc-discover-pipeline-dead.md), emitted precisely-zoned FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD (apps/mcp-server, dev-mcp-server, single zone — not "multi"), closed own SPIKE row in_progress->done via orch-apply.sh full-object transform, verified `.head` byte-identical pre/post (diff empty) per the explicit dispatch contract (feedback_architect_self_flips_spike_board — do NOT touch head, router owns it this cycle).
**what-considered:**
- Fold Stage-4 parse failures (9/10 enrich_failed) into a NEW fix vs cite as corroborating evidence for the already-in-flight FIX-BCTC-BANK-BS-COLUMN-ORDER — chose cite-only, since creating a duplicate fix for an already-owned defect would violate dedup and waste dev-mcp-server capacity.
**why-decision:** Zone precision + no duplication are both explicit dispatch requirements; single-zone (apps/mcp-server) fix with a mirrored existing pattern (weatherCheckJob/vnstockFundamentals isRunning guard) is the minimal, lowest-risk, most reviewable fix.
**why-change:** No change from plan — deliverable matches dispatch contract exactly (brief + FIX task + own-row closure, head untouched).
