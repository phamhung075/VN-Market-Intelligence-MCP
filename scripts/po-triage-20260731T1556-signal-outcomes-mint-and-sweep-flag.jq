# PO triage 2026-07-31T15:56Z — three additive changes, one atomic orch-apply write.
#   A. manual-dispatch-sweep Step 2 stamp on TE-T14 (top candidate, P1 DRS-stranded-off-allowlist)
#   B. live post-deploy escalation evidence appended to the sweepguard escalation row (review, awaiting qa)
#   C. mint FIX-SIGNAL-OUTCOMES-LIVENESS-BLIND-TO-ZERO-PRODUCTION + repair FIX-ALERT-CASCADE-OUTCOME-DEAD null zone
def stamp_sweep($now):
  if .id == "TE-T14" then
    . + { po_manual_dispatch_flagged_at: $now,
          po_manual_dispatch_flagged_by: "po (manual-dispatch-sweep)",
          po_manual_dispatch_class: "DRS-STRANDED-OFF-ALLOWLIST",
          po_manual_dispatch_note: "po (manual-dispatch-sweep) surfaced DRS-STRANDED-OFF-ALLOWLIST candidate — folding into this tick's BATCH" }
  else . end;

def fix_cascade_zone($now):
  if .id == "FIX-ALERT-CASCADE-OUTCOME-DEAD" then
    . + { zone: "apps/mcp-server/",
          priority: "P1",
          po_zone_repair_20260731: ("zone was null (structurally un-dispatchable: dev-team Step 3 rejects a batch entry with no zone) and priority P3. record_signal_outcome is defined in apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts + registered in .../bootstrap/agentBootstrap.ts, so zone=apps/mcp-server/. Priority raised P3->P1 on LIVE evidence read " + $now + " from the running container (docker exec, readonly bun:sqlite, /app/data/market.db): signal_outcomes has 105 rows total, MAX(checked_at)=2026-07-26 00:17:00 and zero rows created in the 5 days since — the outcome feedback loop is confirmed dead in production right now, not merely historically.") }
  else . end;

def add_escalation_evidence($now):
  if .id == "FIX-SWEEPGUARD-ESCALATION-RETROACTIVE-COUNTER-AND-SESSION-SCOPED-ACTOR" then
    . + { po_live_escalation_evidence_20260731: "FIRST LIVE POST-DEPLOY ESCALATED REJECT, mechanism-verified by po triage (docs/signals/processed/commit-sweep-guard-2026-07-31T154714Z-51817.json, 2026-07-31T15:47:14Z). Payload parsed per triage-signals.md MANDATORY parse-payload-first rule (NOT off git show --stat): 'escalated=true prior_warns=3 threshold=3 mode=warn', actor=64c7c677-0f0f-4cee-a3ce-dba79d70b7ae. Read scripts/git-hooks/pre-commit at source: L574-577 AC-1 deploy baseline self-installed at .git/sweep-guard.escalation-baseline=2026-07-31T04:04:07Z; L579-582 counts only log lines after that floor; L583-588 escalated=true forces escalate_effective=reject. Replayed the counter by hand against .git/sweep-guard.log: exactly 3 post-baseline BARE warns for this actor (04:04:07Z dev-team-3.md+notebooks/main.md, 12:50:40Z dev-team-5.md+notebooks/main.md, 12:57:21Z same pair) -> the 4th attempt was correctly BLOCKED. CONCLUSION FOR QA: AC-1 works as designed post-fix — the counter is genuinely windowed to the deploy baseline (pre-fix it would have counted the whole ~20-warn historical log), the block was a true positive, and the offending agent converged on its very first retry with an explicit pathspec. NO new sibling row minted: this is confirming evidence for THIS row, not a 7th member of the FIX-COMMIT-SWEEP-GUARD-* family. RESIDUAL NOTE (not re-litigated here): the AC-2 'session-scoped actor' arm was resolved by RENAME + documentation (pre-commit L491 keeps actor=$CLAUDE_CODE_SESSION_ID, L501/L612 now state the budget is POOLED across every agent in one coordination session) rather than by making it agent-scoped — QA should sign off on that as a deliberate WONTFIX-by-rename, not assume agent granularity was delivered." }
  else . end;

