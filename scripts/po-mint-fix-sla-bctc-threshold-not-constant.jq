# po-mint-fix-sla-bctc-threshold-not-constant.jq
#
# PO triage 2026-07-25T14:37Z tick (second mint).
# MINT FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT -> task_board.backlog[]
#
# Usage:
#   jq -f scripts/po-mint-fix-sla-bctc-threshold-not-constant.jq docs/data/orch/orch-state.json \
#     | bash scripts/orch-apply.sh
#
# Idempotent: guarded on id absence.

.task_board.backlog =
  (if ([.task_board.backlog[] | select(.id == "FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT")] | length) > 0
   then .task_board.backlog
   else .task_board.backlog + [{
    id: "FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT",
    type: "FIX",
    status: "BACKLOG",
    priority: "P2",
    size: "S",
    zone: "apps/mcp-server/",
    owner: "developer",
    next_agent: "developer",
    supervised: false,
    created_at: "2026-07-25T14:58:00Z",
    created_by: "po/triage-20260725T1437",
    updated_at: "2026-07-25T14:58:00Z",
    updated_by: "po/triage-20260725T1437",

    title: "sla-monitor's bctc threshold is NOT a policy constant — it rises 60min/hour in lockstep with the measured staleness, holding a fixed 5439-minute margin. The gate can therefore never clear and never escalates, and the 'threshold' value printed in every CRITICAL alert is meaningless.",

    status_note: "MECHANICALLY PROVEN, not inferred. PO extracted every bctc sla-monitor alert from list_unresolved_reports() over a 21-hour window (2026-07-24T17:00Z -> 2026-07-25T14:00Z, 12 samples) and differenced the two numbers in each message:\n  stale=5950 thr=511 | 6010/571 | 6070/631 | 6160/721 | 6250/811 | 6340/901 | 6400/961 | 6550/1111 | 6700/1261 | 6910/1471 | 7090/1651 | 7210/1771\nThe set of (stale - threshold) values across all 12 samples is EXACTLY {5439}. One element. The threshold is not a duration policy — it is a second clock running 5439 minutes behind the first.\n\nISOLATED TO bctc, WHICH IS THE POSITIVE CONTROL THAT MAKES THIS A REAL DEFECT AND NOT A GLOBAL MISREADING: in the same alert stream over the same window, every other metric's threshold is CONSTANT — bond_maturity 10080 (7d) in all samples, signal_quality_audit 2880 (48h) in all, news 30, sbv_fx 30. Only the bctc threshold moves. So this is a bctc-specific threshold computation, not a shared formatter bug and not an artifact of how the message is rendered.\n\nHYPOTHESIS FOR THE ROOT CAUSE, stated as a hypothesis and NOT verified at source (PO did not read the sla-monitor implementation — the next agent must): a constant difference between two quantities that both grow with wall-clock time means BOTH are ages measured from `now` against FIXED timestamps, 5439 minutes apart. That is, the code is almost certainly comparing `now - T_data` against `now - T_other` — an AGE-vs-AGE comparison — where a correct SLA compares an AGE against a DURATION. Whoever picks this up should first confirm or refute that shape before changing anything; if it is refuted, the 5439 constant still has to be explained.\n\nOPERATIONAL COST: the bctc breach re-fires roughly hourly and has done so continuously for at least 21 hours (almost certainly far longer — 3 samples/hour of bond_maturity + signal_quality_audit + bctc dominate the 100-row unresolved-report backlog). Because the margin is fixed, the alert carries zero information about whether the situation is improving or worsening: it will print CRITICAL with a larger pair of numbers forever.",

    relationship_to_adjacent_rows: "NOT a duplicate — PO checked the four adjacent bctc-freshness rows and all of them concern WHICH ROWS ARE MEASURED or WHICH LAYER IS MEASURED, none concerns the threshold being non-constant:\n- FIX-BCTC-SLA-FRESHNESS-EXCLUDE-TERMINAL (backlog) — closest neighbour; excludes url_not_found terminal rows from the metric so genuinely-absent tickers cannot breach forever. That fixes the NUMERATOR (population). This row fixes the COMPARATOR. Both can be true at once and fixing either alone leaves the alert wrong.\n- FIX-BCTC-QUEUE-MAXAGE-GATE (backlog) — drops >30d zero-result tickers from the active SLA queue. Population again.\n- FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT (backlog) — B-05 applies a 24h SLA to the raw PDF-push layer instead of the analysis layer. That is the system-auditor plane, a DIFFERENT emitter from sla-monitor.\n- SPIKE-FRESHNESS-REMEDIATE-TRIAGE (backlog) — designs the breach-triage layer; consumes SLA verdicts, does not compute them.\nSequencing note: if FIX-BCTC-SLA-FRESHNESS-EXCLUDE-TERMINAL lands first the staleness number will drop, but the threshold will still track it at 5439 and the gate will still never clear — so that row does NOT subsume this one.",

    acceptance: "(1) Read the sla-monitor bctc threshold computation at source and state in the closing report what the 5439 constant actually is. Do not change code before that sentence can be written.\n(2) The bctc threshold must be a FIXED duration from config, asserted equal across at least 3 alert emissions separated by >1h — same property the other four metrics already satisfy today. Use bond_maturity/signal_quality_audit/news/sbv_fx as the positive control: whatever mechanism keeps THEIR thresholds constant is the one bctc should be using.\n(3) BIDIRECTIONAL PROOF, not just 'it no longer fires': show the gate CLEARING on fresh data and FIRING on stale data. A threshold that can only ever be breached is the defect being fixed; a threshold that can never be breached is the mirror defect and is not acceptance either.\n(4) Regression test pinning the bctc threshold to its configured constant, so this cannot silently drift back to a computed value.\n(5) State the configured bctc SLA duration explicitly in the row closure. Nobody currently knows what the intended value is — the alerts have been printing a moving number, so the real policy has never been visible.",

    files_hint: "sla-monitor threshold config + the bctc freshness check in apps/mcp-server (locate via the alert string 'CRITICAL breach: bctc stale {N}min (threshold {M}min)'); compare against the bond_maturity / signal_quality_audit / news / sbv_fx threshold definitions in the same module, which are already correct and serve as the in-repo reference implementation.",

    baseline_pass: "cd apps/mcp-server && bun test",

    evidence_source: "PO triage 2026-07-25T14:37Z tick, from list_unresolved_reports() (100 rows, backlog spans 2026-07-22 -> 2026-07-25). Raw sample ids: 3677(5950/511), 3680(6010/571), 3683(6070/631), 3686(6160/721), 3690(6250/811), 3694(6340/901), 3697(6400/961), 3704(6550/1111), 3709(6700/1261), 3721(6910/1471), 3731(7090/1651), 3738(7210/1771). Not derived from a notebook or a prior agent's summary — read off the live report stream this tick."
  }] end)
