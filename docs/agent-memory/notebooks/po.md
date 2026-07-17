# PO Notebook

_Last: 2026-07-17T02:28Z (dev-team tick — triaged report 3495 + drained cowork telemetry; SPRINT-KICKOFF of P0 root SPIKE — 1 board lane-move, 0 mint)_

## Tick 2026-07-17T02:28Z — 3495 duplicate + KICKOFF SPIKE-BCTC-EXTRACTION-DORMANT (decision a)

### PRIOR-ART FIRST (grepped board ALL lanes + processed-signals + my carry-over BEFORE any write)
- Root row = `SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD` [was backlog[386]/P0/plan_only, owner dev-mcp-server]. AC-3 (circuit-breaker `FIX-BCTC-RECONCILE-EMISSION-CIRCUIT-BREAKER`) already DONE_VERIFIED+archived (2026-07.json) — do NOT resurrect. Only AC-1 (infra-rollback) + AC-2 (dormancy) live.
- No competing infra-rollback/restore/named-volume row exists (grep matched only incidental substrings). Durable fix `FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP` (backlog[281]) still parked, NOT in-flight. No dormancy/extraction row in review[]/in_progress — root genuinely un-worked.

### DISPOSITIONS
- **3495** [bctcExtractReconcile] VIX 2024-Q1 RECONCILE EXHAUSTED 0-rows/8-passes enrich_failed = SAME class as 3494 SHB (last tick), 3480/3481/3482 — symptom of the dormant-producer P0. process_telegram_report(3495, duplicate, delete=true) → processed:true, msg 3556 deleted. status=new now empty.
- **Drained signal** cowork-team-…02:04:41.903Z → to:system-auditor type:cowork-tick-fire = cowork dispatcher heartbeat telemetry (slots_fired alert-commander-market, headroom 3316MB, pressure primary). Already `_processed` (routed-to-po) + moved to processed/. system-auditor is NOT a routable dev target → mis-addressed telemetry. Non-actionable, dismissed. NO board write.

### DECISION (a) SPRINT-KICKOFF — recurring-bug-2+ escalation, fleet idle, no deferral gate
- 2nd+ reconcile-exhausted duplicate in consecutive ticks = churn-without-convergence treadmill; AC-3 done, so AC-1+AC-2 are the ONLY convergence lever. Fleet idle (in_progress=0, ready=0, head idle) → no WIP gate. Deferral (b) rejected: no concrete gate (no dep, no ops/user gate — the infra probe IS what determines if a gate exists).
- BOARD write (jq | orch-apply.sh): lane-move backlog→ready[], status=READY, del(plan_only), owner/next_agent=ops, +.kickoff{ordered_ac_dispatch}. AC-1=ops (order 1, critical-path: RAW evidence shows extraction maxes REGRESSED 07-12→07-16 ⇒ named-volume rollback strongly implied; if confirmed ⇒ RESTORE .backups). AC-2=dev-mcp-server +dev-pdf-extractor assist (order 2, depends_on AC-1; fold to REFINE-DURABLE-TRIGGER-BACKSTOP if refine-trigger dormant). Validator PASS, conservation task_total 527=527 (lane-move, 0 mint), head untouched idle/router. Decision record = the .kickoff annotation (not marking DONE/REVIEW → no separate decision_journal entry).

## Carry-over
- SPIKE now READY/ops in ready[] — router will dispatch ops for AC-1 next. Watch: ops finishes AC-1 → MUST hand AC-2 to dev-mcp-server (encoded in .kickoff.ordered_ac_dispatch). If AC-1 finds a named-volume wipe → data-loss incident, ops/user-gated RESTORE from .backups (feedback_vm_rebuild_destroys_named_volumes).
- Reconcile-exhausted duplicates keep arriving ~1/tick until AC-1/AC-2 converge → keep archiving as duplicate under the SPIKE; the kickoff is the convergence step. Do NOT re-mint SPIKE-BCTC-*/FIX-BCTC-* or resurrect the archived circuit-breaker.
- Committed MY paths only (orch-state.json + po.md); did NOT touch peer cowork churn or clean po-decisions.md.