def newrow($now):
  { id: "FIX-SIGNAL-OUTCOMES-LIVENESS-BLIND-TO-ZERO-PRODUCTION",
    type: "FIX",
    title: "signal_outcomes liveness guard reports 0 = healthy while ZERO rows are being produced — post-GLOB-fix the only outcome-pipeline detector is structurally blind to producer death",
    status: "BACKLOG",
    priority: "P1",
    size: "S",
    zone: "apps/mcp-server/",
    owner: "po",
    created_at: $now,
    created_by: "po/triage-20260731T1556Z",
    baseline_pass: "14908",
    verification_gate: "live_runtime_query_after_deploy",
    files: [ "apps/mcp-server/src/scheduler/alerts/signalOutcomeResolutionJob.ts",
             "apps/mcp-server/src/__tests__/FIX-SIGNAL-OUTCOMES-RESOLUTION-STALLED.test.ts" ],
    related: [ "FIX-ALERT-CASCADE-OUTCOME-DEAD",
               "FIX-SIGNAL-OUTCOMES-LIVENESS-GUARD-COUNTS-STRUCTURALLY-UNRESOLVABLE-ROWS",
               "FIX-SIGNAL-OUTCOMES-RESOLUTION-STALLED" ],
    desc: "FOUND WHILE TRIAGING telegram reports #4236/#4237 (both RESOLVED as stale pre-deploy false alarms — see status_note). checkStalledResolutionLiveness() (signalOutcomeResolutionJob.ts:80-114) is the ONLY liveness detector on the signal-outcome calibration pipeline. It asks exactly one question: 'how many rows have checked_at IS NULL and created_at older than 72h (and a 3-letter ticker code)?'. That predicate is monotone in ROW EXISTENCE — it can only be non-zero if rows are actually being created. LIVE STATE read from the running container 2026-07-31T15:5xZ (docker exec vn-market-intelligence-mcp-mcp-server-1, readonly bun:sqlite on /app/data/market.db): 105 rows total, 103 resolved, the 2 unresolved are the known-structural MACRO (2026-06-06) + MULTI (2026-06-25) pseudo-codes, MAX(checked_at) = 2026-07-26 00:17:00, and ZERO rows created in the 5 days since. So the guard now returns 0 and reports HEALTHY at the precise moment the pipeline is deadest — the classic passive-health / dead-detector shape (feedback_passive_health_masks_dead_data, feedback_composite_score_masks_dead_detector_pruned_table). Note this is a SECOND-ORDER consequence of the correct fix 314e70718 (FIX-SIGNAL-OUTCOMES-LIVENESS-GUARD-COUNTS-STRUCTURALLY-UNRESOLVABLE-ROWS, now in review[]): before it, the MACRO/MULTI rows kept the count at 2, which by accident made the guard fire daily and kept the subsystem visible. Excluding them was right, but it removed the last thing making noise, so nothing is left to notice that record_signal_outcome has stopped emitting entirely. The PRODUCER-side defect is already tracked as FIX-ALERT-CASCADE-OUTCOME-DEAD (this triage repaired its null zone -> apps/mcp-server/ and raised P3 -> P1 on the live evidence above); THIS row is the distinct DETECTOR-side gap and must not be deduped into it — fixing the producer without fixing the detector leaves the next stall equally invisible.",
    deliverable: "AC-1: checkStalledResolutionLiveness() (or a sibling assertion invoked from the same job) additionally fails loud when signal_outcomes has had ZERO rows created within a configurable recency window (suggest: no new row in > 72h while the upstream alert/cascade path is live), so producer death is detectable and not merely resolver stall. AC-2: the new assertion must be provably non-vacuous — a unit test that seeds an EMPTY / stale-only signal_outcomes table and asserts the guard alerts, RED before the fix and GREEN after (the existing FIX-SIGNAL-OUTCOMES-RESOLUTION-STALLED.test.ts only covers the checked_at-NULL branch and passes today against a dead pipeline). AC-3: keep the 314e70718 GLOB '[A-Z][A-Z][A-Z]' non-ticker exclusion intact — do NOT re-introduce MACRO/MULTI counting to restore noise. AC-4: preserve the existing at-most-one-BUG-alert-per-UTC-day dedup on the new branch too. VERIFY (verification_gate=live_runtime_query_after_deploy — NOT a host-side bun test alone, per feedback_host_cli_integrity_check_false_ok_verify_through_runtime): after rebuild, docker exec the running mcp-server and confirm the new assertion returns non-zero/alerting against the CURRENT live market.db (which today has a 5-day creation gap), then confirm it returns clean against a seeded fixture with a fresh row.",
    status_note: "Origin: PO triage of unresolved telegram reports #4236 + #4237 ('[signal-outcome-resolution] LIVENESS: 2 signal_outcomes row(s) unresolved >72h'). Those two reports themselves are FALSE ALARMS and were resolved, NOT converted into this row — RAW evidence: the fix 314e70718 landed in git 2026-07-31T00:34:15Z but the mcp-server image was only rebuilt at 2026-07-31T14:44:17Z, so the container serving the 12:17:03Z and 13:17:00Z alerts was still running pre-GLOB code; the CURRENTLY deployed bundle does contain the filter (verified in-container at /app/src/scheduler/alerts/signalOutcomeResolutionJob.ts:92) and the live GLOB-filtered query now returns 0. The two alerts an hour apart (despite the at-most-one-per-UTC-day guard) are explained by the 14:44Z rebuild resetting the module-level _lastStalledAlertDate, not by a broken dedup. This row exists because verifying that false alarm surfaced a real, separate, undeduped defect."
  };

.task_board.backlog |= ( map(stamp_sweep($now) | fix_cascade_zone($now)) + [ newrow($now) ] )
| .task_board.review |= map(add_escalation_evidence($now))
| ._updated_at = $now
| ._updated_by = "po/triage-20260731T1556Z"
