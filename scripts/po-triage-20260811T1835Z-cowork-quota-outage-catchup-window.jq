# po-triage-20260811T1835Z-cowork-quota-outage-catchup-window.jq
#
# PO triage 2026-08-11T18:35Z — user report "fb post today is miss".
# Root cause: Anthropic WEEKLY USAGE LIMIT exhausted 2026-08-09T13:17Z -> 2026-08-11T12:00Z.
# Scheduling layer was 100% healthy; the execution layer had no quota.
#
# Two board mutations, both conservation-lean (1 mint + 1 amend, no duplicates):
#   (A) MINT FIX-COWORK-CATCHUP-FRESHNESS-WINDOW-EXPIRES-DURING-EXECUTION-OUTAGE
#       — genuinely new defect class, 0 existing rows cover it.
#   (B) AMEND existing FIX-COWORK-GUARANTEED-SLOT-FIRER-NO-FAILURE-ESCALATION
#       (already minted by architect 2026-08-11T16:56Z) — P1->P0 + fold the
#       log-fidelity sub-item + stamp PO's independent live evidence.
#       Deliberately NOT re-minted as a new row.
#
# Apply: jq -f scripts/po-triage-20260811T1835Z-cowork-quota-outage-catchup-window.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

.task_board.backlog += [{
  "id": "FIX-COWORK-CATCHUP-FRESHNESS-WINDOW-EXPIRES-DURING-EXECUTION-OUTAGE",
  "type": "FIX",
  "status": "BACKLOG",
  "priority": "P0",
  "zone": "cross-service/",
  "size": "S",
  "owner": "developer",
  "next_agent": "developer",
  "sprint": "COWORK-GUARANTEED-SLOT-CATCHUP",
  "depends_on": ["TASK-COWORK-CATCHUP-3"],
  "title": "Guaranteed-slot catch-up is structurally unwinnable for any outage longer than the freshness window — window is measured from SCHEDULED fire time, not from when execution capability returned (0/8 recovery, 2026-08-09 -> 2026-08-11 quota outage)",
  "created_at": "2026-08-11T18:35:00Z",
  "created_by": "po/triage-fb-daily-miss-20260811",
  "related": [
    "TASK-COWORK-CATCHUP-3",
    "TASK-COWORK-CATCHUP-2",
    "BA-COWORK-GUARANTEED-SLOT-CATCHUP",
    "FIX-COWORK-GUARANTEED-SLOT-FIRER-NO-FAILURE-ESCALATION"
  ],
  "evidence_verified_by_po": "Live-measured 2026-08-11T18:33Z, not inferred. scripts/agents-flow/cowork-catchup-predicate.js:243-247 computes elapsedMinutes = (nowUnix - scheduledFireUnix)/60 and compares it to _dish_type_catchup_config[dish].catchup_max_lateness_minutes. That clock runs during the outage, so the window burns down while execution is IMPOSSIBLE. Anthropic weekly usage limit was exhausted 2026-08-09T13:17:17Z -> 2026-08-11T12:00:00Z (reset '2pm Europe/Paris', literal CLI stdout captured 12x in docs/agent-memory/sessions/cowork-guaranteed-slot-firer.log:1912,1919,1926,1933,1940,1947,1954,1961,1968,1975,1982,1989,1996,2003). Window-close vs quota-return, all 8 slots due in the outage: chef-morning 08:15Z, chef-eod 11:45Z, fb-daily(08-11) 11:15Z, fb-daily(08-10) 08-10T11:15Z, chef-evening 08-11T01:45Z, tnb-audit 08-11T02:13Z, fb-weekend 08-09T15:13Z, digest-sunday 08-10T13:47Z — every single one closed BEFORE 12:00Z. Recovery rate 0/8. The one slot that did recover (digest-daily, window closes 23:30Z) was never a catch-up case: it was scheduled at 17:30Z, AFTER quota returned, and fired normally. fb-daily's window closed at 11:15Z, 45 minutes before execution became possible again — yet 5 further hours of working quota remained inside the same VN date (rollover 17:00Z) during which the post was still correctly dated and fully recoverable.",
  "note": "NET EFFECT: the COWORK-GUARANTEED-SLOT-CATCHUP epic, as specified, cannot recover any outage that lasts longer than the dish's own freshness window — which is precisely the outage class it was built for (session death, host sleep, quota exhaustion are all multi-hour). It only recovers outages shorter than 2-6h. AC (proposed, architect/BA to ratify): (1) the eligibility clock must be gated on EXECUTION CAPABILITY, not wall-clock alone — track a 'capability_returned_at' (first successful claude invocation after a run of failures; the firer already has the exit-code signal it needs) and start the lateness budget from max(scheduled_fire, capability_returned_at); (2) keep the VN-date rollover rule ABSOLUTE and unchanged — it is correct and must still veto (docs/data/orch/orch-state.json .sprint_goal entry COWORK-GUARANTEED-SLOT-CATCHUP scope_in: 'if the VN day rolled past the slot window, DO NOT retro-post under a new date'), so a recovered dish is only ever published under its own true date; (3) dedup unchanged — published:<slot_id>:<key_part> task_claim marker still arbitrates; (4) regression test: simulate a 48h capability gap and assert a same-VN-date slot IS recovered while a rolled-over one is NOT. MUST land with or after TASK-COWORK-CATCHUP-3 (the consumer sub-flow catchup-check.md, still unbuilt) — until that ships, catchup_raw is computed every tick and consumed by nothing, so fixing this predicate alone changes zero behaviour. Do NOT let two agents edit cowork-catchup-predicate.js in parallel.",
  "po_ruling_no_backfill_20260811": "PO RULING 2026-08-11T18:35Z — the 2026-08-10 and 2026-08-11 fb-daily posts are SKIPPED PERMANENTLY, not backfilled, and this row does NOT authorize a retro-post. Three reasons. (1) VN date rolled to 2026-08-12 at 17:00Z; fb-daily carries publish_date_basis='vn_date', so a post written now would be mis-dated — exactly what the predicate's own rolled_past_vn_date veto exists to prevent, and what this project's standing scope ruling already mandates. (2) chef-eod for 2026-08-11 also never ran (same quota outage, exit_code=1 at 08:51:29Z), and fb-daily depends_on 'chef-eod 08:45 UTC + 30min' — a backfill would be assembled from an absent upstream dish. (3) Quota is the scarce resource that caused this outage and the weekly window only reset 6.5h ago; spending it on a stale 01:35-VN post risks losing the 2026-08-12T09:15Z post too. Recorded as a structured miss per the epic's 'skip + record miss' rule. Next live fire: 2026-08-12T09:15Z (16:15 VN Wed) — needs no schedule change, the launchd firer is loaded (launchctl runs=2463) and the fb-daily row is correct; stale last_fired='2026-08-07T09:23:01Z' does NOT block it (verified: snapToCronBoundary returns nowUnix unchanged for the 'MM H' cron shape, so isSuppressedByBoundaryDedup is always false for fb-daily)."
}]

