# Board flip: FACTORY-SCHEDULER-alert-confidence-literals REVIEW -> DONE_VERIFIED
# QA Step 5 RAW-verify (docs/protocols/docker-deployment-runbook.md
# § Microservice Code-Change Close Gate) of ops's mcp-server rebuild+SHA-gate
# (commit 97832fb5a, SHA 0d496c314927229835c7e3fa4f7638ed8fac0fbb == HEAD).
#
# Static/deployed-code confirmation (not just SHA label — read actual bytes):
# - `docker exec ... cat /app/src/domain/services/alertThresholds.ts` byte-diffed
#   against the host HEAD copy: IDENTICAL. Bun runs src/*.ts directly (no dist
#   build, package.json "start": "bun run src/index.ts") so this is a direct
#   read of the code that executes, not an inference from the SHA label.
# - Confirmed FOREIGN_FLOW/INSIDER_STREAK/BB_BREAKOUT/RSI_EXTREME base/ceiling
#   constants match the review_note's claimed ranges exactly (0.55/0.95,
#   0.60/0.95, 0.55/0.85, 0.55/0.85).
# - Confirmed deriveConfidenceFromStrength() is a pure clamp+lerp, no I/O.
# - grep-confirmed all 4 job files import deriveConfidenceFromStrength (2 call
#   sites each: alert signal + evidence fragment, or alert only for bb/ta).
# - Resolved a self-raised dead-code concern: cron_job_runs shows
#   taAlertScanJob/bbAlertScanJob individually stopped recording 2026-04-24
#   (superseded by alertScanParallelJob per Task 1309c). Read
#   scheduler/alerts/alertScanParallelJob.ts: it directly imports and calls
#   runTaAlertScan()/runBbAlertScan() (the exact edited functions) via
#   Promise.allSettled — same code path, just relabeled for observability.
#   NOT dead code.
#
# Live DB RAW-verify (real production DB /app/data/market.db, DB_PATH from
# docker-compose.yml, named volume market_data):
# - PRE-deploy baseline confirmed flat: evidence_fragments
#   source_agent='scheduler/foreignFlowAlertJob' last 20 rows all
#   confidence=0.75 exact (up to 2026-06-30); alerts ta_bb_breakout_*/
#   ta_overbought/ta_oversold rows all confidence=0.65/0.7 exact through
#   today 2026-07-08T07:15:01Z (last pre-rebuild cron firing, rebuild landed
#   10:25Z). insiderCheckJob: 0 evidence_fragments rows ever (source_agent
#   LIKE '%insider%' empty) — traced to insider_transactions raw table having
#   COUNT(*)=0 (SSC fetch pipeline yields empty in this environment, matches
#   cron_job_runs rows_written=0 on every single insiderCheckJob run in
#   history, zero error_msg — a pre-existing environmental gap unrelated to
#   this task's diff, not a regression).
# - Cron cadence check: foreignFlowAlert (08:13 UTC wkdy), insiderCheck
#   (01:00 UTC daily), bb/taAlertScan (*/15 2-8 UTC wkdy via
#   alertScanParallelJob) all had their final applicable window for today
#   close BEFORE the 10:25Z rebuild — no natural post-deploy cron fire will
#   occur until tomorrow. Rather than hold ~15-22h, manually triggered the
#   exact exported production functions (runBbAlertScan(), runTaAlertScan(),
#   runForeignFlowAlertJob() with telegramOverrides.sendWork stubbed to
#   suppress a real WORK-channel digest send) directly inside the live
#   container against the live DB/live watchlist — confirmed via source read
#   that bb/ta jobs import no Telegram client at all (header comment "MUST
#   NOT import sendTelegram"), so no real side-channel spam; this is a real
#   run against real data, not a fabricated input (no synthetic price/RSI
#   fed in — all inputs came from the live daily_ohlcv table).
# - RESULT (real, not paraphrased) — 3 new rows landed (others hit the
#   existing per-day alert-id INSERT-OR-IGNORE dedup since some tickers
#   already fired earlier this morning under the OLD flat confidence, which
#   correctly remains un-overwritten):
#     alert-PPC-ta_oversold-2026-07-08          confidence=0.591161548032028
#     alert-REE-ta_bb_breakout_down-2026-07-08  confidence=0.5610703819512394
#     alert-PPC-ta_bb_breakout_down-2026-07-08  confidence=0.5596169461647121
#   All 3 distinct (not a repeated flat constant), all inside [0.55,0.85] per
#   BB/RSI documented range. Hand-recomputed PPC's RSI=25.9 oversold case:
#   strength=(30-25.9)/30=0.13667, confidence=0.55+0.13667*0.30=0.591 — matches
#   the persisted float exactly (residual precision from unrounded RSI).
# - runForeignFlowAlertJob(): 0 HIGH-severity signals today (stubbed WORK
#   digest confirmed, no real Telegram send) — same "quiet" result as this
#   morning's pre-deploy run, so no live evidence_fragment/alert confidence
#   comparison was possible for this specific job today; the new-code path
#   (lines computing flowConfidence) simply never executed because no
#   qualifying HIGH signal existed on real data either before or after
#   deploy — a data-quietness fact, not a code defect.
# - insiderCheckJob: given 0 rows in insider_transactions historically and
#   0 error_msg (silent-empty external fetch, not new to this deploy), did
#   NOT force-invoke fetchInsiderTransactions() live (real external network
#   call to SSC, historically always empty/likely geo-blocked without the
#   VPS-proxy pattern used elsewhere — memory: project_bctc_vps_proxy) —
#   would add real-world request risk for zero expected new signal. The
#   deriveStreakConfidence()/INSIDER_STREAK_CONFIDENCE_* formula is confirmed
#   correct in isolation (18-test scorer suite per review_note + my own direct
#   read of the deployed byte-identical source) but has never executed with
#   real data in this DB's history — a structural/environmental gap, not a
#   regression introduced by this task.
#
# VERDICT: fix is genuinely deployed (byte-verified inside the running
# container), genuinely wired into the live cron schedule for all 4 jobs
# (including resolving my own dead-code suspicion for bb/ta), and — for 3 of
# the 4 jobs (bb, ta, and by formula-review foreignFlow) — produces correct,
# varying, in-range confidence on REAL live market data via a legitimate
# manual trigger of the exact production code path (not a fabricated/mocked
# run). insiderCheckJob's derivation is correct-in-isolation but currently
# unreachable with real data due to a pre-existing empty upstream SSC feed —
# flagged as a non-blocking residual, out of this task's diff scope.
#
# GUARD: refuse unless FACTORY-SCHEDULER-alert-confidence-literals is in
# review[] with status REVIEW, and .head.active_task_id still points at it.
# Usage: jq --arg now "$NOW" --arg note "<qa_review_note text>" \
#          -f scripts/qa-factory-scheduler-alert-confidence-literals-done-verified.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($ARGS.named.now) as $now
| ($ARGS.named.note) as $note
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FACTORY-SCHEDULER-alert-confidence-literals")][0]) as $t
| if $t == null then error("FACTORY-SCHEDULER-alert-confidence-literals not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FACTORY-SCHEDULER-alert-confidence-literals status != REVIEW (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "FACTORY-SCHEDULER-alert-confidence-literals") then
    error("head.active_task_id drifted away from FACTORY-SCHEDULER-alert-confidence-literals (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    qa_review_note: $note,
    updated_at: $now,
    updated_by: "qa"
  }) as $done
| .task_board.review = [$rv[] | select(.id != "FACTORY-SCHEDULER-alert-confidence-literals")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .head.status = "done"
| .head.active_task_id = null
| .head.next_agent = "router"
| .head.next_action = ("FACTORY-SCHEDULER-alert-confidence-literals DONE_VERIFIED (qa Step 5 RAW-verify PASS \($now) — deployed byte-identical to HEAD inside live container; bb/ta jobs confirmed still wired via alertScanParallelJob (not dead code); manually triggered runBbAlertScan/runTaAlertScan/runForeignFlowAlertJob live against real DB (WORK-digest stubbed for foreignFlow, bb/ta have no Telegram import at all) — 3 new real alert rows landed with distinct in-range confidence (0.591161548032028 / 0.5610703819512394 / 0.5596169461647121), replacing the old flat 0.65/0.7 pattern confirmed as pre-deploy baseline; foreignFlow 0 HIGH signals today (quiet, matches pre-deploy); insiderCheckJob formula correct-in-isolation but unreachable with real data — insider_transactions table has 0 rows historically, pre-existing environmental gap not caused by this task, flagged non-blocking.")
| .head.updated_at = $now
| .head.updated_by = "qa"
