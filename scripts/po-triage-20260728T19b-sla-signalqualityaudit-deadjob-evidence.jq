#!/usr/bin/env jq -f
# =============================================================================
# po-triage-20260728T19b-sla-signalqualityaudit-deadjob-evidence.jq
# =============================================================================
# PO triage tick 2026-07-28T19:5xZ — evidence-only appends, no lane moves, no new rows.
# Referenced from: docs/agents/po/flow/scripts-registry.md
#
# Invocation:
#   jq --arg NOW "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#      -f scripts/po-triage-20260728T19b-sla-signalqualityaudit-deadjob-evidence.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# WHY: the Telegram "new" backlog was handed to PO characterised as ALL BCTC-related.
# It is not. Report id 3838 is a CRITICAL sla-monitor breach. Both rows below get the
# arithmetic so neither can be closed on a false-green.
# =============================================================================

($NOW) as $now

| .task_board.backlog |= map(
    if .id == "FIX-SLA-SIGNALQUALITYAUDIT-MONTHLY-CADENCE-MISCLASSIFIED-48H" then
      .updated_at = $now
      | .po_evidence_20260728 = "ANTI-FALSE-GREEN WARNING + ARITHMETIC, appended by po 2026-07-28T19:5xZ. LIVE OBSERVATION: Telegram report id 3838 (2026-07-26T16:30:03Z, from_agent=analysis-agent, still status=new) reads '[sla-monitor] CRITICAL breach: signal_quality_audit stale 73217min (threshold 2880min)'. THE ARITHMETIC THIS ROW IS MISSING: 73217min = 50.85 days; back-solving from the report timestamp puts the last signal_quality_audit artifact at 2026-06-05T20:13Z. TWO CONSEQUENCES THE CURRENT ROW TITLE HIDES. (1) The stated cadence may be wrong: 2026-06-05 is not a 1st-of-month, so the artifact does not line up with the '0 0 1 * *' schedule this row asserts — confirm the real cadence from the live cron/scheduler before tuning anything. (2) THE JOB ALSO APPEARS GENUINELY DEAD, independent of the threshold bug: a monthly job last seen 2026-06-05 should have produced another artifact on 2026-07-01. It did not. So there are TWO defects stacked here and this row only names one. DO NOT CLOSE BY WIDENING THE THRESHOLD ALONE. A fixer who simply relabels the threshold from 2880min to a monthly value will produce a green board while a ~51-day-dead job stays dead — and if the chosen value carries any grace beyond 31 days, the breach signal is permanently silenced instead of fixed. ACCEPTANCE MUST INCLUDE a live probe showing a NEW signal_quality_audit artifact produced AFTER the fix, with its own timestamp — not merely that the CRITICAL alert stopped firing. Threshold correctness and job liveness must be verified as two separate assertions."
    else . end)

| .task_board.ready |= map(
    if .id == "FIX-L4-FRESHNESS-SLA-MONITOR-SELF-POLICING" then
      .updated_at = $now
      | .po_evidence_20260728 = "PARTIAL VERIFY-LIVE ANSWER, appended by po 2026-07-28T19:5xZ — this row's open question is whether the monitor 'actually runs and emits SLA-breach signals', noting it was 'never ... observed raising a breach'. IT HAS NOW BEEN OBSERVED. RAW: Telegram report id 3838, created_at 2026-07-26T16:30:03Z, from_agent=analysis-agent, text '[sla-monitor] CRITICAL breach: signal_quality_audit stale 73217min (threshold 2880min)'. So the emit path (monitor -> breach detection -> Telegram) is LIVE and does fire with real numbers attached. SCOPE LIMIT — do not over-read this: it evidences the sla-monitor emit path generally, NOT specifically the coverage-map checker (coverageMapFreshnessChecker.ts) that this row is actually about. The remaining VERIFY-LIVE burden is unchanged: confirm coverageMapFreshnessChecker is wired into freshnessSlaMonitorJob's scheduler and observe a COVERAGE-MAP breach specifically. Useful secondary signal for whoever takes this row: report 3838 has sat status=new since 07-26 with resolution=none, so even a correctly-emitted CRITICAL currently reaches no owner — see FIX-TELEGRAM-REPORT-ACK-STATUS-STOP-RESURFACE (P3) and FIX-SIGNAL-ROUTING-ROWS-COVERAGE-GAP-DEEPDIVE (P1/ready, promoted this tick). Emitting is only half the capability; nobody is receiving."
    else . end)
