# Router 2026-06-16 — dev-team tick: QA verdict on FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS recorded -> head -> idle.
#
# Pipeline-resume (14:26Z tick) spawned QA (agent a4e766f8). QA returned VERDICT: APPROVE-CODE.
# Router RAW-verified the verdict FIRST-HAND (NOT relaying the badge):
#   (a) schema-alerts.ts (router read): no `TEXT UNIQUE`; ALTER loop L61 plain ["fingerprint","TEXT"];
#       partial `CREATE UNIQUE INDEX idx_alerts_fingerprint ON alerts(fingerprint) WHERE fingerprint IS NOT NULL`
#       (L72-76) is OUTSIDE the try/catch loop (index failure surfaces unswallowed). Generic — no per-ticker/date literal.
#   (b) AC-7 test (router read, lines 323-418): genuinely NON-self-confirming — builds a legacy 18-col alerts table
#       with NO fingerprint column (L328-349), asserts column ABSENT pre-migration (L362), calls the REAL
#       initAlertsTables (L365), then asserts column PRESENT + idx_alerts_fingerprint partial unique index PRESENT
#       + INSERT OR IGNORE same-fp -> exactly 1 row + 2 NULL-fp legacy rows survive (total 3) (L370-414). This would
#       have FAILED on the original swallowed-ALTER bug. The `'${fp}'` interpolation is a test-only hardcoded literal
#       (no injection surface) — non-blocking.
#
# QA verdict APPROVE-CODE confirms CODE+TEST quality ONLY. It does NOT clear done_verified — the FINAL gate stays the
# LIVE market-open dedup-drain (>=1 REAL scan at ~02:00 UTC: assert <=1 row per (ticker,kind,fingerprint) per dedup
# window + pending backlog drains). Market closed now; cannot force a scan (no-fake-data /goal). Task STAYS in review[].
#
# Head -> idle: there is NO in-flight pipeline agent work (the task is parked in review awaiting an external live gate
# no agent can force now). Next dev-team cron tick (Step 0b idle -> Step 1 PO triage) picks up the review backlog; the
# market-open monitor is carried in this item's done_verified_withheld + monitor_deadline fields.
#
# GUARD: refuse unless the tid is uniquely in review[]. CONSERVATION: total UNCHANGED (annotation + head only, no move).
# Usage: jq --arg now "$NOW" -f scripts/router-d88-alert-fingerprint-qa-approve-head-idle-20260616.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS" as $tid
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.review[]?|select(.id==$tid)]|length) as $rv
| if $rv != 1 then error("tid not uniquely in review[] — refuse annotate: " + ($rv|tostring)) else . end
| .task_board.review = [ .task_board.review[]
    | if .id==$tid then . + {
        qa_verdict:"APPROVE-CODE",
        reviewed_at:$now,
        reviewed_by:"qa (agent a4e766f8; router RAW-verified first-hand, not relayed)",
        qa_notes:"APPROVE-CODE (code+test quality only). Router RAW first-hand: grep TEXT UNIQUE=0; ALTER loop plain TEXT + partial UNIQUE INDEX outside try/catch; AC-7 fault-path test (L323-418) seeds OLD 18-col no-fingerprint schema, asserts column ABSENT pre then PRESENT post initAlertsTables + partial index + dedup->1row + 2 NULL-fp legacy survive (non-self-confirming, would fail on original bug); tsc 0 err; per-file isolation FIX-ALERT-FINGERPRINT 7 pass / 1307-ta 9 / 1309-bb 10 / 1309c+002+1378 34. done_verified NOT cleared — live market-open dedup-drain gate still open."
      } else . end ]
| .head = {
    status:"idle", updated_at:$now, updated_by:"dev-team",
    active_task_id:null, next_agent:null, rebuild_required:false,
    next_action:"IDLE. FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS parked in review[] with qa_verdict=APPROVE-CODE (router RAW-verified QA first-hand: schema TEXT UNIQUE->plain TEXT + partial UNIQUE INDEX outside try/catch; AC-7 non-self-confirming migration regression L323-418; tsc 0; per-file tests green). done_verified WITHHELD — FINAL gate is the LIVE market-open dedup-drain (>=1 REAL scan ~02:00 UTC: <=1 row per (ticker,kind,fingerprint) per dedup window + pending backlog drains); cannot force (no-fake-data). MONITORED by the dev-team :07 cron at next market open, THEN review->done_verified. Next idle tick -> Step 1 PO triage (review backlog=5; deferred signal_queue + docs/signals PO-bound rows still on disk; ARCH-CRON-SCHEDULER-RELIABILITY architect-owned in_progress). PUSH held (PO out-of-band).",
    note:("ROUTER " + $now + " — dev-team tick CLOSE: QA verdict APPROVE-CODE on FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS recorded after router RAW-verified first-hand (NOT relayed). Code+test quality GREEN; structural live-verify already GREEN (d87, named-volume market.db column+partial index PRESENT, 1283 legacy rows survived, 0 dup). done_verified WITHHELD pending the LIVE market-open dedup-drain (no-fake-data — cannot force a scan). Head -> idle: no in-flight pipeline work; task parked in review awaiting the external live gate. PUSH held (30 commits, PO out-of-band).")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on an annotation + head-only move") else . end
