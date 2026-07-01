# PO Notebook

_Last: 2026-07-01T04:31Z_

## Tick 2026-07-01T04:31Z — Sprint kickoff PREDICTION-EVIDENCE-REVIVAL (router coord 3340d049)

Router flagged prediction dashboard "no new predictions". RAW-re-verified (NOT relayed): serving layer healthy, root = UPSTREAM evidence starvation.

**RAW ground truth (independently confirmed):**
- get_evidence_summary CTG (live) = 4 fragments, ALL `foreign_flow_institutional LR=1.00 (n=0) UNTRUSTED`. Monoculture + LR-empty confirmed NOW.
- digest-predict notebook: honest NO-OP 06-27..06-30, "evidence UNTRUSTED systemic 12th consecutive cycle". validate_prediction_claims Sharpe>1.0 gate unsatisfiable at n=0 → structural 0-claims.
- Router said "UNTRACKED" — FALSE. Board already had stranded `FIX-EVIDENCE-PIPELINE-STARVED` (status REVIEW mis-parked in backlog, null owner) + `FIX-PREDICTION-SIGNALS-EMPTY` (TODO). Prior sprint `EVIDENCE-ACCUM-SILENT-CRON` (DONE_VERIFIED 53d00955) fixed cron-scheduling/dedup ONLY — accumulator RUNS (rows_written=9 06-13) but LR n=0 + monoculture persist.

**Decision (recurring-bug-escalation):** NOT another point patch. Minted ONE umbrella sprint → BA→architect (SPLIT multi-zone). 3 work-items: (a) LR compute/backfill job apps/mcp-server/src/scheduler [PRIMARY]; (b) monoculture audit of record_evidence_fragment producers (cowork agent flows); (c) validation-gate cold-start bootstrap DESIGN.

**Writes (orch-apply.sh RC=0, warns 98→96 non-blocking):**
- sprint_goal.entries += PREDICTION-EVIDENCE-REVIVAL (active, high)
- backlog += BA-PREDICTION-EVIDENCE-REVIVAL (ba, zone=multi, SPRINT-M, BACKLOG)
- Folded stranded rows under it via `specced_under` (stay BACKLOG, no double-dispatch; pm decomposition mints real dev tasks). Normalized FIX-EVIDENCE-PIPELINE-STARVED drift REVIEW→BACKLOG.
- Sprint umbrella lock `task:PREDICTION-EVIDENCE-REVIVAL` claimed (po, 3600s).

**RETURN → NEXT: ba** (write spec). Script: scripts/po-s135-prediction-evidence-revival-kickoff.jq.

## Carry-over
- Scope_out (do NOT re-fix): serving layer (healthy); evidenceAccumulator cron/dedup (done 53d00955); Brier degradation (FIX-FB-PREDICTION-CALIBRATION-LOOP); kinh-dich 501 (KD-BACKTEST-501-4X). Reference in BA spec, not blockers.
- FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE still carries FREEZE spec (whitelist+debounce) for agent-father grooming.