| (.task_board.ready |= map(
    if .id == "FIX-COWORK-GUARANTEED-SLOT-FIRER-NO-FAILURE-ESCALATION"
    then .priority = "P0"
       | .updated_at = "2026-08-11T18:35:00Z"
       | .updated_by = "po/triage-fb-daily-miss-20260811"
       | .po_evidence_20260811 = "PO 2026-08-11T18:35Z — INDEPENDENT CONFIRMATION + PRIORITY RAISE P1->P0. Reached this same file from the opposite direction (user report 'fb post today is miss', router escalation) and re-derived the identical root cause, which is the strongest possible argument for this row: the outage was invisible to every automated surface and was ultimately detected by a HUMAN NOTICING A MISSING FACEBOOK POST, two days late. Blast radius measured: 8 guaranteed slots x 3 days silent (chef-morning, chef-eod, chef-evening, tnb-audit, digest-daily, digest-sunday, fb-daily x2, fb-weekend), 14 consecutive exit_code=1 invocations, zero BUG alerts, zero signals, zero board rows. launchctl still reported the job healthy throughout (runs=2463, state=running) — the JOB was fine, the WORK was 100% failing, which is the same 'healthy job / truncated work' shape already called out in FIX-GUARANTEED-SLOT-FIRER-FANOUT-TRUNCATION. Raising to P0: this is the detection layer for every other guaranteed-slot defect on the board, and without it each one is found only by a user complaint."
       | .folded_sub_item_log_fidelity_20260811 = "FOLDED (LOW, same file, same function, one-line fix — do it in this pass, do not mint a row): scripts/agents-flow/cowork-guaranteed-slot-firer.sh:165 logs \"invoking (bounded ${FIRE_TIMEOUT_SECONDS}s): $CLAUDE_BIN --dangerously-skip-permissions -p 'slot=$slot_id'\" while line 167 actually executes -p \"$trigger_prompt\". The log therefore reports a prompt that was never sent — it prints 'slot=fb-daily' where the real prompt is 'run docs/agents/fb-market-poster/flow/main.md  slot=fb-daily'. This actively misleads triage: it reads as though the firer had dropped the flow path from the prompt, which is a plausible and entirely wrong root cause. Fix: log the real \"$trigger_prompt\". While in this function, also close the pre-existing FOLDED item 7a on FIX-GUARANTEED-SLOT-FIRER-FANOUT-TRUNCATION (every log line written twice — script tees to LOG_FILE while launchd ALSO redirects stdout to the same StandardOutPath); both are one-line hygiene fixes in the same 30 lines."
    else . end))
